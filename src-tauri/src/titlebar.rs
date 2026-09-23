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

    pub fn set(hwnd: isize, attr: u32, val: u32) -> bool {
        let v = val;
        unsafe { DwmSetWindowAttribute(hwnd, attr, &v as *const u32 as *const c_void, 4) == 0 }
    }
}

fn colorref(hex: &str) -> Option<u32> {
    let s = hex.trim().trim_start_matches('#');
    if s.len() != 6 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let n = u32::from_str_radix(s, 16).ok()?;
    let (r, g, b) = ((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF);
    Some(r | (g << 8) | (b << 16))
}

fn gelap(hex: &str) -> bool {
    let s = hex.trim().trim_start_matches('#');
    let n = u32::from_str_radix(s, 16).unwrap_or(0);
    let (r, g, b) = ((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF);
    let luma = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) / 255.0;
    luma < 0.5
}

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

        dwm::set(hwnd, dwm::USE_IMMERSIVE_DARK_MODE, gelap(&bg) as u32);
        if !dwm::set(hwnd, dwm::CAPTION_COLOR, caption) {
            tracing::debug!("title bar: DwmSetWindowAttribute(CAPTION_COLOR) ditolak");
        }
        dwm::set(hwnd, dwm::TEXT_COLOR, text);
        dwm::set(hwnd, dwm::BORDER_COLOR, edge);
    }

    let (r, g, b) = (
        ((caption) & 0xFF) as u8,
        ((caption >> 8) & 0xFF) as u8,
        ((caption >> 16) & 0xFF) as u8,
    );
    let _ = jendela.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
    Ok(())
}
