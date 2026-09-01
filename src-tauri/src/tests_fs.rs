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
}
