// snippets.rs — sumber snippet: bawaan, user, dan kontribusi ekstensi (fase 30).
//
// ══════════════════ KEPUTUSAN ARSITEKTUR ══════════════════
//
// 1. Rust hanya MEMUAT dan MENGGABUNG snippet. Ekspansi (placeholder, tab stop,
//    variabel) dikerjakan frontend karena ia butuh keadaan editor: teks yang
//    diseleksi, baris kursor, clipboard. Kalau Rust yang mengekspansi, ia harus
//    diberi salinan keadaan editor tiap pemanggilan — dan salinan itu pasti
//    basi begitu user menggeser kursor.
//
// 2. Format file user = format VS Code apa adanya:
//      { "Nama Snippet": { "prefix": "log", "body": [...], "description": "..." } }
//    Bukan format sendiri. Alasannya praktis: snippet yang beredar di internet
//    bisa ditempel langsung, dan itu satu-satunya alasan orang memakai format
//    yang kompatibel.
//
// 3. `body` boleh STRING atau ARRAY of string. VS Code menerima keduanya, dan
//    menolak salah satunya berarti menolak file yang sah.
//
// 4. Urutan prioritas saat prefix bertabrakan: user > ekstensi > bawaan.
//    Yang ditulis user sendiri harus menang — kalau bawaan menang, user tidak
//    punya cara menimpanya selain mengedit binary.
//
// 5. Snippet ekstensi dibaca dari manifest `contributes.snippets`, dan itu
//    MEMBACA FILE JSON, bukan menjalankan kode. Konsisten dengan keputusan
//    fase 19 (ekstensi manifest-only).

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Satu snippet siap dipakai frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    /// nama entri di file JSON (dipakai sebagai label bila prefix kosong)
    pub name: String,
    /// yang diketik user untuk memunculkannya
    pub prefix: String,
    /// body dalam bentuk SATU string (array sudah digabung dengan '\n')
    pub body: String,
    pub description: String,
    /// bahasa: 'javascript', 'rust', … atau 'global'
    pub lang: String,
    /// asal: 'builtin' | 'user' | 'ext:<id>'
    pub sumber: String,
}

/// Hasil pemuatan untuk satu bahasa.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetSet {
    pub lang: String,
    pub snippets: Vec<Snippet>,
    /// path file user untuk bahasa ini (ada atau belum)
    pub user_path: String,
    pub user_ada: bool,
    /// file yang gagal diparse, dengan alasannya — dilaporkan, tidak didiamkan
    pub rusak: Vec<FileRusak>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRusak {
    pub path: String,
    pub alasan: String,
}

// ───────────────────────── snippet bawaan ─────────────────────────

