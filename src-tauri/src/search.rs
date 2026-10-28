use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

const MAX_HASIL_DEFAULT: usize = 5_000;

const MAX_PREVIEW: usize = 400;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpts {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,

    #[serde(default)]
    pub include: String,

    #[serde(default)]
    pub exclude: String,

    #[serde(default = "benar")]
    pub respect_gitignore: bool,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default)]
    pub max_results: Option<usize>,

    #[serde(default)]
    pub root: Option<String>,
}

fn benar() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RgHit {
    pub path: String,
    pub line: u32,

    pub col: u32,
    pub match_len: u32,
    pub preview: String,

    pub ranges: Vec<(u32, u32)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary {
    pub hits: usize,
    pub files: usize,
    pub truncated: bool,
    pub elapsed_ms: u64,

    pub rg: String,
    pub error: String,
}

#[derive(Default)]
pub struct SearchRuntime {
    batal: Mutex<Option<Arc<AtomicBool>>>,
}

pub fn cari_rg(state: &AppState, dari_setting: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = dari_setting.filter(|s| !s.trim().is_empty()) {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }

    let nama = if cfg!(windows) { "rg.exe" } else { "rg" };
    if let Ok(path) = std::env::var("PATH") {
        let pemisah = if cfg!(windows) { ';' } else { ':' };
        for dir in path.split(pemisah) {
            if dir.trim().is_empty() {
                continue;
            }
            let k = Path::new(dir).join(nama);
            if k.is_file() {
                return Some(k);
            }
        }
    }
    let lokal = state.data_dir.join("bin").join(nama);
    if lokal.is_file() {
        return Some(lokal);
    }
    None
}

pub fn bangun_args(o: &SearchOpts, root: &Path) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--json".into(),
        "--max-columns".into(),
        "1000".into(),
        "--max-columns-preview".into(),
    ];

    if o.case_sensitive {
        a.push("--case-sensitive".into());
    } else {
        a.push("--ignore-case".into());
    }
    if o.whole_word {
        a.push("--word-regexp".into());
    }
    if !o.regex {
        a.push("--fixed-strings".into());
    }
    if !o.respect_gitignore {
        a.push("--no-ignore".into());
    }
    if o.include_hidden {
        a.push("--hidden".into());
    }

    for g in o
        .include
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        a.push("--glob".into());
        a.push(g.to_string());
    }
    for g in o
        .exclude
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        a.push("--glob".into());

        a.push(if g.starts_with('!') {
            g.to_string()
        } else {
            format!("!{g}")
        });
    }

    a.push("--".into());
    a.push(o.query.clone());
    a.push(root.to_string_lossy().to_string());
    a
}

fn byte_ke_kolom(baris: &str, byte_off: usize) -> u32 {
    let mut batas = byte_off.min(baris.len());

    while batas > 0 && !baris.is_char_boundary(batas) {
        batas -= 1;
    }
    baris[..batas].encode_utf16().count() as u32 + 1
}

fn data_teks(v: &Value) -> String {
    if let Some(t) = v.get("text").and_then(|x| x.as_str()) {
        return t.to_string();
    }
    if let Some(b64) = v.get("bytes").and_then(|x| x.as_str()) {
        return format!("<{} byte non-UTF8>", b64.len());
    }
    String::new()
}

