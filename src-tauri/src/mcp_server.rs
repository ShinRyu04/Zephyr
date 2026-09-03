// mcp_server.rs — server MCP Zephyr di 127.0.0.1:9222 (fase 11).
//
// PROTOKOL (ARCHITECTURE.md §4, prompt fase 11 §11.1):
//   POST /        JSON-RPC 2.0  { jsonrpc, id, method, params }
//   GET  /health  status ringan  — TIDAK butuh auth (cek cepat)
//   GET  /mcp     daftar tool + schema (discovery) — butuh auth
// Auth: header `Authorization: Bearer <token>`; token dari mcp.json.
// Bind HANYA ke 127.0.0.1 (loopback) — tidak pernah 0.0.0.0.
//
// PEMBAGIAN KERJA:
//   * Yang bisa dijawab Rust sendiri dijawab di sini: settings, PTY write/key,
//     karena PTY registry memang hidup di Rust (bukti terminal_write nyata).
//   * Yang butuh state UI (daftar pane, tab editor, buffer, run_command)
//     dikirim ke frontend lewat event `mcp-action` {reqId,type,payload},
//     frontend menjawab dengan command `mcp_reply`. Rust menunggu oneshot
//     dengan timeout 8 detik supaya satu tab yang hang tidak menahan server.
//   * Semua method dijalankan di bawah `AppState::mcp_lock` sehingga dua AI
//     CLI yang mengemudi bersamaan diproses SATU per satu (V11).

use crate::app_state::{AppState, McpRuntime};
use crate::errors::{ZResult, ZephyrError};
use axum::extract::State as AxState;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Batas tunggu jawaban frontend untuk satu method.
const UI_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

/// FASE 15.4: batas byte untuk `editor_write` / `editor_insert`.
/// Buffer tab hidup di WebView; menerima payload puluhan MB lewat IPC bisa
/// menghabiskan memori proses render. 1MB sama dengan batas ekstensi (fase 13).
const MAX_EDITOR_WRITE: usize = 1024 * 1024;

/// FASE 15.4: batas byte satu `terminal_write`. Menulis megabyte ke ConPTY
/// dalam satu panggilan membuat shell tersedak; agent harus memecah sendiri.
const MAX_TERMINAL_WRITE: usize = 64 * 1024;

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    token: String,
}

/// Status server untuk UI / command `mcp_status`.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    /// port yang diminta di settings (9222) — beda bila terpaksa fallback
    pub requested_port: u16,
    pub token: String,
    pub uptime_ms: u64,
    pub enabled: bool,
}

