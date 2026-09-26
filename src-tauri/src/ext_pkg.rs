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
            "id ekstensi tidak valid: '{id}' (hanya huruf, angka, '.', '-' dan '_')"
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

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Contributes {
    pub themes: Vec<ContribTheme>,
    pub keymaps: Vec<ContribKeymap>,
    pub snippets: Vec<ContribSnippet>,
    pub languages: Vec<ContribLanguage>,
    pub icon_themes: Vec<ContribIconTheme>,

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

fn engine_cocok(spec: &str) -> bool {
    let app = env!("CARGO_PKG_VERSION");
    let num = |s: &str| -> (u32, u32) {
        let mut it = s.trim().split('.');
        (
            it.next().and_then(|x| x.parse().ok()).unwrap_or(0),
            it.next().and_then(|x| x.parse().ok()).unwrap_or(0),
        )
    };
    let (amaj, amin) = num(app);
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
    let (rmaj, rmin) = num(&bersih);
    if s.starts_with(">=") || s.starts_with('^') || s.starts_with('~') {
        (amaj, amin) >= (rmaj, rmin)
    } else if s.starts_with('>') {
        (amaj, amin) > (rmaj, rmin)
    } else if s.starts_with("<=") {
        (amaj, amin) <= (rmaj, rmin)
    } else if s.starts_with('<') {
        (amaj, amin) < (rmaj, rmin)
    } else {
        amaj == rmaj
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
            "folder tidak punya {MANIFEST_NATIVE} maupun package.json"
        )));
    };

    let raw_text = std::fs::read_to_string(&path)?;
    let v: Value = serde_json::from_str(&raw_text)
        .map_err(|e| ZephyrError::InvalidInput(format!("{file} tidak valid: {e}")))?;

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
            "path kontribusi harus relatif: {rel}"
        )));
    }
    for c in p.components() {
        if matches!(c, Component::ParentDir) {
            return Err(ZephyrError::Permission(format!(
                "path kontribusi tidak boleh memuat '..': {rel}"
            )));
        }
    }
    let gabung = root.join(p);

    let real = std::fs::canonicalize(&gabung)
        .map_err(|_| ZephyrError::NotFound(format!("file kontribusi {rel}")))?;
    let real_root = std::fs::canonicalize(root)
        .map_err(|_| ZephyrError::NotFound("folder ekstensi".to_string()))?;
    if !real.starts_with(&real_root) {
        return Err(ZephyrError::Permission(format!(
            "path kontribusi keluar dari folder ekstensi: {rel}"
        )));
    }
    Ok(real)
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

fn copy_dir(src: &Path, dst: &Path, terpakai: &mut u64) -> ZResult<()> {
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
                    "paket ekstensi terlalu besar (>64MB)".into(),
                ));
            }
            std::fs::copy(e.path(), &ke)?;
        }
    }
    Ok(())
}

fn unzip_zext(arsip: &Path, dst: &Path) -> ZResult<()> {
    let sz = std::fs::metadata(arsip)?.len();
    if sz > MAX_ZEXT_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "arsip {} MB melebihi batas {} MB",
            sz / 1024 / 1024,
            MAX_ZEXT_BYTES / 1024 / 1024
        )));
    }
    let f = std::fs::File::open(arsip)?;
    let mut zip = zip::ZipArchive::new(f)
        .map_err(|e| ZephyrError::InvalidInput(format!("bukan arsip zip yang valid: {e}")))?;

    std::fs::create_dir_all(dst)?;
    let mut total: u64 = 0;

    for i in 0..zip.len() {
        let mut item = zip
            .by_index(i)
            .map_err(|e| ZephyrError::InvalidInput(format!("entri zip rusak: {e}")))?;

        let rel = match item.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => {
                return Err(ZephyrError::Permission(format!(
                    "entri zip tidak aman ditolak: {}",
                    item.name()
                )))
            }
        };
        let tujuan = dst.join(&rel);
        if !tujuan.starts_with(dst) {
            return Err(ZephyrError::Permission(format!(
                "entri zip keluar dari folder tujuan: {}",
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
                "isi arsip melebihi 64MB setelah diekstrak".into(),
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
            if ext == "zext" || ext == "zip" || ext == "vsix" {
                unzip_zext(&asal, &staging)?;
            } else if asal
                .file_name()
                .map(|n| n == MANIFEST_NATIVE || n == "package.json")
                .unwrap_or(false)
            {
                let induk = asal.parent().ok_or_else(|| {
                    ZephyrError::InvalidInput("folder ekstensi tidak ketemu".into())
                })?;
                let mut n = 0u64;
                copy_dir(induk, &staging, &mut n)?;
            } else {
                return Err(ZephyrError::InvalidInput(
                    "pilih folder ekstensi, file .zext/.vsix, atau manifest-nya".into(),
                ));
            }
        } else {
            let mut n = 0u64;
            copy_dir(&asal, &staging, &mut n)?;
        }

        let akar = turun_ke_akar(&staging);
        let man = read_manifest(&akar)?;
        if man.id.trim().is_empty() {
            return Err(ZephyrError::InvalidInput("manifest tanpa id".into()));
        }
        if !man.engine_ok {
            return Err(ZephyrError::InvalidInput(format!(
                "ekstensi butuh Zephyr {} — versi ini {}",
                man.engine,
                env!("CARGO_PKG_VERSION")
            )));
        }

        if !id_aman(&man.id) {
            return Err(ZephyrError::InvalidInput(format!(
                "id ekstensi tidak valid: {}",
                man.id
            )));
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

            perlu_reload: !man.contributes.themes.is_empty()
                || !man.contributes.keymaps.is_empty()
                || !man.contributes.languages.is_empty()
                || !man.contributes.icon_themes.is_empty(),
            manifest: man,
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
                "folder ekstensi di luar direktori data — tidak dihapus".into(),
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
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("ekstensi {id}")))?;
    let file = resolve_in_ext(&dir, &rel)?;
    let sz = std::fs::metadata(&file)?.len();
    if sz > MAX_CONTRIB_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "{rel} berukuran {} KB — batas 512KB",
            sz / 1024
        )));
    }
    let raw = std::fs::read_to_string(&file)?;
    serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::InvalidInput(format!("{rel} bukan JSON valid: {e}")))
}

