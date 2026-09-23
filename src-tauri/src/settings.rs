use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub identifier: String,
    pub data_dir: String,

    pub arch: String,

    pub webview: String,

    pub portable: bool,

    pub exe_dir: String,

    pub profile: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub last_opened: u64,
}

pub fn default_settings() -> Value {
    json!({
        "general": {
            "theme": "dark",
            "fontFamily": "Consolas, 'Cascadia Mono', 'Segoe UI Mono', monospace",
            "fontSize": 13,
            "lineHeight": 1.5,
            "uiLang": "id",
            "zoom": 100,
            "restoreSession": true,
            "checkUpdates": true,
            "lowRam": false,

            "aiPanel": "bottom",
            "layout": "default"
        },

        "sidebar": "left",

        "background": { "image": "", "opacity": 55, "size": "fill", "transparan": true },

        "layout": "default",
        "editor": {
            "tabSize": 2,
            "insertSpaces": true,
            "wordWrap": false,
            "minimap": false,
            "cursorStyle": "line",
            "smoothScroll": false,
            "formatOnSave": false,
            "showWhitespace": false,
            "snippetSuggestions": "inline",
            "breadcrumbs": true,
            "stickyScroll": false,
            "stickyScrollMaxLines": 3,
            "minimapRenderCharacters": false,
            "indentGuides": true,
            "colorDecorators": true,
            "unicodeHighlight": true,
            "bracketPairColorization": true
        },
        "theme": { "current": "zephyr-dark", "accent": "#3884ff" },
        "shortcuts": {},
        "models": { "activeProvider": "gemini", "providers": {}, "answerLang": "follow", "ragEnabled": false, "ragUrl": "http://localhost:7777", "ragProject": "", "ragK": 4 },
        "agents": { "maxPanes": 6, "order": [], "startCommands": {}, "attachActiveFile": false },

        "extensions": {
            "enabled": [],
            "trust": {},

            "registryUrl": ""
        },

        "accessibility": {
            "reducedMotion": false,
            "screenReader": false,
            "autoFocusDialog": true,
            "toastDurasiMin": 3200
        },
        "git": { "defaultBranch": "main", "pullBeforePush": true, "github": { "method": "none", "clientId": "" } },

        "aiPrompt": { "identitas": "", "caraKerja": "", "aturan": "", "instruksi": "" },
        "allowCommands": [],

        "subagent": {
            "maxParallel": 4,
            "maxSteps": 15,
            "allowWrite": false,
            "showPanel": true,
            "autoCollapse": true,
            "model": "",
            "provider": ""
        },
        "mcp": { "enabled": false, "port": 9222, "token": "", "writeToCli": [] },
        "ssh": { "recentHosts": [] },

        "panel": {
            "visibleTabs": ["problems", "output", "debug", "terminal", "ports", "ai", "subagents"],
            "activeTab": "terminal",
            "height": 260
        },

        "lsp": { "enabled": true, "idleSeconds": 300, "servers": {} },

        "history": { "enabled": true, "maxPerFile": 50, "maxDays": 30 },
        "update": {
            "lastSeenVersion": "",
            "pendingNotes": "",
            "seenAnnouncements": []
        }
    })
}

pub fn deep_merge_um(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                if v.is_null() {
                    b.remove(k);
                    continue;
                }
                match b.get_mut(k) {
                    Some(slot) => deep_merge_um(slot, v),
                    None => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, p) => *b = p.clone(),
    }
}

pub fn read_json_um(path: &PathBuf) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str(&raw) {
        Ok(v) => Some(v),
        Err(e) => {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let mut backup = path.clone();
            let nama = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "settings.json".into());
            backup.set_file_name(format!("{nama}.broken-{stamp}"));
            let ok = std::fs::rename(path, &backup).is_ok();
            tracing::error!(
                "{} rusak ({e}) — {} ke {}",
                path.display(),
                if ok {
                    "dipindahkan"
                } else {
                    "GAGAL memindahkan"
                },
                backup.display()
            );
            if ok {
                if let Ok(mut slot) = LAST_BROKEN.lock() {
                    *slot = backup.to_string_lossy().to_string();
                }
            }
            None
        }
    }
}

static LAST_BROKEN: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

#[tauri::command(async)]
pub fn take_broken_config() -> ZResult<String> {
    let mut slot = LAST_BROKEN
        .lock()
        .map_err(|_| ZephyrError::Internal("lock LAST_BROKEN".into()))?;
    Ok(std::mem::take(&mut *slot))
}

#[tauri::command(async)]
pub fn get_keybindings(state: State<AppState>) -> ZResult<Value> {
    let p = state.file("keybindings.json");
    match read_json_um(&p) {
        Some(v) if v.is_array() => Ok(v),
        _ => Ok(Value::Array(vec![])),
    }
}

