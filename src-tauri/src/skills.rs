use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

pub const SKILL_MAX_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,

    pub scope: String,

    pub path: String,
    pub bytes: u64,
}

pub fn nama_valid(nama: &str) -> bool {
    !nama.is_empty()
        && nama.len() <= 64
        && nama
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn parse_frontmatter(teks: &str) -> (Option<String>, Option<String>) {
    let mut nama = None;
    let mut desk = None;
    let mut baris = teks.lines();

    match baris.next() {
        Some(l) if l.trim() == "---" => {}
        _ => return (None, None),
    }
    for l in baris {
        let t = l.trim();
        if t == "---" {
            break;
        }
        if let Some(v) = t.strip_prefix("name:") {
            nama = Some(bersihkan_nilai(v));
        } else if let Some(v) = t.strip_prefix("description:") {
            desk = Some(bersihkan_nilai(v));
        }
    }
    (nama, desk)
}

fn bersihkan_nilai(v: &str) -> String {
    let t = v.trim();
    let t = t
        .strip_prefix('"')
        .and_then(|x| x.strip_suffix('"'))
        .unwrap_or(t);
    let t = t
        .strip_prefix('\'')
        .and_then(|x| x.strip_suffix('\''))
        .unwrap_or(t);
    t.trim().to_string()
}

fn deskripsi_cadangan(teks: &str) -> String {
    for l in teks.lines() {
        let t = l.trim();
        if t.is_empty() || t.starts_with('#') || t == "---" {
            continue;
        }
        let potong: String = t.chars().take(160).collect();
        return potong;
    }
    String::new()
}

fn root_global(state: &AppState) -> PathBuf {
    state.data_dir.join("skills")
}

fn root_workspace(state: &AppState) -> Option<PathBuf> {
    state
        .workspace_path()
        .map(|w| w.join(".zephyr").join("skills"))
}

fn baca_satu(dir: &Path, scope: &str) -> Option<SkillInfo> {
    let file = dir.join("SKILL.md");
    if !file.is_file() {
        return None;
    }
    let nama_folder = dir.file_name()?.to_string_lossy().to_string();
    let teks = std::fs::read_to_string(&file).ok()?;
    let (fm_nama, fm_desk) = parse_frontmatter(&teks);
    let desk = fm_desk
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| deskripsi_cadangan(&teks));
    Some(SkillInfo {
        name: fm_nama.unwrap_or(nama_folder),
        description: desk,
        scope: scope.to_string(),
        path: file.to_string_lossy().to_string(),
        bytes: std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0),
    })
}

pub fn daftar_skills(state: &AppState) -> Vec<SkillInfo> {
    let mut hasil: Vec<SkillInfo> = Vec::new();
    let mut sudah: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut roots: Vec<(PathBuf, &str)> = Vec::new();
    if let Some(w) = root_workspace(state) {
        roots.push((w, "workspace"));
    }
    roots.push((root_global(state), "global"));

    for (root, scope) in roots {
        let entries = match std::fs::read_dir(&root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();
        for d in dirs {
            if let Some(info) = baca_satu(&d, scope) {
                let kunci = info.name.to_lowercase();
                if sudah.insert(kunci) {
                    hasil.push(info);
                }
            }
        }
    }
    hasil.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    hasil
}

fn folder_skill(state: &AppState, nama: &str) -> ZResult<(PathBuf, &'static str)> {
    if !nama_valid(nama) {
        return Err(ZephyrError::InvalidInput(format!(
            "nama skill tidak valid: '{nama}' (hanya huruf, angka, '-' dan '_')"
        )));
    }

    let mut kandidat: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(w) = root_workspace(state) {
        kandidat.push((w, "workspace"));
    }
    kandidat.push((root_global(state), "global"));

    for (root, scope) in kandidat {
        let entries = match std::fs::read_dir(&root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for e in entries.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            let nm = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if nm.eq_ignore_ascii_case(nama) {
                return Ok((p, scope));
            }
        }
    }
    Err(ZephyrError::NotFound(format!(
        "skill '{nama}' tidak ditemukan"
    )))
}

pub fn baca_skill(state: &AppState, nama: &str) -> ZResult<(SkillInfo, String)> {
    let (dir, scope) = folder_skill(state, nama)?;
    let file = dir.join("SKILL.md");
    let meta = std::fs::metadata(&file)
        .map_err(|_| ZephyrError::NotFound(format!("skill '{nama}' tidak punya SKILL.md")))?;
    if meta.len() > SKILL_MAX_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "SKILL.md '{nama}' terlalu besar ({} byte, batas {} byte)",
            meta.len(),
            SKILL_MAX_BYTES
        )));
    }
    let teks = std::fs::read_to_string(&file)?;
    let info = baca_satu(&dir, scope)
        .ok_or_else(|| ZephyrError::Internal(format!("gagal membaca metadata skill '{nama}'")))?;
    Ok((info, teks))
}

