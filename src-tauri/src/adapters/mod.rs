pub mod anthropic;
pub mod gemini;
pub mod openai;

use crate::ai::{AgentMsg, AiToolResult, ChatMsg, Prepared, ReasoningEffort, ToolCall, ToolSpec};
use crate::errors::ZResult;
use serde_json::Value;

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

pub fn extract_delta(provider: &str, v: &Value) -> Option<String> {
    match provider {
        "anthropic" => anthropic::extract_delta(v),
        "gemini" => gemini::extract_delta(v),
        _ => openai::extract_delta(v),
    }
}

pub fn extract_reasoning(provider: &str, v: &Value) -> Option<String> {
    match provider {
        "anthropic" => anthropic::extract_reasoning(v),
        "gemini" => gemini::extract_reasoning(v),
        _ => openai::extract_reasoning(v),
    }
}

pub fn trim_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
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

pub fn parse_tool_response(provider: &str, v: &Value) -> AiToolResult {
    match provider {
        "anthropic" => anthropic::parse_tool_response(v),
        "gemini" => gemini::parse_tool_response(v),
        _ => openai::parse_tool_response(v),
    }
}

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
        p.url = p
            .url
            .replace(":generateContent", ":streamGenerateContent?alt=sse");
    } else {
        p.body["stream"] = Value::Bool(true);
    }
    p.sse = true;
    Ok(p)
}

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

    pub fn feed(&mut self, v: &Value) -> Option<String> {
        match self {
            StreamAcc::Anthropic(a) => a.feed(v),
            StreamAcc::Gemini(a) => a.feed(v),
            StreamAcc::Openai(a) => a.feed(v),
        }
    }

    pub fn finish(self) -> (String, Vec<ToolCall>) {
        match self {
            StreamAcc::Anthropic(a) => a.finish(),
            StreamAcc::Gemini(a) => a.finish(),
            StreamAcc::Openai(a) => a.finish(),
        }
    }
}
