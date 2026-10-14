//! Zephyr plugins: one package that carries skills, agents, rules, hooks and
//! MCP servers together.
//!
//! ## A layer, not a second implementation
//!
//! Every capability a plugin contributes ALREADY has an owner in this codebase.
//! This module does not re-implement any of them; its whole job is to take one
//! package and hand each part to the thing that already knows how to store it:
//!
//! | contribution | owner                      | where it lands                                    |
//! |--------------|----------------------------|---------------------------------------------------|
//! | skills       | `crate::skills`            | `<scope>/skills/<name>/SKILL.md`                   |
//! | rules        | `crate::instructions`      | `<scope>/instructions/<name>.md`                   |
//! | mcp          | `crate::settings`          | `mcp.servers[]` — the same list the MCP pane edits |
//! | hooks        | frontend hook list         | returned by `plugin_enable`, never written here    |
//! | agents       | frontend persona list      | returned by `plugin_enable`, never written here    |
//!
//! `<scope>` is the OPEN WORKSPACE (`.zephyr/…`) when there is one, and the app
//! data folder otherwise — the same two locations `skills.rs` and
//! `instructions.rs` already read from, so a plugin's skill is visible to the
//! agent for exactly the same reason a hand-written skill is.
//!
//! ## Why hooks and agents are RETURNED instead of written
//!
//! Hooks and personas live in the frontend stores (`agentExtrasStore`,
//! `personaStore`), which persist to localStorage. Rust cannot write a
//! localStorage key, so pretending to "install a hook" from here would either
//! be a lie or a second copy of the hook list that disagrees with the one the
//! UI shows. Instead `plugin_enable` returns both lists and the frontend merges
//! them. A plugin hook is always returned with `enabled: false`: that is the
//! standing decision for hooks (see `hooks.rs` and `agentExtrasStore`), and a
//! package that silently switched on a command would be a remote code path the
//! user never approved.
//!
//! ## On-disk layout — the eca-plugins blueprint
//!
//! ```text
//! <data_dir>/plugins/<name>/
//!   plugin.json          manifest: name, description, version, author, provides
//!   skills/<skill>/SKILL.md
//!   agents/<agent>.json
//!   rules/<rule>.md
//!   hooks/<hook>.json
//!   mcp/<server>.json
//! <data_dir>/plugins/installed.json    the registry (installed + enabled)
//! ```
//!
//! `marketplace.json` is embedded in this file (`MARKETPLACE_JSON`) rather than
//! shipped as a loose resource, for the same reason `ext_bundled.rs` embeds its
//! packages: an index that can drift from the packages it points at is worse
//! than no index. A test asserts every id in it resolves to a package.
//!
//! ## Safety
//!
//! * Names become folder and file names, so they are held to `skills::nama_valid`
//!   (letters, digits, `-`, `_`) — no separators, no dots, nothing to traverse.
//! * Zip installs go through `ext_pkg::unzip_zext`, which rejects entries whose
//!   `enclosed_name()` is `None` (absolute paths, `..`, drive letters) and caps
//!   the extracted size; folder installs go through `ext_pkg::copy_dir`, which
//!   skips `.git`, `node_modules` and `target` and caps the total.
//! * Every contribution path is resolved inside the package folder
//!   (`ext_pkg::resolve_in_ext`) and must exist BEFORE anything is registered.
//! * Enabling never overwrites a file the plugin did not write. A clash with a
//!   hand-written skill of the same name is REPORTED (`skipped`) and left alone.
//! * Disabling deletes exactly the paths recorded at enable time, and only after
//!   re-checking each one is still inside a known root.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Same ceiling as `skills::SKILL_MAX_BYTES` — a plugin's parts are ordinary
/// skills and rules, so they cannot be larger than the manual path allows.
const BAGIAN_MAX: u64 = 256 * 1024;

/* ── manifest ────────────────────────────────────────────────────────────── */

/// The `provides` block.
///
/// Entries are `Value` on purpose: the blueprint writes them as plain names
/// (`"skills": ["conventional-commits"]`) while richer packages describe each
/// one (`{"name": "...", "event": "session-end"}`). Both are accepted, and
/// `nama_entri` reads whichever shape arrived — a manifest that is refused over
/// a shape difference is a manifest that gets copied into the code by hand.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Provides {
    #[serde(default)]
    pub skills: Vec<Value>,
    #[serde(default)]
    pub agents: Vec<Value>,
    #[serde(default)]
    pub rules: Vec<Value>,
    #[serde(default)]
    pub hooks: Vec<Value>,
    #[serde(default)]
    pub mcp: Vec<Value>,
}

impl Provides {
    fn nama(&self, kind: Kind) -> Vec<String> {
        self.daftar(kind).iter().filter_map(nama_entri).collect()
    }

    fn daftar(&self, kind: Kind) -> &[Value] {
        match kind {
            Kind::Skill => &self.skills,
            Kind::Agent => &self.agents,
            Kind::Rule => &self.rules,
            Kind::Hook => &self.hooks,
            Kind::Mcp => &self.mcp,
        }
    }

    fn ringkas(&self) -> Vec<String> {
        let mut out = Vec::new();
        for (kind, label) in [
            (Kind::Skill, "skill"),
            (Kind::Agent, "agent"),
            (Kind::Rule, "rule"),
            (Kind::Hook, "hook"),
            (Kind::Mcp, "mcp"),
        ] {
            for n in self.nama(kind) {
                out.push(format!("{label}:{n}"));
            }
        }
        out
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Kind {
    Skill,
    Agent,
    Rule,
    Hook,
    Mcp,
}

impl Kind {
    fn folder(self) -> &'static str {
        match self {
            Kind::Skill => "skills",
            Kind::Agent => "agents",
            Kind::Rule => "rules",
            Kind::Hook => "hooks",
            Kind::Mcp => "mcp",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub provides: Provides,
}

/// A name out of a `provides` entry: a bare string, or `.name`/`.id` of an
/// object.
fn nama_entri(v: &Value) -> Option<String> {
    if let Some(s) = v.as_str() {
        return Some(s.trim().to_string());
    }
    let o = v.as_object()?;
    for k in ["name", "id", "folder", "file"] {
        if let Some(s) = o.get(k).and_then(|x| x.as_str()) {
            if !s.trim().is_empty() {
                return Some(s.trim().to_string());
            }
        }
    }
    None
}

/// Names become folder names, so they are held to the skill rule (the strictest
/// of the three customisation kinds).
fn nama_valid(n: &str) -> bool {
    crate::skills::nama_valid(n)
}

/* ── registry ────────────────────────────────────────────────────────────── */

/// One installed plugin, as recorded in `installed.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntry {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub author: String,
    /// `bundled` | `folder` | `zip` — where the package came from.
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub enabled: bool,
    /// `workspace` | `global` — the scope it was WIRED into, empty when off.
    #[serde(default)]
    pub scope: String,
    /// Absolute paths written on enable. Disable removes exactly these.
    #[serde(default)]
    pub written: Vec<String>,
    /// MCP server ids written into settings. Disable removes exactly these.
    #[serde(default)]
    pub mcp_ids: Vec<String>,
}

pub fn plugins_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("plugins")
}

fn registry_file(state: &AppState) -> PathBuf {
    plugins_dir(state).join("installed.json")
}

fn paket_dir(state: &AppState, name: &str) -> PathBuf {
    plugins_dir(state).join(name)
}

/// `plugins_list` also reports whether the package folder is still there, so a
/// plugin whose files were deleted by hand shows as broken instead of as an
/// enabled plugin that contributes nothing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub source: String,
    pub enabled: bool,
    pub scope: String,
    pub path: String,
    /// `["skill:conventional-commits", "hook:commit-message", …]` for the chips.
    pub provides: Vec<String>,
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub category: String,
    pub homepage: String,
    pub provides: Vec<String>,
    pub installed: bool,
}

