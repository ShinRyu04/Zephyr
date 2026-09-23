use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::State;

pub const MAX_MAIN_BYTES: u64 = 20_971_520;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtCommand {
    pub id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub path: String,

    pub builtin: bool,

    pub main: String,

    pub main_bytes: i64,

    pub commands: Vec<ExtCommand>,

    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionLoad {
    pub id: String,
    pub name: String,
    pub version: String,
    pub main: String,
    pub main_bytes: u64,
    pub commands: Vec<ExtCommand>,

    pub manifest: Value,

    pub executed: bool,
}

const BUILTIN: &[(&str, &str, &str)] = &[
    (
        "file-icon-provider",
        "File Icon Provider",
        "Ikon per bahasa di Explorer & tab editor",
    ),
    (
        "git-provider",
        "Git Provider",
        "Status file, diff, dan Source Control",
    ),
    (
        "ai-provider",
        "AI Provider",
        "Adapter OpenAI/Anthropic/Gemini untuk panel AI",
    ),
    ("lang-web", "Bahasa Web", "HTML, CSS, JS/TS, JSON"),
    ("lang-python", "Python", "highlight + indentasi"),
    ("lang-rust", "Rust", "highlight"),
    ("lang-markdown", "Markdown", "highlight"),
    (
        "bracket-pair",
        "Bracket Pair",
        "pasangan tanda kurung berwarna",
    ),
];

pub fn extensions_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("extensions")
}

fn registry_file(state: &AppState) -> PathBuf {
    extensions_dir(state).join("registry.json")
}

fn registry_paths(state: &AppState) -> Vec<PathBuf> {
    let raw = match std::fs::read_to_string(registry_file(state)) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|x| x.as_str().map(PathBuf::from))
        .filter(|p| p.is_dir())
        .collect()
}

fn write_registry(state: &AppState, list: &[PathBuf]) -> ZResult<()> {
    let dir = extensions_dir(state);
    std::fs::create_dir_all(&dir)?;
    let arr: Vec<Value> = list
        .iter()
        .map(|p| Value::String(p.to_string_lossy().to_string()))
        .collect();
    std::fs::write(registry_file(state), serde_json::to_vec_pretty(&arr)?)?;
    Ok(())
}

fn enabled_list(state: &AppState) -> Vec<String> {
    crate::settings::read_settings_value(state)
        .get("extensions")
        .and_then(|e| e.get("enabled"))
        .and_then(|e| e.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn nls_map(dir: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for fname in [
        "package.nls.json",
        "package.nls.en.json",
        "package.nls.id.json",
    ] {
        let p = dir.join(fname);
        let Ok(raw) = std::fs::read_to_string(&p) else {
            continue;
        };
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(obj) = v.as_object() {
                for (k, val) in obj {
                    if let Some(s) = val.as_str() {
                        map.insert(k.clone(), s.to_string());
                    }
                }
            }
        }
    }
    map
}

fn resolve_nls(s: &str, nls: &std::collections::HashMap<String, String>) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('%') else {
            return out;
        };
        let key = &after[..end];
        match nls.get(key) {
            Some(val) => out.push_str(val),
            None => {
                out.push_str(key);
            }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}

fn parse_commands(ext_id: &str, manifest: &Value, dir: &Path) -> Vec<ExtCommand> {
    let nls = nls_map(dir);
    let arr = manifest
        .get("contributes")
        .and_then(|c| c.get("commands"))
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for c in arr {
        let raw = {
            let a = str_field(&c, "command");
            if a.is_empty() {
                str_field(&c, "name")
            } else {
                a
            }
        };
        if raw.is_empty() {
            continue;
        }
        let title = {
            let t = str_field(&c, "title");
            let resolved = if t.is_empty() {
                let l = str_field(&c, "label");
                if l.is_empty() {
                    raw.clone()
                } else {
                    l
                }
            } else {
                t
            };

            let r = resolve_nls(&resolved, &nls);
            if r.is_empty() {
                raw.clone()
            } else {
                r
            }
        };

        let short = raw.rsplit('.').next().unwrap_or(&raw).to_string();
        out.push(ExtCommand {
            id: format!("ext.{ext_id}.{short}"),
            title,
            description: str_field(&c, "description"),
        });
        if out.len() >= 32 {
            break;
        }
    }
    out
}

pub fn parse_commands_pub(ext_id: &str, manifest: &Value, dir: Option<&Path>) -> Vec<ExtCommand> {
    parse_commands(ext_id, manifest, dir.unwrap_or_else(|| Path::new("")))
}

fn read_package(dir: &Path, enabled: &[String]) -> Option<ExtensionInfo> {
    let pkg = dir.join("package.json");
    if !pkg.is_file() {
        return None;
    }
    let id = dir.file_name()?.to_string_lossy().to_string();
    let raw = std::fs::read_to_string(&pkg).ok()?;

    let manifest: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return Some(ExtensionInfo {
                id: id.clone(),
                name: id,
                version: "-".into(),
                description: String::new(),
                enabled: false,
                path: dir.to_string_lossy().to_string(),
                builtin: false,
                main: String::new(),
                main_bytes: -1,
                commands: vec![],
                error: Some(format!("package.json tidak valid: {e}")),
            })
        }
    };

    let name = {
        let n = str_field(&manifest, "displayName");
        if n.is_empty() {
            let n2 = str_field(&manifest, "name");
            if n2.is_empty() {
                id.clone()
            } else {
                n2
            }
        } else {
            n
        }
    };
    let main = {
        let m = str_field(&manifest, "main");
        if m.is_empty() {
            "index.js".to_string()
        } else {
            m
        }
    };
    let main_path = dir.join(&main);
    let main_bytes = std::fs::metadata(&main_path)
        .map(|m| m.len() as i64)
        .unwrap_or(-1);

    let mut error = None;
    if main_bytes > MAX_MAIN_BYTES as i64 {
        error = Some(format!(
            "file {main} berukuran {} KB — melebihi batas {} MB, ekstensi ditolak",
            main_bytes / 1024,
            MAX_MAIN_BYTES / 1024 / 1024
        ));
    }

    Some(ExtensionInfo {
        id: id.clone(),

        enabled: error.is_none() && enabled.iter().any(|x| x == &id),
        commands: parse_commands(&id, &manifest, &dir),
        name,
        version: str_field(&manifest, "version"),
        description: str_field(&manifest, "description"),
        path: dir.to_string_lossy().to_string(),
        builtin: false,
        main,
        main_bytes,
        error,
    })
}

