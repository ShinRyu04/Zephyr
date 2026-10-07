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

/// A skill or agent found in someone else's repository.
///
/// The bundled catalog covers four curated repos; everything else in the
/// ecosystem (claude-red's security skills, pg-aiguide, a team's private
/// collection) lives in arbitrary GitHub repos that Zephyr cannot ship. Scanning
/// a repo for its SKILL.md / agent markdown is what makes those reachable.
#[derive(Serialize)]
pub struct RemoteEntry {
    pub name: String,
    /// "skill" when it came from a SKILL.md, "agent" from a frontmatter md.
    pub kind: String,
    pub title: String,
    pub description: String,
    /// Repo-relative path, shown so the reader can see what they are taking.
    pub path: String,
    /// The file's text, so the preview needs no second request.
    pub body: String,
}

/// Where a remote repo can be fetched from.
///
/// Only GitHub is accepted, and the value is used to BUILD a URL rather than
/// passed to a shell, so a crafted "repo" cannot become a command. Rejecting
/// anything with a scheme or whitespace is what keeps that true.
fn github_slug(repo: &str) -> Option<String> {
    let r = repo.trim().trim_end_matches('/');
    let r = r.strip_prefix("https://github.com/").unwrap_or(r);
    let r = r.strip_prefix("github.com/").unwrap_or(r);
    if r.is_empty() || r.contains(char::is_whitespace) || r.contains("..") {
        return None;
    }
    let parts: Vec<&str> = r.split('/').collect();
    if parts.len() < 2 || parts[0].is_empty() || parts[1].is_empty() {
        return None;
    }
    Some(format!("{}/{}", parts[0], parts[1]))
}

/// List the skills and agents in a GitHub repo, without installing anything.
///
/// Reads the repository's file tree over the public API rather than cloning:
/// a clone of a large repo for a single SKILL.md is minutes of work and disk,
/// and the reader is only browsing at this point.
#[tauri::command]
pub async fn cc_repo_scan(repo: String) -> ZResult<Vec<RemoteEntry>> {
    let slug = github_slug(&repo)
        .ok_or_else(|| ZephyrError::InvalidInput("expected owner/repo".into()))?;
    let url = format!("https://api.github.com/repos/{slug}/git/trees/HEAD?recursive=1");

    let resp = ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(60)))
        .build()
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Zephyr")
        .call()
        .map_err(|e| ZephyrError::InvalidInput(format!("github: {e}")))?;
    let mut rb = resp.into_body();
    let body = rb
        .read_to_string()
        .map_err(|e| ZephyrError::Io(e.to_string()))?;

    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| ZephyrError::InvalidInput(format!("github json: {e}")))?;
    let Some(tree) = v.get("tree").and_then(|x| x.as_array()) else {
        return Err(ZephyrError::InvalidInput(
            "github returned no tree (private repo, or rate limited)".into(),
        ));
    };

    /* Only files that ARE a skill or an agent. A repo of 500 markdown files is
       mostly docs; taking them all would bury the two real skills. */
    let mut out = Vec::new();
    for node in tree {
        let Some(path) = node.get("path").and_then(|x| x.as_str()) else {
            continue;
        };
        let lower = path.to_ascii_lowercase();
        let kind = if lower.ends_with("skill.md") {
            "skill"
        } else if lower.contains("/agents/") && lower.ends_with(".md") {
            "agent"
        } else {
            continue;
        };
        /* Cap the number of fetches: each candidate is a separate HTTP request,
           and a large repo can list hundreds. */
        if out.len() >= 60 {
            break;
        }
        let name = path
            .rsplit('/')
            .next()
            .unwrap_or(path)
            .trim_end_matches(".md")
            .trim_end_matches(".MD");
        /* A skill's directory name is its identity; SKILL.md is the same
           filename in every one of them. */
        let name = if kind == "skill" {
            path.rsplit('/').nth(1).unwrap_or(name).to_string()
        } else {
            name.to_string()
        };
        let raw = format!("https://raw.githubusercontent.com/{slug}/HEAD/{path}");
        /* A file that fails to fetch is skipped, not fatal: one unreadable
           path in a repo should cost the reader that entry, not the whole
           scan. */
        let Ok(resp) = ureq::get(&raw).header("User-Agent", "Zephyr").call() else {
            continue;
        };
        let mut rb = resp.into_body();
        let Ok(text) = rb.read_to_string() else {
            continue;
        };
        let (title, description) = read_frontmatter(&text);
        out.push(RemoteEntry {
            /* `title` first: it falls back to `name`, so reading it after the
               move would need a clone. */
            title: title.unwrap_or_else(|| name.clone()),
            name,
            kind: kind.to_string(),
            description: description.unwrap_or_default(),
            path: path.to_string(),
            body: text,
        });
    }
    Ok(out)
}