fn read_registry(state: &AppState) -> Vec<PluginEntry> {
    std::fs::read_to_string(registry_file(state))
        .ok()
        .and_then(|r| serde_json::from_str::<Vec<PluginEntry>>(&r).ok())
        .unwrap_or_default()
}

fn write_registry(state: &AppState, list: &[PluginEntry]) -> ZResult<()> {
    let dir = plugins_dir(state);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(
        registry_file(state),
        serde_json::to_vec_pretty(list).map_err(|e| ZephyrError::Internal(e.to_string()))?,
    )?;
    Ok(())
}

fn entry_mut<'a>(list: &'a mut Vec<PluginEntry>, name: &str) -> Option<&'a mut PluginEntry> {
    list.iter_mut().find(|e| e.name == name)
}

/* ── reading a package ───────────────────────────────────────────────────── */

/// `plugin.json` of a package folder.
fn baca_manifest(dir: &Path) -> ZResult<PluginManifest> {
    let f = dir.join("plugin.json");
    if !f.is_file() {
        return Err(ZephyrError::NotFound(format!(
            "plugin.json not found in {}",
            dir.display()
        )));
    }
    urai_manifest(&std::fs::read_to_string(&f)?)
}

/// The manifest text itself: parse, then reject a name that could escape a path.
///
/// Split out from `baca_manifest` because the marketplace has to describe a
/// package BEFORE it is installed, and the only copy it has then is the
/// embedded one.
fn urai_manifest(teks: &str) -> ZResult<PluginManifest> {
    let man: PluginManifest = serde_json::from_str(teks)
        .map_err(|e| ZephyrError::InvalidInput(format!("plugin.json could not be parsed: {e}")))?;
    if !nama_valid(&man.name) {
        return Err(ZephyrError::InvalidInput(format!(
            "invalid plugin name '{}' (letters, digits, '-' and '_' only)",
            man.name
        )));
    }
    Ok(man)
}

/// The manifest of a package Zephyr ships, read from the embedded copy.
///
/// An uninstalled plugin has no folder to read, so `pasar_terpasang` would
/// otherwise list it with an empty description and version — a marketplace row
/// that cannot say what it installs. The embedded package is the same text the
/// install would write, so describing it from there is exact, not a guess.
fn baca_manifest_bawaan(id: &str) -> Option<PluginManifest> {
    let (_, berkas) = cari_paket(id)?;
    let (_, isi) = berkas.iter().find(|(rel, _)| *rel == "plugin.json")?;
    urai_manifest(isi).ok()
}

/// The path one contribution must have inside the package.
fn jalur_bagian(akar: &Path, kind: Kind, name: &str) -> ZResult<PathBuf> {
    if !nama_valid(name) {
        return Err(ZephyrError::InvalidInput(format!(
            "invalid {kind:?} name in provides: '{name}'"
        )));
    }
    let rel = match kind {
        // A skill is a FOLDER with SKILL.md — the shape `skills.rs` reads.
        Kind::Skill => format!("{}/{}/SKILL.md", kind.folder(), name),
        Kind::Agent => format!("{}/{}.json", kind.folder(), name),
        Kind::Rule => format!("{}/{}.md", kind.folder(), name),
        Kind::Hook => format!("{}/{}.json", kind.folder(), name),
        Kind::Mcp => format!("{}/{}.json", kind.folder(), name),
    };
    // Rejects `..`, absolute paths and escaping symlinks, and requires the file
    // to exist: a manifest that promises a file the package does not carry is
    // refused at install time, when the package folder is still in front of us.
    crate::ext_pkg::resolve_in_ext(akar, &rel)
}

/// Every file the manifest promises, resolved (and therefore required).
fn cek_bagian(akar: &Path, man: &PluginManifest) -> ZResult<()> {
    for kind in [Kind::Skill, Kind::Agent, Kind::Rule, Kind::Hook, Kind::Mcp] {
        for n in man.provides.nama(kind) {
            jalur_bagian(akar, kind, &n)?;
        }
    }
    Ok(())
}

/* ── install ─────────────────────────────────────────────────────────────── */

/// Install from a folder or a `.zip`.
///
/// Both paths stage into `plugins/.staging` first and only reach
/// `plugins/<name>` once the manifest is valid and every promised file exists —
/// so a half-copied or malicious package never becomes an installed plugin. The
/// staging folder is cleared on the way out, success or failure.
#[tauri::command]
pub fn plugin_install(state: State<AppState>, path: String) -> ZResult<String> {
    let asal = PathBuf::from(path.trim());
    if !asal.exists() {
        return Err(ZephyrError::NotFound(format!(
            "plugin source not found: {}",
            asal.display()
        )));
    }
    let sumber = if asal.is_dir() { "folder" } else { "zip" };
    pasang_dari(&state, &asal, sumber)
}

fn pasang_dari(state: &AppState, asal: &Path, sumber: &str) -> ZResult<String> {
    let staging = plugins_dir(state).join(".staging");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging)?;

    let hasil = (|| -> ZResult<PathBuf> {
        if asal.is_dir() {
            let mut terpakai = 0u64;
            crate::ext_pkg::copy_dir(asal, &staging, &mut terpakai)?;
        } else {
            crate::ext_pkg::unzip_zext(asal, &staging)?;
        }
        Ok(turun_ke_akar(&staging))
    })();

    let hasil = hasil.and_then(|akar| pasang_akar(state, &akar, sumber));
    let _ = std::fs::remove_dir_all(&staging);
    hasil
}

/// Install one of the packages embedded in this file.
#[tauri::command]
pub fn plugin_install_bundled(state: State<AppState>, name: String) -> ZResult<String> {
    let paket = cari_paket(&name)
        .ok_or_else(|| ZephyrError::NotFound(format!("bundled plugin not found: {name}")))?;
    pasang_isi(&state, &name, paket.1, "bundled")
}

/// Write an embedded package to staging, then install it like any other.
fn pasang_isi(
    state: &AppState,
    name: &str,
    berkas: &[(&str, &str)],
    sumber: &str,
) -> ZResult<String> {
    let staging = plugins_dir(state).join(".staging");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging)?;
    let hasil = (|| -> ZResult<PathBuf> {
        for (rel, isi) in berkas {
            let f = staging.join(rel);
            if let Some(p) = f.parent() {
                std::fs::create_dir_all(p)?;
            }
            std::fs::write(&f, isi)?;
        }
        Ok(staging.clone())
    })()
    .and_then(|akar| pasang_akar(state, &akar, sumber));
    let _ = std::fs::remove_dir_all(&staging);
    let name_owned = name.to_string();
    hasil.map(|_| name_owned)
}

