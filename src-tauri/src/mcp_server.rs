use crate::app_state::{AppState, McpRuntime};
use crate::errors::{ZResult, ZephyrError};
use axum::extract::State as AxState;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio_stream::StreamExt as _;
use tauri::{AppHandle, Emitter, Manager};

const UI_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

const MAX_EDITOR_WRITE: usize = 1024 * 1024;

const MAX_TERMINAL_WRITE: usize = 64 * 1024;

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    token: String,
    sse: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::mpsc::Sender<String>>>>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,

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

pub async fn start(app: AppHandle) -> ZResult<u16> {
    let state = app.state::<AppState>();
    if let Some(p) = state.mcp_port() {
        return Ok(p);
    }
    let cfg = crate::mcp_config::load_or_init(&state);
    if cfg.token.trim().is_empty() {
        return Err(ZephyrError::Mcp("token MCP kosong".into()));
    }

    let want = settings_port(&state);
    let mut listener = None;
    let mut used = want;

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
        sse: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
    };
    let router = Router::new()
        .route("/health", get(health))
        .route("/schema", get(schema))
        .route("/mcp", get(mcp_get).post(rpc))
        .route("/sse", get(mcp_get))
        .route("/messages", post(messages))
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

fn unauthorized() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Bearer token salah atau tidak ada" })),
    )
        .into_response()
}

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
    Json(json!({
        "ok": true,
        "version": ctx.app.package_info().version.to_string(),
        "uptimeMs": state.mcp_uptime_ms(),
        "port": state.mcp_port(),
        "panes": 0,
        "editors": 0,
    }))
    .into_response()
}

async fn schema(AxState(ctx): AxState<Arc<Ctx>>, headers: HeaderMap) -> axum::response::Response {
    if !bearer_ok(&headers, &ctx.token) {
        return unauthorized();
    }
    Json(tools_schema()).into_response()
}

async fn mcp_get(
    AxState(ctx): AxState<Arc<Ctx>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let state = ctx.app.state::<AppState>();
    use axum::body::Body;
    use axum::response::Response;
    if !settings_enabled(&state) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "ok": false, "error": "MCP dimatikan di Settings" })),
        )
            .into_response();
    }
    if !bearer_ok(&headers, &ctx.token) {
        return unauthorized();
    }

    let port = state.mcp_port().unwrap_or(9222);
    let sid = format!(
        "s{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let endpoint = format!("http://127.0.0.1:{port}/messages?sessionId={sid}");
    let body_awal = format!("event: endpoint\ndata: {endpoint}\n\n");

    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);
    {
        if let Ok(mut m) = ctx.sse.lock() {
            m.insert(sid.clone(), tx.clone());
        }
    }

    let ctx2 = ctx.clone();
    let sid2 = sid.clone();
    tokio::spawn(async move {
        let _ = tx.send(body_awal).await;
        let mut tik = tokio::time::interval(std::time::Duration::from_secs(15));
        tik.tick().await;
        loop {
            tokio::select! {
                _ = tik.tick() => {
                    if tx.send(": ping\n\n".to_string()).await.is_err() {
                        break;
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => break,
            }
        }
        if let Ok(mut m) = ctx2.sse.lock() {
            m.remove(&sid2);
        }
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx)
        .map(|s| Ok::<axum::body::Bytes, std::io::Error>(axum::body::Bytes::from(s)));
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn messages(
    AxState(ctx): AxState<Arc<Ctx>>,
    headers: HeaderMap,
    body: String,
) -> axum::response::Response {
    let sid = headers
        .get("x-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let sid = match sid {
        Some(s) => Some(s),
        None => ctx.sse.lock().ok().and_then(|m| m.keys().next().cloned()),
    };
    let resp = rpc(AxState(ctx.clone()), headers, body).await;
    if let Some(sid) = sid {
        let (parts, bytes) = {
            use axum::body::to_bytes;
            let (p, b) = resp.into_parts();
            let b = to_bytes(b, 4 * 1024 * 1024).await.unwrap_or_default();
            (p, b)
        };
        if let Ok(txt) = String::from_utf8(bytes.to_vec()) {
            if let Ok(m) = ctx.sse.lock() {
                if let Some(tx) = m.get(&sid) {
                    let ev = format!("event: message\ndata: {txt}\n\n");
                    let _ = tx.try_send(ev);
                }
            }
        }
        let _ = parts;
        return StatusCode::ACCEPTED.into_response();
    }
    resp
}

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

            tool("get_problems", "Daftar diagnostik (Problems) yang sedang tampil di panel bawah.",
                 json!({ "severity": s("filter opsional: error|warning|info|hint") }), vec![]),
            tool("get_output", "Isi satu channel Output panel bawah (zephyr, mcp, ssh, extensions, debug).",
                 json!({ "channel": s("id channel"), "tail": json!({ "type": "integer", "description": "ambil N baris terakhir" }) }), vec![]),
        ]
    })
}

