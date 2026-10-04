use crate::adapters;
use crate::adapters::xml_tools;
use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

const CONNECT_TIMEOUT_SECS: u64 = 15;
const RECEIVE_IDLE_TIMEOUT_SECS: u64 = 300;
const TOTAL_CALL_TIMEOUT_SECS: u64 = 420;

// Receive timeout limits an idle gap between bytes; the total timeout still bounds the full call.

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

/*
 * Send a prepared request, retrying the failures that can succeed on a second
 * attempt.
 *
 * WHY this exists: a 502 from a router is almost always transient - the upstream
 * provider blipped, the gateway picked a bad node, the connection was cut mid
 * handshake. The reference implementation (Hermes) treats 5xx and 429 as
 * retryable and recovers from them silently; Zephyr surfaced the first one as a
 * hard error, so the user saw "Server provider bermasalah (502)" on a provider
 * that answered normally seconds later. Retrying here, in the transport, means
 * every caller - chat, agent, tool stream - gets the same behaviour instead of
 * three implementations that drift.
 *
 * What is NOT retried: 4xx. A 401 or a 400 answers the same way every time, and
 * waiting three seconds to show the same error is worse than showing it now.
 *
 * The body is re-serialised per attempt because a `Request` is consumed by
 * `send_json`; rebuilding it is cheap and the only correct option.
 */
/// Baca `Retry-After` jadi milidetik: bentuk "120" (detik) maupun
/// "Sun, 06 Nov 1994 08:49:37 GMT" (HTTP-date).
///
/// Bentuk kedua diparse sendiri dengan chrono yang sudah jadi dependensi, bukan
/// menambah crate baru hanya untuk satu header. Mengembalikan `None` kalau
/// tidak keduanya, supaya pemanggil jatuh ke jeda bawaan.
fn retry_after_ms(v: &str) -> Option<u64> {
    let teks = v.trim();
    if let Ok(detik) = teks.parse::<f64>() {
        return Some((detik * 1000.0) as u64);
    }
    let target = chrono::DateTime::parse_from_rfc2822(teks).ok()?;
    let delta = target.with_timezone(&chrono::Utc).signed_duration_since(chrono::Utc::now());
    u64::try_from(delta.num_milliseconds()).ok()
}

/// Ubah `Retry-After` versi HTTP-date (bukan angka detik) jadi milidetik dari sekarang.
///
/// Pakai waktu absolut milik server, bukan `now() + nilai`: HTTP-date sudah
/// berisi waktu yang diminta, jadi menjumlahkan ke "sekarang" akan salah.
fn kirim_dengan_ulang(
    agent: &ureq::Agent,
    prepared: &Prepared,
    attempts: usize,
) -> Result<ureq::http::Response<ureq::Body>, String> {
    /* Backoff between attempts: 400ms, then 1.2s. Short enough that a healthy
       retry is invisible, long enough that a rate-limited node has a chance to
       clear. */
    const JEDA_MS: [u64; 2] = [400, 1200];

    let mut terakhir: Option<String> = None;

    for percobaan in 0..attempts.max(1) {
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }

        match req.send_json(&prepared.body) {
            Ok(resp) => {
                let status = resp.status().as_u16();
                /*
                 * 5xx and 429 get another try. The response is consumed to read
                 * the body for the error message, so a retry cannot reuse it -
                 * but only the FAILING attempt needs the body, and if the retry
                 * succeeds the body is the successful stream.
                 */
                let bisa_ulang = status == 429 || (500..=599).contains(&status);
                if bisa_ulang && percobaan + 1 < attempts {
                    /*
                     * A gateway that answers 429/503 often says WHEN it will be
                     * ready. Retrying on a fixed 400ms/1.2s ladder then either
                     * wastes the window it was offered or hammers a node it
                     * just asked us to leave alone, which is how one overloaded
                     * upstream turns into a retry storm. Honour the server when
                     * it speaks, and keep the ladder only as the fallback.
                     *
                     * Capped at 20s: the frontend already runs its own visible
                     * retry ladder on top, and blocking here longer than that
                     * would make Stop unresponsive.
                     */
                    let jeda = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(retry_after_ms)
                        .filter(|ms| *ms > 0 && *ms <= 20_000)
                        .unwrap_or_else(|| JEDA_MS[percobaan.min(1)]);
                    terakhir = Some(format!("HTTP {status}"));
                    std::thread::sleep(std::time::Duration::from_millis(jeda));
                    continue;
                }
                return Ok(resp);
            }
            Err(e) => {
                /*
                 * A transport error is worth another try for the same reason:
                 * a reset connection or a connect timeout is not a verdict on
                 * the request. DNS failures are excluded - a name that does not
                 * resolve will not resolve 1.2s later, and retrying only delays
                 * the message the user needs.
                 */
                let teks = e.to_string();
                let low = teks.to_lowercase();
                let permanen = low.contains("dns") || low.contains("resolve") || low.contains("invalid url");
                if permanen || percobaan + 1 >= attempts {
                    return Err(teks);
                }
                terakhir = Some(teks);
                std::thread::sleep(std::time::Duration::from_millis(JEDA_MS[percobaan.min(1)]));
            }
        }
    }

    Err(terakhir.unwrap_or_else(|| "provider tidak merespons".into()))
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

