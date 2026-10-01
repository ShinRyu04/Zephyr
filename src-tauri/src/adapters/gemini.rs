use crate::adapters::{split_data_url, trim_base};
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use serde_json::{json, Value};

pub fn prepare(
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
        let mut parts = vec![json!({ "text": m.content })];
        for img in m.all_images() {
            if let Some((mime, data)) = split_data_url(img) {
                parts.push(json!({
                    "inline_data": { "mime_type": mime, "data": data }
                }));
            }
        }
        contents.push(json!({ "role": role, "parts": parts }));
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": { "maxOutputTokens": max_tokens },
    });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    if let Some(e) = effort {
        body["generationConfig"]["thinkingConfig"] = json!({ "thinkingBudget": e.gemini_budget() });
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

pub fn prepare_tools(
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
                let imgs = m.images.as_deref().unwrap_or(&[]);
                let mut parts = vec![json!({ "text": m.content })];
                for img in imgs {
                    if let Some((mime, data)) = crate::adapters::split_data_url(img) {
                        parts.push(json!({
                            "inlineData": { "mimeType": mime, "data": data }
                        }));
                    }
                }
                contents.push(json!({
                    "role": if m.role == "user" { "user" } else { "model" },
                    "parts": parts,
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

    if let Some(e) = effort {
        body["generationConfig"]["thinkingConfig"] = json!({ "thinkingBudget": e.gemini_budget() });
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

pub fn parse_tool_response(v: &Value) -> AiToolResult {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(parts) = v
        .pointer("/candidates/0/content/parts")
        .and_then(|p| p.as_array())
    {
        for p in parts {
            if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                content.push_str(t);
            }
            if let Some(fc) = p.get("functionCall") {
                let name = fc
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string();
                let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));

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

pub fn extract_reasoning(v: &Value) -> Option<String> {
    let parts = v.pointer("/candidates/0/content/parts")?.as_array()?;
    let mut out = String::new();
    for p in parts {
        if p.get("thought").and_then(|t| t.as_bool()) == Some(true) {
            if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                out.push_str(t);
            }
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

pub fn extract_delta(v: &Value) -> Option<String> {
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

#[derive(Default)]
pub struct ToolAcc {
    text: String,
    calls: Vec<ToolCall>,
}

impl ToolAcc {
    pub fn feed(&mut self, v: &Value) -> Option<String> {
        let parts = match v
            .pointer("/candidates/0/content/parts")
            .and_then(|p| p.as_array())
        {
            Some(p) => p,
            None => return None,
        };
        let mut teks_baru = String::new();
        for p in parts {
            if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                teks_baru.push_str(t);
            }
            if let Some(fc) = p.get("functionCall") {
                let name = fc
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string();
                if !name.is_empty() {
                    self.calls.push(ToolCall {
                        id: format!("{name}-{}", self.calls.len()),
                        name,
                        args: fc.get("args").cloned().unwrap_or_else(|| json!({})),
                    });
                }
            }
        }
        if teks_baru.is_empty() {
            None
        } else {
            self.text.push_str(&teks_baru);
            Some(teks_baru)
        }
    }

    pub fn finish(self) -> (String, Vec<ToolCall>) {
        (self.text, self.calls)
    }
}
