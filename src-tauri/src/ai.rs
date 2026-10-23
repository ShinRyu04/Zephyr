use crate::adapters;
use crate::adapters::xml_tools;
use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};

const CONNECT_TIMEOUT_SECS: u64 = 15;
const RECEIVE_IDLE_TIMEOUT_SECS: u64 = 600;
const TOTAL_CALL_TIMEOUT_SECS: u64 = 720;

/// Batas waktu TOTAL untuk seluruh tangga ulang, bukan per percobaan.
///
/// Tiga timeout ini sebelumnya saling tidak tahu, dan akibatnya UI terkunci:
///
///   - tiap percobaan boleh diam sampai 300s (recv idle) / 420s (per call)
///   - ada 3 percobaan dan 2 jeda, masing-masing sampai 20s
///
/// Jadi Rust bisa diam paling lama 3 x 420 + 2 x 20 = 1300 detik, sementara
/// watchdog frontend melepas pada 360s dan hard limit pada 900s. Setelah
/// frontend menyerah, Rust masih hidup dan masih mengirim chunk untuk run yang
/// sudah ditinggalkan - chunk itu lalu menempel ke pesan yang sedang diketik.
/// Bukan hanya UI lambat: itu state yang tercemar diam-diam.
///
/// Batas total membalik urutannya menjadi benar: Rust selalu melapor lebih dulu,
/// dan watchdog frontend hanya menyala kalau Rust benar-benar tidak menjawab.
/// 300s dipilih karena itu recv-idle untuk SATU percobaan - jadi kesabarannya
/// sama dengan batas yang sudah ada, hanya sekarang berlaku untuk seluruh
/// tangga sekaligus.
const RETRY_LOOP_DEADLINE_SECS: u64 = 600;

// Receive timeout limits an idle gap between bytes; the total timeout still bounds the full call.

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,

    #[serde(default)]
    pub image: Option<String>,

    #[serde(default)]
    pub images: Option<Vec<String>>,

    /*
     * The reasoning this turn produced, echoed back on the next request.
     *
     * An assistant message in the chat history carries its own chain of thought
     * so the model can see HOW it reached its previous answer, not only what it
     * said. Anthropic validates the signature against the thinking block; the
     * OpenAI-compatible gateways take `reasoning_content` and have no signature
     * field, which is why the two are separate and the signature is optional.
     *
     * Declared here because serde DROPS unknown fields: without these, the
     * frontend could attach reasoning to every assistant turn in the history
     * and it would be silently discarded before the request was built.
     */
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_signature: Option<String>,
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
#[serde(rename_all = "camelCase")]
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

    /// The model's reasoning for this turn, echoed back on the next request.
    ///
    /// Providers that expose reasoning expect their own chain of thought
    /// returned: Anthropic's thinking blocks carry a signature it validates, and
    /// the OpenAI-compatible gateways accept `reasoning_content` on an assistant
    /// message. Dropping it makes each step re-derive what it already worked
    /// out, or contradict it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,

    /// The opaque signature that must accompany `reasoning`, verbatim.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_signature: Option<String>,
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

    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tool_call_diagnostics: Vec<CapturedToolCallDiagnostic>,

    #[serde(skip)]
    capture_id: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedToolCallDiagnostic {
    pub index: usize,
    pub id: Option<String>,
    pub name: Option<String>,
    pub argument_fragments: usize,
    pub argument_chars: usize,
    pub argument_kind: Option<String>,
    pub arguments_json_valid: Option<bool>,
    pub parsed_arguments_kind: Option<String>,
}

const TOOL_ARGUMENT_CAPTURE_LIMIT: usize = 64 * 1024;

#[derive(Default)]
struct OpenAiToolCallCapture {
    calls: Vec<OpenAiToolCallCaptureEntry>,
}

#[derive(Default)]
struct OpenAiToolCallCaptureEntry {
    index: usize,
    id: Option<String>,
    name: Option<String>,
    argument_fragments: usize,
    argument_chars: usize,
    argument_kind: Option<String>,
    raw_arguments: String,
    raw_arguments_bytes: usize,
    arguments_truncated: bool,
}

impl OpenAiToolCallCapture {
    fn feed(&mut self, frame: &Value) {
        let Some(calls) = frame
            .pointer("/choices/0/delta/tool_calls")
            .and_then(Value::as_array)
        else {
            return;
        };

        for call in calls {
            let index = call.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            while self.calls.len() <= index {
                self.calls.push(OpenAiToolCallCaptureEntry {
                    index: self.calls.len(),
                    ..Default::default()
                });
            }
            let entry = &mut self.calls[index];
            if let Some(id) = call
                .get("id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                entry.id = Some(id.to_string());
            }
            if let Some(name) = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                entry.name = Some(name.to_string());
            }

            let Some(arguments) = call.pointer("/function/arguments") else {
                continue;
            };
            if let Some(arguments) = arguments.as_str() {
                entry.argument_fragments += 1;
                entry.argument_chars += arguments.chars().count();
                entry.argument_kind = Some("string".into());
                entry.raw_arguments_bytes += arguments.len();
                if entry.raw_arguments_bytes <= TOOL_ARGUMENT_CAPTURE_LIMIT {
                    entry.raw_arguments.push_str(arguments);
                } else {
                    entry.arguments_truncated = true;
                    entry.raw_arguments.clear();
                }
            } else {
                let kind = json_kind(arguments);
                entry.argument_kind = Some(match entry.argument_kind.take() {
                    Some(previous) if previous != kind => "mixed".into(),
                    _ => kind.into(),
                });
                entry.argument_chars += arguments.to_string().chars().count();
                entry.arguments_truncated = true;
            }
        }
    }

    fn finish(self) -> Vec<CapturedToolCallDiagnostic> {
        self.calls
            .into_iter()
            .map(|entry| {
                let parsed = if entry.argument_kind.as_deref() == Some("string")
                    && !entry.arguments_truncated
                    && entry.argument_fragments > 0
                {
                    serde_json::from_str::<Value>(&entry.raw_arguments).ok()
                } else {
                    None
                };
                let arguments_json_valid = if entry.argument_kind.as_deref() == Some("string")
                    && !entry.arguments_truncated
                    && entry.argument_fragments > 0
                {
                    Some(parsed.is_some())
                } else {
                    None
                };
                CapturedToolCallDiagnostic {
                    index: entry.index,
                    id: entry.id,
                    name: entry.name,
                    argument_fragments: entry.argument_fragments,
                    argument_chars: entry.argument_chars,
                    argument_kind: entry.argument_kind,
                    arguments_json_valid,
                    parsed_arguments_kind: parsed.as_ref().map(json_kind).map(str::to_string),
                }
            })
            .collect()
    }
}

fn json_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
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
    let delta = target
        .with_timezone(&chrono::Utc)
        .signed_duration_since(chrono::Utc::now());
    u64::try_from(delta.num_milliseconds()).ok()
}

const DEEPSEEK_REASONING_REFUSAL: &str = "must be passed back to the api";
const DEEPSEEK_REASONING_RETRIES: usize = 3;

