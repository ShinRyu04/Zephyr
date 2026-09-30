use crate::ai::ToolCall;
use serde_json::{json, Value};

/// Fold the look-alike characters a model may emit around a tool tag.
///
/// The tag is written `<|DSML| invoke name="...">`, but some models return the
/// fullwidth forms - the vertical line U+FF5C and the angle brackets U+FF1C /
/// U+FF1E - because their tokenizer maps ASCII punctuation onto a CJK-width
/// codepoint. Those bytes are not the ones the parser looks for, so the tag was
/// never recognised and the raw markup ended up in the reply the user reads.
///
/// Folding happens once, at the entry point, so every helper downstream can keep
/// comparing against plain ASCII.
pub fn normalisasi_penanda(teks: &str) -> std::borrow::Cow<'_, str> {
    const LEBAR: [char; 4] = ['\u{FF5C}', '\u{FF1C}', '\u{FF1E}', '\u{FF5E}'];
    let ada_lebar = teks.contains(LEBAR);
    /*
     * The doubled bar is checked before the early return.
     *
     * `||DSML||` reaches us as plain ASCII too — the model that emits it is not
     * writing fullwidth punctuation, it is doubling the ASCII bar — so gating
     * the fold on a fullwidth character meant those replies skipped it
     * entirely: the markup stayed doubled, the tag reader (which expects one
     * bar) never matched, and the raw DSML went out as prose. That is the shape
     * that leaked on screen.
     */
    let ada_ganda = teks.contains("||DSML||");
    if !ada_lebar && !ada_ganda {
        return std::borrow::Cow::Borrowed(teks);
    }
    let lebar: String = if ada_lebar {
        teks.chars()
            .map(|c| match c {
                '\u{FF5C}' => '|',
                '\u{FF1C}' => '<',
                '\u{FF1E}' => '>',
                '\u{FF5E}' => '~',
                other => other,
            })
            .collect()
    } else {
        teks.to_string()
    };
    std::borrow::Cow::Owned(lebar.replace("||DSML||", "|DSML|"))
}

fn tag_name_bersih(tag: &str) -> &str {
    let t = tag.trim();
    let t = t.strip_prefix("<|").unwrap_or(t);
    let t = t.strip_prefix('|').unwrap_or(t);
    let t = t.strip_prefix("DSML|").map(str::trim).unwrap_or(t);
    let t = t.strip_suffix("|>").unwrap_or(t);
    let t = t.split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or(t);
    match t.rsplit_once(':') {
        Some((_, nama)) => nama,
        None => t,
    }
}

fn atribut(tag: &str, key: &str) -> Option<String> {
    let pat = format!("{key}=");
    let start = tag.find(&pat)? + pat.len();
    let rest = tag[start..].trim_start();
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        let end = rest
            .find(|c: char| c.is_whitespace() || c == '>')
            .unwrap_or(rest.len());
        return Some(rest[..end].trim().to_string());
    }
    let rest = &rest[quote.len_utf8()..];
    let end = rest.find(quote)?;
    Some(rest[..end].to_string())
}

fn nilai_json(s: &str) -> Value {
    let t = s.trim();
    if t.is_empty() {
        return json!("");
    }
    if let Ok(v) = serde_json::from_str::<Value>(t) {
        return v;
    }
    json!(s)
}

fn baca_invoke(teks: &str, dari: usize) -> Option<(String, Value, usize)> {
    let sisa = &teks[dari..];
    /*
     * The caller may point at either the opening angle bracket or straight at
     * the `|DSML|` marker, because some models emit the tag without the `<`.
     * Anchoring only on `<` made the reader walk past those and return nothing.
     */
    let awal = if sisa.starts_with("|DSML|") || sisa.starts_with("<|DSML|") {
        0
    } else {
        sisa.find('<')?
    };

    let gt_rel = sisa[awal..].find('>')?;
    let tag_buka = &sisa[awal..awal + gt_rel];
    let nama_tag = tag_name_bersih(tag_buka.trim_start_matches('<'));
    if nama_tag != "invoke" {
        return baca_invoke(teks, dari + awal + gt_rel + 1);
    }
    let nama_tool = atribut(tag_buka, "name")?;
    let isi_mulai = dari + awal + gt_rel + 1;

    let (isi, setelah) = potong_sampai_penutup(teks, isi_mulai, "invoke")?;

    let mut args = serde_json::Map::new();
    let mut pos = 0usize;
    while let Some((p_nama, p_val, p_next)) = baca_parameter(isi, pos) {
        match args.get_mut(&p_nama) {
            Some(Value::Array(arr)) => arr.push(p_val),
            Some(Value::Null) => {
                args.insert(p_nama, p_val);
            }
            Some(existing) => {
                let prev = existing.take();
                args.insert(p_nama, json!([prev, p_val]));
            }
            None => {
                args.insert(p_nama, p_val);
            }
        }
        pos = p_next;
    }

    Some((nama_tool, Value::Object(args), setelah))
}

