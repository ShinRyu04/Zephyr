// adapters/mod.rs — tiga format request AI yang berbeda (fase 09).
//
// OpenAI-compatible (openai, deepseek, local, custom) : /chat/completions + SSE
// Anthropic                                           : /v1/messages + SSE, header x-api-key
// Gemini                                              : :streamGenerateContent, JSON array
//
// Satu tempat memilih adapter supaya ai.rs tidak penuh if/else provider.

pub mod anthropic;
pub mod gemini;
pub mod openai;

use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use crate::errors::ZResult;
use serde_json::Value;

/// Pecah data URL `data:<mime>;base64,<data>` menjadi (mime, base64).
pub fn split_data_url(v: &str) -> Option<(String, String)> {
    let rest = v.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(',')?;
    let mime = meta.split(';').next().unwrap_or("image/png").to_string();
    if meta.contains(";base64") {
        Some((mime, data.to_string()))
    } else {
        None
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
) -> ZResult<Prepared> {
    match provider {
        "anthropic" => Ok(anthropic::prepare(
            model, messages, base_url, key, max_tokens, effort,
        )),
        "gemini" => Ok(gemini::prepare(
            model, messages, base_url, key, max_tokens, effort,
        )),
        _ => Ok(openai::prepare(
            provider, model, messages, base_url, key, max_tokens, effort,
        )),
    }
}

/// Ambil potongan teks dari satu event stream. None = event non-teks
/// (ping, metadata, stop reason).
pub fn extract_delta(provider: &str, v: &Value) -> Option<String> {
    match provider {
        "anthropic" => anthropic::extract_delta(v),
        "gemini" => gemini::extract_delta(v),
        _ => openai::extract_delta(v),
    }
}

/// T1.1: potongan teks penalaran (blok "Reasoned"). None = bukan penalaran.
pub fn extract_reasoning(provider: &str, v: &Value) -> Option<String> {
    match provider {
        "anthropic" => anthropic::extract_reasoning(v),
        "gemini" => gemini::extract_reasoning(v),
        _ => openai::extract_reasoning(v),
    }
}

/// Buang '/' di ujung supaya penggabungan URL tidak jadi '//'.
pub fn trim_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// Bangun request NON-streaming dengan tools (mode agent).
pub fn prepare_tools(
    provider: &str,
    model: &str,
    messages: &[AgentMsg],
    tools: &[ToolSpec],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> ZResult<Prepared> {
    match provider {
        "anthropic" => Ok(anthropic::prepare_tools(
            model, messages, tools, base_url, key, max_tokens, effort,
        )),
        "gemini" => Ok(gemini::prepare_tools(
            model, messages, tools, base_url, key, max_tokens, effort,
        )),
        _ => Ok(openai::prepare_tools(
            provider, model, messages, tools, base_url, key, max_tokens, effort,
        )),
    }
}

/// Parse jawaban non-streaming menjadi teks + panggilan tool.
pub fn parse_tool_response(provider: &str, v: &Value) -> AiToolResult {
    match provider {
        "anthropic" => anthropic::parse_tool_response(v),
        "gemini" => gemini::parse_tool_response(v),
        _ => openai::parse_tool_response(v),
    }
}

/// Request dengan tools yang STREAMING (`stream: true` + SSE).
/// Dipakai mode agent supaya tiap langkah menampilkan teks yang tumbuh,
/// bukan menggantung sampai jawaban penuh datang (item 21).
pub fn prepare_tools_stream(
    provider: &str,
    model: &str,
    messages: &[AgentMsg],
    tools: &[ToolSpec],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
    effort: Option<ReasoningEffort>,
) -> ZResult<Prepared> {
    let mut p = prepare_tools(
        provider, model, messages, tools, base_url, key, max_tokens, effort,
    )?;
    if provider == "gemini" {
        // Gemini tidak punya flag `stream`; endpoint-nya yang berbeda, dan
        // `alt=sse` WAJIB — tanpa itu balasannya JSON array yang dipecah
        // sembarang antar-paket (lihat catatan di adapters/gemini.rs).
        p.url = p
            .url
            .replace(":generateContent", ":streamGenerateContent?alt=sse");
    } else {
        p.body["stream"] = Value::Bool(true);
    }
    p.sse = true;
    Ok(p)
}

/// Akumulator stream mode agent. Tiap provider memecah teks dan
/// panggilan tool dengan cara berbeda, jadi yang satu ini cuma pembungkus.
pub enum StreamAcc {
    Anthropic(anthropic::ToolAcc),
    Gemini(gemini::ToolAcc),
    Openai(openai::ToolAcc),
}

impl StreamAcc {
    pub fn new(provider: &str) -> Self {
        match provider {
            "anthropic" => StreamAcc::Anthropic(anthropic::ToolAcc::default()),
            "gemini" => StreamAcc::Gemini(gemini::ToolAcc::default()),
            _ => StreamAcc::Openai(openai::ToolAcc::default()),
        }
    }

    /// Beri satu event stream; balikannya = potongan teks baru (bila ada).
    pub fn feed(&mut self, v: &Value) -> Option<String> {
        match self {
            StreamAcc::Anthropic(a) => a.feed(v),
            StreamAcc::Gemini(a) => a.feed(v),
            StreamAcc::Openai(a) => a.feed(v),
        }
    }

    /// Teks penuh + panggilan tool yang terkumpul.
    pub fn finish(self) -> (String, Vec<ToolCall>) {
        match self {
            StreamAcc::Anthropic(a) => a.finish(),
            StreamAcc::Gemini(a) => a.finish(),
            StreamAcc::Openai(a) => a.finish(),
        }
    }
}