#[tauri::command(async)]
pub fn search_grep(
    app: AppHandle,
    state: State<AppState>,
    rt: State<SearchRuntime>,
    opts: SearchOpts,
    rg_path: Option<String>,
) -> ZResult<SearchSummary> {
    let t0 = std::time::Instant::now();
    if opts.query.trim().is_empty() {
        return Ok(SearchSummary {
            hits: 0,
            files: 0,
            truncated: false,
            elapsed_ms: 0,
            rg: String::new(),
            error: String::new(),
        });
    }

    let root = match opts.root.as_deref().filter(|r| !r.trim().is_empty()) {
        Some(r) => {
            let p = PathBuf::from(r);

            let ws = state.workspace_path();
            let di_dalam = ws
                .as_ref()
                .and_then(|w| std::fs::canonicalize(w).ok())
                .zip(std::fs::canonicalize(&p).ok())
                .map(|(w, f)| f.starts_with(&w))
                .unwrap_or(false);
            if !di_dalam {
                state.ensure_writable(&p)?;
            }
            p
        }
        None => state
            .workspace_path()
            .ok_or_else(|| ZephyrError::InvalidInput("no workspace".into()))?,
    };

    let Some(rg) = cari_rg(&state, rg_path.as_deref()) else {
        /*
         * Tanpa ripgrep, JANGAN menyerah — cari sendiri.
         *
         * Mesin ini tidak punya `rg` di PATH, dan dulu itu membuat tool `grep`
         * mengembalikan error pada SETIAP pemanggilan. Agent lalu membuang
         * belasan langkah memakai PowerShell untuk meniru pencarian (itu sumber
         * berkas `_*.txt`/`_*.ps1` sampah di hasil kerja), dan kerja berat jadi
         * berantakan. Pencarian internal berbasis `walkdir` memberi hasil yang
         * sama tanpa bergantung pada biner luar — persis yang dilakukan editor
         * lain saat ripgrep tidak tersedia.
         */
        return grep_internal(&app, &opts, &root, batal_baru(&rt), t0);
    };

    let batal = Arc::new(AtomicBool::new(false));
    {
        let mut slot = rt.batal.lock().unwrap();
        if let Some(lama) = slot.take() {
            lama.store(true, Ordering::SeqCst);
        }
        *slot = Some(batal.clone());
    }

    let args = bangun_args(&opts, &root);
    let maks = opts.max_results.unwrap_or(MAX_HASIL_DEFAULT);

    let mut cmd = Command::new(&rg);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let mut anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::InvalidInput(format!("failed menjalankan rg: {e}")))?;
    let stdout = anak
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::InvalidInput("the rg stdout could not be read".to_string()))?;

    let mut total = 0usize;
    let mut jml_file = 0usize;
    let mut truncated = false;
    let mut buffer: Vec<RgHit> = Vec::with_capacity(64);
    let mut file_kini = String::new();

    let kirim = |app: &AppHandle, file: &str, hits: &mut Vec<RgHit>| {
        if hits.is_empty() {
            return;
        }
        let _ = app.emit(
            "search-hit",
            serde_json::json!({ "file": file, "hits": hits.clone() }),
        );
        hits.clear();
    };

    let rd = BufReader::new(stdout);
    for baris in rd.lines() {
        if batal.load(Ordering::SeqCst) {
            truncated = true;
            break;
        }
        let Ok(l) = baris else { break };
        let Ok(v) = serde_json::from_str::<Value>(&l) else {
            continue;
        };
        match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "begin" => {
                kirim(&app, &file_kini, &mut buffer);
                file_kini = v
                    .get("data")
                    .and_then(|d| d.get("path"))
                    .map(data_teks)
                    .unwrap_or_default();
                jml_file += 1;
            }
            "match" => {
                let d = v.get("data").cloned().unwrap_or(Value::Null);
                let teks = d.get("lines").map(data_teks).unwrap_or_default();
                let line = d.get("line_number").and_then(|x| x.as_u64()).unwrap_or(1) as u32;
                let sub = d
                    .get("submatches")
                    .and_then(|x| x.as_array())
                    .cloned()
                    .unwrap_or_default();

                let bersih = teks.trim_end_matches(['\n', '\r']);
                let preview: String = if bersih.len() > MAX_PREVIEW {
                    bersih.chars().take(MAX_PREVIEW).collect()
                } else {
                    bersih.to_string()
                };

                let mut ranges: Vec<(u32, u32)> = Vec::new();
                for s in &sub {
                    let a = s.get("start").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                    let b = s.get("end").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                    let ka = byte_ke_kolom(bersih, a);
                    let kb = byte_ke_kolom(bersih, b);
                    ranges.push((ka, kb.saturating_sub(ka)));
                }
                if ranges.is_empty() {
                    ranges.push((1, 0));
                }

                buffer.push(RgHit {
                    path: file_kini.clone(),
                    line,
                    col: ranges[0].0,
                    match_len: ranges[0].1,
                    preview,
                    ranges,
                });
                total += 1;
                if total >= maks {
                    truncated = true;
                    break;
                }
                if buffer.len() >= 40 {
                    kirim(&app, &file_kini, &mut buffer);
                }
            }
            "end" => {
                kirim(&app, &file_kini, &mut buffer);
            }
            _ => {}
        }
    }
    kirim(&app, &file_kini, &mut buffer);

    if truncated {
        let _ = anak.kill();
    }
    let _ = anak.wait();

    {
        let mut slot = rt.batal.lock().unwrap();
        if let Some(cur) = slot.as_ref() {
            if Arc::ptr_eq(cur, &batal) {
                *slot = None;
            }
        }
    }

    Ok(SearchSummary {
        hits: total,
        files: jml_file,
        truncated,
        elapsed_ms: t0.elapsed().as_millis() as u64,
        rg: rg.to_string_lossy().to_string(),
        error: String::new(),
    })
}