/// Snippet bawaan: (lang, name, prefix, body, description).
///
/// Sengaja sedikit dan generik. Ini contoh konsep + isi awal supaya fitur
/// terasa hidup sebelum user menulis snippet sendiri, bukan usaha menyaingi
/// paket snippet komunitas.
const BAWAAN: &[(&str, &str, &str, &str, &str)] = &[
    // ── JavaScript / TypeScript ──
    (
        "javascript",
        "Console log",
        "log",
        "console.log(${1:pesan});",
        "console.log dengan satu argumen",
    ),
    (
        "javascript",
        "Function declaration",
        "fn",
        "function ${1:nama}(${2:args}) {\n\t${0}\n}",
        "deklarasi function",
    ),
    (
        "javascript",
        "Arrow function",
        "af",
        "const ${1:nama} = (${2:args}) => {\n\t${0}\n};",
        "arrow function",
    ),
    (
        "javascript",
        "For of loop",
        "forof",
        "for (const ${1:item} of ${2:daftar}) {\n\t${0}\n}",
        "iterasi for..of",
    ),
    (
        "javascript",
        "Try / catch",
        "try",
        "try {\n\t${1}\n} catch (${2:e}) {\n\t${0}\n}",
        "blok try/catch",
    ),
    (
        "typescript",
        "Interface",
        "iface",
        "interface ${1:Nama} {\n\t${0}\n}",
        "deklarasi interface",
    ),
    (
        "typescript",
        "Type alias",
        "typ",
        "type ${1:Nama} = ${0};",
        "type alias",
    ),
    // ── React ──
    (
        "tsx",
        "Function component",
        "fc",
        "export default function ${1:Komponen}() {\n\treturn (\n\t\t<div>${0}</div>\n\t);\n}",
        "komponen React",
    ),
    (
        "tsx",
        "useState",
        "us",
        "const [${1:nilai}, set${2:Nilai}] = useState(${3:null});",
        "hook useState",
    ),
    // ── Rust ──
    (
        "rust",
        "Println",
        "pl",
        "println!(\"${1}\");",
        "println! macro",
    ),
    (
        "rust",
        "Function",
        "fn",
        "fn ${1:nama}(${2}) ${3:-> ()} {\n\t${0}\n}",
        "deklarasi fn",
    ),
    (
        "rust",
        "Test module",
        "tmod",
        "#[cfg(test)]\nmod tests {\n\tuse super::*;\n\n\t#[test]\n\tfn ${1:nama}() {\n\t\t${0}\n\t}\n}",
        "modul uji",
    ),
    (
        "rust",
        "Derive Debug Clone",
        "der",
        "#[derive(Debug, Clone)]",
        "atribut derive umum",
    ),
    // ── Python ──
    (
        "python",
        "Main guard",
        "main",
        "if __name__ == \"__main__\":\n\t${0}",
        "entry point",
    ),
    (
        "python",
        "Function",
        "def",
        "def ${1:nama}(${2}):\n\t${0}",
        "deklarasi def",
    ),
    // ── HTML / CSS ──
    (
        "html",
        "HTML5 skeleton",
        "html5",
        "<!DOCTYPE html>\n<html lang=\"${1:id}\">\n<head>\n\t<meta charset=\"utf-8\">\n\t<title>${2:Judul}</title>\n</head>\n<body>\n\t${0}\n</body>\n</html>",
        "kerangka dokumen HTML",
    ),
    (
        "css",
        "Flex center",
        "flexc",
        "display: flex;\nalign-items: center;\njustify-content: center;",
        "flexbox rata tengah",
    ),
    // ── global (semua bahasa) ──
    (
        "global",
        "TODO",
        "todo",
        "TODO(${1:${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}}): ${0}",
        "penanda TODO bertanggal",
    ),
    (
        "global",
        "Bungkus seleksi",
        "wrap",
        "${1:(}${TM_SELECTED_TEXT}${2:)}",
        "bungkus teks yang diseleksi",
    ),
];

/// Bahasa yang mewarisi snippet dari bahasa lain.
///
/// Nama bahasa memakai `LangId` FRONTEND (`tsx`, `jsx`), bukan nama VS Code
/// (`typescriptreact`). Alasannya: `detectLang()` di `src/lib/lang.ts` yang
/// menentukan bahasa sebuah tab, dan dialah yang memanggil `snippets_load`.
/// Memakai dua kosakata berarti snippet tsx tidak akan pernah cocok.
///
/// TypeScript adalah superset JavaScript, jadi snippet JS berguna di TS. Ini
/// perilaku VS Code juga. Tanpa ini user harus menyalin snippet yang sama dua
/// kali.
fn induk_bahasa(lang: &str) -> Vec<&'static str> {
    match lang {
        "typescript" => vec!["javascript"],
        "jsx" => vec!["javascript"],
        "tsx" => vec!["typescript", "javascript"],
        _ => vec![],
    }
}

// ───────────────────────── file user ─────────────────────────

fn dir_snippet(state: &AppState) -> PathBuf {
    state.data_dir.join("snippets")
}