async fn ui_call(app: &AppHandle, kind: &str, payload: Value) -> ZResult<Value> {
    let state = app.state::<AppState>();

    let mut tunggu_ready = 0;
    while !state.mcp_ui_ready() && tunggu_ready < 60 {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        tunggu_ready += 1;
    }

    async fn sekali(
        state: &AppState,
        app: &AppHandle,
        kind: &str,
        payload: Value,
    ) -> ZResult<Value> {
        let req_id = format!(
            "mcp{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let rx = state.mcp_register(&req_id);
        if let Err(e) = app.emit(
            "mcp-action",
            json!({ "reqId": req_id, "type": kind, "payload": payload }),
        ) {
            state.mcp_forget(&req_id);
            return Err(ZephyrError::Mcp(format!("emit gagal: {e}")));
        }
        match tokio::time::timeout(UI_TIMEOUT, rx).await {
            Ok(Ok(v)) => {
                if let Some(msg) = v.get("error").and_then(|e| e.as_str()) {
                    return Err(ZephyrError::Mcp(msg.to_string()));
                }
                Ok(v.get("result").cloned().unwrap_or(v))
            }
            Ok(Err(_)) => Err(ZephyrError::Mcp("jawaban UI dibatalkan".into())),
            Err(_) => {
                state.mcp_forget(&req_id);
                Err(ZephyrError::Mcp("timeout".into()))
            }
        }
    }

    const PERCOBAAN: u32 = 3;
    let mut terakhir = ZephyrError::Mcp("tidak ada percobaan".into());
    for n in 0..PERCOBAAN {
        match sekali(&state, app, kind, payload.clone()).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                terakhir = e;
                if n + 1 < PERCOBAAN {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                }
            }
        }
    }
    Err(ZephyrError::Mcp(format!(
        "UI tidak menjawab untuk '{kind}' setelah {PERCOBAAN} percobaan: {terakhir}"
    )))
}

fn need_str(params: &Value, key: &str) -> ZResult<String> {
    params
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| ZephyrError::InvalidInput(format!("param '{key}' wajib ada")))
}

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

async fn dispatch(app: &AppHandle, method: &str, params: Value) -> ZResult<Value> {
    let state = app.state::<AppState>();
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "zephyr", "version": app.package_info().version.to_string() }
        })),
        "notifications/initialized" | "initialized" => Ok(json!({})),
        "tools/list" | "list_tools" => Ok(tools_schema()),
        "ping" => Ok(json!({ "pong": true })),
        "tools/call" => {
            let name = need_str(&params, "name")?;
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            let hasil = match name.as_str() {
                "list_panes" | "list_terminals" => ui_call(app, "list_panes", json!({})).await?,
                "list_editors" => ui_call(app, "list_editors", json!({})).await?,
                "get_window" => ui_call(app, "get_window", json!({})).await?,
                "list_extensions" => ui_call(app, "list_extensions", json!({})).await?,
                "get_settings" => {
                    let mut v = crate::settings::read_settings_value(&state);
                    if let Some(m) = v.get_mut("mcp").and_then(|m| m.as_object_mut()) {
                        m.insert("token".into(), Value::String("***".into()));
                    }
                    if let Some(g) = v.get_mut("git").and_then(|g| g.as_object_mut()) {
                        g.remove("github");
                    }
                    v
                }
                other => Box::pin(dispatch(app, other, args)).await?,
            };
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&hasil).unwrap_or_default() }]
            }));
        }

        "list_panes" | "list_terminals" => ui_call(app, "list_panes", json!({})).await,
        "list_editors" => ui_call(app, "list_editors", json!({})).await,
        "get_window" => ui_call(app, "get_window", json!({})).await,
        "list_extensions" => ui_call(app, "list_extensions", json!({})).await,

        "get_settings" => {
            let mut v = crate::settings::read_settings_value(&state);

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

            let _ = ui_call(app, "reload_settings", json!({})).await;
            Ok(json!({ "key": key, "value": value, "ok": true }))
        }

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

            if content.len() > MAX_EDITOR_WRITE {
                return Err(ZephyrError::InvalidInput(format!(
                    "content {} byte melewati batas {} byte (1MB) untuk editor_write",
                    content.len(),
                    MAX_EDITOR_WRITE
                )));
            }

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
