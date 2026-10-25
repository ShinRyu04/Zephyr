use crate::adapters::trim_base;
use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use serde_json::{json, Value};

/*
 * The fallback endpoint per provider id, used only when the user has not
 * configured a base URL.
 *
 * `xai` is gone: the catalogue no longer offers that provider, so an arm here
 * would be dead code that still implies support. A saved key under that name
 * is never read.
 *
 * `local` points at the port Ollama listens on, which is what "a local model"
 * almost always means. It was 4096 (the opencode server) — a real default, but
 * one that made a user with Ollama running read as "no local server found".
 * `lmstudio` stays as its own id for anyone who names it explicitly.
 */
fn default_base(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "https://api.deepseek.com/v1",
        "local" => "http://127.0.0.1:11434/v1",
        "lmstudio" => "http://127.0.0.1:1234/v1",
        _ => "https://api.openai.com/v1",
    }
}

/*
 * ── Field compatibility ───────────────────────────────────────────────────
 *
 * A single OpenAI-shaped body used to be sent to every model on every gateway,
 * and that is why "so many models are unsupported" on a router: the router
 * fronts dozens of upstreams with different accepted fields, and one mismatch
 * is a 400 that Zephyr never retried.
 *
 * Three known mismatches, all handled here:
 *
 *  1. `max_tokens` vs `max_completion_tokens`. The o-series and GPT-5+ reject
 *     `max_tokens` outright; most older and open-weight models only accept it.
 *  2. An empty `tools: []`. Some gateways reject the array; most ignore it, but
 *     there is no upside to sending it.
 *  3. `reasoning_effort` on a model that is not a reasoning model.
 *
 * These are NAME-BASED heuristics because that is all a `/models` list gives us,
 * and they are deliberately conservative: when unsure, keep the field the
 * mainstream models accept (`max_tokens`) rather than guess.
 */

/** Models that require `max_completion_tokens` and reject `max_tokens`. */
fn butuh_max_completion_tokens(model: &str) -> bool {
    let m = model.to_ascii_lowercase();
    /* o1/o3/o4 and the whole GPT-5+/GPT-6 line. */
    let o_series = m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.contains("/o1")
        || m.contains("/o3")
        || m.contains("/o4");
    let gpt_baru = m.starts_with("gpt-5") || m.starts_with("gpt-6") || m.contains("/gpt-5") || m.contains("/gpt-6");
    /* Some routers expose these behind a vendor prefix (`openai/o3-mini`). */
    o_series || gpt_baru
}

/** Models known to accept `reasoning_effort`. */
fn dukung_reasoning_effort(model: &str) -> bool {
    let m = model.to_ascii_lowercase();
    m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.starts_with("gpt-5")
        || m.starts_with("gpt-6")
        || m.contains("/o1")
        || m.contains("/o3")
        || m.contains("/o4")
        || m.contains("/gpt-5")
        || m.contains("/gpt-6")
        /* The open reasoning families that speak the same field. */
        || m.contains("grok-3-mini")
        || m.contains("grok-4")
        || m.contains("qwq")
}

/**
 * Put the output budget under the field this model actually accepts.
 *
 * Kept as a helper because BOTH request shapes (streaming chat and the
 * non-streaming tool call) must agree — they are separate bodies in this file
 * and a fix applied to one only is how the agent path and the chat path drift.
 */
fn pasang_batas_keluaran(body: &mut Value, model: &str, max_tokens: u32) {
    if butuh_max_completion_tokens(model) {
        body["max_completion_tokens"] = json!(max_tokens);
    } else {
        body["max_tokens"] = json!(max_tokens);
    }
}