fn settings_enabled(state: &AppState) -> bool {
    crate::settings::read_settings_value(state)
        .get("mcp")
        .and_then(|m| m.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn settings_port(state: &AppState) -> u16 {
    crate::settings::read_settings_value(state)
        .get("mcp")
        .and_then(|m| m.get("port"))
        .and_then(|v| v.as_u64())
        .and_then(|n| u16::try_from(n).ok())
        .filter(|n| *n >= 1024)
        .unwrap_or(9222)
}

/// Nyalakan server. Port dari settings; bila terpakai coba port+1 (9223).
/// Port yang benar-benar dipakai ditulis balik ke settings.mcp.port.
pub async fn start(app: AppHandle) -> ZResult<u16> {
    let state = app.state::<AppState>();
    if let Some(p) = state.mcp_port() {
        return Ok(p); // sudah jalan
    }
    let cfg = crate::mcp_config::load_or_init(&state);
    if cfg.token.trim().is_empty() {
        return Err(ZephyrError::Mcp("token MCP kosong".into()));
    }

    let want = settings_port(&state);
    let mut listener = None;
    let mut used = want;
    // Whitelist port: hanya port yang diminta + 4 kandidat berikutnya
    // (9222..9226 secara default). Satu fallback saja tidak cukup — di mesin
    // dev 9223 sudah dipakai debug port WebView2, dan MCP tetap harus dapat
    // socket alih-alih mati total.
    let candidates: Vec<u16> = (0..5).filter_map(|i| want.checked_add(i)).collect();
    for cand in &candidates {
        match tokio::net::TcpListener::bind(("127.0.0.1", *cand)).await {
            Ok(l) => {
                used = *cand;
                listener = Some(l);
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(ZephyrError::Mcp(format!("bind {cand} gagal: {e}"))),
        }
    }
    let listener = listener.ok_or_else(|| {
        ZephyrError::Mcp(format!(
            "port {} semuanya terpakai program lain",
            candidates
                .iter()
                .map(|p| p.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    })?;

    let ctx = Ctx {
        app: app.clone(),
        token: cfg.token.clone(),
    };
    let router = Router::new()
        .route("/health", get(health))
        .route("/mcp", get(schema))
        .route("/", post(rpc))
        .route("/rpc", post(rpc))
        .with_state(Arc::new(ctx));

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    state.mcp_set_runtime(McpRuntime {
        port: used,
        requested: want,
        started: std::time::Instant::now(),
        shutdown: tx,
    });

    // Port hasil bind dicatat supaya UI & config CLI menunjuk port yang benar.
    let mut cfg2 = cfg.clone();
    cfg2.port = used;
    let _ = crate::mcp_config::save(&state, &cfg2);
    if used != want {
        let _ = crate::settings::patch_settings(&app, &state, json!({ "mcp": { "port": used } }));
        let _ = app.emit(
            "mcp-action",
            json!({ "type": "port-fallback", "payload": { "requested": want, "port": used } }),
        );
    }
    Ok(used)
}

/// Matikan server (socket ditutup — port tidak lagi listening).
///
/// FASE 15.4: permintaan yang masih menunggu jawaban UI dibatalkan dengan
/// error terstruktur ("MCP dimatikan…") supaya agent yang terhubung menerima
/// balasan JSON-RPC error alih-alih menggantung sampai timeout 8 detik.
pub fn stop(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let dibatalkan = state.mcp_fail_pending(
        "MCP dimatikan saat permintaan berjalan — coba lagi setelah server dinyalakan",
    );
    if dibatalkan > 0 {
        tracing::info!("mcp_stop membatalkan {dibatalkan} permintaan yang menggantung");
    }
    match state.mcp_take_runtime() {
        Some(rt) => {
            let _ = rt.shutdown.send(());
            true
        }
        None => false,
    }
}

// ───────────────────────── handler HTTP ─────────────────────────

fn unauthorized() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Bearer token salah atau tidak ada" })),
    )
        .into_response()
}

/// Tebak AI CLI mana yang menyapa dari User-Agent-nya.
///
/// Bukan identitas yang bisa dipercaya (UA gampang dipalsukan) — ini murni
/// label agar user tahu "ada sesuatu yang menyambung", jadi tidak dipakai untuk
/// keputusan keamanan apa pun. Auth tetap Bearer token.
fn tebak_cli(ua: &str) -> String {
    let low = ua.to_ascii_lowercase();
    for (kunci, nama) in [
        ("claude", "Claude Code"),
        ("codex", "Codex CLI"),
        ("gemini", "Gemini CLI"),
        ("opencode", "opencode"),
        ("copilot", "GitHub Copilot CLI"),
        ("cursor", "Cursor"),
        ("curl", "curl"),
        ("node", "Node/skrip"),
        ("python", "Python/skrip"),
    ] {
        if low.contains(kunci) {
            return nama.to_string();
        }
    }
    if ua.trim().is_empty() {
        "klien tak dikenal".to_string()
    } else {
        ua.chars().take(40).collect()
    }
}

fn bearer_ok(headers: &HeaderMap, token: &str) -> bool {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim() == token)
        .unwrap_or(false)
}

/// GET /health — tanpa auth. 503 bila MCP dimatikan di settings.
///
/// Selain status, handler ini juga MENCATAT siapa yang menyapa (fase 12):
/// health adalah hal pertama yang di-hit setiap AI CLI saat menyambung, jadi
/// dari sini panel MCP bisa menampilkan "MCP connected: <cli>" — bukti koneksi
/// yang nyata, bukan klaim.
async fn health(AxState(ctx): AxState<Arc<Ctx>>, headers: HeaderMap) -> axum::response::Response {
    let state = ctx.app.state::<AppState>();
    if !settings_enabled(&state) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "ok": false, "error": "MCP dimatikan di Settings" })),
        )
            .into_response();
    }
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let _ = ctx.app.emit(
        "mcp-connect",
        json!({ "client": tebak_cli(ua), "userAgent": ua }),
    );
    let counts = ui_call(&ctx.app, "counts", json!({}))
        .await
        .unwrap_or_else(|_| json!({ "panes": 0, "editors": 0 }));
    Json(json!({
        "ok": true,
        "version": ctx.app.package_info().version.to_string(),
        "uptimeMs": state.mcp_uptime_ms(),
        "port": state.mcp_port(),
        "panes": counts.get("panes").and_then(|v| v.as_u64()).unwrap_or(0),
        "editors": counts.get("editors").and_then(|v| v.as_u64()).unwrap_or(0),
    }))
    .into_response()
}