#[tauri::command]
pub fn extensions_read_main(state: State<AppState>, id: String, rel: String) -> ZResult<String> {
    // Batas file main ekstensi. Dinaikkan dari 1 MB ke 20 MB di v1.1.7 supaya
    // ekstensi besar tetap bisa dimuat; pesan errornya dulu tidak ikut berubah
    // sehingga laporan ke user menyebut angka yang salah.
    const MAX_MAIN_BYTES: u64 = 20 * 1024 * 1024;
    let dir =
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("ekstensi {id}")))?;
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
            "{rel} berukuran {} KB — batas {} MB",
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
        ext_dir_of(&state, &id).ok_or_else(|| ZephyrError::NotFound(format!("ekstensi {id}")))?;
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
    read_installed(state)
        .into_iter()
        .find(|x| x.id == id)
        .map(|x| PathBuf::from(x.path))
        .filter(|p| p.is_dir())
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
            "ekstensi {ext_id} belum diberi izin runtime '{runtime}'"
        )));
    }
    if granted != bin {
        return Err(ZephyrError::InvalidInput(format!(
            "path runtime '{runtime}' untuk ekstensi {ext_id} tidak cocok dengan izin — minta izin ulang"
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
                "gagal menjalankan {bin}: {e}"
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
    for d in dirs {
        match read_manifest(&d) {
            Ok(m) => {
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
                    manifest: Some(m),
                    icon_path: icon_data,
                });
            }
            Err(e) => out.push(ExtManifestStatus {
                enabled: false,
                tercatat: false,
                path: d.to_string_lossy().to_string(),
                error: Some(e.to_string()),
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

    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
}

const MAX_VSIX_BYTES: u64 = 1024 * 1024 * 1024;

#[tauri::command(async)]
pub fn extensions_download_vsix(url: String, id: String) -> ZResult<String> {
    const IZIN: &[&str] = &["open-vsx.org", "www.open-vsx.org"];
    let host = url.split('/').nth(2).unwrap_or("").to_lowercase();
    if !url.starts_with("https://") || !IZIN.contains(&host.as_str()) {
        return Err(ZephyrError::Permission(
            "unduhan ekstensi hanya dari registry tepercaya (open-vsx.org)".into(),
        ));
    }

    if !id_aman(&id) {
        return Err(ZephyrError::InvalidInput(format!("id tidak valid: {id}")));
    }

    let dir_tmp = std::env::temp_dir().join("zephyr-ext");
    std::fs::create_dir_all(&dir_tmp)?;
    let tujuan = dir_tmp.join(format!("{id}.vsix"));

    let r = ureq::get(&url)
        .config()
        .timeout_global(Some(Duration::from_secs(120)))
        .http_status_as_error(false)
        .build()
        .header("Accept", "application/octet-stream")
        .header("User-Agent", "Zephyr-Editor/1.0")
        .call()
        .map_err(|e| ZephyrError::Git(format!("gagal mengunduh .vsix: {e}")))?;

    if r.status().as_u16() != 200 {
        return Err(ZephyrError::Git(format!(
            "registry menjawab {} saat mengunduh .vsix",
            r.status().as_u16()
        )));
    }

    let bytes = r
        .into_body()
        .with_config()
        .limit(MAX_VSIX_BYTES)
        .read_to_vec()
        .map_err(|e| ZephyrError::Git(format!("gagal membaca unduhan: {e}")))?;
    if bytes.len() as u64 > MAX_VSIX_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            ".vsix melebihi batas {} MB",
            MAX_VSIX_BYTES / 1024 / 1024
        )));
    }
    if bytes.is_empty() {
        return Err(ZephyrError::InvalidInput(".vsix kosong".into()));
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
    }

    #[test]
    fn id_aman_menerima_bentuk_wajar() {
        assert!(id_aman("my-extension"));
        assert!(id_aman("publisher.ext_name"));
        assert!(id_aman("Ext123"));
    }
}
