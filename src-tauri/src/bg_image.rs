use crate::errors::{ZResult, ZephyrError};
use base64::Engine;
use serde::Serialize;

const MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize)]
pub struct BgImage {
    pub data_url: String,

    pub bytes: u64,

    pub kind: String,
}

fn tebak_kind(head: &[u8]) -> Option<&'static str> {
    if head.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png");
    }
    if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if head.len() > 12 && head.starts_with(b"RIFF") && &head[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if head.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if head.len() > 12 && &head[4..8] == b"ftyp" && head[8..12].starts_with(b"avif") {
        return Some("image/avif");
    }
    if head.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some("image/x-icon");
    }
    None
}

/// SVG has no magic bytes: it is XML text. Detect it by matching a text prefix
/// after a BOM/whitespace, NOT via the file extension, which can lie
/// and this whole function deliberately inspects content, not the name.
///
/// SVG is loaded through `<img src="data:image/svg+xml;base64,...">`. In that
/// mode the browser does NOT run scripts inside the SVG, so loading a local
/// SVG is safe, and it is still a file the user picked from a dialog.
fn tebak_svg(isi: &[u8]) -> bool {
    let teks = match std::str::from_utf8(&isi[..isi.len().min(512)]) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let t = teks.trim_start_matches('\u{feff}').trim_start();
    let t = t
        .strip_prefix("<?xml")
        .map(|sisa| sisa.split_once("?>").map(|(_, s)| s).unwrap_or(sisa))
        .unwrap_or(t)
        .trim_start();
    t.starts_with("<svg") || (t.starts_with("<!--") && t.contains("<svg"))
}

#[tauri::command]
pub fn bg_image_read(path: String) -> ZResult<BgImage> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err(ZephyrError::InvalidInput(format!("bukan file: {path}")));
    }
    let meta = std::fs::metadata(p)
        .map_err(|e| ZephyrError::InvalidInput(format!("tidak bisa membaca {path}: {e}")))?;
    let bytes_len = meta.len();
    if bytes_len > MAX_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "gambar terlalu besar ({} MB, maksimal {} MB)",
            bytes_len / 1024 / 1024,
            MAX_BYTES / 1024 / 1024
        )));
    }
    let isi = std::fs::read(p)
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal membaca {path}: {e}")))?;
    let kind = match tebak_kind(&isi) {
        Some(k) => k,
        None if tebak_svg(&isi) => "image/svg+xml",
        None => {
            return Err(ZephyrError::InvalidInput(
                "format gambar tidak dikenali (png/jpg/gif/webp/bmp/avif/ico/svg)".into(),
            ))
        }
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&isi);
    Ok(BgImage {
        data_url: format!("data:{kind};base64,{b64}"),
        bytes: bytes_len,
        kind: kind.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deteksi_format_biner() {
        assert_eq!(
            tebak_kind(&[0x89, b'P', b'N', b'G', 0, 0]),
            Some("image/png")
        );
        assert_eq!(tebak_kind(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(tebak_kind(b"GIF89a..."), Some("image/gif"));
        assert_eq!(tebak_kind(b"RIFF____WEBPVP8 "), Some("image/webp"));
        assert_eq!(tebak_kind(b"BM______"), Some("image/bmp"));
        assert_eq!(tebak_kind(b"____ftypavif____"), Some("image/avif"));
        assert_eq!(tebak_kind(&[0x00, 0x00, 0x01, 0x00]), Some("image/x-icon"));
        assert_eq!(tebak_kind(b"tidak dikenal"), None);
    }

    #[test]
    fn deteksi_svg_bentuk_wajar() {
        assert!(tebak_svg(
            br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#
        ));
        assert!(tebak_svg(
            br#"<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>"#
        ));
        assert!(tebak_svg("\u{feff}\n  <svg/>".as_bytes()));
        assert!(tebak_svg(b"<!-- komentar --><svg/>"));
    }

    #[test]
    fn svg_menolak_teks_biasa() {
        assert!(!tebak_svg(b"ini file teks biasa"));
        assert!(!tebak_svg(b"<html><body>halo</body></html>"));
        assert!(!tebak_svg(&[0xFF, 0xFE, 0x00, 0x01]));
    }
}