pub(crate) fn terminal_error_to_emit(cancelled: bool, error: Option<String>) -> Option<String> {
    if cancelled { None } else { error }
}

fn friendly(status: u16) -> String {
    match status {
        400 => "Request rejected (400) — the model or the message body is invalid".into(),
        401 | 403 => "API key salah/kadaluarsa (401) — perbarui di Settings → Model AI".into(),
        404 => "Model not found (404) — check the model name and base URL".into(),
        413 => "Pesan terlalu besar (413) — kurangi lampiran file".into(),
        429 => "Rate limited (429) — wait a moment and try again".into(),
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
        return Err(ZephyrError::InvalidInput("id empty".into()));
    }
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("no message".into()));
    }

    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "No API key for {provider} yet — add one in Settings → AI Models"
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

    let (cancel, request_guard) = state.ai_begin_guard(&id);
    let handle = app.clone();
    let req_id = id.clone();
    let prov = provider.clone();

    std::thread::spawn(move || {
        // ureq's synchronous read_line cannot be interrupted by this flag when
        // the provider sends bytes without a newline. Receive and total
        // timeouts still bound the call; frontend cancellation is immediate
        // and is observed once the blocking read returns.
        let _request_guard = request_guard;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(RECEIVE_IDLE_TIMEOUT_SECS)))
            .timeout_per_call(Some(std::time::Duration::from_secs(TOTAL_CALL_TIMEOUT_SECS)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let resp = match kirim_dengan_ulang(&agent, &prepared, 3) {
            Ok(r) => r,
            Err(teks) => {
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
                    format!("Cannot reach the provider: {teks}")
                };
                let cancelled = cancel.load(Ordering::Relaxed);
                if !cancelled {
                    emit_chunk(&handle, json!({ "id": req_id, "err": pesan }));
                }
                emit_chunk(&handle, json!({ "id": req_id, "done": true, "cancelled": cancelled }));
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
            let cancelled = cancel.load(Ordering::Relaxed);
            if !cancelled {
                emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            }
            emit_chunk(&handle, json!({ "id": req_id, "done": true, "cancelled": cancelled }));
            return;
        }

        let reader = BufReader::new(resp.into_body().into_reader());
        let mut sent_any = false;
        let mut buf_line = String::new();
        let mut reader = reader;
        let mut terminal_error: Option<String> = None;

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => {
                    terminal_error = Some("stream ended before completion".into());
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    terminal_error = Some(format!("stream terputus: {e}"));
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
                    terminal_error = None;
                    break;
                }
                continue;
            }

            let v: Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(e) => {
                    terminal_error = Some(format!("invalid stream response: {e}"));
                    break;
                }
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

        let cancelled = cancel.load(Ordering::Relaxed);
        if !cancelled && terminal_error.is_none() && !sent_any {
            terminal_error = Some("The provider sent no text at all".into());
        }
        if let Some(err) = terminal_error_to_emit(cancelled, terminal_error) {
            emit_chunk(&handle, json!({ "id": req_id, "err": err }));
        }
        emit_chunk(&handle, json!({ "id": req_id, "done": true, "cancelled": cancelled }));
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
        return Err(ZephyrError::InvalidInput("no message".into()));
    }

    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "No API key for {provider} yet — add one in Settings → AI Models"
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
            .timeout_connect(Some(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(RECEIVE_IDLE_TIMEOUT_SECS)))
            .timeout_per_call(Some(std::time::Duration::from_secs(TOTAL_CALL_TIMEOUT_SECS)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        match kirim_dengan_ulang(&agent, &prepared, 3) {
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
                    format!("Cannot reach the provider: {teks}")
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
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid provider response: {e}")))?;
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
        return Err(ZephyrError::InvalidInput("id empty".into()));
    }
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("no message".into()));
    }
    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "No API key for {provider} yet — add one in Settings → AI Models"
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

    let (cancel, request_guard) = state.ai_begin_guard(&id);
    let handle = app.clone();
    let req_id = id.clone();
    let prov = provider.clone();

    std::thread::spawn(move || {
        // ureq's synchronous read_line cannot be interrupted by this flag when
        // the provider sends bytes without a newline. Receive and total
        // timeouts still bound the call; frontend cancellation is immediate
        // and is observed once the blocking read returns.
        let _request_guard = request_guard;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(RECEIVE_IDLE_TIMEOUT_SECS)))
            .timeout_per_call(Some(std::time::Duration::from_secs(TOTAL_CALL_TIMEOUT_SECS)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let resp = match kirim_dengan_ulang(&agent, &prepared, 3) {
            Ok(r) => r,
            Err(e) => {
                let cancelled = cancel.load(Ordering::Relaxed);
                if !cancelled {
                    emit_chunk(&handle, json!({ "id": req_id, "err": pesan_koneksi(&e) }));
                }
                emit_chunk(&handle, json!({ "id": req_id, "toolDone": true, "cancelled": cancelled }));
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
            let cancelled = cancel.load(Ordering::Relaxed);
            if !cancelled {
                emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            }
            emit_chunk(&handle, json!({ "id": req_id, "toolDone": true, "cancelled": cancelled }));
            return;
        }

        let mut acc = adapters::StreamAcc::new(&prov);
        /* Text held back because its tail might still grow into a tool tag. */
        let mut tahan = String::new();
        let mut reader = BufReader::new(resp.into_body().into_reader());
        let mut buf_line = String::new();
        let mut terminal_error: Option<String> = None;

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => {
                    terminal_error = Some("stream ended before completion".into());
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    terminal_error = Some(format!("stream terputus: {e}"));
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
                    terminal_error = None;
                    break;
                }
                continue;
            }
            let v: Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(e) => {
                    terminal_error = Some(format!("invalid stream response: {e}"));
                    break;
                }
            };

            if let Some(think) = adapters::extract_reasoning(&prov, &v) {
                emit_chunk(&handle, json!({ "id": req_id, "reasoning": think }));
            }
            if let Some(text) = acc.feed(&v) {
                /*
                 * Hold back a tail that may still become a tool tag.
                 *
                 * The parser only sees complete markup, and it runs at `finish`
                 * — but streaming already sent every chunk to the UI by then,
                 * so a tag being written out arrived as prose and stayed on
                 * screen. Keeping a possible partial tag in the buffer means
                 * the parser gets first refusal; whatever it does not consume
                 * is flushed below as ordinary text.
                 */
                tahan.push_str(&text);
                if !xml_tools::mungkin_awal_tag(&tahan) {
                    emit_chunk(&handle, json!({ "id": req_id, "text": tahan.clone() }));
                    tahan.clear();
                }
            }
        }

        let (content, tool_calls) = acc.finish();
        /*
         * Flush whatever is still held.
         *
         * If the tail was a real tag the parser has consumed it and the reply
         * text no longer contains it; if it was ordinary prose (`2 < 3`) the
         * hold was unnecessary and the text is owed to the reader now. Either
         * way nothing stays buffered.
         */
        if !tahan.is_empty() {
            let bersih = xml_tools::bersihkan_teks(&tahan);
            if !bersih.is_empty() {
                emit_chunk(&handle, json!({ "id": req_id, "text": bersih }));
            }
            tahan.clear();
        }
        let dibatalkan = cancel.load(Ordering::Relaxed);
        // A stream error is terminal, but tool consumers still need the
        // completion envelope to stop waiting for more chunks.
        if let Some(err) = terminal_error_to_emit(dibatalkan, terminal_error) {
            emit_chunk(&handle, json!({ "id": req_id, "err": err }));
        }
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

