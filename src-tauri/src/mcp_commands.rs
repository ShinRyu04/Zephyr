use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use crate::mcp_client::{McpServer, McpToolSpec};
use crate::mcp_config::{CliStatus, CliWriteResult};
use crate::mcp_server::McpStatus;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

#[tauri::command(async)]
pub fn mcp_status(app: AppHandle, state: State<AppState>) -> ZResult<McpStatus> {
    let cfg = crate::mcp_config::load_or_init(&state);
    let running_port = state.mcp_port();

    let requested = state.mcp_requested_port().unwrap_or_else(|| {
        crate::settings::read_settings_value(&state)
            .get("mcp")
            .and_then(|m| m.get("port"))
            .and_then(|v| v.as_u64())
            .and_then(|n| u16::try_from(n).ok())
            .unwrap_or(9222)
    });
    let enabled = crate::settings::read_settings_value(&state)
        .get("mcp")
        .and_then(|m| m.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let _ = &app;
    Ok(McpStatus {
        running: running_port.is_some(),
        port: running_port.unwrap_or(cfg.port),
        requested_port: requested,
        token: cfg.token,
        uptime_ms: state.mcp_uptime_ms(),
        enabled,
    })
}

#[tauri::command(async)]
pub async fn mcp_start(app: AppHandle) -> ZResult<u16> {
    {
        let state = app.state::<AppState>();
        crate::settings::patch_settings(&app, &state, json!({ "mcp": { "enabled": true } }))?;
    }
    crate::mcp_server::start(app.clone()).await
}

#[tauri::command(async)]
pub fn mcp_stop(app: AppHandle, state: State<AppState>) -> ZResult<bool> {
    crate::settings::patch_settings(&app, &state, json!({ "mcp": { "enabled": false } }))?;
    Ok(crate::mcp_server::stop(&app))
}

#[tauri::command(async)]
pub fn mcp_reply(state: State<AppState>, req_id: String, result: Value) -> ZResult<bool> {
    Ok(state.mcp_resolve(&req_id, result))
}

/// The frontend calls this once the `mcp-action` listener is attached, so the
/// MCP server does not have to waste attempts on the boot window.
#[tauri::command(async)]
pub fn mcp_ui_ready(state: State<AppState>) -> ZResult<bool> {
    state.mcp_set_ui_ready(true);
    Ok(true)
}

#[tauri::command(async)]
pub fn mcp_rotate_token(state: State<AppState>) -> ZResult<String> {
    Ok(crate::mcp_config::rotate_token(&state)?.token)
}

#[tauri::command(async)]
pub fn mcp_write_cli(state: State<AppState>, ids: Vec<String>) -> ZResult<Vec<CliWriteResult>> {
    if ids.is_empty() {
        return Err(ZephyrError::InvalidInput("no CLI selected".into()));
    }
    let cfg = crate::mcp_config::load_or_init(&state);
    let port = state.mcp_port().unwrap_or(cfg.port);
    Ok(ids
        .iter()
        .map(|id| crate::mcp_config::write_cli(id, port, &cfg.token))
        .collect())
}

#[tauri::command(async)]
pub fn mcp_remove_cli(ids: Vec<String>) -> ZResult<Vec<CliWriteResult>> {
    if ids.is_empty() {
        return Err(ZephyrError::InvalidInput("no CLI selected".into()));
    }
    Ok(ids
        .iter()
        .map(|id| crate::mcp_config::remove_cli(id))
        .collect())
}

#[tauri::command(async)]
pub fn mcp_cli_status() -> ZResult<Vec<CliStatus>> {
    Ok(crate::mcp_config::cli_status())
}

#[tauri::command(async)]
pub fn mcp_write_custom_cli(
    state: State<AppState>,
    path: String,
    format: String,
    key: String,
) -> ZResult<CliWriteResult> {
    let cfg = crate::mcp_config::load_or_init(&state);
    let port = state.mcp_port().unwrap_or(cfg.port);
    Ok(crate::mcp_config::write_custom_cli(
        path, format, key, port, &cfg.token,
    ))
}

#[tauri::command(async)]
pub fn mcp_client_list(state: State<AppState>) -> ZResult<Vec<McpServer>> {
    Ok(crate::mcp_client::list_servers(&state))
}

/**
 * Daftar tool sebuah server MCP.
 *
 * `server` (id) dipakai lebih dulu kalau ada: server stdio TIDAK punya URL -
 * mereka dijalankan sebagai proses (`npx ...`) dan bicara lewat stdin/stdout -
 * jadi memanggilnya dengan `url` saja akan selalu gagal untuk SELURUH server
 * yang dipasang dari katalog. `url`/`token` tetap diterima supaya pemanggil
 * lama (server http ad-hoc yang belum tersimpan) tidak rusak.
 */
#[tauri::command(async)]
pub fn mcp_client_tools(
    state: State<AppState>,
    server: Option<String>,
    url: Option<String>,
    token: Option<String>,
) -> ZResult<Vec<McpToolSpec>> {
    let id = server.unwrap_or_default();
    let id = id.trim();
    if !id.is_empty() {
        if let Some(s) = crate::mcp_client::cari_server(&state, id) {
            if s.stdio() {
                return crate::mcp_stdio::list_tools(
                    &s.id,
                    &s.command,
                    &s.args,
                    Some(s.cwd.as_str()),
                );
            }
            if !s.url.trim().is_empty() {
                return crate::mcp_client::list_tools(&s.url, &s.token);
            }
        }
    }
    crate::mcp_client::list_tools(&url.unwrap_or_default(), &token.unwrap_or_default())
}

#[tauri::command(async)]
pub fn mcp_client_call(
    state: State<AppState>,
    server: String,
    tool: String,
    args: Option<Value>,
) -> ZResult<Value> {
    let arguments = args.unwrap_or_else(|| json!({}));
    crate::mcp_client::call_by_server(&state, &server, &tool, arguments)
}

/// Prompts the server offers. See `mcp_client::list_prompts` for why the
/// tools-only client was incomplete.
#[tauri::command(async)]
pub fn mcp_client_prompts(url: String, token: String) -> ZResult<Vec<crate::mcp_client::McpPromptSpec>> {
    crate::mcp_client::list_prompts(&url, &token)
}

/// Expand one prompt into messages, through the named server.
///
/// Resolves the server by id first, like `mcp_client_call`, so the frontend
/// never has to hold a URL and token itself — the token stays in Rust.
#[tauri::command(async)]
pub fn mcp_client_prompt_get(
    state: State<AppState>,
    server: String,
    name: String,
    args: Option<Value>,
) -> ZResult<Value> {
    let id = server.trim();
    let daftar = crate::mcp_client::list_servers(&state);
    let s = daftar
        .iter()
        .find(|s| s.id == id)
        .or_else(|| daftar.iter().find(|s| s.label.eq_ignore_ascii_case(id)))
        .ok_or_else(|| {
            crate::errors::ZephyrError::NotFound(format!("server MCP '{id}' tidak terdaftar"))
        })?;
    crate::mcp_client::get_prompt(&s.url, &s.token, &name, args.unwrap_or_else(|| json!({})))
}

#[tauri::command(async)]
pub fn mcp_client_save(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    label: String,
    url: String,
    token: String,
    /* Transport stdio: perintah + argumen + cwd. Opsional supaya pemanggil
       lama (server http) tidak perlu diubah. */
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
) -> ZResult<McpServer> {
    crate::mcp_client::save_server(
        &app,
        &state,
        id,
        label,
        url,
        token,
        command.unwrap_or_default(),
        args.unwrap_or_default(),
        cwd.unwrap_or_default(),
    )
}

#[tauri::command(async)]
pub fn mcp_client_remove(app: AppHandle, state: State<AppState>, id: String) -> ZResult<bool> {
    crate::mcp_client::remove_server(&app, &state, &id)
}
