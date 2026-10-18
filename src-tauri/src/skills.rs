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

/// One entry of the skill catalogue: a skill that SHIPS with the app.
///
/// `terpasang` is computed, not stored - it is "does a folder with this name
/// exist under the workspace or the app-data skills root". A catalogue entry
/// that claims to be installed when its folder was deleted is worse than no
/// catalogue at all, because the reader would not understand why the agent
/// cannot find it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillKatalog {
    pub name: String,
    pub description: String,
    /// How many files the skill folder holds (SKILL.md plus references).
    pub berkas: usize,
    pub terpasang: bool,
    /// Non-empty when the skill needs something outside the app to be useful.
    pub catatan: String,
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

/**
 * Plant the bundled skills into the global folder, ONCE per bundle revision.
 *
 * WHY THIS EXISTS
 * ---------------
 * Skills are files on disk, which is right for skills the reader writes. It was
 * wrong for the SHIPPED ones: they lived in the source tree's `.zephyr/skills/`,
 * so a machine that installed Zephyr got none of them. Measured on a clean
 * install, `skills_list` returned 0 - the app shipped with no skills at all.
 *
 * The contents are compiled into the binary (`skill_bundled.rs`), so an install
 * carries them. They are written to `%APPDATA%\zephyr\skills` on first run and
 * then become ordinary files: the reader can edit or delete them, and the app
 * never fights them.
 *
 * Two rules keep that promise honest:
 *
 *  1. A skill folder that ALREADY exists is never touched. Re-seeding would
 *     silently revert every edit the reader made to a shipped skill - the worst
 *     kind of "helpful" behaviour, because the loss is invisible until they
 *     look.
 *  2. The stamp file records WHICH bundle revision was planted. A new app
 *     version with new skills adds the new ones without rewriting the old, and
 *     a skill the reader deleted on purpose is not resurrected on every launch.
 */
