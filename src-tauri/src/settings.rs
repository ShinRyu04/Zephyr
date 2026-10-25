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
            "uiLang": "en",
            "zoom": 100,
            "restoreSession": true,
            "checkUpdates": true,
            "lowRam": false,

            "aiPanel": "bottom",
            "layout": "default",

            // New in 1.2.0. Defaults are the conservative ones:
            //  - confirmExit true, because closing with unsaved edits and losing
            //    them is not something a user can undo;
            //  - minimizeToTray false, because an app that keeps running after
            //    you close the window is surprising if you did not ask for it;
            //  - defaultTerminal "default", meaning the shell the OS already
            //    uses, so nothing changes for anyone who does not pick;
            //  - shellPath "" meaning "use defaultTerminal".
            //
            // New in 1.3.0, for the chat avatars:
            //  - chatAvatar true, because the avatars are the point of the
            //    feature and a switch nobody finds is a feature nobody has;
            //  - userAvatarPath "", meaning "no photo chosen" - the UI then
            //    falls back to the signed-in GitHub photo, and failing that to
            //    the user's initial. Storing a PATH rather than image bytes
            //    keeps settings.json small and text-only.
            "confirmExit": true,
            "minimizeToTray": false,
            "defaultTerminal": "default",
            "shellPath": "",
            "chatAvatar": true,
            "userAvatarPath": ""
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
            "bracketPairColorization": true,
            "vimMode": false,
            "autoSave": "off",
            "autoSaveDelay": 1000,

            // Setiap kunci di bawah WAJIB ada di sini juga, bukan hanya di
            // `DEFAULT_SETTINGS` (types.ts). `get_settings` menggabungkan
            // default Rust ini dengan settings.json milik user, dan frontend
            // TIDAK pernah mengisi kekosongan di `editor.*` - ia hanya
            // menambal beberapa kunci `general.*` (lihat `normalisasiSettings`
            // di store.ts). Jadi kunci yang lupa didaftarkan di sini tiba di
            // komponen sebagai `undefined`, dan default yang tertulis di
            // types.ts tidak pernah berlaku: `codeFolding: true` tetap
            // membuat folding MATI, dan `lineNumbers: 'on'` membuat dropdown
            // tidak punya opsi yang cocok dengan nilainya.
            "codeFolding": true,
            "diagLens": false,
            "gitBlame": false,
            "lineNumbers": "on",
            "scrollMargin": 3,
            "scrollPastEnd": false,
            "autoscrollOnClick": true,
            "centeredWidth": 0,
            "fixAllOnSave": false,
            "gitGutter": false,
            "inlayHints": false,
            "semanticTokens": false,
            "debugInlineValues": false
        },
        "theme": { "current": "zephyr-dark", "accent": "#3884ff" },
        "shortcuts": {},
        "models": { "activeProvider": "custom", "providers": {}, "answerLang": "follow", "answerStyle": "short", "ragEnabled": false, "ragUrl": "http://localhost:7777", "ragProject": "", "ragK": 4 },
        "agents": { "maxPanes": 6, "order": [], "startCommands": {}, "attachActiveFile": false, "customInstructions": "", "chatAvatar": true, "userAvatarPath": "" },

        // Rules: the write guard. OFF by default.
        //
        // Off, not on, because it REFUSES WRITES. A tool that says no to a save
        // is a different order of intrusive from one that adds an underline, and
        // it must be opted into. The default here and the default in
        // `rulesRuntime.ts` have to agree, or the UI shows one state and the
        // write path enforces the other.
        "rules": {
            "enabled": false,
            "disabled": []
        },

        "extensions": {
            "enabled": [],
            "trust": {},

            "registryUrl": "",
            "registryUrls": []
        },

        "accessibility": {
            "reducedMotion": false,
            "screenReader": false,
            "autoFocusDialog": true,
            "toastDurasiMin": 3200
        },
        "git": { "defaultBranch": "main", "pullBeforePush": true, "github": { "method": "none", "clientId": "" } },

        "allowCommands": [],

        // ------------------------------------------------------------------
        // KEBIJAKAN ISI WEB (`zeph-buka-jaringan-lokal`) - SEMUA default AMAN.
        //
        // Lima setelan ini dibaca `src/lib/zephyrTools/kebijakanIsiWeb.ts`
        // (`kebijakanDariSetelan`) dan `src-tauri/src/web.rs`. Setiap kunci
        // WAJIB ada di sini juga, bukan hanya di `DEFAULT_SETTINGS` (types.ts):
        // `get_settings` men-deep-merge default Rust ini dengan settings.json,
        // dan pembaca kebijakan membaca field yang TIDAK ADA sebagai default
        // AMAN (fail-closed) - jadi kunci yang lupa didaftarkan di sini hanya
        // membuat fitur "tidak pernah menyala", bukan membuka apa pun.
        //
        //   izinIsiWeb        : opt-in isi web. MATI = nol permintaan jaringan.
        //   allowlistWeb      : daftar host yang boleh. Kosong = tolak semua.
        //   izinJaringanLokal : opt-in jaringan lokal. MATI = loopback/privat/
        //                       link-local/CGNAT dan `*.local` ditolak.
        //   portWeb           : port sah di luar 80/443 (80/443 selalu sah).
        //   hopRedirect       : plafon hop redirect (keras: 10).
        //
        // `169.254.169.254` (metadata cloud) TETAP ditolak walau
        // `izinJaringanLokal` menyala - bukan setelan, tapi aturan tetap.
        "izinIsiWeb": false,
        "allowlistWeb": [],
        "izinJaringanLokal": false,
        "portWeb": [80, 443],
        "hopRedirect": 5,

        "subagent": {
            "maxParallel": 4,
            "maxSteps": 15,
            // Subagent file writes. OFF by default, and that default is the one
            // the UI has to be honest about.
            //
            // This flag opens the write CLASS, not a file. A second gate still
            // applies: a subagent that wants to change a file on disk needs the
            // approval mode `auto`, because a subagent has no approval card of
            // its own to ask the user with. So `true` here means "may write",
            // not "will write" - turn it on and a write can still be refused,
            // with the refusal reported back instead of a silent no-op.
            "allowWrite": false,
            "showPanel": true,
            "autoCollapse": true,
            "model": "",
            "provider": "",
            "idleSecs": 90
        },

        // HydraFusion: adaptive model orchestration for the main chat.
        //
        // OFF by default. When it is on it can spend up to `maxRequests`
        // provider calls on ONE turn (escalation, or draft+critique+revision),
        // so enabling it is a deliberate answer to "may this cost more than a
        // plain turn". `tiers` is empty on purpose: an empty ref means the
        // frontend derives the rung from the model catalog, which keeps this
        // default from naming a model that may not be configured.
        //
        // Every key has to be listed here. settings_load deep-merges the stored
        // file over these defaults, so a missing key arrives as `undefined` in
        // the frontend and the feature reads as off forever.
        "hydrafusion": {
            "enabled": false,
            "tiers": { "cheap": "", "mid": "", "strong": "" },
            "maxRequests": 3
        },
        // `allow_terminal_control` sudah dibaca di mcp_server.rs sejak lama,
        // tapi bawaannya harus ditulis eksplisit di sini juga. Tanpa kunci ini,
        // pengaturan bawaan tidak pernah memuatnya, jadi nilainya tetap
        // `false` dan fiturnya tidak bisa dihidupkan dari UI manapun.
        "mcp": {
            "enabled": false,

            // Nyalakan server MCP sendiri saat aplikasi dibuka.
            //
            // `enabled` adalah keadaan saat ini (ditulis oleh mcp_start /
            // mcp_stop), `autostart` adalah NIAT untuk sesi berikutnya. Dipisah
            // supaya mematikan server sekali tidak membatalkan autostart.
            // Harus sama dengan `mcp.autostart` di src/lib/types.ts.
            "autostart": false,

            "port": 9222,
            "token": "",
            "writeToCli": [],
            "allow_terminal_control": false,

            // Berapa tool per server MCP pihak ketiga yang dikirim ke model.
            // Harus sama dengan `mcp.maxToolsPerServer` di src/lib/types.ts:
            // settings_load menimpa berkas tersimpan di atas nilai bawaan ini,
            // jadi kunci yang hilang tiba di frontend sebagai undefined.
            "maxToolsPerServer": 40,
        },
        "ssh": { "recentHosts": [] },

        "panel": {
            "visibleTabs": ["problems", "output", "debug", "terminal", "ports", "ai", "subagents"],
            "activeTab": "terminal",
            "height": 260
        },

        "lsp": { "enabled": true, "idleSeconds": 300, "servers": {} },

        // Dev Environment. Every key must exist here: settings_load deep-merges
        // the stored file over this default, so a key missing from the default
        // would arrive as undefined in the frontend.
        "devenv": {
            "rootFolder": "D:\\DevEnv",
            "domain": ".test",
            "server": "nginx",
            "runtimes": {},
            "services": {},
            "projects": []
        },

        "history": { "enabled": true, "maxPerFile": 200, "maxDays": 30, "maxTotal": 2000 },
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
    let mut err_terakhir: Option<serde_json::Error> = None;

    for percobaan in 0..4 {
        let raw = match std::fs::read_to_string(path) {
            Ok(r) => r,
            Err(_) => return None,
        };
        if raw.trim().is_empty() {
            if percobaan == 3 {
                return None;
            }
            std::thread::sleep(std::time::Duration::from_millis(60));
            continue;
        }
        // Strip the UTF-8 BOM when present: serde_json rejects it and treats
        // the file as "corrupt" even though the contents are valid. That was
        // the reason the file kept being moved to .broken-*.
        let bersih = raw.trim_start_matches('\u{feff}');
        match serde_json::from_str(bersih) {
            Ok(v) => return Some(v),
            Err(e) => {
                err_terakhir = Some(e);
                if percobaan < 3 {
                    std::thread::sleep(std::time::Duration::from_millis(60));
                }
            }
        }
    }

    let e = err_terakhir?;
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
        "{} is corrupt ({e}) — {} to {}",
        path.display(),
        if ok { "moved" } else { "MOVE FAILED" },
        backup.display()
    );
    if ok {
        if let Ok(mut slot) = LAST_BROKEN.lock() {
            *slot = backup.to_string_lossy().to_string();
        }
    }
    None
}