fn baca_parameter(isi: &str, dari: usize) -> Option<(String, Value, usize)> {
    let sisa = &isi[dari..];
    /*
     * Find the EARLIEST anchor, not just the angle bracket.
     *
     * Two shapes arrive here. `<|DSML| parameter ...>` has a bracket to find,
     * but a model that emits the bare marker writes `|DSML| parameter ...` with
     * none — and the only `<` left in the block belongs to the CLOSING tag. A
     * scanner keyed on `<` therefore latched onto `</|DSML| parameter>`, read
     * its name as empty, and returned no value at all: the tool call arrived
     * with its arguments missing.
     */
    let angle = sisa.find('<');
    let mark = sisa.find("|DSML|");
    let awal = match (angle, mark) {
        (Some(a), Some(m)) => a.min(m),
        (Some(a), None) => a,
        (None, Some(m)) => m,
        (None, None) => return None,
    };
    let gt_rel = sisa[awal..].find('>')?;
    let tag_buka = &sisa[awal..awal + gt_rel];
    let nama_tag = tag_name_bersih(tag_buka.trim_start_matches('<'));
    if nama_tag != "parameter" {
        return baca_parameter(isi, dari + awal + gt_rel + 1);
    }
    let nama = atribut(tag_buka, "name")?;
    let isi_mulai = dari + awal + gt_rel + 1;
    let (nilai_mentah, setelah) = potong_sampai_penutup(isi, isi_mulai, "parameter")?;
    let nilai = if nilai_mentah.trim().is_empty() {
        atribut(tag_buka, "value")
            .or_else(|| atribut(tag_buka, "string"))
            .map(|v| nilai_json(&v))
            .unwrap_or_else(|| json!(""))
    } else {
        nilai_json(&nilai_mentah)
    };
    Some((nama, nilai, setelah))
}

fn potong_sampai_penutup<'a>(teks: &'a str, mulai: usize, nama: &str) -> Option<(&'a str, usize)> {
    let sisa = &teks[mulai..];
    let mut scan = 0usize;
    while let Some(rel) = sisa[scan..].find("</") {
        let abs = scan + rel;
        let gt_rel = sisa[abs..].find('>')?;
        let tag = &sisa[abs + 2..abs + gt_rel];
        if tag_name_bersih(tag.trim_end_matches('>')) == nama {
            let isi = &sisa[..abs];
            let setelah = mulai + abs + gt_rel + 1;
            return Some((isi, setelah));
        }
        scan = abs + gt_rel + 1;
    }
    None
}

/// True when the tail of a streamed reply may be the start of a tool tag.
///
/// Streaming sends each chunk the moment it arrives, so a tag that is still
/// being written — `<|DSML| invo` — reaches the UI as prose, and the rest of it
/// follows on the next chunk. A reader sees the raw markup before the parser
/// ever gets a complete tag to recognise.
///
/// This is the guard for that window: given the text that has arrived so far,
/// it says whether the tail could still grow into a tag. The caller holds the
/// text back instead of emitting it, and the parser either consumes it at
/// `finish` or the text is flushed as normal prose once it can no longer match.
pub fn mungkin_awal_tag(teks: &str) -> bool {
    /* Only the tail matters — an earlier tag would already have been seen. */
    const AWALAN: [&str; 6] = [
        "<|DSML|",
        "|DSML|",
        "<",
        "<|",
        "||DSML||",
        "<||DSML||",
    ];
    let ekor = if teks.len() > 24 {
        &teks[teks.len() - 24..]
    } else {
        teks
    };
    /* A `<` alone is too common in prose to hold on its own; require a partial
       match that already commits to the marker. */
    AWALAN
        .iter()
        .any(|a| a.starts_with(ekor.trim_end()) && !ekor.trim_end().is_empty() && ekor.contains('<'))
        || ekor.contains("<|DSML|")
        || ekor.contains("||DSML||")
        || ekor.ends_with("|DSML")
        || ekor.ends_with("<|DSM")
        || ekor.ends_with("<|DS")
        || ekor.ends_with("<|D")
        || ekor.ends_with("<|")
        || ekor.ends_with("<")
}

pub fn mengandung_tool_call(teks: &str) -> bool {
    let teks = normalisasi_penanda(teks);
    let teks: &str = &teks;
    teks.contains("invoke") && teks.contains("name=") && teks.contains('<')
        && (teks.contains("DSML")
            || teks.contains("<tool_call")
            || teks.contains("<function_call")
            || teks.contains("antml:invoke")
            || teks.contains("<invoke"))
}