pub fn tanam_skill_bawaan(state: &AppState) -> usize {
    let root = root_global(state);
    let stamp = root.join(".bundle-hash");
    let hash = crate::skill_bundled::SKILL_BAWAAN_HASH;

    /*
     * Already planted at this revision: nothing to do. This is the common path
     * on every launch after the first, so it must be a single small read.
     */
    if std::fs::read_to_string(&stamp).map(|s| s.trim() == hash).unwrap_or(false) {
        return 0;
    }

    let mut ditulis = 0;
    for (nama, berkas) in crate::skill_bundled::SKILL_BAWAAN {
        let dir = root.join(nama);
        /*
         * Rule 1: an existing folder is the reader's now. Skip it entirely -
         * not even a single file inside it.
         */
        if dir.exists() {
            continue;
        }
        let mut ok = true;
        for (rel, isi) in *berkas {
            let f = dir.join(rel);
            if let Some(p) = f.parent() {
                if std::fs::create_dir_all(p).is_err() {
                    ok = false;
                    break;
                }
            }
            if std::fs::write(&f, isi).is_err() {
                ok = false;
                break;
            }
        }
        if ok {
            ditulis += 1;
        } else {
            /* A half-written skill is worse than none: remove the remains so
               the next launch retries cleanly instead of leaving a folder that
               rule 1 will then protect forever. */
            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    if std::fs::create_dir_all(&root).is_ok() {
        let _ = std::fs::write(&stamp, hash);
    }
    ditulis
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

/**
 * Walk one skill folder, including subfolders.
 *
 * WHY recursive: skills can be arranged in tiers (e.g. `web/xss/SKILL.md`),
 * and the first version only looked one level deep, so tiered skills were not
 * found. The depth is capped at 4 so a misplaced folder does not make the
 * walk spin.
 */
fn kumpulkan_skill(root: &Path, scope: &str, kedalaman: u8, hasil: &mut Vec<SkillInfo>) {
    if kedalaman > 4 {
        return;
    }
    if let Some(info) = baca_satu(root, scope) {
        hasil.push(info);
        // A folder that has SKILL.md is not walked further: in a nested
        // tier, its contents are attachments of that skill, not new skills.
        return;
    }
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for d in dirs {
        kumpulkan_skill(&d, scope, kedalaman + 1, hasil);
    }
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
        let mut ditemukan = Vec::new();
        kumpulkan_skill(&root, scope, 0, &mut ditemukan);
        for info in ditemukan {
            let kunci = info.name.to_lowercase();
            if sudah.insert(kunci) {
                hasil.push(info);
            }
        }
    }
    hasil.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    hasil
}

/**
 * Find a skill folder by name.
 *
 * Search order: workspace, then global. Tiered skills are found by
 * matching the innermost folder name, and also the frontmatter `name:`
 * when the folder name differs.
 */
fn folder_skill(state: &AppState, nama: &str) -> ZResult<(PathBuf, &'static str)> {
    if !nama_valid(nama) {
        return Err(ZephyrError::InvalidInput(format!(
            "invalid skill name: '{nama}' (letters, digits, '-' and '_' only)"
        )));
    }

    let mut kandidat: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(w) = root_workspace(state) {
        kandidat.push((w, "workspace"));
    }
    kandidat.push((root_global(state), "global"));

    for (root, scope) in &kandidat {
        let entries = match std::fs::read_dir(root) {
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

    // Tiered walk for skills arranged in groups.
    for (root, scope) in &kandidat {
        let mut ditemukan: Vec<PathBuf> = Vec::new();
        cari_folder_nama(root, nama, 0, &mut ditemukan);
        if let Some(p) = ditemukan.into_iter().next() {
            return Ok((p, scope));
        }
    }

    Err(ZephyrError::NotFound(format!(
        "skill '{nama}' tidak ditemukan"
    )))
}

/**
 * Walk in tiers, matching the folder name OR the frontmatter `name:`.
 *
 * WHY two ways: the folder name is sometimes different from the `name:` in SKILL.md
 * (`antislop-code/` contains `name: antislop-code`, but another folder may
 * use a different name). Matching both avoids "skill not found"
 * when it does exist.
 */
fn cari_folder_nama(root: &Path, nama: &str, kedalaman: u8, hasil: &mut Vec<PathBuf>) {
    if kedalaman > 4 || hasil.len() >= 1 {
        return;
    }
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for d in dirs {
        if hasil.len() >= 1 {
            return;
        }
        let nm = d
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let punya_skill = d.join("SKILL.md").is_file();
        if punya_skill && nm.eq_ignore_ascii_case(nama) {
            hasil.push(d.clone());
            return;
        }
        if punya_skill {
            if let Ok(teks) = std::fs::read_to_string(d.join("SKILL.md")) {
                if let (Some(n), _) = parse_frontmatter(&teks) {
                    if n.eq_ignore_ascii_case(nama) {
                        hasil.push(d.clone());
                        return;
                    }
                }
            }
        }
        cari_folder_nama(&d, nama, kedalaman + 1, hasil);
    }
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
        .ok_or_else(|| ZephyrError::Internal(format!("failed to read skill metadata '{nama}'")))?;
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
            "invalid skill name: '{nama}' (letters, digits, '-' and '_' only)"
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
                "scope not recognised: '{other}' (use 'workspace' or 'global')"
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
    /* SKILL.md ditulis atomik: berkas ini adalah isi skill-nya, dan versi yang
    tinggal separuh akan terbaca sebagai skill yang rusak - bukan skill yang
    gagal dibuat. */
    crate::tulis_aman::tulis_atomik_teks(&file, &teks)?;
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
    let (dir, _scope) = folder_skill(state, nama)?;
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}

#[tauri::command]
pub fn skills_list(state: State<AppState>) -> ZResult<Vec<SkillInfo>> {
    Ok(daftar_skills(&state))
}

/// One skill's BODY, without the frontmatter block.
///
/// `baca_skill` returns the file as stored. Handing that to the editor would
/// put the `---` header inside the "Instructions" field, and saving it back
/// would nest a second copy of the frontmatter inside the body — each
/// round-trip adding another. `tulis_skill` already strips a leading block from
/// what it is given, so the two now agree on what the field means.
///
/// The reader who wants the raw file opens it in the editor; the path is shown
/// under the form.
#[tauri::command]
pub fn skill_read(state: State<AppState>, name: String) -> ZResult<String> {
    let (_, teks) = baca_skill(&state, &name)?;
    Ok(buang_frontmatter(&teks).trim().to_string())
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

/*
 * THE SKILL CATALOGUE.
 *
 * `skills_list` answers "what is installed". It cannot answer "what COULD I
 * install", because the bundled skills are compiled into the binary and only
 * appear on disk after `tanam_skill_bawaan` has run - and a skill the reader
 * deleted is (correctly) never resurrected. The result was that a removed skill
 * vanished from the UI with no way to get it back short of wiping the app data
 * folder.
 *
 * These two commands close that hole: `skills_katalog` lists every bundled
 * skill with an honest `terpasang` flag, and `skill_pasang` plants ONE of them
 * on demand. Planting is idempotent-safe the same way the seeder is: an existing
 * folder is left alone, so "install" can never overwrite edits.
 */
fn deskripsi_bundel(berkas: &[(&str, &str)]) -> (String, String) {
    let mut nama = String::new();
    let mut desk = String::new();
    for (rel, isi) in berkas {
        if *rel != "SKILL.md" {
            continue;
        }
        let (fm_nama, fm_desk) = parse_frontmatter(isi);
        nama = fm_nama.unwrap_or_default();
        desk = fm_desk
            .filter(|d| !d.is_empty())
            .unwrap_or_else(|| deskripsi_cadangan(isi));
    }
    (nama, desk)
}

#[tauri::command]
pub fn skills_katalog(state: State<AppState>) -> ZResult<Vec<SkillKatalog>> {
    let terpasang: Vec<String> = daftar_skills(&state).into_iter().map(|s| s.name).collect();
    let mut out = Vec::new();
    for (folder, berkas) in crate::skill_bundled::SKILL_BAWAAN {
        let (nama_dari_fm, desk) = deskripsi_bundel(berkas);
        /* The FOLDER name is what `skill_pasang` writes, so it is what
           `terpasang` must be matched against - a frontmatter name that differs
           from its folder would otherwise always read as "not installed". */
        let terpasang_ini = terpasang.iter().any(|n| n == folder || *n == nama_dari_fm);
        out.push(SkillKatalog {
            name: (*folder).to_string(),
            description: desk,
            berkas: berkas.len(),
            terpasang: terpasang_ini,
            catatan: if *folder == "modlens" {
                "Needs Python 3 on this machine to run its scripts.".to_string()
            } else {
                String::new()
            },
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn skill_pasang(state: State<AppState>, name: String) -> ZResult<bool> {
    if !nama_valid(&name) {
        return Err(ZephyrError::InvalidInput("invalid skill name".into()));
    }
    let Some((_, berkas)) = crate::skill_bundled::SKILL_BAWAAN
        .iter()
        .find(|(folder, _)| *folder == name)
    else {
        return Err(ZephyrError::InvalidInput(format!(
            "no bundled skill named {name}"
        )));
    };

    let root = root_global(&state);
    let dir = root.join(&name);
    /* Same rule as the seeder: an existing folder belongs to the reader. */
    if dir.exists() {
        return Ok(false);
    }

    for (rel, isi) in berkas.iter() {
        let f = dir.join(rel);
        if let Some(p) = f.parent() {
            std::fs::create_dir_all(p)
                .map_err(|e| ZephyrError::InvalidInput(format!("mkdir failed: {e}")))?;
        }
        std::fs::write(&f, isi)
            .map_err(|e| ZephyrError::InvalidInput(format!("write failed: {e}")))?;
    }
    Ok(true)
}

pub fn ringkasan_untuk_prompt(state: &AppState) -> String {
    let list = daftar_skills(state);
    if list.is_empty() {
        return String::new();
    }
    let mut s = String::from("\n\nAVAILABLE SKILLS (read one with the skill_view tool before starting work it matches):\n");
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
