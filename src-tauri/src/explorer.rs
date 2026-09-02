// explorer.rs — scan folder, watcher, dan search-in-workspace (fase 04).
//
// Aturan ignore (4.1) berlaku SAMA untuk scan_dir maupun search_files
// supaya isi tree dan hasil pencarian konsisten.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// Folder/berkas yang tidak pernah ditampilkan maupun dicari.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".venv",
    "venv",
    "dist",
    "build",
    "target",
    "out",
    ".next",
    ".cache",
    ".turbo",
    ".svelte-kit",
    "__pycache__",
    ".pytest_cache",
];

const MAX_DEPTH: usize = 40;
const MAX_SEARCH_HITS: usize = 500;
/// File di atas ukuran ini tidak dipindai isinya (kemungkinan biner/besar).
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;

fn is_ignored(name: &str, is_dir: bool) -> bool {
    if is_dir {
        return IGNORED_DIRS.iter().any(|d| d.eq_ignore_ascii_case(name));
    }
    // *.lock diabaikan untuk pencarian isi, tapi tetap TAMPIL di tree.
    false
}

fn is_lockfile(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".lock")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// Hanya untuk folder: apakah isinya ada (untuk menampilkan chevron).
    pub has_children: bool,
}

/// Baca SATU level folder (lazy loading — tree besar tetap responsif).
/// Kedalaman dibatasi lewat jumlah komponen relatif terhadap workspace.
#[tauri::command(async)]
pub fn scan_dir(state: State<AppState>, path: String) -> ZResult<Vec<DirNode>> {
    let dir = PathBuf::from(&path);
    state.ensure_readable(&dir)?;
    if !dir.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan folder")));
    }

    // Batas kedalaman relatif workspace (4.1: depth max 40).
    if let Some(ws) = state.workspace_path() {
        let norm = crate::app_state::normalize(&dir);
        if let Ok(rel) = norm.strip_prefix(&ws) {
            if rel.components().count() > MAX_DEPTH {
                return Err(ZephyrError::InvalidInput(format!(
                    "kedalaman folder melebihi {MAX_DEPTH}"
                )));
            }
        }
    }

    scan_entries(&dir)
}

/// Logika baca-direktori murni (tanpa State) supaya bisa diuji unit.
fn scan_entries(dir: &Path) -> ZResult<Vec<DirNode>> {
    let mut out: Vec<DirNode> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // permission ditolak per-entry -> skip
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_ignored(&name, is_dir) {
            continue;
        }

        let p = entry.path();
        let has_children = if is_dir {
            std::fs::read_dir(&p)
                .map(|mut it| it.next().is_some())
                .unwrap_or(false)
        } else {
            false
        };

        out.push(DirNode {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir,
            has_children,
        });
    }

    // Folder dulu, lalu file; masing-masing alfabetis (case-insensitive).
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(out)
}

// ───────────────────────── watcher ─────────────────────────

/// Pantau workspace secara rekursif; kirim `fs-changed` { path, kind }.
/// Event digabung (debounce 250ms) agar operasi npm/git tidak membanjiri UI.
#[tauri::command(async)]
pub fn fs_watch(app: AppHandle, state: State<AppState>, path: String) -> ZResult<()> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan folder")));
    }

    // Hentikan watcher lama (ganti workspace) sebelum memasang yang baru.
    state.stop_watcher();
    let generation = state.next_watch_generation();
    let stop_flag = state.watch_stop_flag();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                let _ = app.emit(
                    "fs-changed",
                    json!({ "path": "", "kind": "error", "message": e.to_string() }),
                );
                return;
            }
        };

        if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
            return;
        }

        let mut pending: Vec<(String, &'static str)> = Vec::new();
        let mut last_flush = Instant::now();

        loop {
            // Generasi berubah = ada watcher baru / workspace ditutup -> stop.
            if stop_flag.load(std::sync::atomic::Ordering::Relaxed) != generation {
                break;
            }

            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Ok(event)) => {
                    let kind = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Remove(_) => "remove",
                        EventKind::Modify(_) => "modify",
                        _ => continue,
                    };
                    for p in event.paths {
                        // Abaikan perubahan di dalam folder yang di-ignore.
                        let skip = p.components().any(|c| {
                            let s = c.as_os_str().to_string_lossy();
                            IGNORED_DIRS.iter().any(|d| d.eq_ignore_ascii_case(&s))
                        });
                        if skip {
                            continue;
                        }
                        pending.push((p.to_string_lossy().to_string(), kind));
                    }
                }
                Ok(Err(_)) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if !pending.is_empty() && last_flush.elapsed() >= Duration::from_millis(250) {
                // Kirim per-parent supaya frontend cukup re-scan node itu saja.
                let mut seen: Vec<String> = Vec::new();
                for (p, kind) in pending.drain(..) {
                    let parent = Path::new(&p)
                        .parent()
                        .map(|x| x.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let key = format!("{parent}|{kind}");
                    if seen.contains(&key) {
                        continue;
                    }
                    seen.push(key);
                    if app
                        .emit(
                            "fs-changed",
                            json!({ "path": p, "dir": parent, "kind": kind }),
                        )
                        .is_err()
                    {
                        return; // app tutup
                    }
                }
                last_flush = Instant::now();
            }
        }
    });

    Ok(())
}