/// GET /mcp — daftar tool + schema (discovery), butuh auth.
async fn schema(AxState(ctx): AxState<Arc<Ctx>>, headers: HeaderMap) -> axum::response::Response {
    if !bearer_ok(&headers, &ctx.token) {
        return unauthorized();
    }
    Json(tools_schema()).into_response()
}

/// POST / — JSON-RPC 2.0. Batch (array) juga dilayani.
async fn rpc(
    AxState(ctx): AxState<Arc<Ctx>>,
    headers: HeaderMap,
    body: String,
) -> axum::response::Response {
    let state = ctx.app.state::<AppState>();
    if !settings_enabled(&state) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "MCP dimatikan di Settings" })),
        )
            .into_response();
    }
    if !bearer_ok(&headers, &ctx.token) {
        return unauthorized();
    }
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            return Json(json!({
                "jsonrpc": "2.0", "id": Value::Null,
                "error": { "code": -32700, "message": format!("parse error: {e}") }
            }))
            .into_response()
        }
    };

    match parsed {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for it in items {
                out.push(handle_one(&ctx.app, it).await);
            }
            Json(Value::Array(out)).into_response()
        }
        one => Json(handle_one(&ctx.app, one).await).into_response(),
    }
}

/// Satu permintaan JSON-RPC → satu balasan.
async fn handle_one(app: &AppHandle, req: Value) -> Value {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or_else(|| json!({}));

    if method.is_empty() {
        return json!({
            "jsonrpc": "2.0", "id": id,
            "error": { "code": -32600, "message": "method wajib ada" }
        });
    }

    // Serialisasi: dua agent yang mengemudi bersamaan diproses satu per satu.
    let state = app.state::<AppState>();
    let _guard = state.mcp_lock().lock().await;

    match dispatch(app, method, params).await {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(e) => json!({
            "jsonrpc": "2.0", "id": id,
            "error": { "code": rpc_code(&e), "message": e.to_string() }
        }),
    }
}

fn rpc_code(e: &ZephyrError) -> i32 {
    match e {
        ZephyrError::NotFound(_) => -32601,
        ZephyrError::InvalidInput(_) => -32602,
        _ => -32000,
    }
}

// ───────────────────────── schema tools ─────────────────────────