/// The last step: validate, move into place, record.
fn pasang_akar(state: &AppState, akar: &Path, sumber: &str) -> ZResult<String> {
    let man = baca_manifest(akar)?;
    cek_bagian(akar, &man)?;

    let dir = plugins_dir(state);
    std::fs::create_dir_all(&dir)?;
    let tujuan = paket_dir(state, &man.name);
    if tujuan.exists() {
        std::fs::remove_dir_all(&tujuan)?;
    }
    // Re-installing over a plugin that is currently ENABLED would leave the
    // wires (written paths, MCP ids) pointing at files the new version may not
    // have; the wires are dropped here, and the plugin comes back switched off.
    std::fs::rename(akar, &tujuan).map_err(|e| {
        ZephyrError::Io(format!(
            "could not move the package into {}: {e}",
            tujuan.display()
        ))
    })?;

    let mut list = read_registry(state);
    let baru = PluginEntry {
        name: man.name.clone(),
        description: man.description.clone(),
        version: man.version.clone(),
        author: man.author.clone(),
        source: sumber.to_string(),
        enabled: false,
        scope: String::new(),
        written: Vec::new(),
        mcp_ids: Vec::new(),
    };
    match entry_mut(&mut list, &man.name) {
        Some(e) => {
            e.description = baru.description;
            e.version = baru.version;
            e.author = baru.author;
            e.source = baru.source;
            e.enabled = false;
            e.scope.clear();
            e.written.clear();
            e.mcp_ids.clear();
        }
        None => list.push(baru),
    }
    list.sort_by(|a, b| a.name.cmp(&b.name));
    write_registry(state, &list)?;
    Ok(man.name)
}

/// The blueprint lets a zip hold the package at its root or inside a single
/// top-level folder (what `git archive` and most packagers produce).
fn turun_ke_akar(dir: &Path) -> PathBuf {
    if dir.join("plugin.json").is_file() {
        return dir.to_path_buf();
    }
    let anak: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default();
    if anak.len() == 1 && anak[0].join("plugin.json").is_file() {
        return anak[0].clone();
    }
    dir.to_path_buf()
}

/* ── list ────────────────────────────────────────────────────────────────── */

fn baca_manifest_paket(state: &AppState, name: &str) -> Option<PluginManifest> {
    baca_manifest(&paket_dir(state, name)).ok()
}

#[tauri::command]
pub fn plugins_list(state: State<AppState>) -> ZResult<Vec<InstalledPlugin>> {
    Ok(daftar_terpasang(&state))
}

/// The listing itself, over a plain `&AppState`, so the tests can reach it
/// without a Tauri runtime.
fn daftar_terpasang(state: &AppState) -> Vec<InstalledPlugin> {
    read_registry(state)
        .into_iter()
        .map(|e| {
            let man = baca_manifest_paket(&state, &e.name);
            InstalledPlugin {
                provides: man.as_ref().map(|m| m.provides.ringkas()).unwrap_or_default(),
                missing: man.is_none(),
                path: paket_dir(state, &e.name).to_string_lossy().to_string(),
                name: e.name,
                description: e.description,
                version: e.version,
                author: e.author,
                source: e.source,
                enabled: e.enabled,
                scope: e.scope,
            }
        })
        .collect()
}

#[tauri::command]
pub fn plugins_marketplace(state: State<AppState>) -> ZResult<Vec<MarketPlugin>> {
    Ok(pasar_terpasang(&state))
}

fn pasar_terpasang(state: &AppState) -> Vec<MarketPlugin> {
    let terpasang: Vec<String> = read_registry(state).into_iter().map(|e| e.name).collect();
    index_pasar()
        .into_iter()
        .map(|e| {
            let man = baca_manifest_paket(state, &e.id).or_else(|| baca_manifest_bawaan(&e.id));
            MarketPlugin {
                id: e.id.clone(),
                name: man
                    .as_ref()
                    .map(|m| m.name.clone())
                    .unwrap_or_else(|| e.id.clone()),
                description: man.as_ref().map(|m| m.description.clone()).unwrap_or_default(),
                version: man.as_ref().map(|m| m.version.clone()).unwrap_or_default(),
                author: man.as_ref().map(|m| m.author.clone()).unwrap_or_default(),
                provides: man.as_ref().map(|m| m.provides.ringkas()).unwrap_or_default(),
                category: e.category,
                homepage: e.homepage,
                installed: terpasang.contains(&e.id),
            }
        })
        .collect()
}

/* ── enable / disable ────────────────────────────────────────────────────── */

/// One hook a plugin brings, ready for the frontend's hook list.
///
/// `enabled` is always `false`: hooks are off until a person switches them on
/// (the standing decision for hooks — see `hooks.rs`). It is returned as a field
/// rather than left implicit so the frontend has nothing to decide.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHook {
    pub id: String,
    pub name: String,
    pub event: String,
    pub command: String,
    pub enabled: bool,
    pub scope: String,
    /// The plugin that brought it, so the frontend can drop it on disable.
    pub plugin: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginAgent {
    pub id: String,
    pub nama: String,
    pub deskripsi: String,
    pub identitas: String,
    pub cara_kerja: String,
    pub aturan: String,
    pub plugin: String,
}

/// What enabling (or disabling) actually did — and what it refused to do.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginToggle {
    pub name: String,
    pub enabled: bool,
    pub scope: String,
    /// The folder `written` and `skipped` are relative to.
    ///
    /// Sent because a relative path alone is not something a person can act on:
    /// "skills/code-review" is their file to edit, but only the absolute path
    /// says WHERE it is (the workspace `.zephyr`, or the app data folder).
    pub scope_root: String,
    /// Files written (enable) or deleted (disable), relative to the scope root.
    pub written: Vec<String>,
    /// Paths left alone because they already existed and were not this
    /// plugin's — a hand-written skill is never overwritten by an install.
    pub skipped: Vec<String>,
    pub hooks: Vec<PluginHook>,
    pub agents: Vec<PluginAgent>,
    /// MCP server ids added to (or removed from) settings.
    pub mcp: Vec<String>,
    /// Things a person needs to know: an MCP entry with no URL, a hook with no
    /// command, a path that was outside the scope root on disable.
    pub warnings: Vec<String>,
}

/// The two locations a contribution can land in, mirroring `skills.rs`.
struct Scope {
    nama: &'static str,
    skills: PathBuf,
    instructions: PathBuf,
}

fn scope_untuk(state: &AppState) -> Scope {
    match state.workspace_path() {
        Some(w) => {
            let z = w.join(".zephyr");
            Scope {
                nama: "workspace",
                skills: z.join("skills"),
                instructions: z.join("instructions"),
            }
        }
        None => Scope {
            nama: "global",
            skills: state.data_dir.join("skills"),
            instructions: state.data_dir.join("instructions"),
        },
    }
}

fn akar_scope(state: &AppState, nama: &str) -> Option<PathBuf> {
    match nama {
        "workspace" => state.workspace_path().map(|w| w.join(".zephyr")),
        "global" => Some(state.data_dir.clone()),
        _ => None,
    }
}

#[tauri::command]
pub fn plugin_enable(
    app: AppHandle,
    state: State<AppState>,
    name: String,
    enabled: bool,
) -> ZResult<PluginToggle> {
    let hasil = if enabled {
        aktifkan(&state, &name)?
    } else {
        nonaktifkan(&state, &name)?
    };
    // The MCP list lives in settings, and the MCP pane reads it from there, so
    // the pane has to hear about a plugin that just added a server.
    let _ = app.emit("settings-changed", json!({ "key": "mcp" }));
    Ok(hasil)
}

