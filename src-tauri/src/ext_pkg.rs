use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::State;

const MAX_ZEXT_BYTES: u64 = 1024 * 1024 * 1024;

const MAX_UNZIP_TOTAL: u64 = 2 * 1024 * 1024 * 1024;

const MAX_CONTRIB_BYTES: u64 = 512 * 1024;

pub const MANIFEST_NATIVE: &str = "zephyr-extension.json";

pub fn id_aman(id: &str) -> bool {
    let t = id.trim();
    if t.is_empty() || t.len() > 128 {
        return false;
    }
    if t.starts_with('.') || t.contains("..") {
        return false;
    }
    t.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

pub fn pastikan_id_aman(id: &str) -> ZResult<()> {
    if id_aman(id) {
        Ok(())
    } else {
        Err(ZephyrError::InvalidInput(format!(
            "invalid extension id: '{id}' (letters, digits, '.', '-' and '_' only)"
        )))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribTheme {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub path: String,

    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribKeymap {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribSnippet {
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribLanguage {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub extensions: Vec<String>,

    #[serde(default)]
    pub cm_lang: String,

    #[serde(default)]
    pub legacy_mode: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribIconTheme {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub path: String,
}

/// One `contributes.debuggers` / `contributes.debugAdapters` entry.
///
/// VS Code's key is `debuggers`; `debugAdapters` is accepted as well so
/// Zephyr's own manifests can say the same thing in the vocabulary the panel
/// uses. Both shapes carry the same fields here.
///
/// `type` is the field that matters: it is the string a `launch.json`
/// configuration names in its own `type`, and the only key Zephyr's debug
/// registry is looked up by (`dap::adapter_bawaan`). `program`/`runtime` are
/// carried because they are what an adapter would have to be launched with —
/// nothing reads them yet, and saying so is the point of the report.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContribDebugger {
    #[serde(rename = "type", default)]
    pub tipe: String,

    #[serde(default)]
    pub label: String,

    #[serde(default)]
    pub program: String,

    #[serde(default)]
    pub runtime: String,

    #[serde(default)]
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Contributes {
    pub themes: Vec<ContribTheme>,
    pub keymaps: Vec<ContribKeymap>,
    pub snippets: Vec<ContribSnippet>,
    pub languages: Vec<ContribLanguage>,
    pub icon_themes: Vec<ContribIconTheme>,

    /// `contributes.debuggers` + `contributes.debugAdapters`, in that order.
    ///
    /// Kept on the manifest (not only in the install report) so the extension
    /// panel can list the adapters a package ships, and so the field survives
    /// the round trip through `serde` instead of being dropped at the parse
    /// step — which is what made this contribution invisible.
    pub debug_adapters: Vec<ContribDebugger>,

    pub commands: Vec<super::extensions::ExtCommand>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtManifest {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub description: String,
    pub icon: String,
    pub categories: Vec<String>,

    pub engine: String,

    pub engine_ok: bool,
    pub main: String,
    pub contributes: Contributes,

    pub raw: Value,

    pub manifest_file: String,
}

fn sf(v: &Value, k: &str) -> String {
    v.get(k)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn arr<'a>(v: &'a Value, a: &str, b: &str) -> Vec<&'a Value> {
    v.get(a)
        .and_then(|c| c.get(b))
        .and_then(|c| c.as_array())
        .map(|x| x.iter().collect())
        .unwrap_or_default()
}

/// Parse a version into its full (major, minor, patch) triple.
///
/// The old local parser in `engine_cocok` stopped after two components, so a
/// bare spec like `"0.1"` compared (major, minor) while a range compared only
/// its first two numbers too - two different notions of "same version" in one
/// function, and a patch-level difference (`0.1.2` vs `0.1.9`) that the range
/// form silently ignored. One parser, one comparison.
fn versi_triple(s: &str) -> (u32, u32, u32) {
    let mut it = s.trim().split('.');
    (
        it.next().and_then(|x| x.parse().ok()).unwrap_or(0),
        it.next().and_then(|x| x.parse().ok()).unwrap_or(0),
        it.next().and_then(|x| x.parse().ok()).unwrap_or(0),
    )
}

fn engine_cocok(spec: &str) -> bool {
    let app = env!("CARGO_PKG_VERSION");
    let (amaj, amin, apat) = versi_triple(app);
    let s = spec.trim();
    if s.is_empty() || s == "*" {
        return true;
    }
    let bersih: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if bersih.is_empty() {
        return true;
    }
    let (rmaj, rmin, rpat) = versi_triple(&bersih);
    let app_t = (amaj, amin, apat);
    let req_t = (rmaj, rmin, rpat);
    if s.starts_with(">=") || s.starts_with('^') || s.starts_with('~') {
        app_t >= req_t
    } else if s.starts_with('>') {
        app_t > req_t
    } else if s.starts_with("<=") {
        app_t <= req_t
    } else if s.starts_with('<') {
        app_t < req_t
    } else {
        // A bare spec is a MAJOR match, which is what "engines": {"zephyr": "0"}
        // means in practice: any 0.x will do. Anything with a minor component
        // compares the full triple so "0.1" no longer accepts 0.1.99.
        if bersih.contains('.') {
            app_t == req_t
        } else {
            amaj == rmaj
        }
    }
}

#[cfg(test)]
mod tests_engine {
    use super::engine_cocok;

    #[test]
    fn bintang_selalu_cocok() {
        assert!(engine_cocok(""));
        assert!(engine_cocok("*"));
    }

    #[test]
    fn mayor_saja_cocok_dengan_mayor_yang_sama() {
        // The app's own major is whatever the crate is; a bare "0" must behave
        // the same way for any minor/patch.
        let app = env!("CARGO_PKG_VERSION");
        let mayor: u32 = app.split('.').next().unwrap().parse().unwrap();
        assert!(engine_cocok(&mayor.to_string()));
        assert!(!engine_cocok(&(mayor + 1).to_string()));
    }

    #[test]
    fn rentang_memakai_triple_penuh() {
        // ">=0.0.0" must always hold for a real app version.
        assert!(engine_cocok(">=0.0.0"));
        // A patch-level bound above the app's own must NOT hold, which the old
        // two-component comparison accepted.
        let app = env!("CARGO_PKG_VERSION");
        let mut it = app.split('.');
        let maj: u32 = it.next().unwrap().parse().unwrap();
        let min: u32 = it.next().unwrap().parse().unwrap();
        let pat: u32 = it.next().unwrap_or("0").parse().unwrap();
        assert!(!engine_cocok(&format!(">{}.{}.{}", maj, min, pat)));
        assert!(engine_cocok(&format!(">={}.{}.{}", maj, min, pat)));
    }
}

fn parse_contributes(ext_id: &str, v: &Value, dir: &Path) -> Contributes {
    let mut c = Contributes::default();

    for t in arr(v, "contributes", "themes") {
        let path = sf(t, "path");
        if path.is_empty() {
            continue;
        }
        c.themes.push(ContribTheme {
            label: {
                let l = sf(t, "label");
                if l.is_empty() {
                    sf(t, "id")
                } else {
                    l
                }
            },
            path,
            kind: {
                let k = sf(t, "kind");
                let u = if k.is_empty() { sf(t, "uiTheme") } else { k };
                if u.to_lowercase().contains("light") {
                    "light".into()
                } else {
                    "dark".into()
                }
            },
        });
    }

    for k in arr(v, "contributes", "keymaps") {
        let path = sf(k, "path");
        if path.is_empty() {
            continue;
        }
        c.keymaps.push(ContribKeymap {
            label: sf(k, "label"),
            path,
        });
    }

    for s in arr(v, "contributes", "snippets") {
        let path = sf(s, "path");
        if path.is_empty() {
            continue;
        }
        c.snippets.push(ContribSnippet {
            language: sf(s, "language"),
            path,
        });
    }

    for l in arr(v, "contributes", "languages") {
        let id = sf(l, "id");
        if id.is_empty() {
            continue;
        }
        c.languages.push(ContribLanguage {
            extensions: l
                .get("extensions")
                .and_then(|e| e.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())
                        .map(|x| x.trim_start_matches('.').to_lowercase())
                        .filter(|x| !x.is_empty())
                        .collect()
                })
                .unwrap_or_default(),
            cm_lang: sf(l, "cmLang"),
            legacy_mode: sf(l, "legacyMode"),
            label: {
                let lb = sf(l, "label");
                if lb.is_empty() {
                    id.clone()
                } else {
                    lb
                }
            },
            id,
        });
    }

    for i in arr(v, "contributes", "iconThemes") {
        let path = sf(i, "path");
        if path.is_empty() {
            continue;
        }
        c.icon_themes.push(ContribIconTheme {
            label: sf(i, "label"),
            path,
        });
    }

    /*
     * Debug adapters.
     *
     * Two keys, because two vocabularies say the same thing: VS Code packages
     * declare `contributes.debuggers`, Zephyr's own manifests can declare
     * `contributes.debugAdapters` (the name the panel uses). Both are read into
     * one list so the report and the panel never have to know which key a
     * package happened to use.
     *
     * An entry with neither `type` nor `label` names nothing, so it is dropped
     * here — the report cannot say anything useful about it, and keeping it
     * would only inflate the count.
     */
    for kunci in ["debuggers", "debugAdapters"] {
        for d in arr(v, "contributes", kunci) {
            let tipe = sf(d, "type");
            let label = sf(d, "label");
            if tipe.is_empty() && label.is_empty() {
                continue;
            }
            c.debug_adapters.push(ContribDebugger {
                tipe,
                label,
                program: sf(d, "program"),
                runtime: sf(d, "runtime"),
                languages: d
                    .get("languages")
                    .and_then(|l| l.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                            .filter(|s| !s.is_empty())
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
    }

    c.commands = crate::extensions::parse_commands_pub(ext_id, v, Some(dir));
    c
}

pub fn read_manifest(dir: &Path) -> ZResult<ExtManifest> {
    let (file, path) = if dir.join(MANIFEST_NATIVE).is_file() {
        (MANIFEST_NATIVE.to_string(), dir.join(MANIFEST_NATIVE))
    } else if dir.join("package.json").is_file() {
        ("package.json".to_string(), dir.join("package.json"))
    } else {
        return Err(ZephyrError::InvalidInput(format!(
            "the folder has neither {MANIFEST_NATIVE} nor package.json"
        )));
    };

    let raw_text = std::fs::read_to_string(&path)?;
    let v: Value = serde_json::from_str(&raw_text)
        .map_err(|e| ZephyrError::InvalidInput(format!("{file} is not valid: {e}")))?;

    let id_manifest = sf(&v, "id");
    let id = if id_manifest.is_empty() {
        let pub_ = sf(&v, "publisher");
        let nm = sf(&v, "name");
        if !pub_.is_empty() && !nm.is_empty() {
            format!("{pub_}.{nm}")
        } else {
            dir.file_name()
                .map(|x| x.to_string_lossy().to_string())
                .unwrap_or_default()
        }
    } else {
        id_manifest
    };

    let engine = v
        .get("engines")
        .and_then(|e| e.get("zephyr"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    Ok(ExtManifest {
        contributes: parse_contributes(&id, &v, dir),
        name: {
            let n = sf(&v, "displayName");
            if n.is_empty() {
                let n2 = sf(&v, "name");
                if n2.is_empty() {
                    id.clone()
                } else {
                    n2
                }
            } else {
                n
            }
        },
        publisher: sf(&v, "publisher"),
        version: sf(&v, "version"),
        description: sf(&v, "description"),
        icon: sf(&v, "icon"),
        categories: v
            .get("categories")
            .and_then(|c| c.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        engine_ok: engine_cocok(&engine),
        engine,
        main: sf(&v, "main"),
        raw: v,
        manifest_file: file,
        id,
    })
}

pub fn resolve_in_ext(root: &Path, rel: &str) -> ZResult<PathBuf> {
    let r = rel.trim().replace('\\', "/");
    let r = r.trim_start_matches("./").to_string();
    let p = Path::new(&r);
    if p.is_absolute() || r.contains(':') {
        return Err(ZephyrError::Permission(format!(
            "the contribution path must be relative: {rel}"
        )));
    }
    for c in p.components() {
        if matches!(c, Component::ParentDir) {
            return Err(ZephyrError::Permission(format!(
                "contribution path must not contain '..': {rel}"
            )));
        }
    }
    let gabung = root.join(p);

    let real = std::fs::canonicalize(&gabung)
        .map_err(|_| ZephyrError::NotFound(format!("contribution file {rel}")))?;
    let real_root = std::fs::canonicalize(root)
        .map_err(|_| ZephyrError::NotFound("extension folder".to_string()))?;
    if !real.starts_with(&real_root) {
        return Err(ZephyrError::Permission(format!(
            "contribution path escapes the extension folder: {rel}"
        )));
    }
    Ok(real)
}

/// One line of an install report: one contribution, and what Zephyr does with it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KontribItem {
    pub kind: String,
    pub label: String,
    pub detail: String,
}

/// What installing a package changes on this side of the app.
///
/// This exists because "Installed" used to be the whole story. A package whose
/// contributions nothing consumes — a theme with `tokenColors` and no `colors`,
/// a bundle of declared commands with no `main` script, a `contributes.menus`
/// block — installed fine, appeared in the list, and moved nothing in the
/// window. `didukung` lists what the app can act on (with the count of colours,
/// icons, bindings, snippet packs as the evidence), `diabaikan` lists what it
/// cannot with the reason, and `ringkasan` is one line per kind: the "what
/// changed" the panel shows after an install and after a delete.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Pengaruh {
    pub didukung: Vec<KontribItem>,
    pub diabaikan: Vec<KontribItem>,
    pub ringkasan: Vec<String>,
}

impl Pengaruh {
    pub fn ada_didukung(&self) -> bool {
        !self.didukung.is_empty()
    }
}

/// First line of the refusal `extensions_install` returns for a package with
/// nothing the app can use. The UI matches on it to tell "this package does
/// nothing here" apart from "this package failed to install".
pub const TOLAK_PENANDA: &str = "NOTHING TO INSTALL:";

/// Top-level `contributes` keys the app reads. Everything else in the block is
/// reported as ignored rather than dropped in silence.
const KONTRIB_DIDUKUNG: &[&str] = &[
    "themes",
    "iconThemes",
    "keymaps",
    "snippets",
    "languages",
    "commands",
];

fn ki(kind: &str, label: &str, detail: String) -> KontribItem {
    KontribItem {
        kind: kind.to_string(),
        label: label.to_string(),
        detail,
    }
}

fn jumlah_nama(n: usize, satu: &str, jamak: &str) -> String {
    if n == 1 {
        satu.to_string()
    } else {
        format!("{n} {jamak}")
    }
}

/// Length of an object or array member, 0 for anything else. The counts in the
/// report (`colors`, `tokenColors`, `iconDefinitions`, `keybindings`) are the
/// evidence the user is asking for, so they are read from the file, not assumed.
fn hitung(v: &Value, k: &str) -> usize {
    match v.get(k) {
        Some(Value::Object(o)) => o.len(),
        Some(Value::Array(a)) => a.len(),
        _ => 0,
    }
}

/// Key bindings a keymap file actually carries.
///
/// The loader (`muatKeymap` in `extLoader.ts`) accepts TWO shapes: a bare array
/// of bindings, and an object wrapping them under `keybindings`. Only the
/// wrapped shape was counted here, so every keymap written as a bare array —
/// which is what all four bundled keymaps are, and what VS Code's own
/// `keybindings.json` is — was reported as "declares 0 key bindings" and
/// REFUSED at install time. The package could never be installed at all.
fn hitung_binding(v: &Value) -> usize {
    match v {
        Value::Array(a) => a.len(),
        _ => hitung(v, "keybindings"),
    }
}

/// Icon definitions the file tree can actually draw.
///
/// `muatIconTheme` (`extLoader.ts`) reads `raw.icons ?? raw` and only draws
/// entries that carry a `glyph`. A VS Code icon theme (`iconDefinitions` +
/// `fileExtensions`) has no `glyph` key anywhere, so counting
/// `iconDefinitions` alone is what let a package be reported as "19 icons"
/// while applying none.
///
/// TWO shapes now count, because both are drawn:
///
///  1. Zephyr's own `{"icons":{".ext":{"glyph","color"}}}`.
///  2. VS Code's `{iconDefinitions, fileExtensions}`, where each definition
///     carries a `fontCharacter` (the glyph from an icon font). `muatIconTheme`
///     decodes that character into the same `glyph` the first shape uses, so a
///     VS Code pack now changes the file tree instead of being refused.
///
/// A VS Code theme that maps extensions to `iconPath` images and has NO
/// `fontCharacter` still counts zero: Zephyr draws a glyph, not an image, and
/// claiming support for one would be the same lie as before.
fn jumlah_ikon_dapat_digambar(v: &Value) -> usize {
    let peta = match v.get("icons") {
        Some(Value::Object(o)) => o,
        _ => match v.as_object() {
            Some(o) => o,
            None => return 0,
        },
    };
    let dari_zephyr = peta
        .values()
        .filter(|e| {
            e.get("glyph")
                .and_then(|g| g.as_str())
                .map(|g| !g.trim().is_empty())
                .unwrap_or(false)
        })
        .count();
    if dari_zephyr > 0 {
        return dari_zephyr;
    }
    jumlah_ikon_vscode(v)
}

/// VS Code icon themes: extensions whose definition has a usable font glyph.
///
/// The count is over `fileExtensions` (one file kind = one drawn icon), and a
/// definition qualifies only when it names a non-empty `fontCharacter`. That is
/// the exact test `muatIconTheme` uses before it registers a glyph.
fn jumlah_ikon_vscode(v: &Value) -> usize {
    let defs = match v.get("iconDefinitions").and_then(|d| d.as_object()) {
        Some(d) => d,
        None => return 0,
    };
    let punya_glyph = |id: &str| -> bool {
        defs.get(id)
            .and_then(|d| d.get("fontCharacter"))
            .and_then(|g| g.as_str())
            .map(|g| !g.trim().is_empty())
            .unwrap_or(false)
    };
    let mut n = 0usize;
    for key in ["fileExtensions", "fileNames"] {
        if let Some(map) = v.get(key).and_then(|m| m.as_object()) {
            n += map.values().filter_map(|x| x.as_str()).filter(|id| punya_glyph(id)).count();
        }
    }
    n
}

/// Read a contribution file inside the package, bounded to the same size
/// `extensions_read_contrib` allows. `None` = missing, oversized, or not JSON,
/// all of which mean "this contributes nothing".
fn baca_json_paket(dir: &Path, rel: &str) -> Option<Value> {
    let p = resolve_in_ext(dir, rel).ok()?;
    if std::fs::metadata(&p).ok()?.len() > MAX_CONTRIB_BYTES {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()
}

/// The script the extension host would run, resolved the way
/// `extensions_read_main` resolves it (bare name → `.js`/`.cjs`/`.mjs`).
fn skrip_utama(dir: &Path, main: &str) -> Option<String> {
    let m = main.trim();
    if m.is_empty() {
        return None;
    }
    if resolve_in_ext(dir, m).is_ok() {
        return Some(m.to_string());
    }
    for akhiran in [".js", ".cjs", ".mjs"] {
        let calon = format!("{m}{akhiran}");
        if resolve_in_ext(dir, &calon).is_ok() {
            return Some(calon);
        }
    }
    None
}

/// Work out what a package on disk can actually do, contribution by
/// contribution, straight from the files it ships.
pub fn pengaruh_paket(dir: &Path, m: &ExtManifest) -> Pengaruh {
    let mut p = Pengaruh::default();
    let c = &m.contributes;

    /*
     * Themes. A VS Code colour theme carries two independent halves: `colors`
     * (the UI - editor background, sidebar, status bar) and `tokenColors` (the
     * code). Zephyr paints the window from `colors`, so a theme with tokens and
     * no UI colours leaves every pixel where it was: "installed, nothing
     * happened". That case is listed as ignored, not counted as a theme.
     */
    let (mut n_tema, mut warna_ui, mut warna_kode) = (0usize, 0usize, 0usize);
    for t in &c.themes {
        let label = if t.label.trim().is_empty() {
            t.path.clone()
        } else {
            t.label.clone()
        };
        match baca_json_paket(dir, &t.path) {
            None => p.diabaikan.push(ki(
                "theme",
                &label,
                format!(
                    "{} is missing, oversized, or not JSON — there is nothing to apply",
                    t.path
                ),
            )),
            Some(v) => {
                let ui = hitung(&v, "colors");
                let kode = hitung(&v, "tokenColors");
                if ui == 0 {
                    p.diabaikan.push(ki(
                        "theme",
                        &label,
                        format!(
                            "{} (tokenColors) and 0 UI colors — the window would look exactly the same",
                            jumlah_nama(kode, "1 code color", "code colors")
                        ),
                    ));
                } else {
                    n_tema += 1;
                    warna_ui += ui;
                    warna_kode += kode;
                    p.didukung.push(ki(
                        "theme",
                        &label,
                        format!(
                            "{} + {}",
                            jumlah_nama(ui, "1 UI color", "UI colors"),
                            jumlah_nama(kode, "1 code color", "code colors")
                        ),
                    ));
                }
            }
        }
    }
    if n_tema > 0 {
        p.ringkasan.push(format!(
            "{}: {} + {}",
            jumlah_nama(n_tema, "1 theme", "themes"),
            jumlah_nama(warna_ui, "1 UI color", "UI colors"),
            jumlah_nama(warna_kode, "1 code color", "code colors")
        ));
    }

    /*
     * Icon themes: only the definitions the file tree can actually draw.
     *
     * Two formats arrive here. Zephyr's own (`{"icons":{".ext":{"glyph","color"}}}`)
     * is what `muatIconTheme` reads; VS Code's (`iconDefinitions` +
     * `fileExtensions`) has no glyph at all and changes no icon. Counting the
     * VS Code key as support was the bug: a package could be reported as
     * "19 icons" and apply none — and a package whose ONLY icon theme was that
     * shape was refused as "0 icon definitions", which is why all four bundled
     * icon themes could never be installed.
     */
    let (mut n_ikon, mut jumlah_ikon) = (0usize, 0usize);
    for i in &c.icon_themes {
        let label = if i.label.trim().is_empty() {
            i.path.clone()
        } else {
            i.label.clone()
        };
        match baca_json_paket(dir, &i.path) {
            None => p.diabaikan.push(ki(
                "iconTheme",
                &label,
                format!(
                    "{} is missing, oversized, or not JSON — the file tree keeps its default icons",
                    i.path
                ),
            )),
            Some(v) => {
                let n_gambar = jumlah_ikon_dapat_digambar(&v);
                let n_vscode = hitung(&v, "iconDefinitions");
                if n_gambar == 0 {
                    /* Say WHY when the file is a real VS Code theme whose icons
                       are IMAGES: "0 icon definitions" reads as a broken
                       package, and it is not — Zephyr draws a glyph, and a
                       theme that only ships PNG/SVG iconPath files has no glyph
                       to draw. A VS Code theme that carries `fontCharacter`
                       glyphs is NOT refused; it is counted above. */
                    if n_vscode > 0 {
                        p.diabaikan.push(ki(
                            "iconTheme",
                            &label,
                            format!(
                                "{} in {} map files to IMAGE paths (iconPath) and carry no fontCharacter glyph, so there is nothing to draw — the file tree keeps its default icons",
                                jumlah_nama(n_vscode, "1 icon definition", "icon definitions"),
                                i.path
                            ),
                        ));
                    } else {
                        p.diabaikan.push(ki(
                            "iconTheme",
                            &label,
                            format!("0 icon definitions in {} — no icon changes", i.path),
                        ));
                    }
                } else {
                    n_ikon += 1;
                    jumlah_ikon += n_gambar;
                    p.didukung
                        .push(ki("iconTheme", &label, format!("{n_gambar} icons")));
                }
            }
        }
    }
    if n_ikon > 0 {
        p.ringkasan.push(format!(
            "{}: {jumlah_ikon} icons",
            jumlah_nama(n_ikon, "1 icon theme", "icon themes")
        ));
    }

    /* Snippet packs: the file has to exist, because the loader reads it. */
    let mut n_snippet = 0usize;
    for s in &c.snippets {
        let label = if s.language.trim().is_empty() {
            s.path.clone()
        } else {
            s.language.clone()
        };
        if resolve_in_ext(dir, &s.path).is_err() {
            p.diabaikan.push(ki(
                "snippet",
                &label,
                format!("the snippet file {} is missing from the package", s.path),
            ));
            continue;
        }
        n_snippet += 1;
        p.didukung.push(ki("snippet", &label, format!("snippet pack {}", s.path)));
    }
    if n_snippet > 0 {
        p.ringkasan
            .push(jumlah_nama(n_snippet, "1 snippet pack", "snippet packs"));
    }

    /* Keymaps: report the number of bindings the file actually carries, in
       either shape the loader accepts (bare array, or `keybindings` wrapper). */
    let (mut n_keymap, mut n_binding) = (0usize, 0usize);
    for k in &c.keymaps {
        let label = if k.label.trim().is_empty() {
            k.path.clone()
        } else {
            k.label.clone()
        };
        match baca_json_paket(dir, &k.path) {
            None => p.diabaikan.push(ki(
                "keymap",
                &label,
                format!(
                    "{} is missing, oversized, or not JSON — no key bindings are added",
                    k.path
                ),
            )),
            Some(v) => {
                let n = hitung_binding(&v);
                if n == 0 {
                    p.diabaikan.push(ki(
                        "keymap",
                        &label,
                        format!("{} declares 0 key bindings", k.path),
                    ));
                } else {
                    n_keymap += 1;
                    n_binding += n;
                    p.didukung
                        .push(ki("keymap", &label, format!("{n} key bindings")));
                }
            }
        }
    }
    if n_keymap > 0 {
        p.ringkasan.push(format!(
            "{}: {n_binding} key bindings",
            jumlah_nama(n_keymap, "1 keymap", "keymaps")
        ));
    }

    /* Language declarations claim file extensions for a language mode. A
       declaration with neither extensions nor a grammar mode claims nothing. */
    let mut n_bahasa = 0usize;
    for l in &c.languages {
        if l.extensions.is_empty() && l.cm_lang.trim().is_empty() {
            p.diabaikan.push(ki(
                "language",
                &l.label,
                "declares no file extensions and no grammar mode — no file is claimed".to_string(),
            ));
            continue;
        }
        n_bahasa += 1;
        let detail = if l.extensions.is_empty() {
            format!("language mode '{}'", l.cm_lang)
        } else {
            format!(
                "claims {}",
                l.extensions
                    .iter()
                    .map(|e| format!(".{e}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            )
        };
        p.didukung.push(ki("language", &l.label, detail));
    }
    if n_bahasa > 0 {
        p.ringkasan
            .push(jumlah_nama(n_bahasa, "1 language", "languages"));
    }

    /*
     * The main script, and the commands that depend on it.
     *
     * `contributes.commands` alone is the case from the bug report: the command
     * ids show up in the palette, but nothing is registered to handle them until
     * a script does it, so the package has no effect. A package that ships the
     * script does have one — the host runs it.
     */
    let skrip = skrip_utama(dir, &m.main);
    let n_perintah = c.commands.len();
    if let Some(s) = &skrip {
        let detail = if n_perintah > 0 {
            format!(
                "{s} runs in the extension host and provides {}",
                jumlah_nama(n_perintah, "1 command", "commands")
            )
        } else {
            format!("{s} runs in the extension host")
        };
        p.didukung.push(ki("script", s, detail));
    } else {
        if !m.main.trim().is_empty() {
            p.diabaikan.push(ki(
                "script",
                &m.main,
                format!(
                    "the declared main script {} is not in the package — nothing runs",
                    m.main
                ),
            ));
        }
        if n_perintah > 0 {
            p.diabaikan.push(ki(
                "command",
                "contributes.commands",
                format!(
                    "{} but nothing registers them: the package ships no main script",
                    jumlah_nama(n_perintah, "1 declared command", "declared commands")
                ),
            ));
        }
    }

    /*
     * Debug adapters: `contributes.debuggers` (VS Code) and
     * `contributes.debugAdapters` (Zephyr's own spelling of the same thing).
     *
     * The honest answer today is "detected, not started", and it has a reason
     * worth writing down rather than a bare "unsupported":
     *
     * Zephyr DOES speak DAP — `dap.rs` runs a real adapter over stdio or TCP —
     * but its registry is FIXED: `dap::adapter_bawaan` answers for exactly two
     * types, `node` (the bundled js-debug) and `python` (debugpy on PATH), and
     * `dap_start` builds the command line from `spec_node`/`spec_python`. No
     * code path reads `program`/`runtime` out of a manifest, so an adapter a
     * package ships is never spawned, no matter how complete the entry is.
     * Claiming otherwise would be the same lie the panel was built to stop.
     *
     * Two shapes get two different reasons, because they are different
     * situations for the user:
     *
     *   - the `type` is one the built-in registry already answers for
     *     (`node`, `python`, ...): launch.json of that type already works, and
     *     it works through the adapter Zephyr ships, not through this package.
     *   - the `type` is anything else: nothing here can run it.
     */
    let mut n_dap_dideklarasikan = 0usize;
    if let Some(obj) = m.raw.get("contributes").and_then(|x| x.as_object()) {
        for kunci in ["debuggers", "debugAdapters"] {
            n_dap_dideklarasikan += match obj.get(kunci) {
                Some(Value::Array(a)) => a.len(),
                Some(Value::Object(o)) => o.len(),
                _ => 0,
            };
        }
    }
    for d in &c.debug_adapters {
        let label = if d.label.trim().is_empty() {
            d.tipe.clone()
        } else {
            d.label.clone()
        };
        let tipe = if d.tipe.trim().is_empty() {
            "(no type)".to_string()
        } else {
            d.tipe.trim().to_string()
        };

        /* What the package would have to be launched with, and whether that
           file is even there. Same evidence standard as the theme/snippet
           checks above: read the package, do not assume. */
        let biner = if d.program.trim().is_empty() {
            if d.runtime.trim().is_empty() {
                "it declares no program to run".to_string()
            } else {
                format!(
                    "it declares runtime \"{}\" and no program, and neither is read",
                    d.runtime
                )
            }
        } else if resolve_in_ext(dir, &d.program).is_ok() {
            format!("the adapter program {} is in the package", d.program)
        } else {
            format!(
                "the declared adapter program {} is not in the package",
                d.program
            )
        };

        let detail = match crate::dap::adapter_bawaan(&d.tipe) {
            Some(bawaan) => format!(
                "type \"{tipe}\" is already served by the built-in {bawaan} adapter Zephyr ships (dap.rs), so launch.json of that type works — but through that adapter, not through this package: {biner}, and an adapter from a package is never started"
            ),
            None => format!(
                "type \"{tipe}\" is not in Zephyr's debug registry, which is fixed (node, python — dap.rs): {biner}, and no code path reads program/runtime from a manifest, so this adapter is detected but never run"
            ),
        };
        p.diabaikan.push(ki("debugAdapter", &label, detail));
    }
    /* Entries the parser dropped because they name neither a type nor a
       label. They are still declared, so they are still counted — silently
       losing them is what this whole report exists to prevent. */
    let n_dap_tak_bernama = n_dap_dideklarasikan.saturating_sub(c.debug_adapters.len());
    if n_dap_tak_bernama > 0 {
        p.diabaikan.push(ki(
            "debugAdapter",
            &format!("contributes.debuggers ({n_dap_tak_bernama})"),
            format!(
                "{} name neither a \"type\" nor a \"label\", so there is nothing to look up in the debug registry",
                jumlah_nama(n_dap_tak_bernama, "1 entry", "entries")
            ),
        ));
    }

    /*
     * Everything else in `contributes`.
     *
     * A VS Code manifest can declare menus, views, configuration, task
     * definitions, TextMate grammars. Zephyr consumes none of them,
     * and the old behaviour was to parse the block, drop the unknown keys, and
     * say nothing. Keys are reported in sorted order so the refusal message for
     * the same package is always the same text.
     */
    let mut n_grammar = 0usize;
    if let Some(obj) = m.raw.get("contributes").and_then(|x| x.as_object()) {
        let mut kunci: Vec<&String> = obj.keys().collect();
        kunci.sort();
        for k in kunci {
            let v = &obj[k];
            if k == "grammars" {
                n_grammar += match v {
                    Value::Array(a) => a.len(),
                    _ => 1,
                };
                continue;
            }
            /* Reported above, per entry, with the reason. */
            if k == "debuggers" || k == "debugAdapters" {
                continue;
            }
            if KONTRIB_DIDUKUNG.contains(&k.as_str()) {
                continue;
            }
            let n = match v {
                Value::Array(a) => a.len(),
                Value::Object(o) => o.len(),
                _ => 1,
            };
            p.diabaikan.push(ki(
                k,
                &format!("contributes.{k}"),
                format!(
                    "{} declared, and Zephyr has no support for contributes.{k} yet",
                    jumlah_nama(n, "1 entry", "entries")
                ),
            ));
        }
        if let Some(ls) = obj.get("languages").and_then(|x| x.as_array()) {
            for l in ls {
                if let Some(g) = l.get("grammars").and_then(|x| x.as_array()) {
                    n_grammar += g.len();
                }
            }
        }
    }
    if n_grammar > 0 {
        p.diabaikan.push(ki(
            "grammar",
            "grammars",
            format!(
                "{} — Zephyr has no TextMate engine, so highlighting stays with the built-in languages",
                jumlah_nama(n_grammar, "1 TextMate grammar", "TextMate grammars")
            ),
        ));
    }

    p
}

/// The refusal message, or `None` when the package has something usable.
pub fn tolak_paket(m: &ExtManifest, p: &Pengaruh) -> Option<String> {
    if p.ada_didukung() {
        return None;
    }
    Some(pesan_tolak(m, p))
}

/// The text shown when a package is declined: what it declares, and why none of
/// it can be applied here.
fn pesan_tolak(m: &ExtManifest, p: &Pengaruh) -> String {
    let nama = if m.name.trim().is_empty() {
        m.id.clone()
    } else {
        m.name.clone()
    };
    let versi = if m.version.trim().is_empty() {
        "?".to_string()
    } else {
        m.version.clone()
    };

    let mut s = format!(
        "{TOLAK_PENANDA} {nama} v{versi} was not installed: nothing in it is something Zephyr can use yet.\nWhat the package declares:\n"
    );
    if p.diabaikan.is_empty() {
        s.push_str("  - no contributions at all (no contributes block, no main script)\n");
    }
    for i in &p.diabaikan {
        s.push_str(&format!("  - {} ({}): {}\n", i.label, i.kind, i.detail));
    }
    s.push_str(&format!(
        "Zephyr {} can apply themes that carry UI colors, icon themes, snippet packs, keymaps, language declarations, and the commands of a package that ships a main script. Nothing else in the list above is read, so installing it would have changed nothing. Nothing was written to disk — fix the package and install it again.",
        env!("CARGO_PKG_VERSION")
    ));
    s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledEntry {
    pub id: String,
    #[serde(default)]
    pub version: String,
    #[serde(default = "yes")]
    pub enabled: bool,

    #[serde(default)]
    pub path: String,
}

fn yes() -> bool {
    true
}

pub fn installed_file(state: &AppState) -> PathBuf {
    crate::extensions::extensions_dir(state).join("installed.json")
}

pub fn read_installed(state: &AppState) -> Vec<InstalledEntry> {
    std::fs::read_to_string(installed_file(state))
        .ok()
        .and_then(|r| serde_json::from_str::<Vec<InstalledEntry>>(&r).ok())
        .unwrap_or_default()
}

pub fn write_installed(state: &AppState, list: &[InstalledEntry]) -> ZResult<()> {
    let dir = crate::extensions::extensions_dir(state);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(installed_file(state), serde_json::to_vec_pretty(list)?)?;
    Ok(())
}

fn upsert_installed(state: &AppState, e: InstalledEntry) -> ZResult<()> {
    let mut list = read_installed(state);
    if let Some(x) = list.iter_mut().find(|x| x.id == e.id) {
        *x = e;
    } else {
        list.push(e);
    }
    write_installed(state, &list)
}

pub(crate) fn copy_dir(src: &Path, dst: &Path, terpakai: &mut u64) -> ZResult<()> {
    std::fs::create_dir_all(dst)?;
    for e in std::fs::read_dir(src)? {
        let e = e?;
        let ft = e.file_type()?;
        let nama = e.file_name();

        let n = nama.to_string_lossy().to_lowercase();
        if n == ".git" || n == "node_modules" || n == "target" {
            continue;
        }
        let ke = dst.join(&nama);
        if ft.is_dir() {
            copy_dir(&e.path(), &ke, terpakai)?;
        } else if ft.is_file() {
            let sz = e.metadata()?.len();
            *terpakai += sz;
            if *terpakai > MAX_UNZIP_TOTAL {
                return Err(ZephyrError::InvalidInput(
                    "extension package too large (>64MB)".into(),
                ));
            }
            std::fs::copy(e.path(), &ke)?;
        }
    }
    Ok(())
}

pub(crate) fn unzip_zext(arsip: &Path, dst: &Path) -> ZResult<()> {
    let sz = std::fs::metadata(arsip)?.len();
    if sz > MAX_ZEXT_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "archive {} MB exceeds the {} MB limit",
            sz / 1024 / 1024,
            MAX_ZEXT_BYTES / 1024 / 1024
        )));
    }
    let f = std::fs::File::open(arsip)?;
    let mut zip = zip::ZipArchive::new(f)
        .map_err(|e| ZephyrError::InvalidInput(format!("not a valid zip archive: {e}")))?;

    std::fs::create_dir_all(dst)?;
    let mut total: u64 = 0;

    for i in 0..zip.len() {
        let mut item = zip
            .by_index(i)
            .map_err(|e| ZephyrError::InvalidInput(format!("corrupt zip entry: {e}")))?;

        let rel = match item.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => {
                return Err(ZephyrError::Permission(format!(
                    "unsafe zip entry rejected: {}",
                    item.name()
                )))
            }
        };
        let tujuan = dst.join(&rel);
        if !tujuan.starts_with(dst) {
            return Err(ZephyrError::Permission(format!(
                "zip entry escapes the destination folder: {}",
                item.name()
            )));
        }

        if item.is_dir() {
            std::fs::create_dir_all(&tujuan)?;
            continue;
        }
        total += item.size();
        if total > MAX_UNZIP_TOTAL {
            return Err(ZephyrError::InvalidInput(
                "archive contents exceed 64MB after extraction".into(),
            ));
        }
        if let Some(p) = tujuan.parent() {
            std::fs::create_dir_all(p)?;
        }
        let mut keluar = std::fs::File::create(&tujuan)?;
        std::io::copy(&mut item, &mut keluar)?;
    }
    Ok(())
}

fn turun_ke_akar(dir: &Path) -> PathBuf {
    if dir.join(MANIFEST_NATIVE).is_file() || dir.join("package.json").is_file() {
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
    if anak.len() == 1 {
        let d = &anak[0];
        if d.join(MANIFEST_NATIVE).is_file() || d.join("package.json").is_file() {
            return d.clone();
        }
    }
    dir.to_path_buf()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallHasil {
    pub id: String,
    pub name: String,
    pub version: String,
    pub path: String,

    pub perlu_reload: bool,
    pub manifest: ExtManifest,

    /// What the package actually changes, and what was skipped because nothing
    /// in the app consumes it. Sent with the install result so the panel can
    /// answer "what changed" instead of only "installed".
    pub pengaruh: Pengaruh,
}

#[tauri::command]
pub fn extensions_install(state: State<AppState>, path: String) -> ZResult<InstallHasil> {
    let asal = PathBuf::from(&path);
    if !asal.exists() {
        return Err(ZephyrError::NotFound(path));
    }

    let dir_ext = crate::extensions::extensions_dir(&state);
    std::fs::create_dir_all(&dir_ext)?;

    let staging = dir_ext.join(format!(".staging-{}", std::process::id()));
    if staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }

    let hasil = (|| -> ZResult<InstallHasil> {
        if asal.is_file() {
            let ext = asal
                .extension()
                .map(|x| x.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if ext == "zext" || ext == "zip" {
                unzip_zext(&asal, &staging)?;
            } else if asal
                .file_name()
                .map(|n| n == MANIFEST_NATIVE || n == "package.json")
                .unwrap_or(false)
            {
                let induk = asal.parent().ok_or_else(|| {
                    ZephyrError::InvalidInput("extension folder not found".into())
                })?;
                let mut n = 0u64;
                copy_dir(induk, &staging, &mut n)?;
            } else {
                return Err(ZephyrError::InvalidInput(
                    "choose an extension folder, a .zext file, or its manifest".into(),
                ));
            }
        } else {
            let mut n = 0u64;
            copy_dir(&asal, &staging, &mut n)?;
        }

        let akar = turun_ke_akar(&staging);
        let man = read_manifest(&akar)?;
        if man.id.trim().is_empty() {
            return Err(ZephyrError::InvalidInput("manifest without an id".into()));
        }
        if !man.engine_ok {
            return Err(ZephyrError::InvalidInput(format!(
                "extension requires Zephyr {} — this version is {}",
                man.engine,
                env!("CARGO_PKG_VERSION")
            )));
        }

        if !id_aman(&man.id) {
            return Err(ZephyrError::InvalidInput(format!(
                "invalid extension id: {}",
                man.id
            )));
        }

        /*
         * Refuse a package that would install and change nothing.
         *
         * This is the whole point of the check: a package whose only
         * contribution is a bundle of declared commands with no script, or a
         * theme with `tokenColors` and no `colors`, used to install, appear in
         * the list as "Installed", and leave the window exactly as it was -
         * with no word about why. The refusal happens BEFORE the folder is
         * moved into place, so a declined package leaves nothing behind, and
         * the message names every contribution the package declares.
         */
        let pengaruh = pengaruh_paket(&akar, &man);
        if let Some(pesan) = tolak_paket(&man, &pengaruh) {
            return Err(ZephyrError::InvalidInput(pesan));
        }

        let final_dir = dir_ext.join(&man.id);
        if final_dir.exists() {
            std::fs::remove_dir_all(&final_dir)?;
        }

        std::fs::rename(&akar, &final_dir).or_else(|_| -> ZResult<()> {
            let mut n = 0u64;
            copy_dir(&akar, &final_dir, &mut n)?;
            Ok(())
        })?;

        let man = read_manifest(&final_dir)?;
        upsert_installed(
            &state,
            InstalledEntry {
                id: man.id.clone(),
                version: man.version.clone(),
                enabled: true,
                path: final_dir.to_string_lossy().to_string(),
            },
        )?;

        Ok(InstallHasil {
            id: man.id.clone(),
            name: man.name.clone(),
            version: man.version.clone(),
            path: final_dir.to_string_lossy().to_string(),

            /*
             * A reload is only worth asking for when something the app can
             * apply actually changes. It used to be "the manifest mentions a
             * theme/keymap/language/icon theme", which was true even when the
             * theme had no UI colours and nothing was applied - a banner asking
             * for a reload that would change nothing.
             */
            perlu_reload: pengaruh.didukung.iter().any(|i| {
                matches!(i.kind.as_str(), "theme" | "iconTheme" | "keymap" | "language")
            }),
            manifest: man,
            pengaruh,
        })
    })();

    let _ = std::fs::remove_dir_all(&staging);
    hasil
}

#[tauri::command]
pub fn extensions_uninstall(state: State<AppState>, id: String) -> ZResult<bool> {
    pastikan_id_aman(&id)?;
    let dir_ext = crate::extensions::extensions_dir(&state);
    let target = dir_ext.join(&id);

    let mut kena = false;
    if target.is_dir() {
        let real = std::fs::canonicalize(&target)?;
        let real_root = std::fs::canonicalize(&dir_ext)?;
        if !real.starts_with(&real_root) {
            return Err(ZephyrError::Permission(
                "extension folder outside the data directory — not deleted".into(),
            ));
        }
        std::fs::remove_dir_all(&real)?;
        kena = true;
    }

    let mut list = read_installed(&state);
    let n = list.len();
    list.retain(|x| x.id != id);
    if list.len() != n {
        write_installed(&state, &list)?;
        kena = true;
    }

    let _ = crate::extensions::registry_lepas(&state, &id);
    Ok(kena)
}

#[tauri::command]
pub fn extensions_set_enabled(state: State<AppState>, id: String, on: bool) -> ZResult<bool> {
    pastikan_id_aman(&id)?;
    let mut list = read_installed(&state);
    if let Some(x) = list.iter_mut().find(|x| x.id == id) {
        x.enabled = on;
    } else {
        list.push(InstalledEntry {
            id: id.clone(),
            version: String::new(),
            enabled: on,
            path: String::new(),
        });
    }
    write_installed(&state, &list)?;
    Ok(on)
}

#[tauri::command]
pub fn extensions_read_contrib(state: State<AppState>, id: String, rel: String) -> ZResult<Value> {
    let dir =
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("extension {id}")))?;
    let file = resolve_in_ext(&dir, &rel)?;
    let sz = std::fs::metadata(&file)?.len();
    if sz > MAX_CONTRIB_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "{rel} is {} KB — 512KB limit",
            sz / 1024
        )));
    }
    let raw = std::fs::read_to_string(&file)?;
    serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::InvalidInput(format!("{rel} is not valid JSON: {e}")))
}

#[tauri::command]
pub fn extensions_read_main(state: State<AppState>, id: String, rel: String) -> ZResult<String> {
    // Size limit for an extension main file. Raised from 1 MB to 20 MB in v1.1.7 so that
    // large extensions can still be loaded; the error message used to not be updated
    // along with it, so the report to the user quoted the wrong number.
    const MAX_MAIN_BYTES: u64 = 20 * 1024 * 1024;
    let dir =
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("extension {id}")))?;
    let file = resolve_in_ext(&dir, &rel).or_else(|e| {
        if !rel.ends_with(".js") && !rel.ends_with(".cjs") {
            resolve_in_ext(&dir, &format!("{rel}.js"))
                .or_else(|_| resolve_in_ext(&dir, &format!("{rel}.cjs")))
                .or(Err(e))
        } else {
            Err(e)
        }
    })?;
    let sz = std::fs::metadata(&file)?.len();
    if sz > MAX_MAIN_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "{rel} is {} KB — {} MB limit",
            sz / 1024,
            MAX_MAIN_BYTES / 1024 / 1024
        )));
    }
    std::fs::read_to_string(&file).map_err(ZephyrError::from)
}

