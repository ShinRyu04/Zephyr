// settings.rs — app info, settings.json, recent.json, window, sampler RAM.
// Kontrak nama mengikuti ARCHITECTURE.md §2.

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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub last_opened: u64,
}

/// Nilai default seluruh Settings (ARCHITECTURE.md §5).
/// File settings.json user di-merge DI ATAS default ini, jadi key baru
/// otomatis terisi tanpa migrasi.
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
            "checkUpdates": false
        },
        "editor": {
            "tabSize": 2,
            "insertSpaces": true,
            "wordWrap": false,
            "minimap": false,
            "cursorStyle": "line",
            "smoothScroll": false,
            "formatOnSave": false
        },
        "theme": { "current": "zephyr-dark", "accent": "#3884ff" },
        "shortcuts": {},
        "models": { "activeProvider": "gemini", "providers": {} },
        "agents": { "maxPanes": 6, "order": [], "startCommands": {}, "attachActiveFile": false },
        "extensions": { "enabled": [] },
        "git": { "defaultBranch": "main", "pullBeforePush": true },
        "mcp": { "enabled": false, "port": 9222, "token": "", "writeToCli": [] },
        "ssh": { "recentHosts": [] }
    })
}

/// Merge rekursif: `patch` menimpa `base` per-key (object di-merge dalam).
fn deep_merge(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                match b.get_mut(k) {
                    Some(slot) => deep_merge(slot, v),
                    None => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, p) => *b = p.clone(),
    }
}

fn read_json(path: &PathBuf) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_json(path: &PathBuf, v: &Value) -> ZResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(v)?)?;
    Ok(())
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<AppState>) -> ZResult<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> ZResult<Value> {
    let mut merged = default_settings();
    if let Some(user) = read_json(&state.file("settings.json")) {
        deep_merge(&mut merged, &user);
    }
    Ok(merged)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, state: State<AppState>, patch: Value) -> ZResult<()> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput("patch harus object".into()));
    }
    let path = state.file("settings.json");
    let mut current = read_json(&path).unwrap_or_else(|| json!({}));
    deep_merge(&mut current, &patch);
    write_json(&path, &current)?;

    // Beritahu frontend key mana yang berubah (ARCHITECTURE.md §3).
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
    let raw = match read_json(&path) {
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
    out.truncate(4); // PRD B2: ingat 4 workspace terakhir
    Ok(out)
}

/// Catat workspace ke recent.json (dipakai `workspace_open`).
fn push_recent(state: &AppState, path: &str) -> ZResult<()> {
    let file = state.file("recent.json");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut list: Vec<Value> = read_json(&file)
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

    if let Ok(mut ws) = state.workspace.lock() {
        *ws = Some(canon.clone());
    }
    state.allow(&canon);
    push_recent(&state, &as_string)?;

    let _ = app.emit("workspace-opened", json!({ "path": as_string }));
    Ok(())
}

#[tauri::command]
pub fn workspace_close(state: State<AppState>) -> ZResult<()> {
    if let Ok(mut ws) = state.workspace.lock() {
        *ws = None;
    }
    Ok(())
}

// ───────────────────── sampler RAM (fase 02 V6) ─────────────────────

/// Thread ringan: tiap 3 detik emit `ram-usage`.
/// Berhenti mengukur saat window minimized (hemat CPU, sesuai catatan fase 02).
///
/// PENTING: status minimized dibaca dari AtomicBool yang di-update oleh
/// window event di main thread. Memanggil API window (`is_minimized()`)
/// langsung dari thread ini membuat proses mati di Windows.
pub fn spawn_ram_sampler(app: AppHandle, minimized: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let pid = sysinfo::Pid::from_u32(std::process::id());
        let mut sys = sysinfo::System::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));

            if minimized.load(Ordering::Relaxed) {
                continue;
            }

            // CATATAN (jangan diubah tanpa uji ulang): argumen kedua
            // `remove_dead_processes` HARUS false. Dengan `true` + daftar pid
            // terbatas, sysinfo 0.39 di Windows membuat proses Zephyr keluar
            // sendiri (event loop berhenti, exit code 0) beberapa saat setelah
            // sampel pertama. Kita hanya memantau pid sendiri, jadi `false`
            // juga benar secara semantik.
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::Some(&[pid]),
                false,
                sysinfo::ProcessRefreshKind::nothing().with_memory(),
            );
            let bytes = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
            if app.emit("ram-usage", json!({ "bytes": bytes })).is_err() {
                break; // app sudah tutup
            }
        }
    });
}

// ───────── hook untuk unit test (tests_fs.rs) ─────────

#[cfg(test)]
pub fn merge_for_test(base: &mut Value, patch: &Value) {
    deep_merge(base, patch)
}