fn ambil_entry(state: &AppState, name: &str) -> ZResult<(Vec<PluginEntry>, usize)> {
    let list = read_registry(state);
    let idx = list
        .iter()
        .position(|e| e.name == name)
        .ok_or_else(|| ZephyrError::NotFound(format!("plugin '{name}' is not installed")))?;
    Ok((list, idx))
}

fn aktifkan(state: &AppState, name: &str) -> ZResult<PluginToggle> {
    let (mut list, idx) = ambil_entry(state, name)?;
    let man = baca_manifest(&paket_dir(state, name))?;
    let akar = paket_dir(state, name);
    let scope = scope_untuk(state);

    let mut written: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let sudah: Vec<String> = list[idx].written.clone();

    /* skills: a folder per skill, exactly the shape skills.rs walks. */
    for n in man.provides.nama(Kind::Skill) {
        let src = jalur_bagian(&akar, Kind::Skill, &n)?;
        let src = src.parent().unwrap_or(&akar).to_path_buf();
        let dst = scope.skills.join(&n);
        if dst.exists() && !sudah.iter().any(|p| Path::new(p) == dst) {
            skipped.push(dst.to_string_lossy().to_string());
            continue;
        }
        if dst.exists() {
            std::fs::remove_dir_all(&dst)?;
        }
        let mut terpakai = 0u64;
        crate::ext_pkg::copy_dir(&src, &dst, &mut terpakai)?;
        written.push(dst.to_string_lossy().to_string());
    }

    /* rules: one markdown file per rule, copied VERBATIM — the plugin author
       owns the frontmatter, including `applyTo`. Rewriting it here would mean
       this module deciding a pattern, which is the instruction module's job. */
    for n in man.provides.nama(Kind::Rule) {
        let src = jalur_bagian(&akar, Kind::Rule, &n)?;
        if std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0) > BAGIAN_MAX {
            return Err(ZephyrError::InvalidInput(format!(
                "rule '{n}' exceeds {} KB",
                BAGIAN_MAX / 1024
            )));
        }
        let dst = scope.instructions.join(format!("{n}.md"));
        if dst.exists() && !sudah.iter().any(|p| Path::new(p) == dst) {
            skipped.push(dst.to_string_lossy().to_string());
            continue;
        }
        let isi = std::fs::read_to_string(&src)?;
        crate::tulis_aman::tulis_atomik_teks(&dst, &isi)?;
        written.push(dst.to_string_lossy().to_string());
    }

    /* hooks: parsed and returned, NOT enabled. */
    let mut hooks: Vec<PluginHook> = Vec::new();
    for n in man.provides.nama(Kind::Hook) {
        let f = jalur_bagian(&akar, Kind::Hook, &n)?;
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&f)?).map_err(|e| {
            ZephyrError::InvalidInput(format!("hook '{n}' is not valid JSON: {e}"))
        })?;
        let command = v
            .get("command")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if command.trim().is_empty() {
            warnings.push(format!(
                "hook '{n}' has no command; it is listed but would do nothing when enabled"
            ));
        }
        hooks.push(PluginHook {
            id: format!("plugin:{name}:{n}"),
            name: v
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or(&n)
                .to_string(),
            event: v
                .get("event")
                .and_then(|x| x.as_str())
                .unwrap_or("session-end")
                .to_string(),
            command,
            enabled: false,
            scope: if scope.nama == "workspace" {
                "workspace".into()
            } else {
                "user".into()
            },
            plugin: name.to_string(),
        });
    }

    /* agents: parsed and returned — personas are a frontend store. */
    let mut agents: Vec<PluginAgent> = Vec::new();
    for n in man.provides.nama(Kind::Agent) {
        let f = jalur_bagian(&akar, Kind::Agent, &n)?;
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&f)?).map_err(|e| {
            ZephyrError::InvalidInput(format!("agent '{n}' is not valid JSON: {e}"))
        })?;
        let teks = |k: &str| {
            v.get(k)
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string()
        };
        agents.push(PluginAgent {
            id: format!("plugin:{name}:{n}"),
            nama: if teks("nama").is_empty() {
                n.clone()
            } else {
                teks("nama")
            },
            deskripsi: teks("deskripsi"),
            identitas: teks("identitas"),
            cara_kerja: teks("caraKerja"),
            aturan: teks("aturan"),
            plugin: name.to_string(),
        });
    }

    /* mcp: an HTTP server with a URL goes into `mcp.servers`, the same list the
       MCP pane edits. A command-based entry (what the CLI-oriented blueprint
       carries) has nowhere real to go in Zephyr's client, so it is reported
       instead of being written as a server that cannot connect. */
    let mut mcp_ids: Vec<String> = Vec::new();
    let mut mcp_warn: Vec<String> = Vec::new();
    for n in man.provides.nama(Kind::Mcp) {
        let f = jalur_bagian(&akar, Kind::Mcp, &n)?;
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&f)?)
            .map_err(|e| ZephyrError::InvalidInput(format!("mcp '{n}' is not valid JSON: {e}")))?;
        let url = v.get("url").and_then(|x| x.as_str()).unwrap_or("").trim();
        if url.is_empty() {
            mcp_warn.push(format!(
                "mcp '{n}' is command-based (no url); Zephyr's MCP client speaks HTTP, so it was not registered"
            ));
            continue;
        }
        let id = format!("plugin:{name}:{n}");
        mcp_ids.push(id.clone());
        let label = v
            .get("label")
            .and_then(|x| x.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&n)
            .to_string();
        let token = v.get("token").and_then(|x| x.as_str()).unwrap_or("");
        simpan_mcp(state, &id, &label, url, token)?;
    }
    warnings.extend(mcp_warn);

    let e = &mut list[idx];
    e.enabled = true;
    e.scope = scope.nama.to_string();
    let mut semua: Vec<String> = sudah;
    semua.extend(written.iter().cloned());
    semua.sort();
    semua.dedup();
    e.written = semua;
    let mut mid = e.mcp_ids.clone();
    mid.extend(mcp_ids.iter().cloned());
    mid.sort();
    mid.dedup();
    e.mcp_ids = mid;
    write_registry(state, &list)?;

    Ok(PluginToggle {
        name: name.to_string(),
        enabled: true,
        scope: scope.nama.to_string(),
        scope_root: akar_laporan(state, &[written.clone(), skipped.clone()].concat()),
        written: written.iter().map(|p| relatif(state, p)).collect(),
        skipped: skipped.iter().map(|p| relatif(state, p)).collect(),
        hooks,
        agents,
        mcp: mcp_ids,
        warnings,
    })
}