#[tauri::command]
pub fn extensions_read_files(
    state: State<AppState>,
    id: String,
) -> ZResult<HashMap<String, String>> {
    const PER_FILE: u64 = 32 * 1024 * 1024;
    const TOTAL: u64 = 128 * 1024 * 1024;
    const MAX_FILES: usize = 2000;
    const MAX_DEPTH: u32 = 20;

    let dir =
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("extension {id}")))?;
    let mut out = HashMap::new();
    let mut total: u64 = 0;

    fn walk(
        root: &Path,
        dir: &Path,
        depth: u32,
        out: &mut HashMap<String, String>,
        total: &mut u64,
        per_file: u64,
        total_max: u64,
        max_files: usize,
        max_depth: u32,
    ) -> ZResult<()> {
        if depth > max_depth || out.len() >= max_files {
            return Ok(());
        }
        let rd = match std::fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(_) => return Ok(()),
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                walk(
                    root,
                    &p,
                    depth + 1,
                    out,
                    total,
                    per_file,
                    total_max,
                    max_files,
                    max_depth,
                )?;
                continue;
            }
            if out.len() >= max_files || *total >= total_max {
                break;
            }
            let name = e.file_name().to_string_lossy().to_string();
            let lower = name.to_ascii_lowercase();
            if !(lower.ends_with(".js")
                || lower.ends_with(".cjs")
                || lower.ends_with(".mjs")
                || lower.ends_with(".json"))
            {
                continue;
            }
            let sz = match std::fs::metadata(&p) {
                Ok(m) => m.len(),
                Err(_) => continue,
            };
            if sz > per_file {
                continue;
            }
            let rel = p
                .strip_prefix(root)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            if rel.is_empty() {
                continue;
            }
            if let Ok(isi) = std::fs::read_to_string(&p) {
                *total += sz;
                out.insert(rel, isi);
            }
        }
        Ok(())
    }

    walk(
        &dir, &dir, 0, &mut out, &mut total, PER_FILE, TOTAL, MAX_FILES, MAX_DEPTH,
    )?;
    Ok(out)
}