pub fn list_all(state: &AppState) -> Vec<ExtensionInfo> {
    let enabled = enabled_list(state);
    let builtin_on = |id: &str| enabled.is_empty() || enabled.iter().any(|x| x == id);

    let mut out: Vec<ExtensionInfo> = BUILTIN
        .iter()
        .map(|(id, name, desc)| ExtensionInfo {
            id: (*id).to_string(),
            name: (*name).to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            description: (*desc).to_string(),
            enabled: builtin_on(id),
            path: "(internal)".into(),
            builtin: true,
            main: String::new(),
            main_bytes: -1,
            commands: vec![],
            error: None,
        })
        .collect();

    let dir = extensions_dir(state);
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default();
    dirs.extend(registry_paths(state));
    dirs.sort();
    dirs.dedup();

    for d in dirs {
        if let Some(info) = read_package(&d, &enabled) {
            if out.iter().any(|x| x.id == info.id) {
                continue;
            }
            out.push(info);
        }
    }
    out
}

#[tauri::command]
pub fn extensions_list(state: State<AppState>) -> ZResult<Vec<ExtensionInfo>> {
    Ok(list_all(&state))
}

#[tauri::command]
pub fn extensions_load(state: State<AppState>, id: String) -> ZResult<ExtensionLoad> {
    crate::workspace::ensure_trusted(&state, "Memuat ekstensi")?;

    let info = list_all(&state)
        .into_iter()
        .find(|x| x.id == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("ekstensi {id}")))?;

    if info.builtin {
        return Err(ZephyrError::InvalidInput(
            "ekstensi bawaan tidak punya manifest di disk".into(),
        ));
    }
    if let Some(e) = info.error {
        return Err(ZephyrError::InvalidInput(e));
    }

    let dir = PathBuf::from(&info.path);
    let pkg = dir.join("package.json");
    let manifest: Value = serde_json::from_str(&std::fs::read_to_string(&pkg)?)
        .map_err(|e| ZephyrError::InvalidInput(format!("package.json tidak valid: {e}")))?;

    let main_path = dir.join(&info.main);
    let size = std::fs::metadata(&main_path)
        .map(|m| m.len())
        .map_err(|_| ZephyrError::NotFound(format!("file entry {}", info.main)))?;
    if size > MAX_MAIN_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "{} berukuran {} KB — batas 1MB",
            info.main,
            size / 1024
        )));
    }

    let code = std::fs::read_to_string(&main_path)?;
    state.ext_store_code(&id, code);

    Ok(ExtensionLoad {
        id,
        name: info.name,
        version: info.version,
        main: info.main,
        main_bytes: size,
        commands: info.commands,
        manifest,
        executed: false,
    })
}

#[tauri::command]
pub fn extensions_add(state: State<AppState>, path: String) -> ZResult<ExtensionInfo> {
    let p = PathBuf::from(&path);
    let dir = if p.is_file() {
        p.parent()
            .map(|x| x.to_path_buf())
            .ok_or_else(|| ZephyrError::InvalidInput("folder ekstensi tidak ketemu".into()))?
    } else {
        p
    };
    if !dir.join("package.json").is_file() {
        return Err(ZephyrError::InvalidInput(
            "folder itu tidak punya package.json".into(),
        ));
    }
    let dir = crate::app_state::normalize(&dir);
    let enabled = enabled_list(&state);
    let info = read_package(&dir, &enabled)
        .ok_or_else(|| ZephyrError::InvalidInput("bukan paket ekstensi".into()))?;

    let mut list = registry_paths(&state);
    if !list.iter().any(|x| x == &dir) {
        list.push(dir);
        write_registry(&state, &list)?;
    }
    Ok(info)
}

pub fn registry_lepas(state: &AppState, id: &str) -> ZResult<bool> {
    let before = registry_paths(state);
    let after: Vec<PathBuf> = before
        .iter()
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy() != id)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    if after.len() == before.len() {
        return Ok(false);
    }
    write_registry(state, &after)?;
    Ok(true)
}

#[tauri::command]
pub fn extensions_remove(state: State<AppState>, id: String) -> ZResult<bool> {
    let before = registry_paths(&state);
    let after: Vec<PathBuf> = before
        .iter()
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy() != id)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    if after.len() == before.len() {
        return Ok(false);
    }
    write_registry(&state, &after)?;
    Ok(true)
}

#[tauri::command]
pub fn extensions_folder(state: State<AppState>) -> ZResult<String> {
    let dir = extensions_dir(&state);
    std::fs::create_dir_all(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}
