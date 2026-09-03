// search.rs — Global Search & Replace lewat ripgrep (fase 25).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. ripgrep dijalankan sebagai PROSES dengan `--json`, bukan lewat crate
//    `grep-*`. Alasannya: parsing `--json` adalah kontrak stabil yang
//    didokumentasikan (Begin/Match/End/Summary), sementara memakai crate berarti
//    menyalin ulang logika .gitignore, binary detection, encoding, dan glob
//    yang sudah benar di rg. Brief 25 juga memang meminta binary rg.
//
// 2. rg TIDAK dibundel. Urutan pencarian: `settings.search.rgPath` → `rg` di
//    PATH → `%APPDATA%\zephyr\bin\rg.exe`. Kalau tidak ada, fitur ini
//    memberi pesan jelas + jalur fallback ke `search_files` bawaan fase 04
//    (scan Rust sendiri), bukan diam-diam gagal.
//
// 3. Hasil di-STREAM lewat event `search-hit` per file, bukan dikumpulkan lalu
//    dikirim sekali. Pencarian di repo besar bisa memakan detik; UI harus mulai
//    menampilkan hasil sebelum selesai. Batas `max_results` menghentikan proses
//    lebih awal (rg dibunuh) supaya query seperti "e" tidak membanjiri UI.
//
// 4. Replace TIDAK memakai `rg --replace`: rg hanya MENCETAK hasil pengganti,
//    ia tidak pernah menulis file. Penulisan dilakukan di sini, per file, dan
//    setiap file di-snapshot ke Local History (fase 26) LEBIH DULU supaya
//    Replace All bisa dibatalkan.
//
// KEAMANAN
// - Pencarian & replace hanya di dalam workspace (ensure_writable untuk tulis).
// - Argumen ke rg selalu lewat `Command::arg` (bukan string shell), jadi query
//   seperti `"; rm -rf /"` tidak pernah diinterpretasi shell.

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

/// Batas hasil bawaan bila frontend tidak menyebut.
const MAX_HASIL_DEFAULT: usize = 5_000;

/// Batas panjang preview satu baris (baris minified bisa megabyte).
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
    /// glob "files to include", dipisah koma
    #[serde(default)]
    pub include: String,
    /// glob "files to exclude", dipisah koma
    #[serde(default)]
    pub exclude: String,
    /// false = tambahkan --no-ignore (abaikan .gitignore)
    #[serde(default = "benar")]
    pub respect_gitignore: bool,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default)]
    pub max_results: Option<usize>,
    /// folder awal; default = workspace
    #[serde(default)]
    pub root: Option<String>,
}

fn benar() -> bool {
    true
}

/// Satu match dari rg.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RgHit {
    pub path: String,
    pub line: u32,
    /// 1-based, dihitung dalam KARAKTER (bukan byte)
    pub col: u32,
    pub match_len: u32,
    pub preview: String,
    /// semua rentang match di baris ini (untuk highlight ganda)
    pub ranges: Vec<(u32, u32)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary {
    pub hits: usize,
    pub files: usize,
    pub truncated: bool,
    pub elapsed_ms: u64,
    /// jalur rg yang benar-benar dipakai
    pub rg: String,
    pub error: String,
}

#[derive(Default)]
pub struct SearchRuntime {
    /// flag batal untuk pencarian yang sedang jalan
    batal: Mutex<Option<Arc<AtomicBool>>>,
}

/// Cari binary rg: setting → PATH → %APPDATA%\zephyr\bin.
pub fn cari_rg(state: &AppState, dari_setting: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = dari_setting.filter(|s| !s.trim().is_empty()) {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    // PATH: `rg --version` adalah cara paling jujur memastikan ia bisa dipanggil.
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

/// Susun argumen rg dari opsi UI.
///
/// Dipisah jadi fungsi sendiri supaya bisa diuji tanpa menjalankan proses —
/// urutan & bentuk flag inilah yang paling mudah salah.
pub fn bangun_args(o: &SearchOpts, root: &Path) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--json".into(),
        // Baris sangat panjang (bundle minified) dipangkas rg sendiri supaya
        // tidak mengirim megabyte per hit.
        "--max-columns".into(),
        "1000".into(),
        "--max-columns-preview".into(),
    ];

    if o.case_sensitive {
        a.push("--case-sensitive".into());
    } else {
        // smart-case bukan pilihan di sini: toggle "Match Case" di UI harus
        // deterministik, jadi mati = benar-benar case-insensitive.
        a.push("--ignore-case".into());
    }
    if o.whole_word {
        a.push("--word-regexp".into());
    }
    if !o.regex {
        // Teks literal: --fixed-strings membuat karakter seperti ( . * aman.
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
        // '!' di depan = exclude (konvensi rg).
        a.push(if g.starts_with('!') {
            g.to_string()
        } else {
            format!("!{g}")
        });
    }

    // `--` memisahkan pola dari path: tanpa itu query yang mulai dengan '-'
    // (mis. "-foo") dianggap flag.
    a.push("--".into());
    a.push(o.query.clone());
    a.push(root.to_string_lossy().to_string());
    a
}