fn request_deepseek_tool_call(prepared: &Prepared) -> bool {
    prepared
        .body
        .get("model")
        .and_then(Value::as_str)
        .is_some_and(|model| model.to_ascii_lowercase().contains("deepseek"))
        && prepared
            .body
            .get("messages")
            .and_then(Value::as_array)
            .is_some_and(|messages| {
                messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("assistant")
                        && message
                            .get("tool_calls")
                            .and_then(Value::as_array)
                            .is_some_and(|calls| !calls.is_empty())
                })
            })
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

    let batas_percobaan = attempts.max(1);
    let retry_reasoning_deepseek = request_deepseek_tool_call(prepared);
    let mut percobaan_reguler = 0usize;
    let mut retry_reasoning = 0usize;
    let mut terakhir: Option<String> = None;
    let mulai = std::time::Instant::now();

    /*
     * A mutable copy, so a 400 can be repaired and retried.
     *
     * This is the difference between "this model is unsupported" and "Zephyr
     * guessed a field wrong". A gateway that fronts dozens of upstreams rejects
     * the whole request over ONE field it does not recognise, and the old code
     * treated that 400 as final — so a perfectly healthy model looked broken.
     * Now the server's own complaint is read, the offending field is dropped,
     * and the request goes out once more.
     *
     * Each repair is applied at most once (`sudah_dibuang`), so a model that
     * genuinely cannot serve the request still fails, and fails fast.
     */
    let mut body = prepared.body.clone();
    let mut sudah_dibuang: Vec<&'static str> = Vec::new();

    while percobaan_reguler < batas_percobaan {
        /*
         * Deadline check BEFORE the request, not after the sleep.
         *
         * Checking after the sleep means the user waits out one more full
         * backoff to learn nothing new. Checking here means the ladder stops
         * the moment the budget is gone, and `terakhir` - the error already in
         * hand, with its status and its server message - is what the caller
         * sees. That is a far better answer than a bare "timed out".
         *
         * This is also what makes the order of facts correct. The frontend
         * watchdog exists for a Rust that cannot answer at all; it must never
         * be the thing that decides first, because then late chunks land on
         * whatever the user is typing.
         */
        if percobaan_reguler > 0
            && mulai.elapsed() >= std::time::Duration::from_secs(RETRY_LOOP_DEADLINE_SECS)
        {
            return Err(terakhir.unwrap_or_else(|| {
                format!("Provider tidak menjawab dalam {RETRY_LOOP_DEADLINE_SECS} detik")
            }));
        }

        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }

        percobaan_reguler += 1;
        match req.send_json(&body) {
            Ok(resp) => {
                let status = resp.status().as_u16();
                /*
                 * DeepSeek's reasoning 400 comes FIRST.
                 *
                 * It is a 400 whose fix is not "drop a field" but "echo the
                 * reasoning back and try again", and its message mentions no
                 * field name at all. Running the generic repair before it meant
                 * the response was handed back unretried, because nothing in the
                 * text matched — which is exactly what the regression test
                 * `retries_only_matching_deepseek_reasoning_400s` caught.
                 */
                if status == 400 && retry_reasoning_deepseek {
                    let (parts, mut resp_body) = resp.into_parts();
                    let raw = resp_body.read_to_string().unwrap_or_default();
                    if raw
                        .to_ascii_lowercase()
                        .contains(DEEPSEEK_REASONING_REFUSAL)
                        && retry_reasoning < DEEPSEEK_REASONING_RETRIES
                    {
                        retry_reasoning += 1;
                        percobaan_reguler -= 1;
                        continue;
                    }
                    let resp_body = ureq::Body::builder().data(raw.into_bytes());
                    return Ok(ureq::http::Response::from_parts(parts, resp_body));
                }
                /*
                 * 400: try to repair the body once before giving up.
                 *
                 * The server names the field it did not like, in one of a few
                 * phrasings. Whichever it names is dropped, and the SAME request
                 * is sent again — no user-visible retry, no lost turn.
                 */
                if status == 400 && sudah_dibuang.len() < 3 {
                    let (parts, mut resp_body) = resp.into_parts();
                    let raw = resp_body.read_to_string().unwrap_or_default();
                    let low = raw.to_ascii_lowercase();

                    let mut ubah = false;
                    /* max_tokens rejected -> the model wants the other spelling. */
                    if low.contains("max_tokens")
                        && low.contains("max_completion_tokens")
                        && !sudah_dibuang.contains(&"max_tokens")
                    {
                        if let Some(v) = body.get("max_tokens").cloned() {
                            body.as_object_mut().map(|o| o.remove("max_tokens"));
                            body["max_completion_tokens"] = v;
                            sudah_dibuang.push("max_tokens");
                            ubah = true;
                        }
                    }
                    /* tools rejected -> send the turn without them. */
                    if low.contains("tool")
                        && !sudah_dibuang.contains(&"tools")
                        && body.get("tools").is_some()
                    {
                        body.as_object_mut().map(|o| o.remove("tools"));
                        sudah_dibuang.push("tools");
                        ubah = true;
                    }
                    /* reasoning_effort rejected -> drop it. */
                    if low.contains("reasoning_effort") && !sudah_dibuang.contains(&"reasoning_effort") {
                        body.as_object_mut().map(|o| o.remove("reasoning_effort"));
                        sudah_dibuang.push("reasoning_effort");
                        ubah = true;
                    }

                    if ubah {
                        percobaan_reguler -= 1;
                        continue;
                    }

                    /* Nothing repairable: hand the original answer back. */
                    let resp_body = ureq::Body::builder().data(raw.into_bytes());
                    return Ok(ureq::http::Response::from_parts(parts, resp_body));
                }
                /*
                 * 5xx and 429 get another try. The response is consumed to read
                 * the body for the error message, so a retry cannot reuse it -
                 * but only the FAILING attempt needs the body, and if the retry
                 * succeeds the body is the successful stream.
                 */
                let bisa_ulang = status == 429 || (500..=599).contains(&status);
                if bisa_ulang && percobaan_reguler < batas_percobaan {
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
                        .filter(|ms| *ms > 0 && *ms <= 30_000)
                        .unwrap_or_else(|| JEDA_MS[(percobaan_reguler - 1).min(1)]);
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
                let permanen =
                    low.contains("dns") || low.contains("resolve") || low.contains("invalid url");
                if permanen || percobaan_reguler >= batas_percobaan {
                    return Err(teks);
                }
                terakhir = Some(teks);
                std::thread::sleep(std::time::Duration::from_millis(
                    JEDA_MS[(percobaan_reguler - 1).min(1)],
                ));
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
) -> Option<u64> {
    static NEXT_CAPTURE_ID: AtomicU64 = AtomicU64::new(1);
    if !state.ai_capture_on.load(Ordering::Relaxed) {
        return None;
    }
    let headers: Vec<(String, String)> = headers
        .iter()
        .filter(|(k, _)| !header_sensitif(k))
        .cloned()
        .collect();
    let chars = body.to_string().len();
    let capture_id = NEXT_CAPTURE_ID.fetch_add(1, Ordering::Relaxed);
    let rec = CapturedRequest {
        at_ms: state.uptime_ms(),
        provider: provider.to_string(),
        model: model.to_string(),
        url: url.to_string(),
        headers,
        body: body.clone(),
        chars,
        tool_call_diagnostics: Vec::new(),
        capture_id,
    };
    if let Ok(mut v) = state.ai_capture.write() {
        if v.len() >= 20 {
            v.remove(0);
        }
        v.push(rec);
        Some(capture_id)
    } else {
        tracing::warn!("failed to lock AI request capture for write");
        None
    }
}

fn rekam_diagnostik_tool_call(
    app: &AppHandle,
    capture_id: Option<u64>,
    diagnostics: Vec<CapturedToolCallDiagnostic>,
) {
    let Some(capture_id) = capture_id else {
        return;
    };
    let state = app.state::<AppState>();
    match state.ai_capture.write() {
        Ok(mut requests) => {
            if let Some(request) = requests.iter_mut().find(|r| r.capture_id == capture_id) {
                request.tool_call_diagnostics = diagnostics;
            }
        }
        Err(_) => tracing::warn!("failed to lock AI request capture for tool diagnostics"),
    };
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

    /// The `output_config.effort` level for adaptive-thinking models.
    ///
    /// Depth moved out of the token budget and into this field for the 4.7+
    /// generation, so a user who picks "Ultra" has nothing to show for it
    /// unless the level is sent. The accepted values are the API's own:
    /// low / medium / high / xhigh / max, and "high" is the API default — so
    /// `None` is returned for the levels that mean "leave it alone".
    ///
    /// Minimal maps to `low` rather than being omitted: someone who explicitly
    /// asked for the least thinking should not silently get the default.
    pub fn anthropic_effort(self) -> Option<&'static str> {
        match self {
            ReasoningEffort::Minimal => Some("low"),
            ReasoningEffort::Low => Some("low"),
            ReasoningEffort::Medium => Some("medium"),
            ReasoningEffort::High => None, // the API default
            ReasoningEffort::Ultra => Some("max"),
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

/// Add session-affinity headers so the provider can route a conversation to the
/// same upstream node and reuse its prompt cache across steps.
///
/// A Zephyr run sends one request per agent step, each carrying the whole
/// (pruned) history. Without a stable session identifier the gateway treats
/// every step as an unrelated request and cannot reuse the cached prefix, so the
/// full prompt is re-processed each time - which is a large part of why a long
/// run feels slow next to clients like opencode. opencode sends a stable
/// `x-session-affinity` per session for exactly this reason. The header is
/// advisory: providers that do not understand it ignore it.
fn tambah_header_afinitas(prepared: &mut Prepared, session_id: Option<&str>) {
    let Some(sid) = session_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return;
    };
    // No secrets here - session ids are opaque, not credentials.
    prepared
        .headers
        .push(("x-session-affinity".into(), sid.to_string()));
    prepared
        .headers
        .push(("x-session-id".into(), sid.to_string()));
}

/// Whether a streamed chunk carries a tool call, in any of the three wire
/// shapes. Used to tell "the provider is working" (a tool-only turn) apart from
/// "nothing arrived", so an EOF after a tool call is not misread as a broken
/// stream. Structural, not a full parse: it only needs to recognise the
/// presence of a call, and `StreamAcc` does the real extraction.
fn chunk_membawa_tool_call(provider: &str, v: &Value) -> bool {
    match provider {
        "gemini" => v
            .pointer("/candidates/0/content/parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionCall").is_some()))
            .unwrap_or(false),
        "anthropic" => v
            .pointer("/delta/type")
            .and_then(|t| t.as_str())
            .map(|t| t == "input_json_delta" || t == "tool_use")
            .unwrap_or(false),
        _ => v
            .pointer("/choices/0/delta/tool_calls")
            .and_then(|c| c.as_array())
            .map(|c| !c.is_empty())
            .unwrap_or(false),
    }
}

pub(crate) fn terminal_error_to_emit(cancelled: bool, error: Option<String>) -> Option<String> {
    if cancelled {
        None
    } else {
        error
    }
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

/// Susun pesan untuk respons HTTP gagal, dengan ikut menyertakan apa yang
/// DIKATAKAN SERVER.
///
/// Versi lama hanya membaca `/error/message` dari JSON. Untuk 502/503 dari
/// sebuah GATEWAY (proxy ke banyak hulu), badan jawabannya sering berupa
/// halaman HTML atau teks polos - bukan JSON. Akibatnya pengguna melihat
/// kalimat telanjang "Server provider bermasalah (502)" tanpa satu kata pun
/// dari server, dan tidak ada cara tahu apa yang ditolak. Persis pada provider
/// yang paling mungkin gagal, pesannya paling tidak berguna.
///
/// Urutan yang dipakai:
///   1. `/error/message` bila memang JSON (paling rapi)
///   2. kalau tidak: badan mentah, spasi dirapatkan, dipotong 240 karakter
///   3. sebutkan MODEL dan HOST - pada gateway yang melayani banyak model,
///      nama model adalah fakta paling berguna untuk tahu siapa yang menolak
/** Diagnostik payload terakhir yang ditolak provider. */
pub struct TolakTerakhir {
    pub status: u16,
    pub model: String,
    pub jumlah_pesan: usize,
    pub peran: String,
    pub ukuran: usize,
    pub catatan: Vec<String>,
    pub jejak: Vec<String>,
    pub body_server: String,
}

pub static TOLAK_TERAKHIR: std::sync::Mutex<Option<TolakTerakhir>> = std::sync::Mutex::new(None);

/// Catat payload yang ditolak, supaya UI bisa menjelaskan APA yang salah.
///
/// "Request rejected (400)" tanpa satu pun petunjuk tentang bentuk body-nya
/// memaksa setiap diagnosis jadi tebakan. Yang dicatat di sini adalah hal-hal
/// yang benar-benar bisa membuat provider menolak: urutan peran, asisten kosong,
/// tool call tanpa hasil, pesan system yang tidak di depan, dan ukuran body.
/// Tidak ada isi percakapan yang disimpan - hanya bentuknya.
pub(crate) fn catat_penolakan(
    status: u16,
    prepared: &Prepared,
    model: &str,
    body_server: &str,
) {
    let pesan = prepared
        .body
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let peran: Vec<String> = pesan
        .iter()
        .map(|m| {
            m.get("role")
                .and_then(Value::as_str)
                .unwrap_or("?")
                .to_string()
        })
        .collect();

    let mut catatan: Vec<String> = Vec::new();

    /* Asisten berurutan tanpa hasil tool: bentuk tidak sah untuk sebagian besar
    gateway, dan yang paling sering bikin 400 pada loop agent. */
    for i in 1..peran.len() {
        if peran[i] == "assistant" && peran[i - 1] == "assistant" {
            catatan.push(format!("dua pesan assistant berurutan di indeks {i}"));
            break;
        }
    }

    /*
     * Dua pesan USER berurutan.
     *
     * This one went undetected and cost a real debugging session: a 400 came
     * back with the roles printed as `system -> user -> user -> assistant -> …`
     * and this checker said "no violation detected", which pointed the reader at
     * the body instead of at the sequence.
     *
     * It is reachable without anyone doing anything odd. A turn whose reply
     * never arrived — a transient failure, a cancel, a stream that closed with
     * no text — leaves a user message with no assistant after it. The next
     * message the reader types produces `user -> user`, and from then on EVERY
     * request 400s. The conversation is stuck permanently with nothing on screen
     * saying why.
     *
     * Checked for `user` specifically rather than "the same role twice" because
     * a repeated `tool` role is a different fault with its own message below.
     */
    for i in 1..peran.len() {
        if peran[i] == "user" && peran[i - 1] == "user" {
            catatan.push(format!(
                "dua pesan user berurutan di indeks {i} — gateway OpenAI-compatible menolak ini; \
                 balasan yang hilang meninggalkan user tanpa assistant sesudahnya"
            ));
            break;
        }
    }

    /* Asisten tanpa isi DAN tanpa tool call. */
    for (i, m) in pesan.iter().enumerate() {
        if m.get("role").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        let kosong = m
            .get("content")
            .and_then(Value::as_str)
            .map(|s| s.trim().is_empty())
            .unwrap_or(true);
        let ada_call = m
            .get("tool_calls")
            .and_then(Value::as_array)
            .is_some_and(|c| !c.is_empty());
        if kosong && !ada_call {
            catatan.push(format!("assistant tanpa isi dan tanpa tool call di indeks {i}"));
            break;
        }
    }

    /* Tool call yang tidak punya hasil tool sesudahnya. */
    for (i, m) in pesan.iter().enumerate() {
        let calls = m
            .get("tool_calls")
            .and_then(Value::as_array)
            .map(|c| c.len())
            .unwrap_or(0);
        if calls == 0 {
            continue;
        }
        for n in 0..calls {
            let berikut = pesan.get(i + 1 + n).and_then(|x| x.get("role")).and_then(Value::as_str);
            if berikut != Some("tool") {
                catatan.push(format!("tool call di indeks {i} tanpa hasil tool"));
                break;
            }
        }
    }

    /* System prompt wajib di paling depan. */
    if let Some(pos) = peran.iter().position(|r| r == "system") {
        if pos != 0 {
            catatan.push(format!("pesan system di indeks {pos}, bukan di awal"));
        }
    }
    if peran.iter().filter(|r| *r == "system").count() > 1 {
        catatan.push("lebih dari satu pesan system".into());
    }

    /* Body tanpa pesan sama sekali, atau pesan terakhir bukan giliran user/tool. */
    if pesan.is_empty() {
        catatan.push("tidak ada pesan sama sekali".into());
    } else if let Some(terakhir) = peran.last() {
        if terakhir == "assistant" {
            catatan.push("pesan terakhir adalah assistant".into());
        }
    }

    let ukuran = serde_json::to_string(&prepared.body)
        .map(|s| s.len())
        .unwrap_or(0);

    /*
     * Jejak singkat tiap pesan, karena urutan peran saja tidak cukup untuk
     * menemukan pelanggarannya.
     *
     * `system -> user -> assistant -> user -> ...` terlihat wajar sampai
     * diketahui bahwa salah satu "user" itu sebenarnya catatan internal yang
     * menyelip di antara asisten dan hasil tool-nya. Tanpa melihat isinya, tidak
     * ada cara membedakan pesan user asli dari sisipan.
     */
    let mut jejak: Vec<String> = Vec::new();
    for m in pesan.iter().take(24) {
        let peran = m.get("role").and_then(Value::as_str).unwrap_or("?");
        let awal = m
            .get("content")
            .and_then(Value::as_str)
            .map(|s| {
                s.trim()
                    .replace('\n', " ")
                    .chars()
                    .take(56)
                    .collect::<String>()
            })
            .unwrap_or_default();
        let calls = m
            .get("tool_calls")
            .and_then(Value::as_array)
            .map(|c| c.len())
            .unwrap_or(0);
        jejak.push(format!(
            "{peran}{} \"{awal}\"",
            if calls > 0 {
                format!("(x{calls})")
            } else {
                String::new()
            }
        ));
    }
    if pesan.len() > 24 {
        jejak.push(format!("… {} pesan lagi", pesan.len() - 24));
    }

    if let Ok(mut slot) = TOLAK_TERAKHIR.lock() {
        *slot = Some(TolakTerakhir {
            status,
            model: model.to_string(),
            jumlah_pesan: pesan.len(),
            peran: peran.join(" -> "),
            ukuran,
            catatan,
            jejak,
            body_server: body_server.chars().take(400).collect(),
        });
    }
}

/// Ambil catatan penolakan terakhir, sekali pakai.
pub fn tolak_terakhir() -> Option<String> {
    let slot = TOLAK_TERAKHIR.lock().ok()?;
    let t = slot.as_ref()?;
    let mut baris = vec![format!(
        "HTTP {} untuk {} — {} pesan, {} byte",
        t.status, t.model, t.jumlah_pesan, t.ukuran
    )];
    baris.push(format!("urutan peran: {}", t.peran));
    if !t.jejak.is_empty() {
        baris.push("isi tiap pesan:".into());
        for (i, j) in t.jejak.iter().enumerate() {
            baris.push(format!("  {i}. {j}"));
        }
    }
    if t.catatan.is_empty() {
        baris.push("bentuk pesan: tidak ada pelanggaran yang terdeteksi".into());
    } else {
        baris.push(format!("masalah: {}", t.catatan.join("; ")));
    }
    if !t.body_server.trim().is_empty() {
        baris.push(format!("kata server: {}", t.body_server));
    }
    Some(baris.join("\n"))
}

pub(crate) fn pesan_http(status: u16, raw: &str, model: &str, url: &str) -> String {
    let detail = serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .or_else(|| v.pointer("/message"))
                .or_else(|| v.pointer("/error"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
        })
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            /* Bukan JSON, atau JSON tanpa pesan: pakai badan mentahnya. */
            let rapat = raw.split_whitespace().collect::<Vec<_>>().join(" ");
            if rapat.is_empty() {
                String::new()
            } else if rapat.chars().count() > 240 {
                let potong: String = rapat.chars().take(240).collect();
                format!("{potong}…")
            } else {
                rapat
            }
        });

    let host = url
        .split("://")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .unwrap_or(url);

    let kepala = friendly(status);
    if detail.is_empty() {
        format!("{kepala} [{model} @ {host}]")
    } else {
        format!("{kepala} [{model} @ {host}] — {detail}")
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
    full_url: Option<bool>,
    max_tokens: Option<u32>,
    effort: Option<ReasoningEffort>,
    session_id: Option<String>,
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

    let mut prepared = adapters::prepare(
        &provider,
        &model,
        &messages,
        base_url.as_deref(),
        full_url,
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;
    tambah_header_afinitas(&mut prepared, session_id.as_deref());

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
            .timeout_recv_response(Some(std::time::Duration::from_secs(
                RECEIVE_IDLE_TIMEOUT_SECS,
            )))
            .timeout_per_call(Some(std::time::Duration::from_secs(
                TOTAL_CALL_TIMEOUT_SECS,
            )))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let resp = match kirim_dengan_ulang(&agent, &prepared, 4) {
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
                emit_chunk(
                    &handle,
                    json!({ "id": req_id, "done": true, "cancelled": cancelled }),
                );
                return;
            }
        };

        let status = resp.status().as_u16();
        if status >= 400 {
            let mut body = resp.into_body();
            let raw: String = body.read_to_string().unwrap_or_default();
            catat_penolakan(status, &prepared, &model, &raw);
            let msg = pesan_http(status, &raw, &model, &prepared.url);
            let cancelled = cancel.load(Ordering::Relaxed);
            if !cancelled {
                emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            }
            emit_chunk(
                &handle,
                json!({ "id": req_id, "done": true, "cancelled": cancelled }),
            );
            return;
        }

        let reader = BufReader::new(resp.into_body().into_reader());
        let mut sent_any = false;
        let mut buf_line = String::new();
        let mut reader = reader;
        let mut terminal_error: Option<String> = None;
        /*
         * The turn's reasoning, accumulated so the finished message can carry it.
         *
         * The live text is emitted below as it streams, but it was never KEPT:
         * the chat's `done` frame carried no `reasoning`, and the history that
         * the next request is built from had nothing to echo. Providers that
         * expose reasoning expect their own chain of thought back — Anthropic
         * validates the signature on a thinking block, the OpenAI-compatible
         * gateways take `reasoning_content` on the assistant turn — so a chat
         * that dropped it made the model re-derive, or contradict, what it had
         * already worked out one turn earlier.
         *
         * A plain accumulator rather than `StreamAcc`: this path has no tools,
         * so it needs neither the tool-call blocks nor the XML fallback, only
         * the two reasoning fields every format has in common.
         */
        let mut reasoning_acc = String::new();
        let mut reasoning_sig = String::new();

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => {
                    /*
                     * EOF. Whether this is a clean end or a broken stream
                     * depends on whether anything arrived.
                     *
                     * Not every provider ends with a `[DONE]` sentinel: Gemini's
                     * SSE closes the connection with no terminator at all. The
                     * old code treated EVERY EOF as "stream ended before
                     * completion", so a perfectly complete answer from such a
                     * provider was flagged as an error - the text was there, but
                     * the bubble carried a failure. EOF after text is the normal
                     * end; EOF with nothing received is the real failure, and the
                     * `!sent_any` check below still reports it.
                     */
                    if !sent_any {
                        terminal_error = Some("stream ended before completion".into());
                    }
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    /*
                     * Sebuah stream yang putus di tengah TIDAK membuang teks yang
                     * sudah sampai. Kalau sudah ada jawaban (`sent_any`), potongan
                     * yang hilang hanyalah ekornya; melaporkan error fatal di sini
                     * membuang kalimat yang utuh dan menggantinya dengan bubble
                     * merah. Yang sudah terkirim dibiarkan, dan hanya kalau belum
                     * ada apa-apa yang datang putusnya diperlakukan sebagai
                     * kegagalan.
                     */
                    if !sent_any {
                        terminal_error = Some(format!("stream terputus: {e}"));
                    }
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
                    /*
                     * Satu baris SSE yang gagal diparse biasanya adalah ekor yang
                     * terpotong saat koneksi putus - bukan alasan membuang jawaban
                     * yang sudah utuh. Kalau sudah ada teks, perlakukan sebagai
                     * akhir stream yang wajar; kalau belum ada apa-apa, barulah ini
                     * kegagalan sungguhan.
                     */
                    if !sent_any {
                        terminal_error = Some(format!("invalid stream response: {e}"));
                    }
                    break;
                }
            };

            if let Some(think) = adapters::extract_reasoning(&prov, &v) {
                /*
                 * Accumulated as well as emitted.
                 *
                 * The frames arriving here are deltas for every format this app
                 * speaks, so appending is right; the frontend's cumulative/delta
                 * heuristic exists for providers that restate the whole text,
                 * and it protects the BUBBLE, not this string. A cumulative
                 * provider would build a longer history here than the screen
                 * showed — kept deliberately, because the history is what the
                 * model reads back, and a duplicated chain of thought is a far
                 * cheaper error than a missing one.
                 */
                reasoning_acc.push_str(&think);
                emit_chunk(&handle, json!({ "id": req_id, "reasoning": think }));
            }
            /* Anthropic's signature rides a delta of its own, with no text. */
            if let Some(sig) = v.pointer("/delta/signature").and_then(|x| x.as_str()) {
                reasoning_sig.push_str(sig);
            }
            if let Some(text) = adapters::extract_delta(&prov, &v) {
                if !text.is_empty() {
                    sent_any = true;
                    emit_chunk(&handle, json!({ "id": req_id, "text": text }));
                }
            }
            /*
             * Report token usage as it arrives.
             *
             * Nothing read it before, so every cost and token counter in the
             * app was fed `undefined` and the accounting was dead code. The
             * counts are CUMULATIVE for the turn, so the frontend REPLACES
             * rather than adds — accumulating here would multiply the cost by
             * however many frames carried the field.
             */
            if let Some((masuk, keluar)) = adapters::extract_usage(&prov, &v) {
                emit_chunk(
                    &handle,
                    json!({
                        "id": req_id,
                        "usage": { "input": masuk, "output": keluar },
                    }),
                );
            }
        }

        let cancelled = cancel.load(Ordering::Relaxed);
        if !cancelled && terminal_error.is_none() && !sent_any {
            /*
             * No visible text came back. Two very different causes:
             *
             *   1. The stream carried reasoning but ran out before any answer —
             *      a reasoning model (mr-vip, claude-sonnet-4.6, …) that spent
             *      its whole `max_tokens` budget thinking. The turn is not
             *      broken; the budget was too small. Saying "sent no text at
             *      all" here is wrong and sent readers chasing a provider bug
             *      that did not exist.
             *   2. Nothing at all arrived — a genuinely empty stream.
             *
             * Tell them apart so the message points at the real fix (raise the
             * output limit) instead of a phantom one.
             */
            terminal_error = Some(if !reasoning_acc.is_empty() {
                "Model menghabiskan seluruh anggaran token untuk bernalar tanpa \
                 sempat menjawab — naikkan batas keluaran (max tokens) atau turunkan \
                 reasoning effort"
                    .into()
            } else {
                "The provider sent no text at all".into()
            });
        }
        if let Some(err) = terminal_error_to_emit(cancelled, terminal_error) {
            emit_chunk(&handle, json!({ "id": req_id, "err": err }));
        }
        /*
         * Hand the reasoning back with the finished turn.
         *
         * Attached only when non-empty: `reasoning: ""` is not the same as
         * absent, and some routers reject the empty form. This is what lets the
         * chat's history carry the model's own chain of thought into the next
         * request instead of leaving it on screen only.
         */
        let reasoning = (!reasoning_acc.is_empty()).then_some(reasoning_acc);
        let signature = (!reasoning_sig.is_empty()).then_some(reasoning_sig);
        let mut akhir = json!({ "id": req_id, "done": true, "cancelled": cancelled });
        if let Some(r) = &reasoning {
            akhir["reasoning"] = json!(r);
        }
        if let Some(s) = &signature {
            akhir["reasoningSignature"] = json!(s);
        }
        emit_chunk(&handle, akhir);
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
    full_url: Option<bool>,
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
        full_url,
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;
    let prov = provider.clone();
    /* Disalin sebelum `prepared` dipindah ke dalam tugas: pesan error perlu
    menyebut host yang dihubungi, dan setelah dipindah nilainya tidak bisa
    dibaca lagi dari luar. */
    let alamat = prepared.url.clone();

    let hasil = tokio::task::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS)))
            .timeout_recv_response(Some(std::time::Duration::from_secs(
                RECEIVE_IDLE_TIMEOUT_SECS,
            )))
            .timeout_per_call(Some(std::time::Duration::from_secs(
                TOTAL_CALL_TIMEOUT_SECS,
            )))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        match kirim_dengan_ulang(&agent, &prepared, 4) {
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
        return Err(ZephyrError::InvalidInput(pesan_http(
            status, &raw, &model, &alamat,
        )));
    }

    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid provider response: {e}")))?;
    adapters::parse_tool_response(&prov, &v).map_err(ZephyrError::InvalidInput)
}

