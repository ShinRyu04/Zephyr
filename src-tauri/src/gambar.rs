// gambar.rs — baca gambar untuk pratinjau (T3.4).
//
// KENAPA di Rust, bukan frontend: frontend tidak punya akses filesystem
// langsung (batas keamanan Zephyr), dan membaca file besar di JS lalu
// mengubahnya ke base64 memakan dua kali memori.
//
// UKURAN: dimensi dibaca dari HEADER file (PNG/JPG/GIF/BMP/WebP), bukan dari
// dekoder penuh. Cara ini instan bahkan untuk gambar 50 MB, dan tidak butuh
// pustaka image di Rust.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Batas ukuran file yang boleh dipratinjau. Gambar lebih besar dari ini
/// hampir pasti bukan aset aplikasi, dan base64-nya akan menghabiskan memori
/// WebView.
const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GambarData {
    /// isi file sebagai base64
    pub base64: String,
    pub lebar: u32,
    pub tinggi: u32,
    pub bytes: u64,
}

/// Baca dimensi PNG dari header IHDR (byte 16..24).
fn dim_png(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 24 || &b[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes([b[16], b[17], b[18], b[19]]);
    let h = u32::from_be_bytes([b[20], b[21], b[22], b[23]]);
    Some((w, h))
}

/// Baca dimensi GIF (little-endian di byte 6..10).
fn dim_gif(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 10 || &b[0..3] != b"GIF" {
        return None;
    }
    let w = u16::from_le_bytes([b[6], b[7]]) as u32;
    let h = u16::from_le_bytes([b[8], b[9]]) as u32;
    Some((w, h))
}

/// Baca dimensi BMP (little-endian di byte 18..26, tinggi bisa negatif).
fn dim_bmp(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 26 || &b[0..2] != b"BM" {
        return None;
    }
    let w = i32::from_le_bytes([b[18], b[19], b[20], b[21]]);
    let h = i32::from_le_bytes([b[22], b[23], b[24], b[25]]);
    Some((w.unsigned_abs(), h.unsigned_abs()))
}

/// Baca dimensi WebP (tiga varian: VP8, VP8L, VP8X).
fn dim_webp(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 30 || &b[0..4] != b"RIFF" || &b[8..12] != b"WEBP" {
        return None;
    }
    match &b[12..16] {
        b"VP8 " => {
            // Lossy: dimensi di byte 26..30 (14 bit masing-masing).
            if b.len() < 30 {
                return None;
            }
            let w = u16::from_le_bytes([b[26], b[27]]) & 0x3fff;
            let h = u16::from_le_bytes([b[28], b[29]]) & 0x3fff;
            Some((w as u32, h as u32))
        }
        b"VP8L" => {
            // Lossless: 14 bit lebar, 14 bit tinggi, dipaketkan.
            if b.len() < 25 {
                return None;
            }
            let bit = u32::from_le_bytes([b[21], b[22], b[23], b[24]]);
            let w = (bit & 0x3fff) + 1;
            let h = ((bit >> 14) & 0x3fff) + 1;
            Some((w, h))
        }
        b"VP8X" => {
            // Extended: 24 bit lebar-1 dan tinggi-1.
            if b.len() < 30 {
                return None;
            }
            let w = u32::from_le_bytes([b[24], b[25], b[26], 0]) + 1;
            let h = u32::from_le_bytes([b[27], b[28], b[29], 0]) + 1;
            Some((w, h))
        }
        _ => None,
    }
}

/// Baca dimensi JPEG (scan marker SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..15).
fn dim_jpeg(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 4 || b[0] != 0xFF || b[1] != 0xD8 {
        return None;
    }
    let mut i = 2usize;
    while i + 9 < b.len() {
        if b[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = b[i + 1];
        // Marker tanpa panjang (padding, RST, SOI/EOI).
        if marker == 0xFF || (0xD0..=0xD9).contains(&marker) || marker == 0x01 {
            i += 2;
            continue;
        }
        let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
        // SOF marker membawa dimensi.
        let is_sof = matches!(marker,
            0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF);
        if is_sof {
            let h = u16::from_be_bytes([b[i + 5], b[i + 6]]) as u32;
            let w = u16::from_be_bytes([b[i + 7], b[i + 8]]) as u32;
            return Some((w, h));
        }
        if len < 2 {
            return None;
        }
        i += 2 + len;
    }
    None
}

/// Baca dimensi dari header. Mengembalikan (0,0) kalau format tidak dikenali —
/// pratinjau tetap ditampilkan, hanya tanpa info dimensi.
fn dimensi(b: &[u8]) -> (u32, u32) {
    dim_png(b)
        .or_else(|| dim_jpeg(b))
        .or_else(|| dim_gif(b))
        .or_else(|| dim_bmp(b))
        .or_else(|| dim_webp(b))
        .unwrap_or((0, 0))
}

/// Baca file gambar untuk pratinjau.
#[tauri::command]
pub fn baca_gambar(path: String) -> ZResult<GambarData> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(ZephyrError::NotFound(format!("file tidak ada: {path}")));
    }
    let meta = std::fs::metadata(p)
        .map_err(|e| ZephyrError::Io(format!("tidak bisa membaca info file: {e}")))?;
    if meta.len() > MAX_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "gambar terlalu besar ({} MB, maks {} MB)",
            meta.len() / 1048576,
            MAX_BYTES / 1048576
        )));
    }

    let bytes =
        std::fs::read(p).map_err(|e| ZephyrError::Io(format!("gagal membaca file: {e}")))?;
    let (lebar, tinggi) = dimensi(&bytes);

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(GambarData {
        base64,
        lebar,
        tinggi,
        bytes: meta.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dimensi_png() {
        // PNG 1x1 transparan (header + IHDR asli).
        let png: Vec<u8> = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        ];
        assert_eq!(dim_png(&png), Some((1, 1)));
        // Lebar 100 (0x64), tinggi 50 (0x32).
        let mut p2 = png.clone();
        p2[16] = 0;
        p2[17] = 0;
        p2[18] = 0;
        p2[19] = 100;
        p2[20] = 0;
        p2[21] = 0;
        p2[22] = 0;
        p2[23] = 50;
        assert_eq!(dim_png(&p2), Some((100, 50)));
    }

    #[test]
    fn dimensi_gif() {
        let gif: Vec<u8> = vec![b'G', b'I', b'F', b'8', b'9', b'a', 0x40, 0x01, 0xF0, 0x00];
        assert_eq!(dim_gif(&gif), Some((320, 240)));
    }

    #[test]
    fn dimensi_bmp_tinggi_negatif() {
        let mut b = vec![0u8; 30];
        b[0] = b'B';
        b[1] = b'M';
        b[18..22].copy_from_slice(&200i32.to_le_bytes());
        // Tinggi negatif = gambar top-down; tetap harus jadi 100.
        b[22..26].copy_from_slice(&(-100i32).to_le_bytes());
        assert_eq!(dim_bmp(&b), Some((200, 100)));
    }

    #[test]
    fn dimensi_jpeg_sof0() {
        let mut b: Vec<u8> = vec![0xFF, 0xD8];
        // APP0 dengan panjang 16 (dilewati).
        b.extend_from_slice(&[0xFF, 0xE0, 0x00, 0x10]);
        b.extend_from_slice(&[0u8; 14]);
        // SOF0: panjang 17, presisi 8, tinggi 480, lebar 640.
        b.extend_from_slice(&[0xFF, 0xC0, 0x00, 0x11, 0x08]);
        b.extend_from_slice(&480u16.to_be_bytes());
        b.extend_from_slice(&640u16.to_be_bytes());
        b.extend_from_slice(&[0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(dim_jpeg(&b), Some((640, 480)));
    }

    #[test]
    fn dimensi_webp_lossy() {
        let mut b = vec![0u8; 32];
        b[0..4].copy_from_slice(b"RIFF");
        b[8..12].copy_from_slice(b"WEBP");
        b[12..16].copy_from_slice(b"VP8 ");
        b[26..28].copy_from_slice(&640u16.to_le_bytes());
        b[28..30].copy_from_slice(&480u16.to_le_bytes());
        assert_eq!(dim_webp(&b), Some((640, 480)));
    }

    #[test]
    fn format_tidak_dikenal_aman() {
        assert_eq!(dimensi(b"bukan gambar sama sekali"), (0, 0));
        assert_eq!(dimensi(&[]), (0, 0));
    }

    #[test]
    fn file_tidak_ada_error() {
        let r = baca_gambar("D:/tidak-ada-xyz.png".into());
        assert!(matches!(r, Err(ZephyrError::NotFound(_))));
    }

    /// Uji nyata: baca file gambar yang benar-benar ada di repo (logo).
    #[test]
    fn baca_gambar_nyata() {
        let kandidat = [
            "D:/Zephyr/src-tauri/icons/icon.png",
            "D:/Zephyr/src-tauri/icons/32x32.png",
        ];
        let mut diuji = false;
        for k in kandidat {
            if !Path::new(k).is_file() {
                continue;
            }
            let g = baca_gambar(k.into()).unwrap();
            assert!(!g.base64.is_empty(), "base64 kosong");
            assert!(
                g.lebar > 0 && g.tinggi > 0,
                "dimensi nol: {}x{}",
                g.lebar,
                g.tinggi
            );
            // base64 harus bisa didekode kembali ke panjang asli.
            use base64::Engine;
            let kembali = base64::engine::general_purpose::STANDARD
                .decode(&g.base64)
                .unwrap();
            assert_eq!(kembali.len() as u64, g.bytes);
            diuji = true;
            break;
        }
        // Kalau ikon tidak ada di mesin ini, lewati (bukan kegagalan).
        let _ = diuji;
    }
}
