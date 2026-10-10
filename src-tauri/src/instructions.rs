//! Instructions: coding standards that apply to files matching a pattern.
//!
//! Distinct from the other two customization kinds in WHEN they apply:
//!
//!   * project rules (`AGENTS.md`) are always on, and describe the repository;
//!   * skills are opt-in knowledge the agent opens when a task matches;
//!   * an instruction is attached to a GLOB and applies to the work on files
//!     that match it — TypeScript conventions when editing `.ts`, Terraform
//!     conventions when editing `.tf`.
//!
//! That distinction is the whole feature. An instruction with `applyTo: '**'`
//! behaves like a project rule; one with `applyTo: '**/*.rs'` says nothing
//! until the task touches Rust. Loading every instruction unconditionally would
//! collapse all three into "a pile of text on every request" — which is the
//! thing the reference layout exists to avoid, and why the pattern is read and
//! reported here rather than ignored.
//!
//! TWO LOCATIONS, same rule as skills:
//!   * workspace -> <workspace>/.zephyr/instructions/<name>.md
//!   * global    -> <data_dir>/instructions/<name>.md
//!
//! Frontmatter is the VS Code Copilot shape so the community corpus can be
//! dropped in unchanged:
//!
//! ```text
//! ---
//! description: Ansible conventions
//! applyTo: '**/*.yml, **/*.yaml'
//! ---
//! # Conventions
//! ...
//! ```
//!
//! `applyTo` accepts a comma-separated list, and each entry may use `*`, `**`
//! and `{a,b}` — the forms that appear in the corpus. It is stored VERBATIM and
//! matched on the frontend, where the set of open files lives; this module's job
//! is to read and write the file and report the pattern, not to decide what is
//! open.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

const ISI_MAX: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructionInfo {
    pub name: String,
    pub scope: String,
    pub description: String,
    /// The glob (or comma-separated globs) the instruction applies to. Empty
    /// means the file had no `applyTo`, which the UI shows as "not set" rather
    /// than guessing `**`.
    pub apply_to: String,
    pub path: String,
    pub bytes: u64,
}

/// Instructions live in one flat folder per scope; unlike skills they have no
/// bundled assets, so a folder-per-entry layout would be a folder holding one
/// file.
fn root_global(state: &AppState) -> PathBuf {
    state.data_dir.join("instructions")
}

fn root_workspace(state: &AppState) -> Option<PathBuf> {
    state
        .workspace_path()
        .map(|w| w.join(".zephyr").join("instructions"))
}

/// A name becomes a file name, so it is held to the same rule as a skill name.
fn nama_valid(nama: &str) -> bool {
    !nama.is_empty()
        && nama.len() <= 80
        && !nama.contains("..")
        && !nama.contains('/')
        && !nama.contains('\\')
        && !nama.contains(':')
        && !nama.chars().any(|c| c.is_control())
        && !nama.ends_with('.')
        && !nama.ends_with(' ')
}

/// Read `description:` and `applyTo:` from the frontmatter block.
///
/// Deliberately small: only these two fields exist, and a YAML parser would be a
/// dependency plus a class of edge cases for no gain. A missing block returns
/// empties, which callers treat as "no metadata" rather than as an error.
pub fn parse_instruction(teks: &str) -> (String, String) {
    let t = teks.strip_prefix('\u{feff}').unwrap_or(teks);
    let mut baris = t.lines();
    if baris.next().map(str::trim_end) != Some("---") {
        return (String::new(), String::new());
    }
    let mut desk = String::new();
    let mut apply = String::new();
    for l in baris {
        let s = l.trim();
        if s == "---" {
            break;
        }
        if let Some(v) = s.strip_prefix("description:") {
            desk = bersih(v);
        } else if let Some(v) = s.strip_prefix("applyTo:") {
            apply = bersih(v);
        }
    }
    (desk, apply)
}

/// Strip quotes and the trailing comma that a list form leaves behind.
fn bersih(v: &str) -> String {
    let mut t = v.trim();
    /*
     * `applyTo` also appears as a YAML list:
     *     applyTo: ["*"]
     *     applyTo:
     *       - a glob on its own line
     * The single-line bracketed form is unwrapped here; the multi-line form is
     * left as the `-` marker rather than half-parsed, and the UI shows what was
     * stored. A pattern that is quietly wrong is worse than one that is visibly
     * unparsed — the reader can fix the second.
     */
    if t.starts_with('[') && t.ends_with(']') {
        t = t[1..t.len() - 1].trim();
    }
    let t = t.trim_end_matches(',').trim();
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

fn baca_satu(file: &Path, scope: &str) -> Option<InstructionInfo> {
    let teks = std::fs::read_to_string(file).ok()?;
    let (description, apply_to) = parse_instruction(&teks);
    let name = file
        .file_stem()
        .and_then(|s| s.to_str())?
        .trim_end_matches(".instructions")
        .to_string();
    Some(InstructionInfo {
        name,
        scope: scope.to_string(),
        description,
        apply_to,
        path: file.to_string_lossy().to_string(),
        bytes: std::fs::metadata(file).map(|m| m.len()).unwrap_or(0),
    })
}

fn kumpulkan(root: &Path, scope: &str, hasil: &mut Vec<InstructionInfo>) {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_file() {
            continue;
        }
        let Some(ext) = p.extension() else { continue };
        if !ext.eq_ignore_ascii_case("md") {
            continue;
        }
        if let Some(info) = baca_satu(&p, scope) {
            hasil.push(info);
        }
    }
}