#[tauri::command(async)]
pub fn set_keybindings(app: AppHandle, state: State<AppState>, bindings: Value) -> ZResult<()> {
    if !bindings.is_array() {
        return Err(ZephyrError::InvalidInput("keybindings harus array".into()));
    }
    write_json(&state.file("keybindings.json"), &bindings)?;
    let _ = app.emit("settings-changed", json!({ "key": "keybindings" }));
    tracing::info!(
        n = bindings.as_array().map(|a| a.len()).unwrap_or(0),
        "keybindings.json ditulis"
    );
    Ok(())
}

fn write_json(path: &PathBuf, v: &Value) -> ZResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(v)?)?;
    Ok(())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<AppState>) -> ZResult<AppInfo> {
    let webview = webview_version();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();

    let portable =
        !exe_dir.is_empty() && std::path::Path::new(&exe_dir).join("zephyr-data").is_dir();
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        arch: format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
        webview,
        portable,
        exe_dir,
        profile: if cfg!(debug_assertions) {
            "debug".into()
        } else {
            "release".into()
        },
    })
}

#[cfg(windows)]
fn webview_version() -> String {
    let kunci = r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    let out = crate::proc::cmd("reg")
        .args(["query", kunci, "/v", "pv"])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let teks = String::from_utf8_lossy(&o.stdout);
            teks.split_whitespace()
                .last()
                .unwrap_or_default()
                .trim()
                .to_string()
        }
        _ => String::new(),
    }
}

#[cfg(not(windows))]
fn webview_version() -> String {
    String::new()
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> ZResult<Value> {
    let mut merged = default_settings();
    if let Some(user) = read_json_um(&state.file("settings.json")) {
        deep_merge_um(&mut merged, &user);
    }
    Ok(merged)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, state: State<AppState>, patch: Value) -> ZResult<()> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput("patch harus object".into()));
    }
    let path = state.file("settings.json");
    let mut current = read_json_um(&path).unwrap_or_else(|| json!({}));
    deep_merge_um(&mut current, &patch);
    write_json(&path, &current)?;

    if let Value::Object(map) = &patch {
        for k in map.keys() {
            let _ = app.emit("settings-changed", json!({ "key": k }));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_window_size(app: AppHandle, width: f64, height: f64) -> ZResult<()> {
    if width < 400.0 || height < 300.0 {
        return Err(ZephyrError::InvalidInput("ukuran terlalu kecil".into()));
    }
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| ZephyrError::Internal("window main tidak ada".into()))?;
    win.set_size(tauri::LogicalSize::new(width, height))?;
    Ok(())
}

#[tauri::command]
pub fn list_recents(state: State<AppState>) -> ZResult<Vec<RecentEntry>> {
    let path = state.file("recent.json");
    let raw = match read_json_um(&path) {
        Some(v) => v,
        None => return Ok(vec![]),
    };
    let arr = raw.as_array().cloned().unwrap_or_default();
    let mut out: Vec<RecentEntry> = arr
        .iter()
        .filter_map(|e| {
            let p = e.get("path")?.as_str()?.to_string();
            let t = e.get("lastOpened").and_then(|x| x.as_u64()).unwrap_or(0);
            Some(RecentEntry {
                path: p,
                last_opened: t,
            })
        })
        .filter(|e| std::path::Path::new(&e.path).exists())
        .collect();
    out.sort_by(|a, b| b.last_opened.cmp(&a.last_opened));
    out.truncate(4);
    Ok(out)
}

pub fn push_recent(state: &AppState, path: &str) -> ZResult<()> {
    let file = state.file("recent.json");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut list: Vec<Value> = read_json_um(&file)
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    list.retain(|e| e.get("path").and_then(|p| p.as_str()) != Some(path));
    list.insert(0, json!({ "path": path, "lastOpened": now }));
    list.truncate(4);
    write_json(&file, &Value::Array(list))
}

#[tauri::command]
pub fn workspace_open(app: AppHandle, state: State<AppState>, path: String) -> ZResult<()> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan folder")));
    }
    let canon = crate::app_state::normalize(&p);
    let as_string = canon.to_string_lossy().to_string();

    if crate::paths::is_drive_root(&canon) {
        return Err(ZephyrError::InvalidInput(format!(
            "{as_string} adalah root drive — buka folder proyek di dalamnya, bukan seluruh disk (scan root bisa memakan puluhan menit dan menyentuh folder sistem)"
        )));
    }

    state.clear_roots();
    state.set_workspace(canon.clone())?;

    state.allow_exact(&canon);
    push_recent(&state, &as_string)?;
    state.perf_mark("workspace_open", None);
    tracing::info!(path = %as_string, "workspace dibuka");

    let _ = app.emit("workspace-opened", json!({ "path": as_string }));
    Ok(())
}

#[tauri::command]
pub fn workspace_close(state: State<AppState>) -> ZResult<()> {
    state.stop_watcher();
    state.clear_workspace();
    tracing::info!("workspace ditutup");
    Ok(())
}

pub fn read_settings_value(state: &AppState) -> Value {
    let mut merged = default_settings();
    if let Some(user) = read_json_um(&state.file("settings.json")) {
        deep_merge_um(&mut merged, &user);
    }
    merged
}

