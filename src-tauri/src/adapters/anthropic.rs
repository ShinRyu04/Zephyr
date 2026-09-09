// adapters/anthropic.rs — Anthropic Messages API.
//
// Beda dari OpenAI:
//   * header  : x-api-key + anthropic-version (bukan Bearer)
//   * system  : field terpisah, TIDAK boleh jadi anggota messages
//   * body    : max_tokens WAJIB
//   * stream  : SSE dengan beberapa tipe event; teks ada di
//               content_block_delta.delta.text

use crate::adapters::trim_base;
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ToolCall, ToolSpec};
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

/// Request non-streaming + tools. Tool result dikemas sebagai
/// user message dengan content block `tool_result` (aturan Anthropic).
pub fn prepare_tools(
    model: &str,
    messages: &[AgentMsg],
    tools: &[ToolSpec],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
) -> Prepared {
    let base = base_url
        .map(trim_base)
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());

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
        if m.role == "tool" {
            turns.push(json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id,
                    "content": m.content,
                }]
            }));
        } else if m.role == "assistant" && m.tool_calls.is_some() {
            let mut blocks = vec![json!({ "type": "text", "text": m.content })];
            for tc in m.tool_calls.as_ref().unwrap() {
                blocks.push(json!({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.args,
                }));
            }
            turns.push(json!({ "role": "assistant", "content": blocks }));
        } else {
            turns.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let mut body = json!({
        "model": model,
        "messages": turns,
        "max_tokens": max_tokens,
        "tools": tools.iter().map(|t| json!({
            "name": t.name,
            "description": t.description,
            "input_schema": t.parameters,
        })).collect::<Vec<_>>(),
        "stream": false,
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
        ],
        body,
        sse: false,
    }
}

/// Parse jawaban non-streaming Anthropic (content blocks).
pub fn parse_tool_response(v: &Value) -> AiToolResult {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(blocks) = v.get("content").and_then(|c| c.as_array()) {
        for b in blocks {
            match b.get("type").and_then(|t| t.as_str()) {
                Some("text") => content.push_str(b.get("text").and_then(|t| t.as_str()).unwrap_or("")),
                Some("tool_use") => tool_calls.push(ToolCall {
                    id: b.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
                    name: b.get("name").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
                    args: b.get("input").cloned().unwrap_or_else(|| json!({})),
                }),
                _ => {}
            }
        }
    }
    let done = tool_calls.is_empty();
    AiToolResult {
        content,
        tool_calls,
        done,
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
