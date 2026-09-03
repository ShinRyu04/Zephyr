// ext_bundled.rs — paket ekstensi BUNDLED fase 19.3.
//
// Kenapa isinya ditulis di Rust, bukan file di folder resource: paketnya harus
// bisa dipasang OFFLINE dan tetap ada setelah app di-install lewat MSI/NSIS
// tanpa menambah aturan bundling baru. `include_str!` akan memaksa file dummy
// masuk repo; string di sini lebih jujur — ini memang contoh kecil.
//
// `extensions_write_bundled` menulis satu paket ke
// %APPDATA%\zephyr\extensions\.bundled\<id>\ lalu mengembalikan path-nya.
// Frontend kemudian memanggil `extensions_install` dengan path itu, jadi jalur
// pemasangannya SAMA dengan paket pihak ketiga — tidak ada pintu belakang.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use tauri::State;

/// (id, nama file, isi) — file pertama selalu `zephyr-extension.json`.
type Paket = (&'static str, &'static [(&'static str, &'static str)]);

const TEMA_SENJA: &str = r##"{
  "id": "zephyr.tema-senja",
  "name": "Tema Senja",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Tema gelap hangat: latar cokelat-ungu, aksen jingga senja.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Themes"],
  "contributes": {
    "themes": [{ "label": "Senja", "kind": "dark", "path": "./themes/senja.json" }]
  }
}"##;

const TEMA_SENJA_JSON: &str = r##"{
  "colors": {
    "--bg0": "#1a1418",
    "--bg1": "#221a20",
    "--bg2": "#2b2128",
    "--bg3": "#372a31",
    "--fg0": "#f5e6dc",
    "--fg1": "#d8c3b6",
    "--fg2": "#a58d80",
    "--accent": "#ff8c42",
    "--border": "#3d2f37",
    "--surface": "#221a20",
    "--surface-2": "#2b2128",
    "--surface-3": "#372a31",
    "--text": "#f5e6dc",
    "--text-secondary": "#d8c3b6",
    "--text-muted": "#a58d80",
    "--danger": "#f0625d",
    "--warning": "#e8a33d",
    "--syntax-comment": "#7d6a63",
    "--syntax-keyword": "#ff8c42",
    "--syntax-string": "#c3d17a",
    "--syntax-number": "#e8a33d",
    "--syntax-function": "#7ec9d1"
  }
}"##;

const TEMA_KERTAS: &str = r##"{
  "id": "zephyr.tema-kertas",
  "name": "Tema Kertas",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Tema terang kontras rendah, cocok untuk siang di ruang terbuka.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Themes"],
  "contributes": {
    "themes": [{ "label": "Kertas", "kind": "light", "path": "./themes/kertas.json" }]
  }
}"##;

const TEMA_KERTAS_JSON: &str = r##"{
  "colors": {
    "--bg0": "#faf7f0",
    "--bg1": "#f3efe5",
    "--bg2": "#eae5d8",
    "--bg3": "#ded8c8",
    "--fg0": "#2e2a24",
    "--fg1": "#4a453c",
    "--fg2": "#6f6759",
    "--accent": "#a2662f",
    "--border": "#d8d1c0",
    "--surface": "#f3efe5",
    "--surface-2": "#eae5d8",
    "--surface-3": "#ded8c8",
    "--text": "#2e2a24",
    "--text-secondary": "#4a453c",
    "--text-muted": "#6f6759",
    "--danger": "#b3352f",
    "--warning": "#9a6b12",
    "--terminal-ansi-0": "#2e2a24",
    "--syntax-comment": "#8b8272",
    "--syntax-keyword": "#8a3fa0",
    "--syntax-string": "#4f7a28",
    "--syntax-number": "#a2662f",
    "--syntax-function": "#2f6ba2"
  }
}"##;

const KEYMAP_SUBLIME: &str = r##"{
  "id": "zephyr.keymap-sublime",
  "name": "Keymap ala Sublime",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Chord familiar Sublime Text.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Keymaps"],
  "contributes": {
    "keymaps": [{ "label": "Sublime", "path": "./keymaps/sublime.json" }]
  }
}"##;

const KEYMAP_SUBLIME_JSON: &str = r##"[
  { "key": "Ctrl+Shift+D", "command": "editor.copyLineDown" },
  { "key": "Ctrl+Shift+Up", "command": "editor.moveLineUp" },
  { "key": "Ctrl+Shift+Down", "command": "editor.moveLineDown" },
  { "key": "Ctrl+K Ctrl+B", "command": "workbench.action.toggleSidebar" },
  { "key": "Alt+Shift+2", "command": "editor.splitRight" }
]"##;

