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
use crate::ai::{ChatMsg, Prepared};
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
