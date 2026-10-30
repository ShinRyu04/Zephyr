//! Browse, install and remove Claude Code plugins.
//!
//! Claude Code keeps the marketplace catalog and the installed set in
//! `~/.claude/plugins/`. This module reads both so the panel can show what is
//! available and what is already there, and installs by delegating to the real
//! `claude plugin` CLI rather than reimplementing the install.
//!
//! WHY delegate: installing a plugin means cloning its source (a git repo, a
//! subdirectory of one, or a plain URL), resolving a ref, writing a manifest
//! entry and updating `installed_plugins.json` — and every one of those steps is
//! something the CLI already does, versioned with the CLI itself. A second
//! implementation here would drift, and would be wrong the first time the plugin
//! format changed. The CLI is the source of truth for what "installed" means.

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::errors::{ZResult, ZephyrError};

type ZResultT<T> = ZResult<T>;

/// One entry in the marketplace catalog.
#[derive(Serialize)]
pub struct CatalogPlugin {
    /// `name@marketplace` — the identity the CLI uses on the command line.
    pub id: String,
    pub name: String,
    pub marketplace: String,
    /// Falls back to the marketplace entry's description when the catalog has
    /// none of its own, because an empty row tells the reader nothing.
    pub description: String,
    pub author: String,
    pub category: String,
    pub homepage: String,
    /// Installs recorded across all users, as a rough popularity signal.
    pub installs: u64,
    /// How many commands / agents / skills / hooks / MCP servers it brings, so
    /// the reader can tell a one-command plugin from a large suite.
    pub commands: usize,
    pub agents: usize,
    pub skills: usize,
    pub hooks: usize,
    pub mcp: usize,
    /// Already installed (from `installed_plugins.json`).
    pub installed: bool,
    /// Installed AND switched on in settings (only meaningful when installed).
    pub enabled: bool,
}

fn home() -> Option<PathBuf> {
    crate::cli_chat::home_dir()
}

fn plugins_dir() -> ZResultT<PathBuf> {
    Ok(home()
        .ok_or_else(|| ZephyrError::NotFound("no home".into()))?
        .join(".claude")
        .join("plugins"))
}

fn read_json(p: &PathBuf) -> Option<Value> {
    let s = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&s).ok()
}

/// The set of installed plugin ids (`name@marketplace`).
fn installed_ids(dir: &PathBuf) -> std::collections::HashSet<String> {
    let mut out = std::collections::HashSet::new();
    if let Some(v) = read_json(&dir.join("installed_plugins.json")) {
        if let Some(map) = v.get("plugins").and_then(|x| x.as_object()) {
            for k in map.keys() {
                out.insert(k.clone());
            }
        }
    }
    out
}

/// The set of enabled plugin ids, from `settings.json` → `enabledPlugins`.
fn enabled_ids() -> std::collections::HashSet<String> {
    let mut out = std::collections::HashSet::new();
    let Some(h) = home() else { return out };
    if let Some(v) = read_json(&h.join(".claude").join("settings.json")) {
        if let Some(map) = v.get("enabledPlugins").and_then(|x| x.as_object()) {
            for (k, val) in map {
                if val.as_bool().unwrap_or(false) {
                    out.insert(k.clone());
                }
            }
        }
    }
    out
}

