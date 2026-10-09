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
        let mut parts = Vec::new();
        /*
         * A previous model turn's reasoning, sent back as a thought part.
         *
         * Gemini flags it with `"thought": true` on the part itself rather than
         * a block type, and it precedes the answer text — the same order it
         * arrives in. Sent only on model turns; a user part carrying the flag is
         * not something the API produces and would be rejected.
         */
        if m.role == "assistant" {
            if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                parts.push(json!({ "text": t, "thought": true }));
            }
        }
        parts.push(json!({ "text": m.content }));
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
                let mut parts = Vec::new();
                /* The turn's reasoning goes back as a thought part, before the
                   answer text — the order the API returns it in. */
                if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                    parts.push(json!({ "text": t, "thought": true }));
                }
                parts.push(json!({ "text": m.content }));
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

    /*
     * The reasoning, kept so the NEXT request can send it back.
     *
     * Gemini streams thought parts with `"thought": true` and expects them
     * returned the same way. Only the live stream read them, so the finished
     * step carried none and the next request showed the model its conclusions
     * with the thinking stripped out.
     */
    reasoning: String,
}

impl ToolAcc {
    /// The reasoning text, for the caller to carry into the next request.
    ///
    /// No signature half: Gemini has no signed thinking block, the flag on the
    /// part is the whole protocol.
    pub fn reasoning_parts(&self) -> (Option<String>, Option<String>) {
        (
            (!self.reasoning.is_empty()).then(|| self.reasoning.clone()),
            None,
        )
    }

    /*
     * Accumulate thought parts for the round trip.
     *
     * Returns nothing, like the OpenAI sibling: `extract_reasoning` already
     * emits the live text, and a frame can carry a thought part with no visible
     * text, so returning it here would double-emit.
     */
    pub fn feed_reasoning(&mut self, v: &Value) {
        if let Some(parts) = v
            .pointer("/candidates/0/content/parts")
            .and_then(|p| p.as_array())
        {
            for p in parts {
                if p.get("thought").and_then(|t| t.as_bool()) == Some(true) {
                    if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                        self.reasoning.push_str(t);
                    }
                }
            }
        }
    }
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

/// Token usage reported by Gemini, if this frame carries it.
///
/// `usageMetadata` appears on the final chunk of a stream. `promptTokenCount`
/// and `candidatesTokenCount` are the pair; `thoughtsTokenCount` is billed as
/// output, so it is added there rather than dropped.
pub fn extract_usage(v: &Value) -> Option<(u64, u64)> {
    let u = v.get("usageMetadata")?;
    let n = |k: &str| u.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
    let input = n("promptTokenCount");
    let output = n("candidatesTokenCount") + n("thoughtsTokenCount");
    if input == 0 && output == 0 {
        return None;
    }
    Some((input, output))
}