/// Path file snippet user untuk sebuah bahasa.
///
/// Nama file dibersihkan: `lang` berasal dari deteksi bahasa dan tidak boleh
/// dipakai menjelajah folder lain.
pub fn path_user(state: &AppState, lang: &str) -> PathBuf {
    let bersih: String = lang
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(48)
        .collect();
    let nama = if bersih.is_empty() {
        "global".to_string()
    } else {
        bersih
    };
    dir_snippet(state).join(format!("{nama}.json"))
}

/// Parse satu file snippet format VS Code.
///
/// Mengembalikan (snippets, alasan_rusak). File rusak TIDAK dianggap kosong
/// secara diam-diam: alasannya dikembalikan supaya UI bisa memberitahu.
fn parse_file(teks: &str, lang: &str, sumber: &str) -> (Vec<Snippet>, Option<String>) {
    // JSONC: file snippet VS Code lazim memuat komentar.
    let bersih = crate::tasks::buang_komentar(teks);
    let v: Value = match serde_json::from_str(&bersih) {
        Ok(v) => v,
        Err(e) => return (Vec::new(), Some(format!("JSON tidak valid: {e}"))),
    };
    let Value::Object(map) = v else {
        return (
            Vec::new(),
            Some("isi file harus object { \"Nama\": { prefix, body } }".into()),
        );
    };

    let mut out = Vec::new();
    let mut lewat = 0usize;
    for (nama, entri) in map {
        let Some(obj) = entri.as_object() else {
            lewat += 1;
            continue;
        };

        // `body` boleh string ATAU array of string — VS Code menerima keduanya.
        let body = match obj.get("body") {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Array(arr)) => arr
                .iter()
                .map(|x| x.as_str().unwrap_or_default().to_string())
                .collect::<Vec<_>>()
                .join("\n"),
            _ => {
                lewat += 1;
                continue;
            }
        };
        if body.is_empty() {
            lewat += 1;
            continue;
        }

        // `prefix` boleh string atau array (VS Code mengizinkan beberapa
        // prefix untuk satu snippet). Tiap prefix jadi entri sendiri supaya
        // pencocokan completion tetap sederhana.
        let prefixes: Vec<String> = match obj.get("prefix") {
            Some(Value::String(s)) => vec![s.clone()],
            Some(Value::Array(arr)) => arr
                .iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect(),
            // Tanpa prefix: nama entri dipakai. Snippet begitu masih berguna
            // lewat "Insert Snippet" di palette.
            _ => vec![nama.clone()],
        };

        let desc = match obj.get("description") {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Array(arr)) => arr
                .iter()
                .filter_map(|x| x.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            _ => String::new(),
        };

        for p in prefixes {
            if p.trim().is_empty() {
                continue;
            }
            out.push(Snippet {
                name: nama.clone(),
                prefix: p,
                body: body.clone(),
                description: desc.clone(),
                lang: lang.to_string(),
                sumber: sumber.to_string(),
            });
        }
    }

    let catatan = if lewat > 0 {
        Some(format!("{lewat} entri dilewati (body/prefix tidak sah)"))
    } else {
        None
    };
    (out, catatan)
}

/// Baca file snippet user untuk sebuah bahasa.
fn muat_user(state: &AppState, lang: &str, rusak: &mut Vec<FileRusak>) -> Vec<Snippet> {
    let p = path_user(state, lang);
    let Ok(teks) = std::fs::read_to_string(&p) else {
        return Vec::new();
    };
    let (s, err) = parse_file(&teks, lang, "user");
    if let Some(a) = err {
        rusak.push(FileRusak {
            path: p.to_string_lossy().replace('\\', "/"),
            alasan: a,
        });
    }
    s
}