pub fn ext_dir_of(state: &AppState, id: &str) -> Option<PathBuf> {
    let d = crate::extensions::extensions_dir(state).join(id);
    if d.is_dir() {
        return Some(d);
    }
    let dari_tercatat = read_installed(state)
        .into_iter()
        .find(|x| x.id == id)
        .map(|x| PathBuf::from(x.path))
        .filter(|p| p.is_dir());
    if dari_tercatat.is_some() {
        return dari_tercatat;
    }

    /*
     * Folder whose name is not the id.
     *
     * `extensions_manifests` finds a package by reading every folder under the
     * extensions directory, so a package whose FOLDER is named differently from
     * its manifest `id` still appears in the list, enabled. Every command that
     * then reads a contribution by id - `extensions_read_contrib`,
     * `extensions_read_main`, `extensions_read_files`, all of which go through
     * here - looked only at `extensions/<id>` and at `installed.json`, and
     * neither names that folder. The package was listed and its snippets were
     * never read: `not found: extension <id>` on every read, which is what a
     * package like `zephyr-uji.uji30-snippets` (folder `uji30-snippets`) hit.
     *
     * The scan reads each candidate's manifest to compare the real id, so a
     * folder is only accepted when it actually declares this id - guessing from
     * the folder name would hand back the wrong package.
     */
    let dir_ext = crate::extensions::extensions_dir(state);
    let mut kandidat: Vec<PathBuf> = std::fs::read_dir(&dir_ext)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            !p.file_name()
                .map(|n| n.to_string_lossy().starts_with('.'))
                .unwrap_or(false)
        })
        .collect();
    kandidat.sort();
    for p in kandidat {
        if let Ok(m) = read_manifest(&p) {
            if m.id == id {
                return Some(p);
            }
        }
    }
    None
}