/// GET /mcp — discovery. Deskripsi tiap method + parameternya supaya agent
/// tahu apa yang tersedia tanpa membaca dokumentasi.
pub fn tools_schema() -> Value {
    fn tool(name: &str, desc: &str, props: Value, required: Vec<&str>) -> Value {
        json!({
            "name": name,
            "description": desc,
            "inputSchema": {
                "type": "object",
                "properties": props,
                "required": required
            }
        })
    }
    let s = |d: &str| json!({ "type": "string", "description": d });

    json!({
        "name": "zephyr",
        "version": 1,
        "transport": "http-jsonrpc",
        "endpoint": "POST http://127.0.0.1:9222/",
        "auth": "Authorization: Bearer <token dari Settings → MCP>",
        "notes": [
            "editor_write & editor_insert HANYA mengubah buffer tab — TIDAK menulis ke disk.",
            "screenshot_pane v1 menyimpan isi buffer terminal sebagai file teks di %TEMP%.",
            "Semua method diserialisasi: dua agent yang mengemudi bersamaan diproses satu per satu."
        ],
        "tools": [
            tool("list_panes", "Daftar pane terminal/browser: paneId, type, title, agent, pid, running.", json!({}), vec![]),
            tool("list_terminals", "Alias list_panes (shell/private/agent/ssh/browser).", json!({}), vec![]),
            tool("list_editors", "Tab editor yang terbuka: tabId, path, name, dirty, line, col.", json!({}), vec![]),
            tool("get_window", "Kondisi jendela: focusedPaneId, title, workspace, layout.", json!({}), vec![]),
            tool("list_extensions", "Ekstensi bawaan: id, enabled, version.", json!({}), vec![]),
            tool("get_settings", "Settings efektif tanpa secret (mcp.token dimask).", json!({}), vec![]),
            tool("get_setting", "Ambil satu setting dengan key bertitik, mis. 'editor.tabSize'.",
                 json!({ "key": s("key bertitik, mis. general.fontSize") }), vec!["key"]),
            tool("set_setting", "Ubah satu setting (hanya whitelist tampilan/editor).",
                 json!({ "key": s("key bertitik"), "value": json!({ "description": "nilai baru" }) }), vec!["key", "value"]),
            tool("terminal_write", "Kirim teks mentah ke pane terminal (tidak menambah Enter).",
                 json!({ "paneId": s("id pane dari list_panes"), "data": s("teks yang dikirim") }), vec!["paneId", "data"]),
            tool("terminal_key", "Kirim satu tombol: Enter, Ctrl+C, Ctrl+L, Ctrl+D, Arrow*, Tab, Escape, Backspace.",
                 json!({ "paneId": s("id pane"), "key": s("nama tombol") }), vec!["paneId", "key"]),
            tool("pane_new", "Buat pane baru: shell | private | agent | browser.",
                 json!({ "type": s("jenis pane"), "agent": s("id agent CLI bila type=agent") }), vec![]),
            tool("pane_close", "Tutup pane dan matikan prosesnya.",
                 json!({ "paneId": s("id pane") }), vec!["paneId"]),
            tool("editor_open", "Buka file di tab editor baru lalu fokuskan.",
                 json!({ "path": s("path absolut file") }), vec!["path"]),
            tool("editor_close", "Tutup tab editor (perubahan belum tersimpan dibuang).",
                 json!({ "tabId": s("id tab dari list_editors") }), vec!["tabId"]),
            tool("editor_write", "Ganti SELURUH isi buffer tab. Tidak menulis ke disk (unsaved=true).",
                 json!({ "tabId": s("id tab"), "content": s("isi baru") }), vec!["tabId", "content"]),
            tool("editor_insert", "Sisipkan teks ke buffer tab pada offset 'at' (default akhir).",
                 json!({ "tabId": s("id tab"), "text": s("teks"), "at": json!({ "type": "integer", "description": "offset karakter" }) }), vec!["tabId", "text"]),
            tool("run_command", "Jalankan command editor: commandPalette.open, terminal.new, ai.focus, git.commit, explorer.openFolder, view.settings, view.explorer, git.panel, terminal.toggle, editor.save.",
                 json!({ "id": s("id command") }), vec!["id"]),
            tool("screenshot_pane", "Simpan isi buffer pane ke file teks di %TEMP% lalu kembalikan path.",
                 json!({ "paneId": s("id pane") }), vec!["paneId"]),
            // fase 20: baca-saja, supaya AI CLI bisa melihat diagnostik & log
            // tanpa jalur tulis baru.
            tool("get_problems", "Daftar diagnostik (Problems) yang sedang tampil di panel bawah.",
                 json!({ "severity": s("filter opsional: error|warning|info|hint") }), vec![]),
            tool("get_output", "Isi satu channel Output panel bawah (zephyr, mcp, ssh, extensions, debug).",
                 json!({ "channel": s("id channel"), "tail": json!({ "type": "integer", "description": "ambil N baris terakhir" }) }), vec![]),
        ]
    })
}

