// adapters/openai.rs — format OpenAI Chat Completions (juga dipakai
// deepseek, opencode/local loopback, dan provider custom OpenAI-compatible).
//
// Body : { model, messages, stream: true, max_tokens }
// Auth : Authorization: Bearer <key>
// Stream: SSE `data: {"choices":[{"delta":{"content":"..."}}]}`

use crate::adapters::trim_base;
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use serde_json::{json, Value};

fn default_base(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "https://api.deepseek.com/v1",
        "xai" => "https://api.x.ai/v1",
        "local" => "http://127.0.0.1:4096/v1",
        "lmstudio" => "http://127.0.0.1:1234/v1",
        _ => "https://api.openai.com/v1",
    }
}

pub fn prepare(
    provider: &str,
    model: &str,
    messages: &[ChatMsg],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> Prepared {
    let base = base_url
        .map(trim_base)
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| default_base(provider).to_string());

    let mut body = json!({
        "model": model,
        "messages": messages.iter().map(|m| {
            let imgs = m.all_images();
            if !imgs.is_empty() {
                let mut content = vec![json!({ "type": "text", "text": m.content })];
                for img in imgs {
                    content.push(json!({ "type": "image_url", "image_url": { "url": img } }));
                }
                json!({ "role": m.role, "content": content })
            } else {
                json!({ "role": m.role, "content": m.content })
            }
        }).collect::<Vec<_>>(),
        "stream": true,
        "max_tokens": max_tokens,
    });

    // Item T1.1: reasoning_effort hanya dikirim kalau user memilih.
    // Sebagian provider OpenAI-compatible menolak field tak dikenal (400),
    // jadi default = tidak dikirim sama sekali.
    if let Some(e) = effort {
        body["reasoning_effort"] = json!(e.openai());
    }

    Prepared {
        url: format!("{base}/chat/completions"),
        headers: vec![
            ("Authorization".into(), format!("Bearer {key}")),
            ("Content-Type".into(), "application/json".into()),
            ("Accept".into(), "text/event-stream".into()),
        ],
        body,
        sse: true,
    }
}

pub fn extract_delta(v: &Value) -> Option<String> {
    // delta.content = potongan streaming; message.content = jawaban non-stream
    // (beberapa gateway OpenAI-compatible mengabaikan stream:true).
    v.pointer("/choices/0/delta/content")
        .or_else(|| v.pointer("/choices/0/message/content"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

/// T1.1: potongan teks PENALARAN (bukan jawaban). Dipisah dari `extract_delta`
/// supaya UI bisa menaruhnya di blok "Reasoned" yang bisa dilipat.
///
/// Nama field berbeda antar penyedia OpenAI-compatible:
///   * `reasoning_content`  — DeepSeek, banyak gateway (termasuk modelrouter)
///   * `reasoning`          — OpenRouter & sebagian gateway
///   * `reasoning_text`     — OpenAI Responses-style
pub fn extract_reasoning(v: &Value) -> Option<String> {
    for jalur in [
        "/choices/0/delta/reasoning_content",
        "/choices/0/delta/reasoning",
        "/choices/0/delta/reasoning_text",
        "/choices/0/message/reasoning_content",
    ] {
        if let Some(t) = v.pointer(jalur).and_then(|x| x.as_str()) {
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

/// Request non-streaming + tools (mode agent).
pub fn prepare_tools(
    provider: &str,
    model: &str,
    messages: &[AgentMsg],
    tools: &[ToolSpec],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> Prepared {
    let base = base_url
        .map(trim_base)
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| default_base(provider).to_string());

    let msgs = messages
        .iter()
        .map(|m| {
            if m.role == "tool" {
                json!({
                    "role": "tool",
                    "tool_call_id": m.tool_call_id,
                    "content": m.content,
                })
            } else if m.role == "assistant" && m.tool_calls.is_some() {
                json!({
                    "role": "assistant",
                    "content": m.content,
                    "tool_calls": m.tool_calls.as_ref().unwrap().iter().map(|tc| json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": serde_json::to_string(&tc.args).unwrap_or_default(),
                        }
                    })).collect::<Vec<_>>(),
                })
            } else {
                json!({ "role": m.role, "content": m.content })
            }
        })
        .collect::<Vec<_>>();

    let mut prep = Prepared {
        url: format!("{base}/chat/completions"),
        headers: vec![
            ("Authorization".into(), format!("Bearer {key}")),
            ("Content-Type".into(), "application/json".into()),
        ],
        body: json!({
            "model": model,
            "messages": msgs,
            "tools": tools.iter().map(|t| json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                }
            })).collect::<Vec<_>>(),
            "stream": false,
            "max_tokens": max_tokens,
        }),
        sse: false,
    };
    if let Some(e) = effort {
        prep.body["reasoning_effort"] = json!(e.openai());
    }
    prep
}