#[tauri::command]
pub fn ext_which(runtime: String) -> ZResult<Option<String>> {
    match which::which(&runtime) {
        Ok(p) => Ok(Some(p.to_string_lossy().to_string())),
        Err(_) => Ok(None),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtExecResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,

    pub truncated: bool,
    pub duration_ms: u64,
    pub killed: bool,
}

#[tauri::command]
pub async fn ext_exec(
    state: State<'_, AppState>,
    ext_id: String,
    runtime: String,
    bin: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> ZResult<ExtExecResult> {
    use tokio::io::AsyncReadExt;

    const MAX_OUT: usize = 512 * 1024;

    let settings = crate::settings::read_settings_value(&state);
    let granted = settings
        .get("extensions")
        .and_then(|e| e.get("trust"))
        .and_then(|t| t.get(&ext_id))
        .and_then(|x| x.get("runtimes"))
        .and_then(|r| r.get(&runtime))
        .and_then(|b| b.as_str())
        .unwrap_or("");
    if granted.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "extension {ext_id} has not been granted runtime permission '{runtime}'"
        )));
    }
    if granted != bin {
        return Err(ZephyrError::InvalidInput(format!(
            "runtime path '{runtime}' for extension {ext_id} does not match the permission — request permission again"
        )));
    }

    let workdir = match cwd.filter(|c| !c.trim().is_empty()) {
        Some(raw) => {
            let dir = crate::paths::validate_cwd(std::path::Path::new(&raw))?;
            if let Some(ws) = state.workspace_path() {
                if !crate::paths::is_inside(&ws, &dir) {
                    state.ensure_writable(&dir)?;
                }
            }
            dir
        }
        None => state
            .workspace_path()
            .or_else(|| std::env::var("USERPROFILE").ok().map(Into::into))
            .unwrap_or_else(|| std::path::PathBuf::from(".")),
    };

    let mut child = match crate::proc::tokio_cmd(&bin)
        .args(&args)
        .current_dir(&workdir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return Err(ZephyrError::InvalidInput(format!(
                "failed to run {bin}: {e}"
            )));
        }
    };

    let mut stdout = child.stdout.take().expect("stdout piped");
    let mut stderr = child.stderr.take().expect("stderr piped");
    let t0 = std::time::Instant::now();

    async fn baca_capped<R: AsyncReadExt + Unpin>(r: &mut R, cap: usize) -> (String, bool) {
        let mut out = String::new();
        let mut buf = [0u8; 4096];
        let mut truncated = false;
        loop {
            match r.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if out.len() + n > cap {
                        truncated = true;
                        break;
                    }

                    out.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
            }
        }
        (out, truncated)
    }

    let (so, se) = tokio::join!(
        baca_capped(&mut stdout, MAX_OUT),
        baca_capped(&mut stderr, MAX_OUT)
    );
    let mut truncated = so.1 || se.1;

    let ms = timeout_ms.unwrap_or(60_000).max(1_000);
    let (code, killed) = match tokio::time::timeout(Duration::from_millis(ms), child.wait()).await {
        Ok(st) => (st.ok().and_then(|s| s.code()), false),
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            truncated = true;
            (None, true)
        }
    };

    Ok(ExtExecResult {
        code,
        stdout: so.0,
        stderr: se.0,
        truncated,
        duration_ms: t0.elapsed().as_millis() as u64,
        killed,
    })
}

