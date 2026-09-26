use crate::adapters;
use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,

    #[serde(default)]
    pub image: Option<String>,

    #[serde(default)]
    pub images: Option<Vec<String>>,
}

impl ChatMsg {
    pub fn all_images(&self) -> Vec<&str> {
        if let Some(list) = &self.images {
            if !list.is_empty() {
                return list.iter().map(|s| s.as_str()).collect();
            }
        }
        self.image.as_deref().into_iter().collect()
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AgentMsg {
    pub role: String,
    pub content: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolResult {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,

    pub done: bool,
}

pub struct Prepared {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,

    pub sse: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedRequest {
    pub at_ms: u64,
    pub provider: String,
    pub model: String,
    pub url: String,

    pub headers: Vec<(String, String)>,

    pub body: Value,

    pub chars: usize,
}

fn header_sensitif(nama: &str) -> bool {
    let n = nama.to_ascii_lowercase();
    n.contains("authorization")
        || n.contains("api-key")
        || n.contains("apikey")
        || n == "x-goog-api-key"
        || n.contains("cookie")
        || n.contains("token")
}

pub fn rekam_request(
    state: &AppState,
    provider: &str,
    model: &str,
    url: &str,
    headers: &[(String, String)],
    body: &Value,
) {
    use std::sync::atomic::Ordering;
    if !state.ai_capture_on.load(Ordering::Relaxed) {
        return;
    }
    let headers: Vec<(String, String)> = headers
        .iter()
        .filter(|(k, _)| !header_sensitif(k))
        .cloned()
        .collect();
    let chars = body.to_string().len();
    let rec = CapturedRequest {
        at_ms: state.uptime_ms(),
        provider: provider.to_string(),
        model: model.to_string(),
        url: url.to_string(),
        headers,
        body: body.clone(),
        chars,
    };
    if let Ok(mut v) = state.ai_capture.write() {
        if v.len() >= 20 {
            v.remove(0);
        }
        v.push(rec);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Minimal,
    Low,
    Medium,
    High,
    Ultra,
}

impl ReasoningEffort {
    pub fn openai(self) -> &'static str {
        match self {
            ReasoningEffort::Minimal => "minimal",
            ReasoningEffort::Low => "low",
            ReasoningEffort::Medium => "medium",
            ReasoningEffort::High | ReasoningEffort::Ultra => "high",
        }
    }

    pub fn anthropic_budget(self) -> u32 {
        match self {
            ReasoningEffort::Minimal => 1024,
            ReasoningEffort::Low => 4096,
            ReasoningEffort::Medium => 16384,
            ReasoningEffort::High => 32768,
            ReasoningEffort::Ultra => 65536,
        }
    }

    pub fn gemini_budget(self) -> i32 {
        match self {
            ReasoningEffort::Minimal => 512,
            ReasoningEffort::Low => 4096,
            ReasoningEffort::Medium => 16384,
            ReasoningEffort::High => 32768,
            ReasoningEffort::Ultra => 65536,
        }
    }
}

fn emit_chunk(app: &AppHandle, payload: Value) {
    let _ = app.emit("ai-chunk", payload);
}

fn friendly(status: u16) -> String {
    match status {
        400 => "Permintaan ditolak (400) — model atau isi pesan tidak valid".into(),
        401 | 403 => "API key salah/kadaluarsa (401) — perbarui di Settings → Model AI".into(),
        404 => "Model tidak ditemukan (404) — periksa nama model & base URL".into(),
        413 => "Pesan terlalu besar (413) — kurangi lampiran file".into(),
        429 => "Rate limit (429) — tunggu sebentar lalu coba lagi".into(),
        500..=599 => format!("Server provider bermasalah ({status}) — coba lagi nanti"),
        s => format!("Provider menjawab {s}"),
    }
}

#[tauri::command(async)]
pub fn ai_chat(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    provider: String,
    model: String,
    messages: Vec<ChatMsg>,
    base_url: Option<String>,
    max_tokens: Option<u32>,
    effort: Option<ReasoningEffort>,
) -> ZResult<()> {
    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id kosong".into()));
    }
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada pesan".into()));
    }

    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let prepared = adapters::prepare(
        &provider,
        &model,
        &messages,
        base_url.as_deref(),
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;

    rekam_request(
        &state,
        &provider,
        &model,
        &prepared.url,
        &prepared.headers,
        &prepared.body,
    );

    let cancel = state.ai_begin(&id);
    let handle = app.clone();
    let req_id = id.clone();
    let prov = provider.clone();

    std::thread::spawn(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(10)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(90)))
            .timeout_per_call(Some(std::time::Duration::from_secs(120)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }

        let resp = match req.send_json(&prepared.body) {
            Ok(r) => r,
            Err(e) => {
                let teks = e.to_string();
                let low = teks.to_lowercase();
                let pesan = if low.contains("dns")
                    || low.contains("resolve")
                    || low.contains("connect")
                    || low.contains("timed out")
                    || low.contains("timeout")
                    || low.contains("refused")
                    || low.contains("unreachable")
                {
                    format!(
                        "Tidak bisa menghubungi provider — periksa koneksi internet \
                         atau Base URL di Settings → Model AI ({teks})"
                    )
                } else {
                    format!("Tidak bisa menghubungi provider: {teks}")
                };
                emit_chunk(&handle, json!({ "id": req_id, "err": pesan }));
                return;
            }
        };

        let status = resp.status().as_u16();
        if status >= 400 {
            let mut body = resp.into_body();
            let raw: String = body.read_to_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&raw)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            let msg = if detail.is_empty() {
                friendly(status)
            } else {
                format!("{} — {}", friendly(status), detail)
            };
            emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            return;
        }

        let reader = BufReader::new(resp.into_body().into_reader());
        let mut sent_any = false;
        let mut buf_line = String::new();
        let mut reader = reader;

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => break,
                Ok(_) => {}
                Err(e) => {
                    emit_chunk(
                        &handle,
                        json!({ "id": req_id, "err": format!("stream terputus: {e}") }),
                    );
                    break;
                }
            }

            let line = buf_line.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                continue;
            }