/// Baca `contributes.snippets` dari semua ekstensi yang AKTIF.
///
/// Bentuk manifest (sama VS Code):
///   "contributes": { "snippets": [{ "language": "rust", "path": "./s.json" }] }
fn muat_ekstensi(state: &AppState, lang: &str, rusak: &mut Vec<FileRusak>) -> Vec<Snippet> {
    let mut out = Vec::new();
    for info in crate::extensions::list_all(state) {
        if !info.enabled || info.builtin || info.path.is_empty() {
            continue;
        }
        let dir = PathBuf::from(&info.path);
        let manifest_path = dir.join("package.json");
        let Ok(teks) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<Value>(&crate::tasks::buang_komentar(&teks))
        else {
            continue;
        };
        let arr = manifest
            .get("contributes")
            .and_then(|c| c.get("snippets"))
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        for entri in arr {
            let bahasa = entri
                .get("language")
                .and_then(|x| x.as_str())
                .unwrap_or_default();
            if bahasa != lang {
                continue;
            }
            let rel = entri
                .get("path")
                .and_then(|x| x.as_str())
                .unwrap_or_default();
            if rel.is_empty() {
                continue;
            }
            // Path relatif TERHADAP FOLDER EKSTENSI, dan tidak boleh keluar
            // dari situ: manifest datang dari pihak ketiga.
            let target = dir.join(rel.trim_start_matches("./"));
            let target_kanonik = crate::paths::canonical_or_parent(&target);
            let dir_kanonik = crate::paths::canonical_or_parent(&dir);
            if !crate::paths::is_inside(&dir_kanonik, &target_kanonik) {
                rusak.push(FileRusak {
                    path: rel.to_string(),
                    alasan: format!(
                        "ekstensi {} menunjuk snippet di luar foldernya — ditolak",
                        info.id
                    ),
                });
                continue;
            }

            let Ok(isi) = std::fs::read_to_string(&target) else {
                rusak.push(FileRusak {
                    path: target.to_string_lossy().replace('\\', "/"),
                    alasan: format!("file snippet ekstensi {} tidak terbaca", info.id),
                });
                continue;
            };
            let (s, err) = parse_file(&isi, lang, &format!("ext:{}", info.id));
            if let Some(a) = err {
                rusak.push(FileRusak {
                    path: target.to_string_lossy().replace('\\', "/"),
                    alasan: a,
                });
            }
            out.extend(s);
        }
    }
    out
}

fn bawaan_untuk(lang: &str) -> Vec<Snippet> {
    BAWAAN
        .iter()
        .filter(|(l, ..)| *l == lang)
        .map(|(l, nama, prefix, body, desc)| Snippet {
            name: (*nama).to_string(),
            prefix: (*prefix).to_string(),
            body: (*body).to_string(),
            description: (*desc).to_string(),
            lang: (*l).to_string(),
            sumber: "builtin".to_string(),
        })
        .collect()
}

/// Gabungkan semua sumber untuk satu bahasa, dengan prioritas user > ext > bawaan.
fn kumpulkan(state: &AppState, lang: &str, rusak: &mut Vec<FileRusak>) -> Vec<Snippet> {
    // Bahasa yang diminta + induknya + global.
    let mut bahasa: Vec<String> = vec![lang.to_string()];
    for i in induk_bahasa(lang) {
        bahasa.push(i.to_string());
    }
    if lang != "global" {
        bahasa.push("global".to_string());
    }

    let mut hasil: Vec<Snippet> = Vec::new();
    // Urutan penyisipan menentukan siapa yang menang: yang MASUK DULU menang,
    // karena dedup di bawah menyimpan kemunculan pertama.
    for b in &bahasa {
        hasil.extend(muat_user(state, b, rusak));
    }
    for b in &bahasa {
        hasil.extend(muat_ekstensi(state, b, rusak));
    }
    for b in &bahasa {
        hasil.extend(bawaan_untuk(b));
    }

    // Dedup per (prefix, bahasa-efektif): prefix yang sama dari sumber
    // berprioritas lebih rendah dibuang.
    let mut terlihat: HashMap<String, ()> = HashMap::new();
    let mut out = Vec::new();
    for s in hasil {
        let kunci = s.prefix.to_lowercase();
        if terlihat.contains_key(&kunci) {
            continue;
        }
        terlihat.insert(kunci, ());
        out.push(s);
    }
    out
}