const SNIPPET_PY: &str = r##"{
  "id": "zephyr.snippet-python",
  "name": "Snippet Python",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "main guard, def, class, try/except, comprehension, pytest.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [{ "language": "python", "path": "./snippets/python.json" }]
  }
}"##;

const SNIPPET_PY_JSON: &str = r##"{
  "main guard": {
    "prefix": "ifmain",
    "body": ["if __name__ == \"__main__\":", "\t${1:main()}"],
    "description": "blok main Python"
  },
  "fungsi": {
    "prefix": "def",
    "body": ["def ${1:nama}(${2:args}) -> ${3:None}:", "\t${4:pass}"],
    "description": "definisi fungsi dengan anotasi"
  },
  "kelas": {
    "prefix": "class",
    "body": ["class ${1:Nama}:", "\tdef __init__(self, ${2:args}):", "\t\t${3:pass}"],
    "description": "definisi kelas"
  },
  "try except": {
    "prefix": "try",
    "body": ["try:", "\t${1:pass}", "except ${2:Exception} as e:", "\t${3:raise}"],
    "description": "penanganan error"
  },
  "test pytest": {
    "prefix": "test",
    "body": ["def test_${1:nama}():", "\tassert ${2:True}"],
    "description": "fungsi test pytest"
  }
}"##;

const SNIPPET_REACT: &str = r##"{
  "id": "zephyr.snippet-react",
  "name": "Snippet React + TS",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Komponen fungsi, useState, useEffect, custom hook, context.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [
      { "language": "typescript", "path": "./snippets/react.json" },
      { "language": "tsx", "path": "./snippets/react.json" }
    ]
  }
}"##;

const SNIPPET_REACT_JSON: &str = r##"{
  "komponen": {
    "prefix": "fc",
    "body": [
      "interface Props {",
      "\t${1:anak}?: React.ReactNode;",
      "}",
      "",
      "export default function ${2:Komponen}({ ${1:anak} }: Props) {",
      "\treturn <div>{${1:anak}}</div>;",
      "}"
    ],
    "description": "komponen fungsi TS"
  },
  "useState": {
    "prefix": "us",
    "body": ["const [${1:nilai}, set${2:Nilai}] = useState<${3:string}>(${4:''});"],
    "description": "hook state"
  },
  "useEffect": {
    "prefix": "ue",
    "body": ["useEffect(() => {", "\t${1:// efek}", "\treturn () => {", "\t\t${2:// bersihkan}", "\t};", "}, [${3:}]);"],
    "description": "hook efek dengan cleanup"
  },
  "custom hook": {
    "prefix": "hook",
    "body": ["export function use${1:Nama}() {", "\t${2:// logika}", "\treturn { ${3:} };", "}"],
    "description": "custom hook"
  }
}"##;

const LANG_TOML: &str = r##"{
  "id": "zephyr.lang-toml",
  "name": "Bahasa TOML",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Syntax highlight .toml via mode legacy CodeMirror.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Languages"],
  "contributes": {
    "languages": [
      { "id": "toml", "label": "TOML", "extensions": [".toml"], "legacyMode": "toml" }
    ]
  }
}"##;

const LANG_LUA: &str = r##"{
  "id": "zephyr.lang-lua",
  "name": "Bahasa Lua",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Syntax highlight .lua.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Languages"],
  "contributes": {
    "languages": [
      { "id": "lua", "label": "Lua", "extensions": [".lua"], "legacyMode": "lua" }
    ]
  }
}"##;

const IKON_BULAT: &str = r##"{
  "id": "zephyr.ikon-bulat",
  "name": "Ikon Bulat",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Icon theme file tree: inisial bahasa dengan warna resminya.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Bulat", "path": "./icons/bulat.json" }]
  }
}"##;

const IKON_BULAT_JSON: &str = r##"{
  "icons": {
    "ts":   { "glyph": "TS", "color": "#3178c6" },
    "tsx":  { "glyph": "TX", "color": "#3178c6" },
    "js":   { "glyph": "JS", "color": "#f7df1e" },
    "jsx":  { "glyph": "JX", "color": "#f7df1e" },
    "rs":   { "glyph": "RS", "color": "#dea584" },
    "py":   { "glyph": "PY", "color": "#3572a5" },
    "json": { "glyph": "{}", "color": "#cbcb41" },
    "css":  { "glyph": "CS", "color": "#563d7c" },
    "html": { "glyph": "<>", "color": "#e34c26" },
    "md":   { "glyph": "MD", "color": "#519aba" },
    "toml": { "glyph": "TM", "color": "#9c4221" },
    "lua":  { "glyph": "LU", "color": "#000080" }
  }
}"##;

