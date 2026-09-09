// adapters/openai.rs — format OpenAI Chat Completions (juga dipakai
// deepseek, opencode/local loopback, dan provider custom OpenAI-compatible).
//
// Body : { model, messages, stream: true, max_tokens }
// Auth : Authorization: Bearer <key>
// Stream: SSE `data: {"choices":[{"delta":{"content":"..."}}]}`

use crate::adapters::trim_base;
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ToolCall, ToolSpec};
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

/// Request non-streaming + tools (mode agent).
pub fn prepare_tools(
    provider: &str,
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

    Prepared {
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
    }
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
    if let Some(tcs) = msg.and_then(|m| m.get("tool_calls")).and_then(|t| t.as_array()) {
        for tc in tcs {
            tool_calls.push(ToolCall {
                id: tc.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
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
