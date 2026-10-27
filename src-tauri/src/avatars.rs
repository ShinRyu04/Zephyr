use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use tauri::State;

/*
 * Uploaded agent avatars.
 *
 * WHY A FOLDER AND NOT A FIELD IN settings.json: an avatar is an image the
 * reader picked, typically 20-200 KB. Stored as a data URL inside settings it
 * would bloat a file that is read and merged on every settings write, and a
 * single corrupt image would take the whole settings file with it. A file per
 * agent keeps settings small and the failure local.
 *
 * WHY THE FILE NAME AND NOT A PATH: `settings.agentCustom[].avatar` stores the
 * bare file name, so the record keeps working if the data directory moves
 * (portable build, a different user profile, a settings export). The folder is
 * always `%APPDATA%\zephyr\avatars`.
 *
 * WHAT IS NOT TRUSTED: the extension and the bytes come from the frontend, so
 * the magic number is checked here. An HTML file renamed to `.png` must not be
 * written into a folder the webview is allowed to read - that is a stored-XSS
 * shape, and it is cheap to refuse.
 */

const MAKS_BYTE: usize = 512 * 1024;

fn folder_avatar(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("avatars")
}

/// Strip everything that could escape the folder or name a device.
///
/// The stored value is a FILE NAME (`uji-avatar.png`), so a dot and the three
/// known extensions are part of the accepted shape. Anything else - separators,
/// `..`, a drive letter - is dropped before it can reach the filesystem.
fn nama_aman(id: &str) -> String {
    let dasar = id
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(id)
        .trim_start_matches(['.', ' '])
        .to_string();
    let ext = ["png", "jpg", "webp"]
        .into_iter()
        .find(|e| dasar.to_ascii_lowercase().ends_with(&format!(".{e}")));
    let inti = match ext {
        Some(e) => &dasar[..dasar.len() - e.len() - 1],
        None => dasar.as_str(),
    };
    let bersih: String = inti
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(48)
        .collect();
    if bersih.is_empty() {
        "agent".to_string()
    } else {
        bersih
    }
}

/// `png` | `jpg` | `webp` from the first bytes, or None.
fn jenis_gambar(b: &[u8]) -> Option<&'static str> {
    if b.len() >= 8 && b[..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return Some("png");
    }
    if b.len() >= 3 && b[..3] == [0xFF, 0xD8, 0xFF] {
        return Some("jpg");
    }
    if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        return Some("webp");
    }
    None
}

fn hapus_semua_varian(folder: &std::path::Path, nama: &str) {
    for ext in ["png", "jpg", "webp"] {
        let p = folder.join(format!("{nama}.{ext}"));
        if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
}

/**
 * `avatar_save` - write an uploaded image and return the file name to store.
 *
 * `data` is the payload only (no `data:image/...;base64,` prefix); the frontend
 * already downscaled it, so anything over the limit is a bug or an attack and
 * is refused rather than truncated.
 */
#[tauri::command(async)]
pub fn avatar_save(
    state: State<'_, AppState>,
    id: String,
    data: Vec<u8>,
) -> ZResult<String> {
    if data.is_empty() {
        return Err(ZephyrError::InvalidInput("empty image".into()));
    }
    if data.len() > MAKS_BYTE {
        return Err(ZephyrError::InvalidInput(format!(
            "avatar is {} KB, the limit is {} KB",
            data.len() / 1024,
            MAKS_BYTE / 1024
        )));
    }
    let ext = jenis_gambar(&data).ok_or_else(|| {
        ZephyrError::InvalidInput("avatar must be a PNG, JPEG or WebP image".into())
    })?;

    let folder = folder_avatar(&state);
    std::fs::create_dir_all(&folder)
        .map_err(|e| ZephyrError::Io(format!("creating the avatars folder failed: {e}")))?;

    let nama = nama_aman(&id);
    /* Replace, never accumulate: an agent has one avatar, and leaving the old
       extension behind would make the next read pick the stale one. */
    hapus_semua_varian(&folder, &nama);
    let berkas = format!("{nama}.{ext}");
    std::fs::write(folder.join(&berkas), &data)
        .map_err(|e| ZephyrError::Io(format!("writing the avatar failed: {e}")))?;
    state.bump("avatar_save");
    Ok(berkas)
}

/** `avatar_delete` - remove an agent's avatar and its leftover variants. */
#[tauri::command(async)]
pub fn avatar_delete(state: State<'_, AppState>, id: String) -> ZResult<bool> {
    let folder = folder_avatar(&state);
    let nama = nama_aman(&id);
    let sebelum = ["png", "jpg", "webp"]
        .iter()
        .filter(|ext| folder.join(format!("{nama}.{ext}")).exists())
        .count();
    hapus_semua_varian(&folder, &nama);
    Ok(sebelum > 0)
}

/**
 * `avatar_url` - absolute path of a stored avatar, or "" when it is gone.
 *
 * Returning the PATH (not the bytes) is deliberate: the webview converts it
 * with `convertFileSrc`, so the image is served by the asset protocol and the
 * browser caches it like any other image. Shipping bytes through IPC on every
 * render would re-encode the same picture for every row in the picker.
 */
#[tauri::command(async)]
pub fn avatar_url(state: State<'_, AppState>, name: String) -> String {
    let folder = folder_avatar(&state);
    let nama = nama_aman(&name);
    for ext in ["png", "jpg", "webp"] {
        let p = folder.join(format!("{nama}.{ext}"));
        if p.exists() {
            return p.to_string_lossy().replace('\\', "/");
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menerima_tiga_magic_number_yang_didukung() {
        assert_eq!(jenis_gambar(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Some("png"));
        assert_eq!(jenis_gambar(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0, 0, 0, 0]);
        webp.extend_from_slice(b"WEBP");
        assert_eq!(jenis_gambar(&webp), Some("webp"));
    }

    #[test]
    fn menolak_berkas_yang_bukan_gambar() {
        assert_eq!(jenis_gambar(b"<html><script>alert(1)</script>"), None);
        assert_eq!(jenis_gambar(b""), None);
        assert_eq!(jenis_gambar(b"%PDF-1.7"), None);
    }

    #[test]
    fn nama_aman_tidak_bisa_keluar_folder() {
        assert_eq!(nama_aman("../../evil"), "evil");
        assert_eq!(nama_aman("C:\\Windows\\x"), "x");
        assert_eq!(nama_aman(""), "agent");
        assert_eq!(nama_aman("a-123_ok"), "a-123_ok");
        /* The stored value is a FILE NAME, extension included. */
        assert_eq!(nama_aman("uji-avatar.png"), "uji-avatar");
        assert_eq!(nama_aman("agent-mvqiy8xo.jpg"), "agent-mvqiy8xo");
        assert_eq!(nama_aman("../../evil.png"), "evil");
        assert_eq!(nama_aman(".hidden"), "hidden");
    }
}
