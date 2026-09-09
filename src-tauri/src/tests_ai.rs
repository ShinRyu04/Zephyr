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

    // ── mode agent (tool-calling) ──────────────────────────────

    use crate::ai::{AgentMsg, ToolCall, ToolSpec};

    fn agent_msg(role: &str, content: &str) -> AgentMsg {
        AgentMsg {
            role: role.into(),
            content: content.into(),
            tool_call_id: None,
            tool_calls: None,
            name: None,
        }
    }

    fn spec(name: &str) -> ToolSpec {
        ToolSpec {
            name: name.into(),
            description: format!("tool {name}"),
            parameters: json!({ "type": "object", "properties": {} }),
        }
    }

    #[test]
    fn prepare_tools_openai_bawa_array_tools_dan_tool_result() {
        let mut asst = agent_msg("assistant", "saya cek dulu");
        asst.tool_calls = Some(vec![ToolCall {
            id: "call_1".into(),
            name: "terminal_exec".into(),
            args: json!({ "cmd": "ls" }),
        }]);
        let mut tool = agent_msg("tool", "hasil: 3 file");
        tool.tool_call_id = Some("call_1".into());

        let p = adapters::prepare_tools(
            "openai",
            "gpt-5.2",
            &[asst, tool],
            &[spec("terminal_exec")],
            None,
            "K",
            512,
        )
        .unwrap();

        // tools masuk sebagai array function
        assert_eq!(p.body["tools"][0]["function"]["name"], json!("terminal_exec"));
        // pesan assistant membawa tool_calls ber-args JSON-string
        assert_eq!(p.body["messages"][0]["tool_calls"][0]["id"], json!("call_1"));
        assert_eq!(
            p.body["messages"][0]["tool_calls"][0]["function"]["arguments"],
            json!("{\"cmd\":\"ls\"}")
        );
        // hasil tool dikemas role=tool dengan tool_call_id
        assert_eq!(p.body["messages"][1]["role"], json!("tool"));
        assert_eq!(p.body["messages"][1]["tool_call_id"], json!("call_1"));
        assert_eq!(p.body["messages"][1]["content"], json!("hasil: 3 file"));
        assert!(!p.sse);
    }

    #[test]
    fn parse_tool_openai_baca_teks_dan_tool_calls() {
        let v = json!({
            "choices": [{
                "message": {
                    "content": "oke",
                    "tool_calls": [{
                        "id": "c1",
                        "type": "function",
                        "function": { "name": "editor_read", "arguments": "{\"path\":\"a.ts\"}" }
                    }]
                }
            }]
        });
        let r = adapters::parse_tool_response("openai", &v);
        assert_eq!(r.content, "oke");
        assert_eq!(r.tool_calls.len(), 1);
        assert_eq!(r.tool_calls[0].name, "editor_read");
        assert_eq!(r.tool_calls[0].args["path"], json!("a.ts"));
        assert!(!r.done);

        // tanpa tool_calls -> done
        let v2 = json!({ "choices": [{ "message": { "content": "selesai" } }] });
        let r2 = adapters::parse_tool_response("openai", &v2);
        assert!(r2.tool_calls.is_empty() && r2.done);
    }

    #[test]
    fn prepare_tools_anthropic_system_dipisah_dan_tool_result_dibungkus() {
        let sys = agent_msg("system", "kamu agent Zephyr");
        let mut asst = agent_msg("assistant", "");
        asst.tool_calls = Some(vec![ToolCall {
            id: "tu1".into(),
            name: "terminal_exec".into(),
            args: json!({ "cmd": "ls" }),
        }]);
        let mut tool = agent_msg("tool", "3 file");
        tool.tool_call_id = Some("tu1".into());

        let p = adapters::prepare_tools(
            "anthropic",
            "claude-4.2",
            &[sys, asst, tool],
            &[spec("terminal_exec")],
            None,
            "K",
            512,
        )
        .unwrap();

        assert_eq!(p.body["system"], json!("kamu agent Zephyr"));
        assert!(p.body.get("messages").is_some());
        // tool_result dibungkus dalam user message (aturan Anthropic)
        assert_eq!(p.body["messages"][1]["role"], json!("user"));
        assert_eq!(
            p.body["messages"][1]["content"][0]["type"],
            json!("tool_result")
        );
        assert_eq!(p.body["messages"][1]["content"][0]["tool_use_id"], json!("tu1"));
        assert_eq!(p.body["tools"][0]["name"], json!("terminal_exec"));
        assert!(p.body["tools"][0].get("input_schema").is_some());
    }

    #[test]
    fn parse_tool_anthropic_baca_block_teks_dan_tool_use() {
        let v = json!({
            "content": [
                { "type": "text", "text": "jalankan" },
                { "type": "tool_use", "id": "tu9", "name": "terminal_read", "input": { "lines": 5 } }
            ]
        });
        let r = adapters::parse_tool_response("anthropic", &v);
        assert_eq!(r.content, "jalankan");
        assert_eq!(r.tool_calls.len(), 1);
        assert_eq!(r.tool_calls[0].name, "terminal_read");
        assert_eq!(r.tool_calls[0].args["lines"], json!(5));
        assert!(!r.done);
    }

    #[test]
    fn prepare_tools_gemini_pakai_function_declarations() {
        let sys = agent_msg("system", "jangan bohong");
        let mut tool = agent_msg("tool", "ok");
        tool.tool_call_id = Some("gc1".into());
        tool.name = Some("terminal_exec".into());

        let p = adapters::prepare_tools(
            "gemini",
            "gemini-2.5-pro",
            &[sys, tool],
            &[spec("terminal_exec")],
            None,
            "K",
            512,
        )
        .unwrap();

        assert_eq!(
            p.body["systemInstruction"]["parts"][0]["text"],
            json!("jangan bohong")
        );
        assert_eq!(
            p.body["tools"][0]["functionDeclarations"][0]["name"],
            json!("terminal_exec")
        );
        // hasil tool jadi functionResponse
        assert_eq!(
            p.body["contents"][0]["parts"][0]["functionResponse"]["name"],
            json!("terminal_exec")
        );
    }

    #[test]
    fn parse_tool_gemini_sintesis_id_tool_call() {
        let v = json!({
            "candidates": [{
                "content": {
                    "parts": [
                        { "text": "gas" },
                        { "functionCall": { "name": "editor_read", "args": { "path": "b.ts" } } }
                    ]
                }
            }]
        });
        let r = adapters::parse_tool_response("gemini", &v);
        assert_eq!(r.content, "gas");
        assert_eq!(r.tool_calls.len(), 1);
        // Gemini gak kasih id -> disintesis dari nama + indeks
        assert_eq!(r.tool_calls[0].id, "editor_read-0");
        assert!(!r.done);
    }
}