#[tauri::command(async)]
pub fn fs_unwatch(state: State<AppState>) -> ZResult<()> {
    state.stop_watcher();
    Ok(())
}

// ───────────────────────── search ─────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    /// 1-based
    pub line: u32,
    /// 1-based kolom awal match
    pub col: u32,
    pub match_len: u32,
    pub preview: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub files_scanned: u32,
    pub truncated: bool,
}

/// Satu file untuk quick-open palette (Ctrl+P, fase 12).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickFile {
    /// path absolut (dipakai `openPath`)
    pub path: String,
    /// path relatif ke root workspace, separator '/'
    pub rel: String,
    pub name: String,
}

fn build_regex(query: &str, regex: bool, case_sensitive: bool) -> ZResult<regex::Regex> {
    let pattern = if regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| ZephyrError::InvalidInput(format!("regex tidak valid: {e}")))
}

fn collect_files(root: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > MAX_DEPTH || out.len() > 20_000 {
        return;
    }
    let rd = match std::fs::read_dir(root) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_ignored(&name, is_dir) {
            continue;
        }
        let p = entry.path();
        if is_dir {
            collect_files(&p, out, depth + 1);
        } else if !is_lockfile(&name) {
            out.push(p);
        }
    }
}

/// Daftar path file di workspace untuk quick-open (Ctrl+P, fase 12).
///
/// Memakai `collect_files` yang sama dengan search (aturan ignore identik),
/// jadi node_modules/target/.git tidak pernah ikut. Dibatasi 20.000 file oleh
/// collect_files; di sini dipotong lagi ke `limit` (default 5.000) supaya
/// payload ke frontend tetap ringan — palette memfilternya di memori.
#[tauri::command(async)]
pub fn list_workspace_files(
    state: State<AppState>,
    limit: Option<usize>,
) -> ZResult<Vec<QuickFile>> {
    let ws = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;

    let mut files: Vec<PathBuf> = Vec::new();
    collect_files(&ws, &mut files, 0);

    let cap = limit.unwrap_or(5_000).clamp(1, 20_000);
    let truncated = files.len() > cap;
    files.truncate(cap);

    let mut out: Vec<QuickFile> = files
        .iter()
        .map(|p| {
            let rel = p
                .strip_prefix(&ws)
                .unwrap_or(p)
                .to_string_lossy()
                .replace('\\', "/");
            QuickFile {
                path: p.to_string_lossy().to_string(),
                rel,
                name: p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
            }
        })
        .collect();
    // Urut per path relatif supaya daftar stabil antar pemanggilan.
    out.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
    let _ = truncated;
    Ok(out)
}