pub fn prepare(
    provider: &str,
    model: &str,
    messages: &[ChatMsg],
    base_url: Option<&str>,
    full_url: Option<bool>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> Prepared {
    let full = full_url.unwrap_or(false);
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
    });
    pasang_batas_keluaran(&mut body, model, max_tokens);

    /* Only when the model actually speaks it — a non-reasoning model 400s. */
    if let Some(e) = effort.filter(|_| dukung_reasoning_effort(model)) {
        body["reasoning_effort"] = json!(e.openai());
    }

    Prepared {
        url: if full {
            base.clone()
        } else {
            format!("{base}/chat/completions")
        },
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
    full_url: Option<bool>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> Prepared {
    let full = full_url.unwrap_or(false);
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
                 * Echo reasoning on tool-call turns. DeepSeek gateways can
                 * require this field even when the model returned no reasoning.
                 */
                if let Some(t) = m.reasoning.as_deref().filter(|t| !t.is_empty()) {
                    out["reasoning_content"] = json!(t);
                } else if model.to_ascii_lowercase().contains("deepseek") {
                    out["reasoning_content"] = json!(" ");
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
        url: if full {
            base.clone()
        } else {
            format!("{base}/chat/completions")
        },
        headers: vec![
            ("Authorization".into(), format!("Bearer {key}")),
            ("Content-Type".into(), "application/json".into()),
        ],
        body: json!({
            "model": model,
            "messages": msgs,
            "stream": false,
        }),
        sse: false,
    };
    /*
     * `tools` only when there ARE tools.
     *
     * An empty array is not the same as omitting the field: some gateways reject
     * it outright, and a model with no tool support 400s on any `tools` key at
     * all. The agent path always has tools, but this builder is also used for
     * plain turns, where it used to send `"tools": []` to every model.
     */
    if !tools.is_empty() {
        prep.body["tools"] = json!(tools
            .iter()
            .map(|t| json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                }
            }))
            .collect::<Vec<_>>());
    }
    pasang_batas_keluaran(&mut prep.body, model, max_tokens);
    if let Some(e) = effort.filter(|_| dukung_reasoning_effort(model)) {
        prep.body["reasoning_effort"] = json!(e.openai());
    }
    prep
}

