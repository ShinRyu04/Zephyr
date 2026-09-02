// mcp_commands.rs — command Tauri untuk panel MCP + schema tools (fase 11).

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use crate::mcp_config::{CliStatus, CliWriteResult};
use crate::mcp_server::McpStatus;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

/// Status server + token (panel MCP menampilkannya ter-mask, copyable).
#[tauri::command(async)]
pub fn mcp_status(app: AppHandle, state: State<AppState>) -> ZResult<McpStatus> {
    let cfg = crate::mcp_config::load_or_init(&state);
    let running_port = state.mcp_port();
    // Saat server hidup, port yang diminta datang dari runtime — settings.mcp.port
    // sudah ditimpa port hasil bind, jadi tidak bisa dipakai membandingkan.
    let requested = state
        .mcp_requested_port()
        .unwrap_or_else(|| {
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

/// Nyalakan server (switch ON). Menyimpan `mcp.enabled = true` dulu supaya
/// /health tidak menjawab 503 tepat setelah listener terbuka.
#[tauri::command(async)]
pub async fn mcp_start(app: AppHandle) -> ZResult<u16> {
    {
        let state = app.state::<AppState>();
        crate::settings::patch_settings(&app, &state, json!({ "mcp": { "enabled": true } }))?;
    }
    crate::mcp_server::start(app.clone()).await
}

/// Matikan server (switch OFF): socket ditutup, port berhenti listening.
#[tauri::command(async)]
pub fn mcp_stop(app: AppHandle, state: State<AppState>) -> ZResult<bool> {
    crate::settings::patch_settings(&app, &state, json!({ "mcp": { "enabled": false } }))?;
    Ok(crate::mcp_server::stop(&app))
}

/// Jawaban frontend untuk satu `mcp-action`.
#[tauri::command(async)]
pub fn mcp_reply(state: State<AppState>, req_id: String, result: Value) -> ZResult<bool> {
    Ok(state.mcp_resolve(&req_id, result))
}

/// Token baru (koneksi lama otomatis tidak valid).
#[tauri::command(async)]
pub fn mcp_rotate_token(state: State<AppState>) -> ZResult<String> {
    Ok(crate::mcp_config::rotate_token(&state)?.token)
}

/// Tulis entri `zephyr` ke config CLI yang dicentang user.
#[tauri::command(async)]
pub fn mcp_write_cli(state: State<AppState>, ids: Vec<String>) -> ZResult<Vec<CliWriteResult>> {
    if ids.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada CLI dipilih".into()));
    }
    let cfg = crate::mcp_config::load_or_init(&state);
    let port = state.mcp_port().unwrap_or(cfg.port);
    Ok(ids
        .iter()
        .map(|id| crate::mcp_config::write_cli(id, port, &cfg.token))
        .collect())
}

/// Buang entri `zephyr` dari config CLI (config lain tetap utuh).
#[tauri::command(async)]
pub fn mcp_remove_cli(ids: Vec<String>) -> ZResult<Vec<CliWriteResult>> {
    if ids.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada CLI dipilih".into()));
    }
    Ok(ids.iter().map(|id| crate::mcp_config::remove_cli(id)).collect())
}

/// Apakah tiap CLI sudah punya entri zephyr di config-nya.
#[tauri::command(async)]
pub fn mcp_cli_status() -> ZResult<Vec<CliStatus>> {
    Ok(crate::mcp_config::cli_status())
}