/// Cari teks di seluruh workspace. `glob` memfilter nama file (mis. `*.ts`).
#[tauri::command(async)]
pub fn search_files(
    state: State<AppState>,
    query: String,
    glob: Option<String>,
    case_sensitive: Option<bool>,
    regex: Option<bool>,
) -> ZResult<SearchResult> {
    if query.trim().is_empty() {
        return Ok(SearchResult {
            hits: vec![],
            files_scanned: 0,
            truncated: false,
        });
    }
    let ws = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;

    let re = build_regex(
        &query,
        regex.unwrap_or(false),
        case_sensitive.unwrap_or(false),
    )?;

    let matcher = match glob.as_deref().filter(|g| !g.trim().is_empty()) {
        Some(g) => Some(
            globset::GlobBuilder::new(g)
                .case_insensitive(true)
                .literal_separator(false)
                .build()
                .map_err(|e| ZephyrError::InvalidInput(format!("glob tidak valid: {e}")))?
                .compile_matcher(),
        ),
        None => None,
    };

    let mut files: Vec<PathBuf> = Vec::new();
    collect_files(&ws, &mut files, 0);

    let mut hits: Vec<SearchHit> = Vec::new();
    let mut scanned: u32 = 0;
    let mut truncated = false;

    'outer: for file in files {
        let name = file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if let Some(m) = &matcher {
            if !m.is_match(&name) {
                continue;
            }
        }
        let meta = match std::fs::metadata(&file) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }

        let bytes = match std::fs::read(&file) {
            Ok(b) => b,
            Err(_) => continue,
        };
        // Lewati file biner: ada byte NUL di 8KB pertama.
        let head = &bytes[..bytes.len().min(8192)];
        if head.contains(&0) {
            continue;
        }
        let text = match String::from_utf8(bytes) {
            Ok(t) => t,
            Err(e) => {
                let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(e.as_bytes());
                cow.into_owned()
            }
        };
        scanned += 1;

        let lines: Vec<&str> = text.lines().collect();
        for (idx, line) in lines.iter().enumerate() {
            for m in re.find_iter(line) {
                if hits.len() >= MAX_SEARCH_HITS {
                    truncated = true;
                    break 'outer;
                }
                // kolom dihitung dalam karakter, bukan byte
                let col = line[..m.start()].chars().count() as u32 + 1;
                hits.push(SearchHit {
                    path: file.to_string_lossy().to_string(),
                    name: name.clone(),
                    line: idx as u32 + 1,
                    col,
                    match_len: m.as_str().chars().count() as u32,
                    preview: line.chars().take(400).collect(),
                    before: idx
                        .checked_sub(1)
                        .and_then(|i| lines.get(i))
                        .map(|s| s.chars().take(200).collect()),
                    after: lines.get(idx + 1).map(|s| s.chars().take(200).collect()),
                });
            }
        }
    }

    Ok(SearchResult {
        hits,
        files_scanned: scanned,
        truncated,
    })
}

/// Ganti semua kemunculan di SATU file (dipakai "Replace in file" dari
/// panel Search). Mengembalikan jumlah penggantian.
#[tauri::command(async)]
pub fn replace_in_file(
    state: State<AppState>,
    path: String,
    query: String,
    replacement: String,
    case_sensitive: Option<bool>,
    regex: Option<bool>,
) -> ZResult<u32> {
    let p = PathBuf::from(&path);
    state.ensure_writable(&p)?;

    let is_regex = regex.unwrap_or(false);
    let re = build_regex(&query, is_regex, case_sensitive.unwrap_or(false))?;

    let read = crate::fs_utils::read_file_detect(&p)?;
    let count = re.find_iter(&read.content).count() as u32;
    if count == 0 {
        return Ok(0);
    }

    // Mode non-regex: `$` di teks pengganti harus literal.
    let replaced = if is_regex {
        re.replace_all(&read.content, replacement.as_str())
            .into_owned()
    } else {
        re.replace_all(&read.content, regex::NoExpand(&replacement))
            .into_owned()
    };

    crate::fs_utils::write_file_encoded(&p, &replaced, &read.detected_encoding, &read.line_ending)?;
    Ok(count)
}

/// Buka file/folder di Windows Explorer (Reveal in Explorer).
#[tauri::command(async)]
pub fn reveal_path(path: String) -> ZResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(ZephyrError::NotFound(path));
    }
    #[cfg(target_os = "windows")]
    {
        let arg = if p.is_dir() {
            p.to_string_lossy().to_string()
        } else {
            format!("/select,{}", p.to_string_lossy())
        };
        std::process::Command::new("explorer")
            .arg(arg)
            .spawn()
            .map_err(|e| ZephyrError::Io(e.to_string()))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err(ZephyrError::Internal("hanya didukung di Windows".into()));
    }
    Ok(())
}

// ───────── hook unit test ─────────

#[cfg(test)]
pub fn is_ignored_for_test(name: &str, is_dir: bool) -> bool {
    is_ignored(name, is_dir)
}

#[cfg(test)]
pub fn build_regex_for_test(q: &str, rx: bool, cs: bool) -> ZResult<regex::Regex> {
    build_regex(q, rx, cs)
}

#[cfg(test)]
pub fn scan_names_for_test(dir: &Path) -> ZResult<Vec<String>> {
    Ok(scan_entries(dir)?.into_iter().map(|n| n.name).collect())
}