pub fn tulis_skill(
    state: &AppState,
    nama: &str,
    description: &str,
    isi: &str,
    scope: &str,
) -> ZResult<String> {
    if !nama_valid(nama) {
        return Err(ZephyrError::InvalidInput(format!(
            "nama skill tidak valid: '{nama}' (hanya huruf, angka, '-' dan '_')"
        )));
    }
    let root = match scope {
        "global" => root_global(state),
        "workspace" => match root_workspace(state) {
            Some(r) => r,

            None => root_global(state),
        },
        other => {
            return Err(ZephyrError::InvalidInput(format!(
                "scope tidak dikenal: '{other}' (pakai 'workspace' atau 'global')"
            )))
        }
    };
    let dir = root.join(nama);
    std::fs::create_dir_all(&dir)?;

    let desk = description.trim();
    let isi_bersih = buang_frontmatter(isi);
    let teks = format!(
        "---\nname: {nama}\ndescription: {desk}\n---\n\n{}\n",
        isi_bersih.trim()
    );
    let file = dir.join("SKILL.md");
    std::fs::write(&file, teks)?;
    Ok(file.to_string_lossy().to_string())
}

fn buang_frontmatter(isi: &str) -> String {
    let t = isi.trim_start();
    if !t.starts_with("---") {
        return isi.to_string();
    }
    let mut it = t.lines();
    it.next();
    for l in it.by_ref() {
        if l.trim() == "---" {
            return it.collect::<Vec<_>>().join("\n");
        }
    }

    isi.to_string()
}

pub fn hapus_skill(state: &AppState, nama: &str) -> ZResult<()> {
    let (dir, _) = folder_skill(state, nama)?;
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}

#[tauri::command]
pub fn skills_list(state: State<AppState>) -> ZResult<Vec<SkillInfo>> {
    Ok(daftar_skills(&state))
}

#[tauri::command]
pub fn skill_read(state: State<AppState>, name: String) -> ZResult<String> {
    let (_, teks) = baca_skill(&state, &name)?;
    Ok(teks)
}

#[tauri::command]
pub fn skill_write(
    state: State<AppState>,
    name: String,
    description: String,
    content: String,
    scope: Option<String>,
) -> ZResult<String> {
    tulis_skill(
        &state,
        &name,
        &description,
        &content,
        scope.as_deref().unwrap_or("workspace"),
    )
}

#[tauri::command]
pub fn skill_delete(state: State<AppState>, name: String) -> ZResult<()> {
    hapus_skill(&state, &name)
}

pub fn ringkasan_untuk_prompt(state: &AppState) -> String {
    let list = daftar_skills(state);
    if list.is_empty() {
        return String::new();
    }
    let mut s = String::from("\n\nSKILL TERSEDIA (buka isinya dengan tool skill_view sebelum mengerjakan tugas yang cocok):\n");
    for sk in list {
        s.push_str(&format!(
            "- {} [{}]: {}\n",
            sk.name, sk.scope, sk.description
        ));
    }
    s
}

#[tauri::command]
pub fn agent_context(state: State<AppState>) -> ZResult<String> {
    let mut s = String::new();
    s.push_str(&crate::memory::ringkasan_untuk_prompt(&state));
    s.push_str(&ringkasan_untuk_prompt(&state));
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nama_valid_menolak_path_traversal() {
        assert!(!nama_valid(".."));
        assert!(!nama_valid("../evil"));
        assert!(!nama_valid("a/b"));
        assert!(!nama_valid("a\\b"));
        assert!(!nama_valid(""));
        assert!(!nama_valid("a b"));
        assert!(!nama_valid("skill.md"));
    }

    #[test]
    fn nama_valid_menerima_bentuk_wajar() {
        assert!(nama_valid("godmode"));
        assert!(nama_valid("tauri-webview2_tuning"));
        assert!(nama_valid("Skill123"));
    }

    #[test]
    fn frontmatter_dibaca() {
        let t = "---\nname: uji\ndescription: Skill percobaan\n---\n\n# Judul\nIsi.\n";
        let (n, d) = parse_frontmatter(t);
        assert_eq!(n.as_deref(), Some("uji"));
        assert_eq!(d.as_deref(), Some("Skill percobaan"));
    }

    #[test]
    fn frontmatter_kutip_dibuang() {
        let t = "---\nname: \"kutip\"\ndescription: 'satu kutip'\n---\nx\n";
        let (n, d) = parse_frontmatter(t);
        assert_eq!(n.as_deref(), Some("kutip"));
        assert_eq!(d.as_deref(), Some("satu kutip"));
    }

    #[test]
    fn tanpa_frontmatter_tidak_panik() {
        let t = "# Cuma judul\n\nBaris isi pertama.\n";
        let (n, d) = parse_frontmatter(t);
        assert!(n.is_none() && d.is_none());
        assert_eq!(deskripsi_cadangan(t), "Baris isi pertama.");
    }

    #[test]
    fn buang_frontmatter_hanya_bila_ada_penutup() {
        let t = "---\nname: x\n---\n\n# Isi\n";
        assert_eq!(buang_frontmatter(t).trim(), "# Isi");

        let t2 = "---\nname: x\n\n# Isi\n";
        assert_eq!(buang_frontmatter(t2), t2);
    }

    #[test]
    fn deskripsi_cadangan_dipotong_160() {
        let panjang = "a".repeat(400);
        assert_eq!(deskripsi_cadangan(&panjang).chars().count(), 160);
    }
}