/// Both scopes, workspace first.
///
/// Order matters for the same reason as skills: the prompt lists them in this
/// order, so a workspace instruction of the same name is the one that reads
/// first. Both are returned so the UI can show the shadowed copy and explain why
/// an edit to it changed nothing.
#[tauri::command]
pub fn instructions_list(state: State<AppState>) -> ZResult<Vec<InstructionInfo>> {
    let mut hasil: Vec<InstructionInfo> = Vec::new();
    if let Some(root) = root_workspace(&state) {
        kumpulkan(&root, "workspace", &mut hasil);
    }
    kumpulkan(&root_global(&state), "global", &mut hasil);
    hasil.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(hasil)
}

#[tauri::command]
pub fn instruction_read(state: State<AppState>, name: String) -> ZResult<String> {
    let p = cari_file(&state, &name)?;
    /*
     * The BODY, without the frontmatter block — same reasoning as `skill_read`.
     *
     * Both consumers of this want the instructions, not the metadata: the editor
     * would show `---` and the key/value pairs as if they were part of what the
     * agent is told, and the prompt would inject them into the system message.
     * The metadata is already reported by `instructions_list`, which is where a
     * reader or a form should get it from.
     */
    let teks = std::fs::read_to_string(&p)
        .map_err(|e| ZephyrError::NotFound(format!("cannot read {}: {e}", p.display())))?;
    Ok(buang_frontmatter(&teks).trim().to_string())
}

fn cari_file(state: &AppState, nama: &str) -> ZResult<PathBuf> {
    if !nama_valid(nama) {
        return Err(ZephyrError::InvalidInput(format!(
            "invalid instruction name: '{nama}'"
        )));
    }
    let mut kandidat: Vec<PathBuf> = Vec::new();
    if let Some(root) = root_workspace(state) {
        kandidat.push(root.join(format!("{nama}.md")));
    }
    kandidat.push(root_global(state).join(format!("{nama}.md")));
    for p in kandidat {
        if p.exists() {
            return Ok(p);
        }
    }
    Err(ZephyrError::NotFound(format!("instruction '{nama}' not found")))
}

/// Write one instruction, returning the path written.
#[tauri::command]
pub fn instruction_write(
    state: State<AppState>,
    name: String,
    description: String,
    apply_to: String,
    body: String,
    scope: String,
) -> ZResult<String> {
    if !nama_valid(&name) {
        return Err(ZephyrError::InvalidInput(format!(
            "invalid instruction name: '{name}'"
        )));
    }
    if body.len() as u64 > ISI_MAX {
        return Err(ZephyrError::InvalidInput(format!(
            "instruction body is larger than {} KB",
            ISI_MAX / 1024
        )));
    }
    let root = match scope.as_str() {
        "global" => root_global(&state),
        "workspace" => root_workspace(&state)
            .ok_or_else(|| ZephyrError::InvalidInput("no workspace is open".into()))?,
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "unknown scope: {lain} (expected workspace or global)"
            )))
        }
    };
    if scope == "workspace" {
        state.ensure_writable(&root)?;
    }
    std::fs::create_dir_all(&root)?;

    /*
     * The description is a single line by construction: a newline would end the
     * `key: value` shape and let the body forge extra frontmatter — including an
     * `applyTo` that fires on files this instruction was never meant for.
     */
    let desk = description.replace(['\n', '\r'], " ").trim().to_string();
    let pola = apply_to.replace(['\n', '\r'], " ").trim().to_string();
    let isi_bersih = buang_frontmatter(&body);
    let teks = format!(
        "---\ndescription: {desk}\napplyTo: '{pola}'\n---\n\n{}\n",
        isi_bersih.trim()
    );

    let file = root.join(format!("{name}.md"));
    crate::tulis_aman::tulis_atomik_teks(&file, &teks)?;
    Ok(file.to_string_lossy().to_string())
}

/// Drop a leading frontmatter block from a body the reader pasted in.
///
/// Without this, saving a body that still carried its original header would nest
/// a second one inside the content, and the stored `applyTo` would stop matching
/// what the reader sees in the form.
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

