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
            "checkUpdates": false,
            "lowRam": false
        },
        "editor": {
            "tabSize": 2,
            "insertSpaces": true,
            "wordWrap": false,
            "minimap": false,
            "cursorStyle": "line",
            "smoothScroll": false,
            "formatOnSave": false,
            "showWhitespace": false,
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
        "models": { "activeProvider": "gemini", "providers": {} },
        "agents": { "maxPanes": 6, "order": [], "startCommands": {}, "attachActiveFile": false },
        "extensions": { "enabled": [] },
        "git": { "defaultBranch": "main", "pullBeforePush": true, "github": { "method": "none", "clientId": "" } },
        "mcp": { "enabled": false, "port": 9222, "token": "", "writeToCli": [] },
        "ssh": { "recentHosts": [] },
        // fase 20: preferensi panel bawah
        "panel": {
            "visibleTabs": ["problems", "output", "debug", "terminal", "ports"],
            "activeTab": "terminal",
            "height": 260
        },
        // fase 21: language server. `servers` kosong = pakai default katalog
        // di src/lib/lsp.ts; user boleh menimpa cmd/enabled per bahasa.
        "lsp": { "enabled": true, "idleSeconds": 300, "servers": {} },
        // fase 26: Local History. Dinyalakan default karena ini safety-net —
        // gunanya justru sebelum user sadar membutuhkannya. Retensi menjaga
        // disk: 50 snapshot/file, buang yang lebih tua dari 30 hari.
        "history": { "enabled": true, "maxPerFile": 50, "maxDays": 30 }
    })
}

