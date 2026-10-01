#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("zephyr-test-{name}"));
        p
    }

    #[test]
    fn utf8_plain_roundtrip() {
        let p = tmp("utf8.txt");
        std::fs::write(&p, "halo dunia\nbaris kedua\n").unwrap();
        let bytes = std::fs::read(&p).unwrap();
        let (text, enc) = crate::fs_utils::decode_for_test(&bytes, None).unwrap();
        assert_eq!(enc, "utf8");
        assert!(text.contains("baris kedua"));

        let out = crate::fs_utils::encode_for_test(&text, "utf8", "lf").unwrap();
        assert_eq!(out, bytes);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn utf8_bom_detected_and_preserved() {
        let p = tmp("bom.txt");
        let mut raw = vec![0xEF, 0xBB, 0xBF];
        raw.extend_from_slice("ada BOM di sini".as_bytes());
        std::fs::write(&p, &raw).unwrap();

        let bytes = std::fs::read(&p).unwrap();
        let (text, enc) = crate::fs_utils::decode_for_test(&bytes, None).unwrap();
        assert_eq!(enc, "utf8-bom");
        assert_eq!(text, "ada BOM di sini");
        assert!(
            !text.starts_with('\u{feff}'),
            "BOM tidak boleh ikut ke konten"
        );

        let out = crate::fs_utils::encode_for_test(&text, "utf8-bom", "lf").unwrap();
        assert_eq!(out, raw);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn ansi_fallback_no_replacement_char() {
        let p = tmp("ansi.txt");

        let raw = vec![b'c', b'a', b'f', 0xE9, b' ', b'n', b'a', b'i', b'f'];
        std::fs::write(&p, &raw).unwrap();

        let bytes = std::fs::read(&p).unwrap();
        let (text, enc) = crate::fs_utils::decode_for_test(&bytes, None).unwrap();
        assert_eq!(enc, "ansi");
        assert_eq!(text, "café naif");
        assert!(
            !text.contains('\u{fffd}'),
            "tidak boleh ada karakter pengganti"
        );

        let out = crate::fs_utils::encode_for_test(&text, "ansi", "lf").unwrap();
        assert_eq!(out, raw);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn crlf_preserved_on_write() {
        let text = "satu\ndua\ntiga";
        let crlf = crate::fs_utils::encode_for_test(text, "utf8", "crlf").unwrap();
        assert_eq!(String::from_utf8(crlf).unwrap(), "satu\r\ndua\r\ntiga");

        let lf = crate::fs_utils::encode_for_test(text, "utf8", "lf").unwrap();
        assert_eq!(String::from_utf8(lf).unwrap(), "satu\ndua\ntiga");
    }

    #[test]
    fn crlf_detected() {
        assert_eq!(crate::fs_utils::detect_le_for_test("a\r\nb"), "crlf");
        assert_eq!(crate::fs_utils::detect_le_for_test("a\nb"), "lf");
        assert_eq!(crate::fs_utils::detect_le_for_test("tanpa newline"), "lf");
    }

    #[test]
    fn ansi_rejects_unmappable_char() {
        let res = crate::fs_utils::encode_for_test("emoji 🚀", "ansi", "lf");
        assert!(res.is_err(), "harus menolak, bukan menulis byte rusak");
    }

    #[test]
    fn settings_deep_merge_partial() {
        let mut base = serde_json::json!({
            "general": { "theme": "dark", "fontSize": 13 },
            "editor": { "tabSize": 2 }
        });
        let patch = serde_json::json!({ "general": { "fontSize": 16 } });
        crate::settings::merge_for_test(&mut base, &patch);

        assert_eq!(base["general"]["fontSize"], 16);
        assert_eq!(base["general"]["theme"], "dark", "key lain harus tetap ada");
        assert_eq!(base["editor"]["tabSize"], 2);
    }

    #[test]
    fn default_settings_has_all_sections() {
        let d = crate::settings::default_settings();
        for k in [
            "general",
            "editor",
            "theme",
            "shortcuts",
            "models",
            "agents",
            "extensions",
            "git",
            "mcp",
            "ssh",
        ] {
            assert!(d.get(k).is_some(), "seksi {k} hilang dari default settings");
        }
        assert_eq!(d["mcp"]["port"], 9222);
        assert_eq!(d["editor"]["tabSize"], 2);
    }

    #[test]
    fn ignore_list_menutup_folder_berat() {
        for d in ["node_modules", ".git", "target", "dist", "venv", ".next"] {
            assert!(
                crate::explorer::is_ignored_for_test(d, true),
                "{d} harus di-ignore"
            );
        }

        assert!(crate::explorer::is_ignored_for_test("Node_Modules", true));

        assert!(!crate::explorer::is_ignored_for_test("src", true));
        assert!(!crate::explorer::is_ignored_for_test("package.json", false));

        assert!(!crate::explorer::is_ignored_for_test("target", false));
    }

    #[test]
    fn search_literal_memperlakukan_titik_sebagai_teks() {
        let re = crate::explorer::build_regex_for_test("a.c", false, true).unwrap();
        assert!(re.is_match("xxa.cxx"));
        assert!(!re.is_match("xxabcxx"));

        let re2 = crate::explorer::build_regex_for_test("a.c", true, true).unwrap();
        assert!(re2.is_match("xxabcxx"));
    }

    #[test]
    fn search_case_insensitive_default() {
        let ci = crate::explorer::build_regex_for_test("import", false, false).unwrap();
        assert!(ci.is_match("IMPORT React"));

        let cs = crate::explorer::build_regex_for_test("import", false, true).unwrap();
        assert!(!cs.is_match("IMPORT React"));
        assert!(cs.is_match("import React"));
    }

    #[test]
    fn search_regex_tidak_valid_ditolak() {
        let bad = crate::explorer::build_regex_for_test("(unclosed", true, false);
        assert!(bad.is_err(), "regex rusak harus mengembalikan InvalidInput");
    }

    #[test]
    fn scan_dir_mengurutkan_folder_dulu() {
        let mut root = std::env::temp_dir();
        root.push(format!("zephyr-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("zz")).unwrap();
        std::fs::create_dir_all(root.join("aa")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::write(root.join("b.txt"), "b").unwrap();
        std::fs::write(root.join("a.txt"), "a").unwrap();

        let names = crate::explorer::scan_names_for_test(&root).unwrap();
        assert_eq!(
            names,
            vec!["aa", "zz", "a.txt", "b.txt"],
            "folder dulu (alfabetis), lalu file; node_modules disembunyikan"
        );

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn replace_literal_tidak_menafsirkan_dollar() {
        let re = crate::explorer::build_regex_for_test("foo", false, true).unwrap();
        let out = re.replace_all("foo bar", regex::NoExpand("$1x"));
        assert_eq!(out, "$1x bar");
    }

    #[test]
    fn list_shells_menemukan_powershell_dan_path_nyata() {
        let shells = crate::pty::list_shells().unwrap();
        let ps = shells
            .iter()
            .find(|s| s.id == "powershell")
            .expect("powershell wajib ada di Windows");
        assert!(
            std::path::Path::new(&ps.path).exists(),
            "path shell harus benar-benar ada: {}",
            ps.path
        );

        let mut ids: Vec<_> = shells.iter().map(|s| s.id.clone()).collect();
        ids.sort();
        let jumlah = ids.len();
        ids.dedup();
        assert_eq!(jumlah, ids.len(), "id shell duplikat: {ids:?}");
    }

    #[test]
    fn private_shell_pakai_noprofile_dan_savenothing() {
        let (prog, args) = crate::pty::resolve_shell_for_test("private", None).unwrap();
        assert!(prog.to_lowercase().contains("powershell") || prog.to_lowercase().contains("pwsh"));
        let joined = args.join(" ");
        assert!(args.iter().any(|a| a == "-NoProfile"), "args: {joined}");
        assert!(
            joined.contains("HistorySaveStyle SaveNothing"),
            "riwayat harus dimatikan: {joined}"
        );

        assert!(args.iter().any(|a| a == "-NoExit"), "args: {joined}");
    }

    #[test]
    fn shell_normal_tidak_mematikan_profil_user() {
        let (_, args) = crate::pty::resolve_shell_for_test("shell", None).unwrap();
        assert!(
            !args.iter().any(|a| a == "-NoProfile"),
            "terminal biasa harus memuat profil user"
        );
    }

    #[test]
    fn command_eksplisit_menang_atas_kind() {
        let (prog, args) =
            crate::pty::resolve_shell_for_test("private", Some(r"C:\Windows\System32\cmd.exe"))
                .unwrap();
        assert_eq!(prog, r"C:\Windows\System32\cmd.exe");
        assert!(args.is_empty());
    }

    #[test]
    fn kind_tidak_dikenal_jatuh_ke_powershell() {
        let (prog, _) = crate::pty::resolve_shell_for_test("entah-apa", None).unwrap();
        assert!(prog.to_lowercase().contains("powershell") || prog.to_lowercase().contains("pwsh"));
    }

    #[test]
    fn kind_agent_tanpa_command_ditolak() {
        assert!(crate::pty::resolve_shell_for_test("agent", None).is_err());
        let (prog, _) =
            crate::pty::resolve_shell_for_test("agent", Some(r"C:\Windows\System32\cmd.exe"))
                .unwrap();
        assert!(prog.to_lowercase().ends_with("cmd.exe"));
    }

    #[test]
    fn list_agents_hanya_mengembalikan_path_yang_ada() {
        let found = crate::agents::list_agents().unwrap();
        for a in &found {
            assert!(
                std::path::Path::new(&a.path).is_file(),
                "{} menunjuk path yang tidak ada: {}",
                a.id,
                a.path
            );
            assert!(!a.label.is_empty());
        }

        let mut ids: Vec<_> = found.iter().map(|a| a.id.clone()).collect();
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(n, ids.len(), "id agent duplikat");
    }

    #[test]
    fn settings_null_menghapus_key() {
        let mut base = serde_json::json!({
            "shortcuts": { "view.explorer": "Ctrl+Alt+E", "file.save": "Ctrl+S" },
            "agents": { "startCommands": { "opencode": ["a", "b"] }, "maxPanes": 6 }
        });
        let patch = serde_json::json!({
            "shortcuts": { "view.explorer": null },
            "agents": { "startCommands": { "opencode": null } }
        });
        crate::settings::merge_for_test(&mut base, &patch);

        assert!(
            base["shortcuts"].get("view.explorer").is_none(),
            "null harus MENGHAPUS key, bukan menyimpan null: {base}"
        );
        assert_eq!(base["shortcuts"]["file.save"], "Ctrl+S", "key lain aman");
        assert!(base["agents"]["startCommands"].get("opencode").is_none());
        assert_eq!(base["agents"]["maxPanes"], 6);
    }

    #[test]
    fn secret_roundtrip_dan_tidak_plaintext() {
        let key = "sk-test-1234567890abcdefXYZ";
        let (enc, dec) = crate::secrets::roundtrip_for_test(key);
        assert_eq!(dec.as_deref(), Some(key), "harus bisa dibaca kembali");
        assert!(
            !enc.contains("sk-test"),
            "bentuk tersimpan TIDAK boleh memuat key plaintext: {enc}"
        );
        assert_ne!(enc, key);
    }

    #[test]
    fn preview_key_menutupi_bagian_tengah() {
        let p = crate::secrets::preview_for_test("sk-abcdefghijklmnop4f2a");
        assert!(p.starts_with("sk-a"), "{p}");
        assert!(p.ends_with("4f2a"), "{p}");
        assert!(!p.contains("efghij"), "bagian tengah harus tertutup: {p}");

        assert!(crate::secrets::preview_for_test("abc")
            .chars()
            .all(|c| c == '•'));
    }

    #[test]
    fn long_path_menambah_prefix_untuk_path_panjang() {
        use std::path::Path;

        let pendek = Path::new(r"C:\Users\a\proyek\file.txt");
        assert_eq!(crate::paths::long_path(pendek), pendek.to_path_buf());

        let dalam = format!(r"C:\Users\a\{}\file.txt", "folder-panjang\\".repeat(20));
        let hasil = crate::paths::long_path(Path::new(&dalam));
        assert!(
            hasil.to_string_lossy().starts_with(r"\\?\C:\"),
            "harus dapat prefix: {}",
            hasil.display()
        );

        let sudah = format!(r"\\?\C:\{}", "x".repeat(300));
        let hasil2 = crate::paths::long_path(Path::new(&sudah));
        assert!(!hasil2.to_string_lossy().starts_with(r"\\?\\\?\"));

        let unc = format!(r"\\server\share\{}", "y".repeat(300));
        let hasil3 = crate::paths::long_path(Path::new(&unc));
        assert!(
            hasil3
                .to_string_lossy()
                .starts_with(r"\\?\UNC\server\share"),
            "{}",
            hasil3.display()
        );
    }

    #[test]
    fn is_drive_root_menolak_root_tapi_izinkan_folder() {
        use std::path::Path;
        assert!(crate::paths::is_drive_root(Path::new(r"C:\")));
        assert!(crate::paths::is_drive_root(Path::new(r"D:\")));
        assert!(!crate::paths::is_drive_root(Path::new(r"C:\Users")));
        assert!(!crate::paths::is_drive_root(Path::new(r"D:\Zephyr")));
        assert!(!crate::paths::is_drive_root(Path::new(r"C:\Users\a\b")));
    }
}