// ───────────────────────── command ─────────────────────────

/// Muat snippet untuk sebuah bahasa (termasuk induk + global).
#[tauri::command(async)]
pub fn snippets_load(state: State<AppState>, lang: String) -> ZResult<SnippetSet> {
    let l = if lang.trim().is_empty() {
        "global".to_string()
    } else {
        lang.trim().to_lowercase()
    };
    let mut rusak = Vec::new();
    let snippets = kumpulkan(&state, &l, &mut rusak);
    let up = path_user(&state, &l);
    Ok(SnippetSet {
        lang: l,
        snippets,
        user_ada: up.exists(),
        user_path: up.to_string_lossy().replace('\\', "/"),
        rusak,
    })
}

/// Path file snippet user untuk sebuah bahasa; dibuat bila belum ada.
///
/// Command "Configure User Snippets" memakai ini: membuka file yang belum ada
/// akan menampilkan editor kosong tanpa petunjuk, jadi file dibuat berisi
/// TEMPLATE berkomentar.
#[tauri::command(async)]
pub fn snippets_user_file(state: State<AppState>, lang: String) -> ZResult<String> {
    let l = if lang.trim().is_empty() {
        "global".to_string()
    } else {
        lang.trim().to_lowercase()
    };
    let dir = dir_snippet(&state);
    std::fs::create_dir_all(&dir)
        .map_err(|e| ZephyrError::Io(format!("gagal membuat folder snippets: {e}")))?;
    let p = path_user(&state, &l);
    if !p.exists() {
        let contoh = format!(
            "{{\n\
             \x20 // Snippet user untuk bahasa: {l}\n\
             \x20 // Format sama dengan VS Code, jadi snippet dari internet bisa ditempel di sini.\n\
             \x20 //\n\
             \x20 // \"$1\", \"${{1:default}}\"  = tab stop (Tab / Shift+Tab untuk pindah)\n\
             \x20 // \"${{1|a,b,c|}}\"        = pilihan\n\
             \x20 // \"$0\"                  = posisi kursor terakhir\n\
             \x20 // Variabel: $TM_SELECTED_TEXT $TM_FILENAME $CLIPBOARD $CURRENT_YEAR $LINE_NUMBER\n\
             \x20 \"Contoh\": {{\n\
             \x20   \"prefix\": \"contoh\",\n\
             \x20   \"body\": [\"// {l}: ${{1:tulis di sini}}\", \"$0\"],\n\
             \x20   \"description\": \"Snippet contoh — silakan diubah atau dihapus\"\n\
             \x20 }}\n\
             }}\n"
        );
        std::fs::write(&p, contoh)
            .map_err(|e| ZephyrError::Io(format!("gagal menulis {}: {e}", p.display())))?;
        // File baru ada di %APPDATA%, di luar workspace — harus di-whitelist
        // supaya `fs_write` dari editor tidak ditolak penjaga path fase 14.
        state.allow(&p);
    } else {
        state.allow(&p);
    }
    Ok(p.to_string_lossy().replace('\\', "/"))
}

