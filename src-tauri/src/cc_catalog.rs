//! Bundled Claude Code catalog: subagents + skills, and installing them into
//! the real `~/.claude/` so the live CLI picks them up (genuine sync, Cara B).
//!
//! Zephyr ships a catalog compiled into the binary (`assets/cc-catalog.json`,
//! built by `scripts/build-cc-catalog.mjs` from the upstream repos:
//! 0xfurai/claude-code-subagents, VoltAgent/awesome-claude-code-subagents and
//! anthropics/skills). The slash popups ("Manage plugins" / Agents / Skills)
//! browse this catalog and INSTALL a chosen entry by writing its markdown to:
//!   * agents -> ~/.claude/agents/<name>.md
//!   * skills -> ~/.claude/skills/<name>/SKILL.md
//! which is exactly where the CLI reads user-scope agents/skills from, so an
//! install is live the next terminal run too — not a Zephyr-only copy.

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// One catalog entry: an agent or a skill, with its full markdown body.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CatalogEntry {
    pub id: String,
    pub kind: String, // "agent" | "skill"
    pub name: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub tools: String,
    #[serde(default)]
    pub extras: Vec<String>,
    pub body: String,
}

/// A lighter row for the browser list — everything but the (large) body, plus
/// whether the entry is already installed in `~/.claude`.
#[derive(Debug, Clone, Serialize)]
pub struct CatalogItem {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub source: String,
    pub category: String,
    pub model: String,
    pub tools: String,
    pub installed: bool,
}

/// The compiled-in catalog JSON (≈1.7 MB), parsed once and cached.
fn catalog() -> &'static Vec<CatalogEntry> {
    use std::sync::OnceLock;
    static CAT: OnceLock<Vec<CatalogEntry>> = OnceLock::new();
    CAT.get_or_init(|| {
        let raw = include_str!("../assets/cc-catalog.json");
        serde_json::from_str(raw).unwrap_or_default()
    })
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

/// Where an entry lands under `~/.claude` when installed.
fn install_path(home: &std::path::Path, kind: &str, name: &str) -> Option<std::path::PathBuf> {
    // Keep the name a bare file stem — no path separators can escape the dir.
    if name.is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") {
        return None;
    }
    let base = home.join(".claude");
    match kind {
        "agent" => Some(base.join("agents").join(format!("{name}.md"))),
        "skill" => Some(base.join("skills").join(name).join("SKILL.md")),
        _ => None,
    }
}

fn is_installed(home: &std::path::Path, e: &CatalogEntry) -> bool {
    install_path(home, &e.kind, &e.name)
        .map(|p| p.exists())
        .unwrap_or(false)
}

/// The whole catalog as light rows (no bodies), with installed-state flagged.
#[tauri::command]
pub fn cc_catalog_list() -> ZResult<Vec<CatalogItem>> {
    let home = home_dir();
    let rows = catalog()
        .iter()
        .map(|e| CatalogItem {
            id: e.id.clone(),
            kind: e.kind.clone(),
            name: e.name.clone(),
            title: e.title.clone(),
            description: e.description.clone(),
            source: e.source.clone(),
            category: e.category.clone(),
            model: e.model.clone(),
            tools: e.tools.clone(),
            installed: home.as_deref().map(|h| is_installed(h, e)).unwrap_or(false),
        })
        .collect();
    Ok(rows)
}

/// One entry's full markdown body (for the preview pane).
#[tauri::command]
pub fn cc_catalog_body(id: String) -> ZResult<String> {
    catalog()
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.body.clone())
        .ok_or_else(|| ZephyrError::NotFound(format!("catalog entry not found: {id}")))
}

/// Install one catalog entry into `~/.claude` so the live CLI uses it. Writing
/// the agent/skill file is the real "sync": a terminal `claude` run reads the
/// same path. Returns the path written.
#[tauri::command]
pub fn cc_catalog_install(id: String) -> ZResult<String> {
    let home = home_dir().ok_or_else(|| ZephyrError::NotFound("no home directory".into()))?;
    let entry = catalog()
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("catalog entry not found: {id}")))?;
    let path = install_path(&home, &entry.kind, &entry.name)
        .ok_or_else(|| ZephyrError::InvalidInput("bad entry name".into()))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ZephyrError::Io(format!("create {}: {e}", parent.display())))?;
    }
    std::fs::write(&path, &entry.body)
        .map_err(|e| ZephyrError::Io(format!("write {}: {e}", path.display())))?;
    Ok(path.to_string_lossy().to_string())
}

/// Remove an installed entry from `~/.claude`. For a skill the whole folder is
/// removed; for an agent just the file.
#[tauri::command]
pub fn cc_catalog_uninstall(id: String) -> ZResult<bool> {
    let home = home_dir().ok_or_else(|| ZephyrError::NotFound("no home directory".into()))?;
    let entry = catalog()
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("catalog entry not found: {id}")))?;
    let path = install_path(&home, &entry.kind, &entry.name)
        .ok_or_else(|| ZephyrError::InvalidInput("bad entry name".into()))?;
    if entry.kind == "skill" {
        if let Some(dir) = path.parent() {
            if dir.exists() {
                std::fs::remove_dir_all(dir)
                    .map_err(|e| ZephyrError::Io(format!("remove {}: {e}", dir.display())))?;
                return Ok(true);
            }
        }
        return Ok(false);
    }
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| ZephyrError::Io(format!("remove {}: {e}", path.display())))?;
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_parses_and_has_entries() {
        let c = catalog();
        assert!(c.len() > 200, "expected a full catalog, got {}", c.len());
        assert!(c.iter().any(|e| e.kind == "agent"));
        assert!(c.iter().any(|e| e.kind == "skill"));
    }

    #[test]
    fn install_path_is_sandboxed() {
        let home = std::path::Path::new("/home/u");
        assert!(install_path(home, "agent", "../evil").is_none());
        assert!(install_path(home, "agent", "a/b").is_none());
        assert_eq!(
            install_path(home, "agent", "bash-expert").unwrap(),
            home.join(".claude").join("agents").join("bash-expert.md")
        );
        assert_eq!(
            install_path(home, "skill", "docx").unwrap(),
            home.join(".claude").join("skills").join("docx").join("SKILL.md")
        );
    }
}
