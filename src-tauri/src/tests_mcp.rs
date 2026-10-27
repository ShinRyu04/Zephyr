#[cfg(test)]
mod tests {
    use crate::mcp_config::{
        merge_json_for_test, merge_toml_for_test, random_token_for_test, strip_toml_for_test,
        unmerge_json_for_test,
    };
    use crate::mcp_server::{bearer_ok_for_test, terminal_control_setting_enabled_for_test};
    use axum::http::{HeaderMap, HeaderValue};
    use serde_json::json;
    use serde_json::Value;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn token_uses_os_entropy_and_has_256_bits() {
        let a = random_token_for_test();
        let b = random_token_for_test();
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "successive OS-random tokens unexpectedly matched");
    }

    #[test]
    fn token_di_berkas_ikut_diterima_server_yang_sedang_jalan() {
        use crate::app_state::McpRuntime;
        use crate::mcp_config::sebarkan_token;

        /* Tanpa server berjalan: tidak ada yang bisa disebar. */
        let diam = crate::app_state::AppState::new();
        sebarkan_token(&diam, TOKEN);
        assert_eq!(
            diam.mcp_token(),
            None,
            "tanpa runtime, token tidak boleh diciptakan dari udara"
        );

        /* Server berjalan dengan token lama; berkas sudah memuat token baru. */
        let state = crate::app_state::AppState::new();
        let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
        state.mcp_set_runtime(McpRuntime {
            port: 9222,
            requested: 9222,
            started: std::time::Instant::now(),
            shutdown: tx,
            token: "token-lama-yang-sudah-basi".into(),
        });
        sebarkan_token(&state, TOKEN);
        assert_eq!(
            state.mcp_token().as_deref(),
            Some(TOKEN),
            "server harus menerima token yang ditampilkan UI/ditulis mcp.json - \
             kalau tidak, semua klien 401 permanen"
        );

        /* Idempoten: pemanggilan berulang tidak mengubah apa pun. */
        sebarkan_token(&state, TOKEN);
        assert_eq!(state.mcp_token().as_deref(), Some(TOKEN));
    }

    #[test]
    fn bearer_auth_rejects_missing_and_wrong_tokens() {
        let empty = HeaderMap::new();
        assert!(!bearer_ok_for_test(&empty, TOKEN));
        let mut wrong = HeaderMap::new();
        wrong.insert("authorization", HeaderValue::from_static("Bearer wrong"));
        assert!(!bearer_ok_for_test(&wrong, TOKEN));
        wrong.insert(
            "authorization",
            HeaderValue::from_static("Bearer 0123456789abcdef0123456789abcdef"),
        );
        assert!(bearer_ok_for_test(&wrong, TOKEN));
    }

    #[test]
    fn terminal_control_is_default_deny() {
        assert!(!terminal_control_setting_enabled_for_test(
            &json!({"mcp": {}})
        ));
        assert!(!terminal_control_setting_enabled_for_test(
            &json!({"mcp": {"allow_terminal_control": false}})
        ));
        assert!(terminal_control_setting_enabled_for_test(
            &json!({"mcp": {"allow_terminal_control": true}})
        ));
    }

    #[test]
    fn merge_json_menyisipkan_tanpa_merusak_key_lain() {
        let existing = r#"{
          "$schema": "https://opencode.ai/config.json",
          "theme": "tokyonight",
          "mcp": { "lain": { "type": "local", "command": ["x"] } }
        }"#;
        let out = merge_json_for_test(existing, "mcp", 9222, TOKEN).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();

        assert_eq!(v["mcp"]["zephyr"]["type"], "remote");
        assert_eq!(v["mcp"]["zephyr"]["url"], "http://127.0.0.1:9222/mcp");
        assert_eq!(v["mcp"]["zephyr"]["enabled"], true);
        assert_eq!(
            v["mcp"]["zephyr"]["headers"]["Authorization"],
            format!("Bearer {TOKEN}")
        );

        assert_eq!(v["theme"], "tokyonight");
        assert_eq!(v["$schema"], "https://opencode.ai/config.json");
        assert_eq!(v["mcp"]["lain"]["type"], "local");
    }

    #[test]
    fn merge_json_pada_file_kosong_dan_key_bukan_object() {
        let out = merge_json_for_test("", "mcpServers", 9224, TOKEN).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v["mcpServers"]["zephyr"]["url"],
            "http://127.0.0.1:9224/mcp"
        );

        let out2 =
            merge_json_for_test(r#"{"mcpServers": "rusak"}"#, "mcpServers", 9222, TOKEN).unwrap();
        let v2: Value = serde_json::from_str(&out2).unwrap();
        assert!(v2["mcpServers"]["zephyr"].is_object());
    }

    #[test]
    fn merge_json_menolak_json_rusak() {
        assert!(merge_json_for_test("{ bukan json", "mcpServers", 9222, TOKEN).is_err());
        assert!(merge_json_for_test("[1,2,3]", "mcpServers", 9222, TOKEN).is_err());
    }

    #[test]
    fn merge_json_idempoten() {
        let a = merge_json_for_test(r#"{"theme":"x"}"#, "mcp", 9222, TOKEN).unwrap();
        let b = merge_json_for_test(&a, "mcp", 9222, TOKEN).unwrap();
        assert_eq!(a, b, "menulis dua kali tidak boleh menggandakan entri");
    }

    #[test]
    fn unmerge_json_membuang_zephyr_saja() {
        let with = merge_json_for_test(
            r#"{"theme":"x","mcp":{"lain":{"type":"local"}}}"#,
            "mcp",
            9222,
            TOKEN,
        )
        .unwrap();
        let out = unmerge_json_for_test(&with, "mcp").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert!(v["mcp"]["zephyr"].is_null());
        assert_eq!(v["mcp"]["lain"]["type"], "local");
        assert_eq!(v["theme"], "x");
    }

    #[test]
    fn unmerge_json_aman_bila_belum_pernah_didaftari() {
        let out = unmerge_json_for_test(r#"{"theme":"x"}"#, "mcp").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["theme"], "x");
    }

    #[test]
    fn merge_toml_menambah_blok_dan_menjaga_baris_lain() {
        let existing = "model = \"gpt-5\"\n\n[mcp_servers.lain]\ncommand = \"x\"\n";
        let out = merge_toml_for_test(existing, "mcp_servers", 9222, TOKEN);

        assert!(
            out.contains("model = \"gpt-5\""),
            "baris lain hilang: {out}"
        );
        assert!(out.contains("[mcp_servers.lain]"), "server lain hilang");
        assert!(out.contains("[mcp_servers.zephyr]"));
        assert!(out.contains("url = \"http://127.0.0.1:9222/mcp\""));
        assert!(out.contains("[mcp_servers.zephyr.headers]"));
        assert!(out.contains(&format!("Authorization = \"Bearer {TOKEN}\"")));
    }

    #[test]
    fn merge_toml_idempoten_dan_ganti_port() {
        let a = merge_toml_for_test("model = \"x\"\n", "mcp_servers", 9222, TOKEN);
        let b = merge_toml_for_test(&a, "mcp_servers", 9224, TOKEN);

        assert_eq!(b.matches("[mcp_servers.zephyr]").count(), 1);
        assert!(b.contains("127.0.0.1:9224/mcp"));
        assert!(!b.contains("127.0.0.1:9222/mcp"));
        assert!(b.contains("model = \"x\""));
    }

    #[test]
    fn strip_toml_membuang_blok_zephyr_beserta_headers() {
        let with = merge_toml_for_test(
            "model = \"x\"\n\n[mcp_servers.lain]\ncommand = \"y\"\n",
            "mcp_servers",
            9222,
            TOKEN,
        );
        let out = strip_toml_for_test(&with, "mcp_servers");
        assert!(!out.contains("zephyr"), "sisa entri zephyr: {out}");
        assert!(out.contains("[mcp_servers.lain]"));
        assert!(out.contains("command = \"y\""));
        assert!(out.contains("model = \"x\""));
    }

    use crate::mcp_config::{merge_yaml_for_test, strip_yaml_for_test};

    #[test]
    fn merge_yaml_menambah_blok_dan_menjaga_baris_lain() {
        let existing = "name: \"agent-ku\"\nskills:\n  enabled: true\nmcp_servers:\n  lain:\n    url: \"http://x\"\n";
        let out = merge_yaml_for_test(existing, "mcp_servers", 9222, TOKEN);

        assert!(
            out.contains("name: \"agent-ku\""),
            "baris lain hilang: {out}"
        );
        assert!(out.contains("skills:"), "blok lain hilang");
        assert!(out.contains("  lain:"), "server lain hilang");
        assert!(out.contains("mcp_servers:"));
        assert!(out.contains("  zephyr:"));
        assert!(out.contains("    url: \"http://127.0.0.1:9222/mcp\""));
        assert!(out.contains(&format!("Authorization: \"Bearer {TOKEN}\"")));
    }

    #[test]
    fn merge_yaml_idempoten_dan_ganti_port() {
        let a = merge_yaml_for_test("model: x\n", "mcp_servers", 9222, TOKEN);
        let b = merge_yaml_for_test(&a, "mcp_servers", 9224, TOKEN);

        assert_eq!(b.matches("  zephyr:").count(), 1);
        assert!(b.contains("127.0.0.1:9224/mcp"));
        assert!(!b.contains("127.0.0.1:9222/mcp"));
        assert!(b.contains("model: x"));
    }

    #[test]
    fn merge_yaml_pada_file_kosong() {
        let out = merge_yaml_for_test("", "mcp_servers", 9223, TOKEN);
        assert!(out.contains("mcp_servers:"));
        assert!(out.contains("  zephyr:"));
        assert!(out.contains("127.0.0.1:9223"));
    }

    #[test]
    fn strip_yaml_membuang_blok_zephyr_dan_menjaga_lain() {
        let with = merge_yaml_for_test(
            "name: x\nmcp_servers:\n  lain:\n    url: \"http://y\"\n",
            "mcp_servers",
            9222,
            TOKEN,
        );
        let out = strip_yaml_for_test(&with, "mcp_servers");
        assert!(!out.contains("zephyr"), "sisa entri zephyr: {out}");
        assert!(out.contains("  lain:"), "server lain hilang");
        assert!(out.contains("name: x"));
    }

    /*
     * The id ends up inside every tool name this server contributes
     * (`mcp__<id>__<tool>`), and that name is split on the first `__`. An id
     * with a space or a doubled underscore therefore makes the tool unusable -
     * it is filed under a server that does not exist. These cases are what the
     * manual-config dialog can receive: a JSON document written by somebody else.
     */
    #[test]
    fn id_server_bisa_dipakai_di_nama_tool() {
        use crate::mcp_client::id_server_for_test;

        assert_eq!(id_server_for_test("context7"), "context7");
        assert_eq!(id_server_for_test("my-server_v2.1"), "my-server_v2.1");
        /* Separator collision: `__` must never survive. */
        assert_eq!(id_server_for_test("a__b"), "a_b");
        /* Punctuation and spaces collapse to a dash instead of being kept. */
        assert_eq!(id_server_for_test("my server"), "my-server");
        assert_eq!(id_server_for_test("a/b:c"), "a-b-c");
        /* Path-like input cannot escape into the name. */
        assert_eq!(id_server_for_test("../secret"), "secret");
        /* Nothing usable left: a generated id, never an empty one. */
        let kosong = id_server_for_test("   ");
        assert!(!kosong.is_empty());
        assert!(!kosong.contains("__"));
        assert!(!kosong.contains(' '));
    }
}