/// Ambil catatan payload terakhir yang ditolak provider, untuk diagnosis UI.
#[tauri::command]
pub fn ai_penolakan_terakhir() -> Option<String> {
    tolak_terakhir()
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
    full_url: Option<bool>,
    max_tokens: Option<u32>,
    effort: Option<ReasoningEffort>,
    session_id: Option<String>,
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

    let mut prepared = adapters::prepare_tools_stream(
        &provider,
        &model,
        &messages,
        &tools,
        base_url.as_deref(),
        full_url,
        &key,
        max_tokens.unwrap_or(2048),
        effort,
    )?;
    tambah_header_afinitas(&mut prepared, session_id.as_deref());

    let capture_id = rekam_request(
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
            .timeout_recv_response(Some(std::time::Duration::from_secs(
                RECEIVE_IDLE_TIMEOUT_SECS,
            )))
            .timeout_per_call(Some(std::time::Duration::from_secs(
                TOTAL_CALL_TIMEOUT_SECS,
            )))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let resp = match kirim_dengan_ulang(&agent, &prepared, 4) {
            Ok(r) => r,
            Err(e) => {
                let cancelled = cancel.load(Ordering::Relaxed);
                if !cancelled {
                    emit_chunk(&handle, json!({ "id": req_id, "err": pesan_koneksi(&e) }));
                }
                emit_chunk(
                    &handle,
                    json!({ "id": req_id, "toolDone": true, "cancelled": cancelled }),
                );
                return;
            }
        };

        let status = resp.status().as_u16();
        if status >= 400 {
            let mut body = resp.into_body();
            let raw: String = body.read_to_string().unwrap_or_default();
            catat_penolakan(status, &prepared, &model, &raw);
            let msg = pesan_http(status, &raw, &model, &prepared.url);
            let cancelled = cancel.load(Ordering::Relaxed);
            if !cancelled {
                emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            }
            emit_chunk(
                &handle,
                json!({ "id": req_id, "toolDone": true, "cancelled": cancelled }),
            );
            return;
        }

        let mut acc = adapters::StreamAcc::new(&prov);
        let mut tool_call_capture = capture_id.map(|_| OpenAiToolCallCapture::default());
        /* Text held back because its tail might still grow into a tool tag. */
        let mut tahan = String::new();
        /*
         * Whether anything real came out of this stream. Used to tell a clean
         * EOF (a provider that ends without a `[DONE]` sentinel, e.g. Gemini)
         * from a stream that died before delivering anything - only the second
         * is an error.
         */
        let mut ada_output = false;
        /*
         * The step's token counts, replaced whenever the provider reports newer
         * (cumulative) numbers.
         *
         * Declared here because the agent loop's `usage` field was optional and
         * then never filled — a subagent's token total and the cost derived from
         * it were always zero, so the accounting was dead code.
         */
        let mut langkah_usage: Option<(u64, u64)> = None;
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
                    /*
                     * EOF after output is the normal end for providers that do
                     * not send a `[DONE]` sentinel (Gemini). Only an EOF with
                     * nothing received is a real failure - the same rule the
                     * chat stream applies.
                     */
                    if !ada_output {
                        terminal_error = Some("stream ended before completion".into());
                    }
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    /*
                     * Sebuah stream yang putus di tengah TIDAK membuang teks yang
                     * sudah sampai. Kalau sudah ada output (`ada_output`), potongan
                     * yang hilang hanyalah ekornya; melaporkan error fatal di sini
                     * membuang kalimat yang utuh dan menggantinya dengan bubble
                     * merah. Yang sudah terkirim dibiarkan, dan hanya kalau belum
                     * ada apa-apa yang datang putusnya diperlakukan sebagai
                     * kegagalan.
                     */
                    if !ada_output {
                        terminal_error = Some(format!("stream terputus: {e}"));
                    }
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
                    /*
                     * Satu baris SSE yang gagal diparse biasanya ekor yang
                     * terpotong saat koneksi putus. Kalau sudah ada output,
                     * perlakukan sebagai akhir stream yang wajar; hanya kalau
                     * belum ada apa-apa ini kegagalan sungguhan.
                     */
                    if !ada_output {
                        terminal_error = Some(format!("invalid stream response: {e}"));
                    }
                    break;
                }
            };

            if let Some(capture) = &mut tool_call_capture {
                capture.feed(&v);
            }

            if let Some(think) = adapters::extract_reasoning(&prov, &v) {
                ada_output = true;
                emit_chunk(&handle, json!({ "id": req_id, "reasoning": think }));
            }
            /*
             * Keep the reasoning and its signature for the round trip.
             *
             * The live text above is what the UI paints; this is what the
             * CONVERSATION needs. Anthropic sends the signature in a separate
             * delta and rejects a thinking block returned without it, so both
             * halves are accumulated on the tool accumulator and handed back
             * with the finished step. The same call covers the OpenAI and Gemini
             * accumulators, which carried no reasoning at all before — their
             * finished step reported null however much the model had thought.
             */
            acc.feed_reasoning(&v);
            /*
             * Token usage for the step.
             *
             * The agent loop's `usage` was declared optional and then never
             * filled, so a subagent's token total and the cost it derives were
             * always zero. Reported per frame and replaced, not added, because
             * the provider's counts are cumulative for the turn.
             */
            if let Some((masuk, keluar)) = adapters::extract_usage(&prov, &v) {
                langkah_usage = Some((masuk, keluar));
            }
            /*
             * A chunk can carry a TOOL CALL with no text at all - and in agent
             * mode that is the normal first response (the model decides which
             * tool to run before saying anything). `acc.feed` swallows those
             * into its call list and returns `None`, so counting only the text
             * branch would leave `ada_output` false for a perfectly good
             * tool-only turn, and the EOF below would flag it as a broken
             * stream. Recognise a content-bearing chunk by shape across the
             * three formats, so any of text/reasoning/tool-call marks output.
             */
            if chunk_membawa_tool_call(&prov, &v) {
                ada_output = true;
            }
            if let Some(text) = acc.feed(&v) {
                /*
                 * Hold back only the part that may still become a tool tag.
                 *
                 * The parser only sees complete markup, and it runs at `finish`
                 * — but streaming already sent every chunk to the UI by then,
                 * so a tag being written out arrived as prose and stayed on
                 * screen. Keeping a possible partial tag in the buffer means
                 * the parser gets first refusal; whatever it does not consume
                 * is flushed below as ordinary text.
                 *
                 * The split matters as much as the hold. Emitting all-or-nothing
                 * meant that as soon as a marker appeared ANYWHERE in the
                 * buffer, every later chunk kept the guard true and nothing more
                 * was shown until the response ended — a reply that mentioned
                 * the marker stalled mid-sentence and then dumped its remainder
                 * in one block, which reads as the app having frozen. Text
                 * BEFORE the marker is settled, so it goes out now; only the
                 * marker and everything after it waits.
                 */
                ada_output = true;
                tahan.push_str(&text);
                let aman = xml_tools::posisi_aman(&tahan);
                if aman > 0 {
                    let (kirim, sisa) = tahan.split_at(aman);
                    let bersih = xml_tools::bersihkan_teks(kirim);
                    if !bersih.is_empty() {
                        emit_chunk(&handle, json!({ "id": req_id, "text": bersih }));
                    }
                    tahan = sisa.to_string();
                }
            }
        }

        /* Read the reasoning BEFORE `finish` consumes the accumulator. */
        let (reasoning, reasoning_sig) = acc.reasoning_parts();
        let (content, tool_calls) = match acc.finish() {
            Ok(result) => result,
            Err(error) => {
                if terminal_error.is_none() {
                    terminal_error = Some(error);
                }
                (String::new(), Vec::new())
            }
        };
        rekam_diagnostik_tool_call(
            &handle,
            capture_id,
            tool_call_capture.map_or_else(Vec::new, OpenAiToolCallCapture::finish),
        );
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
                "reasoning": reasoning,
                "reasoningSignature": reasoning_sig,
                "usage": langkah_usage.map(|(i, o)| json!({ "input": i, "output": o })),
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
        format!("Provider menolak koneksi. Periksa Base URL dan apakah servernya hidup. ({teks})")
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

