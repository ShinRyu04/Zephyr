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
    fn subagent_allow_write_default_mati() {
        let d = crate::settings::default_settings();
        let sub = d.get("subagent").expect("seksi subagent hilang dari default");
        let aw = sub
            .get("allowWrite")
            .expect("kunci subagent.allowWrite hilang dari default");

        /*
         * Bawaan HARUS false, dan ini dijaga tes - bukan cuma ditulis sekali.
         * Kalau bawaannya terbalik jadi true, subagent yang dijalankan agen
         * utama bisa mengubah berkas user tanpa pernah ada yang menyalakan
         * izinnya; itu perubahan perilaku yang harus terlihat sebagai tes merah,
         * bukan sebagai kejutan di mesin user.
         */
        assert_eq!(aw.as_bool(), Some(false), "subagent.allowWrite harus false secara bawaan");
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
    fn endpoint_custom_tanpa_base_url_ditolak_bukan_openai() {
        use crate::secrets::endpoint_for_test;

        // The bug being pinned: "custom" with no base URL fell through to
        // api.openai.com, so the key was sent to a host the user never chose
        // and the verdict was about OpenAI, not their gateway.
        for kosong in [None, Some(""), Some("   ")] {
            let r = endpoint_for_test("custom", kosong);
            assert!(r.is_err(), "custom tanpa base URL harus MENOLAK: {r:?}");
            let pesan = r.unwrap_err();
            assert!(
                pesan.to_lowercase().contains("base url"),
                "pesan harus menyebut base URL: {pesan}"
            );
        }

        // With a base URL it uses it verbatim - and never OpenAI.
        let url = endpoint_for_test("custom", Some("https://modelrouter.id/v1")).unwrap();
        assert_eq!(url, "https://modelrouter.id/v1/models");
        assert!(
            !url.contains("openai"),
            "custom tidak boleh jatuh ke OpenAI: {url}"
        );

        // Trailing slash must not double up.
        let url = endpoint_for_test("custom", Some("https://router.local/v1/")).unwrap();
        assert_eq!(url, "https://router.local/v1/models");
    }

    #[test]
    fn endpoint_provider_lain_tidak_jatuh_ke_openai() {
        use crate::secrets::endpoint_for_test;

        // `local` ships a catalogue base URL but had no Rust arm either, so it
        // hit the same fallback. It must resolve to loopback on its own.
        let lokal = endpoint_for_test("local", None).unwrap();
        assert!(lokal.contains("127.0.0.1"), "{lokal}");
        assert!(!lokal.contains("openai"), "{lokal}");

        // Known providers keep their own defaults.
        assert!(endpoint_for_test("deepseek", None)
            .unwrap()
            .contains("api.deepseek.com"));
        assert!(endpoint_for_test("lmstudio", None)
            .unwrap()
            .contains("127.0.0.1:1234"));

        /*
         * The `xai` arm was removed with the provider. Dropping the arm is not
         * enough on its own: an unknown id falls through to the OpenAI default
         * by NAME only for `openai` itself, so `xai` must now be REFUSED when
         * no base URL is given. Asserting the refusal is what stops a leftover
         * key from silently being pointed at a host nobody chose.
         */
        assert!(
            endpoint_for_test("xai", None).is_err(),
            "`xai` sudah dibuang, jadi tanpa base URL ia harus ditolak"
        );

        // An unknown provider with no URL is refused, not silently sent to
        // OpenAI - that is the whole point of removing the catch-all arm.
        let aneh = endpoint_for_test("provider-yang-tidak-dikenal", None);
        assert!(
            aneh.is_err(),
            "provider tak dikenal harus ditolak: {aneh:?}"
        );

        // ...but an unknown provider WITH a URL is honoured (OpenAI-compatible).
        let url = endpoint_for_test("provider-aneh", Some("https://contoh.test/v1")).unwrap();
        assert_eq!(url, "https://contoh.test/v1/models");
    }

    /*
     * Regresi: `local` menunjuk port Ollama, dan server lokal tidak butuh key.
     *
     * Dua bug yang saling menutupi. Pertama, port bawaannya 4096 (server
     * opencode), sehingga Ollama yang jelas-jelas jalan tidak pernah ditemukan.
     * Kedua, `list_models` menolak lebih dulu karena tidak ada API key -
     * padahal server loopback memang tidak mengautentikasi, jadi key itu tidak
     * akan pernah dipakai. Hasilnya `Refresh` pada provider `local` selalu
     * gagal dengan "No API key for local yet" tanpa pernah menghubungi server.
     */
    #[test]
    fn local_menunjuk_port_ollama() {
        use crate::secrets::endpoint_for_test;

        let l = endpoint_for_test("local", None).unwrap();
        assert!(
            l.contains("127.0.0.1:11434"),
            "local harus menunjuk port Ollama (11434), dapat: {l}"
        );
        assert!(
            !l.contains("4096"),
            "port opencode sudah bukan bawaan `local`: {l}"
        );
    }

    /// Alamat loopback dikenali dalam bentuk-bentuk yang benar-benar dipakai.
    #[test]
    fn loopback_dikenali_dan_host_jauh_tidak() {
        use crate::secrets::endpoint_is_loopback_for_test as lb;

        for alamat in [
            "http://127.0.0.1:11434/v1/models",
            "http://localhost:1234/v1/models",
            "http://127.0.0.1:4096/v1/models",
            "https://127.0.0.1/v1/models",
            "http://[::1]:11434/v1/models",
            "http://127.0.0.1/v1/models",
        ] {
            assert!(lb(alamat), "{alamat} harus dikenali sebagai loopback");
        }

        for alamat in [
            "https://api.openai.com/v1/models",
            "https://modelrouter.id/v1/models",
            "https://api.deepseek.com/v1/models",
            // Jangan tertipu oleh host yang hanya MENGANDUNG "localhost".
            "https://localhost.evil.test/v1/models",
            "https://notlocalhost/v1/models",
            // 127.0.0.2 bukan loopback yang dimaksud di sini.
            "https://127.0.0.2:11434/v1/models",
            "",
            "bukan-url",
        ] {
            assert!(!lb(alamat), "{alamat} TIDAK boleh dianggap loopback");
        }
    }

    /*
     * Regresi: `strip_unc` harus membatalkan `long_path` PERSIS.
     *
     * Bentuk verbatim UNC adalah `\\?\UNC\server\share`. Versi lama hanya
     * membuang `\\?\`, sehingga sisanya `UNC\server\share` — path RELATIF,
     * karena `\\` yang membuatnya UNC ikut terbuang bersama prefix. Akibatnya
     * workspace di network share diresolusi terhadap cwd proses, bukan share-nya.
     */
    #[test]
    fn strip_unc_membatalkan_unc_verbatim() {
        use std::path::Path;
        use std::path::PathBuf;

        let verbatim = Path::new(r"\\?\UNC\server\share\dir");
        let hasil = crate::paths::strip_unc(verbatim);
        assert_eq!(
            hasil,
            PathBuf::from(r"\\server\share\dir"),
            "UNC verbatim harus jadi UNC biasa, bukan path relatif"
        );
        assert!(hasil.is_absolute(), "hasilnya harus absolut: {hasil:?}");

        // Bentuk drive tidak terpengaruh.
        assert_eq!(
            crate::paths::strip_unc(Path::new(r"\\?\C:\ws\a.rs")),
            PathBuf::from(r"C:\ws\a.rs")
        );

        // Path tanpa prefix dikembalikan apa adanya.
        assert_eq!(
            crate::paths::strip_unc(Path::new(r"C:\ws\a.rs")),
            PathBuf::from(r"C:\ws\a.rs")
        );

        // Bolak-balik: long_path lalu strip_unc harus kembali ke asalnya.
        let asli = Path::new(r"\\server\share\proyek");
        let bolak_balik = crate::paths::strip_unc(&crate::paths::long_path(asli));
        assert_eq!(bolak_balik, asli.to_path_buf());
    }

    /*
     * Regresi: userinfo tidak boleh membuat host jauh terbaca sebagai loopback.
     *
     * `http://localhost:8080@evil.test/v1` punya authority
     * `localhost:8080@evil.test`; membelahnya di `:` menghasilkan `localhost`,
     * sehingga URL-nya diklasifikasi loopback padahal requestnya menuju
     * evil.test — dan key kosong lalu diterima untuk host itu.
     */
    #[test]
    fn loopback_menolak_userinfo() {
        use crate::secrets::endpoint_is_loopback_for_test as lb;

        assert!(
            !lb("http://localhost:8080@evil.test/v1/models"),
            "userinfo tidak boleh menyamarkan host jauh sebagai loopback"
        );
        assert!(
            !lb("http://127.0.0.1:1@evil.test/v1/models"),
            "idem untuk bentuk IP"
        );
        assert!(
            !lb("http://user:pass@evil.test/v1/models"),
            "user:pass biasa juga bukan loopback"
        );
        // Yang benar tetap dikenali.
        assert!(lb("http://user:pass@127.0.0.1:11434/v1/models"), "loopback asli tetap lolos");
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

    /*
     * The two counters must stay independent.
     *
     * They answer different questions — "which watcher run is this" (whose bump
     * KILLS the watcher) versus "has the tree changed" (whose bump invalidates
     * a cache). Sharing one counter was the first version of the Quick Open
     * index, and it would have ended the file watcher the first time a file
     * changed: the next flush would see its own generation no longer matching
     * the stop flag and break out of the loop.
     */
    #[test]
    fn generasi_pohon_terpisah_dari_generasi_watcher() {
        use crate::app_state::AppState;
        let st = AppState::new();

        let watch_awal = st.watch_generation();
        let tree_awal = st.tree_generation();

        /* Bumping the tree counter must NOT move the watcher counter. */
        st.bump_tree_generation();
        assert_eq!(
            st.watch_generation(),
            watch_awal,
            "bump pohon tidak boleh menghentikan watcher"
        );
        assert_eq!(st.tree_generation(), tree_awal + 1, "pohon naik satu");

        /* And stopping the watcher must NOT invalidate a tree cache. */
        let tree_sebelum_stop = st.tree_generation();
        st.stop_watcher();
        assert_eq!(
            st.tree_generation(),
            tree_sebelum_stop,
            "stop_watcher tidak boleh membuang cache pohon"
        );
        assert!(st.watch_generation() > watch_awal, "watcher naik saat dihentikan");
    }

    /// The handle the watcher thread gets points at the same counter.
    #[test]
    fn pegangan_tree_counter_menunjuk_counter_yang_sama() {
        use crate::app_state::AppState;
        use std::sync::atomic::Ordering;
        let st = AppState::new();
        let handle = st.tree_counter();
        handle.fetch_add(1, Ordering::Relaxed);
        assert_eq!(st.tree_generation(), 1, "handle dan accessor berbagi counter");
    }
}