            let payload = if prepared.sse {
                match line.strip_prefix("data:") {
                    Some(rest) => rest.trim(),
                    None => continue,
                }
            } else {
                line.trim_start_matches([',', '[']).trim_end_matches(']')
            };
            if payload.is_empty() || payload == "[DONE]" {
                if payload == "[DONE]" {
                    break;
                }
                continue;
            }

            let v: Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if let Some(think) = adapters::extract_reasoning(&prov, &v) {
                emit_chunk(&handle, json!({ "id": req_id, "reasoning": think }));
            }
            if let Some(text) = adapters::extract_delta(&prov, &v) {
                if !text.is_empty() {
                    sent_any = true;
                    emit_chunk(&handle, json!({ "id": req_id, "text": text }));
                }
            }
        }

        if !sent_any && !cancel.load(Ordering::Relaxed) {
            emit_chunk(
                &handle,
                json!({ "id": req_id, "err": "Provider tidak mengirim teks apa pun" }),
            );
        }
        emit_chunk(&handle, json!({ "id": req_id, "done": true }));
    });

    let _ = state;
    Ok(())
}

#[tauri::command(async)]
pub fn ai_cancel(state: State<AppState>, id: String) -> ZResult<bool> {
    Ok(state.ai_cancel(&id))
}

#[tauri::command]
pub async fn ai_tool_chat(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    messages: Vec<AgentMsg>,
    tools: Vec<ToolSpec>,
    base_url: Option<String>,
    max_tokens: Option<u32>,
    effort: Option<ReasoningEffort>,
) -> ZResult<AiToolResult> {
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada pesan".into()));
    }

    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let prepared = adapters::prepare_tools(
        &provider,
        &model,
        &messages,
        &tools,
        base_url.as_deref(),
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;
    let prov = provider.clone();

    let hasil = tokio::task::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(10)))
            .timeout_per_call(Some(std::time::Duration::from_secs(60)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        match req.send_json(&prepared.body) {
            Ok(r) => {
                let status = r.status().as_u16();
                let mut body = r.into_body();
                let raw: String = body.read_to_string().unwrap_or_default();
                Ok::<(u16, String), String>((status, raw))
            }
            Err(e) => {
                let teks = e.to_string();
                let low = teks.to_lowercase();
                let pesan = if low.contains("dns")
                    || low.contains("resolve")
                    || low.contains("connect")
                    || low.contains("timed out")
                    || low.contains("timeout")
                    || low.contains("refused")
                    || low.contains("unreachable")
                {
                    format!(
                        "Tidak bisa menghubungi provider — periksa koneksi internet \
                         atau Base URL di Settings → Model AI ({teks})"
                    )
                } else {
                    format!("Tidak bisa menghubungi provider: {teks}")
                };
                Err(pesan)
            }
        }
    })
    .await
    .map_err(|e| ZephyrError::Internal(format!("thread panik: {e}")))?;

    let (status, raw) = hasil.map_err(ZephyrError::InvalidInput)?;
    if status >= 400 {
        let detail = serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        let msg = if detail.is_empty() {
            friendly(status)
        } else {
            format!("{} — {}", friendly(status), detail)
        };
        return Err(ZephyrError::InvalidInput(msg));
    }

    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::InvalidInput(format!("jawaban provider tidak valid: {e}")))?;
    Ok(adapters::parse_tool_response(&prov, &v))
}