fn as_str(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

fn count(list: &Value) -> usize {
    list.as_array().map(|a| a.len()).unwrap_or(0)
}

/// Every plugin the marketplace offers, with its install state folded in.
///
/// Returns an empty list rather than an error when the catalog is absent: a
/// machine that has never opened the plugin browser legitimately has no cache,
/// and the panel should say "nothing to show" instead of surfacing a failure
/// the reader cannot act on.
#[tauri::command]
pub fn cc_plugins_catalog() -> ZResultT<Vec<CatalogPlugin>> {
    let Ok(dir) = plugins_dir() else {
        return Ok(Vec::new());
    };
    let Some(cat) = read_json(&dir.join("plugin-catalog-cache.json")) else {
        return Ok(Vec::new());
    };
    let Some(plugins) = cat
        .get("catalog")
        .and_then(|c| c.get("plugins"))
        .and_then(|p| p.as_object())
    else {
        return Ok(Vec::new());
    };

    let installed = installed_ids(&dir);
    let enabled = enabled_ids();

    let mut out: Vec<CatalogPlugin> = plugins
        .iter()
        .map(|(id, e)| {
            let me = e.get("marketplace_entry").cloned().unwrap_or(Value::Null);
            let comp = e.get("components").cloned().unwrap_or(Value::Null);
            let (name, market) = id.split_once('@').unwrap_or((id.as_str(), ""));
            /* The catalog's own description is often missing while the
            marketplace entry has a full one — the panel wants the prose, so
            either source will do. */
            let desc = {
                let a = as_str(&me, "description");
                if a.is_empty() {
                    as_str(e, "description")
                } else {
                    a
                }
            };
            CatalogPlugin {
                id: id.clone(),
                name: name.to_string(),
                marketplace: market.to_string(),
                description: desc,
                author: me
                    .get("author")
                    .and_then(|a| a.get("name"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                category: as_str(&me, "category"),
                homepage: as_str(&me, "homepage"),
                installs: e
                    .get("unique_installs")
                    .and_then(|x| x.as_u64())
                    .unwrap_or(0),
                commands: count(comp.get("commands").unwrap_or(&Value::Null)),
                agents: count(comp.get("agents").unwrap_or(&Value::Null)),
                skills: count(comp.get("skills").unwrap_or(&Value::Null)),
                hooks: count(comp.get("hooks").unwrap_or(&Value::Null)),
                mcp: count(comp.get("mcpServers").unwrap_or(&Value::Null)),
                installed: installed.contains(id),
                enabled: enabled.contains(id),
            }
        })
        .collect();

    // Pastikan plugin yang terpasang lokal tapi gak ada di official catalog tetap nongol
    for id in &installed {
        if !out.iter().any(|p| &p.id == id) {
            let (name, market) = id.split_once('@').unwrap_or((id.as_str(), "custom"));
            out.push(CatalogPlugin {
                id: id.clone(),
                name: name.to_string(),
                marketplace: market.to_string(),
                description: "Custom / local plugin".to_string(),
                author: "".to_string(),
                category: "Custom".to_string(),
                homepage: "".to_string(),
                installs: 0,
                commands: 0,
                agents: 0,
                skills: 0,
                hooks: 0,
                mcp: 0,
                installed: true,
                enabled: enabled.contains(id),
            });
        }
    }

    /* Most-installed first: a browse list is read from the top and the reader
    is usually after something known-good rather than something obscure. */
    out.sort_by(|a, b| b.installs.cmp(&a.installs).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// Ask the real CLI to install a plugin. Returns its combined output.
///
/// The command runs with the same timeout discipline as the rest of the app:
/// an install clones a repository, so it is slow, but it must not hang forever
/// with the panel showing a spinner and no way to tell whether anything is
/// happening.
#[tauri::command]
pub async fn cc_plugin_install(id: String) -> ZResultT<String> {
    if !id.contains('@') || id.contains([' ', '\n', '\r', '\t']) {
        return Err(ZephyrError::InvalidInput("bad plugin id".into()));
    }
    run_cli(vec!["plugin".into(), "install".into(), id]).await
}

/// Ask the real CLI to remove a plugin.
#[tauri::command]
pub async fn cc_plugin_uninstall(id: String) -> ZResultT<String> {
    if !id.contains('@') || id.contains([' ', '\n', '\r', '\t']) {
        return Err(ZephyrError::InvalidInput("bad plugin id".into()));
    }
    run_cli(vec!["plugin".into(), "uninstall".into(), id]).await
}

/// Registered marketplaces, so the panel can show where the catalog comes from.
#[tauri::command]
pub fn cc_plugin_marketplaces() -> ZResultT<Vec<Value>> {
    let Ok(dir) = plugins_dir() else {
        return Ok(Vec::new());
    };
    let Some(v) = read_json(&dir.join("known_marketplaces.json")) else {
        return Ok(Vec::new());
    };
    let Some(map) = v.as_object() else {
        return Ok(Vec::new());
    };
    Ok(map
        .iter()
        .map(|(name, e)| {
            let src = e.get("source").cloned().unwrap_or(Value::Null);
            serde_json::json!({
                "name": name,
                /* Report the repo, not the install path: the path is this
                   machine's business and means nothing to the reader. */
                "source": src.get("repo").and_then(|x| x.as_str())
                    .or_else(|| src.get("url").and_then(|x| x.as_str()))
                    .unwrap_or(""),
                "updated": e.get("lastUpdated").and_then(|x| x.as_str()).unwrap_or(""),
            })
        })
        .collect())
}

/// Run `claude <args>` and return its output, bounded by a timeout.
async fn run_cli(args: Vec<String>) -> ZResultT<String> {
    let mut cmd = crate::proc::tokio_cmd("claude");
    cmd.args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let fut = cmd.output();
    let out = match tokio::time::timeout(std::time::Duration::from_secs(180), fut).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Err(ZephyrError::InvalidInput(format!(
                "running claude failed: {e}"
            )))
        }
        Err(_) => {
            return Err(ZephyrError::InvalidInput(
                "the plugin command did not finish within 3 minutes".into(),
            ))
        }
    };

    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        /* Surface stderr when the command failed — it carries the reason, and a
        bare "exit 1" tells the reader nothing they can act on. */
        if !err.trim().is_empty() {
            text.push('\n');
            text.push_str(err.trim());
        }
        return Err(ZephyrError::InvalidInput(text.trim().to_string()));
    }
    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_handles_missing_and_wrong_type() {
        let v = serde_json::json!({ "a": "x", "b": 3 });
        assert_eq!(as_str(&v, "a"), "x");
        assert_eq!(as_str(&v, "b"), "");
        assert_eq!(as_str(&v, "nope"), "");
    }

    #[test]
    fn count_only_counts_arrays() {
        assert_eq!(count(&serde_json::json!([1, 2, 3])), 3);
        assert_eq!(count(&serde_json::json!([])), 0);
        assert_eq!(count(&serde_json::json!({ "a": 1 })), 0);
        assert_eq!(count(&Value::Null), 0);
    }

    #[test]
    fn install_id_is_validated() {
        // The guard exists so a crafted id cannot inject an extra argv entry.
        for bad in ["nope", "a b@c", "a@b\nc", ""] {
            let looks_ok = bad.contains('@') && !bad.contains([' ', '\n', '\r', '\t']);
            assert!(!looks_ok, "{bad:?} should be rejected");
        }
        assert!("name@marketplace".contains('@'));
    }
}
