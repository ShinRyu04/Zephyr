use crate::adapters::{split_data_url, trim_base};
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use serde_json::{json, Value};

/// Build the `thinking` field for a model, in the form that model accepts.
///
/// The API rejects the WRONG FORM with a 400, and which form is right depends
/// entirely on the model — so sending one shape for every model means every
/// request to a model expecting another shape fails outright. That is the whole
/// reason this function exists rather than a single `json!` at the call site.
///
/// From the documented compatibility table:
///
///   * `budget_tokens` is accepted by Opus 4.5–4.6, Sonnet 4.5–4.6 and Haiku
///     4.5, is DEPRECATED on 4.6, and returns a 400 on everything newer —
///     including the Opus 4.8, Sonnet 5 and Fable 5 lines this app ships.
///   * The newer models take `{"type": "adaptive"}` and need nothing at all:
///     thinking is already on, with `display` defaulting to `"omitted"`, so the
///     text stays hidden until `"summarized"` is asked for.
///   * `"disabled"` is a 400 on most of the newer models rather than a way to
///     turn thinking off.
///   * The oldest models (4.5 and below) predate `adaptive` and reject it.
///
/// Returns `None` when no form is safe, leaving thinking unconfigured — which
/// the API treats as its own default and is never an error.
pub fn thinking_field(model: &str) -> Option<Value> {
    let m = model.to_ascii_lowercase();

    /* The 4.5 generation and older: the only family that both wants
       budget_tokens and rejects `adaptive`. */
    let lama = m.contains("opus-4-5")
        || m.contains("sonnet-4-5")
        || m.contains("haiku-4-5")
        || m.contains("opus-4-1")
        || m.contains("3-7-sonnet")
        || m.contains("3-5-sonnet");

    if lama {
        return None; // caller fills in budget_tokens
    }

    /*
     * Everything else in this app's catalogue is a model where budget_tokens is
     * a 400. `adaptive` is correct for all of them, and `summarized` is what
     * makes the reasoning VISIBLE — without it the thinking happens and is
     * billed, but comes back with the text omitted, which reads as the feature
     * being broken.
     */
    Some(json!({ "type": "adaptive", "display": "summarized" }))
}