#[tauri::command(async)]
pub fn ai_tool_chat_stream(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    provider: String,
    model: String,
    messages: Vec<AgentMsg>,
    tools: Vec<ToolSpec>,
    base_url: Option<String>,
    max_tokens: Option<u32>,
    effort: Option<ReasoningEffort>,
) -> ZResult<()> {
    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id kosong".into()));
    }
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada pesan".into()));
    }
    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let prepared = adapters::prepare_tools_stream(
        &provider,
        &model,
        &messages,
        &tools,
        base_url.as_deref(),
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;

    rekam_request(
        &state,
        &provider,
        &model,
        &prepared.url,
        &prepared.headers,
        &prepared.body,
    );

    let cancel = state.ai_begin(&id);
    let handle = app.clone();
    let req_id = id.clone();
    let prov = provider.clone();

    std::thread::spawn(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(10)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(90)))
            .timeout_per_call(Some(std::time::Duration::from_secs(120)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }

        let resp = match req.send_json(&prepared.body) {
            Ok(r) => r,
            Err(e) => {
                emit_chunk(&handle, json!({ "id": req_id, "err": pesan_koneksi(&e) }));
                return;
            }
        };

        let status = resp.status().as_u16();
        if status >= 400 {
            let mut body = resp.into_body();
            let raw: String = body.read_to_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&raw)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            let msg = if detail.is_empty() {
                friendly(status)
            } else {
                format!("{} — {}", friendly(status), detail)
            };
            emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            return;
        }

        let mut acc = adapters::StreamAcc::new(&prov);
        let mut reader = BufReader::new(resp.into_body().into_reader());
        let mut buf_line = String::new();

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => break,
                Ok(_) => {}
                Err(e) => {
                    emit_chunk(
                        &handle,
                        json!({ "id": req_id, "err": format!("stream terputus: {e}") }),
                    );
                    break;
                }
            }
            let line = buf_line.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                continue;
            }
            let payload = if prepared.sse {
                match line.strip_prefix("data:") {
                    Some(rest) => rest.trim(),
                    None => continue,
                }
            } else {
                line.trim_start_matches([',', '[']).trim_end_matches(']')
            };
            if payload.is_empty() || payload == "[DONE]" {
                if payload == "[DONE]" {
                    break;
                }
                continue;
            }
            let v: Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if let Some(think) = adapters::extract_reasoning(&prov, &v) {
                emit_chunk(&handle, json!({ "id": req_id, "reasoning": think }));
            }
            if let Some(text) = acc.feed(&v) {
                emit_chunk(&handle, json!({ "id": req_id, "text": text }));
            }
        }

        let (content, tool_calls) = acc.finish();
        let dibatalkan = cancel.load(Ordering::Relaxed);
        emit_chunk(
            &handle,
            json!({
                "id": req_id,
                "toolDone": true,
                "content": content,
                "toolCalls": tool_calls,
                "cancelled": dibatalkan,
            }),
        );
    });

    let _ = state;
    Ok(())
}

fn pesan_koneksi(e: &ureq::Error) -> String {
    let teks = e.to_string();
    let low = teks.to_lowercase();
    if low.contains("dns")
        || low.contains("resolve")
        || low.contains("connect")
        || low.contains("timed out")
        || low.contains("timeout")
        || low.contains("refused")
        || low.contains("unreachable")
    {
        format!(
            "Tidak bisa menghubungi provider — periksa koneksi internet \
             atau Base URL di Settings → Model AI ({teks})"
        )
    } else {
        format!("Tidak bisa menghubungi provider: {teks}")
    }
}

#[tauri::command]
pub fn ai_capture_set(state: State<AppState>, on: bool) -> ZResult<bool> {
    state.ai_capture_on.store(on, Ordering::Relaxed);
    if !on {
        if let Ok(mut v) = state.ai_capture.write() {
            v.clear();
        }
    }
    Ok(on)
}

#[tauri::command]
pub fn ai_capture_get(state: State<AppState>) -> ZResult<(bool, Vec<CapturedRequest>)> {
    let on = state.ai_capture_on.load(Ordering::Relaxed);
    let v = state
        .ai_capture
        .read()
        .map(|v| v.clone())
        .unwrap_or_default();
    Ok((on, v))
}

#[tauri::command]
pub fn ai_capture_clear(state: State<AppState>) -> ZResult<()> {
    if let Ok(mut v) = state.ai_capture.write() {
        v.clear();
    }
    Ok(())
}
