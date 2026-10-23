#[cfg(test)]
mod tests {
    use crate::adapters;
    use crate::ai::ChatMsg;
    use serde_json::json;

    fn msg(role: &str, content: &str) -> ChatMsg {
        ChatMsg {
            role: role.into(),
            content: content.into(),
            image: None,
            images: None,
            reasoning: None,
            reasoning_signature: None,
        }
    }

    #[test]
    fn openai_pakai_bearer_dan_chat_completions() {
        let p = adapters::prepare(
            "openai",
            "gpt-5.2",
            &[msg("user", "hai")],
            None,
            None,
            "KEY123",
            1024,
            None,
        )
        .unwrap();

        assert_eq!(p.url, "https://api.openai.com/v1/chat/completions");
        assert!(p.sse);
        assert!(p
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer KEY123"));
        assert_eq!(p.body["stream"], json!(true));
        /*
         * `gpt-5.2` is one of the models that REJECTS `max_tokens` and requires
         * `max_completion_tokens`. This assertion used to expect `max_tokens`,
         * which was the bug: the body was OpenAI-shaped for every model on every
         * gateway, so the whole GPT-5+ line and every o-series model 400'd.
         */
        assert_eq!(p.body["max_completion_tokens"], json!(1024));
        assert!(
            p.body.get("max_tokens").is_none(),
            "gpt-5+ must not also carry max_tokens"
        );
        assert_eq!(p.body["messages"][0]["role"], json!("user"));
    }

    #[test]
    fn model_lama_tetap_pakai_max_tokens() {
        /* The other half of the rule: an open-weight or older model only knows
           `max_tokens`, so it must NOT be switched to the new spelling. */
        let p = adapters::prepare("custom", "llama-3.1-70b", &[msg("user", "hai")], None, None, "K", 512, None)
            .unwrap();
        assert_eq!(p.body["max_tokens"], json!(512));
        assert!(p.body.get("max_completion_tokens").is_none());
    }

    #[test]
    fn tools_kosong_tidak_dikirim() {
        /* `"tools": []` is rejected by some gateways and never helps. */
        let p = adapters::prepare_tools_stream(
            "custom",
            "m",
            &[crate::ai::AgentMsg {
                role: "user".into(),
                content: "x".into(),
                tool_call_id: None,
                tool_calls: None,
                name: None,
                images: None,
                reasoning: None,
                reasoning_signature: None,
            }],
            &[],
            None,
            None,
            "K",
            256,
            None,
        )
        .unwrap();
        assert!(p.body.get("tools").is_none(), "array kosong tidak boleh ikut");
    }

    #[test]
    fn base_url_user_menang_dan_slash_dibuang() {
        let p = adapters::prepare(
            "custom",
            "m",
            &[msg("user", "x")],
            Some("http://127.0.0.1:8098/v1/"),
            None,
            "K",
            10,
            None,
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
            None,
            "K",
            8,
            None,
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
            None,
            "SECRET",
            2048,
            None,
        )
        .unwrap();

        assert_eq!(p.url, "https://api.anthropic.com/v1/messages");
        assert!(p.sse);

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
            None,
            "GKEY",
            512,
            None,
        )
        .unwrap();

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

        let v2 = json!({ "choices": [{ "message": { "content": "xy" } }] });
        assert_eq!(
            adapters::extract_delta("openai", &v2).as_deref(),
            Some("xy")
        );

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

        let v2 = json!({ "promptFeedback": { "blockReason": "SAFETY" } });
        assert!(adapters::extract_delta("gemini", &v2).is_none());
    }

    use crate::ai::{AgentMsg, ToolCall, ToolSpec};