fn nonaktifkan(state: &AppState, name: &str) -> ZResult<PluginToggle> {
    let (mut list, idx) = ambil_entry(state, name)?;
    let man = baca_manifest_paket(state, name);

    let mut removed: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let jejak_abs = list[idx].written.clone();

    for p in list[idx].written.clone() {
        let jalur = PathBuf::from(&p);
        // Re-checked rather than trusted: the registry is a file on disk and
        // disabling must never delete something outside a scope root.
        let sah = ["workspace", "global"]
            .iter()
            .filter_map(|s| akar_scope(state, s))
            .any(|root| crate::paths::is_inside(&root, &jalur));
        if !sah {
            warnings.push(format!("skipped {p}: it is not inside a known scope root"));
            continue;
        }
        if jalur.is_dir() {
            std::fs::remove_dir_all(&jalur)?;
        } else if jalur.is_file() {
            std::fs::remove_file(&jalur)?;
        }
        removed.push(relatif(state, &p));
    }

    let mcp_lama = list[idx].mcp_ids.clone();
    if !mcp_lama.is_empty() {
        cabut_mcp(state, &mcp_lama)?;
    }

    let e = &mut list[idx];
    e.enabled = false;
    e.scope.clear();
    e.written.clear();
    e.mcp_ids.clear();
    write_registry(state, &list)?;

    /* The same lists come back so the frontend can drop exactly the hook and
       persona entries it merged at enable time. */
    let mut hooks: Vec<PluginHook> = Vec::new();
    let mut agents: Vec<PluginAgent> = Vec::new();
    if let Some(m) = man {
        for n in m.provides.nama(Kind::Hook) {
            hooks.push(PluginHook {
                id: format!("plugin:{name}:{n}"),
                name: n.clone(),
                event: String::new(),
                command: String::new(),
                enabled: false,
                scope: String::new(),
                plugin: name.to_string(),
            });
        }
        for n in m.provides.nama(Kind::Agent) {
            agents.push(PluginAgent {
                id: format!("plugin:{name}:{n}"),
                nama: n.clone(),
                deskripsi: String::new(),
                identitas: String::new(),
                cara_kerja: String::new(),
                aturan: String::new(),
                plugin: name.to_string(),
            });
        }
    }

    /* An empty skill folder left behind by a disable is noise in the panel. */
    prune_kosong(state);

    Ok(PluginToggle {
        name: name.to_string(),
        enabled: false,
        scope: String::new(),
        scope_root: akar_laporan(state, &jejak_abs),
        written: removed,
        skipped: warnings,
        hooks,
        agents,
        mcp: mcp_lama,
        warnings: Vec::new(),
    })
}

/// Drop scope folders that a disable emptied, so a plugin switched off does not
/// leave an empty `skills/` behind to be explained.
fn prune_kosong(state: &AppState) {
    for s in ["workspace", "global"] {
        let Some(root) = akar_scope(state, s) else {
            continue;
        };
        for sub in ["skills", "instructions"] {
            let d = root.join(sub);
            if d.is_dir() {
                let kosong = std::fs::read_dir(&d).map(|r| r.count() == 0).unwrap_or(false);
                if kosong {
                    let _ = std::fs::remove_dir(&d);
                }
            }
        }
    }
}

/// The root that `relatif` strips from every path in `paths`, if there is one.
///
/// This must be the SAME root `relatif` uses (the workspace folder, else the app
/// data folder) or the report does not add up: a workspace-scope skill reads
/// `.zephyr/skills/x`, which only resolves against the workspace, not against
/// `.zephyr`. A disable can span both roots — enabled while a workspace was open,
/// disabled after it was closed — and then there is no single root worth naming,
/// so the caller gets an empty string rather than a wrong path.
fn akar_laporan(state: &AppState, paths: &[String]) -> String {
    if paths.is_empty() {
        return String::new();
    }
    let mut akar: Vec<PathBuf> = Vec::new();
    if let Some(w) = state.workspace_path() {
        akar.push(w);
    }
    akar.push(state.data_dir.clone());
    for a in akar {
        if paths
            .iter()
            .all(|p| crate::paths::is_inside(&a, Path::new(p)))
        {
            return a.to_string_lossy().replace('\\', "/");
        }
    }
    String::new()
}

/// A path as the user thinks of it: relative to the workspace when it is in
/// there, otherwise relative to the data folder.
fn relatif(state: &AppState, p: &str) -> String {
    let path = Path::new(p);
    let mut akar: Vec<PathBuf> = Vec::new();
    if let Some(w) = state.workspace_path() {
        akar.push(w);
    }
    akar.push(state.data_dir.clone());
    for a in akar {
        if let Ok(rel) = path.strip_prefix(&a) {
            return rel.to_string_lossy().replace('\\', "/");
        }
    }
    p.replace('\\', "/")
}

/* ── MCP servers, through settings (the MCP pane's own list) ─────────────── */

fn daftar_mcp(state: &AppState) -> Vec<Value> {
    crate::settings::read_settings_value(state)
        .get("mcp")
        .and_then(|m| m.get("servers"))
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default()
}

fn simpan_mcp(state: &AppState, id: &str, label: &str, url: &str, token: &str) -> ZResult<()> {
    let mut daftar = daftar_mcp(state);
    daftar.retain(|s| s.get("id").and_then(|x| x.as_str()) != Some(id));
    daftar.push(json!({ "id": id, "label": label, "url": url, "token": token }));
    crate::settings::patch_settings_no_emit(state, json!({ "mcp": { "servers": daftar } }))
}

fn cabut_mcp(state: &AppState, ids: &[String]) -> ZResult<()> {
    let mut daftar = daftar_mcp(state);
    let sebelum = daftar.len();
    daftar.retain(|s| {
        s.get("id")
            .and_then(|x| x.as_str())
            .map(|x| !ids.iter().any(|i| i == x))
            .unwrap_or(true)
    });
    if daftar.len() == sebelum {
        return Ok(());
    }
    crate::settings::patch_settings_no_emit(state, json!({ "mcp": { "servers": daftar } }))
}

/* ── remove ──────────────────────────────────────────────────────────────── */

/// Remove a plugin: unwire it first (so nothing is left pointing at a folder
/// that is about to disappear), then delete the package and its registry row.
#[tauri::command]
pub fn plugin_remove(state: State<AppState>, name: String) -> ZResult<()> {
    hapus_plugin(&state, &name)
}

fn hapus_plugin(state: &AppState, name: &str) -> ZResult<()> {
    let (list, idx) = ambil_entry(state, name)?;
    if list[idx].enabled {
        nonaktifkan(state, name)?;
    }
    let dir = paket_dir(state, name);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)?;
    }
    let mut list = read_registry(state);
    list.retain(|e| e.name != name);
    write_registry(state, &list)?;
    Ok(())
}

/* ── the embedded marketplace ────────────────────────────────────────────── */

/// `marketplace.json`, verbatim. Embedded for the same reason `ext_bundled.rs`
/// embeds its packages: an index file that can drift from the packages it
/// points at is worse than no index, and `marketplace_konsisten` fails the
/// build if the two ever disagree.
pub const MARKETPLACE_JSON: &str = r##"{
  "version": 1,
  "plugins": [
    {
      "id": "conventional-commits",
      "category": "Git",
      "homepage": "https://www.conventionalcommits.org/"
    },
    {
      "id": "code-reviewer",
      "category": "Review",
      "homepage": ""
    }
  ]
}"##;

const MANIFEST_CC: &str = r##"{
  "name": "conventional-commits",
  "description": "Teaches the agent the Conventional Commits spec: a skill, a rule for commit messages, and a hook that flags a non-conforming subject (off until you enable it).",
  "version": "1.0.0",
  "author": "zephyr",
  "provides": {
    "skills": ["conventional-commits"],
    "rules": ["conventional-commits"],
    "hooks": ["commit-subject"]
  }
}"##;

const SKILL_CC: &str = r##"---
name: conventional-commits
description: Use when writing a commit message or reviewing one. The Conventional Commits 1.0.0 grammar, plus the project's own mapping from type to changelog section.
---

# Conventional Commits

A commit message is a machine-readable API for your history. Format:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Types

