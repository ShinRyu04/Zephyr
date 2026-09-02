// tests_ai.rs — unit test adapter AI (fase 09).
//
// Yang diuji di sini adalah hal yang PALING mudah salah tanpa jaringan:
// bentuk body & header per provider, pemisahan pesan `system`, dan
// pembacaan potongan stream (`extract_delta`) untuk tiga format berbeda.
// Streaming end-to-end diuji terpisah oleh `npm run verify:09` (app hidup).

#[cfg(test)]
mod tests {
    use crate::adapters;
    use crate::ai::ChatMsg;
    use serde_json::json;

    fn msg(role: &str, content: &str) -> ChatMsg {
        ChatMsg {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn openai_pakai_bearer_dan_chat_completions() {
        let p = adapters::prepare(
            "openai",
            "gpt-5.2",
            &[msg("user", "hai")],
            None,
            "KEY123",
            1024,
        )
        .unwrap();

        assert_eq!(p.url, "https://api.openai.com/v1/chat/completions");
        assert!(p.sse);
        assert!(p
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer KEY123"));
        assert_eq!(p.body["stream"], json!(true));
        assert_eq!(p.body["max_tokens"], json!(1024));
        assert_eq!(p.body["messages"][0]["role"], json!("user"));
    }

    #[test]
    fn base_url_user_menang_dan_slash_dibuang() {
        let p = adapters::prepare(
            "custom",
            "m",
            &[msg("user", "x")],
            Some("http://127.0.0.1:8098/v1/"),
            "K",
            10,
        )
        .unwrap();
        assert_eq!(p.url, "http://127.0.0.1:8098/v1/chat/completions");
    }

    #[test]
    fn deepseek_punya_base_url_sendiri() {
        let p = adapters::prepare(
            "deepseek",
            "deepseek-chat",
            &[msg("user", "x")],
            None,
            "K",
            8,
        )
        .unwrap();
        assert_eq!(p.url, "https://api.deepseek.com/v1/chat/completions");
    }

    #[test]
    fn anthropic_pisahkan_system_dan_wajib_max_tokens() {
        let p = adapters::prepare(
            "anthropic",
            "claude-sonnet-4.5",
            &[msg("system", "jadilah singkat"), msg("user", "hai")],
            None,
            "SECRET",
            2048,
        )
        .unwrap();

        assert_eq!(p.url, "https://api.anthropic.com/v1/messages");
        assert!(p.sse);
        // key TIDAK lewat Authorization untuk anthropic
        assert!(p
            .headers
            .iter()
            .any(|(k, v)| k == "x-api-key" && v == "SECRET"));
        assert!(p
            .headers
            .iter()
            .any(|(k, v)| k == "anthropic-version" && v == "2023-06-01"));
        assert_eq!(p.body["system"], json!("jadilah singkat"));
        assert_eq!(p.body["max_tokens"], json!(2048));
        // messages hanya memuat user/assistant — system tidak boleh ikut
        assert_eq!(p.body["messages"].as_array().unwrap().len(), 1);
        assert_eq!(p.body["messages"][0]["role"], json!("user"));
    }

    #[test]
    fn gemini_pakai_alt_sse_header_goog_dan_role_model() {
        let p = adapters::prepare(
            "gemini",
            "gemini-3.6-flash",
            &[
                msg("system", "ringkas"),
                msg("user", "hai"),
                msg("assistant", "halo"),
            ],
            None,
            "GKEY",
            512,
        )
        .unwrap();

        // alt=sse WAJIB: tanpa itu jawabannya JSON array pretty-print yang
        // tidak bisa dipotong per baris (bug nyata fase 09).
        assert!(
            p.url.ends_with(":streamGenerateContent?alt=sse"),
            "url: {}",
            p.url
        );
        assert!(p.url.contains("/v1beta/models/gemini-3.6-flash"));
        assert!(p.sse);
        assert!(p
            .headers
            .iter()
            .any(|(k, v)| k == "x-goog-api-key" && v == "GKEY"));
        assert_eq!(
            p.body["systemInstruction"]["parts"][0]["text"],
            json!("ringkas")
        );
        assert_eq!(p.body["contents"][0]["role"], json!("user"));
        // 'assistant' harus diterjemahkan menjadi 'model'
        assert_eq!(p.body["contents"][1]["role"], json!("model"));
        assert_eq!(p.body["generationConfig"]["maxOutputTokens"], json!(512));
    }

    #[test]
    fn extract_delta_openai() {
        let v = json!({ "choices": [{ "delta": { "content": "abc" } }] });
        assert_eq!(
            adapters::extract_delta("openai", &v).as_deref(),
            Some("abc")
        );
        // gateway yang mengabaikan stream:true mengirim message.content
        let v2 = json!({ "choices": [{ "message": { "content": "xy" } }] });
        assert_eq!(
            adapters::extract_delta("openai", &v2).as_deref(),
            Some("xy")
        );
        // event tanpa teks -> None
        let v3 = json!({ "choices": [{ "delta": {} }] });
        assert!(adapters::extract_delta("openai", &v3).is_none());
    }

    #[test]
    fn extract_delta_anthropic_hanya_event_teks() {
        let delta = json!({ "type": "content_block_delta", "delta": { "text": "ha" } });
        assert_eq!(
            adapters::extract_delta("anthropic", &delta).as_deref(),
            Some("ha")
        );

        let start = json!({ "type": "content_block_start", "content_block": { "text": "" } });
        assert!(adapters::extract_delta("anthropic", &start).is_none());

        for t in ["message_start", "ping", "message_delta", "message_stop"] {
            let v = json!({ "type": t });
            assert!(
                adapters::extract_delta("anthropic", &v).is_none(),
                "event {t} tidak boleh dianggap teks"
            );
        }
    }

    #[test]
    fn extract_delta_gemini_gabung_semua_part() {
        let v = json!({
            "candidates": [{ "content": { "parts": [{ "text": "a" }, { "text": "b" }] } }]
        });
        assert_eq!(adapters::extract_delta("gemini", &v).as_deref(), Some("ab"));

        // potongan tanpa kandidat (mis. promptFeedback) -> None, bukan panic
        let v2 = json!({ "promptFeedback": { "blockReason": "SAFETY" } });
        assert!(adapters::extract_delta("gemini", &v2).is_none());
    }
}