/// Ubah offset BYTE dari ripgrep menjadi kolom yang dipakai editor.
///
/// PENTING: satuannya UTF-16 code unit, bukan `char`.
///
/// rg memberi offset byte; CodeMirror (dan seluruh DOM/JS) mengalamatkan posisi
/// dalam UTF-16 code unit. Untuk karakter BMP (é, ü, 中) `chars().count()` dan
/// jumlah unit UTF-16 sama, jadi bug ini tidak terlihat. Untuk karakter di luar
/// BMP — emoji, beberapa aksara kuno — satu `char` = DUA unit UTF-16, sehingga
/// menghitung `char` membuat kursor mendarat terlalu ke kiri.
///
/// Terbukti dari harness: baris `🙂🙂 TARGETUTF8` (byte-offset 9) menghasilkan
/// kolom 4 dengan `chars().count()`, padahal editor melihatnya di kolom 6.
fn byte_ke_kolom(baris: &str, byte_off: usize) -> u32 {
    let mut batas = byte_off.min(baris.len());
    // Offset bisa jatuh di tengah karakter multi-byte kalau rg dan file tidak
    // sepakat; geser ke batas karakter terdekat supaya slicing tidak panik.
    while batas > 0 && !baris.is_char_boundary(batas) {
        batas -= 1;
    }
    baris[..batas].encode_utf16().count() as u32 + 1
}

/// Ambil teks dari objek Data ripgrep: { "text": "..." } atau { "bytes": ".." }.
fn data_teks(v: &Value) -> String {
    if let Some(t) = v.get("text").and_then(|x| x.as_str()) {
        return t.to_string();
    }
    if let Some(b64) = v.get("bytes").and_then(|x| x.as_str()) {
        // File non-UTF8: rg mengirim base64. Tidak didekode di sini — kembalikan
        // penanda, bukan sampah biner ke UI.
        return format!("<{} byte non-UTF8>", b64.len());
    }
    String::new()
}

/// Jalankan pencarian; hasil di-emit lewat event `search-hit`.
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
            // Root di luar workspace harus lolos whitelist dialog.
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

    // Batalkan pencarian sebelumnya: user yang mengetik cepat memicu banyak
    // query, dan yang lama tidak ada gunanya lagi.
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
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

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

    // Batas tercapai / dibatalkan → hentikan rg, jangan biarkan ia menyisir
    // seluruh disk sia-sia.
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

/// Batalkan pencarian yang sedang jalan.
#[tauri::command]
pub fn search_cancel(rt: State<SearchRuntime>) -> bool {
    let mut slot = rt.batal.lock().unwrap();
    if let Some(b) = slot.take() {
        b.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

/// Info rg untuk UI (versi + jalur), supaya Settings bisa menampilkannya.
#[tauri::command]
pub fn search_rg_info(state: State<AppState>, rg_path: Option<String>) -> ZResult<Value> {
    let Some(rg) = cari_rg(&state, rg_path.as_deref()) else {
        return Ok(serde_json::json!({ "ada": false, "path": "", "versi": "" }));
    };
    let mut cmd = Command::new(&rg);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
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

/// Hasil replace satu file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceHasil {
    pub path: String,
    pub jumlah: usize,
    /// snapshot Local History sebelum tulis ('' = tidak ada)
    pub snapshot: String,
    pub error: String,
}

/// Replace di banyak file sekaligus.
///
/// `regex` + `$1` capture group didukung karena penggantinya dijalankan lewat
/// `regex::Regex::replace_all`, bukan penggantian teks biasa.
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
    // Pola yang sama dengan yang dipakai rg, tapi dikompilasi di sini karena
    // penulisan file dilakukan Rust (rg --replace hanya MENCETAK).
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
            // File biner tidak boleh disentuh replace.
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

            // Snapshot Local History SEBELUM tulis — itu yang membuat
            // Replace All bisa dibatalkan (brief 25 V4).
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
        // Pola harus SETELAH `--`, kalau tidak query "-foo" dianggap flag.
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
        // exclude tanpa '!' harus diberi '!'; yang sudah punya tidak dobel.
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
        // "héllo" — é dua byte, satu unit UTF-16.
        let baris = "héllo dunia";
        assert_eq!(byte_ke_kolom(baris, 0), 1);
        assert_eq!(byte_ke_kolom(baris, 1), 2);
        assert_eq!(byte_ke_kolom(baris, 3), 3);

        // Emoji di luar BMP: 4 byte, DUA unit UTF-16. Inilah yang membedakan
        // `chars().count()` (salah) dari `encode_utf16().count()` (benar) —
        // editor mengalamatkan posisi dalam unit UTF-16.
        let e = "ab😀cd";
        assert_eq!(byte_ke_kolom(e, 2), 3);
        // offset 6 = setelah emoji: 'a','b' (2) + emoji (2 unit) = kolom 5.
        assert_eq!(byte_ke_kolom(e, 6), 5);

        // Kasus nyata dari harness verify25: '🙂🙂 TARGETUTF8'.
        // 2 emoji × 4 byte + spasi = byte-offset 9 → kolom 6 (2+2+1 unit + 1).
        let u = "🙂🙂 TARGETUTF8 ekor";
        assert_eq!(byte_ke_kolom(u, 9), 6);

        // Offset di luar batas tidak boleh panik.
        assert_eq!(byte_ke_kolom("ab", 99), 3);
        // Offset di TENGAH karakter multi-byte juga tidak boleh panik.
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