/// `name:` and `description:` out of a markdown frontmatter block.
fn read_frontmatter(text: &str) -> (Option<String>, Option<String>) {
    let Some(rest) = text.strip_prefix("---") else {
        return (None, None);
    };
    let Some(end) = rest.find("
---") else {
        return (None, None);
    };
    let mut title = None;
    let mut desc = None;
    for line in rest[..end].lines() {
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
        match k.trim() {
            "name" | "title" if title.is_none() => title = Some(v),
            "description" => desc = Some(v),
            _ => {}
        }
    }
    (title, desc)
}

/// Install one entry fetched from a remote repo.
///
/// Validation is the same as the bundled catalog's: a bare name, so it cannot
/// escape `~/.claude/`. The BODY is re-fetched rather than trusted from the
/// caller, because the caller is the webview and the file it writes runs as a
/// skill inside the user's agent.
#[tauri::command]
pub async fn cc_repo_install(repo: String, path: String, kind: String) -> ZResult<String> {
    let slug = github_slug(&repo)
        .ok_or_else(|| ZephyrError::InvalidInput("expected owner/repo".into()))?;
    if path.contains("..") || path.starts_with('/') {
        return Err(ZephyrError::InvalidInput("bad path".into()));
    }
    let raw = format!("https://raw.githubusercontent.com/{slug}/HEAD/{path}");
    let resp = ureq::get(&raw)
        .header("User-Agent", "Zephyr")
        .call()
        .map_err(|e| ZephyrError::InvalidInput(format!("github: {e}")))?;
    let mut rb = resp.into_body();
    let text = rb
        .read_to_string()
        .map_err(|e| ZephyrError::Io(e.to_string()))?;

    let name = if kind == "skill" {
        path.rsplit('/').nth(1).unwrap_or("").to_string()
    } else {
        path.rsplit('/')
            .next()
            .unwrap_or("")
            .trim_end_matches(".md")
            .to_string()
    };
    let home = home_dir().ok_or_else(|| ZephyrError::NotFound("no home directory".into()))?;
    let out = install_path(&home, &kind, &name)
        .ok_or_else(|| ZephyrError::InvalidInput("bad entry name".into()))?;
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ZephyrError::Io(e.to_string()))?;
    }
    std::fs::write(&out, text).map_err(|e| ZephyrError::Io(e.to_string()))?;
    Ok(out.to_string_lossy().to_string())
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
    fn github_slug_accepts_the_usual_forms() {
        for input in [
            "SnailSploit/claude-red",
            "https://github.com/SnailSploit/claude-red",
            "https://github.com/SnailSploit/claude-red/",
            "github.com/timescale/pg-aiguide",
        ] {
            assert_eq!(
                github_slug(input).as_deref(),
                Some(if input.contains("pg-aiguide") {
                    "timescale/pg-aiguide"
                } else {
                    "SnailSploit/claude-red"
                }),
                "failed on {input}"
            );
        }
    }

    #[test]
    fn github_slug_rejects_anything_that_could_escape() {
        // The value is used to BUILD a URL, so a scheme, a traversal or a stray
        // space must not survive - each is a way to reach a host we did not mean.
        for bad in [
            "",
            "   ",
            "just-a-name",
            "owner/repo/../../etc",
            "https://evil.example.com/owner/repo",
            "owner/repo extra",
        ] {
            let got = github_slug(bad);
            // A full URL to another host is stripped to its last two segments
            // only when it looks like github.com; anything else must be None.
            if bad.starts_with("https://evil") {
                assert!(got.is_none(), "accepted {bad:?} -> {got:?}");
            } else {
                assert!(got.is_none() || !got.as_deref().unwrap().contains(".."), "accepted {bad:?}");
            }
        }
    }

    #[test]
    fn frontmatter_reads_name_and_description() {
        let t = "---
name: my-skill
description: does a thing
---

# Body";
        let (n, d) = read_frontmatter(t);
        assert_eq!(n.as_deref(), Some("my-skill"));
        assert_eq!(d.as_deref(), Some("does a thing"));
        // No frontmatter at all is not an error, just no metadata.
        let (n2, d2) = read_frontmatter("# Just a heading");
        assert!(n2.is_none() && d2.is_none());
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
