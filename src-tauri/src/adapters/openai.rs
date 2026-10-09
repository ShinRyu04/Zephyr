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
            /*
             * Echo the reasoning a previous assistant turn produced.
             *
             * Carried as a sibling field rather than a content block, which is
             * how the OpenAI-compatible protocol shapes it. Attached only when
             * non-empty: `reasoning_content: ""` is not the same as omitting it,
             * and some routers reject the empty form.
             */
            let alasan = m
                .reasoning
                .as_deref()
                .filter(|t| !t.is_empty() && m.role == "assistant");
            let imgs = m.all_images();
            if !imgs.is_empty() {
                let mut content = vec![json!({ "type": "text", "text": m.content })];
                for img in imgs {
                    content.push(json!({ "type": "image_url", "image_url": { "url": img } }));
                }
                let mut out = json!({ "role": m.role, "content": content });
                if let Some(t) = alasan {
                    out["reasoning_content"] = json!(t);
                }
                out
            } else {
                let mut out = json!({ "role": m.role, "content": m.content });
                if let Some(t) = alasan {
                    out["reasoning_content"] = json!(t);
                }
                out
            }
        }).collect::<Vec<_>>(),
        "stream": true,
        "max_tokens": max_tokens,
    });

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
    v.pointer("/choices/0/delta/content")
        .or_else(|| v.pointer("/choices/0/message/content"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

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
                let mut out = json!({
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
                });
                /*
                 * Echo the reasoning back on the assistant turn.
                 *
                 * The OpenAI-compatible gateways carry it as a sibling field
                 * rather than a content block. It is attached only when present:
                 * a `reasoning_content: ""` is not the same as omitting it, and
                 * some routers reject the empty form.
                 */
                if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                    out["reasoning_content"] = json!(t);
                }
                out
            } else {
                let imgs = m.images.as_deref().unwrap_or(&[]);
                if !imgs.is_empty() {
                    let mut content = vec![json!({ "type": "text", "text": m.content })];
                    for img in imgs {
                        content.push(json!({ "type": "image_url", "image_url": { "url": img } }));
                    }
                    let mut out = json!({ "role": m.role, "content": content });
                    if m.role == "assistant" {
                        if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                            out["reasoning_content"] = json!(t);
                        }
                    }
                    out
                } else {
                    let mut out = json!({ "role": m.role, "content": m.content });
                    if m.role == "assistant" {
                        if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                            out["reasoning_content"] = json!(t);
                        }
                    }
                    out
                }
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

#[derive(Default)]
pub struct ToolAcc {
    text: String,
    calls: Vec<(String, String, String)>,

    /*
     * The reasoning, kept so the NEXT request can echo it back.
     *
     * `extract_reasoning` already read this field for the live stream, but it
     * was read and thrown away — the accumulator never held it, so the finished
     * step came back with `reasoning: null` however much the model had thought.
     * The only trace of it left was on screen, and the next request showed the
     * model its own conclusions with no record of how it reached them. Providers
     * behind the OpenAI-compatible protocol accept `reasoning_content` on the
     * assistant turn, which is what this is for.
     */
    reasoning: String,
}

impl ToolAcc {
    /// The reasoning text, for the caller to carry into the next request.
    ///
    /// There is no signature half here: `reasoning_content` is plain text on
    /// this protocol, and Gateways that want one send it inline.
    pub fn reasoning_parts(&self) -> (Option<String>, Option<String>) {
        (
            (!self.reasoning.is_empty()).then(|| self.reasoning.clone()),
            None,
        )
    }

    /*
     * Accumulate the reasoning delta for the round trip.
     *
     * Returns nothing: the live text is emitted separately by
     * `extract_reasoning`, and a frame can carry this field while carrying no
     * visible text at all, so returning it here would double-emit.
     *
     * The three paths mirror `extract_reasoning` — gateways disagree on the
     * field name, and a provider that reports under one of the others would
     * otherwise stream live reasoning that never reached the history.
     */
    pub fn feed_reasoning(&mut self, v: &Value) {
        for jalur in [
            "/choices/0/delta/reasoning_content",
            "/choices/0/delta/reasoning",
            "/choices/0/delta/reasoning_text",
        ] {
            if let Some(t) = v.pointer(jalur).and_then(|x| x.as_str()) {
                if !t.is_empty() {
                    self.reasoning.push_str(t);
                }
            }
        }
    }
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

/// Token usage reported by an OpenAI-compatible gateway, if present.
///
/// `prompt_tokens`/`completion_tokens` is the documented pair; some gateways
/// use `input_tokens`/`output_tokens` instead, and a few report only one of the
/// two. Absent counts are 0 rather than an error — a gateway that omits usage
/// entirely is reported as `None` by the caller, which is different from a
/// turn that genuinely used nothing.
pub fn extract_usage(v: &Value) -> Option<(u64, u64)> {
    let u = v
        .pointer("/usage")
        .or_else(|| v.pointer("/choices/0/usage"))?;
    let n = |a: &str, b: &str| {
        u.get(a)
            .or_else(|| u.get(b))
            .and_then(|x| x.as_u64())
            .unwrap_or(0)
    };
    let input = n("prompt_tokens", "input_tokens");
    let output = n("completion_tokens", "output_tokens");
    if input == 0 && output == 0 {
        return None;
    }
    Some((input, output))
}
