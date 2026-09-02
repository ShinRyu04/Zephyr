// adapters/anthropic.rs — Anthropic Messages API.
//
// Beda dari OpenAI:
//   * header  : x-api-key + anthropic-version (bukan Bearer)
//   * system  : field terpisah, TIDAK boleh jadi anggota messages
//   * body    : max_tokens WAJIB
//   * stream  : SSE dengan beberapa tipe event; teks ada di
//               content_block_delta.delta.text

use crate::adapters::trim_base;
use crate::ai::{ChatMsg, Prepared};
use serde_json::{json, Value};

pub fn prepare(
    model: &str,
    messages: &[ChatMsg],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
) -> Prepared {
    let base = base_url
        .map(trim_base)
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());

    // Pesan system dipisahkan; sisanya harus berselang user/assistant.
    let mut system = String::new();
    let mut turns: Vec<Value> = Vec::new();
    for m in messages {
        if m.role == "system" {
            if !system.is_empty() {
                system.push_str("\n\n");
            }
            system.push_str(&m.content);
            continue;
        }
        turns.push(json!({ "role": m.role, "content": m.content }));
    }

    let mut body = json!({
        "model": model,
        "messages": turns,
        "max_tokens": max_tokens,
        "stream": true,
    });
    if !system.is_empty() {
        body["system"] = Value::String(system);
    }

    Prepared {
        url: format!("{base}/v1/messages"),
        headers: vec![
            ("x-api-key".into(), key.to_string()),
            ("anthropic-version".into(), "2023-06-01".into()),
            ("Content-Type".into(), "application/json".into()),
            ("Accept".into(), "text/event-stream".into()),
        ],
        body,
        sse: true,
    }
}

pub fn extract_delta(v: &Value) -> Option<String> {
    match v.get("type").and_then(|t| t.as_str()) {
        // potongan teks streaming
        Some("content_block_delta") => v
            .pointer("/delta/text")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        // blok pertama kadang sudah membawa teks awal
        Some("content_block_start") => v
            .pointer("/content_block/text")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        // message_start / ping / message_delta / message_stop -> bukan teks
        _ => None,
    }
}
