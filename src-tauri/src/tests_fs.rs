// tests_fs.rs — unit test murni untuk logika encoding & line ending
// (V4 fase 03: file BOM + ANSI harus dibaca/ditulis tanpa rusak).
// Fungsi decode/encode diuji lewat command fs_read/fs_write pada file
// temporer, tanpa perlu menjalankan GUI.

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("zephyr-test-{name}"));
        p
    }

    // ── decode: UTF-8 tanpa BOM ──
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

    // ── decode: UTF-8 dengan BOM, BOM dibuang dari konten ──
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

        // Simpan balik: BOM harus kembali, byte identik.
        let out = crate::fs_utils::encode_for_test(&text, "utf8-bom", "lf").unwrap();
        assert_eq!(out, raw);
        std::fs::remove_file(&p).ok();
    }

    // ── decode: byte ANSI (Windows-1252) yang bukan UTF-8 valid ──
    #[test]
    fn ansi_fallback_no_replacement_char() {
        let p = tmp("ansi.txt");
        // 0xE9 = 'é' di Windows-1252, tapi UTF-8 tidak valid berdiri sendiri.
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

    // ── line ending: CRLF asal dipertahankan ──
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

    // ── ANSI gagal bila konten punya karakter di luar Windows-1252 ──
    #[test]
    fn ansi_rejects_unmappable_char() {
        let res = crate::fs_utils::encode_for_test("emoji 🚀", "ansi", "lf");
        assert!(res.is_err(), "harus menolak, bukan menulis byte rusak");
    }

    // ── deep_merge settings: patch parsial tidak menghapus key lain ──
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

    // ── default settings punya semua seksi yang dijanjikan ARCHITECTURE.md ──
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

    // ───────── fase 04: explorer & search ─────────

    #[test]
    fn ignore_list_menutup_folder_berat() {
        for d in ["node_modules", ".git", "target", "dist", "venv", ".next"] {
            assert!(
                crate::explorer::is_ignored_for_test(d, true),
                "{d} harus di-ignore"
            );
        }
        // Case-insensitive (Windows).
        assert!(crate::explorer::is_ignored_for_test("Node_Modules", true));
        // File biasa & folder src tidak boleh di-ignore.
        assert!(!crate::explorer::is_ignored_for_test("src", true));
        assert!(!crate::explorer::is_ignored_for_test("package.json", false));
        // Nama file yang kebetulan sama dengan folder ignore tetap tampil.
        assert!(!crate::explorer::is_ignored_for_test("target", false));
    }

    #[test]
    fn search_literal_memperlakukan_titik_sebagai_teks() {
        // Non-regex: "a.c" tidak boleh cocok dengan "abc".
        let re = crate::explorer::build_regex_for_test("a.c", false, true).unwrap();
        assert!(re.is_match("xxa.cxx"));
        assert!(!re.is_match("xxabcxx"));

        // Regex: titik jadi wildcard.
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
        // Siapkan struktur: b.txt, a.txt, folder zz, folder aa, node_modules
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
        // NoExpand: "$1" di teks pengganti harus tertulis apa adanya.
        let re = crate::explorer::build_regex_for_test("foo", false, true).unwrap();
        let out = re.replace_all("foo bar", regex::NoExpand("$1x"));
        assert_eq!(out, "$1x bar");
    }
}