/*
 * Turn a transport failure into the sentence the user reads.
 *
 * Takes the message string rather than `&ureq::Error` because the retry helper
 * already reduced the error to its text by the time a caller sees it - and the
 * final attempt's error is the one worth reporting, not the first.
 */
fn pesan_koneksi(teks: &str) -> String {
    let teks = teks.to_string();
    let low = teks.to_lowercase();
    let timeout = low.contains("timed out") || low.contains("timeout") || low.contains("receive");
    let dns = low.contains("dns") || low.contains("resolve");
    let refused = low.contains("refused") || low.contains("unreachable");
    if timeout {
        format!(
            "Provider tidak menjawab sampai batas waktu. Koneksi internet kamu kemungkinan baik; \
             yang lambat atau sedang bermasalah adalah server provider (Base URL di Settings - Model AI). ({teks})"
        )
    } else if dns {
        format!(
            "The provider host name does not resolve. Check the base URL in Settings - AI Models. ({teks})"
        )
    } else if refused {
        format!(
            "Provider menolak koneksi. Periksa Base URL dan apakah servernya hidup. ({teks})"
        )
    } else {
        format!("Cannot reach the provider: {teks}")
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


/*
 * Retry behaviour, proven against a real socket rather than a mocked client.
 *
 * The bug this guards: a transient 502 from the router surfaced as a hard error
 * ("Server provider bermasalah (502)") while the same provider answered fine
 * seconds later. The retry lives in `kirim_dengan_ulang`, and the only way to
 * test it honestly is to make a server that fails on purpose - a mock of the
 * HTTP client would just be asserting that the code calls itself.
 */
#[cfg(test)]
mod retry_tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /*
     * A one-endpoint server that answers with `statuses` in order, then 200.
     *
     * Hand-written over TcpListener rather than pulling in a web framework: the
     * crate has no test server dependency, and the requests under test are
     * simple POSTs whose body this does not need to parse.
     */
    fn server(statuses: Vec<u16>) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let hits = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let hits_srv = hits.clone();

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = match stream {
                    Ok(s) => s,
                    Err(_) => break,
                };
                /*
                 * Read the WHOLE request before answering.
                 *
                 * Answering after a single `read` closed the socket while the
                 * client was still writing its body, and the client - seeing its
                 * write fail - opened a fresh connection for the same request.
                 * That connection consumed the next status in the list, so the
                 * 401 test was served a 200 and failed on a mock bug rather than
                 * a real one. Draining headers plus `Content-Length` bytes is
                 * what a real server does.
                 */
                let mut head = Vec::new();
                let mut buf = [0u8; 4096];
                loop {
                    match stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            head.extend_from_slice(&buf[..n]);
                            if let Some(pos) = find_double_crlf(&head) {
                                let headers = String::from_utf8_lossy(&head[..pos]).to_lowercase();
                                let want = headers
                                    .lines()
                                    .find_map(|l| l.strip_prefix("content-length:"))
                                    .and_then(|v| v.trim().parse::<usize>().ok())
                                    .unwrap_or(0);
                                let sudah = head.len().saturating_sub(pos + 4);
                                if sudah >= want {
                                    break;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }

                let n = hits_srv.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let status = statuses.get(n).copied().unwrap_or(200);

                let body = if status == 200 {
                    "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n"
                } else {
                    "{\"error\":{\"message\":\"mock failure\"}}"
                };
                let resp = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
            }
        });

        (format!("http://127.0.0.1:{port}/v1/chat/completions"), hits)
    }

    /* Index of the blank line that ends the request head, if present. */
    fn find_double_crlf(b: &[u8]) -> Option<usize> {
        b.windows(4).position(|w| w == b"\r\n\r\n")
    }

    fn prepared(url: String) -> Prepared {
        Prepared {
            url,
            headers: vec![("Content-Type".into(), "application/json".into())],
            body: json!({ "model": "test", "messages": [] }),
            sse: true,
        }
    }

    fn agent() -> ureq::Agent {
        ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(5)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(5)))
            .timeout_per_call(Some(std::time::Duration::from_secs(20)))
            .http_status_as_error(false)
            .build()
            .into()
    }

    #[test]
    fn retries_a_502_and_succeeds() {
        let (url, hits) = server(vec![502, 502]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus sukses");
        assert_eq!(resp.status().as_u16(), 200, "percobaan ketiga harus 200");
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 3, "harus 3 percobaan");
    }

    #[test]
    fn retries_a_429_and_succeeds() {
        let (url, hits) = server(vec![429]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus sukses");
        assert_eq!(resp.status().as_u16(), 200);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[test]
    fn gives_up_after_the_last_attempt_and_returns_the_failure() {
        let (url, hits) = server(vec![502, 502, 502, 502]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan respons");
        assert_eq!(resp.status().as_u16(), 502, "percobaan terakhir tetap dilaporkan");
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 3, "tidak lebih dari 3");
    }

    #[test]
    fn does_not_retry_a_401() {
        let (url, hits) = server(vec![401, 200]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan respons");
        assert_eq!(resp.status().as_u16(), 401, "401 diteruskan apa adanya");
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "401 tidak boleh diulang - jawabannya sama setiap kali"
        );
    }

    #[test]
    fn a_healthy_call_is_not_retried() {
        let (url, hits) = server(vec![200]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus sukses");
        assert_eq!(resp.status().as_u16(), 200);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1, "sekali saja");
    }
}