#[cfg(test)]
mod tool_call_capture_tests {
    use super::OpenAiToolCallCapture;
    use serde_json::json;

    #[test]
    fn captures_only_tool_argument_shape_and_parse_status() {
        let mut capture = OpenAiToolCallCapture::default();
        capture.feed(&json!({
            "choices": [{
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_123",
                        "function": {
                            "name": "browser_open",
                            "arguments": "{\"url\":"
                        }
                    }]
                }
            }]
        }));
        capture.feed(&json!({
            "choices": [{
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "function": { "arguments": "\"https://example.com\"}" }
                    }]
                }
            }]
        }));

        let diagnostics = capture.finish();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].id.as_deref(), Some("call_123"));
        assert_eq!(diagnostics[0].name.as_deref(), Some("browser_open"));
        assert_eq!(diagnostics[0].argument_fragments, 2);
        assert_eq!(diagnostics[0].argument_kind.as_deref(), Some("string"));
        assert_eq!(diagnostics[0].arguments_json_valid, Some(true));
        assert_eq!(
            diagnostics[0].parsed_arguments_kind.as_deref(),
            Some("object")
        );
        let serialized = serde_json::to_string(&diagnostics[0]).expect("serialize");
        assert!(!serialized.contains("example.com"));
    }

    #[test]
    fn reports_empty_arguments_and_non_string_argument_shapes() {
        let mut capture = OpenAiToolCallCapture::default();
        capture.feed(&json!({
            "choices": [{
                "delta": {
                    "tool_calls": [
                        { "index": 0, "function": { "name": "missing_args" } },
                        { "index": 1, "function": { "name": "object_args", "arguments": {} } }
                    ]
                }
            }]
        }));

        let diagnostics = capture.finish();
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].argument_fragments, 0);
        assert_eq!(diagnostics[0].argument_chars, 0);
        assert_eq!(diagnostics[0].arguments_json_valid, None);
        assert_eq!(diagnostics[1].argument_kind.as_deref(), Some("object"));
        assert_eq!(diagnostics[1].arguments_json_valid, None);
    }
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
mod pesan_http_tests {
    use super::pesan_http;

