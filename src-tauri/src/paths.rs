// paths.rs — keamanan path (fase 14.2).
//
// Kontrak yang dipegang seluruh app (ARCHITECTURE.md §7.1):
//   * Operasi TULIS hanya boleh di dalam workspace aktif, atau di path yang
//     sudah di-whitelist karena user memilihnya sendiri lewat dialog native.
//   * Pengecekan memakai path KANONIK (`fs::canonicalize`) — bukan
//     perbandingan string mentah. Tanpa itu `ws\..\..\rahasia.txt` atau
//     symlink yang menunjuk keluar akan lolos.
//   * Path di dalam workspace disimpan/dilaporkan RELATIF (separator '/')
//     supaya session.json & log tidak bergantung pada lokasi absolut.
//   * Symlink TETAP diikuti (user mungkin memang memakainya), tapi kalau
//     target aslinya keluar dari workspace itu dicatat sebagai warning di log.
//
// Kenapa canonicalize dipakai bertahap (`existing_ancestor`): file yang akan
// DIBUAT belum ada, jadi `canonicalize` pada path-nya gagal. Yang dikanonikkan
// adalah leluhur terdekat yang sudah ada, lalu sisa komponennya ditempel —
// dengan `..` diselesaikan lebih dulu supaya tidak bisa dipakai kabur.

use crate::errors::{ZResult, ZephyrError};
use std::path::{Component, Path, PathBuf};

/// Hasil normalisasi sebuah path terhadap workspace aktif.
#[derive(Debug, Clone)]
pub struct Normalized {
    /// Path absolut kanonik (prefix `\\?\` sudah dibuang).
    pub absolute: PathBuf,
    /// Path relatif ke workspace (separator '/'), None bila di luar.
    pub relative: Option<String>,
    /// true = berada di dalam workspace aktif.
    pub inside: bool,
}

/// Batas keras ukuran file yang boleh dibuka editor.
/// FASE 16.3: path Windows >260 karakter. `std::fs` di Rust sudah memakai API
/// Unicode (`CreateFileW`) yang mendukung path panjang lewat prefix `\\?\`,
/// tapi HANYA kalau path-nya absolut dan tidak memuat `..`/`.`. Helper ini
/// menyiapkan bentuk itu; dipakai fs_utils sebelum operasi baca/tulis.
pub fn long_path(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    // Sudah pakai prefix, atau bukan path absolut bergaya drive → biarkan.
    if s.starts_with(r"\\?\") || s.len() < 240 {
        return p.to_path_buf();
    }
    // UNC (\\server\share) memakai bentuk khusus \\?\UNC\server\share.
    if let Some(rest) = s.strip_prefix(r"\\") {
        return PathBuf::from(format!(r"\\?\UNC\{rest}"));
    }
    if p.is_absolute() {
        return PathBuf::from(format!(r"\\?\{s}"));
    }
    p.to_path_buf()
}

/// FASE 16.3: true = path ini adalah root sebuah drive (`C:\`, `D:\`, `\\srv\share`).
/// Dipakai `workspace_open` untuk menolak scan seluruh disk.
pub fn is_drive_root(p: &Path) -> bool {
    let mut it = p.components();
    match (it.next(), it.next(), it.next()) {
        // Windows: Prefix (C:) + RootDir (\) dan tidak ada komponen lain.
        (Some(Component::Prefix(_)), Some(Component::RootDir), None) => true,
        // Kalau tidak ada prefix (unix-like / hasil normalisasi aneh): "/" saja.
        (Some(Component::RootDir), None, _) => true,
        _ => false,
    }
}

/// Buang prefix UNC Windows (`\\?\`) agar perbandingan & tampilan konsisten.
pub fn strip_unc(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p.to_path_buf(),
    }
}

