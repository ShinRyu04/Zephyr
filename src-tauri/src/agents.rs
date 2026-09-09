// agents.rs — deteksi CLI AI agent yang terinstal (fase 06).
//
// Dipakai UI "+ Agent" untuk menampilkan hanya CLI yang BENAR-BENAR ada
// di mesin ini. Deteksi: crate `which` (mengikuti PATH + PATHEXT Windows)
// lalu fallback ke lokasi pemasangan umum yang tidak selalu masuk PATH.
//
// Versi CLI TIDAK diambil di sini: menjalankan 8 proses `--version` saat
// UI dibuka membuat panel terasa berat (dan beberapa CLI membuka sesi
// interaktif alih-alih mencetak versi). Field `version` disiapkan untuk
// fase berikutnya bila memang dibutuhkan.

use crate::errors::ZResult;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    /// id stabil dipakai store & settings.startCommands
    pub id: String,
    pub label: String,
    /// path executable yang ditemukan
    pub path: String,
    pub version: Option<String>,
}

/// Katalog agent bawaan: (id, label, nama executable, argumen default).
/// `gh` dipakai sebagai GitHub Copilot CLI lewat subcommand `copilot`.
const CATALOG: &[(&str, &str, &str)] = &[
    ("opencode", "opencode", "opencode"),
    ("claude", "Claude Code", "claude"),
    ("codex", "Codex CLI", "codex"),
    ("gemini", "Gemini CLI", "gemini"),
    ("grok", "Grok CLI", "grok"),
    ("pi", "Pi CLI", "pi"),
    ("gh", "GitHub Copilot CLI", "gh"),
    ("cursor", "Cursor Agent", "cursor"),
    ("hermes", "Hermes Agent", "hermes"),
];

/// Lokasi umum di luar PATH (Windows) untuk satu nama executable.
fn extra_candidates(exe: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let pf = std::env::var("ProgramFiles").unwrap_or_default();

    for (base, sub) in [
        (home.as_str(), format!(".{exe}/bin/{exe}.exe")),
        (home.as_str(), format!(".{exe}/bin/{exe}")),
        (appdata.as_str(), format!("npm/{exe}.cmd")),
        (appdata.as_str(), format!("npm/{exe}.exe")),
        (local.as_str(), format!("Programs/{exe}/{exe}.exe")),
        (pf.as_str(), format!("{exe}/bin/{exe}.exe")),
    ] {
        if !base.is_empty() {
            out.push(PathBuf::from(base).join(sub));
        }
    }
    out
}

fn find_exe(exe: &str) -> Option<PathBuf> {
    if let Ok(p) = which::which(exe) {
        return Some(p);
    }
    extra_candidates(exe).into_iter().find(|p| p.is_file())
}

/// Daftar agent terdeteksi. Tidak pernah error: CLI yang tidak ada
/// hanya dilewati (UI menampilkan "tidak ada agent terdeteksi").
#[tauri::command(async)]
pub fn list_agents() -> ZResult<Vec<AgentInfo>> {
    let mut out = Vec::new();
    for (id, label, exe) in CATALOG {
        if let Some(path) = find_exe(exe) {
            out.push(AgentInfo {
                id: (*id).to_string(),
                label: (*label).to_string(),
                path: path.to_string_lossy().to_string(),
                version: None,
            });
        }
    }
    Ok(out)
}

// Start command default per agent TIDAK didefinisikan di Rust: satu sumber
// kebenaran ada di frontend (`terminalStore.defaultStartCommand`) yang juga
// membaca override dari Settings → agents.startCommands.

#[cfg(test)]
pub fn find_exe_for_test(exe: &str) -> Option<PathBuf> {
    find_exe(exe)
}