/// Parse jawaban non-streaming OpenAI (choices[0].message).
pub fn parse_tool_response(v: &Value) -> AiToolResult {
    let msg = v.pointer("/choices/0/message");
    let content = msg
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    let mut tool_calls = Vec::new();
    if let Some(tcs) = msg
        .and_then(|m| m.get("tool_calls"))
        .and_then(|t| t.as_array())
    {
        for tc in tcs {
            tool_calls.push(ToolCall {
                id: tc
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string(),
                name: tc
                    .pointer("/function/name")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string(),
                args: tc
                    .pointer("/function/arguments")
                    .and_then(|x| x.as_str())
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_else(|| json!({})),
            });
        }
    }
    let done = tool_calls.is_empty();
    AiToolResult {
        content,
        tool_calls,
        done,
    }
}

/// Akumulator stream untuk mode agent (item 21).
///
/// Teks datang per potongan seperti biasa; panggilan tool datang BERSERKAT:
/// `delta.tool_calls[]` hanya memuat `index` + nama di paket pertama, lalu
/// `arguments` menempel sepotong-sepotong sebagai string JSON yang belum
/// tentu valid sampai paket terakhir. Karena itu argumen dikumpulkan dulu
/// per indeks, baru di-parse di `finish()`.
#[derive(Default)]
pub struct ToolAcc {
    text: String,
    calls: Vec<(String, String, String)>, // (id, name, arguments)
}

impl ToolAcc {
    pub fn feed(&mut self, v: &Value) -> Option<String> {
        let mut teks_baru = None;
        if let Some(t) = v
            .pointer("/choices/0/delta/content")
            .and_then(|x| x.as_str())
        {
            if !t.is_empty() {
                self.text.push_str(t);
                teks_baru = Some(t.to_string());
            }
        }
        if let Some(tcs) = v
            .pointer("/choices/0/delta/tool_calls")
            .and_then(|x| x.as_array())
        {
            for tc in tcs {
                let idx = tc.get("index").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                while self.calls.len() <= idx {
                    self.calls
                        .push((String::new(), String::new(), String::new()));
                }
                let slot = &mut self.calls[idx];
                if let Some(id) = tc.get("id").and_then(|x| x.as_str()) {
                    if !id.is_empty() {
                        slot.0 = id.to_string();
                    }
                }
                if let Some(n) = tc.pointer("/function/name").and_then(|x| x.as_str()) {
                    if !n.is_empty() {
                        slot.1 = n.to_string();
                    }
                }
                if let Some(a) = tc.pointer("/function/arguments").and_then(|x| x.as_str()) {
                    slot.2.push_str(a);
                }
            }
        }
        teks_baru
    }

    pub fn finish(self) -> (String, Vec<ToolCall>) {
        let calls = self
            .calls
            .into_iter()
            .filter(|(_, name, _)| !name.is_empty())
            .enumerate()
            .map(|(i, (id, name, args))| ToolCall {
                // Sebagian gateway tidak mengirim id di stream — sintetis.
                id: if id.is_empty() {
                    format!("{name}-{i}")
                } else {
                    id
                },
                name,
                args: serde_json::from_str(&args).unwrap_or_else(|_| json!({})),
            })
            .collect();
        (self.text, calls)
    }
}