pub fn patch_settings(app: &AppHandle, state: &AppState, patch: Value) -> ZResult<()> {
    patch_settings_no_emit(state, patch.clone())?;
    if let Value::Object(map) = &patch {
        for k in map.keys() {
            let _ = app.emit("settings-changed", json!({ "key": k }));
        }
    }
    Ok(())
}

pub fn patch_settings_no_emit(state: &AppState, patch: Value) -> ZResult<()> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput("patch harus object".into()));
    }
    let path = state.file("settings.json");
    let mut current = read_json_um(&path).unwrap_or_else(|| json!({}));
    deep_merge_um(&mut current, &patch);
    write_json(&path, &current)
}

pub fn git_default_branch(state: &AppState) -> String {
    read_settings_value(state)
        .get("git")
        .and_then(|g| g.get("defaultBranch"))
        .and_then(|b| b.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "main".to_string())
}

pub fn git_identity(state: &AppState) -> (Option<String>, Option<String>) {
    let v = read_settings_value(state);
    let g = v.get("git");
    let pick = |key: &str| {
        g.and_then(|x| x.get(key))
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    (pick("userName"), pick("userEmail"))
}

static RAM_PEAK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

static RAM_LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

static RAM_TOTAL_LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static RAM_TOTAL_PEAK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[allow(dead_code)]
pub fn ram_peak() -> u64 {
    RAM_PEAK.load(Ordering::Relaxed)
}

pub fn ram_last() -> u64 {
    RAM_LAST.load(Ordering::Relaxed)
}

pub fn ram_total_last() -> u64 {
    RAM_TOTAL_LAST.load(Ordering::Relaxed)
}

pub fn ram_total_peak() -> u64 {
    RAM_TOTAL_PEAK.load(Ordering::Relaxed)
}

static HOST_RAM: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static HOST_CPU: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
static HOST_OS: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub fn host_ram_total() -> u64 {
    HOST_RAM.load(Ordering::Relaxed)
}

pub fn host_cpu_count() -> usize {
    HOST_CPU.load(Ordering::Relaxed)
}

pub fn host_os() -> String {
    HOST_OS.lock().map(|s| s.clone()).unwrap_or_default()
}

fn isi_info_host(sys: &mut sysinfo::System) {
    sys.refresh_memory();
    HOST_RAM.store(sys.total_memory(), Ordering::Relaxed);
    HOST_CPU.store(
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(0),
        Ordering::Relaxed,
    );
    let nama = sysinfo::System::name().unwrap_or_else(|| "Windows".into());
    let ver = sysinfo::System::os_version().unwrap_or_default();
    let build = sysinfo::System::kernel_version().unwrap_or_default();
    if let Ok(mut slot) = HOST_OS.lock() {
        *slot = format!("{nama} {ver} (build {build})").trim().to_string();
    }
}

fn hitung_total(sys: &mut sysinfo::System, own: sysinfo::Pid) -> u64 {
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        false,
        sysinfo::ProcessRefreshKind::nothing().with_memory(),
    );
    let mut total = sys.process(own).map(|p| p.memory()).unwrap_or(0);
    for (pid, proc_) in sys.processes() {
        if *pid == own {
            continue;
        }
        let mut cur = proc_.parent();
        let mut depth = 0usize;
        while let Some(p) = cur {
            if p == own {
                total += proc_.memory();
                break;
            }
            cur = sys.process(p).and_then(|x| x.parent());
            depth += 1;
            if depth > 6 {
                break;
            }
        }
    }
    total
}

pub fn spawn_ram_sampler(app: AppHandle, minimized: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let pid = sysinfo::Pid::from_u32(std::process::id());
        let mut sys = sysinfo::System::new();

        let mut sys_all = sysinfo::System::new();
        let mut putaran: u64 = 0;

        isi_info_host(&mut sys_all);
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));

            if minimized.load(Ordering::Relaxed) {
                continue;
            }

            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::Some(&[pid]),
                false,
                sysinfo::ProcessRefreshKind::nothing().with_memory(),
            );
            let bytes = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
            RAM_LAST.store(bytes, Ordering::Relaxed);
            RAM_PEAK.fetch_max(bytes, Ordering::Relaxed);

            putaran += 1;
            if putaran % 4 == 1 {
                let total = hitung_total(&mut sys_all, pid);
                if total > 0 {
                    RAM_TOTAL_LAST.store(total, Ordering::Relaxed);
                    RAM_TOTAL_PEAK.fetch_max(total, Ordering::Relaxed);
                }
            }

            if app
                .emit(
                    "ram-usage",
                    json!({ "bytes": bytes, "totalBytes": RAM_TOTAL_LAST.load(Ordering::Relaxed) }),
                )
                .is_err()
            {
                break;
            }
        }
    });
}

#[cfg(test)]
pub fn merge_for_test(base: &mut Value, patch: &Value) {
    deep_merge_um(base, patch)
}
