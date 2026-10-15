use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct McpServer {
    pub id: String,
    pub label: String,

    /// URL server yang SUDAH hidup (transport http).
    #[serde(default)]
    pub url: String,

    #[serde(default)]
    pub token: String,

    /// Perintah yang dijalankan Zephyr sendiri (transport stdio).
    ///
    /// Server MCP dari katalog hampir semuanya didistribusikan begini -
    /// `npx -y @modelcontextprotocol/server-x` - dan bicara lewat stdin/stdout,
    /// bukan lewat URL. Tanpa dua field ini, entri katalog hanya bisa disimpan
    /// dan tidak pernah benar-benar dipakai.
    #[serde(default)]
    pub command: String,

    #[serde(default)]
    pub args: Vec<String>,

    /// Direktori kerja perintah (opsional; kosong = direktori app).
    #[serde(default)]
    pub cwd: String,
}

impl McpServer {
    /// Server stdio: punya perintah, tidak butuh URL.
    pub fn stdio(&self) -> bool {
        !self.command.trim().is_empty()
    }

    /// Server ini punya salah satu transport yang bisa dipakai.
    pub fn bisa_dipakai(&self) -> bool {
        self.stdio() || !self.url.trim().is_empty()
    }
}

/**
 * Petakan satu entri `tools` dari server MCP ke spec Zephyr.
 *
 * Dipakai dua transport (http di berkas ini, stdio di `mcp_stdio.rs`) supaya
 * bentuk spec-nya tidak bisa berbeda antar transport - dulu pemetaan ini hidup
 * di dalam `list_tools` http saja, dan menyalinnya untuk stdio berarti dua
 * tempat yang harus diubah bersamaan setiap kali bentuk MCP berubah.
 */
pub fn spec_dari_json(t: &Value) -> Option<McpToolSpec> {
    let name = t.get("name").and_then(|n| n.as_str())?.to_string();
    if name.is_empty() {
        return None;
    }
    Some(McpToolSpec {
        name,
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
                .filter(|s| s.bisa_dipakai())
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
        return Err(ZephyrError::InvalidInput("url server MCP empty".into()));
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

    let resp = req
        .send_json(&body)
        .map_err(|e| ZephyrError::Mcp(format!("could not reach the MCP server '{alamat}': {e}")))?;

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
    Ok(arr.iter().filter_map(spec_dari_json).collect())
}

pub fn call_tool(url: &str, token: &str, tool: &str, args: Value) -> ZResult<Value> {
    let nama = tool.trim();
    if nama.is_empty() {
        return Err(ZephyrError::InvalidInput("tool empty".into()));
    }
    let arguments = if args.is_null() { json!({}) } else { args };
    rpc(
        url,
        token,
        "tools/call",
        json!({ "name": nama, "arguments": arguments }),
    )
}

/**
 * Prompts a server offers — the other half of the protocol.
 *
 * A server can expose two things: TOOLS, which the model calls on its own, and
 * PROMPTS, which a person picks deliberately. The difference matters. A tool is
 * an action the agent decides to take; a prompt is a template the user invokes
 * ("review this diff", "write the commit message") that expands into a message.
 *
 * Zephyr only spoke the tools half, so a server whose value is mainly its
 * prompts appeared to do nothing at all — its prompts were unreachable, and
 * there was no way to tell that from a server that simply had none.
 */
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptSpec {
    pub name: String,
    pub description: String,
    /// The arguments the prompt accepts, as the server describes them.
    pub arguments: Value,
}

pub fn list_prompts(url: &str, token: &str) -> ZResult<Vec<McpPromptSpec>> {
    let result = rpc(url, token, "prompts/list", json!({}))?;
    let arr = result
        .get("prompts")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(arr
        .iter()
        .map(|p| McpPromptSpec {
            name: p
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string(),
            description: p
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string(),
            arguments: p.get("arguments").cloned().unwrap_or_else(|| json!([])),
        })
        .filter(|p| !p.name.is_empty())
        .collect())
}

/**
 * Ask the server to expand a prompt into messages.
 *
 * The returned `messages` are what the agent loop sends. A server that does not
 * implement prompts answers with a JSON-RPC error, which the caller surfaces —
 * "this server has no prompts" is a fact worth telling the reader, not a
 * failure to hide.
 */
pub fn get_prompt(url: &str, token: &str, name: &str, args: Value) -> ZResult<Value> {
    let n = name.trim();
    if n.is_empty() {
        return Err(ZephyrError::InvalidInput("prompt name empty".into()));
    }
    let arguments = if args.is_null() { json!({}) } else { args };
    rpc(
        url,
        token,
        "prompts/get",
        json!({ "name": n, "arguments": arguments }),
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
    if s.stdio() {
        return crate::mcp_stdio::call_tool(
            &s.id,
            &s.command,
            &s.args,
            Some(s.cwd.as_str()),
            tool,
            args,
        );
    }
    call_tool(&s.url, &s.token, tool, args)
}

pub fn save_server(
    app: &tauri::AppHandle,
    state: &AppState,
    id: String,
    label: String,
    url: String,
    token: String,
    command: String,
    args: Vec<String>,
    cwd: String,
) -> ZResult<McpServer> {
    let alamat = url.trim().to_string();
    let perintah = command.trim().to_string();
    /* Salah satu transport harus ada. Dulu URL wajib; sekarang tidak, karena
       server stdio tidak punya URL - yang wajib adalah BISA DIPAKAI. */
    if alamat.is_empty() && perintah.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "server MCP butuh url atau command".into(),
        ));
    }
    let judul = if label.trim().is_empty() {
        if !perintah.is_empty() {
            perintah.clone()
        } else {
            alamat.clone()
        }
    } else {
        label.trim().to_string()
    };
    let server = McpServer {
        id: if id.trim().is_empty() {
            new_id()
        } else {
            id.trim().to_string()
        },
        label: judul,
        url: alamat,
        token: token.trim().to_string(),
        command: perintah,
        args,
        cwd: cwd.trim().to_string(),
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
        return Err(ZephyrError::InvalidInput("id server empty".into()));
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