static LAST_BROKEN: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
#[tauri::command(async)]
pub fn take_broken_config() -> ZResult<String> {
    let mut slot = LAST_BROKEN
        .lock()
        .map_err(|_| ZephyrError::Internal("lock LAST_BROKEN".into()))?;
    Ok(std::mem::take(&mut *slot))
}

fn baca_untuk_patch(path: &PathBuf) -> Option<Value> {
    match std::fs::read_to_string(path) {
        Ok(_) => read_json_um(path),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Some(json!({})),
        Err(_) => {
            std::thread::sleep(std::time::Duration::from_millis(120));
            match std::fs::read_to_string(path) {
                Ok(_) => read_json_um(path),
                Err(e2) if e2.kind() == std::io::ErrorKind::NotFound => Some(json!({})),
                Err(_) => None,
            }
        }
    }
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
        return Err(ZephyrError::InvalidInput(
            "keybindings must be an array".into(),
        ));
    }
    write_json(&state.file("keybindings.json"), &bindings)?;
    let _ = app.emit("settings-changed", json!({ "key": "keybindings" }));
    tracing::info!(
        n = bindings.as_array().map(|a| a.len()).unwrap_or(0),
        "keybindings.json written"
    );
    Ok(())
}

fn write_json(path: &PathBuf, v: &Value) -> ZResult<()> {
    let bytes = serde_json::to_vec_pretty(v)?;
    /* Memakai helper bersama `tulis_aman`: satu implementasi penulisan atomik
    untuk seluruh proyek. Sebelumnya ada dua salinan (di sini dan di
    secrets.rs), dan dua salinan berarti salah satunya bisa diperbaiki dan
    yang lain tertinggal. */
    crate::tulis_aman::tulis_atomik(path, &bytes)
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<AppState>) -> ZResult<AppInfo> {
    let webview = webview_version();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();

    let portable = !exe_dir.is_empty() && crate::cli_ext::portable_aktif();
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
    /*
     * The Prompt AI override was removed: whoever the AI is comes from the
     * persona alone now. A settings file written by an older build still
     * carries the key, and because the merge above only ever ADDS, it would be
     * handed back forever - a key nothing reads, and a second place that
     * pretends to control the prompt. Strip it on read so the file converges
     * on the current shape instead of keeping history around.
     */
    if let Some(obj) = merged.as_object_mut() {
        obj.remove("aiPrompt");
    }
    Ok(merged)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, state: State<AppState>, patch: Value) -> ZResult<()> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput(
            "the patch must be an object".into(),
        ));
    }
    let path = state.file("settings.json");
    let mut current = match baca_untuk_patch(&path) {
        Some(v) => v,
        None => return Err(ZephyrError::Internal("settings.json could not be read; the patch was cancelled so it will not overwrite your data".into())),
    };
    deep_merge_um(&mut current, &patch);
    write_json(&path, &current)?;

    if let Value::Object(map) = &patch {
        for k in map.keys() {
            let _ = app.emit("settings-changed", json!({ "key": k }));
        }
    }
    Ok(())
}