    /*
     * Bug yang dikunci di sini: 502 dari sebuah GATEWAY biasanya berbadan
     * halaman HTML atau teks polos, bukan JSON. Versi lama hanya membaca
     * /error/message, jadi untuk kasus itu pesannya kosong dan pengguna melihat
     * kalimat telanjang "Server provider bermasalah (502)" tanpa satu kata pun
     * dari server - tepat pada provider yang paling mungkin gagal.
     *
     * Yang diperiksa: pesan server IKUT TERSAMPAI, dan model serta hostnya
     * disebut (satu gateway melayani banyak model, jadi nama model adalah
     * fakta paling berguna untuk tahu siapa yang menolak).
     */

    #[test]
    fn html_502_dari_router_ikut_dilaporkan() {
        let badan = "<html><head><title>502 Bad Gateway</title></head>\
                     <body><h1>502 Bad Gateway</h1><p>nginx</p></body></html>";
        let pesan = pesan_http(
            502,
            badan,
            "mr-vip",
            "https://modelrouter.id/v1/chat/completions",
        );

        assert!(pesan.contains("502"), "status harus disebut: {pesan}");
        assert!(
            pesan.contains("Bad Gateway"),
            "isi halaman server harus ikut, bukan dibuang: {pesan}"
        );
        assert!(
            pesan.contains("mr-vip"),
            "nama model harus disebut: {pesan}"
        );
        assert!(
            pesan.contains("modelrouter.id"),
            "host yang dihubungi harus disebut: {pesan}"
        );
    }