pub fn parse_tool_response(v: &Value) -> Result<AiToolResult, String> {
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
        for (index, tc) in tcs.iter().enumerate() {
            let name = tc
                .pointer("/function/name")
                .and_then(|x| x.as_str())
                .filter(|name| !name.trim().is_empty())
                .ok_or_else(|| format!("tool call #{index} is missing a function name"))?;
            let raw_args = tc
                .pointer("/function/arguments")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            /* `arguments: ""` berarti "tanpa argumen", bukan JSON rusak — sama
               seperti jalur streaming `finish()` di bawah. */
            /* Perbaikan leksikal lebih dulu: newline mentah di dalam string,
               koma di ujung, pagar markdown. Argumen yang HAMPIR sah tidak boleh
               membunuh langkah - lihat `parse_argumen_tool`. */
            let args: Value = parse_argumen_tool(raw_args, false, name)?;
            if !args.is_object() {
                return Err(format!(
                    "tool call \"{name}\" arguments must be a JSON object"
                ));
            }
            tool_calls.push(ToolCall {
                id: tc
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string(),
                name: name.to_string(),
                args,
            });
        }
    }
    let done = tool_calls.is_empty();
    Ok(AiToolResult {
        content,
        tool_calls,
        done,
    })
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

    /*
     * Whether the provider stopped because it hit the output-token ceiling
     * (`finish_reason: "length"`), not because the turn was complete.
     *
     * This is the single most useful signal for the failure every long run
     * eventually hits: a tool call whose arguments carry a file's contents gets
     * cut off mid-JSON, and `finish()` then fails to parse it with the opaque
     * "malformed JSON arguments". That message sends everyone — on any model,
     * any gateway — hunting for a request-shape bug that is not there; the real
     * cause is the output budget. Captured here so `finish()` can say so.
     */
    truncated: bool,
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
        /*
         * A `finish_reason` of "length" means the model was still mid-output
         * when the token budget ran out. Recorded so `finish()` can turn an
         * unparseable tool-argument tail into an actionable message instead of
         * the misleading "malformed JSON arguments".
         */
        if v.pointer("/choices/0/finish_reason").and_then(|x| x.as_str()) == Some("length") {
            self.truncated = true;
        }
        teks_baru
    }

    pub fn finish(self) -> Result<(String, Vec<ToolCall>), String> {
        let truncated = self.truncated;
        let calls = self
            .calls
            .into_iter()
            .filter(|(_, name, _)| !name.is_empty())
            .enumerate()
            .map(|(i, (id, name, args))| {
                /*
                 * Argumen kosong = objek kosong.
                 *
                 * Model sering mengirim `arguments: ""` untuk tool yang menurutnya
                 * tidak butuh argumen, dan `serde_json::from_str("")` gagal →
                 * dulu itu jadi "malformed JSON arguments" yang MEMBUNUH langkah.
                 * Sebuah string kosong bukan JSON rusak, ia hanya "tanpa argumen";
                 * perlakukan sebagai `{}` supaya tool dengan argumen opsional tetap
                 * jalan dan gerbang argumen (mis. `pattern` wajib pada grep)
                 * memberi pesan yang berguna, bukan error parser yang menyesatkan.
                 */
                /*
                 * A tool call whose arguments won't parse has two causes, and
                 * the message must tell them apart or the reader chases the
                 * wrong one. If the stream was cut at the token ceiling, the
                 * JSON is simply incomplete — the fix is a bigger output
                 * budget, not a request-shape change. Only call it "malformed"
                 * when the model actually finished and still sent broken JSON.
                 * Lexical damage (raw newlines, trailing commas, fences) is
                 * repaired first, so "malformed" now means what it says.
                 */
                let parsed: Value = parse_argumen_tool(&args, truncated, &name)?;
                if !parsed.is_object() {
                    return Err(format!(
                        "tool call \"{name}\" arguments must be a JSON object"
                    ));
                }
                Ok(ToolCall {
                    id: if id.is_empty() {
                        format!("{name}-{i}")
                    } else {
                        id
                    },
                    name,
                    args: parsed,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        Ok((self.text, calls))
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

/* ------------------------------------------------------------------ *
 * Argumen tool yang HAMPIR sah
 * ------------------------------------------------------------------ */

/*
 * A tool call whose arguments fail to parse used to kill the step outright:
 * "tool call X returned malformed JSON arguments". The message was accurate and
 * useless - the reader cannot fix the model's JSON, and the run ended there.
 *
 * Four shapes account for nearly every real occurrence, and all four are
 * LEXICAL damage that can be undone without guessing at what the arguments
 * meant:
 *
 *   1. a literal newline, carriage return or tab inside a string value - the
 *      model emits the file content it is about to write as a real multi-line
 *      string instead of `\n`;
 *   2. a trailing comma before a closing brace or bracket;
 *   3. markdown fences, or a sentence wrapped around the object;
 *   4. a backslash that is not a legal JSON escape (a Windows path, a regex:
 *      `D:\Zephyr`, `\s+`, `\d`) - see `loloskan_escape_liar`.
 *
 * Structural repair is deliberately NOT attempted: closing an unterminated
 * object would mean inventing which members were dropped, and a tool that runs
 * on half its arguments is worse than one that reports it could not read them.
 */
fn buang_pagar_json(s: &str) -> &str {
    let t = s.trim();
    let t = t
        .strip_prefix("```json")
        .or_else(|| t.strip_prefix("```JSON"))
        .or_else(|| t.strip_prefix("```"))
        .unwrap_or(t);
    let t = t.trim_start();
    match t.rfind("```") {
        Some(i) => t[..i].trim(),
        None => t.trim(),
    }
}

/** Escape the control characters that sit INSIDE a JSON string value. */
fn loloskan_kontrol(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    let mut dalam_string = false;
    let mut escape = false;
    for c in s.chars() {
        if escape {
            out.push(c);
            escape = false;
            continue;
        }
        match c {
            '\\' if dalam_string => {
                out.push(c);
                escape = true;
            }
            '"' => {
                dalam_string = !dalam_string;
                out.push(c);
            }
            '\n' if dalam_string => out.push_str("\\n"),
            '\r' if dalam_string => out.push_str("\\r"),
            '\t' if dalam_string => out.push_str("\\t"),
            c if dalam_string && (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

/** Drop a comma that sits immediately before a closing brace or bracket. */
/**
 * Escape a backslash that does not begin a legal JSON escape.
 *
 * The fourth shape, and the one that survived the other three: file content or
 * a regex written with a real backslash - `D:\Zephyr\src`, `\s+`, `\d` - is
 * INVALID JSON inside a string (`\Z`, `\s`, `\d` are not escapes), so
 * `serde_json` rejects the whole argument object even though the model's intent
 * is perfectly clear. `loloskan_kontrol` did not help here: it preserves a
 * backslash and the character after it verbatim, which is exactly what keeps
 * the invalid escape invalid.
 *
 * This step only DUPLICATES a backslash that has no legal role. It never
 * invents, drops or reorders content, so the parsed value is what the model
 * wrote, character for character - `"D:\Zephyr\src"` becomes the string
 * `D:\Zephyr\src` instead of a dead step.
 *
 * A trailing lone backslash is doubled too: it cannot be a legal escape (there
 * is nothing after it), and leaving it makes the string unterminated.
 */
fn loloskan_escape_liar(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    let mut dalam_string = false;
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if !dalam_string {
            if ch == '"' {
                dalam_string = true;
            }
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == '"' {
            dalam_string = false;
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == '\\' {
            match c.get(i + 1) {
                Some(&n) if matches!(n, '"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' | 'u') => {
                    out.push('\\');
                    out.push(n);
                    i += 2;
                }
                Some(&n) => {
                    out.push('\\');
                    out.push('\\');
                    out.push(n);
                    i += 2;
                }
                None => {
                    out.push('\\');
                    out.push('\\');
                    i += 1;
                }
            }
            continue;
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn buang_koma_ujung(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut dalam_string = false;
    let mut escape = false;
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if escape {
            out.push(ch);
            escape = false;
            i += 1;
            continue;
        }
        if dalam_string {
            if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                dalam_string = false;
            }
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == '"' {
            dalam_string = true;
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == ',' {
            let mut j = i + 1;
            while j < c.len() && c[j].is_whitespace() {
                j += 1;
            }
            if j < c.len() && (c[j] == '}' || c[j] == ']') {
                i += 1;
                continue;
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

/** The outermost `{...}` inside the text, when there is one. */
fn ambil_objek_terluar(s: &str) -> Option<&str> {
    let mulai = s.find('{')?;
    let akhir = s.rfind('}')?;
    if akhir > mulai {
        Some(&s[mulai..=akhir])
    } else {
        None
    }
}

/**
 * Bentuk argumen yang rusak karena DUA objek JSON ditumpuk berurutan.
 *
 * Kasus nyata (provider fusion, 2026-10-15): model menulis lebih dari satu
 * panggilan di dalam SATU field `arguments`, jadi isinya menjadi dua objek
 * yang berdampingan - objek pertama lengkap, lalu objek kedua menempel
 * langsung di belakangnya tanpa pemisah.
 *
 * `serde_json::from_str` menolaknya (`trailing characters`), lalu run mati
 * dengan "returned malformed JSON arguments" - berkali-kali dalam satu run
 * (11 dari 56 langkah pada run itu), yang di UI terbaca sebagai deretan merah.
 *
 * Yang diambil adalah objek PERTAMA yang lengkap: itu panggilan yang paling
 * mungkin dimaksud, dan ia valid sebagaimana ditulis. Sisa teks setelahnya
 * DIBUANG, bukan digabung - menggabungkan dua objek bisa menghasilkan argumen
 * yang tidak pernah ditulis model (kunci bertabrakan, nilai saling menimpa),
 * dan tool yang jalan dengan argumen karangan lebih buruk daripada satu
 * panggilan yang jelas. Sisa itu tidak hilang percuma: pemanggil tetap
 * melaporkan cuplikan mentahnya kalau parse pertama ini pun gagal.
 *
 * Kurung kurawik dihitung dengan kedalaman, MENGHORMATI string dan escape,
 * supaya nilai yang mengandung kurung tutup tidak memotong objek di tengah.
 */
fn ambil_objek_pertama_utuh(s: &str) -> Option<&str> {
    let mulai = s.find('{')?;
    let mut dalam_string = false;
    let mut lolos = false;
    let mut dalam = 0i32;
    for (offset, ch) in s[mulai..].char_indices() {
        if lolos {
            lolos = false;
            continue;
        }
        match ch {
            '\\' if dalam_string => lolos = true,
            '"' => dalam_string = !dalam_string,
            '{' if !dalam_string => dalam += 1,
            '}' if !dalam_string => {
                dalam -= 1;
                if dalam == 0 {
                    let akhir = mulai + offset + ch.len_utf8();
                    let calon = &s[mulai..akhir];
                    return serde_json::from_str::<Value>(calon).ok().map(|_| calon);
                }
            }
            _ => {}
        }
    }
    None
}

/**
 * Parse a tool call's arguments, undoing the lexical damage above first.
 *
 * The order is cheapest-first: as-is, control characters escaped, trailing
 * commas removed, then both, then the outermost object of a wrapped payload.
 * A parse that succeeds but is not an object is returned as-is on purpose - the
 * caller already distinguishes "must be a JSON object" from "malformed", and
 * collapsing the two would send the reader after the wrong cause.
 */
/// Cuplik sebagian argumen mentah untuk laporan galat.
///
/// Tanpa ini pembaca pesan galat hanya tahu NAMA tool, bukan bagian mana yang
/// rusak - dan `raw_args` memang cuma dipakai untuk parsing, tak pernah
/// dilaporkan. Panjang dikunci supaya pesan galat tidak ikut membengkak lalu
/// merusak anggaran payload; karakter kontrol diganti agar pesannya tetap satu
/// blok teks rapi di log maupun di UI.
fn cuplik_argumen(raw: &str) -> String {
    const MAKS: usize = 160;
    let bersih: String = raw
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let jumlah = bersih.chars().count();
    let potong: String = bersih.chars().take(MAKS).collect();
    if jumlah > MAKS {
        format!("{}… (+{} char lagi)", potong, jumlah - MAKS)
    } else {
        potong
    }
}

fn parse_argumen_tool(raw: &str, truncated: bool, name: &str) -> Result<Value, String> {
    let bersih = buang_pagar_json(raw);
    if bersih.is_empty() {
        return Ok(json!({}));
    }
    let liar = loloskan_escape_liar(bersih);
    let lolos = loloskan_kontrol(&liar);
    let kandidat = [
        bersih.to_string(),
        liar.clone(),
        lolos.clone(),
        buang_koma_ujung(bersih),
        buang_koma_ujung(&lolos),
    ];
    for k in kandidat.iter() {
        if let Ok(v) = serde_json::from_str::<Value>(k) {
            return Ok(v);
        }
    }
    if let Some(dalam) = ambil_objek_terluar(bersih) {
        let dalam = buang_koma_ujung(&loloskan_kontrol(&loloskan_escape_liar(dalam)));
        if let Ok(v) = serde_json::from_str::<Value>(&dalam) {
            return Ok(v);
        }
    }
    /* Kandidat penyelamat TERAKHIR: objek argumen yang salah BUNGKUS. Model
     * menulis pasangan `kunci: "nilai"` di dalam kurung SIBUK `[...]` padahal
     * yang benar adalah kurung KURAWIK `{...}` - isinya sudah berupa daftar
     * kunci/nilai, hanya kurung terluarnya yang keliru. Ditukar HANYA dua
     * kurung itu; isi di antaranya (termasuk array/objek bersarang) tidak
     * disentuh, dan tangga perbaikan di atas tidak diubah - ini kandidat
     * tambahan yang dicoba kalau semua langkah lama sudah menyerah.
     *
     * Syarat `:` di dalam menjaga `[]` tetap diperlakukan seperti dulu: kurung
     * kosong bukan objek yang salah bungkus, dan mengubahnya jadi `{}` akan
     * menelan galat "must be a JSON object" yang memang harus muncul. */
    let sibuk = bersih.trim();
    if sibuk.starts_with('[') && sibuk.ends_with(']') {
        let isi = &sibuk[1..sibuk.len() - 1];
        if isi.contains(':') {
            let tekar = format!("{{{}}}", isi);
            if let Ok(v) = serde_json::from_str::<Value>(&tekar) {
                return Ok(v);
            }
        }
    }
    /* Kandidat penyelamat lain: DUA objek (atau lebih) ditumpuk berurutan di
       dalam satu field `arguments`. Model yang menulis beberapa panggilan pada
       satu giliran kadang menggabungkannya jadi satu string -
       `{...}{...}` - dan `from_str` menolak ekor itu sebagai *trailing
       characters*. Ambil objek PERTAMA yang lengkap, seperti dijelaskan di
       `ambil_objek_pertama_utuh`. */
    if let Some(pertama) = ambil_objek_pertama_utuh(bersih) {
        if let Ok(v) = serde_json::from_str::<Value>(pertama) {
            return Ok(v);
        }
    }
    /*
     * Kedua jalur galat menyertakan CUPLIKAN argumen, bukan hanya nama tool.
     *
     * Tanpa cuplikan, pembaca (dan model pada giliran berikutnya) hanya tahu
     * bahwa sebuah panggilan gagal, bukan bagian mana yang rusak: apakah objeknya
     * terpotong di tengah, kutipnya ganjil, atau ada dua objek bertumpuk. Jalur
     * `malformed` sudah membawanya sejak awal; jalur `truncated` TIDAK - dan
     * justru jalur itulah yang paling sering muncul pada berkas besar, tempat
     * model paling perlu tahu di mana ia berhenti.
     */
    if truncated {
        return Err(format!(
            "tool call \"{name}\" terpotong karena batas token keluaran tercapai — \
             naikkan max tokens model (isi berkas besar dikirim sebagai argumen tool); \
             awal argumen yang terkirim: {}",
            cuplik_argumen(raw)
        ));
    }
    Err(format!(
        "tool call \"{name}\" returned malformed JSON arguments: {}",
        cuplik_argumen(raw)
    ))
}

#[cfg(test)]
mod tests {
    use super::{parse_tool_response, ToolAcc};
    use serde_json::json;

    #[test]
    fn parse_tool_response_rejects_malformed_arguments() {
        let response = json!({
            "choices": [{
                "message": {
                    "content": null,
                    "tool_calls": [{
                        "id": "call-1",
                        "function": {
                            "name": "write_file",
                            "arguments": "{\"path\":\"index.html\","
                        }
                    }]
                }
            }]
        });

        let error = parse_tool_response(&response).unwrap_err();
        assert!(error.contains("write_file"));
        assert!(error.contains("malformed JSON"));
    }

    #[test]
    fn parse_tool_response_requires_object_arguments() {
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": {
                            "name": "write_file",
                            "arguments": "[]"
                        }
                    }]
                }
            }]
        });

        let error = parse_tool_response(&response).unwrap_err();
        assert!(error.contains("JSON object"));
    }

    #[test]
    fn parse_tool_response_treats_empty_arguments_as_empty_object() {
        /* Model sering mengirim `arguments: ""` untuk tool tanpa argumen wajib.
           Itu bukan JSON rusak dan tidak boleh membunuh langkah. */
        for args in ["", "   "] {
            let response = json!({
                "choices": [{
                    "message": {
                        "tool_calls": [{
                            "id": "call-1",
                            "function": { "name": "list_directory", "arguments": args }
                        }]
                    }
                }]
            });
            let hasil = parse_tool_response(&response).expect("empty args should parse");
            assert_eq!(hasil.tool_calls.len(), 1);
            assert_eq!(hasil.tool_calls[0].name, "list_directory");
            assert!(hasil.tool_calls[0].args.is_object());
        }
    }

    #[test]
    fn parse_tool_response_preserves_valid_tool_arguments() {
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": {
                            "name": "write_file",
                            "arguments": "{\"path\":\"index.html\",\"content\":\"<h1>Rantau</h1>\"}"
                        }
                    }]
                }
            }]
        });

        let result = parse_tool_response(&response).unwrap();
        assert_eq!(result.tool_calls[0].args["path"], "index.html");
        assert_eq!(result.tool_calls[0].args["content"], "<h1>Rantau</h1>");
    }

    #[test]
    fn streamed_tool_acc_rejects_truncated_arguments() {
        let mut acc = ToolAcc::default();
        acc.feed(&json!({
            "choices": [{
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "id": "call-1",
                        "function": {
                            "name": "write_file",
                            "arguments": "{\"path\":\"index.html\","
                        }
                    }]
                }
            }]
        }));

        let error = acc.finish().unwrap_err();
        assert!(error.contains("write_file"));
        assert!(error.contains("malformed JSON"));
    }
    #[test]
    fn repairs_literal_newlines_inside_tool_arguments() {
        /* Kasus nyata: model menulis isi berkas sebagai string multi-baris
           SUNGGUHAN di dalam JSON (bukan `\n`). serde menolaknya, dan dulu
           langkahnya mati di situ dengan "malformed JSON arguments". */
        let args = "{\"path\":\"a.txt\",\"content\":\"baris1\nbaris2\"}";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("newline mentah harus diperbaiki");
        assert_eq!(hasil.tool_calls[0].args["path"], "a.txt");
        assert_eq!(hasil.tool_calls[0].args["content"], "baris1\nbaris2");
    }

    /*
     * Kasus nyata (2026-10-26): `multi_edit` gagal dengan "returned malformed
     * JSON arguments" padahal JSON-nya hanya memuat backslash yang BUKAN escape
     * JSON sah. Isi berkas yang menyebut path Windows atau regex (`D:\Zephyr`,
     * `\s+`, `\d`) membuat serde menolak seluruh objek argumen, dan
     * langkahnya mati - terbaca sebagai deretan merah di UI.
     */
    #[test]
    fn repairs_invalid_backslash_escape() {
        let args = r#"{"path":"notes.md","content":"D:\Zephyr\src dan \s+"}"#;
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "multi_edit", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("escape liar harus diperbaiki");
        assert_eq!(hasil.tool_calls[0].args["path"], "notes.md");
        assert_eq!(hasil.tool_calls[0].args["content"], r"D:\Zephyr\src dan \s+");
    }

    /*
     * Kontrol negatif: perbaikan tadi hanya boleh menyentuh backslash yang TIDAK
     * sah. Escape yang sah harus tetap berarti apa adanya - kalau tidak,
     * perbaikan ini diam-diam mengubah isi berkas yang ditulis model.
     */
    #[test]
    fn keeps_legal_escapes_meaning_the_same() {
        let args = r#"{"path":"a.txt","content":"satu\ndua\ttiga \"kutip\" \\akhir"}"#;
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("escape sah harus tetap sah");
        assert_eq!(
            hasil.tool_calls[0].args["content"],
            "satu\ndua\ttiga \"kutip\" \\akhir"
        );
    }

    fn repairs_trailing_comma_in_tool_arguments() {
        let args = "{\"path\":\"a.txt\",\"content\":\"x\",}";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("koma di ujung harus diperbaiki");
        assert_eq!(hasil.tool_calls[0].args["content"], "x");
    }

    #[test]
    fn repairs_fenced_tool_arguments() {
        let args = "```json\n{\"path\":\"a.txt\"}\n```";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "read_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("pagar markdown harus dibuang");
        assert_eq!(hasil.tool_calls[0].args["path"], "a.txt");
    }

    #[test]
    fn repairs_tool_arguments_wrapped_in_prose() {
        let args = "Tentu, ini argumennya: {\"path\":\"a.txt\"}";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "read_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("objek terluar harus diambil");
        assert_eq!(hasil.tool_calls[0].args["path"], "a.txt");
    }

    #[test]
    fn repairs_arguments_wrapped_in_brackets_instead_of_braces() {
        /* Kasus nyata: model menulis objek argumen sebagai daftar berpasangan
           di dalam kurung SIBUK - `["path": "a.txt", ...]` - bukan kurung
           kurawik. Dulu bentuk itu langsung "malformed JSON arguments" dan
           mematikan run. Hanya kurung terluarnya yang ditukar, jadi isi
           bersarang di dalamnya tetap utuh. */
        let args = "[\"path\": \"a.txt\", \"tags\": [\"x\", \"y\"]]";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("kurung sibuk harus jadi kurawik");
        assert_eq!(hasil.tool_calls[0].args["path"], "a.txt");
        assert_eq!(hasil.tool_calls[0].args["tags"], json!(["x", "y"]));
    }

    #[test]
    fn repairs_stacked_objects_in_tool_arguments() {
        /* Kasus nyata (provider fusion): model menulis DUA panggilan di dalam
           satu field `arguments`, jadi isinya `{...}{...}`. `from_str` menolak
           ekornya sebagai trailing characters dan run mati dengan "malformed
           JSON arguments" - berulang kali dalam satu run. Yang benar: pakai
           objek PERTAMA yang lengkap, karena itulah panggilan yang dimaksud. */
        let args = r#"{"pattern": "_arsip/**/*", "root": "D:/Testing"}{"pattern": "**/_kurs*"}"#;
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "glob", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("objek pertama harus diambil");
        assert_eq!(hasil.tool_calls[0].args["pattern"], "_arsip/**/*");
        assert_eq!(hasil.tool_calls[0].args["root"], "D:/Testing");
    }

    #[test]
    fn keeps_braces_inside_strings_whole_when_unstacking() {
        /* Kedalaman kurung dihitung menghormati string: `}` di dalam nilai
           tidak boleh mengakhiri objek lebih awal, atau argumennya terpotong
           di tengah dan berkas yang benar jadi rusak. */
        let args = r#"{"path": "a}b.txt", "content": "x"}{"path": "lain.txt"}"#;
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let hasil = parse_tool_response(&response).expect("kurung dalam string harus utuh");
        assert_eq!(hasil.tool_calls[0].args["path"], "a}b.txt");
        assert_eq!(hasil.tool_calls[0].args["content"], "x");
    }

    #[test]
    fn refuses_to_invent_structure_for_unterminated_arguments() {
        /* Batas perbaikan - sengaja diuji supaya tidak "diperbaiki" di kemudian
           hari. Menutup objek yang terpotong berarti MENEBAK anggota mana yang
           hilang; tool yang jalan dengan separuh argumen lebih buruk daripada
           pesan yang jujur. */
        let args = "{\"path\":\"a.txt\",\"content\":\"abc";
        let response = json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "function": { "name": "write_file", "arguments": args }
                    }]
                }
            }]
        });

        let error = parse_tool_response(&response).unwrap_err();
        assert!(error.contains("write_file"));
        assert!(error.contains("malformed JSON"));
    }
}
