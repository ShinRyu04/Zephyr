// tests_mcp.rs — unit test MCP (fase 11) yang jalan tanpa jaringan & tanpa
// menyentuh config user.
//
// Yang diuji di sini: merge/unmerge config CLI (JSON & TOML) — bagian yang
// paling berbahaya karena menyentuh file milik AI CLI lain, jadi harus terbukti
// TIDAK merusak key lain. Alur end-to-end (server, auth, semua method) diuji
// `npm run verify:11` lewat HTTP + CDP di app hidup.

#[cfg(test)]
mod tests {
    use crate::mcp_config::{
        merge_json_for_test, merge_toml_for_test, strip_toml_for_test, unmerge_json_for_test,
    };
    use serde_json::Value;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn merge_json_menyisipkan_tanpa_merusak_key_lain() {
        let existing = r#"{
          "$schema": "https://opencode.ai/config.json",
          "theme": "tokyonight",
          "mcp": { "lain": { "type": "local", "command": ["x"] } }
        }"#;
        let out = merge_json_for_test(existing, "mcp", 9222, TOKEN).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();

        // entri baru benar
        assert_eq!(v["mcp"]["zephyr"]["type"], "http");
        assert_eq!(v["mcp"]["zephyr"]["url"], "http://127.0.0.1:9222");
        assert_eq!(
            v["mcp"]["zephyr"]["headers"]["Authorization"],
            format!("Bearer {TOKEN}")
        );
        // key lain UTUH
        assert_eq!(v["theme"], "tokyonight");
        assert_eq!(v["$schema"], "https://opencode.ai/config.json");
        assert_eq!(v["mcp"]["lain"]["type"], "local");
    }

    #[test]
    fn merge_json_pada_file_kosong_dan_key_bukan_object() {
        // file belum ada (string kosong)
        let out = merge_json_for_test("", "mcpServers", 9224, TOKEN).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["mcpServers"]["zephyr"]["url"], "http://127.0.0.1:9224");

        // key induk bertipe salah -> diganti object, tidak panik
        let out2 = merge_json_for_test(r#"{"mcpServers": "rusak"}"#, "mcpServers", 9222, TOKEN)
            .unwrap();
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

        assert!(out.contains("model = \"gpt-5\""), "baris lain hilang: {out}");
        assert!(out.contains("[mcp_servers.lain]"), "server lain hilang");
        assert!(out.contains("[mcp_servers.zephyr]"));
        assert!(out.contains("url = \"http://127.0.0.1:9222\""));
        assert!(out.contains("[mcp_servers.zephyr.headers]"));
        assert!(out.contains(&format!("Authorization = \"Bearer {TOKEN}\"")));
    }

    #[test]
    fn merge_toml_idempoten_dan_ganti_port() {
        let a = merge_toml_for_test("model = \"x\"\n", "mcp_servers", 9222, TOKEN);
        let b = merge_toml_for_test(&a, "mcp_servers", 9224, TOKEN);
        // Hanya SATU blok zephyr, dan portnya yang baru.
        assert_eq!(b.matches("[mcp_servers.zephyr]").count(), 1);
        assert!(b.contains("127.0.0.1:9224"));
        assert!(!b.contains("127.0.0.1:9222"));
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
}