/*
 * ======================= Profil setelan (ekspor / impor) ===================
 *
 * Profil = settings.json yang bisa dibawa ke mesin lain atau disimpan sebagai
 * cadangan. Yang TIDAK ikut sengaja dibuang, karena isinya hanya bermakna di
 * mesin ini dan akan menyesatkan bila dipulihkan di tempat lain:
 *
 *  - `update`: versi terakhir yang dilihat + pengumuman yang sudah dibaca.
 *    Kalau ikut, mesin baru mengira ia sudah melewati versi yang belum pernah
 *    dilihatnya, dan banner pembaruan tidak pernah muncul.
 *  - `general.userAvatarPath` dan `background.image`: path absolut ke berkas
 *    milik pengguna di mesin lama. Di mesin lain path itu tidak ada, dan latar
 *    belakang yang menunjuk berkas hilang tampil sebagai kotak kosong.
 *
 * Kunci di luar `default_settings()` juga dibuang saat impor: berkas profil
 * yang ditulis tangan atau dari versi yang jauh lebih baru tidak boleh
 * menyelipkan kunci asing ke settings.json.
 */

const PROFIL_APP: &str = "zephyr";

fn profil_bersih(v: &mut Value) {
    if let Some(o) = v.as_object_mut() {
        o.remove("update");
        if let Some(g) = o.get_mut("general").and_then(|x| x.as_object_mut()) {
            g.remove("userAvatarPath");
        }
        if let Some(b) = o.get_mut("background").and_then(|x| x.as_object_mut()) {
            b.remove("image");
        }
    }
}