pub fn bersihkan_teks(teks: &str) -> String {
    if !mengandung_tool_call(teks) {
        return teks.to_string();
    }
    // Work on the folded copy, so the caller gets ASCII back - which is what the
    // reply should have contained in the first place.
    let teks = normalisasi_penanda(teks);
    let teks: &str = &teks;

    /*
     * Two shapes reach this point.
     *
     * The XML one has an angle bracket to anchor on: `<|DSML| invoke ...>`.
     * The other does not - the model writes `||DSML|| invoke ...>` with no
     * opening bracket at all, and a scanner that only looks for `<` walks
     * straight past it. That is exactly how the raw markup ended up in the
     * reply: every helper here was keyed on `<`, and the text the model
     * actually produced had none.
     *
     * So the scan looks for the earliest of either anchor.
     */
    let mut hasil = String::new();
    let mut pos = 0usize;
    while pos < teks.len() {
        let sisa = &teks[pos..];
        let angle = sisa.find('<');
        let mark = sisa.find("|DSML|");
        let anchor = match (angle, mark) {
            (Some(a), Some(m)) => a.min(m),
            (Some(a), None) => a,
            (None, Some(m)) => m,
            (None, None) => {
                hasil.push_str(sisa);
                break;
            }
        };
        let abs = pos + anchor;
        hasil.push_str(&teks[pos..abs]);

        // An angle bracket can open a real invoke block; the bare marker cannot,
        // because there is no tag to read attributes from - it is dropped whole.
        if angle == Some(anchor) {
            if let Some((_, _, setelah)) = baca_invoke(teks, abs) {
                pos = setelah;
                continue;
            }
        }
        match teks[abs..].find('>') {
            Some(gt) => pos = abs + gt + 1,
            None => break,
        }
    }
    hasil.trim().to_string()
}