/// Kirim `mcp-action` ke frontend lalu tunggu `mcp_reply` dengan reqId sama.
/// Frontend-lah yang memegang zustand (tab editor, pane, layout).
async fn ui_call(app: &AppHandle, kind: &str, payload: Value) -> ZResult<Value> {
    let state = app.state::<AppState>();
    let req_id = format!(
        "mcp{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let rx = state.mcp_register(&req_id);
    app.emit(
        "mcp-action",
        json!({ "reqId": req_id, "type": kind, "payload": payload }),
    )
    .map_err(|e| ZephyrError::Mcp(format!("emit gagal: {e}")))?;

    match tokio::time::timeout(UI_TIMEOUT, rx).await {
        Ok(Ok(v)) => {
            // Frontend melaporkan error lewat { error: "..." }.
            if let Some(msg) = v.get("error").and_then(|e| e.as_str()) {
                return Err(ZephyrError::Mcp(msg.to_string()));
            }
            Ok(v.get("result").cloned().unwrap_or(v))
        }
        Ok(Err(_)) => Err(ZephyrError::Mcp("jawaban UI dibatalkan".into())),
        Err(_) => {
            state.mcp_forget(&req_id);
            Err(ZephyrError::Mcp(format!(
                "UI tidak menjawab dalam {}s untuk '{kind}'",
                UI_TIMEOUT.as_secs()
            )))
        }
    }
}

fn need_str(params: &Value, key: &str) -> ZResult<String> {
    params
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| ZephyrError::InvalidInput(format!("param '{key}' wajib ada")))
}

/// Setting yang boleh diubah lewat MCP. Sengaja SEMPIT: apa pun yang
/// menyangkut kredensial, MCP itu sendiri, atau path tidak boleh disetel
/// dari luar proses (nanti agent bisa mematikan auth-nya sendiri).
const SET_WHITELIST: [&str; 10] = [
    "general.theme",
    "general.fontSize",
    "general.lineHeight",
    "general.zoom",
    "general.uiLang",
    "editor.tabSize",
    "editor.wordWrap",
    "editor.minimap",
    "editor.insertSpaces",
    "theme.current",
];

/// Bentuk patch bersarang dari "a.b" + nilai.
fn nested_patch(key: &str, value: Value) -> Value {
    let mut parts: Vec<&str> = key.split('.').collect();
    let mut cur = value;
    while let Some(last) = parts.pop() {
        cur = json!({ last: cur });
    }
    cur
}

fn dotted_get(root: &Value, key: &str) -> Option<Value> {
    let mut cur = root;
    for part in key.split('.') {
        cur = cur.get(part)?;
    }
    Some(cur.clone())
}

// ───────────────────────── dispatch method ─────────────────────────