/// Semua paket bundled. Id WAJIB sama dengan `KATALOG_BUNDLED` di
/// src/lib/extCatalog.ts — kalau menambah, ubah keduanya.
const PAKET: &[Paket] = &[
    (
        "zephyr.tema-senja",
        &[
            ("zephyr-extension.json", TEMA_SENJA),
            ("themes/senja.json", TEMA_SENJA_JSON),
        ],
    ),
    (
        "zephyr.tema-kertas",
        &[
            ("zephyr-extension.json", TEMA_KERTAS),
            ("themes/kertas.json", TEMA_KERTAS_JSON),
        ],
    ),
    (
        "zephyr.keymap-sublime",
        &[
            ("zephyr-extension.json", KEYMAP_SUBLIME),
            ("keymaps/sublime.json", KEYMAP_SUBLIME_JSON),
        ],
    ),
    (
        "zephyr.snippet-python",
        &[
            ("zephyr-extension.json", SNIPPET_PY),
            ("snippets/python.json", SNIPPET_PY_JSON),
        ],
    ),
    (
        "zephyr.snippet-react",
        &[
            ("zephyr-extension.json", SNIPPET_REACT),
            ("snippets/react.json", SNIPPET_REACT_JSON),
        ],
    ),
    (
        "zephyr.lang-toml",
        &[("zephyr-extension.json", LANG_TOML)],
    ),
    ("zephyr.lang-lua", &[("zephyr-extension.json", LANG_LUA)]),
    (
        "zephyr.ikon-bulat",
        &[
            ("zephyr-extension.json", IKON_BULAT),
            ("icons/bulat.json", IKON_BULAT_JSON),
        ],
    ),
];

/// Tulis paket bundled ke folder staging lalu kembalikan path-nya.
/// Frontend memanggil `extensions_install` dengan path ini.
#[tauri::command]
pub fn extensions_write_bundled(state: State<AppState>, id: String) -> ZResult<String> {
    let paket = PAKET
        .iter()
        .find(|(pid, _)| *pid == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("paket bundled {id}")))?;

    let dir = crate::extensions::extensions_dir(&state)
        .join(".bundled")
        .join(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    std::fs::create_dir_all(&dir)?;

    for (rel, isi) in paket.1 {
        let f = dir.join(rel);
        if let Some(p) = f.parent() {
            std::fs::create_dir_all(p)?;
        }
        std::fs::write(&f, isi)?;
    }
    Ok(dir.to_string_lossy().to_string())
}

/// Daftar id paket bundled (dipakai UI untuk menandai "tersedia offline").
#[tauri::command]
pub fn extensions_bundled_ids() -> Vec<String> {
    PAKET.iter().map(|(id, _)| (*id).to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Setiap paket bundled WAJIB punya manifest valid dan path kontribusi yang
    /// benar-benar ada di daftar file paket itu. Tanpa uji ini, salah tulis path
    /// baru ketahuan saat user mengklik Install.
    #[test]
    fn paket_bundled_konsisten() {
        for (id, files) in PAKET {
            let manifest = files
                .iter()
                .find(|(n, _)| *n == "zephyr-extension.json")
                .map(|(_, isi)| *isi)
                .unwrap_or_else(|| panic!("{id}: tidak punya zephyr-extension.json"));

            let v: serde_json::Value =
                serde_json::from_str(manifest).unwrap_or_else(|e| panic!("{id}: manifest rusak {e}"));

            assert_eq!(
                v.get("id").and_then(|x| x.as_str()),
                Some(*id),
                "{id}: field id di manifest tidak sama dengan id paket"
            );

            let punya = |rel: &str| {
                let bersih = rel.trim_start_matches("./");
                files.iter().any(|(n, _)| *n == bersih)
            };

            for grup in ["themes", "keymaps", "snippets", "iconThemes"] {
                if let Some(arr) = v
                    .get("contributes")
                    .and_then(|c| c.get(grup))
                    .and_then(|c| c.as_array())
                {
                    for item in arr {
                        let p = item.get("path").and_then(|x| x.as_str()).unwrap_or("");
                        assert!(
                            punya(p),
                            "{id}: kontribusi {grup} menunjuk {p} yang tidak ada di paket"
                        );
                    }
                }
            }

            // Semua isi JSON harus parse — termasuk file kontribusinya.
            for (nama, isi) in files.iter() {
                if nama.ends_with(".json") {
                    serde_json::from_str::<serde_json::Value>(isi)
                        .unwrap_or_else(|e| panic!("{id}/{nama}: JSON rusak {e}"));
                }
            }
        }
    }

    #[test]
    fn id_paket_unik() {
        let mut ids: Vec<&str> = PAKET.iter().map(|(id, _)| *id).collect();
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "ada id paket bundled yang kembar");
    }
}