/// Buang bagian profil yang tidak boleh masuk ke settings.json mesin ini.
///
/// Dipisah dari perintahnya supaya bisa diuji tanpa AppHandle - dan yang diuji
/// justru bagian yang menentukan berkas apa yang boleh menimpa data pengguna.
fn saring_profil(v: &mut Value) -> Result<(), String> {
    let o = match v.as_object_mut() {
        Some(o) => o,
        None => return Err("a settings profile must be a JSON object".into()),
    };

    if let Some(app_name) = o
        .get("_profile")
        .and_then(|p| p.get("app"))
        .and_then(|a| a.as_str())
    {
        if app_name != PROFIL_APP {
            return Err(format!("that profile belongs to \"{app_name}\", not Zephyr"));
        }
    }
    o.remove("_profile");
    o.remove("update");

    let dikenal: std::collections::HashSet<String> = default_settings()
        .as_object()
        .map(|d| d.keys().cloned().collect())
        .unwrap_or_default();
    o.retain(|k, _| dikenal.contains(k));

    if o.is_empty() {
        return Err("no Zephyr settings were found in that file".into());
    }
    Ok(())
}

fn detik_sekarang() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command(async)]
pub fn settings_export(app: AppHandle, state: State<AppState>, path: String) -> ZResult<String> {
    let tujuan = PathBuf::from(path.trim());
    if tujuan.as_os_str().is_empty() {
        return Err(ZephyrError::InvalidInput("no destination path given".into()));
    }
    /* Path datang dari dialog simpan, jadi pengguna sudah memilihnya sendiri.
    `allow` mencatatnya supaya jalur tulis lain di aplikasi juga mengenalnya. */
    state.allow(&tujuan);

    let mut profil = default_settings();
    if let Some(user) = read_json_um(&state.file("settings.json")) {
        deep_merge_um(&mut profil, &user);
    }
    profil_bersih(&mut profil);

    if let Some(o) = profil.as_object_mut() {
        o.insert(
            "_profile".into(),
            json!({
                "app": PROFIL_APP,
                "version": app.package_info().version.to_string(),
                "exportedAt": detik_sekarang(),
                "portable": crate::cli_ext::portable_aktif(),
            }),
        );
    }

    let bytes = serde_json::to_vec_pretty(&profil)?;
    crate::tulis_aman::tulis_atomik(&tujuan, &bytes)?;
    tracing::info!(path = %tujuan.display(), "settings profile exported");
    Ok(tujuan.to_string_lossy().to_string())
}

