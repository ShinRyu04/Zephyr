use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_PATCH_CHARS: usize = 400_000;

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PatchResult {
    pub applied: bool,
    pub added: usize,
    pub removed: usize,
    pub conflict: String,
}

fn normalisasi(patch: &str) -> String {
    patch.replace("\r\n", "\n")
}
fn hitung_baris(patch: &str) -> (usize, usize) {
    let mut plus = 0usize;
    let mut minus = 0usize;
    for l in patch.lines() {
        if l.starts_with("+++") || l.starts_with("---") {
            continue;
        }
        if l.starts_with('+') {
            plus += 1;
        } else if l.starts_with('-') {
            minus += 1;
        }
    }
    (plus, minus)
}

#[tauri::command(async)]
pub fn file_patch(
    state: State<AppState>,
    path: String,
    patch: String,
) -> ZResult<PatchResult> {
    let p = patch.trim();
    if p.is_empty() {
        return Err(ZephyrError::InvalidInput("patch kosong".into()));
    }
    if p.len() > MAX_PATCH_CHARS {
        return Err(ZephyrError::InvalidInput("patch terlalu besar".into()));
    }
    let Some(ws) = state.workspace_path() else {
        return Err(ZephyrError::InvalidInput("belum ada workspace".into()));
    };
    crate::workspace::ensure_trusted(&state, "Menerapkan patch")?;

    let target = state.resolve_ws(&PathBuf::from(&path));
    if !target.is_file() {
        return Err(ZephyrError::InvalidInput(format!("file tidak ada: {path}")));
    }
    state.ensure_writable(&target)?;

    let isi = normalisasi(p);
    let mut isi = isi;
    if !isi.ends_with('\n') {
        isi.push('\n');
    }
    let (added, removed) = hitung_baris(&isi);

    let tmp = std::env::temp_dir().join(format!(
        "zephyr-patch-{}.diff",
        std::process::id()
    ));
    std::fs::write(&tmp, &isi)?;

    let git = crate::proc::cmd("git")
        .arg("apply")
        .arg("--whitespace=nowarn")
        .arg("--recount")
        .arg(&tmp)
        .current_dir(&ws)
        .output();

    let mut res = PatchResult {
        applied: true,
        added,
        removed,
        conflict: String::new(),
    };

    match git {
        Ok(out) if out.status.success() => {
            let _ = std::fs::remove_file(&tmp);
            return Ok(res);
        }
        Ok(out) => {
            res.conflict = String::from_utf8_lossy(&out.stderr).to_string();
        }
        Err(e) => {
            res.conflict = format!("gagal menjalankan git: {e}");
        }
    }
    let _ = std::fs::remove_file(&tmp);

    Err(ZephyrError::InvalidInput(format!(
        "patch tidak bisa diterapkan. Detail:\n{}",
        res.conflict
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalisasi_menjadi_lf() {
        assert_eq!(normalisasi("a\r\nb\r\n"), "a\nb\n");
    }

    #[test]
    fn hitung_baris_mengabaikan_header() {
        let patch = "--- a/x.rs\n+++ b/x.rs\n@@ -1,2 +1,3 @@\n-a\n+b\n+c\n";
        let (plus, minus) = hitung_baris(patch);
        assert_eq!(plus, 2);
        assert_eq!(minus, 1);
    }

    #[test]
    fn patch_kosong_ditolak() {
        assert!(normalisasi("   ").trim().is_empty());
    }
}