/// Merge rekursif: `patch` menimpa `base` per-key (object di-merge dalam).
///
/// `null` di patch = HAPUS key (semantik JSON Merge Patch / RFC 7386).
/// Ini bukan hiasan: tanpa itu tombol "Reset ke default" per item —
/// `agents.startCommands[x]`, `shortcuts[x]` — tidak akan pernah bisa
/// membuang entri dari settings.json, karena merge biasa cuma menambah.
/// Konsekuensinya: tidak ada setting yang boleh bernilai null secara sah.
fn deep_merge(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                if v.is_null() {
                    b.remove(k);
                    continue;
                }
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

/// Baca JSON dari disk. File yang RUSAK (syntax error) tidak boleh membuat
/// Zephyr membuang settings user secara diam-diam: fase 16.3 memindahkannya ke
/// `<nama>.broken` (dengan timestamp) lalu mengembalikan None supaya default
/// yang dipakai. Nama file backup dicatat di `LAST_BROKEN` agar UI bisa
/// memberi tahu user lewat toast.
fn read_json(path: &PathBuf) -> Option<Value> {
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

/// Path file config rusak terakhir yang di-backup (fase 16.3). Dibaca sekali
/// oleh frontend lewat `take_broken_config` lalu dikosongkan.
static LAST_BROKEN: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

/// Ambil (dan kosongkan) laporan config rusak terakhir. `""` = tidak ada.
#[tauri::command(async)]
pub fn take_broken_config() -> ZResult<String> {
    let mut slot = LAST_BROKEN
        .lock()
        .map_err(|_| ZephyrError::Internal("lock LAST_BROKEN".into()))?;
    Ok(std::mem::take(&mut *slot))
}

// ── FASE 18: keybindings.json (override user untuk chord) ──
//
// File TERPISAH dari settings.json — sengaja, sesuai 18.4. Alasannya praktis:
// user boleh menyuntingnya dengan tangan (VS Code-style), dan formatnya array
// bukan object, jadi tidak cocok masuk deep_merge settings yang memakai
// semantik JSON Merge Patch (null = hapus key).
//
// Bentuk: [{ "key": "ctrl+alt+s", "command": "file.save", "when": "global" }]

/// Baca `keybindings.json`. Array kosong bila belum ada / rusak (file rusak
/// tetap di-backup lewat `read_json`).
#[tauri::command(async)]
pub fn get_keybindings(state: State<AppState>) -> ZResult<Value> {
    let p = state.file("keybindings.json");
    match read_json(&p) {
        Some(v) if v.is_array() => Ok(v),
        _ => Ok(Value::Array(vec![])),
    }
}

/// Tulis seluruh daftar override. `bindings` HARUS array.
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

    // FASE 16.3: root drive (C:\, D:\) sebagai workspace berarti scan seluruh
    // disk — Explorer akan menelusuri Windows\WinSxS, node_modules global, dan
    // folder sistem yang tidak boleh dibaca. Ditolak dengan pesan yang
    // menjelaskan apa yang harus dilakukan, bukan dibiarkan membekukan app.
    if crate::paths::is_drive_root(&canon) {
        return Err(ZephyrError::InvalidInput(format!(
            "{as_string} adalah root drive — buka folder proyek di dalamnya, bukan seluruh disk (scan root bisa memakan puluhan menit dan menyentuh folder sistem)"
        )));
    }

    state.set_workspace(canon.clone())?;
    // allow_exact, BUKAN allow(): allow() ikut mem-whitelist folder INDUK
    // workspace, sehingga fs_write ke folder sebelahnya lolos (bug V2 fase 14).
    state.allow_exact(&canon);
    push_recent(&state, &as_string)?;
    state.perf_mark("workspace_open", None);
    tracing::info!(path = %as_string, "workspace dibuka");

    let _ = app.emit("workspace-opened", json!({ "path": as_string }));
    Ok(())
}

#[tauri::command]
pub fn workspace_close(state: State<AppState>) -> ZResult<()> {
    // Hentikan watcher fase 04 agar tidak ada thread menggantung.
    state.stop_watcher();
    state.clear_workspace();
    tracing::info!("workspace ditutup");
    Ok(())
}

/// Baca settings efektif (default + settings.json) sebagai Value.
/// Dipakai modul lain (github.rs) tanpa perlu State/command.
pub fn read_settings_value(state: &AppState) -> Value {
    let mut merged = default_settings();
    if let Some(user) = read_json(&state.file("settings.json")) {
        deep_merge(&mut merged, &user);
    }
    merged
}

/// Terapkan patch ke settings.json lalu beri tahu frontend.
/// Sama seperti command `set_settings`, tapi bisa dipanggil dari Rust.
pub fn patch_settings(app: &AppHandle, state: &AppState, patch: Value) -> ZResult<()> {
    patch_settings_no_emit(state, patch.clone())?;
    if let Value::Object(map) = &patch {
        for k in map.keys() {
            let _ = app.emit("settings-changed", json!({ "key": k }));
        }
    }
    Ok(())
}

/// Versi tanpa event (dipakai thread yang tidak memegang AppHandle).
pub fn patch_settings_no_emit(state: &AppState, patch: Value) -> ZResult<()> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput("patch harus object".into()));
    }
    let path = state.file("settings.json");
    let mut current = read_json(&path).unwrap_or_else(|| json!({}));
    deep_merge(&mut current, &patch);
    write_json(&path, &current)
}

/// `settings.git.defaultBranch` (fase 10: dipakai `git init -b`).
pub fn git_default_branch(state: &AppState) -> String {
    read_settings_value(state)
        .get("git")
        .and_then(|g| g.get("defaultBranch"))
        .and_then(|b| b.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "main".to_string())
}

/// Identitas commit dari Settings → Source Control (fase 08).
/// Dipakai hanya bila `git config user.*` belum diisi di mesin ini.
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

// ───────────────────── sampler RAM (fase 02 V6) ─────────────────────

