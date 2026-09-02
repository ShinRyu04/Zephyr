// adapters/openai.rs — format OpenAI Chat Completions (juga dipakai
// deepseek, opencode/local loopback, dan provider custom OpenAI-compatible).
//
// Body : { model, messages, stream: true, max_tokens }
// Auth : Authorization: Bearer <key>
// Stream: SSE `data: {"choices":[{"delta":{"content":"..."}}]}`

use crate::adapters::trim_base;
use crate::ai::{ChatMsg, Prepared};
use serde_json::{json, Value};

fn default_base(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "https://api.deepseek.com/v1",
        "local" => "http://127.0.0.1:4096/v1",
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
) -> Prepared {
    let base = base_url
        .map(trim_base)
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| default_base(provider).to_string());

    Prepared {
        url: format!("{base}/chat/completions"),
        headers: vec![
            ("Authorization".into(), format!("Bearer {key}")),
            ("Content-Type".into(), "application/json".into()),
            ("Accept".into(), "text/event-stream".into()),
        ],
        body: json!({
            "model": model,
            "messages": messages.iter().map(|m| json!({
                "role": m.role,
                "content": m.content,
            })).collect::<Vec<_>>(),
            "stream": true,
            "max_tokens": max_tokens,
        }),
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