async fn dispatch(app: &AppHandle, method: &str, params: Value) -> ZResult<Value> {
    let state = app.state::<AppState>();
    match method {
        // ── discovery ──
        "tools/list" | "list_tools" => Ok(tools_schema()),
        "ping" => Ok(json!({ "pong": true })),

        // ── read: state UI ──
        "list_panes" | "list_terminals" => ui_call(app, "list_panes", json!({})).await,
        "list_editors" => ui_call(app, "list_editors", json!({})).await,
        "get_window" => ui_call(app, "get_window", json!({})).await,
        "list_extensions" => ui_call(app, "list_extensions", json!({})).await,

        // ── read: settings (Rust, tanpa secret) ──
        "get_settings" => {
            let mut v = crate::settings::read_settings_value(&state);
            // Token MCP & metadata GitHub tidak ikut keluar.
            if let Some(m) = v.get_mut("mcp").and_then(|m| m.as_object_mut()) {
                m.insert("token".into(), Value::String("***".into()));
            }
            if let Some(g) = v.get_mut("git").and_then(|g| g.as_object_mut()) {
                g.remove("github");
            }
            Ok(v)
        }
        "get_setting" => {
            let key = need_str(&params, "key")?;
            let v = crate::settings::read_settings_value(&state);
            if key.starts_with("mcp.token") {
                return Err(ZephyrError::Permission("mcp.token tidak dibagikan".into()));
            }
            Ok(json!({ "key": key, "value": dotted_get(&v, &key) }))
        }
        "set_setting" => {
            let key = need_str(&params, "key")?;
            if !SET_WHITELIST.contains(&key.as_str()) {
                return Err(ZephyrError::Permission(format!(
                    "setting '{key}' tidak boleh diubah lewat MCP (whitelist: {})",
                    SET_WHITELIST.join(", ")
                )));
            }
            let value = params
                .get("value")
                .cloned()
                .ok_or_else(|| ZephyrError::InvalidInput("param 'value' wajib ada".into()))?;
            crate::settings::patch_settings(app, &state, nested_patch(&key, value.clone()))?;
            // Frontend memuat ulang supaya UI langsung ikut berubah.
            let _ = ui_call(app, "reload_settings", json!({})).await;
            Ok(json!({ "key": key, "value": value, "ok": true }))
        }

        // ── write: terminal (jalur PTY asli di Rust) ──
        // Serialisasi: `handle_one` sudah memegang `mcp_lock` untuk SETIAP
        // permintaan, jadi dua `terminal_write` bersamaan diproses berurutan
        // dan byte-nya tidak bisa saling menyelip (V dua-agent fase 15.4).
        "terminal_write" => {
            let pane = need_str(&params, "paneId")?;
            let data = params
                .get("data")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ZephyrError::InvalidInput("param 'data' wajib ada".into()))?;
            if data.len() > MAX_TERMINAL_WRITE {
                return Err(ZephyrError::InvalidInput(format!(
                    "data {} byte melewati batas {} byte (64KB) untuk terminal_write",
                    data.len(),
                    MAX_TERMINAL_WRITE
                )));
            }
            pty_write_raw(&state, &pane, data)?;
            Ok(json!({ "ok": true, "paneId": pane, "bytes": data.len() }))
        }
        "terminal_key" => {
            let pane = need_str(&params, "paneId")?;
            let key = need_str(&params, "key")?;
            let seq = match key.as_str() {
                "Enter" => "\r",
                "Ctrl+C" => "\x03",
                "Ctrl+L" => "\x0c",
                "Ctrl+D" => "\x04",
                "ArrowUp" | "Up" => "\x1b[A",
                "ArrowDown" | "Down" => "\x1b[B",
                "ArrowLeft" | "Left" => "\x1b[D",
                "ArrowRight" | "Right" => "\x1b[C",
                "Tab" => "\t",
                "Escape" => "\x1b",
                "Backspace" => "\x7f",
                other => {
                    return Err(ZephyrError::InvalidInput(format!(
                        "key '{other}' tidak dikenal"
                    )))
                }
            };
            pty_write_raw(&state, &pane, seq)?;
            Ok(json!({ "ok": true, "paneId": pane, "key": key }))
        }

        // ── write: pane & editor (butuh UI) ──
        "pane_new" => {
            let kind = params
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("shell")
                .to_string();
            ui_call(
                app,
                "pane_new",
                json!({ "type": kind, "agent": params.get("agent") }),
            )
            .await
        }
        "pane_close" => {
            let pane = need_str(&params, "paneId")?;
            ui_call(app, "pane_close", json!({ "paneId": pane })).await
        }
        // fase 20: baca-saja. Store-nya di frontend, jadi tetap lewat ui_call.
        "get_problems" => {
            ui_call(
                app,
                "get_problems",
                json!({ "severity": params.get("severity") }),
            )
            .await
        }
        "get_output" => {
            ui_call(
                app,
                "get_output",
                json!({ "channel": params.get("channel"), "tail": params.get("tail") }),
            )
            .await
        }
        "editor_open" => {
            let path = need_str(&params, "path")?;
            ui_call(app, "editor_open", json!({ "path": path })).await
        }
        "editor_close" => {
            let tab = need_str(&params, "tabId")?;
            ui_call(app, "editor_close", json!({ "tabId": tab })).await
        }
        "editor_write" => {
            let tab = need_str(&params, "tabId")?;
            let content = params
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ZephyrError::InvalidInput("param 'content' wajib ada".into()))?;
            // FASE 15.4: batas ukuran. Tanpa ini satu panggilan agent bisa
            // mengirim buffer puluhan MB lewat IPC ke WebView dan menghabiskan
            // memori proses render (OOM) — ditolak lebih awal, di Rust.
            if content.len() > MAX_EDITOR_WRITE {
                return Err(ZephyrError::InvalidInput(format!(
                    "content {} byte melewati batas {} byte (1MB) untuk editor_write",
                    content.len(),
                    MAX_EDITOR_WRITE
                )));
            }
            // Kontrak keras: buffer saja, TIDAK menulis disk.
            ui_call(
                app,
                "editor_write",
                json!({ "tabId": tab, "content": content }),
            )
            .await
        }
        "editor_insert" => {
            let tab = need_str(&params, "tabId")?;
            let text = params
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ZephyrError::InvalidInput("param 'text' wajib ada".into()))?;
            if text.len() > MAX_EDITOR_WRITE {
                return Err(ZephyrError::InvalidInput(format!(
                    "text {} byte melewati batas {} byte (1MB) untuk editor_insert",
                    text.len(),
                    MAX_EDITOR_WRITE
                )));
            }
            ui_call(
                app,
                "editor_insert",
                json!({ "tabId": tab, "text": text, "at": params.get("at") }),
            )
            .await
        }
        "run_command" => {
            let id = need_str(&params, "id")?;
            ui_call(app, "run_command", json!({ "id": id })).await
        }
        "screenshot_pane" => {
            let pane = need_str(&params, "paneId")?;
            screenshot(app, &pane).await
        }

        other => Err(ZephyrError::NotFound(format!("method '{other}'"))),
    }
}