#[tauri::command]
pub fn extensions_manifests(state: State<AppState>) -> ZResult<Vec<ExtManifestStatus>> {
    let installed = read_installed(&state);
    let dir_ext = crate::extensions::extensions_dir(&state);

    let mut dirs: Vec<PathBuf> = std::fs::read_dir(&dir_ext)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .filter(|p| {
                    !p.file_name()
                        .map(|n| n.to_string_lossy().starts_with('.'))
                        .unwrap_or(false)
                })
                .collect()
        })
        .unwrap_or_default();
    for e in &installed {
        let p = PathBuf::from(&e.path);
        if p.is_dir() && !dirs.contains(&p) {
            dirs.push(p);
        }
    }
    dirs.sort();
    dirs.dedup();

    let mut out = Vec::new();
    let mut id_terlihat: std::collections::HashSet<String> = std::collections::HashSet::new();
    for d in dirs {
        match read_manifest(&d) {
            Ok(m) => {
                /*
                 * One manifest per id.
                 *
                 * A bundled package lives twice on disk: the source copy under
                 * `extensions/.bundled/<id>` and the installed copy under
                 * `extensions/<id>`. Both are readable, and when an entry in
                 * installed.json pointed at the `.bundled` path the loader
                 * returned two manifests with the same id — which is how a
                 * single theme showed up twice in the picker. First one wins,
                 * and `dirs` is sorted so the installed copy (no leading dot)
                 * is the one kept.
                 */
                if !id_terlihat.insert(m.id.clone()) {
                    continue;
                }
                let ent = installed.iter().find(|x| x.id == m.id);

                let icon_bytes: Option<Vec<u8>> = if m.icon.is_empty() {
                    ["icon.png", "icon.svg", "icon.gif"]
                        .iter()
                        .find(|fb| d.join(fb).is_file())
                        .and_then(|fb| std::fs::read(d.join(fb)).ok())
                } else {
                    resolve_in_ext(&d, &m.icon)
                        .ok()
                        .and_then(|p| std::fs::read(p).ok())
                };
                let icon_data = icon_bytes.and_then(|b| {
                    use base64::Engine;
                    let mime = if b.starts_with(b"<svg") {
                        "image/svg+xml"
                    } else {
                        "image/png"
                    };
                    if b.len() > 256 * 1024 {
                        None
                    } else {
                        Some(format!(
                            "data:{mime};base64,{}",
                            base64::engine::general_purpose::STANDARD.encode(b)
                        ))
                    }
                });
                out.push(ExtManifestStatus {
                    enabled: ent.map(|x| x.enabled).unwrap_or(false),
                    tercatat: ent.is_some(),
                    path: d.to_string_lossy().to_string(),
                    error: None,
                    pengaruh: pengaruh_paket(&d, &m),
                    manifest: Some(m),
                    icon_path: icon_data,
                });
            }
            Err(e) => out.push(ExtManifestStatus {
                enabled: false,
                tercatat: false,
                path: d.to_string_lossy().to_string(),
                error: Some(e.to_string()),
                pengaruh: Pengaruh::default(),
                manifest: None,
                icon_path: None,
            }),
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtManifestStatus {
    pub manifest: Option<ExtManifest>,
    pub enabled: bool,

    pub tercatat: bool,
    pub path: String,
    pub error: Option<String>,

    /// What this package can do here.
    ///
    /// Carried on every status, not only on install results, because the
    /// install-time check cannot reach packages that were installed before it
    /// existed: those still sit in the list looking exactly like a working
    /// package while applying nothing. With this field the panel can say so.
    pub pengaruh: Pengaruh,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
}

/// Registry hosts a download may come from. Kept as a named constant so the
/// refusal message and the check can never drift apart, and so a test can hold
/// them still: loosening the list has to be a deliberate edit here.
pub const IZIN_UNDUH: &[&str] = &["open-vsx.org", "www.open-vsx.org"];

/// The gate for `extensions_download_zext`: https only, and only the trusted
/// registry. Pulled out of the command so it can be tested without an app and
/// without a network - the command itself needs Tauri state and a live socket,
/// this does not.
pub fn izin_unduh(url: &str) -> ZResult<()> {
    let host = url.split('/').nth(2).unwrap_or("").to_lowercase();
    if !url.starts_with("https://") || !IZIN_UNDUH.contains(&host.as_str()) {
        return Err(ZephyrError::Permission(
            "extension downloads are only allowed from a trusted registry (open-vsx.org)".into(),
        ));
    }
    Ok(())
}

/// sha256 of a byte slice, lowercase hex. The registry publishes the hash of the
/// package it serves; this is how a package that arrived truncated or swapped is
/// caught before it is written to disk.
pub fn hash_sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Normalise a hash for comparison: trim, lowercase, drop a `sha256:` prefix.
pub fn normalisasi_hash(h: &str) -> String {
    let t = h.trim().to_lowercase();
    t.strip_prefix("sha256:")
        .unwrap_or(t.as_str())
        .trim()
        .to_string()
}

/// Does the downloaded hash match the expected one? An empty expectation means
/// "no hash to check against" and passes - absence of a published hash is not a
/// mismatch.
pub fn hash_cocok(dapat: &str, harap: &str) -> bool {
    let h = normalisasi_hash(harap);
    if h.is_empty() {
        return true;
    }
    normalisasi_hash(dapat) == h
}

#[tauri::command(async)]
pub fn extensions_download_zext(url: String, id: String, sha256: Option<String>) -> ZResult<String> {
    izin_unduh(&url)?;

    if !id_aman(&id) {
        return Err(ZephyrError::InvalidInput(format!("invalid id: {id}")));
    }

    let dir_tmp = std::env::temp_dir().join("zephyr-ext");
    std::fs::create_dir_all(&dir_tmp)?;
    // Named `.zext` whatever the registry calls it. A registry may still serve
    // the VS Code package format, and that is fine — it is the same zip — but
    // the file on disk is ours, so nothing downstream has to know which it was.
    let tujuan = dir_tmp.join(format!("{id}.zext"));

    let r = ureq::get(&url)
        .config()
        .timeout_global(Some(Duration::from_secs(120)))
        .http_status_as_error(false)
        .build()
        .header("Accept", "application/octet-stream")
        .header("User-Agent", "Zephyr-Editor/1.0")
        .call()
        .map_err(|e| ZephyrError::Git(format!("failed to download .zext: {e}")))?;

    if r.status().as_u16() != 200 {
        return Err(ZephyrError::Git(format!(
            "registry menjawab {} saat mengunduh .zext",
            r.status().as_u16()
        )));
    }

    let bytes = r
        .into_body()
        .with_config()
        .limit(MAX_ZEXT_BYTES)
        .read_to_vec()
        .map_err(|e| ZephyrError::Git(format!("failed to read download: {e}")))?;
    if bytes.len() as u64 > MAX_ZEXT_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            ".zext exceeds the {} MB limit",
            MAX_ZEXT_BYTES / 1024 / 1024
        )));
    }
    if bytes.is_empty() {
        return Err(ZephyrError::InvalidInput(".zext empty".into()));
    }

    // Verify the registry's own hash BEFORE the byte is written to disk, so a
    // truncated or swapped package never becomes a file that the installer
    // could pick up later. An absent hash means the registry did not publish
    // one: not a mismatch, and the file still gets written.
    let dapat = hash_sha256(&bytes);
    if let Some(harap) = &sha256 {
        if !hash_cocok(&dapat, harap) {
            return Err(ZephyrError::InvalidInput(format!(
                "sha256 mismatch for {id}: got {dapat}, expected {} - nothing was written",
                normalisasi_hash(harap)
            )));
        }
    }
    std::fs::write(&tujuan, &bytes)?;

    Ok(tujuan.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_aman_menolak_escape() {
        assert!(!id_aman("C:evil"));
        assert!(!id_aman("foo/bar"));
        assert!(!id_aman("foo\\bar"));
        assert!(!id_aman(".."));
        assert!(!id_aman("a..b"));
        assert!(!id_aman(".hidden"));
        assert!(!id_aman(""));
        assert!(!id_aman("nama dengan spasi"));
        assert!(!id_aman("weird:name"));
        assert!(pastikan_id_aman("../installed").is_err());
        assert!(pastikan_id_aman("folder/extension").is_err());
    }

    #[test]
    fn id_aman_menerima_bentuk_wajar() {
        assert!(id_aman("my-extension"));
        assert!(id_aman("publisher.ext_name"));
        assert!(id_aman("Ext123"));
    }
}