| type | use for |
|------|---------|
| `feat` | a new feature visible to users |
| `fix` | a bug fix |
| `docs` | documentation only |
| `refactor` | a change that neither adds behaviour nor fixes a bug |
| `perf` | a change that improves performance |
| `test` | tests, or test infrastructure |
| `build` | build system, dependencies |
| `ci` | CI configuration |
| `chore` | anything else that is not source or test |

## Rules that catch people out

- The description is imperative and lower-case: `add retry to upload`, not
  `Added retry` and not `adds retry`.
- A breaking change is marked with `!` after the type/scope (`feat(api)!: …`)
  AND spelled out in a `BREAKING CHANGE:` footer. One without the other is
  invisible to tooling.
- Scopes are the module or package name the change is confined to. If a change
  spans three scopes, it is three commits or no scope.
- One commit is one logical change. A message that needs "and" in the subject
  is usually two commits.

## Before you write one

1. `git diff --cached` — write the message from the diff, not from memory.
2. Ask whether the change would be one line in a changelog. If yes, the subject
   IS that line.
"##;

const RULE_CC: &str = r##"---
description: Conventional Commits for commit messages
applyTo: '**/.git/COMMIT_EDITMSG, **/*.md'
---

# Commit messages

Messages follow Conventional Commits 1.0.0: `<type>(<scope>): <subject>`, with
an imperative, lower-case subject and no trailing period. Breaking changes carry
`!` and a `BREAKING CHANGE:` footer.

Do not rewrite a commit message that is already written and pushed; a message
that does not follow the spec is worth mentioning once, not worth a force-push.
"##;

const HOOK_CC: &str = r##"{
  "name": "Commit subject follows Conventional Commits",
  "event": "session-end",
  "command": "git log -1 --pretty=%s | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\\(.+\\))?!?: .+' || echo 'last commit subject does not follow Conventional Commits'"
}"##;

const MANIFEST_CR: &str = r##"{
  "name": "code-reviewer",
  "description": "A review agent that reads the diff before the code, and a skill with a correctness-first checklist for reviewing a change.",
  "version": "1.0.0",
  "author": "zephyr",
  "provides": {
    "skills": ["code-review"],
    "agents": ["reviewer"]
  }
}"##;

const SKILL_CR: &str = r##"---
name: code-review
description: Use when reviewing a diff, a pull request, or your own just-written change. A correctness-first order of operations, and the failure modes that are worth a comment.
---

# Code review

Review in this order, and do not reorder it: a style note on a function that
loses data is wasted breath.

1. **Does it do what it says?** Read the change, then read what calls it.
2. **What happens when it fails?** Missing error paths are the most common
   real defect: an error that is logged and swallowed, a `unwrap` on something
   that a user controls, a retry with no bound.
3. **Boundaries.** Empty input, one element, the maximum, negative, unicode,
   concurrent callers.
4. **State.** Anything mutated in place that something else is holding; any
   cache that can outlive the data it copied.
5. **Tests.** Do they fail when the code is reverted? A test that passes both
   ways is not a test.
6. **Style**, last, and only where the repository has a settled convention.

## Writing the comment

Say the defect, the input that triggers it, and what the fix would be. "This
looks wrong" is not reviewable. If you are not sure, say what would settle it.

## Reviewing your own change

Diff it before you describe it. A summary written from memory tends to describe
what you meant to write.
"##;

const AGENT_CR: &str = r##"{
  "id": "reviewer",
  "nama": "Reviewer",
  "deskripsi": "Reviews a change for correctness before anything else.",
  "identitas": "You review changes. You do not make them unless asked, and when you do, you say which files you touched and why.",
  "caraKerja": "Read the diff before the surrounding code. Read the callers. Look for the failure path first: what is unwrapped, what is ignored, what is retried without a bound. Then boundaries and state. Style last, and only where the repository has already settled.",
  "aturan": "Quote the line you are talking about. Name the input that triggers the problem. If a claim cannot be checked from the code in front of you, say so instead of asserting it. Never soften a real defect into a suggestion."
}"##;

/// `(id, files)` for every embedded package.
const PAKET: &[(&str, &[(&str, &str)])] = &[
    (
        "conventional-commits",
        &[
            ("plugin.json", MANIFEST_CC),
            ("skills/conventional-commits/SKILL.md", SKILL_CC),
            ("rules/conventional-commits.md", RULE_CC),
            ("hooks/commit-subject.json", HOOK_CC),
        ],
    ),
    (
        "code-reviewer",
        &[
            ("plugin.json", MANIFEST_CR),
            ("skills/code-review/SKILL.md", SKILL_CR),
            ("agents/reviewer.json", AGENT_CR),
        ],
    ),
];

fn cari_paket(id: &str) -> Option<(&'static str, &'static [(&'static str, &'static str)])> {
    PAKET.iter().copied().find(|(pid, _)| *pid == id)
}

#[derive(Debug, Deserialize)]
struct PasarEntri {
    id: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    homepage: String,
}

fn index_pasar() -> Vec<PasarEntri> {
    #[derive(Deserialize)]
    struct Akar {
        #[serde(default)]
        plugins: Vec<PasarEntri>,
    }
    serde_json::from_str::<Akar>(MARKETPLACE_JSON)
        .map(|a| a.plugins)
        .unwrap_or_default()
}

