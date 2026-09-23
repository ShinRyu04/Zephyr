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
            .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?,
    };

    let Some(rg) = cari_rg(&state, rg_path.as_deref()) else {
        return Ok(SearchSummary {
            hits: 0,
            files: 0,
            truncated: false,
            elapsed_ms: t0.elapsed().as_millis() as u64,
            rg: String::new(),
            error: "ripgrep (rg) tidak ditemukan di PATH maupun %APPDATA%\\zephyr\\bin".into(),
        });
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
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal menjalankan rg: {e}")))?;
    let stdout = anak
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::InvalidInput("stdout rg tidak bisa dibaca".to_string()))?;

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

#[tauri::command(async)]
pub fn search_replace(
    state: State<AppState>,
    files: Vec<String>,
    opts: SearchOpts,
    replacement: String,
) -> ZResult<Vec<ReplaceHasil>> {
    if opts.query.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("query kosong".into()));
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
        .map_err(|e| ZephyrError::InvalidInput(format!("regex tidak valid: {e}")))?;

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
            let teks = String::from_utf8_lossy(&isi).to_string();
            let jml = re.find_iter(&teks).count();
            if jml == 0 {
                return Ok(ReplaceHasil {
                    path: f.clone(),
                    jumlah: 0,
                    snapshot: String::new(),
                    error: String::new(),
                });
            }
            let baru = re.replace_all(&teks, replacement.as_str()).to_string();

            let snap =
                crate::history::snapshot_internal(&state, &p, "before-replace").unwrap_or_default();

            std::fs::write(&p, baru.as_bytes())?;
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
}