/// Selesaikan `.` dan `..` secara leksikal (tanpa menyentuh disk).
fn lexical_clean(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                // Jangan naik melewati prefix/root.
                if out
                    .components()
                    .next_back()
                    .map(|c| !matches!(c, Component::Prefix(_) | Component::RootDir))
                    .unwrap_or(false)
                {
                    out.pop();
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Kanonikkan path yang MUNGKIN belum ada: leluhur terdekat yang ada
/// dikanonikkan (mengikuti symlink), sisanya ditempel apa adanya.
pub fn canonical_or_parent(p: &Path) -> PathBuf {
    let cleaned = lexical_clean(p);
    if let Ok(c) = cleaned.canonicalize() {
        return strip_unc(&c);
    }
    // Cari leluhur terdekat yang benar-benar ada.
    let mut ancestor = cleaned.as_path();
    let mut rest: Vec<&std::ffi::OsStr> = Vec::new();
    while let Some(parent) = ancestor.parent() {
        if let Some(name) = ancestor.file_name() {
            rest.push(name);
        }
        if let Ok(c) = parent.canonicalize() {
            let mut out = strip_unc(&c);
            for name in rest.iter().rev() {
                out.push(name);
            }
            return out;
        }
        ancestor = parent;
    }
    cleaned
}

/// true bila `child` sama dengan atau berada di bawah `root` (keduanya kanonik).
pub fn is_inside(root: &Path, child: &Path) -> bool {
    let root = normalize_cmp(root);
    let child = normalize_cmp(child);
    child == root || child.starts_with(&root)
}

/// Bentuk untuk perbandingan: Windows tidak peka huruf besar/kecil.
fn normalize_cmp(p: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(p.to_string_lossy().to_lowercase().replace('/', "\\"))
    }
    #[cfg(not(windows))]
    {
        p.to_path_buf()
    }
}

/// Normalisasi path terhadap workspace: absolut kanonik + relatif bila di dalam.
pub fn normalize_workspace_path(workspace: Option<&Path>, input: &Path) -> ZResult<Normalized> {
    if input.as_os_str().is_empty() {
        return Err(ZephyrError::InvalidInput("path kosong".into()));
    }
    let absolute = canonical_or_parent(input);
    let (relative, inside) = match workspace {
        Some(ws) => {
            let ws = canonical_or_parent(ws);
            if is_inside(&ws, &absolute) {
                let rel = pathdiff(&ws, &absolute);
                (rel, true)
            } else {
                (None, false)
            }
        }
        None => (None, false),
    };
    Ok(Normalized {
        absolute,
        relative,
        inside,
    })
}

/// Selisih `child` terhadap `root` dengan separator '/'. None bila sama.
fn pathdiff(root: &Path, child: &Path) -> Option<String> {
    let r = root.to_string_lossy().len();
    let c = child.to_string_lossy();
    if c.len() <= r {
        return None;
    }
    let rest = c[r..].trim_start_matches(['\\', '/']).replace('\\', "/");
    if rest.is_empty() {
        None
    } else {
        Some(rest)
    }
}

/// Symlink yang menunjuk KELUAR workspace: tetap diikuti, tapi dicatat.
/// Dipanggil sebelum operasi tulis; hanya menulis warning ke log.
pub fn warn_if_symlink_escapes(workspace: Option<&Path>, input: &Path) {
    let Some(ws) = workspace else { return };
    let Ok(meta) = std::fs::symlink_metadata(input) else {
        return;
    };
    if !meta.file_type().is_symlink() {
        return;
    }
    let target = canonical_or_parent(input);
    if !is_inside(&canonical_or_parent(ws), &target) {
        tracing::warn!(
            link = %input.to_string_lossy(),
            target = %target.to_string_lossy(),
            "symlink menunjuk keluar workspace — diikuti, tapi perlu diperhatikan"
        );
    }
}

/// Validasi cwd untuk `pty_spawn` (fase 14.2): folder harus ada dan boleh
/// dipakai. Di luar workspace hanya boleh bila sudah di-whitelist dialog atau
/// belum ada workspace sama sekali (fallback %USERPROFILE%).
pub fn validate_cwd(dir: &Path) -> ZResult<PathBuf> {
    let canon = canonical_or_parent(dir);
    if !canon.is_dir() {
        return Err(ZephyrError::InvalidInput(format!(
            "cwd bukan folder: {}",
            dir.to_string_lossy()
        )));
    }
    Ok(canon)
}

// ───────── hook untuk unit test (tests_paths.rs) ─────────

#[cfg(test)]
pub fn lexical_clean_for_test(p: &Path) -> PathBuf {
    lexical_clean(p)
}

#[cfg(test)]
pub fn pathdiff_for_test(root: &Path, child: &Path) -> Option<String> {
    pathdiff(root, child)
}
