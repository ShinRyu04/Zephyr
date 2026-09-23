use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

const BOM_UTF16LE: [u8; 2] = [0xFF, 0xFE];
const BOM_UTF16BE: [u8; 2] = [0xFE, 0xFF];

pub const BIG_FILE_BYTES: u64 = 4 * 1024 * 1024;

pub fn map_fs_err(e: std::io::Error, path: &str) -> ZephyrError {
    match e.kind() {
        std::io::ErrorKind::NotFound => ZephyrError::NotFound(format!(
            "{path} tidak ada (mungkin sudah dihapus atau dipindah)"
        )),
        std::io::ErrorKind::PermissionDenied => {
            ZephyrError::Permission(format!("{path} tidak boleh diakses"))
        }
        _ => ZephyrError::Io(format!("{path}: {e}")),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub content: String,
    pub detected_encoding: String,
    pub line_ending: String,

    pub read_only: bool,

    pub bytes: u64,

    pub note: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatResult {
    pub size: u64,
    pub is_dir: bool,

    pub mtime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,
}

fn default_encoding() -> String {
    "utf8".to_string()
}

fn detect_line_ending(s: &str) -> &'static str {
    if s.contains("\r\n") {
        "crlf"
    } else {
        "lf"
    }
}

fn decode_bytes(bytes: &[u8], forced: Option<&str>) -> ZResult<(String, String)> {
    if let Some(enc) = forced {
        match enc {
            "ansi" => {
                let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
                return Ok((cow.into_owned(), "ansi".into()));
            }
            "utf8" | "utf8-bom" => {}

            "utf16le" => {
                let body = if bytes.len() >= 2 && bytes[0..2] == BOM_UTF16LE {
                    &bytes[2..]
                } else {
                    bytes
                };
                let (cow, _, _) = encoding_rs::UTF_16LE.decode(body);
                return Ok((cow.into_owned(), "utf16le".into()));
            }
            "utf16be" => {
                let body = if bytes.len() >= 2 && bytes[0..2] == BOM_UTF16BE {
                    &bytes[2..]
                } else {
                    bytes
                };
                let (cow, _, _) = encoding_rs::UTF_16BE.decode(body);
                return Ok((cow.into_owned(), "utf16be".into()));
            }
            other => {
                return Err(ZephyrError::Encoding(format!(
                    "encoding tidak dikenal: {other}"
                )))
            }
        }
    }

    if bytes.len() >= 2 {
        if bytes[0..2] == BOM_UTF16LE {
            let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
            return Ok((cow.into_owned(), "utf16le".into()));
        }
        if bytes[0..2] == BOM_UTF16BE {
            let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
            return Ok((cow.into_owned(), "utf16be".into()));
        }
    }

    let has_bom = bytes.len() >= 3 && bytes[0..3] == BOM;
    let body = if has_bom { &bytes[3..] } else { bytes };

    match std::str::from_utf8(body) {
        Ok(s) => Ok((
            s.to_string(),
            if has_bom {
                "utf8-bom".into()
            } else {
                "utf8".into()
            },
        )),
        Err(_) => {
            let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
            Ok((cow.into_owned(), "ansi".into()))
        }
    }
}

fn encode_string(content: &str, encoding: &str, line_ending: &str) -> ZResult<Vec<u8>> {
    let normalized = content.replace("\r\n", "\n");
    let text = if line_ending == "crlf" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };

    match encoding {
        "utf8" => Ok(text.into_bytes()),
        "utf8-bom" => {
            let mut out = BOM.to_vec();
            out.extend_from_slice(text.as_bytes());
            Ok(out)
        }
        "ansi" => {
            let (cow, _, had_errors) = encoding_rs::WINDOWS_1252.encode(&text);
            if had_errors {
                return Err(ZephyrError::Encoding(
                    "konten memuat karakter yang tidak ada di Windows-1252 (ANSI); \
                     simpan sebagai UTF-8"
                        .into(),
                ));
            }
            Ok(cow.into_owned())
        }

        "utf16le" | "utf16be" => Err(ZephyrError::Encoding(
            "file UTF-16 dibuka read-only — pakai \"Simpan sebagai UTF-8\" untuk mengeditnya"
                .into(),
        )),
        other => Err(ZephyrError::Encoding(format!(
            "encoding tidak dikenal: {other}"
        ))),
    }
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn read_file_detect(path: &Path) -> ZResult<ReadResult> {
    let bytes = std::fs::read(path)?;
    let (raw, detected) = decode_bytes(&bytes, None)?;
    let line_ending = detect_line_ending(&raw).to_string();
    let (read_only, note) = read_only_reason(bytes.len() as u64, &detected);
    Ok(ReadResult {
        content: raw.replace("\r\n", "\n"),
        detected_encoding: detected,
        line_ending,
        read_only,
        bytes: bytes.len() as u64,
        note,
    })
}

fn read_only_reason(len: u64, encoding: &str) -> (bool, String) {
    if encoding == "utf16le" || encoding == "utf16be" {
        return (
            true,
            "file UTF-16 — dibuka baca-saja; simpan sebagai UTF-8 untuk mengedit".to_string(),
        );
    }
    if len > BIG_FILE_BYTES {
        return (
            true,
            format!(
                "file besar ({:.1} MB) — mode baca-saja ringan",
                len as f64 / (1024.0 * 1024.0)
            ),
        );
    }
    (false, String::new())
}

pub fn write_file_encoded(
    path: &Path,
    content: &str,
    encoding: &str,
    line_ending: &str,
) -> ZResult<()> {
    let bytes = encode_string(content, encoding, line_ending)?;

    std::fs::write(crate::paths::long_path(path), bytes)?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_read(
    state: State<AppState>,
    path: String,
    encoding: Option<String>,
) -> ZResult<ReadResult> {
    let p = PathBuf::from(&path);
    state.ensure_readable(&p)?;

    let p = crate::paths::long_path(&p);

    let meta = std::fs::metadata(&p).map_err(|e| map_fs_err(e, &path))?;
    if meta.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} adalah folder")));
    }

    if meta.len() > 32 * 1024 * 1024 {
        return Err(ZephyrError::InvalidInput(
            "file lebih besar dari 32MB — belum didukung".into(),
        ));
    }

    let bytes = std::fs::read(&p).map_err(|e| map_fs_err(e, &path))?;
    let (raw, detected) = decode_bytes(&bytes, encoding.as_deref())?;
    let line_ending = detect_line_ending(&raw).to_string();
    let (read_only, note) = read_only_reason(meta.len(), &detected);

    state.allow_exact(&p);
    state.bump("fs_read");

    Ok(ReadResult {
        content: raw.replace("\r\n", "\n"),
        detected_encoding: detected,
        line_ending,
        read_only,
        bytes: meta.len(),
        note,
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn fs_write(
    state: State<AppState>,
    path: String,
    content: String,
    encoding: Option<String>,
    line_ending: Option<String>,
    was_existing: Option<bool>,
    allow_missing: Option<bool>,
) -> ZResult<()> {
    let p = PathBuf::from(&path);
    state.ensure_writable(&p)?;

    let existing = std::fs::read(&p).ok();

    if existing.is_none() && !allow_missing.unwrap_or(false) && was_existing.unwrap_or(false) {
        return Err(ZephyrError::NotFound(format!(
            "{path} sudah tidak ada di disk"
        )));
    }
    let (fallback_enc, fallback_le) = match &existing {
        Some(bytes) => {
            let (raw, enc) = decode_bytes(bytes, None)?;
            (enc, detect_line_ending(&raw).to_string())
        }
        None => ("utf8".to_string(), "crlf".to_string()),
    };

    let enc = encoding.unwrap_or(fallback_enc);
    let le = line_ending.unwrap_or(fallback_le);
    let bytes = encode_string(&content, &enc, &le)?;
    let bytes_len = bytes.len();

    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&p, bytes)?;
    state.allow_exact(&p);
    state.bump("fs_write");
    tracing::debug!(path = %state.label(&p), bytes = bytes_len, enc = %enc, "fs_write");
    Ok(())
}

#[tauri::command(async)]
pub fn fs_exists(path: String) -> ZResult<bool> {
    Ok(crate::paths::long_path(Path::new(&path)).exists())
}

#[tauri::command(async)]
pub fn fs_stat(state: State<AppState>, path: String) -> ZResult<StatResult> {
    let p = PathBuf::from(&path);
    state.ensure_readable(&p)?;
    let meta = std::fs::metadata(crate::paths::long_path(&p)).map_err(|e| map_fs_err(e, &path))?;
    Ok(StatResult {
        size: meta.len(),
        is_dir: meta.is_dir(),
        mtime: mtime_ms(&meta),
    })
}

#[tauri::command(async)]
pub fn fs_create_file(
    state: State<AppState>,
    path: String,
    content: Option<String>,
) -> ZResult<()> {
    let p = PathBuf::from(&path);
    state.ensure_writable(&p)?;
    let lp = crate::paths::long_path(&p);
    if lp.exists() {
        return Err(ZephyrError::InvalidInput(format!("{path} sudah ada")));
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(crate::paths::long_path(parent))?;
        }
    }

    let bytes = encode_string(&content.unwrap_or_default(), "utf8", "crlf")?;
    std::fs::write(&lp, bytes)?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_create_dir(state: State<AppState>, path: String) -> ZResult<()> {
    let p = PathBuf::from(&path);
    state.ensure_writable(&p)?;

    std::fs::create_dir_all(crate::paths::long_path(&p))?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_delete(state: State<AppState>, paths: Vec<String>, recursive: bool) -> ZResult<()> {
    if paths.is_empty() {
        return Err(ZephyrError::InvalidInput("daftar path kosong".into()));
    }
    for path in &paths {
        let p = PathBuf::from(path);
        state.ensure_writable(&p)?;
        let meta = match std::fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            if recursive {
                std::fs::remove_dir_all(&p)?;
            } else {
                std::fs::remove_dir(&p)?;
            }
        } else {
            std::fs::remove_file(&p)?;
        }
        tracing::info!(path = %state.label(&p), "fs_delete");
    }
    state.bump("fs_delete");
    Ok(())
}

#[tauri::command(async)]
pub fn fs_rename(state: State<AppState>, from: String, to: String) -> ZResult<()> {
    let a = PathBuf::from(&from);
    let b = PathBuf::from(&to);
    state.ensure_writable(&a)?;
    state.ensure_writable(&b)?;

    let la = crate::paths::long_path(&a);
    let lb = crate::paths::long_path(&b);
    if !la.exists() {
        return Err(ZephyrError::NotFound(from));
    }
    if lb.exists() {
        return Err(ZephyrError::InvalidInput(format!("{to} sudah ada")));
    }
    std::fs::rename(&la, &lb)?;
    tracing::info!(from = %state.label(&a), to = %state.label(&b), "fs_rename");
    Ok(())
}

#[tauri::command(async)]
pub fn session_load(state: State<AppState>) -> ZResult<Vec<SessionTab>> {
    let p = state.file("session.json");
    if !p.exists() {
        return Ok(vec![]);
    }
    let raw = std::fs::read_to_string(&p)?;
    let tabs: Vec<SessionTab> = serde_json::from_str(&raw).unwrap_or_default();

    Ok(tabs
        .into_iter()
        .filter(|t| Path::new(&t.path).exists())
        .collect())
}

#[tauri::command(async)]
pub fn session_save(state: State<AppState>, tabs: Vec<SessionTab>) -> ZResult<()> {
    let p = state.file("session.json");
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, serde_json::to_vec_pretty(&tabs)?)?;
    Ok(())
}

#[cfg(test)]
pub fn decode_for_test(bytes: &[u8], forced: Option<&str>) -> ZResult<(String, String)> {
    decode_bytes(bytes, forced)
}

#[cfg(test)]
pub fn encode_for_test(content: &str, encoding: &str, line_ending: &str) -> ZResult<Vec<u8>> {
    encode_string(content, encoding, line_ending)
}

#[cfg(test)]
pub fn detect_le_for_test(s: &str) -> &'static str {
    detect_line_ending(s)
}