pub fn parse_teks(teks: &str) -> Vec<ToolCall> {
    let teks = normalisasi_penanda(teks);
    let teks: &str = &teks;
    if !mengandung_tool_call(teks) {
        return Vec::new();
    }
    let mut hasil = Vec::new();
    let mut pos = 0usize;
    /*
     * The tag may or may not carry an opening angle bracket.
     *
     * `<|DSML| invoke name="...">` is the documented shape, but a model that
     * already emitted the fullwidth bar tends to drop the `<` as well and
     * writes `|DSML| invoke name="...">`. `baca_invoke` anchors on `<`, so it
     * walked past those and returned nothing — the reply still had the raw
     * markup and no tool ever ran.
     *
     * This loop finds whichever anchor comes first and hands the reader a
     * position that it can work from.
     */
    loop {
        let sisa = &teks[pos..];
        let angle = sisa.find('<');
        let mark = sisa.find("|DSML| invoke");
        let anchor = match (angle, mark) {
            (Some(a), Some(m)) => a.min(m),
            (Some(a), None) => a,
            (None, Some(m)) => m,
            (None, None) => break,
        };
        let abs = pos + anchor;
        let Some((nama, args, setelah)) = baca_invoke(teks, abs) else {
            // Nothing readable here; step past this anchor and keep looking.
            match teks[abs..].find('>') {
                Some(gt) => pos = abs + gt + 1,
                None => break,
            }
            continue;
        };
        let idx = hasil.len();
        hasil.push(ToolCall {
            id: format!("xml-{idx}-{nama}"),
            name: nama,
            args,
        });
        if setelah <= pos {
            break;
        }
        pos = setelah;
    }
    hasil
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dsml_diparse() {
        let t = "Saya cek dulu.\n\n<|DSML| calls>\n<|DSML| invoke name=\"fs_read\">\n<|DSML| parameter name=\"path\" string=\"true\">src/main.rs</|DSML| parameter>\n</|DSML| invoke>\n</|DSML| calls>";
        let calls = parse_teks(t);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "fs_read");
        assert_eq!(calls[0].args["path"], json!("src/main.rs"));
        assert_eq!(bersihkan_teks(t), "Saya cek dulu.");
    }

    #[test]
    fn tool_calls_biasa_diparse() {
        let t = "<tool_calls><invoke name=\"fs_list\"><parameter name=\"path\">.</parameter></invoke></tool_calls>";
        let calls = parse_teks(t);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "fs_list");
        assert_eq!(calls[0].args["path"], json!("."));
    }

    #[test]
    fn antml_diparse() {
        let t = "<antml:invoke name=\"terminal_run\"><antml:parameter name=\"cmd\">ls -la</antml:parameter></antml:invoke>";
        let calls = parse_teks(t);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "terminal_run");
        assert_eq!(calls[0].args["cmd"], json!("ls -la"));
    }

    #[test]
    fn dua_invoke_sekaligus() {
        let t = "<|DSML| calls><|DSML| invoke name=\"a\"><|DSML| parameter name=\"x\">1</|DSML| parameter></|DSML| invoke><|DSML| invoke name=\"b\"><|DSML| parameter name=\"y\">true</|DSML| parameter></|DSML| invoke></|DSML| calls>";
        let calls = parse_teks(t);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "a");
        assert_eq!(calls[0].args["x"], json!(1));
        assert_eq!(calls[1].name, "b");
        assert_eq!(calls[1].args["y"], json!(true));
    }

    #[test]
    fn angka_dan_objek_jadi_json() {
        let t = "<invoke name=\"f\"><parameter name=\"n\">42</parameter><parameter name=\"o\">{\"a\":1}</parameter></invoke>";
        let calls = parse_teks(t);
        assert_eq!(calls[0].args["n"], json!(42));
        assert_eq!(calls[0].args["o"], json!({"a": 1}));
    }

    #[test]
    fn teks_biasa_tidak_berubah() {
        let t = "Halo, ini jawaban biasa tanpa tool.";
        assert!(parse_teks(t).is_empty());
        assert_eq!(bersihkan_teks(t), t);
    }

    #[test]
    fn tag_palsu_tanpa_invoke_diabaikan() {
        let t = "Gunakan <invoke> di kode Anda, tapi ini cuma contoh.";
        assert!(parse_teks(t).is_empty());
    }

    #[test]
    fn dsml_lebar_dipulihkan() {
        // What the user actually saw: the fullwidth vertical line, not ASCII.
        // Codepoints: U+FF5C around DSML, U+FF1C/U+FF1E for the tag brackets.
        let t = "Saya cek dulu.\n\n\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} calls>\n\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} invoke name=\"file_list\">\n\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} parameter name=\"path\" string=\"true\">.</\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} parameter>\n</\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} invoke>\n</\u{FF5C}\u{FF5C}DSML\u{FF5C}\u{FF5C} calls>";
        let bersih = bersihkan_teks(t);
        assert!(
            !bersih.contains("DSML") && !bersih.contains('\u{FF5C}'),
            "tag lebar harus ikut terhapus, dapat: {bersih:?}"
        );
        assert!(bersih.contains("Saya cek dulu."));

        let calls = parse_teks(t);
        assert_eq!(calls.len(), 1, "tool call dari tag lebar harus terbaca");
        assert_eq!(calls[0].name, "file_list");
        assert_eq!(calls[0].args["path"], json!("."));
    }

    #[test]
    #[test]
    fn awal_tag_terdeteksi_di_ekor() {
        /* A complete tag is the easy case. */
        assert!(mungkin_awal_tag("Halo <|DSML|"));
        /* The partial forms a stream actually stops on, byte by byte. */
        assert!(mungkin_awal_tag("<"));
        assert!(mungkin_awal_tag("<|"));
        assert!(mungkin_awal_tag("<|DSM"));
        assert!(mungkin_awal_tag("<|DSML|"));
        assert!(mungkin_awal_tag("||DSML||"));
        /* Prose that merely ends in punctuation must NOT be held back. */
        assert!(!mungkin_awal_tag("Hasilnya 2 < 3"));
        assert!(!mungkin_awal_tag("selesai."));
        assert!(!mungkin_awal_tag("pakai tag html <div> ya"));
    }

    #[test]
    fn awal_tag_lebar_juga_terdeteksi() {
        /* The fullwidth form has to survive the same check, or a model that
           emits it gets its markup streamed raw. */
        let lebar = normalisasi_penanda("\u{FF1C}\u{FF5C}DSML\u{FF5C}");
        assert!(mungkin_awal_tag(&lebar));
    }

    #[test]
    fn dsml_gaya_screenshot_tertangkap() {
        /* The exact shape that leaked into a reply: a doubled ASCII bar, and
           the closing tags written as `</` followed by the marker. */
        let t = "Let me check what's available first.\n\n<||DSML|| calls>\n<||DSML|| invoke name=\"file_list\">\n<||DSML|| parameter name=\"path\" string=\"true\">D:/Zephyr</||DSML|| parameter>\n</||DSML|| invoke>\n</||DSML|| calls>";
        let calls = parse_teks(t);
        assert_eq!(calls.len(), 1, "harus satu tool call");
        assert_eq!(calls[0].name, "file_list");
        /* And the markup must be gone from the text the user reads. */
        let bersih = bersihkan_teks(t);
        assert!(!bersih.contains("DSML"), "markup bocor: {bersih}");
        assert!(bersih.contains("Let me check"), "prosa hilang: {bersih}");
    }

    fn normalisasi_penanda_hanya_menyentuh_lebar() {
        // ASCII must pass through untouched and stay borrowed, not copied.
        let ascii = "biasa <|DSML| invoke name=\"x\">";
        assert!(matches!(
            normalisasi_penanda(ascii),
            std::borrow::Cow::Borrowed(_)
        ));
        assert_eq!(normalisasi_penanda(ascii), ascii);
    }
}