/* ── tests ───────────────────────────────────────────────────────────────── */

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch root unique to one test: the suite runs in parallel and two
    /// tests sharing a plugins folder would see each other's installs.
    struct Uji {
        state: AppState,
        akar: PathBuf,
        ws: PathBuf,
    }

    impl Uji {
        fn baru(nama: &str) -> Self {
            let akar = std::env::temp_dir().join(format!(
                "zephyr-plugins-{}-{}-{}",
                std::process::id(),
                nama,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0)
            ));
            let data = akar.join("data");
            let ws = akar.join("ws");
            std::fs::create_dir_all(&data).unwrap();
            std::fs::create_dir_all(&ws).unwrap();
            let mut state = AppState::new();
            state.data_dir = data;
            state.set_workspace(ws.clone()).unwrap();
            Self { state, akar, ws }
        }

        /// A package folder on disk, built from the embedded files.
        fn paket(&self, id: &str) -> PathBuf {
            let dir = self.akar.join(format!("sumber-{id}"));
            let (_, berkas) = cari_paket(id).unwrap();
            for (rel, isi) in berkas {
                let f = dir.join(rel);
                std::fs::create_dir_all(f.parent().unwrap()).unwrap();
                std::fs::write(&f, isi).unwrap();
            }
            dir
        }
    }

    impl Drop for Uji {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.akar);
        }
    }

    #[test]
    fn nama_plugin_menolak_traversal() {
        assert!(!nama_valid("../jahat"));
        assert!(!nama_valid("a/b"));
        assert!(!nama_valid("a\\b"));
        assert!(!nama_valid("C:plugin"));
        assert!(!nama_valid(".hidden"));
        assert!(!nama_valid("nama dengan spasi"));
        assert!(!nama_valid(""));
        assert!(nama_valid("conventional-commits"));
        assert!(nama_valid("ext_1"));
    }

    #[test]
    fn manifest_wajib_punya_nama() {
        let u = Uji::baru("manifest");
        let dir = u.akar.join("tanpa-nama");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("plugin.json"), r##"{"description": "x"}"##).unwrap();
        let e = baca_manifest(&dir).unwrap_err();
        assert!(format!("{e}").contains("parsed"), "got: {e}");

        std::fs::write(dir.join("plugin.json"), r##"{"name": "../evil"}"##).unwrap();
        let e = baca_manifest(&dir).unwrap_err();
        assert!(format!("{e}").contains("invalid plugin name"), "got: {e}");
    }

    #[test]
    fn provides_terima_string_maupun_objek() {
        let p: Provides = serde_json::from_str(
            r##"{"skills": ["a", {"name": "b"}, {"id": "c"}], "hooks": [{"name": "h"}]}"##,
        )
        .unwrap();
        assert_eq!(p.nama(Kind::Skill), vec!["a", "b", "c"]);
        assert_eq!(p.nama(Kind::Hook), vec!["h"]);
        assert_eq!(p.nama(Kind::Mcp), Vec::<String>::new());
    }

    #[test]
    fn pasang_folder_mendaftar_dan_menyalin() {
        let u = Uji::baru("pasang-folder");
        let src = u.paket("code-reviewer");
        let nama = pasang_dari(&u.state, &src, "folder").unwrap();
        assert_eq!(nama, "code-reviewer");

        let dir = paket_dir(&u.state, "code-reviewer");
        assert!(dir.join("plugin.json").is_file(), "paket harus ikut pindah");
        assert!(dir.join("skills/code-review/SKILL.md").is_file());

        let list = read_registry(&u.state);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].source, "folder");
        assert!(!list[0].enabled, "pasang tidak boleh langsung mengaktifkan");

        // The staging folder never survives an install.
        assert!(!plugins_dir(&u.state).join(".staging").exists());
        // And the SOURCE folder is left alone: installing is a copy, not a move.
        assert!(src.join("plugin.json").is_file());
    }

    #[test]
    fn pasang_menolak_berkas_yang_tidak_ada() {
        let u = Uji::baru("berkas-hilang");
        let dir = u.akar.join("kurang");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("plugin.json"),
            r##"{"name": "kurang", "provides": {"skills": ["tidak-ada"]}}"##,
        )
        .unwrap();
        let e = pasang_dari(&u.state, &dir, "folder").unwrap_err();
        assert!(format!("{e}").contains("tidak-ada"), "got: {e}");
        assert!(read_registry(&u.state).is_empty(), "gagal = tidak terdaftar");
        assert!(!paket_dir(&u.state, "kurang").exists());
    }

    #[test]
    fn zip_dengan_zip_slip_ditolak() {
        use std::io::Write;
        let u = Uji::baru("zip-slip");
        let z = u.akar.join("jahat.zip");
        {
            let f = std::fs::File::create(&z).unwrap();
            let mut zw = zip::ZipWriter::new(f);
            let opt = zip::write::SimpleFileOptions::default();
            zw.start_file("../jahat.txt", opt).unwrap();
            zw.write_all(b"keluar").unwrap();
            zw.start_file("plugin.json", opt).unwrap();
            zw.write_all(br##"{"name": "jahat"}"##).unwrap();
            zw.finish().unwrap();
        }
        let e = pasang_dari(&u.state, &z, "zip").unwrap_err();
        assert!(format!("{e}").contains("zip entry"), "got: {e}");
        assert!(
            !u.akar.join("jahat.txt").exists(),
            "berkas tidak boleh mendarat di luar staging"
        );
        assert!(read_registry(&u.state).is_empty());
    }

    #[test]
    fn zip_normal_dipasang_dari_subfolder() {
        use std::io::Write;
        let u = Uji::baru("zip-ok");
        let z = u.akar.join("paket.zip");
        {
            let f = std::fs::File::create(&z).unwrap();
            let mut zw = zip::ZipWriter::new(f);
            let opt = zip::write::SimpleFileOptions::default();
            for (rel, isi) in cari_paket("code-reviewer").unwrap().1 {
                zw.start_file(format!("code-reviewer/{rel}"), opt).unwrap();
                zw.write_all(isi.as_bytes()).unwrap();
            }
            zw.finish().unwrap();
        }
        let nama = pasang_dari(&u.state, &z, "zip").unwrap();
        assert_eq!(nama, "code-reviewer", "akar harus diturunkan satu level");
        assert!(paket_dir(&u.state, "code-reviewer")
            .join("agents/reviewer.json")
            .is_file());
    }

    #[test]
    fn aktifkan_menulis_skill_rule_dan_hook_mati() {
        let u = Uji::baru("aktifkan");
        pasang_isi(&u.state, "conventional-commits", cari_paket("conventional-commits").unwrap().1, "bundled").unwrap();

        let t = aktifkan(&u.state, "conventional-commits").unwrap();
        assert!(t.enabled);
        assert_eq!(t.scope, "workspace", "workspace terbuka = scope workspace");

        let skill = u.ws.join(".zephyr/skills/conventional-commits/SKILL.md");
        assert!(skill.is_file(), "skill harus mendarat di .zephyr/skills");
        let rule = u.ws.join(".zephyr/instructions/conventional-commits.md");
        assert!(rule.is_file(), "rule harus mendarat di .zephyr/instructions");
        assert!(std::fs::read_to_string(&rule)
            .unwrap()
            .contains("applyTo"), "rule disalin verbatim, frontmatter ikut");

        // The newly written skill is visible to the module that owns skills.
        let daftar = crate::skills::daftar_skills(&u.state);
        assert!(
            daftar.iter().any(|s| s.name == "conventional-commits"),
            "skill plugin harus terbaca skills.rs"
        );
        // The rule file is a real instruction body: same parser the panel uses
        // (`instructions.rs::parse_instruction`) reads its frontmatter + body.
        let (deskripsi, _isi) =
            crate::instructions::parse_instruction(&std::fs::read_to_string(&rule).unwrap());
        assert!(
            deskripsi.to_lowercase().contains("conventional"),
            "frontmatter rule harus terbaca instructions.rs, dapat: {deskripsi:?}"
        );

        assert_eq!(t.hooks.len(), 1);
        assert!(
            !t.hooks[0].enabled,
            "hook plugin WAJIB mati sampai user menyalakannya"
        );
        assert_eq!(t.hooks[0].id, "plugin:conventional-commits:commit-subject");
        assert!(t.agents.is_empty());

        // The registry now remembers what was written, so disable can undo it.
        let e = read_registry(&u.state);
        assert!(e[0].enabled);
        assert_eq!(e[0].written.len(), 2);
    }

    /// The report a person acts on must be resolvable to a real file: a relative
    /// path alone cannot be opened, so `scope_root` has to name the folder the
    /// `written`/`skipped` entries hang off.
    #[test]
    fn laporan_toggle_menyebut_akar_scope_yang_nyata() {
        let u = Uji::baru("akar-laporan");
        pasang_isi(&u.state, "code-reviewer", cari_paket("code-reviewer").unwrap().1, "bundled").unwrap();

        let t = aktifkan(&u.state, "code-reviewer").unwrap();
        assert_eq!(t.scope, "workspace");
        assert_eq!(
            t.scope_root,
            u.ws.to_string_lossy().replace('\\', "/"),
            "akar laporan harus folder yang dipakai `relatif` (akar workspace)"
        );
        assert!(
            t.written.iter().all(|p| !p.contains(':')),
            "entri relatif, bukan absolut: {:?}",
            t.written
        );
        for p in &t.written {
            let abs = Path::new(&t.scope_root).join(p);
            assert!(abs.exists(), "{} harus benar-benar ada", abs.display());
        }

        let d = nonaktifkan(&u.state, "code-reviewer").unwrap();
        assert_eq!(
            d.scope_root, t.scope_root,
            "disable menyebut akar yang sama supaya entri `written` tetap bisa ditunjuk"
        );
        for p in &d.written {
            assert!(
                !Path::new(&d.scope_root).join(p).exists(),
                "disable harus benar-benar menghapus {p}"
            );
        }
    }

    #[test]
    fn aktifkan_menolak_menimpa_skill_bikinan_sendiri() {
        let u = Uji::baru("bentrok");
        pasang_isi(&u.state, "conventional-commits", cari_paket("conventional-commits").unwrap().1, "bundled").unwrap();

        let skill = u.ws.join(".zephyr/skills/conventional-commits");
        std::fs::create_dir_all(&skill).unwrap();
        std::fs::write(skill.join("SKILL.md"), "milik gua").unwrap();

        let t = aktifkan(&u.state, "conventional-commits").unwrap();
        assert_eq!(t.skipped.len(), 1, "bentrok harus dilaporkan, bukan ditimpa");
        assert_eq!(
            std::fs::read_to_string(skill.join("SKILL.md")).unwrap(),
            "milik gua",
            "berkas user tidak boleh tersentuh"
        );
        // The rule had no clash, so it still landed.
        assert!(u.ws.join(".zephyr/instructions/conventional-commits.md").is_file());
    }

    #[test]
    fn nonaktifkan_menghapus_yang_pernah_ditulis() {
        let u = Uji::baru("nonaktif");
        pasang_isi(&u.state, "code-reviewer", cari_paket("code-reviewer").unwrap().1, "bundled").unwrap();
        aktifkan(&u.state, "code-reviewer").unwrap();
        assert!(u.ws.join(".zephyr/skills/code-review/SKILL.md").is_file());

        let t = nonaktifkan(&u.state, "code-reviewer").unwrap();
        assert!(!t.enabled);
        assert!(!u.ws.join(".zephyr/skills/code-review").exists());
        assert!(
            !u.ws.join(".zephyr/skills").exists(),
            "folder scope yang kosong ikut dibersihkan"
        );
        let e = read_registry(&u.state);
        assert!(!e[0].enabled);
        assert!(e[0].written.is_empty());
        assert!(
            paket_dir(&u.state, "code-reviewer").join("plugin.json").is_file(),
            "nonaktif = lepas kabel, paketnya tetap terpasang"
        );
    }

    #[test]
    fn nonaktifkan_menolak_jalur_di_luar_scope() {
        let u = Uji::baru("luar-scope");
        pasang_isi(&u.state, "code-reviewer", cari_paket("code-reviewer").unwrap().1, "bundled").unwrap();
        aktifkan(&u.state, "code-reviewer").unwrap();

        // Forge a registry row that claims a file outside both scope roots.
        let luar = u.akar.join("penting.txt");
        std::fs::write(&luar, "jangan dihapus").unwrap();
        let mut list = read_registry(&u.state);
        list[0].written.push(luar.to_string_lossy().to_string());
        write_registry(&u.state, &list).unwrap();

        let t = nonaktifkan(&u.state, "code-reviewer").unwrap();
        assert!(luar.is_file(), "berkas di luar scope tidak boleh dihapus");
        assert!(
            t.skipped.iter().any(|s| s.contains("not inside")),
            "penolakan harus dilaporkan: {:?}",
            t.skipped
        );
    }

    #[test]
    fn mcp_url_masuk_settings_dan_dicabut() {
        let u = Uji::baru("mcp");
        let dir = u.akar.join("paket-mcp");
        std::fs::create_dir_all(dir.join("mcp")).unwrap();
        std::fs::write(
            dir.join("plugin.json"),
            r##"{"name": "db-tools", "provides": {"mcp": ["lokal", "berbasis-perintah"]}}"##,
        )
        .unwrap();
        std::fs::write(
            dir.join("mcp/lokal.json"),
            r##"{"label": "Local DB", "url": "http://127.0.0.1:9/mcp", "token": "t"}"##,
        )
        .unwrap();
        std::fs::write(
            dir.join("mcp/berbasis-perintah.json"),
            r##"{"command": "npx", "args": ["-y", "server"]}"##,
        )
        .unwrap();
        pasang_dari(&u.state, &dir, "folder").unwrap();

        let t = aktifkan(&u.state, "db-tools").unwrap();
        assert_eq!(t.mcp, vec!["plugin:db-tools:lokal"]);
        assert!(
            t.warnings.iter().any(|w| w.contains("command-based")),
            "mcp tanpa url harus dilaporkan, bukan didaftarkan: {:?}",
            t.warnings
        );

        let server = daftar_mcp(&u.state);
        assert_eq!(server.len(), 1);
        assert_eq!(server[0]["id"], "plugin:db-tools:lokal");
        assert_eq!(server[0]["url"], "http://127.0.0.1:9/mcp");

        nonaktifkan(&u.state, "db-tools").unwrap();
        assert!(daftar_mcp(&u.state).is_empty(), "server plugin harus dicabut");
    }

    #[test]
    fn hapus_membersihkan_paket_dan_registry() {
        let u = Uji::baru("hapus");
        pasang_isi(&u.state, "conventional-commits", cari_paket("conventional-commits").unwrap().1, "bundled").unwrap();
        aktifkan(&u.state, "conventional-commits").unwrap();

        hapus_plugin(&u.state, "conventional-commits").unwrap();
        assert!(!paket_dir(&u.state, "conventional-commits").exists());
        assert!(read_registry(&u.state).is_empty());
        assert!(
            !u.ws.join(".zephyr/skills/conventional-commits").exists(),
            "hapus harus melepas dulu, bukan meninggalkan skill yatim"
        );
    }

    #[test]
    fn marketplace_konsisten_dan_flag_terpasang() {
        let u = Uji::baru("pasar");
        let pasar = pasar_terpasang(&u.state);
        assert_eq!(pasar.len(), 2);
        assert!(pasar.iter().all(|p| !p.installed));
        assert!(pasar
            .iter()
            .all(|p| !p.description.is_empty() && !p.version.is_empty()));

        pasang_isi(&u.state, "code-reviewer", cari_paket("code-reviewer").unwrap().1, "bundled").unwrap();
        let pasar = pasar_terpasang(&u.state);
        let cr = pasar.iter().find(|p| p.id == "code-reviewer").unwrap();
        assert!(cr.installed);
        assert!(cr.provides.contains(&"agent:reviewer".to_string()));

        let list = daftar_terpasang(&u.state);
        assert_eq!(list.len(), 1);
        assert!(!list[0].missing);
    }

    #[test]
    fn setiap_id_marketplace_punya_paket() {
        for e in index_pasar() {
            assert!(
                cari_paket(&e.id).is_some(),
                "marketplace menyebut '{}' tapi tidak ada paketnya",
                e.id
            );
        }
        for (id, berkas) in PAKET {
            assert!(
                index_pasar().iter().any(|e| &e.id == id),
                "paket '{id}' tidak terdaftar di marketplace.json"
            );
            assert!(
                berkas.iter().any(|(rel, _)| *rel == "plugin.json"),
                "paket '{id}' tidak punya plugin.json"
            );
        }
    }
}
