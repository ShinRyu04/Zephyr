use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct McpServer {
    pub id: String,
    pub label: String,
    pub url: String,

    #[serde(default)]
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolSpec {
    pub name: String,
    pub description: String,
    pub schema: Value,
}

fn servers_of(state: &AppState) -> Vec<McpServer> {
    crate::settings::read_settings_value(state)
        .get("mcp")
        .and_then(|m| m.get("servers"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value::<McpServer>(v.clone()).ok())
                .filter(|s| !s.url.trim().is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn list_servers(state: &AppState) -> Vec<McpServer> {
    servers_of(state)
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(8)))
        .timeout_per_call(Some(std::time::Duration::from_secs(45)))
        .max_redirects(2)
        .http_status_as_error(false)
        .build()
        .into()
}

fn rpc(url: &str, token: &str, method: &str, params: Value) -> ZResult<Value> {
    let alamat = url.trim();
    if alamat.is_empty() {
        return Err(ZephyrError::InvalidInput("url server MCP kosong".into()));
    }
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let body = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });

    let mut req = agent()
        .post(alamat)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json");
    let bersih = token.trim();
    if !bersih.is_empty() {
        req = req.header("Authorization", &format!("Bearer {bersih}"));
    }

    let resp = req.send_json(&body).map_err(|e| {
        ZephyrError::Mcp(format!("tidak bisa menghubungi server MCP '{alamat}': {e}"))
    })?;

    let status = resp.status().as_u16();
    let mut baca = resp.into_body();
    let raw = baca.read_to_string().unwrap_or_default();
    if status >= 400 {
        return Err(ZephyrError::Mcp(format!(
            "server MCP menjawab {status}: {}",
            raw.chars().take(300).collect::<String>()
        )));
    }

    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::Mcp(format!("jawaban server MCP bukan JSON: {e}")))?;
    if let Some(err) = v.get("error") {
        let pesan = err
            .get("message")
            .and_then(|m| m.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| err.to_string());
        return Err(ZephyrError::Mcp(format!("server MCP menolak: {pesan}")));
    }
    Ok(v.get("result").cloned().unwrap_or(Value::Null))
}

pub fn list_tools(url: &str, token: &str) -> ZResult<Vec<McpToolSpec>> {
    let result = rpc(url, token, "tools/list", json!({}))?;
    let arr = result
        .get("tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(arr
        .iter()
        .map(|t| McpToolSpec {
            name: t.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            description: t
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string(),
            schema: t
                .get("inputSchema")
                .or_else(|| t.get("input_schema"))
                .or_else(|| t.get("schema"))
                .cloned()
                .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
        })
        .filter(|t| !t.name.is_empty())
        .collect())
}

pub fn call_tool(url: &str, token: &str, tool: &str, args: Value) -> ZResult<Value> {
    let nama = tool.trim();
    if nama.is_empty() {
        return Err(ZephyrError::InvalidInput("tool kosong".into()));
    }
    let arguments = if args.is_null() { json!({}) } else { args };
    rpc(
        url,
        token,
        "tools/call",
        json!({ "name": nama, "arguments": arguments }),
    )
}

pub fn call_by_server(state: &AppState, server: &str, tool: &str, args: Value) -> ZResult<Value> {
    let id = server.trim();
    let daftar = servers_of(state);
    let s = daftar
        .iter()
        .find(|s| s.id == id)
        .or_else(|| daftar.iter().find(|s| s.label.eq_ignore_ascii_case(id)))
        .ok_or_else(|| ZephyrError::NotFound(format!("server MCP '{id}' tidak terdaftar")))?;
    call_tool(&s.url, &s.token, tool, args)
}

pub fn save_server(
    app: &tauri::AppHandle,
    state: &AppState,
    id: String,
    label: String,
    url: String,
    token: String,
) -> ZResult<McpServer> {
    let alamat = url.trim().to_string();
    if alamat.is_empty() {
        return Err(ZephyrError::InvalidInput("url wajib diisi".into()));
    }
    let server = McpServer {
        id: if id.trim().is_empty() {
            new_id()
        } else {
            id.trim().to_string()
        },
        label: if label.trim().is_empty() {
            alamat.clone()
        } else {
            label.trim().to_string()
        },
        url: alamat,
        token: token.trim().to_string(),
    };

    let mut daftar = servers_of(state);
    daftar.retain(|s| s.id != server.id);
    daftar.push(server.clone());
    crate::settings::patch_settings(app, state, json!({ "mcp": { "servers": daftar } }))?;
    Ok(server)
}

pub fn remove_server(app: &tauri::AppHandle, state: &AppState, id: &str) -> ZResult<bool> {
    let target = id.trim();
    if target.is_empty() {
        return Err(ZephyrError::InvalidInput("id server kosong".into()));
    }
    let mut daftar = servers_of(state);
    let sebelum = daftar.len();
    daftar.retain(|s| s.id != target);
    if daftar.len() == sebelum {
        return Ok(false);
    }
    crate::settings::patch_settings(app, state, json!({ "mcp": { "servers": daftar } }))?;
    Ok(true)
}

fn new_id() -> String {
    let mut h = blake3::Hasher::new();
    h.update(b"zephyr/mcp/client/server/v1");
    h.update(&std::process::id().to_le_bytes());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    h.update(&now.to_le_bytes());
    format!("mcp-{}", &h.finalize().to_hex()[..12])
}