#[tauri::command(async)]
pub fn settings_import(app: AppHandle, state: State<AppState>, path: String) -> ZResult<Value> {
    let sumber = PathBuf::from(path.trim());
    let meta = std::fs::metadata(&sumber).map_err(|e| {
        ZephyrError::InvalidInput(format!("the settings profile could not be read: {e}"))
    })?;
    if meta.len() > 4 * 1024 * 1024 {
        return Err(ZephyrError::InvalidInput(
            "the settings profile is larger than 4 MB; that is not a Zephyr profile".into(),
        ));
    }
    let raw = std::fs::read_to_string(&sumber).map_err(|e| {
        ZephyrError::InvalidInput(format!("the settings profile could not be read: {e}"))
    })?;
    let mut masuk: Value = serde_json::from_str(raw.trim_start_matches('\u{feff}'))
        .map_err(|e| ZephyrError::InvalidInput(format!("the settings profile is not valid JSON: {e}")))?;

    saring_profil(&mut masuk).map_err(ZephyrError::InvalidInput)?;

    let dipakai: Vec<String> = masuk
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();

    let target = state.file("settings.json");
    let mut current = match baca_untuk_patch(&target) {
        Some(v) => v,
        None => {
            return Err(ZephyrError::Internal(
                "settings.json could not be read; the import was cancelled so it will not overwrite your data"
                    .into(),
            ))
        }
    };
    deep_merge_um(&mut current, &masuk);
    write_json(&target, &current)?;

    for k in &dipakai {
        let _ = app.emit("settings-changed", json!({ "key": k }));
    }
    tracing::info!(path = %sumber.display(), keys = dipakai.len(), "settings profile imported");

    let mut merged = default_settings();
    if let Some(user) = read_json_um(&target) {
        deep_merge_um(&mut merged, &user);
    }
    Ok(merged)
}

#[tauri::command]
pub fn set_window_size(app: AppHandle, width: f64, height: f64) -> ZResult<()> {
    if width < 400.0 || height < 300.0 {
        return Err(ZephyrError::InvalidInput("size too small".into()));
    }
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| ZephyrError::Internal("there is no main window".into()))?;
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
        return Err(ZephyrError::InvalidInput(format!("{path} is not a folder")));
    }
    let canon = crate::app_state::normalize(&p);
    let as_string = canon.to_string_lossy().to_string();

    if crate::paths::is_drive_root(&canon) {
        return Err(ZephyrError::InvalidInput(format!(
            "{as_string} is a drive root — open a project folder inside it, not the whole disk (scanning a root can take tens of minutes and touch system folders)"
        )));
    }

    state.clear_roots();
    state.set_workspace(canon.clone())?;
    /* Pilihan repo Source Control milik workspace LAMA. Membuka folder baru
    berarti mulai dari workspace itu sendiri; tanpa ini, repo di dalam folder
    baru yang kebetulan punya path sama bisa langsung terpilih diam-diam. */
    let _ = state.set_scm_repo(None);

    state.allow_exact(&canon);
    push_recent(&state, &as_string)?;
    state.perf_mark("workspace_open", None);
    tracing::info!(path = %as_string, "workspace opened");

    let _ = app.emit("workspace-opened", json!({ "path": as_string }));
    Ok(())
}