#[cfg(test)]
mod tests_pengaruh {
    use super::*;
    use serde_json::json;

    fn dir_uji(nama: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("zephyr-pengaruh-{}-{nama}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn tulis(dir: &Path, rel: &str, isi: &str) {
        let p = dir.join(rel);
        if let Some(i) = p.parent() {
            std::fs::create_dir_all(i).unwrap();
        }
        std::fs::write(&p, isi).unwrap();
    }

    fn muat(dir: &Path, manifest: &Value) -> (ExtManifest, Pengaruh) {
        tulis(dir, MANIFEST_NATIVE, &manifest.to_string());
        let m = read_manifest(dir).expect("the test manifest must parse");
        let p = pengaruh_paket(dir, &m);
        (m, p)
    }

    /// A package that only declares commands, with no script to register them,
    /// has no effect on this app: it must be refused before anything is written
    /// to disk, and the refusal must name what the package declares.
    #[test]
    fn paket_nol_kontribusi_didukung_ditolak() {
        let d = dir_uji("nol-kontribusi");
        let (m, p) = muat(
            &d,
            &json!({
                "name": "dead-commands",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": {
                    "commands": [
                        { "command": "acme.x", "title": "X" },
                        { "command": "acme.y", "title": "Y" }
                    ]
                }
            }),
        );

        assert!(
            p.didukung.is_empty(),
            "nothing here can be applied: {:?}",
            p.didukung
        );
        assert!(
            p.diabaikan.iter().any(|i| i.kind == "command"),
            "the declared commands must be reported, not dropped: {:?}",
            p.diabaikan
        );

        let tolak = tolak_paket(&m, &p).expect("a package with nothing usable must be refused");
        assert!(tolak.starts_with(TOLAK_PENANDA), "{tolak}");
        assert!(tolak.contains("2 declared commands"), "{tolak}");
        assert!(tolak.contains("contributes.commands"), "{tolak}");
        assert!(tolak.contains("Nothing was written to disk"), "{tolak}");
    }

    /// The other half of the same hole: a theme with code colors and no UI
    /// colors installs, appears in the list, and repaints nothing.
    #[test]
    fn tema_tanpa_warna_ui_ditolak_bila_itu_satu_satunya_isi() {
        let d = dir_uji("tema-token-saja");
        tulis(
            &d,
            "themes/t.json",
            &json!({ "tokenColors": [{ "scope": "a" }, { "scope": "b" }] }).to_string(),
        );
        let (m, p) = muat(
            &d,
            &json!({
                "name": "token-only",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": {
                    "themes": [{ "label": "Tokens Only", "path": "./themes/t.json" }]
                }
            }),
        );

