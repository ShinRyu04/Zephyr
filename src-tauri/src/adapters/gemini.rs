// adapters/gemini.rs — Google Generative Language API.
//
// Beda dari OpenAI:
//   * key lewat header x-goog-api-key (bukan Authorization)
//   * URL memuat nama model: /v1beta/models/<model>:streamGenerateContent
//   * role 'assistant' bernama 'model'; system -> systemInstruction
//   * isi pesan = contents[].parts[].text
//   * respons stream: dipakai `?alt=sse` supaya formatnya SSE `data: {...}`
//     per baris. TANPA alt=sse server membalas JSON array yang di-pretty-print
//     dan dipecah sembarang antar-paket — satu objek bisa tersebar di banyak
//     baris dengan koma menempel, sehingga parsing per baris pasti gagal.
//     (Sudah dibuktikan di verify09: 0 token terbaca.)

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
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string());

    let mut system = String::new();
    let mut contents: Vec<Value> = Vec::new();
    for m in messages {
        if m.role == "system" {
            if !system.is_empty() {
                system.push_str("\n\n");
            }
            system.push_str(&m.content);
            continue;
        }
        let role = if m.role == "assistant" {
            "model"
        } else {
            "user"
        };
        contents.push(json!({ "role": role, "parts": [{ "text": m.content }] }));
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": { "maxOutputTokens": max_tokens },
    });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    Prepared {
        url: format!("{base}/v1beta/models/{model}:streamGenerateContent?alt=sse"),
        headers: vec![
            ("x-goog-api-key".into(), key.to_string()),
            ("Content-Type".into(), "application/json".into()),
            ("Accept".into(), "text/event-stream".into()),
        ],
        body,
        sse: true,
    }
}

/// Request non-streaming + tools. Fungsi dipanggil lewat
/// functionDeclarations; hasil tool dikirim sebagai functionResponse.
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
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string());

    let mut system = String::new();
    let mut contents: Vec<Value> = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(&m.content);
            }
            "tool" => {
                contents.push(json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": m.name.as_deref().unwrap_or(""),
                            "response": { "result": m.content },
                        }
                    }]
                }));
            }
            "assistant" => {
                let mut parts = vec![json!({ "text": m.content })];
                if let Some(tcs) = &m.tool_calls {
                    for tc in tcs {
                        parts.push(json!({
                            "functionCall": { "name": tc.name, "args": tc.args }
                        }));
                    }
                }
                contents.push(json!({ "role": "model", "parts": parts }));
            }
            _ => {
                contents.push(json!({
                    "role": if m.role == "user" { "user" } else { "model" },
                    "parts": [{ "text": m.content }],
                }));
            }
        }
    }

    let mut body = json!({
        "contents": contents,
        "tools": [{
            "functionDeclarations": tools.iter().map(|t| json!({
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            })).collect::<Vec<_>>()
        }],
        "generationConfig": { "maxOutputTokens": max_tokens },
    });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    Prepared {
        url: format!("{base}/v1beta/models/{model}:generateContent"),
        headers: vec![
            ("x-goog-api-key".into(), key.to_string()),
            ("Content-Type".into(), "application/json".into()),
        ],
        body,
        sse: false,
    }
}

/// Parse jawaban non-streaming Gemini (candidates[0].content.parts).
pub fn parse_tool_response(v: &Value) -> AiToolResult {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(parts) = v.pointer("/candidates/0/content/parts").and_then(|p| p.as_array()) {
        for p in parts {
            if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                content.push_str(t);
            }
            if let Some(fc) = p.get("functionCall") {
                let name = fc.get("name").and_then(|x| x.as_str()).unwrap_or_default().to_string();
                let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                // Gemini tidak memberi id tool_call — sintetis per indeks.
                tool_calls.push(ToolCall {
                    id: format!("{name}-{}", tool_calls.len()),
                    name,
                    args,
                });
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
    // Satu potongan bisa memuat beberapa part; gabungkan semuanya.
    let parts = v.pointer("/candidates/0/content/parts")?.as_array()?;
    let text: String = parts
        .iter()
        .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
        .collect();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}
