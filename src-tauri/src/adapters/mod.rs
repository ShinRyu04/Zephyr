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

use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ToolSpec};
use crate::errors::ZResult;
use serde_json::Value;

pub fn prepare(
    provider: &str,
    model: &str,
    messages: &[ChatMsg],
    base_url: Option<&str>,
    key: &str,
    max_tokens: u32,
) -> ZResult<Prepared> {
    match provider {
        "anthropic" => Ok(anthropic::prepare(
            model, messages, base_url, key, max_tokens,
        )),
        "gemini" => Ok(gemini::prepare(model, messages, base_url, key, max_tokens)),
        _ => Ok(openai::prepare(
            provider, model, messages, base_url, key, max_tokens,
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
) -> ZResult<Prepared> {
    match provider {
        "anthropic" => Ok(anthropic::prepare_tools(
            model, messages, tools, base_url, key, max_tokens,
        )),
        "gemini" => Ok(gemini::prepare_tools(model, messages, tools, base_url, key, max_tokens)),
        _ => Ok(openai::prepare_tools(
            provider, model, messages, tools, base_url, key, max_tokens,
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
