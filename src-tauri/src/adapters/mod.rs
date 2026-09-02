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

use crate::ai::{ChatMsg, Prepared};
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