#[tauri::command]
pub fn instruction_delete(state: State<AppState>, name: String) -> ZResult<bool> {
    let p = cari_file(&state, &name)?;
    if p.parent() == root_workspace(&state).as_deref() {
        state.ensure_writable(&p)?;
    }
    match std::fs::remove_file(&p) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(ZephyrError::InvalidInput(format!(
            "cannot delete {}: {e}",
            p.display()
        ))),
    }
}

/* ── The bundled catalog ─────────────────────────────────────────────────── */

/// One entry of the shipped corpus: an instruction from the community
/// collection, ready to install into this workspace or the user scope.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct CatalogInstruction {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, rename = "applyTo")]
    pub apply_to: String,
    #[serde(default)]
    pub source: String,
    pub body: String,
}

/// Same lazy-parse-and-cache shape as `cc_catalog`: the file is ~2.3 MB of
/// embedded JSON and parsing it on every list call would be visible in the UI.
fn katalog_instruksi() -> &'static Vec<CatalogInstruction> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Vec<CatalogInstruction>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let raw = include_str!("../assets/instruction-catalog.json");
        serde_json::from_str(raw).unwrap_or_default()
    })
}

/// The catalog WITHOUT bodies — what the browse list needs.
///
/// Bodies are ~2 MB in total and the list shows a name and a sentence; sending
/// them all over IPC to render a list would be most of a megabyte for text the
/// reader has not asked to see. `instruction_catalog_body` fetches one on
/// demand, which is what the preview pane calls.
#[tauri::command]
pub fn instruction_catalog_list() -> ZResult<Vec<CatalogInstruction>> {
    Ok(katalog_instruksi()
        .iter()
        .map(|e| CatalogInstruction {
            body: String::new(),
            ..e.clone()
        })
        .collect())
}

#[tauri::command]
pub fn instruction_catalog_body(id: String) -> ZResult<String> {
    katalog_instruksi()
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.body.clone())
        .ok_or_else(|| ZephyrError::NotFound(format!("catalog instruction not found: {id}")))
}

/// Install one catalog entry into a scope, returning the path written.
///
/// Goes through the same `instruction_write` path as a hand-typed instruction —
/// including the name check, the size cap and the frontmatter rebuild — so an
/// installed entry is an ordinary instruction afterwards and cannot arrive with
/// a shape the manual path would have refused.
#[tauri::command]
pub fn instruction_install(
    state: State<AppState>,
    id: String,
    scope: String,
) -> ZResult<String> {
    let e = katalog_instruksi()
        .iter()
        .find(|x| x.id == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("catalog instruction not found: {id}")))?;
    instruction_write(
        state,
        e.name.clone(),
        e.description.clone(),
        e.apply_to.clone(),
        e.body.clone(),
        scope,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depan_dibaca() {
        let t = "---\ndescription: Ansible conventions\napplyTo: '**/*.yml, **/*.yaml'\n---\n\n# Judul\n";
        let (d, a) = parse_instruction(t);
        assert_eq!(d, "Ansible conventions");
        assert_eq!(a, "**/*.yml, **/*.yaml");
    }

    #[test]
    fn tanpa_depan_kosong() {
        let (d, a) = parse_instruction("# Tanpa metadata\n");
        assert_eq!(d, "");
        assert_eq!(a, "");
    }

    #[test]
    fn applyto_daftar_dibuka() {
        let (_, a) = parse_instruction("---\napplyTo: ['*']\n---\nx\n");
        assert_eq!(a, "*");
    }

    #[test]
    fn tanda_kutip_dibuang() {
        let (d, a) = parse_instruction(
            "---\ndescription: \"pakai kutip\"\napplyTo: \"**/*.rs\"\n---\nx\n",
        );
        assert_eq!(d, "pakai kutip");
        assert_eq!(a, "**/*.rs");
    }

    #[test]
    fn nama_menolak_path() {
        for buruk in ["../x", "a/b", "a\\b", "C:x", ""] {
            assert!(!nama_valid(buruk), "{buruk} seharusnya ditolak");
        }
    }

    #[test]
    fn nama_menerima_yang_wajar() {
        for baik in ["ansible", "typescript-conventions", "Rust_Rules"] {
            assert!(nama_valid(baik), "{baik} seharusnya diterima");
        }
    }

    #[test]
    fn body_boleh_mengandung_pemisah() {
        let isi = "teks\n---\nbukan metadata\n";
        let hasil = buang_frontmatter(isi);
        assert_eq!(hasil.trim(), isi.trim());
    }

    #[test]
    fn frontmatter_ganda_dibuang() {
        let isi = "---\ndescription: x\n---\n\n# Isi asli\n";
        assert_eq!(buang_frontmatter(isi).trim(), "# Isi asli");
    }
}
