// titlebar.rs — title bar bawaan Windows ikut warna tema Zephyr.
//
// Kenapa: title bar native digambar Windows dengan warna sistem (abu #232323),
// sedangkan baris menu Zephyr tepat di bawahnya memakai token `--titlebar-bg`
// (#161b22 di tema gelap). Dua band bertumpuk dengan warna berbeda terbaca
// sebagai UI yang tidak nyatu — jadi caption-nya disamakan dengan tema aktif.
//
// Atribut DWM yang dipakai (Windows 11 build 22000+; di build lebih lama
// panggilannya gagal dan diabaikan, title bar kembali seperti bawaan):
//   20  USE_IMMERSIVE_DARK_MODE  BOOL
//   34  BORDER_COLOR             COLORREF
//   35  CAPTION_COLOR            COLORREF
//   36  TEXT_COLOR               COLORREF
//
// COLORREF = 0x00BBGGRR — byte-nya TERBALIK dari RGB/hex. Salah urut di sini
// tidak menghasilkan error, cuma judul/bingkai berwarna aneh.
//
// FFI mentah tanpa crate `windows`, alasan sama seperti cli.rs: satu fungsi
// dwmapi tidak sepadan dengan waktu kompilasi crate tersebut.

use crate::errors::{ZResult, ZephyrError};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
mod dwm {
    use std::ffi::c_void;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: isize, attr: u32, val: *const c_void, size: u32) -> i32;
    }

    pub const USE_IMMERSIVE_DARK_MODE: u32 = 20;
    pub const BORDER_COLOR: u32 = 34;
    pub const CAPTION_COLOR: u32 = 35;
    pub const TEXT_COLOR: u32 = 36;

    /// Set satu atribut DWM. `false` = ditolak (mis. Windows 10) — pemanggil
    /// boleh mengabaikannya, warna bawaan tetap dipakai.
    pub fn set(hwnd: isize, attr: u32, val: u32) -> bool {
        let v = val;
        unsafe { DwmSetWindowAttribute(hwnd, attr, &v as *const u32 as *const c_void, 4) == 0 }
    }
}

/// "#rrggbb" → COLORREF 0x00BBGGRR. None bila bukan hex 6 digit.
fn colorref(hex: &str) -> Option<u32> {
    let s = hex.trim().trim_start_matches('#');
    if s.len() != 6 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let n = u32::from_str_radix(s, 16).ok()?;
    let (r, g, b) = ((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF);
    Some(r | (g << 8) | (b << 16))
}

/// Warna latar gelap? Dipakai untuk atribut mode gelap DWM (menentukan warna
/// ikon/tombol jendela bawaan Windows).
fn gelap(hex: &str) -> bool {
    let s = hex.trim().trim_start_matches('#');
    let n = u32::from_str_radix(s, 16).unwrap_or(0);
    let (r, g, b) = ((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF);
    let luma = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) / 255.0;
    luma < 0.5
}

/// Samakan title bar + bingkai jendela dengan tema aktif.
///
/// Dipanggil `syncTitlebar()` (themes.ts) setiap tema/aksen berubah — warnanya
/// datang dari token CSS yang sudah dihitung di frontend (`--titlebar-bg`,
/// `--titlebar-fg`, `--border`), jadi Rust tidak menyimpan daftar warna kedua.
#[tauri::command]
pub fn titlebar_theme(app: AppHandle, bg: String, fg: String, border: String) -> ZResult<()> {
    let caption = colorref(&bg)
        .ok_or_else(|| ZephyrError::InvalidInput(format!("warna title bar tidak valid: {bg}")))?;
    let text = colorref(&fg).unwrap_or(caption);
    let edge = colorref(&border).unwrap_or(caption);

    let jendela = app
        .get_webview_window("main")
        .ok_or_else(|| ZephyrError::Internal("window main tidak ada".into()))?;

    #[cfg(windows)]
    {
        let hwnd = jendela.hwnd()?.0 as isize;
        // Mode gelap diset lebih dulu: ia yang menentukan warna ikon judul &
        // tombol caption bawaan, jadi jangan sampai tertinggal satu frame.
        dwm::set(hwnd, dwm::USE_IMMERSIVE_DARK_MODE, gelap(&bg) as u32);
        if !dwm::set(hwnd, dwm::CAPTION_COLOR, caption) {
            tracing::debug!("title bar: DwmSetWindowAttribute(CAPTION_COLOR) ditolak");
        }
        dwm::set(hwnd, dwm::TEXT_COLOR, text);
        dwm::set(hwnd, dwm::BORDER_COLOR, edge);
    }

    // Latar jendela = yang terlihat sebelum WebView2 selesai paint pertama
    // (kalau dibiarkan, jendela tampil putih sekejap saat app dibuka).
    let (r, g, b) = (
        ((caption) & 0xFF) as u8,
        ((caption >> 8) & 0xFF) as u8,
        ((caption >> 16) & 0xFF) as u8,
    );
    let _ = jendela.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
    Ok(())
}