/// RAM tertinggi yang pernah tercatat (byte) — dibaca Diagnostics.
static RAM_PEAK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Sampel RAM TERAKHIR (byte). Diagnostics membaca ini, BUKAN memanggil
/// sysinfo sendiri.
///
/// KENAPA (fase 14, sudah kena): `get_diagnostics` awalnya membuat
/// `sysinfo::System::new()` + `refresh_processes_specifics` sendiri tiap
/// dipanggil. Saat harness V8 memanggilnya tiap 30 detik, proses Zephyr
/// KELUAR SENDIRI (`RunEvent::Exit`, exit code 0) setelah ~1 menit — gejala
/// sama seperti catatan fase 02 tentang sysinfo 0.39 di Windows. Aturan
/// sekarang: HANYA thread sampler ini yang menyentuh sysinfo untuk pid sendiri.
static RAM_LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// RAM TOTAL = proses ini + seluruh turunannya (`msedgewebview2.exe`).
///
/// KENAPA ADA (fase 14, tertangkap saat V8): WebView2 jalan sebagai PROSES
/// TERPISAH (browser + renderer + GPU). `zephyr.exe` sendiri cuma ~37MB,
/// sementara total yang dilihat user di Task Manager bisa 300MB+. Melaporkan
/// angka proses sendiri saja = mengaku hemat padahal bukan.
static RAM_TOTAL_LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static RAM_TOTAL_PEAK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Puncak RAM proses ini saja (dipakai unit test & debugging).
#[allow(dead_code)]
pub fn ram_peak() -> u64 {
    RAM_PEAK.load(Ordering::Relaxed)
}

/// Sampel RAM terakhir dari sampler (0 = belum ada sampel).
pub fn ram_last() -> u64 {
    RAM_LAST.load(Ordering::Relaxed)
}

/// RAM total (proses + turunan WebView2) terakhir & puncaknya.
pub fn ram_total_last() -> u64 {
    RAM_TOTAL_LAST.load(Ordering::Relaxed)
}

pub fn ram_total_peak() -> u64 {
    RAM_TOTAL_PEAK.load(Ordering::Relaxed)
}

// ── FASE 16.5: info host (statis, diisi sekali saat sampler start) ──
//
// Nilai-nilai ini TIDAK berubah selama proses hidup, jadi diambil satu kali di
// thread sampler lalu disimpan. `get_diagnostics` HANYA membaca — larangan
// membuat `sysinfo::System` di command tetap berlaku (pelajaran V8 fase 14).
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

/// Isi info host sekali. Dipanggil dari thread sampler.
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

/// Jumlahkan memori proses ini + semua turunannya (maks 6 tingkat).
/// HANYA dipanggil dari thread sampler — lihat catatan RAM_LAST.
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
        // Sampler total (WebView2) memakai instance sysinfo SENDIRI karena ia
        // menyegarkan SEMUA proses; jangan dicampur dengan yang pid-spesifik.
        let mut sys_all = sysinfo::System::new();
        let mut putaran: u64 = 0;
        // FASE 16.5: info host (OS, RAM fisik, CPU) diambil SEKALI di sini
        // supaya `get_diagnostics` tidak perlu menyentuh sysinfo sama sekali.
        isi_info_host(&mut sys_all);
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
            RAM_LAST.store(bytes, Ordering::Relaxed);
            RAM_PEAK.fetch_max(bytes, Ordering::Relaxed);

            // Total (termasuk WebView2) lebih mahal karena men-scan semua
            // proses → cukup tiap 4 putaran (12 detik).
            putaran += 1;
            if putaran % 4 == 1 {
                let total = hitung_total(&mut sys_all, pid);
                if total > 0 {
                    RAM_TOTAL_LAST.store(total, Ordering::Relaxed);
                    RAM_TOTAL_PEAK.fetch_max(total, Ordering::Relaxed);
                }
            }

            // `bytes` = proses ini saja (dipakai StatusBar sejak fase 02);
            // `total` ikut dikirim supaya UI bisa menampilkan angka jujur.
            if app
                .emit(
                    "ram-usage",
                    json!({ "bytes": bytes, "totalBytes": RAM_TOTAL_LAST.load(Ordering::Relaxed) }),
                )
                .is_err()
            {
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