#[tauri::command]
pub fn search_cancel(rt: State<SearchRuntime>) -> bool {
    let mut slot = rt.batal.lock().unwrap();
    if let Some(b) = slot.take() {
        b.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

/* Daftarkan satu token pembatalan baru di runtime, membatalkan yang lama. */
fn batal_baru(rt: &SearchRuntime) -> Arc<AtomicBool> {
    let batal = Arc::new(AtomicBool::new(false));
    let mut slot = rt.batal.lock().unwrap();
    if let Some(lama) = slot.take() {
        lama.store(true, Ordering::SeqCst);
    }
    *slot = Some(batal.clone());
    batal
}

/* Direktori yang selalu dilewati pencarian internal — sama seperti default
   ripgrep (menghormati .gitignore) untuk kasus yang paling umum. */
const SKIP_DIR_INTERNAL: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    "out",
    "vendor",
];

const MAX_FILE_INTERNAL: u64 = 2 * 1024 * 1024;
const MAX_DEPTH_INTERNAL: usize = 24;

/*
 * Pencarian isi berkas tanpa ripgrep.
 *
 * Dipakai hanya ketika `rg` tidak ada. Menjelajah `root` dengan `std::fs`,
 * melewati direktori besar yang jelas (node_modules, target, .git, dll),
 * melewati berkas biner dan yang lebih besar dari batas, lalu mencocokkan tiap
 * baris dengan regex yang dibangun dari opsi. Memancarkan `search-hit` yang
 * SAMA dengan jalur ripgrep, sehingga UI dan tool `grep` tidak tahu bedanya.
 */
fn grep_internal(
    app: &AppHandle,
    opts: &SearchOpts,
    root: &Path,
    batal: Arc<AtomicBool>,
    t0: std::time::Instant,
) -> ZResult<SearchSummary> {
    let pattern = if opts.regex {
        opts.query.clone()
    } else {
        regex::escape(&opts.query)
    };
    let re = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!opts.case_sensitive)
        .build()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid regex: {e}")))?;

    let word = opts.whole_word;
    let maks = opts.max_results.unwrap_or(MAX_HASIL_DEFAULT);

    let bangun_glob = |spec: &str| -> Vec<globset::GlobMatcher> {
        spec.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .filter_map(|g| {
                /*
                 * `literal_separator(true)` supaya `*` BERHENTI di `/` dan hanya
                 * `**` yang menyeberang folder - perilaku glob standar yang
                 * dipakai ripgrep dan terax-ai. Dengan `false` (versi lama),
                 * `*` ikut melahap `/`, jadi `*.html` cocok dengan path dalam di
                 * subfolder mana pun dan filter kehilangan arti. Dipasangkan
                 * dengan pencocokan pada path relatif ber-`/` di bawah, pola
                 * seperti `senja/**/*.html` kini bekerja persis seperti di shell.
                 */
                globset::GlobBuilder::new(g)
                    .literal_separator(true)
                    .build()
                    .ok()
                    .map(|x| x.compile_matcher())
            })
            .collect()
    };
    let include = bangun_glob(&opts.include);
    let exclude = bangun_glob(&opts.exclude);

    let mut files: Vec<PathBuf> = Vec::new();
    kumpulkan_internal(root, &mut files, 0, opts.include_hidden, opts.respect_gitignore, Vec::new());

    let mut total = 0usize;
    let mut jml_file = 0usize;
    let mut truncated = false;
    let mut buffer: Vec<RgHit> = Vec::with_capacity(64);

    'outer: for file in files {
        if batal.load(Ordering::SeqCst) {
            truncated = true;
            break;
        }
        let nama = file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        /*
         * Cocokkan glob pada PATH RELATIF yang dinormalkan ke garis-miring maju.
         *
         * Ini akar bug "grep tidak dipercaya" di Windows, dibuktikan dua kali:
         * di run NADA/Senja model menyalahkan grep lalu memboroskan belasan
         * langkah menyisir manual dengan PowerShell. Versi lama mencocokkan glob
         * pada `nama` (nama berkas telanjang) ATAU `file` (path absolut Windows
         * ber-backslash). Pola `senja/**/*.html` tidak pernah cocok dengan
         * keduanya: `index.html` kehilangan segmen folder, dan `globset` memakai
         * `/` sebagai pemisah sehingga `D:\Testing\senja\index.html` tak pernah
         * cocok. IDE lain berarsitektur sama (terax-ai, Apache-2.0) memecahkannya
         * dengan mencocokkan pada path relatif yang dikanonkan ke `/`
         * (`to_canon(rel)`), dan pola itu diadopsi di sini: hitung path relatif
         * dari `root`, ganti `\` jadi `/`, lalu cocokkan glob pada bentuk itu.
         * `nama` dipertahankan sebagai alternatif untuk glob tanpa segmen folder
         * seperti `*.html`.
         */
        let rel = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");

        if !include.is_empty()
            && !include.iter().any(|m| m.is_match(&rel) || m.is_match(&nama))
        {
            continue;
        }
        if exclude.iter().any(|m| m.is_match(&rel) || m.is_match(&nama)) {
            continue;
        }

        let meta = match std::fs::metadata(&file) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_FILE_INTERNAL {
            continue;
        }
        let bytes = match std::fs::read(&file) {
            Ok(b) => b,
            Err(_) => continue,
        };
        /* Lewati berkas biner: NUL di 8 KB pertama adalah heuristik yang sama
           dengan pencarian explorer. */
        if bytes[..bytes.len().min(8192)].contains(&0) {
            continue;
        }
        let text = match String::from_utf8(bytes) {
            Ok(t) => t,
            Err(e) => {
                let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(e.as_bytes());
                cow.into_owned()
            }
        };

        let path_str = file.to_string_lossy().to_string();
        let mut file_punya_hit = false;

        for (idx, baris) in text.lines().enumerate() {
            let bersih = baris.trim_end_matches(['\n', '\r']);
            let mut ranges: Vec<(u32, u32)> = Vec::new();
            for m in re.find_iter(bersih) {
                if word {
                    /* --word-regexp: batas kata di kedua sisi kecocokan. */
                    let kiri_ok = m.start() == 0
                        || !bersih[..m.start()]
                            .chars()
                            .next_back()
                            .map(|c| c.is_alphanumeric() || c == '_')
                            .unwrap_or(false);
                    let kanan_ok = m.end() == bersih.len()
                        || !bersih[m.end()..]
                            .chars()
                            .next()
                            .map(|c| c.is_alphanumeric() || c == '_')
                            .unwrap_or(false);
                    if !(kiri_ok && kanan_ok) {
                        continue;
                    }
                }
                let col = byte_ke_kolom(bersih, m.start());
                let len = byte_ke_kolom(bersih, m.end()).saturating_sub(col);
                ranges.push((col, len));
            }
            if ranges.is_empty() {
                continue;
            }
            file_punya_hit = true;
            let preview: String = if bersih.chars().count() > MAX_PREVIEW {
                bersih.chars().take(MAX_PREVIEW).collect()
            } else {
                bersih.to_string()
            };
            for (col, len) in &ranges {
                buffer.push(RgHit {
                    path: path_str.clone(),
                    line: idx as u32 + 1,
                    col: *col,
                    match_len: *len,
                    preview: preview.clone(),
                    ranges: ranges.clone(),
                });
                total += 1;
                if total >= maks {
                    truncated = true;
                    kirim_internal(app, &path_str, &mut buffer);
                    break 'outer;
                }
            }
            if buffer.len() >= 40 {
                kirim_internal(app, &path_str, &mut buffer);
            }
        }
        if file_punya_hit {
            jml_file += 1;
        }
        kirim_internal(app, &path_str, &mut buffer);
    }

    Ok(SearchSummary {
        hits: total,
        files: jml_file,
        truncated,
        elapsed_ms: t0.elapsed().as_millis() as u64,
        rg: "(internal)".into(),
        error: String::new(),
    })
}

fn kirim_internal(app: &AppHandle, file: &str, hits: &mut Vec<RgHit>) {
    if hits.is_empty() {
        return;
    }
    let _ = app.emit(
        "search-hit",
        serde_json::json!({ "file": file, "hits": hits.clone() }),
    );
    hits.clear();
}

#[derive(Clone)]
struct GitignoreRule {
    base_dir: PathBuf,
    matcher: globset::GlobMatcher,
    is_relative: bool,
    is_dir_only: bool,
    negated: bool,
}

fn muat_gitignore(dir: &Path) -> Vec<GitignoreRule> {
    let mut rules = Vec::new();
    let gi_path = dir.join(".gitignore");
    if let Ok(content) = std::fs::read_to_string(&gi_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            let (negated, pat_str) = if trimmed.starts_with('!') {
                (true, &trimmed[1..])
            } else {
                (false, trimmed)
            };
            let (is_dir_only, pat_clean) = if pat_str.ends_with('/') {
                (true, &pat_str[..pat_str.len() - 1])
            } else {
                (false, pat_str)
            };
            if pat_clean.is_empty() {
                continue;
            }
            let is_relative = pat_clean.contains('/');
            let glob_pattern = if is_relative {
                pat_clean.strip_prefix('/').unwrap_or(pat_clean).to_string()
            } else {
                pat_clean.to_string()
            };
            if let Ok(glob) = globset::GlobBuilder::new(&glob_pattern)
                .literal_separator(is_relative)
                .build()
            {
                rules.push(GitignoreRule {
                    base_dir: dir.to_path_buf(),
                    matcher: glob.compile_matcher(),
                    is_relative,
                    is_dir_only,
                    negated,
                });
            }
        }
    }
    rules
}

fn is_ignored(path: &Path, is_dir: bool, file_name: &str, rules: &[GitignoreRule]) -> bool {
    let mut ignored = false;
    for rule in rules {
        if rule.is_dir_only && !is_dir {
            continue;
        }
        let matched = if rule.is_relative {
            if let Ok(rel) = path.strip_prefix(&rule.base_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                rule.matcher.is_match(&rel_str)
            } else {
                false
            }
        } else {
            rule.matcher.is_match(file_name)
        };
        if matched {
            ignored = !rule.negated;
        }
    }
    ignored
}

fn kumpulkan_internal(
    root: &Path,
    out: &mut Vec<PathBuf>,
    depth: usize,
    hidden: bool,
    respect_gitignore: bool,
    mut active_rules: Vec<GitignoreRule>,
) {
    if depth > MAX_DEPTH_INTERNAL || out.len() > 50_000 {
        return;
    }
    if respect_gitignore {
        let mut local = muat_gitignore(root);
        active_rules.append(&mut local);
    }
    let rd = match std::fs::read_dir(root) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let nama = entry.file_name().to_string_lossy().to_string();
        if !hidden && nama.starts_with('.') {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir && SKIP_DIR_INTERNAL.contains(&nama.as_str()) {
            continue;
        }
        let p = entry.path();
        if respect_gitignore && is_ignored(&p, is_dir, &nama, &active_rules) {
            continue;
        }
        if is_dir {
            kumpulkan_internal(&p, out, depth + 1, hidden, respect_gitignore, active_rules.clone());
        } else {
            out.push(p);
        }
    }
}

#[tauri::command]
pub fn search_rg_info(state: State<AppState>, rg_path: Option<String>) -> ZResult<Value> {
    let Some(rg) = cari_rg(&state, rg_path.as_deref()) else {
        return Ok(serde_json::json!({ "ada": false, "path": "", "versi": "" }));
    };
    let mut cmd = Command::new(&rg);
    cmd.arg("--version");
    let out = cmd.output().ok();
    let versi = out
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(str::to_string))
        .unwrap_or_default();
    Ok(serde_json::json!({
        "ada": true,
        "path": rg.to_string_lossy(),
        "versi": versi,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceHasil {
    pub path: String,
    pub jumlah: usize,

    pub snapshot: String,
    pub error: String,
}

/**
 * Batas jumlah berkas yang boleh disentuh SATU panggilan penggantian lintas
 * berkas (`replace_in_files` -> `search_replace`).
 *
 * Kenapa 200:
 * - Penyisir di sisi TS bisa mengumpulkan sampai 5000 berkas
 *   (`listWorkspaceFiles(5000)`, builtins.ts:2360), jadi satu panggilan yang
 *   salah glob bisa menyentuh hampir seluruh repo tanpa satu pun peringatan.
 * - Angka nyata repo ini: berkas yang mengandung `ZephyrError` = 99, seluruh
 *   berkas `.rs` = 82, seluruh `.md` = 13, seluruh `src-tauri/src` = 76.
 *   Sapuan serentak yang masih masuk akal (mis. ganti nama satu simbol di
 *   seluruh backend) ada di puluhan berkas, bukan ratusan - jadi 200 memberi
 *   ruang ~2x di atas sapuan wajar terbesar.
 * - Sapuan yang memang terlalu luas tetap tertangkap: 286 berkas `.ts/.tsx` di
 *   `src/`, 826 berkas yang menyebut `zephyr`. Yang seperti itu harus
 *   dipersempit dulu (glob/root), bukan dijalankan sekali jalan.
 * - Di bawah batas ini hasilnya TIDAK berubah sama sekali: tidak ada berkas
 *   yang dilewati, disaring, atau dipotong diam-diam.
 */
pub const MAKS_BERKAS_GANTI: usize = 200;

#[tauri::command(async)]
pub fn search_replace(
    state: State<AppState>,
    files: Vec<String>,
    opts: SearchOpts,
    replacement: String,
) -> ZResult<Vec<ReplaceHasil>> {
    ganti_lintas_berkas(&state, files, &opts, &replacement)
}

/**
 * Badan `search_replace`, dipisah dari perintah supaya batas jumlah berkasnya
 * bisa diuji dengan `AppState` nyata tanpa `tauri::State` (yang tidak bisa
 * dibuat di uji unit).
 */
pub fn ganti_lintas_berkas(
    state: &AppState,
    files: Vec<String>,
    opts: &SearchOpts,
    replacement: &str,
) -> ZResult<Vec<ReplaceHasil>> {
    if opts.query.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("query empty".into()));
    }

    /*
     * Diperiksa SEBELUM satu berkas pun dibaca atau ditulis: daftar yang terlalu
     * panjang ditolak bulat, bukan dijalankan sebagian. Pesannya menyebut angka
     * yang diminta dan batasnya, supaya pengguna tahu harus mempersempit apa.
     */
    if files.len() > MAKS_BERKAS_GANTI {
        return Err(ZephyrError::InvalidInput(format!(
            "penggantian lintas berkas menerima paling banyak {MAKS_BERKAS_GANTI} berkas, daftar ini {} berkas - persempit glob/root atau pecah jadi beberapa panggilan",
            files.len()
        )));
    }

    let pola = if opts.regex {
        opts.query.clone()
    } else {
        regex::escape(&opts.query)
    };
    let pola = if opts.whole_word {
        format!(r"\b(?:{pola})\b")
    } else {
        pola
    };
    let re = regex::RegexBuilder::new(&pola)
        .case_insensitive(!opts.case_sensitive)
        .build()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid regex: {e}")))?;

    let mut out = Vec::with_capacity(files.len());
    for f in files {
        let p = PathBuf::from(&f);
        let hasil = (|| -> ZResult<ReplaceHasil> {
            state.ensure_writable(&p)?;
            let isi = std::fs::read(&p)?;

            if crate::history::tampak_biner(&isi) {
                return Ok(ReplaceHasil {
                    path: f.clone(),
                    jumlah: 0,
                    snapshot: String::new(),
                    error: "file biner dilewati".into(),
                });
            }
            /*
             * Membaca lewat `read_file_detect`, BUKAN `from_utf8_lossy`.
             *
             * Versi sebelumnya membaca dengan lossy dan menulis dengan
             * `baru.as_bytes()`. Dua-duanya merusak berkas pengguna secara
             * PERMANEN:
             *
             * - Berkas Windows-1252/ANSI: byte yang bukan UTF-8 yang sah
             *   diganti U+FFFD, dan hasilnya ditulis sebagai UTF-8. Setiap
             *   karakter aksen, tanda kutip tipografi, dan simbol mata uang di
             *   seluruh berkas rusak - bukan hanya di bagian yang diganti.
             * - Berkas UTF-8 dengan BOM: BOM-nya hilang.
             *
             * Kerusakannya tidak bisa dikembalikan byte-per-byte, karena
             * informasi encodingnya sudah terbuang saat dibaca. Dan ini terjadi
             * pada "Replace All" yang jangkauannya bisa satu workspace penuh.
             *
             * `read_file_detect` mencatat encoding dan akhir baris aslinya,
             * lalu `write_file_encoded` menulis kembali dengan keduanya utuh -
             * persis pola yang sudah dipakai `replace_in_file` di explorer.rs.
             */
            let read = crate::fs_utils::read_file_detect(&p)?;
            let teks = read.content.clone();
            let jml = re.find_iter(&teks).count();
            if jml == 0 {
                return Ok(ReplaceHasil {
                    path: f.clone(),
                    jumlah: 0,
                    snapshot: String::new(),
                    error: String::new(),
                });
            }
            let baru = re.replace_all(&teks, replacement).to_string();

            let snap =
                crate::history::snapshot_internal(state, &p, "before-replace").unwrap_or_default();

            /*
             * Ditulis kembali dengan encoding dan akhir baris ASLINYA.
             *
             * Menulis `baru.as_bytes()` berarti selalu UTF-8 dengan LF: berkas
             * ANSI berubah encoding, berkas CRLF kehilangan \r, dan BOM hilang.
             * Ketiganya perubahan yang tidak diminta pengguna dan muncul di
             * diff git sebagai "seluruh berkas berubah".
             */
            crate::fs_utils::write_file_encoded(
                &p,
                &baru,
                &read.detected_encoding,
                &read.line_ending,
            )?;
            Ok(ReplaceHasil {
                path: f.clone(),
                jumlah: jml,
                snapshot: snap,
                error: String::new(),
            })
        })();
        out.push(hasil.unwrap_or_else(|e| ReplaceHasil {
            path: f.clone(),
            jumlah: 0,
            snapshot: String::new(),
            error: e.to_string(),
        }));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(q: &str) -> SearchOpts {
        SearchOpts {
            query: q.into(),
            case_sensitive: false,
            whole_word: false,
            regex: false,
            include: String::new(),
            exclude: String::new(),
            respect_gitignore: true,
            include_hidden: false,
            max_results: None,
            root: None,
        }
    }

    #[test]
    fn args_default_literal_dan_case_insensitive() {
        let a = bangun_args(&opts("halo"), Path::new("D:/proj"));
        assert!(a.contains(&"--json".to_string()));
        assert!(a.contains(&"--ignore-case".to_string()));
        assert!(a.contains(&"--fixed-strings".to_string()));

        let i = a.iter().position(|x| x == "--").expect("ada --");
        assert_eq!(a[i + 1], "halo");
        assert_eq!(a[i + 2], "D:/proj");
    }

    #[test]
    fn args_regex_tidak_memakai_fixed_strings() {
        let mut o = opts(r"\bfoo\d+");
        o.regex = true;
        o.case_sensitive = true;
        o.whole_word = true;
        let a = bangun_args(&o, Path::new("."));
        assert!(!a.contains(&"--fixed-strings".to_string()));
        assert!(a.contains(&"--case-sensitive".to_string()));
        assert!(a.contains(&"--word-regexp".to_string()));
        assert!(!a.contains(&"--ignore-case".to_string()));
    }

    #[test]
    fn args_glob_include_dan_exclude() {
        let mut o = opts("x");
        o.include = "*.ts, *.tsx".into();
        o.exclude = "node_modules/**, !*.min.js".into();
        let a = bangun_args(&o, Path::new("."));
        let glob: Vec<&String> = a
            .iter()
            .enumerate()
            .filter(|(i, _)| i > &0 && a[i - 1] == "--glob")
            .map(|(_, v)| v)
            .collect();
        assert!(glob.iter().any(|g| *g == "*.ts"));
        assert!(glob.iter().any(|g| *g == "*.tsx"));

        assert!(glob.iter().any(|g| *g == "!node_modules/**"));
        assert!(glob.iter().any(|g| *g == "!*.min.js"));
        assert!(!glob.iter().any(|g| *g == "!!*.min.js"));
    }

    #[test]
    fn args_gitignore_dan_hidden() {
        let mut o = opts("x");
        assert!(!bangun_args(&o, Path::new(".")).contains(&"--no-ignore".to_string()));
        o.respect_gitignore = false;
        o.include_hidden = true;
        let a = bangun_args(&o, Path::new("."));
        assert!(a.contains(&"--no-ignore".to_string()));
        assert!(a.contains(&"--hidden".to_string()));
    }

    #[test]
    fn kolom_dihitung_dalam_utf16_bukan_char() {
        let baris = "héllo dunia";
        assert_eq!(byte_ke_kolom(baris, 0), 1);
        assert_eq!(byte_ke_kolom(baris, 1), 2);
        assert_eq!(byte_ke_kolom(baris, 3), 3);

        let e = "ab😀cd";
        assert_eq!(byte_ke_kolom(e, 2), 3);

        assert_eq!(byte_ke_kolom(e, 6), 5);

        let u = "🙂🙂 TARGETUTF8 ekor";
        assert_eq!(byte_ke_kolom(u, 9), 6);

        assert_eq!(byte_ke_kolom("ab", 99), 3);

        assert_eq!(byte_ke_kolom("é", 1), 1);
    }

    #[test]
    fn data_teks_menangani_text_dan_bytes() {
        let t: Value = serde_json::from_str(r#"{"text":"src/a.ts"}"#).unwrap();
        assert_eq!(data_teks(&t), "src/a.ts");
        let b: Value = serde_json::from_str(r#"{"bytes":"AAAA"}"#).unwrap();
        assert!(data_teks(&b).contains("non-UTF8"));
        assert_eq!(data_teks(&Value::Null), "");
    }

    /// Membangun matcher glob persis seperti `grep_internal`, lalu
    /// mencocokkannya pada path relatif yang dinormalkan ke `/`. Ini mengunci
    /// perbaikan bug "grep tidak dipercaya" di Windows: pola berfolder harus
    /// cocok dengan path relatif ber-`/`, bukan dengan path absolut
    /// ber-backslash atau nama berkas telanjang.
    fn glob_cocok(spec: &str, root: &str, abs: &str) -> bool {
        let matcher: Vec<globset::GlobMatcher> = spec
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .filter_map(|g| {
                globset::GlobBuilder::new(g)
                    .literal_separator(true)
                    .build()
                    .ok()
                    .map(|x| x.compile_matcher())
            })
            .collect();
        let file = Path::new(abs);
        let nama = file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let rel = file
            .strip_prefix(Path::new(root))
            .unwrap_or(file)
            .to_string_lossy()
            .replace('\\', "/");
        matcher.iter().any(|m| m.is_match(&rel) || m.is_match(&nama))
    }

    #[test]
    fn glob_folder_cocok_path_windows() {
        // Bentuk paling umum yang ditulis model: `folder/**/*.ext`.
        // Harus cocok dengan berkas langsung di folder dasar MAUPUN subfolder,
        // walau path aslinya ber-backslash Windows.
        assert!(glob_cocok(
            "senja/**/*.html",
            r"D:\Testing",
            r"D:\Testing\senja\index.html"
        ));
        assert!(glob_cocok(
            "senja/**/*.html",
            r"D:\Testing",
            r"D:\Testing\senja\sub\x.html"
        ));
        // Jangan cocok dengan ekstensi lain.
        assert!(!glob_cocok(
            "senja/**/*.html",
            r"D:\Testing",
            r"D:\Testing\senja\css\style.css"
        ));
        // Jangan bocor ke folder lain.
        assert!(!glob_cocok(
            "senja/**/*.html",
            r"D:\Testing",
            r"D:\Testing\nada\index.html"
        ));
    }

    #[test]
    fn glob_nama_telanjang_tetap_cocok() {
        // Glob tanpa segmen folder dicocokkan pada nama berkas, di kedalaman
        // mana pun - tetap berguna untuk `*.ts` dsb.
        assert!(glob_cocok(
            "*.css",
            r"D:\Testing",
            r"D:\Testing\senja\css\style.css"
        ));
    }

    #[test]
    fn glob_bintang_tunggal_tidak_menyeberang_folder() {
        // `literal_separator(true)`: `*` berhenti di `/`. `senja/*.html` hanya
        // cocok berkas LANGSUNG di `senja`, bukan di subfolder.
        assert!(glob_cocok(
            "senja/*.html",
            r"D:\Testing",
            r"D:\Testing\senja\index.html"
        ));
        assert!(!glob_cocok(
            "senja/*.html",
            r"D:\Testing",
            r"D:\Testing\senja\sub\x.html"
        ));
    }

    /*
     * ---- Batas jumlah berkas penggantian lintas berkas ----
     *
     * Uji di bawah menjalankan `ganti_lintas_berkas` yang SESUNGGUHNYA (badan
     * `search_replace`) dengan `AppState` nyata dan berkas nyata di folder
     * sementara: yang dibuktikan adalah perilaku di disk, bukan salinan logika.
     */

    fn kerja_ganti(nama: &str) -> (AppState, PathBuf) {
        let akar = std::env::temp_dir().join(format!(
            "zephyr-batas-ganti-{nama}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&akar);
        let ws = akar.join("ws");
        let data = akar.join("data");
        std::fs::create_dir_all(&ws).expect("buat workspace");
        std::fs::create_dir_all(&data).expect("buat data");
        let mut st = AppState::new();
        st.data_dir = data;
        st.set_workspace(crate::paths::canonical_or_parent(&ws))
            .expect("set workspace");
        (st, ws)
    }

    fn buat_berkas(ws: &Path, n: usize) -> Vec<String> {
        let mut daftar = Vec::with_capacity(n);
        for i in 0..n {
            let p = ws.join(format!("b{i:04}.txt"));
            std::fs::write(&p, "halo dunia\n").expect("tulis berkas uji");
            daftar.push(p.to_string_lossy().replace('\\', "/"));
        }
        daftar
    }

    fn opsi_ganti(q: &str) -> SearchOpts {
        opts(q)
    }

    #[test]
    fn ganti_ditolak_saat_daftar_melebihi_batas() {
        let (st, ws) = kerja_ganti("lebih");
        let daftar = buat_berkas(&ws, MAKS_BERKAS_GANTI + 1);

        let e = ganti_lintas_berkas(&st, daftar.clone(), &opsi_ganti("halo"), "hai")
            .expect_err("daftar di atas batas harus ditolak");
        assert_eq!(e.code(), "InvalidInput");
        let pesan = e.to_string();
        assert!(pesan.contains(&MAKS_BERKAS_GANTI.to_string()), "{pesan}");
        assert!(pesan.contains(&(MAKS_BERKAS_GANTI + 1).to_string()), "{pesan}");

        // Tidak satu berkas pun boleh berubah saat penolakan.
        for f in &daftar {
            let isi = std::fs::read_to_string(f).expect("baca berkas");
            assert_eq!(isi, "halo dunia\n", "berkas {f} tidak boleh berubah");
        }
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }

    #[test]
    fn ganti_tepat_di_batas_tetap_mengganti_seperti_biasa() {
        let (st, ws) = kerja_ganti("tepat");
        let semua = buat_berkas(&ws, MAKS_BERKAS_GANTI);
        assert_eq!(semua.len(), MAKS_BERKAS_GANTI);

        let hasil = ganti_lintas_berkas(&st, semua.clone(), &opsi_ganti("halo"), "hai")
            .expect("tepat di batas harus jalan");
        assert_eq!(hasil.len(), MAKS_BERKAS_GANTI);
        assert!(
            hasil.iter().all(|h| h.jumlah == 1 && h.error.is_empty()),
            "semua berkas harus tergantikan: {:?}",
            hasil.iter().find(|h| h.error != "").map(|h| &h.error)
        );

        for f in &semua {
            let isi = std::fs::read_to_string(f).expect("baca berkas");
            assert_eq!(isi, "hai dunia\n", "berkas {f} harus sudah diganti");
        }
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }

    #[test]
    fn ganti_di_bawah_batas_tidak_berubah_hasilnya() {
        let (st, ws) = kerja_ganti("bawah");
        let daftar = buat_berkas(&ws, 3);

        let hasil = ganti_lintas_berkas(&st, daftar.clone(), &opsi_ganti("halo"), "hai")
            .expect("di bawah batas harus jalan");
        assert_eq!(hasil.len(), 3);

        // Berkas yang tidak punya kecocokan tetap dilaporkan dengan jumlah 0.
        let kosong = ws.join("tanpa-cocok.txt");
        std::fs::write(&kosong, "tidak ada kata itu\n").unwrap();
        let mut lagi = daftar.clone();
        lagi.push(kosong.to_string_lossy().replace('\\', "/"));
        let hasil2 = ganti_lintas_berkas(&st, lagi, &opsi_ganti("halo"), "hai")
            .expect("daftar kecil harus jalan");
        assert_eq!(hasil2.len(), 4);
        assert_eq!(hasil2[3].jumlah, 0);
        assert!(hasil2[3].error.is_empty());
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }
}