        assert!(p.didukung.is_empty(), "{:?}", p.didukung);
        let i = p
            .diabaikan
            .iter()
            .find(|i| i.kind == "theme")
            .expect("the theme must be reported as ignored");
        assert!(i.detail.contains("0 UI colors"), "{}", i.detail);
        let tolak = tolak_paket(&m, &p).expect("a theme that changes nothing is not an install");
        assert!(tolak.contains("Tokens Only"), "{tolak}");
    }

    /// A mixed package installs, and the parts nothing consumes come back in
    /// `diabaikan` instead of vanishing.
    #[test]
    fn paket_campuran_mengisi_daftar_diabaikan() {
        let d = dir_uji("campuran");
        tulis(
            &d,
            "themes/mix.json",
            &json!({
                "colors": { "editor.background": "#101010" },
                "tokenColors": [{ "scope": "a" }, { "scope": "b" }]
            })
            .to_string(),
        );
        tulis(&d, "snippets/rust.json", "{\"Print\": {\"prefix\": \"pp\"}}");

        let (m, p) = muat(
            &d,
            &json!({
                "name": "mixed",
                "publisher": "acme",
                "version": "2.0.0",
                "contributes": {
                    "themes": [{ "label": "Mixed Dark", "path": "./themes/mix.json" }],
                    "snippets": [{ "language": "rust", "path": "./snippets/rust.json" }],
                    "languages": [{
                        "id": "rust",
                        "extensions": [".rs"],
                        "grammars": [{
                            "language": "rust",
                            "scopeName": "source.rust",
                            "path": "./syntaxes/rust.tmLanguage.json"
                        }]
                    }],
                    "menus": { "editor/context": [{ "command": "acme.x" }] },
                    "configuration": {
                        "title": "x",
                        "properties": { "acme.on": { "type": "boolean" } }
                    }
                }
            }),
        );

        assert!(p.ada_didukung(), "the theme alone makes this installable");
        assert!(
            p.didukung.iter().any(|i| i.kind == "theme")
                && p.didukung.iter().any(|i| i.kind == "snippet")
                && p.didukung.iter().any(|i| i.kind == "language"),
            "theme + snippet + language: {:?}",
            p.didukung
        );
        assert!(
            p.diabaikan.iter().any(|i| i.kind == "menus"),
            "menus are not consumed: {:?}",
            p.diabaikan
        );
        assert!(
            p.diabaikan.iter().any(|i| i.kind == "configuration"),
            "{:?}",
            p.diabaikan
        );
        /*
         * The count appears once: `jumlah_nama` writes the number itself, and a
         * plural that carries its own copy produced "2 2 declared commands" and
         * "3 3 TextMate grammars".
         */
        for (k, awal) in [
            ("menus", "1 entry declared"),
            ("configuration", "2 entries declared"),
        ] {
            let i = p.diabaikan.iter().find(|i| i.kind == k).expect("entry");
            assert!(
                i.detail.starts_with(awal),
                "{k}: the count must appear once, got: {}",
                i.detail
            );
        }
        assert!(
            p.diabaikan.iter().any(|i| i.kind == "grammar"),
            "TextMate grammars have no engine: {:?}",
            p.diabaikan
        );
        let g = p
            .diabaikan
            .iter()
            .find(|i| i.kind == "grammar")
            .expect("grammar entry");
        assert!(
            g.detail.starts_with("1 TextMate grammar —"),
            "the count must appear once, got: {}",
            g.detail
        );
        assert!(
            tolak_paket(&m, &p).is_none(),
            "a package with one usable theme must install"
        );
        assert!(
            p.ringkasan.iter().any(|r| r == "1 theme: 1 UI color + 2 code colors"),
            "{:?}",
            p.ringkasan
        );
    }

    /// A normal package: everything it declares is counted, nothing is skipped,
    /// and the summary reads as the numbers the user asked to see.
    #[test]
    fn paket_normal_lulus_dengan_ringkasan_yang_diminta() {
        let d = dir_uji("normal");

        let colors: serde_json::Map<String, Value> = (0..12)
            .map(|i| (format!("ui.k{i}"), Value::String(format!("#00000{i}"))))
            .collect();
        let tokens: Vec<Value> = (0..11)
            .map(|i| json!({ "scope": format!("s{i}"), "settings": { "foreground": "#ffffff" } }))
            .collect();
        tulis(
            &d,
            "themes/t.json",
            &json!({ "colors": colors, "tokenColors": tokens }).to_string(),
        );

        let ikon: serde_json::Map<String, Value> = (0..19)
            .map(|i| {
                (
                    format!("i{i}"),
                    json!({ "glyph": "xy", "color": "#ffffff" }),
                )
            })
            .collect();
        tulis(&d, "icons/i.json", &json!({ "icons": ikon }).to_string());

        let bindings: Vec<Value> = (0..7)
            .map(|i| json!({ "key": format!("ctrl+{i}"), "command": format!("acme.c{i}") }))
            .collect();
        tulis(&d, "keymaps/k.json", &json!({ "keybindings": bindings }).to_string());

        tulis(&d, "snippets/r.json", "{\"Print\": {\"prefix\": \"pp\"}}");
        tulis(&d, "extension.js", "module.exports = {};");

        let (m, p) = muat(
            &d,
            &json!({
                "name": "normal",
                "publisher": "acme",
                "version": "3.1.4",
                "main": "./extension.js",
                "contributes": {
                    "themes": [{ "label": "Normal Dark", "path": "./themes/t.json" }],
                    "iconThemes": [{ "label": "Normal Icons", "path": "./icons/i.json" }],
                    "keymaps": [{ "label": "Normal Keys", "path": "./keymaps/k.json" }],
                    "snippets": [{ "language": "rust", "path": "./snippets/r.json" }],
                    "languages": [{ "id": "rust", "extensions": [".rs"] }],
                    "commands": [{ "command": "acme.x", "title": "X" }]
                }
            }),
        );

        assert!(
            p.diabaikan.is_empty(),
            "nothing in a normal package is ignored: {:?}",
            p.diabaikan
        );
        assert_eq!(p.didukung.len(), 6, "{:?}", p.didukung);
        assert!(tolak_paket(&m, &p).is_none());
        let s = p
            .didukung
            .iter()
            .find(|i| i.kind == "script")
            .expect("script entry");
        assert!(
            s.detail.ends_with("provides 1 command"),
            "the count must appear once, got: {}",
            s.detail
        );

        for baris in [
            "1 theme: 12 UI colors + 11 code colors",
            "1 icon theme: 19 icons",
            "1 keymap: 7 key bindings",
            "1 snippet pack",
            "1 language",
        ] {
            assert!(
                p.ringkasan.iter().any(|r| r == baris),
                "missing summary line '{baris}' in {:?}",
                p.ringkasan
            );
        }
    }

    /// A package with a main script does have an effect even with no
    /// contributions: the extension host runs it.
    #[test]
    fn paket_dengan_skrip_utama_tidak_ditolak() {
        let d = dir_uji("skrip");
        tulis(&d, "extension.js", "module.exports = {};");

        let (m, p) = muat(
            &d,
            &json!({
                "name": "script-pkg",
                "publisher": "acme",
                "version": "1.0.0",
                "main": "./extension.js",
                "contributes": { "commands": [{ "command": "acme.x", "title": "X" }] }
            }),
        );

        assert!(
            p.didukung.iter().any(|i| i.kind == "script"),
            "{:?}",
            p.didukung
        );
        assert!(
            p.diabaikan.is_empty(),
            "a package whose script runs has nothing to apologise for: {:?}",
            p.diabaikan
        );
        assert!(tolak_paket(&m, &p).is_none());
    }

    /// A package that ships a debug adapter used to be invisible: `debuggers`
    /// was in the "unknown keys" bucket and was reported as a bare
    /// "contributes.debuggers — no support yet" line, with the adapter's own
    /// `type` never looked at. Now each entry is named and judged against the
    /// debug registry that actually exists (`dap::adapter_bawaan`), and the
    /// reason says WHY it is not started: the registry is fixed, so an adapter
    /// from a package is never spawned.
    #[test]
    fn adapter_debug_dilaporkan_dengan_alasan_yang_nyata() {
        let d = dir_uji("debuggers");
        tulis(&d, "themes/mix.json", &json!({ "colors": { "ui.bg": "#101010" } }).to_string());
        /* The adapter the package claims to ship. It is really there, so the
           reason cannot be "the file is missing" — the reason has to be the
           one that is actually true. */
        tulis(&d, "debug/my-adapter.js", "module.exports = {};");

        let (m, p) = muat(
            &d,
            &json!({
                "name": "dap-pack",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": {
                    "themes": [{ "label": "Mixed Dark", "path": "./themes/mix.json" }],
                    "debuggers": [
                        {
                            "type": "acme-dap",
                            "label": "Acme Debugger",
                            "program": "./debug/my-adapter.js",
                            "languages": ["acme"]
                        },
                        { "type": "node", "label": "Acme Node" }
                    ]
                }
            }),
        );

        /* The theme alone makes it installable: a debug adapter is not counted
           as something Zephyr can apply, because nothing starts it. */
        assert!(
            p.didukung.iter().any(|i| i.kind == "theme"),
            "{:?}",
            p.didukung
        );
        assert!(
            !p.didukung.iter().any(|i| i.kind == "debugAdapter"),
            "an adapter that is never started must not be counted as applied: {:?}",
            p.didukung
        );

        let entri: Vec<&KontribItem> = p
            .diabaikan
            .iter()
            .filter(|i| i.kind == "debugAdapter")
            .collect();
        assert_eq!(entri.len(), 2, "one line per declared adapter: {:?}", p.diabaikan);

        /* The generic "unknown key" line must be gone: this key is understood
           now, so it is reported by name, not as an unsupported block. */
        assert!(
            !p.diabaikan
                .iter()
                .any(|i| i.kind == "debuggers" || i.label == "contributes.debuggers"),
            "debuggers is no longer an unknown key: {:?}",
            p.diabaikan
        );

        let acme = entri
            .iter()
            .find(|i| i.label == "Acme Debugger")
            .expect("the labelled adapter");
        assert!(acme.detail.contains("acme-dap"), "{}", acme.detail);
        assert!(
            acme.detail.contains("is not in Zephyr's debug registry"),
            "an unknown type must say so: {}",
            acme.detail
        );
        assert!(
            acme.detail.contains("debug/my-adapter.js is in the package"),
            "the report reads the package instead of guessing: {}",
            acme.detail
        );
        assert!(
            acme.detail.contains("never run"),
            "the reason has to be that it is not started: {}",
            acme.detail
        );

        let node = entri
            .iter()
            .find(|i| i.label == "Acme Node")
            .expect("the entry with a known type");
        assert!(
            node.detail.contains("built-in node adapter"),
            "a type the registry already answers for must say so: {}",
            node.detail
        );
        assert!(
            node.detail.contains("not through this package"),
            "and must not let the package claim it: {}",
            node.detail
        );

        /* The refusal message (when the package has nothing else) carries the
           same reasons, so "nothing to install" is never silent about why. */
        let (m2, p2) = muat(
            &dir_uji("debuggers-saja"),
            &json!({
                "name": "dap-only",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": { "debuggers": [{ "type": "acme-dap", "label": "Only DAP" }] }
            }),
        );
        let tolak = tolak_paket(&m2, &p2).expect("a package that only ships an adapter changes nothing here");
        assert!(tolak.contains("Only DAP"), "{tolak}");
        assert!(tolak.contains("debugAdapter"), "{tolak}");
        assert!(!m2.contributes.debug_adapters.is_empty());
    }

    /// `debugAdapters` is Zephyr's own spelling of the same contribution, and
    /// both keys land in one list — so a manifest written either way shows up
    /// in the panel instead of only the VS Code one.
    #[test]
    fn debug_adapters_dan_debuggers_mendarat_di_satu_daftar() {
        let d = dir_uji("debug-adapters-kunci");
        tulis(&d, "themes/t.json", &json!({ "colors": { "ui.bg": "#101010" } }).to_string());

        let (m, p) = muat(
            &d,
            &json!({
                "name": "both-keys",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": {
                    "themes": [{ "label": "T", "path": "./themes/t.json" }],
                    "debuggers": [{ "type": "vscode-style", "label": "VS Code Style" }],
                    "debugAdapters": [
                        { "type": "zephyr-style", "label": "Zephyr Style", "runtime": "node" }
                    ]
                }
            }),
        );

        assert_eq!(
            m.contributes.debug_adapters.len(),
            2,
            "both keys are read: {:?}",
            m.contributes.debug_adapters
        );
        assert_eq!(m.contributes.debug_adapters[0].tipe, "vscode-style");
        assert_eq!(m.contributes.debug_adapters[1].tipe, "zephyr-style");
        assert_eq!(m.contributes.debug_adapters[1].runtime, "node");

        let entri: Vec<&KontribItem> = p
            .diabaikan
            .iter()
            .filter(|i| i.kind == "debugAdapter")
            .collect();
        assert_eq!(entri.len(), 2, "{:?}", p.diabaikan);
        assert!(
            entri.iter().any(|i| i.detail.contains("runtime \"node\"")),
            "a declared runtime with no program is reported as such: {:?}",
            entri
        );
    }

    /// An entry that names neither a type nor a label is dropped from the list
    /// (there is nothing to look up) but is still COUNTED, so a manifest can
    /// never declare something the panel is silent about.
    #[test]
    fn entri_debugger_tanpa_nama_tetap_dihitung() {
        let d = dir_uji("debugger-tanpa-nama");
        tulis(&d, "themes/t.json", &json!({ "colors": { "ui.bg": "#101010" } }).to_string());

        let (m, p) = muat(
            &d,
            &json!({
                "name": "nameless",
                "publisher": "acme",
                "version": "1.0.0",
                "contributes": {
                    "themes": [{ "label": "T", "path": "./themes/t.json" }],
                    "debuggers": [{ "program": "./x.js" }, { "type": "acme-dap", "label": "Named" }]
                }
            }),
        );

        assert_eq!(m.contributes.debug_adapters.len(), 1, "one entry names something");
        let entri: Vec<&KontribItem> = p
            .diabaikan
            .iter()
            .filter(|i| i.kind == "debugAdapter")
            .collect();
        assert_eq!(
            entri.len(),
            2,
            "the nameless entry is reported too: {:?}",
            p.diabaikan
        );
        assert!(
            entri
                .iter()
                .any(|i| i.detail.contains("name neither a \"type\" nor a \"label\"")),
            "{:?}",
            entri
        );
    }
}