/// Tulis ke PTY lewat registry Rust (bukan lewat UI) supaya teks benar-benar
/// masuk ke shell walau jendela tidak fokus.
fn pty_write_raw(state: &AppState, pane: &str, data: &str) -> ZResult<()> {
    use std::io::Write;
    state.with_pty(pane, |s| {
        let mut w = s
            .writer
            .lock()
            .map_err(|_| ZephyrError::Pty("writer terkunci".into()))?;
        w.write_all(data.as_bytes())
            .map_err(|e| ZephyrError::Pty(format!("tulis gagal: {e}")))?;
        w.flush()
            .map_err(|e| ZephyrError::Pty(format!("flush gagal: {e}")))?;
        Ok(())
    })
}

/// screenshot_pane v1: isi buffer terminal pane ditulis ke file di %TEMP%,
/// agent membaca file itu. PNG asli butuh capture window (fase 16) — jangan
/// mengaku mengembalikan PNG kalau yang ditulis teks.
async fn screenshot(app: &AppHandle, pane: &str) -> ZResult<Value> {
    let text = ui_call(app, "pane_text", json!({ "paneId": pane })).await?;
    let body = text
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let dir = std::env::temp_dir();
    let name = format!(
        "zephyr-pane-{}-{}.txt",
        pane.replace(|c: char| !c.is_ascii_alphanumeric(), ""),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    );
    let path = dir.join(name);
    std::fs::write(&path, body.as_bytes())?;
    let p = path.to_string_lossy().to_string();
    let _ = app.emit("mcp-screenshot", json!({ "paneId": pane, "path": p }));
    Ok(json!({
        "paneId": pane,
        "path": p,
        "format": "text",
        "note": "v1 menyimpan isi buffer terminal sebagai teks; capture PNG jendela menyusul di fase 16"
    }))
}