/// True when this model wants the legacy `{type: "enabled", budget_tokens}` form.
pub fn butuh_budget(model: &str) -> bool {
    thinking_field(model).is_none()
}

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
        let imgs = m.all_images();
        /*
         * A previous assistant turn's reasoning, sent back as a thinking block.
         *
         * It goes FIRST, which is the order Anthropic returns it in and the
         * order it must be returned in: the reasoning precedes the text it
         * produced, and the signature is validated against the block it arrived
         * with. Only assistant turns carry it — a user turn with a `reasoning`
         * field is not a thing, and sending one as a thinking block is a 400.
         */
        let alasan = m
            .reasoning
            .as_deref()
            .filter(|t| !t.is_empty() && m.role == "assistant")
            .map(|t| match m.reasoning_signature.as_deref().filter(|s| !s.is_empty()) {
                Some(sig) => json!({ "type": "thinking", "thinking": t, "signature": sig }),
                /* No signature: the provider will not verify it, so it goes as
                   plain text. Keeps the content in context without pretending
                   to a signature we do not have. */
                None => json!({ "type": "text", "text": t }),
            });
        let blocks_of = |isi: Value| -> Value {
            match alasan.clone() {
                /* A content ARRAY takes blocks, not bare strings — so the plain
                   text half is wrapped as a text block when the array form is
                   forced by a thinking block. */
                Some(a) => match isi {
                    Value::Array(mut b) => {
                        b.insert(0, a);
                        json!(b)
                    }
                    lain => json!([a, { "type": "text", "text": lain }]),
                },
                None => isi,
            }
        };
        if !imgs.is_empty() {
            let mut blocks = vec![json!({ "type": "text", "text": m.content })];
            for img in imgs {
                if let Some((mime, data)) = split_data_url(img) {
                    blocks.push(json!({
                        "type": "image",
                        "source": { "type": "base64", "media_type": mime, "data": data }
                    }));
                }
            }
            turns.push(json!({ "role": m.role, "content": blocks_of(json!(blocks)) }));
        } else {
            turns.push(json!({ "role": m.role, "content": blocks_of(json!(m.content)) }));
        }
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

    if let Some(e) = effort {
        /*
         * The form depends on the MODEL, and the wrong one is a 400.
         *
         * Sending `budget_tokens` unconditionally is what this used to do, and
         * the API rejects it outright on every model newer than the 4.5/4.6
         * generation — including the Opus 4.8 and Sonnet 5 lines this app ships.
         * A model that takes `adaptive` gets that instead, with `summarized` so
         * the reasoning is actually visible rather than billed and omitted.
         */
        match thinking_field(model) {
            Some(v) => {
                body["thinking"] = v;
                /* Depth now lives here. Omitting it produces the API default
                   ("high"), so it is only sent when the user chose otherwise. */
                if let Some(l) = e.anthropic_effort() {
                    body["output_config"] = json!({ "effort": l });
                }
            }
            None => {
                let budget = e.anthropic_budget().min(max_tokens.saturating_sub(1));
                if budget >= 1024 {
                    body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
                }
            }
        }
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
            let mut blocks = Vec::new();
            /*
             * The thinking block goes FIRST.
             *
             * That is the order Anthropic returns it in and the order it must
             * be sent back: the reasoning precedes the text it produced, and the
             * signature is validated against the block it arrived with. Putting
             * it after the text — or omitting it — makes the provider reject the
             * turn or silently drop the reasoning from context.
             */
            if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                blocks.push(match m.reasoning_signature.as_deref() {
                    Some(sig) if !sig.is_empty() => json!({
                        "type": "thinking",
                        "thinking": t,
                        "signature": sig,
                    }),
                    /* A reasoning block with no signature is one the provider
                       will not verify; sending it as a plain text block keeps
                       the content in context without pretending to a signature
                       we do not have. */
                    _ => json!({ "type": "text", "text": t }),
                });
            }
            blocks.push(json!({ "type": "text", "text": m.content }));
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
            let imgs = m.images.as_deref().unwrap_or(&[]);
            if imgs.is_empty() {
                turns.push(json!({ "role": m.role, "content": m.content }));
            } else {
                let mut blocks = vec![json!({ "type": "text", "text": m.content })];
                for img in imgs {
                    if let Some((mime, data)) = crate::adapters::split_data_url(img) {
                        blocks.push(json!({
                            "type": "image",
                            "source": { "type": "base64", "media_type": mime, "data": data }
                        }));
                    }
                }
                turns.push(json!({ "role": m.role, "content": blocks }));
            }
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

    if let Some(e) = effort {
        /*
         * The form depends on the MODEL, and the wrong one is a 400.
         *
         * Sending `budget_tokens` unconditionally is what this used to do, and
         * the API rejects it outright on every model newer than the 4.5/4.6
         * generation — including the Opus 4.8 and Sonnet 5 lines this app ships.
         * A model that takes `adaptive` gets that instead, with `summarized` so
         * the reasoning is actually visible rather than billed and omitted.
         */
        match thinking_field(model) {
            Some(v) => {
                body["thinking"] = v;
                /* Depth now lives here. Omitting it produces the API default
                   ("high"), so it is only sent when the user chose otherwise. */
                if let Some(l) = e.anthropic_effort() {
                    body["output_config"] = json!({ "effort": l });
                }
            }
            None => {
                let budget = e.anthropic_budget().min(max_tokens.saturating_sub(1));
                if budget >= 1024 {
                    body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
                }
            }
        }
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

pub fn parse_tool_response(v: &Value) -> AiToolResult {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(blocks) = v.get("content").and_then(|c| c.as_array()) {
        for b in blocks {
            match b.get("type").and_then(|t| t.as_str()) {
                Some("text") => {
                    content.push_str(b.get("text").and_then(|t| t.as_str()).unwrap_or(""))
                }
                Some("tool_use") => tool_calls.push(ToolCall {
                    id: b
                        .get("id")
                        .and_then(|x| x.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    name: b
                        .get("name")
                        .and_then(|x| x.as_str())
                        .unwrap_or_default()
                        .to_string(),
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

pub fn extract_reasoning(v: &Value) -> Option<String> {
    if v.get("type").and_then(|t| t.as_str()) != Some("content_block_delta") {
        return None;
    }
    v.pointer("/delta/thinking")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn extract_delta(v: &Value) -> Option<String> {
    match v.get("type").and_then(|t| t.as_str()) {
        Some("content_block_delta") => v
            .pointer("/delta/text")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),

        Some("content_block_start") => v
            .pointer("/content_block/text")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),

        _ => None,
    }
}

#[derive(Default)]
pub struct ToolAcc {
    text: String,

    blocks: Vec<(u64, String, String, String)>,

    /*
     * The reasoning and its signature, kept so the turn can be sent back.
     *
     * Anthropic returns thinking as a `thinking_delta` stream and the signature
     * as a SEPARATE `signature_delta` that arrives once the block closes. Only
     * the text was read, so the signature was discarded — and a thinking block
     * sent back without its signature is rejected, which is why the reasoning
     * had to be dropped from the conversation instead of echoed.
     *
     * The signature is opaque and must be returned byte-for-byte; it is stored
     * here only to be handed back untouched.
     */
    reasoning: String,
    signature: String,
}

impl ToolAcc {
    /// The reasoning text and its signature, for the caller to carry forward.
    pub fn reasoning_parts(&self) -> (Option<String>, Option<String>) {
        let r = (!self.reasoning.is_empty()).then(|| self.reasoning.clone());
        let s = (!self.signature.is_empty()).then(|| self.signature.clone());
        (r, s)
    }

    /// Accumulate the two reasoning deltas. Returns nothing — this is state,
    /// not a stream the caller forwards (the live text is emitted separately).
    pub fn feed_reasoning(&mut self, v: &Value) {
        if let Some(t) = v.pointer("/delta/thinking").and_then(|x| x.as_str()) {
            self.reasoning.push_str(t);
        }
        if let Some(s) = v.pointer("/delta/signature").and_then(|x| x.as_str()) {
            self.signature.push_str(s);
        }
    }
}

impl ToolAcc {
    pub fn feed(&mut self, v: &Value) -> Option<String> {
        let tipe = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match tipe {
            "content_block_start" => {
                if v.pointer("/content_block/type").and_then(|t| t.as_str()) == Some("tool_use") {
                    let idx = v.get("index").and_then(|x| x.as_u64()).unwrap_or(0);
                    let id = v
                        .pointer("/content_block/id")
                        .and_then(|x| x.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let name = v
                        .pointer("/content_block/name")
                        .and_then(|x| x.as_str())
                        .unwrap_or_default()
                        .to_string();

                    let awal = v
                        .pointer("/content_block/input")
                        .map(|i| i.to_string())
                        .filter(|s| s != "{}" && s != "null")
                        .unwrap_or_default();
                    self.blocks.push((idx, id, name, awal));
                }
                None
            }
            "content_block_delta" => {
                if let Some(t) = v.pointer("/delta/text").and_then(|x| x.as_str()) {
                    if !t.is_empty() {
                        self.text.push_str(t);
                        return Some(t.to_string());
                    }
                }
                if let Some(j) = v.pointer("/delta/partial_json").and_then(|x| x.as_str()) {
                    let idx = v.get("index").and_then(|x| x.as_u64()).unwrap_or(0);
                    if let Some(b) = self.blocks.iter_mut().find(|b| b.0 == idx) {
                        b.3.push_str(j);
                    }
                }
                None
            }
            _ => None,
        }
    }

    pub fn finish(self) -> (String, Vec<ToolCall>) {
        let calls = self
            .blocks
            .into_iter()
            .filter(|(_, _, name, _)| !name.is_empty())
            .enumerate()
            .map(|(i, (_, id, name, args))| ToolCall {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /*
     * The signature round trip.
     *
     * Anthropic streams the thinking text and the signature as TWO separate
     * deltas. Only the text was read, so the signature was discarded — and a
     * thinking block returned without its signature is rejected, which is why
     * the reasoning could not be carried into the next request at all.
     */
    #[test]
    fn reasoning_and_signature_are_both_kept() {
        let mut acc = ToolAcc::default();
        acc.feed_reasoning(&json!({
            "type": "content_block_delta",
            "delta": { "type": "thinking_delta", "thinking": "let me think" }
        }));
        acc.feed_reasoning(&json!({
            "type": "content_block_delta",
            "delta": { "type": "signature_delta", "signature": "sig-abc" }
        }));
        let (r, s) = acc.reasoning_parts();
        assert_eq!(r.as_deref(), Some("let me think"));
        assert_eq!(s.as_deref(), Some("sig-abc"));
    }

    #[test]
    fn reasoning_deltas_accumulate_in_order() {
        let mut acc = ToolAcc::default();
        for part in ["menimbang ", "dua ", "pilihan"] {
            acc.feed_reasoning(&json!({ "delta": { "thinking": part } }));
        }
        let (r, _) = acc.reasoning_parts();
        assert_eq!(r.as_deref(), Some("menimbang dua pilihan"));
    }

    /*
     * The 400-error class this fixes.
     *
     * The API rejects the WRONG thinking form outright, and which form is right
     * depends on the model. The code sent `budget_tokens` to every model, so
     * every request to anything newer than the 4.5/4.6 generation — including
     * the Opus 4.8 and Sonnet 5 lines this app ships — came back 400.
     */
    /*
     * The 4.6 generation: thinking is OFF until adaptive is set.
     *
     * Straight from the compatibility table — on 4.6 the extended-thinking form
     * is deprecated (still accepted) while adaptive is the current one, and with
     * NO thinking field at all the model simply never thinks. So sending nothing
     * is not a safe fallback here; it silently produces a model that cannot
     * reason.
     */
    #[test]
    fn generasi_4_6_dapat_adaptive() {
        let nama = [
            "claude-sonnet-4.6",
            "claude-sonnet-4-6",
            "claude-opus-4-6",
            "claude-opus-4.6",
        ];
        for m in nama {
            let f = thinking_field(m).unwrap_or_else(|| panic!("{m} got no thinking field"));
            assert_eq!(f["type"], "adaptive", "{m} must use adaptive (thinking is off without it)");
            assert_eq!(f["display"], "summarized", "{m} must ask for the visible summary");
        }
    }

    #[test]
    fn effort_dikirim_untuk_model_adaptive() {
        // Depth moved into output_config.effort on the adaptive models, so a
        // user who picks "Ultra" has nothing to show for it unless the level
        // travels. "High" is the API default and is deliberately omitted —
        // sending it would change nothing but invalidate the prompt cache.
        let m = crate::ai::AgentMsg {
            role: "user".into(),
            content: "hi".into(),
            tool_call_id: None,
            tool_calls: None,
            name: None,
            images: None,
            reasoning: None,
            reasoning_signature: None,
        };
        let ultra = prepare_tools(
            "claude-sonnet-4.6",
            &[m.clone()],
            &[],
            None,
            "k",
            64000,
            Some(crate::ai::ReasoningEffort::Ultra),
        );
        assert_eq!(ultra.body["thinking"]["type"], "adaptive");
        assert_eq!(ultra.body["output_config"]["effort"], "max");

        let high = prepare_tools(
            "claude-sonnet-4.6",
            &[m],
            &[],
            None,
            "k",
            64000,
            Some(crate::ai::ReasoningEffort::High),
        );
        assert!(
            high.body.get("output_config").is_none(),
            "high is the default and must not be sent"
        );
    }

    #[test]
    fn model_baru_dapat_bentuk_adaptive() {
        for m in [
            "claude-opus-4-8", "claude-opus-5", "claude-sonnet-5",
            "claude-fable-5-1", "claude-opus-5-5", "claude-haiku-5-5",
        ] {
            let f = thinking_field(m).unwrap_or_else(|| panic!("{m} got no thinking field"));
            assert_eq!(f["type"], "adaptive", "{m} should use adaptive");
            /* Without `summarized` the thinking is billed but the text is
               omitted, which reads as the feature being broken. */
            assert_eq!(f["display"], "summarized", "{m} must ask for the summary");
            assert!(f.get("budget_tokens").is_none(), "{m} must NOT send budget_tokens");
        }
    }

    #[test]
    fn model_lama_dapat_bentuk_budget() {
        // The 4.5 generation rejects `adaptive` and wants budget_tokens, so the
        // caller must fall back rather than sending adaptive to everything.
        for m in ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"] {
            assert!(thinking_field(m).is_none(), "{m} should use the budget form");
            assert!(butuh_budget(m), "{m} needs budget_tokens");
        }
    }

    #[test]
    fn prepare_tidak_pernah_mengirim_budget_ke_model_baru() {
        // The end-to-end shape: a real prepare() call for a new model must carry
        // adaptive and no budget_tokens anywhere in the body.
        let m = crate::ai::AgentMsg {
            role: "user".into(),
            content: "hi".into(),
            tool_call_id: None,
            tool_calls: None,
            name: None,
            images: None,
            reasoning: None,
            reasoning_signature: None,
        };
        let body = prepare_tools(
            "claude-opus-4-8",
            &[m],
            &[],
            None,
            "k",
            8000,
            Some(crate::ai::ReasoningEffort::Medium),
        );
        assert_eq!(body.body["thinking"]["type"], "adaptive");
        assert!(body.body["thinking"].get("budget_tokens").is_none());
    }

    #[test]
    fn no_reasoning_yields_none_not_empty_string() {
        // An empty string is not the same as absent: some routers reject the
        // empty form, so "nothing arrived" must be None.
        let acc = ToolAcc::default();
        let (r, s) = acc.reasoning_parts();
        assert!(r.is_none() && s.is_none());
    }

    #[test]
    fn assistant_turn_puts_thinking_before_text() {
        // The order Anthropic expects; a thinking block after the text it
        // produced is rejected.
        let m = crate::ai::AgentMsg {
            role: "assistant".into(),
            content: "jawaban".into(),
            tool_call_id: None,
            tool_calls: Some(vec![crate::ai::ToolCall {
                id: "t1".into(),
                name: "Read".into(),
                args: json!({}),
            }]),
            name: None,
            images: None,
            reasoning: Some("penalaran".into()),
            reasoning_signature: Some("sig".into()),
        };
        let body = prepare_tools("m", &[m], &[], None, "k", 100, None);
        let blocks = body.body["messages"][0]["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], "thinking");
        assert_eq!(blocks[0]["thinking"], "penalaran");
        assert_eq!(blocks[0]["signature"], "sig");
        assert_eq!(blocks[1]["type"], "text");
    }

    #[test]
    fn thinking_without_signature_falls_back_to_text() {
        // Sending a "thinking" block with no signature pretends to a signature
        // we do not have and is rejected; plain text keeps the content in
        // context instead.
        let m = crate::ai::AgentMsg {
            role: "assistant".into(),
            content: "jawaban".into(),
            tool_call_id: None,
            tool_calls: Some(vec![]),
            name: None,
            images: None,
            reasoning: Some("penalaran".into()),
            reasoning_signature: None,
        };
        let body = prepare_tools("m", &[m], &[], None, "k", 100, None);
        let blocks = body.body["messages"][0]["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[0]["text"], "penalaran");
    }
}

/// Token usage reported by Anthropic, if this frame carries it.
///
/// Read from two places, because Anthropic reports it in both: the per-message
/// `usage` on a `message_start`/`message_delta`, and the final tally. The
/// counts are CUMULATIVE for the turn, so the LAST value seen is the answer —
/// adding them would multiply the cost by the number of frames.
///
/// `cache_read_input_tokens` is folded into `input` rather than reported
/// separately: it is a cheaper rate, not a different quantity, and a caller
/// that wants the split cannot get it from a two-number struct anyway.
pub fn extract_usage(v: &Value) -> Option<(u64, u64)> {
    let u = v
        .pointer("/message/usage")
        .or_else(|| v.pointer("/usage"))
        .or_else(|| v.pointer("/message_delta/usage"))?;
    let n = |k: &str| u.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
    let input = n("input_tokens") + n("cache_read_input_tokens") + n("cache_creation_input_tokens");
    let output = n("output_tokens");
    /* A frame with neither count is not a usage report; saying "0 in, 0 out"
       would read as a free turn. */
    if input == 0 && output == 0 {
        return None;
    }
    Some((input, output))
}