    fn agent_msg(role: &str, content: &str) -> AgentMsg {
        AgentMsg {
            role: role.into(),
            content: content.into(),
            tool_call_id: None,
            tool_calls: None,
            name: None,
            images: None,
            reasoning: None,
            reasoning_signature: None,
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
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        assert_eq!(
            p.body["tools"][0]["function"]["name"],
            json!("terminal_exec")
        );

        assert_eq!(
            p.body["messages"][0]["tool_calls"][0]["id"],
            json!("call_1")
        );
        assert_eq!(
            p.body["messages"][0]["tool_calls"][0]["function"]["arguments"],
            json!("{\"cmd\":\"ls\"}")
        );

        assert_eq!(p.body["messages"][1]["role"], json!("tool"));
        assert_eq!(p.body["messages"][1]["tool_call_id"], json!("call_1"));
        assert_eq!(p.body["messages"][1]["content"], json!("hasil: 3 file"));
        assert!(!p.sse);
    }

    #[test]
    fn agent_msg_membaca_riwayat_tool_camel_case_dari_frontend() {
        let messages: Vec<AgentMsg> = serde_json::from_value(json!([
            {
                "role": "assistant",
                "content": "",
                "toolCalls": [{
                    "id": "call_browser_1",
                    "name": "browser_open",
                    "args": { "url": "https://www.google.com" }
                }]
            },
            {
                "role": "tool",
                "content": "Browser opened successfully.",
                "toolCallId": "call_browser_1",
                "name": "browser_open"
            }
        ]))
        .unwrap();

        assert_eq!(
            messages[0].tool_calls.as_ref().unwrap()[0].id,
            "call_browser_1"
        );
        assert_eq!(messages[1].tool_call_id.as_deref(), Some("call_browser_1"));
        assert_eq!(messages[1].name.as_deref(), Some("browser_open"));

        let prepared = adapters::prepare_tools(
            "custom",
            "deepseek-v4.1-flash",
            &messages,
            &[spec("browser_open")],
            Some("https://modelrouter.id/v1"),
            None,
            "K",
            2048,
            None,
        )
        .unwrap();

        assert_eq!(
            prepared.body["messages"][0]["tool_calls"][0]["id"],
            json!("call_browser_1")
        );
        assert_eq!(
            prepared.body["messages"][1]["tool_call_id"],
            json!("call_browser_1")
        );
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
        let r = adapters::parse_tool_response("openai", &v).unwrap();
        assert_eq!(r.content, "oke");
        assert_eq!(r.tool_calls.len(), 1);
        assert_eq!(r.tool_calls[0].name, "editor_read");
        assert_eq!(r.tool_calls[0].args["path"], json!("a.ts"));
        assert!(!r.done);

        let v2 = json!({ "choices": [{ "message": { "content": "selesai" } }] });
        let r2 = adapters::parse_tool_response("openai", &v2).unwrap();
        assert!(r2.tool_calls.is_empty() && r2.done);
    }

    #[test]
    fn stream_dsml_di_dalam_teks_dipulihkan_jadi_tool_call() {
        let mut acc = adapters::StreamAcc::new("custom");
        let potongan = [
            "Saya cek dulu.\n\n",
            "<|DSML| calls>\n",
            "<|DSML| invoke name=\"file_list\">\n",
            "<|DSML| parameter name=\"path\" string=\"true\">.</|DSML| parameter>\n",
            "</|DSML| invoke>\n",
            "</|DSML| calls>",
        ];
        for p in potongan {
            let v = json!({ "choices": [{ "delta": { "content": p } }] });
            acc.feed(&v);
        }
        let (content, calls) = acc.finish().unwrap();
        assert_eq!(calls.len(), 1, "tool call XML harus dipulihkan");
        assert_eq!(calls[0].name, "file_list");
        assert_eq!(calls[0].args["path"], json!("."));
        // Raw tags must not make it into the bubble/disk.
        assert!(!content.contains("DSML"));
        assert!(content.contains("Saya cek dulu."));
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
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        assert_eq!(p.body["system"], json!("kamu agent Zephyr"));
        assert!(p.body.get("messages").is_some());

        assert_eq!(p.body["messages"][1]["role"], json!("user"));
        assert_eq!(
            p.body["messages"][1]["content"][0]["type"],
            json!("tool_result")
        );
        assert_eq!(
            p.body["messages"][1]["content"][0]["tool_use_id"],
            json!("tu1")
        );
        assert_eq!(p.body["tools"][0]["name"], json!("terminal_exec"));
        assert!(p.body["tools"][0].get("input_schema").is_some());
    }

    #[test]
    fn prepare_tools_deepseek_mengisi_reasoning_kosong_pada_tool_call() {
        let mut asst = agent_msg("assistant", "");
        asst.tool_calls = Some(vec![ToolCall {
            id: "call_1".into(),
            name: "read_file".into(),
            args: json!({ "path": "index.html" }),
        }]);

        let p = adapters::prepare_tools(
            "custom",
            "deepseek-v4.1-flash",
            &[asst],
            &[spec("read_file")],
            Some("https://modelrouter.id/v1"),
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        assert_eq!(p.body["messages"][0]["reasoning_content"], json!(" "));
    }

    #[test]
    fn prepare_tools_deepseek_mempertahankan_reasoning_asli() {
        let mut asst = agent_msg("assistant", "");
        asst.reasoning = Some("cek file yang relevan".into());
        asst.tool_calls = Some(vec![ToolCall {
            id: "call_1".into(),
            name: "read_file".into(),
            args: json!({ "path": "index.html" }),
        }]);

        let p = adapters::prepare_tools(
            "custom",
            "deepseek-v4.1-flash",
            &[asst],
            &[spec("read_file")],
            Some("https://modelrouter.id/v1"),
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        assert_eq!(
            p.body["messages"][0]["reasoning_content"],
            json!("cek file yang relevan")
        );
    }

    #[test]
    fn prepare_tools_tidak_mengisi_reasoning_palsu_untuk_model_lain() {
        let mut asst = agent_msg("assistant", "");
        asst.tool_calls = Some(vec![ToolCall {
            id: "call_1".into(),
            name: "read_file".into(),
            args: json!({ "path": "index.html" }),
        }]);

        let p = adapters::prepare_tools(
            "custom",
            "mr-vip",
            &[asst],
            &[spec("read_file")],
            Some("https://modelrouter.id/v1"),
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        assert!(p.body["messages"][0].get("reasoning_content").is_none());
    }

    #[test]
    fn parse_tool_anthropic_baca_block_teks_dan_tool_use() {
        let v = json!({
            "content": [
                { "type": "text", "text": "jalankan" },
                { "type": "tool_use", "id": "tu9", "name": "terminal_read", "input": { "lines": 5 } }
            ]
        });
        let r = adapters::parse_tool_response("anthropic", &v).unwrap();
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
            None,
            "K",
            512,
            None,
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

        assert_eq!(
            p.body["contents"][0]["parts"][0]["functionResponse"]["name"],
            json!("terminal_exec")
        );
    }

    #[test]
    fn ai_request_guard_cleans_registry_on_drop() {
        let state = crate::app_state::AppState::new();
        let (_flag, guard) = state.ai_begin_guard("attempt-1");
        drop(guard);
        assert!(!state.ai_cancel("attempt-1"));
    }

    #[test]
    fn old_request_guard_cannot_remove_replacement_attempt() {
        let state = crate::app_state::AppState::new();
        let (_first, first_guard) = state.ai_begin_guard("same-id");
        let (_second, second_guard) = state.ai_begin_guard("same-id");
        drop(first_guard);
        assert!(state.ai_cancel("same-id"));
        drop(second_guard);
        assert!(!state.ai_cancel("same-id"));
    }

    #[test]
    fn cancelled_terminal_event_is_not_also_an_error() {
        assert_eq!(
            crate::ai::terminal_error_to_emit(true, Some("late error".into())),
            None
        );
        assert_eq!(
            crate::ai::terminal_error_to_emit(false, Some("provider error".into())),
            Some("provider error".into())
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
        let r = adapters::parse_tool_response("gemini", &v).unwrap();
        assert_eq!(r.content, "gas");
        assert_eq!(r.tool_calls.len(), 1);

        assert_eq!(r.tool_calls[0].id, "editor_read-0");
        assert!(!r.done);
    }

    /*
     * The reasoning round trip, one test per format.
     *
     * The defect these lock down: the reasoning was streamed to the screen and
     * then thrown away, so the finished step reported `None` and the next
     * request showed the model its own conclusions with the thinking stripped
     * out. It re-derived what it had already worked out, or contradicted it.
     *
     * Each test feeds the accumulator the shape that format really sends, then
     * asserts the text comes back out AND that `prepare` puts it into the next
     * request in that same format's shape. Both halves matter: an accumulator
     * that collects but a `prepare` that never emits leaves the bug in place.
     */
    #[test]
    fn reasoning_roundtrip_anthropic() {
        let mut acc = adapters::StreamAcc::new("anthropic");
        acc.feed_reasoning(&json!({
            "type": "content_block_delta",
            "delta": { "type": "thinking_delta", "thinking": "the user wants " }
        }));
        acc.feed_reasoning(&json!({
            "type": "content_block_delta",
            "delta": { "type": "thinking_delta", "thinking": "a short answer" }
        }));
        /* The signature rides a delta of its own, with no text at all. */
        acc.feed_reasoning(&json!({
            "type": "content_block_delta",
            "delta": { "type": "signature_delta", "signature": "SIG-abc" }
        }));

        let (teks, sig) = acc.reasoning_parts();
        assert_eq!(teks.as_deref(), Some("the user wants a short answer"));
        assert_eq!(sig.as_deref(), Some("SIG-abc"));

        let p = adapters::prepare(
            "anthropic",
            "claude-sonnet-4.5",
            &[ChatMsg {
                role: "assistant".into(),
                content: "It is 42.".into(),
                image: None,
                images: None,
                reasoning: teks,
                reasoning_signature: sig,
            }],
            None,
            None,
            "K",
            512,
            None,
        )
        .unwrap();

        /* The thinking block goes FIRST and carries the signature verbatim. */
        let blocks = p.body["messages"][0]["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], json!("thinking"));
        assert_eq!(
            blocks[0]["thinking"],
            json!("the user wants a short answer")
        );
        assert_eq!(blocks[0]["signature"], json!("SIG-abc"));
        assert_eq!(blocks[1]["type"], json!("text"));
        assert_eq!(blocks[1]["text"], json!("It is 42."));
    }

    #[test]
    fn reasoning_roundtrip_openai_and_gemini() {
        /* OpenAI-compatible: the reasoning arrives under one of three field
        names depending on the gateway, and goes back as `reasoning_content`. */
        let mut acc = adapters::StreamAcc::new("openai");
        acc.feed_reasoning(
            &json!({ "choices": [{ "delta": { "reasoning_content": "step one; " } }] }),
        );
        /* `delta/reasoning` is the other spelling this must accept. */
        acc.feed_reasoning(&json!({ "choices": [{ "delta": { "reasoning": "step two" } }] }));
        let (teks, sig) = acc.reasoning_parts();
        assert_eq!(teks.as_deref(), Some("step one; step two"));
        assert_eq!(sig, None, "this protocol has no signed block");

        let p = adapters::prepare(
            "openai",
            "gpt-5.2",
            &[ChatMsg {
                role: "assistant".into(),
                content: "done".into(),
                image: None,
                images: None,
                reasoning: teks,
                reasoning_signature: None,
            }],
            None,
            None,
            "K",
            512,
            None,
        )
        .unwrap();
        assert_eq!(
            p.body["messages"][0]["reasoning_content"],
            json!("step one; step two")
        );

        /* Gemini flags it on the part itself, with `thought: true`. */
        let mut acc = adapters::StreamAcc::new("gemini");
        acc.feed_reasoning(&json!({
            "candidates": [{ "content": { "parts": [
                { "text": "let me see", "thought": true },
                { "text": "not a thought" }
            ] } }]
        }));
        let (teks, _) = acc.reasoning_parts();
        assert_eq!(
            teks.as_deref(),
            Some("let me see"),
            "only parts flagged as thoughts belong here"
        );

        let p = adapters::prepare(
            "gemini",
            "gemini-3.6-flash",
            &[ChatMsg {
                role: "assistant".into(),
                content: "empat puluh dua".into(),
                image: None,
                images: None,
                reasoning: teks,
                reasoning_signature: None,
            }],
            None,
            None,
            "K",
            512,
            None,
        )
        .unwrap();
        let parts = p.body["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts[0]["thought"], json!(true));
        assert_eq!(parts[0]["text"], json!("let me see"));
        assert_eq!(parts[1]["text"], json!("empat puluh dua"));
    }

    /*
     * A user turn never carries reasoning, whatever the field says.
     *
     * The history is built from messages the app stores, and a stray `reasoning`
     * on a user turn would be sent as a thinking block (Anthropic) or a thought
     * part (Gemini) — both of which the provider rejects, costing the whole
     * request. The guard is by ROLE, not by the field being empty.
     */
    #[test]
    fn reasoning_is_never_echoed_on_a_user_turn() {
        let pesan = ChatMsg {
            role: "user".into(),
            content: "hai".into(),
            image: None,
            images: None,
            reasoning: Some("this should not go out".into()),
            reasoning_signature: Some("SIG".into()),
        };

        for prov in ["anthropic", "gemini", "openai"] {
            let p = adapters::prepare(prov, "m", &[pesan.clone()], None, None, "K", 512, None).unwrap();
            let teks = p.body.to_string();
            assert!(
                !teks.contains("this should not go out"),
                "{prov} echoed a user turn's reasoning"
            );
        }
    }
}
