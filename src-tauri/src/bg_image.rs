// bg_image.rs — baca file gambar jadi data URL untuk latar belakang kustom.
//
// Permintaan user: "bisa edit background jga ntah pasang foto, apakah bisa?"
//
// KENAPA lewat Rust, bukan asset protocol / convertFileSrc:
//   - CSS `url(file:///...)` diblokir WebView2; butuh asset protocol + scope
//     izin yang harus dibuka lebar (seluruh folder gambar user).
//   - Data URL tidak butuh izin tambahan, tidak membocorkan path ke CSS, dan
//     hasilnya pasti tampil. Batas ukuran menjaga RAM: gambar 8 MB -> ~11 MB
//     string, cukup untuk wallpaper tapi tidak untuk file raksasa.
use crate::errors::{ZResult, ZephyrError};
use base64::Engine;
use serde::Serialize;

/// Batas ukuran file yang mau dibaca (byte). Di atas ini ditolak dengan pesan
/// yang jelas, bukan diam-diam gagal.
const MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize)]
pub struct BgImage {
    /// data URL siap pakai (`data:image/png;base64,...`)
    pub data_url: String,
    /// ukuran file asli (byte) — dipakai UI untuk menampilkan info
    pub bytes: u64,
    /// ekstensi yang terdeteksi dari magic bytes (bukan dari nama file)
    pub kind: String,
}

/// Tebak tipe gambar dari magic bytes. Nama file TIDAK dipercaya: file `.png`
/// yang isinya JPEG harus tetap tampil benar.
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
    None
}

/// Baca gambar dari disk dan kembalikan sebagai data URL.
///
/// Path divalidasi: harus file yang benar-benar ada dan berukuran wajar.
/// Ekstensi tidak dipakai untuk menentukan tipe (lihat `tebak_kind`).
#[tauri::command]
pub fn bg_image_read(path: String) -> ZResult<BgImage> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err(ZephyrError::InvalidInput(format!(
            "bukan file: {path}"
        )));
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
    let kind = tebak_kind(&isi).ok_or_else(|| {
        ZephyrError::InvalidInput("format gambar tidak dikenali (png/jpg/gif/webp/bmp)".into())
    })?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&isi);
    Ok(BgImage {
        data_url: format!("data:{kind};base64,{b64}"),
        bytes: bytes_len,
        kind: kind.to_string(),
    })
}
