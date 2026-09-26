use crate::ai::ToolCall;
use serde_json::{json, Value};

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
    let lt = sisa.find('<')?;

    let gt_rel = sisa[lt..].find('>')?;
    let tag_buka = &sisa[lt..lt + gt_rel];
    let nama_tag = tag_name_bersih(tag_buka.trim_start_matches('<'));
    if nama_tag != "invoke" {
        return baca_invoke(teks, dari + lt + gt_rel + 1);
    }
    let nama_tool = atribut(tag_buka, "name")?;
    let isi_mulai = dari + lt + gt_rel + 1;

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
    let lt = sisa.find('<')?;
    let gt_rel = sisa[lt..].find('>')?;
    let tag_buka = &sisa[lt..lt + gt_rel];
    let nama_tag = tag_name_bersih(tag_buka.trim_start_matches('<'));
    if nama_tag != "parameter" {
        return baca_parameter(isi, dari + lt + gt_rel + 1);
    }
    let nama = atribut(tag_buka, "name")?;
    let isi_mulai = dari + lt + gt_rel + 1;
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

pub fn mengandung_tool_call(teks: &str) -> bool {
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
    let mut hasil = String::new();
    let mut pos = 0usize;
    while pos < teks.len() {
        match teks[pos..].find('<') {
            None => {
                hasil.push_str(&teks[pos..]);
                break;
            }
            Some(rel) => {
                let abs = pos + rel;
                hasil.push_str(&teks[pos..abs]);
                if let Some((_, _, setelah)) = baca_invoke(teks, abs) {
                    pos = setelah;
                } else if let Some(gt) = teks[abs..].find('>') {
                    pos = abs + gt + 1;
                } else {
                    hasil.push_str(&teks[abs..]);
                    break;
                }
            }
        }
    }
    hasil.trim().to_string()
}

pub fn parse_teks(teks: &str) -> Vec<ToolCall> {
    if !mengandung_tool_call(teks) {
        return Vec::new();
    }
    let mut hasil = Vec::new();
    let mut pos = 0usize;
    while let Some((nama, args, setelah)) = baca_invoke(teks, pos) {
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
}