/// Daftar bahasa yang punya file snippet user (untuk UI "Configure").
#[tauri::command(async)]
pub fn snippets_user_list(state: State<AppState>) -> ZResult<Vec<String>> {
    let dir = dir_snippet(&state);
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("json") {
                if let Some(stem) = p.file_stem().and_then(|x| x.to_str()) {
                    out.push(stem.to_string());
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Daftar bahasa yang punya snippet BAWAAN (untuk UI).
#[tauri::command(async)]
pub fn snippets_builtin_langs() -> Vec<String> {
    let mut v: Vec<String> = BAWAAN.iter().map(|(l, ..)| (*l).to_string()).collect();
    v.sort();
    v.dedup();
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_string_dan_array_sama_hasilnya() {
        let (a, _) = parse_file(
            r#"{ "X": { "prefix": "x", "body": "satu\ndua" } }"#,
            "js",
            "user",
        );
        let (b, _) = parse_file(
            r#"{ "X": { "prefix": "x", "body": ["satu", "dua"] } }"#,
            "js",
            "user",
        );
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].body, "satu\ndua");
        assert_eq!(a[0].body, b[0].body);
    }

    #[test]
    fn prefix_array_jadi_beberapa_entri() {
        let (s, _) = parse_file(
            r#"{ "X": { "prefix": ["a", "b"], "body": "isi" } }"#,
            "js",
            "user",
        );
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].prefix, "a");
        assert_eq!(s[1].prefix, "b");
        // Nama entri tetap sama untuk keduanya.
        assert_eq!(s[0].name, "X");
        assert_eq!(s[1].name, "X");
    }

    #[test]
    fn tanpa_prefix_pakai_nama_entri() {
        let (s, _) = parse_file(r#"{ "Nama Panjang": { "body": "isi" } }"#, "js", "user");
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].prefix, "Nama Panjang");
    }

    #[test]
    fn komentar_json_diterima() {
        let (s, err) = parse_file(
            "{\n // komentar\n \"X\": { \"prefix\": \"x\", \"body\": \"isi\" }\n}",
            "js",
            "user",
        );
        assert!(
            err.is_none(),
            "komentar tidak boleh dianggap rusak: {err:?}"
        );
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn json_rusak_melaporkan_alasan_bukan_kosong_diam_diam() {
        let (s, err) = parse_file("{ ini bukan json", "js", "user");
        assert!(s.is_empty());
        let a = err.expect("harus ada alasan");
        assert!(a.contains("JSON tidak valid"), "alasan: {a}");
    }

    #[test]
    fn entri_tanpa_body_dilewati_dan_dicatat() {
        let (s, err) = parse_file(
            r#"{ "A": { "prefix": "a" }, "B": { "prefix": "b", "body": "ok" } }"#,
            "js",
            "user",
        );
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].prefix, "b");
        assert!(err.unwrap().contains("dilewati"));
    }

    #[test]
    fn typescript_mewarisi_javascript_dan_global() {
        let induk = induk_bahasa("typescript");
        assert!(induk.contains(&"javascript"));
        // tsx mewarisi keduanya.
        let tsx = induk_bahasa("tsx");
        assert!(tsx.contains(&"javascript") && tsx.contains(&"typescript"));
        // Bahasa biasa tidak mewarisi apa pun.
        assert!(induk_bahasa("rust").is_empty());
    }

    #[test]
    fn bawaan_punya_isi_untuk_bahasa_populer() {
        for l in [
            "javascript",
            "typescript",
            "rust",
            "python",
            "html",
            "tsx",
            "global",
        ] {
            assert!(
                !bawaan_untuk(l).is_empty(),
                "bahasa {l} harus punya snippet bawaan"
            );
        }
    }

    #[test]
    fn setiap_snippet_bawaan_punya_prefix_dan_body() {
        for (lang, nama, prefix, body, _) in BAWAAN {
            assert!(!prefix.trim().is_empty(), "{lang}/{nama} prefix kosong");
            assert!(!body.trim().is_empty(), "{lang}/{nama} body kosong");
        }
    }

    #[test]
    fn prefix_bawaan_unik_per_bahasa() {
        // Prefix ganda dalam satu bahasa berarti salah satu tidak akan pernah
        // muncul (dedup memilih yang pertama) — itu bug yang sulit dilihat.
        let mut pasangan: Vec<(String, String)> = BAWAAN
            .iter()
            .map(|(l, _, p, ..)| (l.to_string(), p.to_lowercase()))
            .collect();
        let sebelum = pasangan.len();
        pasangan.sort();
        pasangan.dedup();
        assert_eq!(sebelum, pasangan.len(), "ada prefix bawaan yang ganda");
    }
}