    #[test]
    fn json_error_message_tetap_dipakai() {
        let badan = r#"{"error":{"message":"kuota habis"}}"#;
        let pesan = pesan_http(
            429,
            badan,
            "mr-vip",
            "https://contoh.id/v1/chat/completions",
        );

        assert!(
            pesan.contains("kuota habis"),
            "pesan JSON harus dipakai: {pesan}"
        );
        /* JSON mentahnya tidak perlu ikut - sudah rapi. */
        assert!(
            !pesan.contains("\"error\""),
            "JSON mentah tidak perlu ikut: {pesan}"
        );
    }

    #[test]
    fn badan_kosong_tidak_meninggalkan_ekor_kosong() {
        let pesan = pesan_http(503, "", "mr-vip", "https://contoh.id/v1/chat/completions");

        assert!(pesan.contains("503"), "status tetap disebut: {pesan}");
        assert!(
            !pesan.ends_with('—'),
            "tidak boleh berakhir dengan pemisah: {pesan}"
        );
        assert!(
            !pesan.ends_with("— "),
            "tidak boleh berakhir dengan pemisah: {pesan}"
        );
    }

    #[test]
    fn badan_panjang_dipotong() {
        let badan = "x".repeat(2000);
        let pesan = pesan_http(
            500,
            &badan,
            "mr-vip",
            "https://contoh.id/v1/chat/completions",
        );

        assert!(
            pesan.chars().count() < 500,
            "badan panjang harus dipotong supaya tidak membanjiri panel: {} karakter",
            pesan.chars().count()
        );
    }
}

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

                let body = match status {
                    200 => {
                        "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n"
                    }
                    400 => {
                        "{\"error\":{\"message\":\"reasoning_content must be passed back to the API\"}}"
                    }
                    _ => "{\"error\":{\"message\":\"mock failure\"}}",
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

    fn prepared_deepseek_tool_call(url: String) -> Prepared {
        let mut request = prepared(url);
        request.body = json!({
            "model": "deepseek-v4.1-flash",
            "messages": [{
                "role": "assistant",
                "tool_calls": [{
                    "id": "call_1",
                    "type": "function",
                    "function": { "name": "read_file", "arguments": "{}" }
                }]
            }]
        });
        request
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
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            3,
            "harus 3 percobaan"
        );
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
        let resp =
            kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan respons");
        assert_eq!(
            resp.status().as_u16(),
            502,
            "percobaan terakhir tetap dilaporkan"
        );
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            3,
            "tidak lebih dari 3"
        );
    }

    #[test]
    fn does_not_retry_a_401() {
        let (url, hits) = server(vec![401, 200]);
        let resp =
            kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan respons");
        assert_eq!(resp.status().as_u16(), 401, "401 diteruskan apa adanya");
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "401 tidak boleh diulang - jawabannya sama setiap kali"
        );
    }

    #[test]
    fn retries_only_matching_deepseek_reasoning_400s() {
        let (url, hits) = server(vec![400]);
        let resp = kirim_dengan_ulang(&agent(), &prepared_deepseek_tool_call(url), 3)
            .expect("percobaan kedua harus berhasil");
        assert_eq!(resp.status().as_u16(), 200);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[test]
    fn does_not_retry_other_400s_and_preserves_the_response_body() {
        let (url, hits) = server(vec![400, 200]);
        let mut resp =
            kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan 400");
        assert_eq!(resp.status().as_u16(), 400);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(resp
            .body_mut()
            .read_to_string()
            .expect("badan respons harus terbaca")
            .contains("must be passed back to the API"));
    }

    #[test]
    fn a_healthy_call_is_not_retried() {
        let (url, hits) = server(vec![200]);
        let resp = kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus sukses");
        assert_eq!(resp.status().as_u16(), 200);
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "sekali saja"
        );
    }

    /*
     * Tiga timeout ini harus tetap punya urutan yang benar.
     *
     * Yang dikunci di sini adalah bug yang dilaporkan user: UI terkunci 5-6
     * menit lalu berakhir dengan jawaban yang salah sasaran. Urutannya salah
     * karena tiap angka dihitung sendiri-sendiri:
     *
     *   Rust  : 3 percobaan x 420s per-call + 2 jeda x 20s = 1300s
     *   hard  : 900s  (frontend menyerah duluan)
     *   idle  : 360s  (watchdog frontend)
     *
     * Jadi frontend menyerah lebih dulu, Rust tetap hidup, dan chunk yang
     * terlambat menempel ke pesan yang sedang diketik. Sebelum deadline ini
     * ada, tidak ada satu pun tes yang memeriksa HUBUNGAN antar angka itu -
     * masing-masing benar kalau dilihat sendiri.
     *
     * Tes ini tidak menyentuh jaringan; ia memeriksa aritmetikanya, karena
     * persis itulah yang rusak. Angka frontend sengaja disalin di sini dan
     * harus dicocokkan kalau diubah - kalau tidak, tes ini akan lulus dengan
     * tenang sementara UI kembali terkunci.
     */
    const FRONTEND_IDLE_WATCHDOG_SECS: u64 = 900;
    const FRONTEND_HARD_LIMIT_SECS: u64 = 2700;

    #[test]
    fn retry_ladder_always_reports_before_the_frontend_gives_up() {
        /* Worst case: every attempt uses the per-call timeout, plus every backoff. */
        let attempts: u64 = 4;
        let backoff_secs: u64 = 20;
        let per_call_secs = TOTAL_CALL_TIMEOUT_SECS.max(RECEIVE_IDLE_TIMEOUT_SECS);

        /* Without the deadline - what used to happen. If this stops being
        longer than the frontend's hard limit, this test has stopped testing
        anything and should be rethought, not silently kept. */
        let tanpa_deadline = attempts * per_call_secs + (attempts - 1) * backoff_secs;
        assert!(
            tanpa_deadline > FRONTEND_HARD_LIMIT_SECS,
            "perkiraan lama ({tanpa_deadline} dtk) tidak lagi melewati hard limit \
             ({FRONTEND_HARD_LIMIT_SECS} dtk), jadi tes ini tidak menguji apa pun"
        );

        /* With the deadline, the ladder is capped no matter how long an attempt takes. */
        let dengan_deadline = RETRY_LOOP_DEADLINE_SECS + backoff_secs;
        assert!(
            dengan_deadline < FRONTEND_IDLE_WATCHDOG_SECS,
            "Rust harus melapor sebelum watchdog frontend: {dengan_deadline} dtk >= \
             idle {FRONTEND_IDLE_WATCHDOG_SECS} dtk"
        );
        assert!(
            dengan_deadline < FRONTEND_HARD_LIMIT_SECS,
            "dan jauh di bawah hard limit: {dengan_deadline} vs {FRONTEND_HARD_LIMIT_SECS}"
        );
    }

    #[test]
    fn a_fast_failing_provider_still_gets_its_retries() {
        /*
         * Deadline tidak boleh mematikan ulang-ulang yang berguna.
         *
         * 502 yang datang dalam hitungan detik adalah kondisi yang paling sering
         * terjadi dan paling layak diulang - dan ia tidak pernah menyentuh
         * deadline, karena tangganya selesai dalam hitungan detik, bukan setelah
         * menunggu 300 detik.
         */
        let (url, hits) = server(vec![502, 502, 200]);
        let resp =
            kirim_dengan_ulang(&agent(), &prepared(url), 3).expect("harus mengembalikan respons");
        assert_eq!(resp.status().as_u16(), 200, "percobaan ketiga berhasil");
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            3,
            "tiga percobaan tetap dijalankan - deadline hanya menghentikan yang menunggu"
        );
    }
}