#[tauri::command]
pub fn workspace_close(state: State<AppState>) -> ZResult<()> {
    state.stop_watcher();
    state.clear_workspace();
    tracing::info!("workspace closed");
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
        return Err(ZephyrError::InvalidInput(
            "the patch must be an object".into(),
        ));
    }
    let path = state.file("settings.json");
    let mut current = match baca_untuk_patch(&path) {
        Some(v) => v,
        None => return Err(ZephyrError::Internal("settings.json could not be read; the patch was cancelled so it will not overwrite your data".into())),
    };
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

    /*
     * Total only ZEPHYR processes (itself plus its descendants).
     *
     * Walking the parent chain must stop on certainty that the process really
     * is ours. ON WINDOWS, a parent PID is reused after the process dies: a PID
     * belonging to a finished process can be held by a DIFFERENT process, so an
     * unbounded "walk until we find Zephyr" search can reach a system process
     * and total up the whole machine (it once reported 13.9 GB while Zephyr
     * was only ~110 MB).
     *
     * The 6-level limit is still used, BUT the number of processes walked is
     * capped too so that one long chain cannot drag in unrelated processes.
     */
    let mut total = sys.process(own).map(|p| p.memory()).unwrap_or(0);

    for (pid, proc_) in sys.processes() {
        if *pid == own {
            continue;
        }

        let mulai = match proc_.parent() {
            Some(p) => p,
            None => continue,
        };

        // The parent chain must REALLY reach our PID.
        let mut cur = Some(mulai);
        let mut depth = 0usize;
        let mut milik_kita = false;
        while let Some(p) = cur {
            if p == own {
                milik_kita = true;
                break;
            }
            if p.as_u32() == 0 {
                break;
            }
            cur = sys.process(p).and_then(|x| x.parent());
            depth += 1;
            if depth > 6 {
                break;
            }
        }

        if milik_kita {
            total += proc_.memory();
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

#[cfg(test)]
mod tests_profil {
    use super::*;

    #[test]
    fn ekspor_membuang_state_yang_hanya_berlaku_di_mesin_ini() {
        let mut v = default_settings();
        v["background"]["image"] = json!("C:/Users/lama/foto.png");
        v["general"]["userAvatarPath"] = json!("C:/Users/lama/avatar.png");
        v["update"]["lastSeenVersion"] = json!("9.9.9");

        profil_bersih(&mut v);

        assert!(v["background"].get("image").is_none());
        assert!(v["general"].get("userAvatarPath").is_none());
        assert!(v.get("update").is_none());
        /* Yang bukan state mesin tetap ada. */
        assert!(v["general"].get("fontSize").is_some());
    }

    #[test]
    fn impor_menolak_berkas_yang_bukan_profil() {
        let mut v = json!([1, 2, 3]);
        assert!(saring_profil(&mut v).is_err());

        let mut kosong = json!({ "halo": "dunia" });
        assert!(saring_profil(&mut kosong).is_err());
    }

    #[test]
    fn impor_menolak_profil_aplikasi_lain() {
        let mut v = json!({ "_profile": { "app": "editor-lain" }, "general": {} });
        assert!(saring_profil(&mut v).is_err());
    }

    #[test]
    fn impor_membuang_kunci_asing_dan_mempertahankan_yang_dikenal() {
        let mut v = json!({
            "_profile": { "app": "zephyr", "version": "1.4.0" },
            "general": { "fontSize": 15 },
            "tidakDikenal": { "apa": true },
            "update": { "lastSeenVersion": "9.9.9" }
        });

        saring_profil(&mut v).unwrap();

        assert_eq!(v["general"]["fontSize"], json!(15));
        assert!(v.get("tidakDikenal").is_none());
        assert!(v.get("update").is_none());
        assert!(v.get("_profile").is_none());
    }
}
