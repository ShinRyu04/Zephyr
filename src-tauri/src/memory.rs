use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

pub const MEMORY_LIMIT: usize = 2200;
pub const USER_LIMIT: usize = 1375;

const PEMISAH: &str = "\n\n";

#[derive(Debug, Clone, Serialize)]
pub struct MemoryState {
    pub memory: String,
    pub user: String,
    pub memory_limit: usize,
    pub user_limit: usize,
    pub memory_chars: usize,
    pub user_chars: usize,
}

fn file_memory(state: &AppState) -> PathBuf {
    state.data_dir.join("memory.md")
}

fn file_user(state: &AppState) -> PathBuf {
    state.data_dir.join("user.md")
}

fn bagian_valid(bagian: &str) -> ZResult<()> {
    match bagian {
        "memory" | "user" => Ok(()),
        other => Err(ZephyrError::InvalidInput(format!(
            "bagian tidak dikenal: '{other}' (pakai 'memory' atau 'user')"
        ))),
    }
}

fn path_bagian(state: &AppState, bagian: &str) -> ZResult<PathBuf> {
    bagian_valid(bagian)?;
    Ok(if bagian == "memory" {
        file_memory(state)
    } else {
        file_user(state)
    })
}

fn limit_bagian(bagian: &str) -> usize {
    if bagian == "memory" {
        MEMORY_LIMIT
    } else {
        USER_LIMIT
    }
}

pub fn baca(state: &AppState, bagian: &str) -> ZResult<String> {
    let p = path_bagian(state, bagian)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(s.trim().to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn entri(teks: &str) -> Vec<String> {
    teks.split(PEMISAH)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn tulis_mentah(state: &AppState, bagian: &str, teks: &str) -> ZResult<()> {
    let p = path_bagian(state, bagian)?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&p, teks.trim().to_string() + "\n")?;
    Ok(())
}

pub fn tambah(state: &AppState, bagian: &str, isi: &str) -> ZResult<String> {
    let baru = isi.trim();
    if baru.is_empty() {
        return Err(ZephyrError::InvalidInput("entri kosong".into()));
    }
    let lama = baca(state, bagian)?;
    let gabung = if lama.is_empty() {
        baru.to_string()
    } else {
        format!("{lama}{PEMISAH}{baru}")
    };
    let limit = limit_bagian(bagian);
    if gabung.chars().count() > limit {
        return Err(ZephyrError::InvalidInput(format!(
            "memori '{bagian}' penuh: {} dari {} karakter. Hapus atau ringkas entri lama dulu (memory_write dengan action 'replace' atau 'remove'), baru tambahkan yang baru.",
            gabung.chars().count(),
            limit
        )));
    }
    tulis_mentah(state, bagian, &gabung)?;
    Ok(gabung)
}

pub fn ganti(state: &AppState, bagian: &str, cari: &str, baru: &str) -> ZResult<String> {
    let kunci = cari.trim();
    if kunci.is_empty() {
        return Err(ZephyrError::InvalidInput("teks yang dicari kosong".into()));
    }
    let daftar = entri(&baca(state, bagian)?);
    let mut kena = 0;
    let hasil: Vec<String> = daftar
        .into_iter()
        .map(|e| {
            if e.contains(kunci) {
                kena += 1;
                baru.trim().to_string()
            } else {
                e
            }
        })
        .filter(|e| !e.is_empty())
        .collect();
    if kena == 0 {
        return Err(ZephyrError::NotFound(format!(
            "tidak ada entri '{bagian}' yang memuat: {kunci}"
        )));
    }
    let teks = hasil.join(PEMISAH);
    let limit = limit_bagian(bagian);
    if teks.chars().count() > limit {
        return Err(ZephyrError::InvalidInput(format!(
            "hasil penggantian melebihi batas {} karakter ({}). Ringkas dulu isinya.",
            limit,
            teks.chars().count()
        )));
    }
    tulis_mentah(state, bagian, &teks)?;
    Ok(teks)
}

pub fn hapus(state: &AppState, bagian: &str, cari: &str) -> ZResult<usize> {
    let kunci = cari.trim();
    if kunci.is_empty() {
        return Err(ZephyrError::InvalidInput("teks yang dicari kosong".into()));
    }
    let daftar = entri(&baca(state, bagian)?);
    let sebelum = daftar.len();
    let hasil: Vec<String> = daftar.into_iter().filter(|e| !e.contains(kunci)).collect();
    let terhapus = sebelum - hasil.len();
    if terhapus == 0 {
        return Err(ZephyrError::NotFound(format!(
            "tidak ada entri '{bagian}' yang memuat: {kunci}"
        )));
    }
    tulis_mentah(state, bagian, &hasil.join(PEMISAH))?;
    Ok(terhapus)
}

pub fn ringkasan_untuk_prompt(state: &AppState) -> String {
    let mem = baca(state, "memory").unwrap_or_default();
    let usr = baca(state, "user").unwrap_or_default();
    if mem.is_empty() && usr.is_empty() {
        return String::new();
    }
    let mut s = String::new();
    if !mem.is_empty() {
        s.push_str("\n\nMEMORI (catatanmu dari sesi sebelumnya — pakai, dan perbarui lewat memory_write bila berubah):\n");
        s.push_str(&mem);
    }
    if !usr.is_empty() {
        s.push_str("\n\nPROFIL USER:\n");
        s.push_str(&usr);
    }
    s
}

#[tauri::command]
pub fn memory_read(state: State<AppState>) -> ZResult<MemoryState> {
    let mem = baca(&state, "memory")?;
    let usr = baca(&state, "user")?;
    Ok(MemoryState {
        memory_chars: mem.chars().count(),
        user_chars: usr.chars().count(),
        memory: mem,
        user: usr,
        memory_limit: MEMORY_LIMIT,
        user_limit: USER_LIMIT,
    })
}

#[tauri::command]
pub fn memory_write(
    state: State<AppState>,
    section: String,
    action: String,
    content: Option<String>,
    old_text: Option<String>,
) -> ZResult<String> {
    let isi = content.unwrap_or_default();
    let lama = old_text.unwrap_or_default();
    match action.as_str() {
        "add" => tambah(&state, &section, &isi),
        "replace" => ganti(&state, &section, &lama, &isi),
        "remove" => hapus(&state, &section, &lama).map(|n| format!("{n} entri dihapus")),
        other => Err(ZephyrError::InvalidInput(format!(
            "action tidak dikenal: '{other}' (pakai add/replace/remove)"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entri_memecah_dengan_benar() {
        let t = "satu\n\n dua \n\n\n tiga \n\n";
        assert_eq!(entri(t), vec!["satu", "dua", "tiga"]);
    }

    #[test]
    fn entri_kosong_menghasilkan_daftar_kosong() {
        assert!(entri("").is_empty());
        assert!(entri("   \n\n  ").is_empty());
    }

    #[test]
    fn bagian_valid_menolak_yang_lain() {
        assert!(bagian_valid("memory").is_ok());
        assert!(bagian_valid("user").is_ok());
        assert!(bagian_valid("rahasia").is_err());
    }

    #[test]
    fn limit_berbeda_per_bagian() {
        assert_eq!(limit_bagian("memory"), MEMORY_LIMIT);
        assert_eq!(limit_bagian("user"), USER_LIMIT);
    }
}
