import io

p = 'src-tauri/src/adapters/anthropic.rs'
s = io.open(p, encoding='utf-8').read()

anchor = "    #[test]\n    fn model_baru_dapat_bentuk_adaptive() {"

new = '''    /*
     * The 4.6 generation: thinking is OFF until adaptive is set.
     *
     * Straight from the compatibility table — on 4.6 the extended-thinking form
     * is deprecated (still accepted) while adaptive is the current one, and
     * with NO thinking field at all the model simply never thinks. So sending
     * nothing is not a safe fallback here; it silently produces a model that
     * cannot reason.
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
    fn model_baru_dapat_bentuk_adaptive() {'''

assert anchor in s, 'anchor not found'
s = s.replace(anchor, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
