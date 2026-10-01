use crate::errors::ZResult;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub label: String,

    pub path: String,
    pub version: Option<String>,
}

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

#[cfg(test)]
pub fn find_exe_for_test(exe: &str) -> Option<PathBuf> {
    find_exe(exe)
}