/// The download path, tested where it can be tested without an app: the URL
/// gate and the hash check are pure, and the archive -> extract -> "what
/// changed" chain only needs the filesystem. `extensions_download_zext` itself
/// needs Tauri state and a live socket, so it is NOT covered here (BUTUH APP);
/// what it calls is.
#[cfg(test)]
mod tests_unduh {
    use super::*;
    use serde_json::json;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::CompressionMethod;

    fn dir_uji(nama: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("zephyr-unduh-{}-{nama}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// A stored (uncompressed) .zext, so this test does not depend on a codec.
    fn tulis_zext(tujuan: &Path, berkas: &[(&str, &str)]) {
        let f = std::fs::File::create(tujuan).unwrap();
        let mut z = zip::ZipWriter::new(f);
        for (nama, isi) in berkas {
            z.start_file(
                *nama,
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .unwrap();
            z.write_all(isi.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn izin_unduh_menerima_openvsx_https_saja() {
        assert!(izin_unduh("https://open-vsx.org/api/acme/paket/1.0.0/file/acme.paket.zext").is_ok());
        assert!(izin_unduh("https://www.open-vsx.org/api/x").is_ok());
    }

    /*
     * Icon themes: BOTH shapes must be counted as drawable, and only when a
     * glyph actually exists.
     *
     * WHY this is the test that matters: the whole complaint was "I installed an
     * extension and nothing changed". A VS Code icon theme used to be refused as
     * "0 icon definitions" because its glyph lives in `fontCharacter`, not in a
     * `glyph` key — so the fix has to be held still: a fontCharacter theme now
     * counts, an iconPath-only theme still does not (Zephyr draws a glyph, not
     * an image, and claiming otherwise would be the same lie).
     */
    #[test]
    fn ikon_zephyr_dihitung_dari_glyph() {
        let v = json!({ "icons": { "ts": { "glyph": "TS", "color": "#3178c6" } } });
        assert_eq!(jumlah_ikon_dapat_digambar(&v), 1);
    }

    #[test]
    fn ikon_vscode_fontcharacter_dihitung() {
        let v = json!({
            "iconDefinitions": {
                "_ts": { "fontCharacter": "\\ue001", "fontColor": "#3178c6" },
                "_js": { "fontCharacter": "\\ue002" }
            },
            "fileExtensions": { "ts": "_ts", "js": "_js", "mjs": "_js" },
            "fileNames": { "package.json": "_js" }
        });
        assert_eq!(jumlah_ikon_dapat_digambar(&v), 4);
    }

    #[test]
    fn ikon_vscode_tanpa_fontcharacter_tidak_dihitung() {
        /* iconPath-only: no glyph to draw, so it must stay at zero. */
        let v = json!({
            "iconDefinitions": { "_ts": { "iconPath": "./ts.svg" } },
            "fileExtensions": { "ts": "_ts" }
        });
        assert_eq!(jumlah_ikon_dapat_digambar(&v), 0);
    }

    #[test]
    fn ikon_vscode_fontcharacter_kosong_tidak_dihitung() {
        let v = json!({
            "iconDefinitions": { "_ts": { "fontCharacter": "   " } },
            "fileExtensions": { "ts": "_ts" }
        });
        assert_eq!(jumlah_ikon_dapat_digambar(&v), 0);
    }

    #[test]
    fn izin_unduh_menolak_host_di_luar_allowlist() {
        for u in [
            "https://evil.example.com/acme.zext",
            "https://open-vsx.org.evil.example/acme.zext",
            "https://raw.githubusercontent.com/acme/x.zext",
            "https://openvsx.org/x.zext",
        ] {
            let e = izin_unduh(u).expect_err("host luar allowlist harus ditolak");
            assert!(matches!(e, ZephyrError::Permission(_)), "{u}: {e:?}");
        }
    }

    #[test]
    fn izin_unduh_menolak_bukan_https() {
        let e = izin_unduh("http://open-vsx.org/acme.zext").expect_err("http harus ditolak");
        assert!(matches!(e, ZephyrError::Permission(_)), "{e:?}");
        assert!(izin_unduh("ftp://open-vsx.org/x").is_err());
        assert!(izin_unduh("open-vsx.org/x").is_err());
    }

    #[test]
    fn hash_sha256_cocok_dengan_vektor_kenal() {
        assert_eq!(
            hash_sha256(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(hash_sha256(b"").len(), 64);
    }

    #[test]
    fn hash_dinormalkan_dan_ditolak_saat_tidak_cocok() {
        let h = hash_sha256(b"paket");
        assert_eq!(normalisasi_hash(&format!("  SHA256:{}  ", h.to_uppercase())), h);
        assert!(hash_cocok(&h, &h));
        assert!(hash_cocok(&h, &format!("sha256:{h}")));
        assert!(!hash_cocok(&h, &hash_sha256(b"paket-lain")));
        assert!(!hash_cocok(&h, "bukan-hash"));
        // Tanpa hash yang diterbitkan registry, tidak ada yang perlu dicocokkan.
        assert!(hash_cocok(&h, ""));
    }

    /// The whole chain the item is about: a .zext archive is extracted, its
    /// manifest is read, and the report carries NUMBERS per contribution kind -
    /// read from the files in the archive, not assumed from the manifest.
    #[test]
    fn zext_lalu_laporan_bukti_berangka_per_jenis() {
        let d = dir_uji("laporan");
        let z = d.join("paket-uji.zext");
        let man = json!({
            "name": "paket-uji",
            "publisher": "acme",
            "version": "1.0.0",
            "contributes": {
                "themes": [{ "label": "Malam", "path": "./themes/malam.json" }],
                "iconThemes": [{ "label": "Ikon", "path": "./icons/ikon.json" }],
                "snippets": [{ "language": "go", "path": "./snippets/go.json" }],
                "keymaps": [{ "label": "Pintasan", "path": "./keymaps/p.json" }],
                "languages": [
                    { "id": "go", "label": "Go", "extensions": ["go"], "cmLang": "go" }
                ]
            }
        })
        .to_string();
        let tema = json!({
            "colors": { "editor.background": "#111111", "editor.foreground": "#eeeeee" },
            "tokenColors": [{ "scope": "a" }, { "scope": "b" }, { "scope": "c" }]
        })
        .to_string();
        /*
         * Both shapes the loader accepts are exercised here: the icon theme is
         * Zephyr's own (`icons` + glyph, the only one `muatIconTheme` draws),
         * and the keymap is a bare ARRAY — the shape every bundled keymap uses,
         * which the counter used to read as "0 key bindings".
         */
        let ikon = json!({
            "icons": {
                "f1": { "glyph": "aa", "color": "#111111" },
                "f2": { "glyph": "bb", "color": "#222222" },
                "f3": { "glyph": "cc", "color": "#333333" },
                "f4": { "glyph": "dd", "color": "#444444" }
            }
        })
        .to_string();
        let peta = json!([{ "key": "ctrl+k" }, { "key": "ctrl+j" }]).to_string();

        tulis_zext(
            &z,
            &[
                (MANIFEST_NATIVE, man.as_str()),
                ("themes/malam.json", tema.as_str()),
                ("icons/ikon.json", ikon.as_str()),
                ("snippets/go.json", "{}"),
                ("keymaps/p.json", peta.as_str()),
            ],
        );

        let dst = d.join("isi");
        unzip_zext(&z, &dst).expect("a well-formed .zext must extract");

        let akar = turun_ke_akar(&dst);
        let m = read_manifest(&akar).expect("the extracted manifest must parse");
        // The id in the report is the QUALIFIED id `publisher.name` (same key the
        // marketplace lists the package under), not the bare name: with no
        // explicit "id" in the manifest, `read_manifest` builds it from
        // publisher + name. Both halves stay asserted so this cannot silently
        // become the folder name or the bare name.
        assert_eq!(m.id, "acme.paket-uji");
        assert_eq!(m.name, "paket-uji");
        assert_eq!(m.publisher, "acme");
        let p = pengaruh_paket(&akar, &m);

        assert_eq!(p.didukung.len(), 5, "{:?}", p.didukung);
        assert!(p.diabaikan.is_empty(), "{:?}", p.diabaikan);
        assert!(tolak_paket(&m, &p).is_none());
        for baris in [
            "1 theme: 2 UI colors + 3 code colors",
            "1 icon theme: 4 icons",
            "1 keymap: 2 key bindings",
            "1 snippet pack",
            "1 language",
        ] {
            assert!(
                p.ringkasan.iter().any(|r| r == baris),
                "missing '{baris}' in {:?}",
                p.ringkasan
            );
        }
    }

    /// An archive whose manifest carries an explicit `id` keeps it: the
    /// publisher.name fallback applies only when `id` is absent, so a package
    /// that names itself does not get renamed by the reporter.
    #[test]
    fn id_eksplisit_di_manifest_menang() {
        let d = dir_uji("id-eksplisit");
        let z = d.join("id-eksplisit.zext");
        let man = json!({
            "id": "penerbit-lain.paket-uji",
            "name": "paket-uji",
            "publisher": "acme",
            "version": "1.0.0",
            "contributes": { "languages": [{ "id": "go", "cmLang": "go" }] }
        })
        .to_string();
        tulis_zext(&z, &[(MANIFEST_NATIVE, man.as_str())]);

        let dst = d.join("isi");
        unzip_zext(&z, &dst).unwrap();
        let m = read_manifest(&turun_ke_akar(&dst)).unwrap();
        assert_eq!(m.id, "penerbit-lain.paket-uji");
        let p = pengaruh_paket(&d.join("isi"), &m);
        assert!(p.ringkasan.iter().any(|r| r == "1 language"), "{:?}", p.ringkasan);
    }

    /// Nothing may land outside the destination folder, whatever the archive
    /// claims its entry name is.
    #[test]
    fn unzip_tidak_pernah_menulis_di_luar_folder_tujuan() {
        let d = dir_uji("escape");
        let z = d.join("jahat.zext");
        let f = std::fs::File::create(&z).unwrap();
        let mut w = zip::ZipWriter::new(f);
        let opsi = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        if w.start_file("../keluar.txt", opsi).is_ok() {
            let _ = w.write_all(b"x");
        }
        let _ = w.finish();

        let dst = d.join("isi");
        assert!(
            unzip_zext(&z, &dst).is_err(),
            "an archive carrying ../ must be refused"
        );
        assert!(!d.join("keluar.txt").exists(), "nothing may escape {dst:?}");
    }
}
