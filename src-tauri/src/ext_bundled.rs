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

// ── fase 19.4: paket bahasa dari @codemirror/legacy-modes ──────────────
//
// Semua mode di bawah SUDAH ada di node_modules (@codemirror/legacy-modes,
// dependency app, bukan unduhan). Tiap paket hanya mendaftarkan informasi
// bahasa (id, ekstensi file, mode) — TIDAK ada kode JS yang dijalankan,
// sehingga aman dipasang & di-enable tanpa runtime eksternal.
//
// Daftar ini di-generate dari daftar mode yang diverifikasi bisa di-import
// di runtime (lihat catatan commit). `MODE_LEGACY` di extLoader.ts SUDAH
// menerima semua nama ini.
const LANG_APL: &str = r##"{"id":"zephyr.lang-apl","name":"Bahasa APL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight APL (.apl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"apl","label":"APL","extensions":[".apl"],"legacyMode":"apl"}]}}"##;
const LANG_ASCIIARMOR: &str = r##"{"id":"zephyr.lang-asciiarmor","name":"Bahasa ASCII Armor","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight ASCII Armor (.asc).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"asciiarmor","label":"ASCII Armor","extensions":[".asc", ".pgp"],"legacyMode":"asciiarmor"}]}}"##;
const LANG_ASTERISK: &str = r##"{"id":"zephyr.lang-asterisk","name":"Bahasa Asterisk","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Asterisk (.conf).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"asterisk","label":"Asterisk","extensions":[".conf"],"legacyMode":"asterisk"}]}}"##;
const LANG_BRAINFUCK: &str = r##"{"id":"zephyr.lang-brainfuck","name":"Bahasa Brainfuck","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Brainfuck (.bf).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"brainfuck","label":"Brainfuck","extensions":[".bf", ".b"],"legacyMode":"brainfuck"}]}}"##;
const LANG_CLIKE: &str = r##"{"id":"zephyr.lang-clike","name":"Bahasa C / C++","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight C / C++ (.c).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"clike","label":"C / C++","extensions":[".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"],"legacyMode":"clike"}]}}"##;
const LANG_CLOJURE: &str = r##"{"id":"zephyr.lang-clojure","name":"Bahasa Clojure","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Clojure (.clj).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"clojure","label":"Clojure","extensions":[".clj", ".cljc", ".cljs"],"legacyMode":"clojure"}]}}"##;
const LANG_CMAKE: &str = r##"{"id":"zephyr.lang-cmake","name":"Bahasa CMake","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CMake (.cmake).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"cmake","label":"CMake","extensions":[".cmake"],"legacyMode":"cmake"}]}}"##;
const LANG_COBOL: &str = r##"{"id":"zephyr.lang-cobol","name":"Bahasa COBOL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight COBOL (.cbl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"cobol","label":"COBOL","extensions":[".cbl", ".cob"],"legacyMode":"cobol"}]}}"##;
const LANG_COFFEESCRIPT: &str = r##"{"id":"zephyr.lang-coffeescript","name":"Bahasa CoffeeScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CoffeeScript (.coffee).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"coffeescript","label":"CoffeeScript","extensions":[".coffee"],"legacyMode":"coffeescript"}]}}"##;
const LANG_COMMONLISP: &str = r##"{"id":"zephyr.lang-commonlisp","name":"Bahasa Common Lisp","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Common Lisp (.lisp).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"commonlisp","label":"Common Lisp","extensions":[".lisp", ".lsp"],"legacyMode":"commonlisp"}]}}"##;
const LANG_CRYSTAL: &str = r##"{"id":"zephyr.lang-crystal","name":"Bahasa Crystal","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Crystal (.cr).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"crystal","label":"Crystal","extensions":[".cr"],"legacyMode":"crystal"}]}}"##;
const LANG_CSS: &str = r##"{"id":"zephyr.lang-css","name":"Bahasa CSS","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CSS (.css).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"css","label":"CSS","extensions":[".css"],"legacyMode":"css"}]}}"##;
const LANG_CYPHER: &str = r##"{"id":"zephyr.lang-cypher","name":"Bahasa Cypher","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Cypher (.cyp).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"cypher","label":"Cypher","extensions":[".cyp", ".cypher"],"legacyMode":"cypher"}]}}"##;
const LANG_D: &str = r##"{"id":"zephyr.lang-d","name":"Bahasa D","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight D (.d).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"d","label":"D","extensions":[".d"],"legacyMode":"d"}]}}"##;
const LANG_DIFF: &str = r##"{"id":"zephyr.lang-diff","name":"Bahasa Diff","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Diff (.diff).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"diff","label":"Diff","extensions":[".diff", ".patch", ".rej"],"legacyMode":"diff"}]}}"##;
const LANG_DOCKERFILE: &str = r##"{"id":"zephyr.lang-dockerfile","name":"Bahasa Dockerfile","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Dockerfile (.dockerfile).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"dockerfile","label":"Dockerfile","extensions":[".dockerfile"],"legacyMode":"dockerfile"}]}}"##;
const LANG_DTD: &str = r##"{"id":"zephyr.lang-dtd","name":"Bahasa DTD","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight DTD (.dtd).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"dtd","label":"DTD","extensions":[".dtd"],"legacyMode":"dtd"}]}}"##;
const LANG_DYLAN: &str = r##"{"id":"zephyr.lang-dylan","name":"Bahasa Dylan","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Dylan (.dylan).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"dylan","label":"Dylan","extensions":[".dylan"],"legacyMode":"dylan"}]}}"##;
const LANG_EBNF: &str = r##"{"id":"zephyr.lang-ebnf","name":"Bahasa EBNF","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight EBNF (.ebnf).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ebnf","label":"EBNF","extensions":[".ebnf"],"legacyMode":"ebnf"}]}}"##;
const LANG_ECL: &str = r##"{"id":"zephyr.lang-ecl","name":"Bahasa ECL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight ECL (.ecl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ecl","label":"ECL","extensions":[".ecl"],"legacyMode":"ecl"}]}}"##;
const LANG_EIFFEL: &str = r##"{"id":"zephyr.lang-eiffel","name":"Bahasa Eiffel","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Eiffel (.e).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"eiffel","label":"Eiffel","extensions":[".e"],"legacyMode":"eiffel"}]}}"##;
const LANG_ELM: &str = r##"{"id":"zephyr.lang-elm","name":"Bahasa Elm","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Elm (.elm).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"elm","label":"Elm","extensions":[".elm"],"legacyMode":"elm"}]}}"##;
const LANG_ERLANG: &str = r##"{"id":"zephyr.lang-erlang","name":"Bahasa Erlang","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Erlang (.erl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"erlang","label":"Erlang","extensions":[".erl", ".hrl"],"legacyMode":"erlang"}]}}"##;
const LANG_FACTOR: &str = r##"{"id":"zephyr.lang-factor","name":"Bahasa Factor","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Factor (.factor).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"factor","label":"Factor","extensions":[".factor"],"legacyMode":"factor"}]}}"##;
const LANG_FCL: &str = r##"{"id":"zephyr.lang-fcl","name":"Bahasa FCL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight FCL (.fcl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"fcl","label":"FCL","extensions":[".fcl"],"legacyMode":"fcl"}]}}"##;
const LANG_FORTH: &str = r##"{"id":"zephyr.lang-forth","name":"Bahasa Forth","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Forth (.fs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"forth","label":"Forth","extensions":[".fs", ".fth"],"legacyMode":"forth"}]}}"##;
const LANG_FORTRAN: &str = r##"{"id":"zephyr.lang-fortran","name":"Bahasa Fortran","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Fortran (.f).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"fortran","label":"Fortran","extensions":[".f", ".f90", ".f95", ".f03", ".for"],"legacyMode":"fortran"}]}}"##;
const LANG_GAS: &str = r##"{"id":"zephyr.lang-gas","name":"Bahasa Assembly (GAS)","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Assembly (GAS) (.s).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"gas","label":"Assembly (GAS)","extensions":[".s", ".asm"],"legacyMode":"gas"}]}}"##;
const LANG_GHERKIN: &str = r##"{"id":"zephyr.lang-gherkin","name":"Bahasa Gherkin","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Gherkin (.feature).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"gherkin","label":"Gherkin","extensions":[".feature"],"legacyMode":"gherkin"}]}}"##;
const LANG_GO: &str = r##"{"id":"zephyr.lang-go","name":"Bahasa Go","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Go (.go).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"go","label":"Go","extensions":[".go"],"legacyMode":"go"}]}}"##;
const LANG_GROOVY: &str = r##"{"id":"zephyr.lang-groovy","name":"Bahasa Groovy","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Groovy (.groovy).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"groovy","label":"Groovy","extensions":[".groovy", ".gradle", ".gvy"],"legacyMode":"groovy"}]}}"##;
const LANG_HASKELL: &str = r##"{"id":"zephyr.lang-haskell","name":"Bahasa Haskell","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Haskell (.hs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"haskell","label":"Haskell","extensions":[".hs", ".lhs"],"legacyMode":"haskell"}]}}"##;
const LANG_HAXE: &str = r##"{"id":"zephyr.lang-haxe","name":"Bahasa Haxe","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Haxe (.hx).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"haxe","label":"Haxe","extensions":[".hx"],"legacyMode":"haxe"}]}}"##;
const LANG_HTTP: &str = r##"{"id":"zephyr.lang-http","name":"Bahasa HTTP","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight HTTP (.http).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"http","label":"HTTP","extensions":[".http", ".rest"],"legacyMode":"http"}]}}"##;
const LANG_IDL: &str = r##"{"id":"zephyr.lang-idl","name":"Bahasa IDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight IDL (.idl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"idl","label":"IDL","extensions":[".idl"],"legacyMode":"idl"}]}}"##;
const LANG_JAVASCRIPT: &str = r##"{"id":"zephyr.lang-javascript","name":"Bahasa JavaScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight JavaScript (.js).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"javascript","label":"JavaScript","extensions":[".js", ".mjs", ".cjs", ".jsx"],"legacyMode":"javascript"}]}}"##;
const LANG_JINJA2: &str = r##"{"id":"zephyr.lang-jinja2","name":"Bahasa Jinja2","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Jinja2 (.jinja).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"jinja2","label":"Jinja2","extensions":[".jinja", ".j2", ".jinja2"],"legacyMode":"jinja2"}]}}"##;
const LANG_JULIA: &str = r##"{"id":"zephyr.lang-julia","name":"Bahasa Julia","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Julia (.jl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"julia","label":"Julia","extensions":[".jl"],"legacyMode":"julia"}]}}"##;
const LANG_LIVESCRIPT: &str = r##"{"id":"zephyr.lang-livescript","name":"Bahasa LiveScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight LiveScript (.ls).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"livescript","label":"LiveScript","extensions":[".ls"],"legacyMode":"livescript"}]}}"##;
const LANG_LUA: &str = r##"{"id":"zephyr.lang-lua","name":"Bahasa Lua","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Lua (.lua).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"lua","label":"Lua","extensions":[".lua"],"legacyMode":"lua"}]}}"##;
const LANG_MATHEMATICA: &str = r##"{"id":"zephyr.lang-mathematica","name":"Bahasa Wolfram","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Wolfram (.m).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mathematica","label":"Wolfram","extensions":[".m", ".wl", ".wls"],"legacyMode":"mathematica"}]}}"##;
const LANG_MBOX: &str = r##"{"id":"zephyr.lang-mbox","name":"Bahasa Mbox","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Mbox (.mbox).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mbox","label":"Mbox","extensions":[".mbox"],"legacyMode":"mbox"}]}}"##;
const LANG_MIRC: &str = r##"{"id":"zephyr.lang-mirc","name":"Bahasa mIRC","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight mIRC (.mrc).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mirc","label":"mIRC","extensions":[".mrc", ".ini"],"legacyMode":"mirc"}]}}"##;
const LANG_MLLIKE: &str = r##"{"id":"zephyr.lang-mllike","name":"Bahasa OCaml / SML","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight OCaml / SML (.ml).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mllike","label":"OCaml / SML","extensions":[".ml", ".mli", ".sml"],"legacyMode":"mllike"}]}}"##;
const LANG_MODELICA: &str = r##"{"id":"zephyr.lang-modelica","name":"Bahasa Modelica","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Modelica (.mo).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"modelica","label":"Modelica","extensions":[".mo"],"legacyMode":"modelica"}]}}"##;
const LANG_MSCGEN: &str = r##"{"id":"zephyr.lang-mscgen","name":"Bahasa MscGen","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight MscGen (.msc).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mscgen","label":"MscGen","extensions":[".msc"],"legacyMode":"mscgen"}]}}"##;
const LANG_MUMPS: &str = r##"{"id":"zephyr.lang-mumps","name":"Bahasa MUMPS","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight MUMPS (.mumps).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mumps","label":"MUMPS","extensions":[".mumps", ".roc"],"legacyMode":"mumps"}]}}"##;
const LANG_NGINX: &str = r##"{"id":"zephyr.lang-nginx","name":"Bahasa nginx Config","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight nginx Config (.nginx).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"nginx","label":"nginx Config","extensions":[".nginx"],"legacyMode":"nginx"}]}}"##;
const LANG_NSIS: &str = r##"{"id":"zephyr.lang-nsis","name":"Bahasa NSIS","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight NSIS (.nsi).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"nsis","label":"NSIS","extensions":[".nsi", ".nsh"],"legacyMode":"nsis"}]}}"##;
const LANG_NTRIPLES: &str = r##"{"id":"zephyr.lang-ntriples","name":"Bahasa N-Triples","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight N-Triples (.nt).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ntriples","label":"N-Triples","extensions":[".nt"],"legacyMode":"ntriples"}]}}"##;
const LANG_OCTAVE: &str = r##"{"id":"zephyr.lang-octave","name":"Bahasa MATLAB / Octave","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight MATLAB / Octave (.m).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"octave","label":"MATLAB / Octave","extensions":[".m", ".octave"],"legacyMode":"octave"}]}}"##;
const LANG_OZ: &str = r##"{"id":"zephyr.lang-oz","name":"Bahasa Oz","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Oz (.oz).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"oz","label":"Oz","extensions":[".oz"],"legacyMode":"oz"}]}}"##;
const LANG_PASCAL: &str = r##"{"id":"zephyr.lang-pascal","name":"Bahasa Pascal","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Pascal (.pas).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pascal","label":"Pascal","extensions":[".pas", ".pp", ".dpr", ".lpr"],"legacyMode":"pascal"}]}}"##;
const LANG_PEGJS: &str = r##"{"id":"zephyr.lang-pegjs","name":"Bahasa PEG.js","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight PEG.js (.pegjs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pegjs","label":"PEG.js","extensions":[".pegjs", ".peg"],"legacyMode":"pegjs"}]}}"##;
const LANG_PERL: &str = r##"{"id":"zephyr.lang-perl","name":"Bahasa Perl","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Perl (.pl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"perl","label":"Perl","extensions":[".pl", ".pm", ".t", ".pod"],"legacyMode":"perl"}]}}"##;
const LANG_PIG: &str = r##"{"id":"zephyr.lang-pig","name":"Bahasa Pig","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Pig (.pig).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pig","label":"Pig","extensions":[".pig"],"legacyMode":"pig"}]}}"##;
const LANG_POWERSHELL: &str = r##"{"id":"zephyr.lang-powershell","name":"Bahasa PowerShell","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight PowerShell (.ps1).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"powershell","label":"PowerShell","extensions":[".ps1", ".psm1", ".psd1"],"legacyMode":"powershell"}]}}"##;
const LANG_PROPERTIES: &str = r##"{"id":"zephyr.lang-properties","name":"Bahasa Properties","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Properties (.properties).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"properties","label":"Properties","extensions":[".properties", ".ini", ".cfg", ".conf"],"legacyMode":"properties"}]}}"##;
const LANG_PROTOBUF: &str = r##"{"id":"zephyr.lang-protobuf","name":"Bahasa Protocol Buffers","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Protocol Buffers (.proto).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"protobuf","label":"Protocol Buffers","extensions":[".proto"],"legacyMode":"protobuf"}]}}"##;
const LANG_PUG: &str = r##"{"id":"zephyr.lang-pug","name":"Bahasa Pug","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Pug (.pug).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pug","label":"Pug","extensions":[".pug", ".jade"],"legacyMode":"pug"}]}}"##;
const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Puppet (.pp).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"puppet","label":"Puppet","extensions":[".pp"],"legacyMode":"puppet"}]}}"##;
const LANG_PYTHON: &str = r##"{"id":"zephyr.lang-python","name":"Bahasa Python","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Python (.py).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"python","label":"Python","extensions":[".py", ".pyw", ".pyi"],"legacyMode":"python"}]}}"##;
const LANG_Q: &str = r##"{"id":"zephyr.lang-q","name":"Bahasa q/Kdb+","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight q/Kdb+ (.q).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"q","label":"q/Kdb+","extensions":[".q"],"legacyMode":"q"}]}}"##;
const LANG_R: &str = r##"{"id":"zephyr.lang-r","name":"Bahasa R","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight R (.r).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"r","label":"R","extensions":[".r", ".R", ".Rmd"],"legacyMode":"r"}]}}"##;
const LANG_RPM: &str = r##"{"id":"zephyr.lang-rpm","name":"Bahasa RPM Spec","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight RPM Spec (.spec).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"rpm","label":"RPM Spec","extensions":[".spec"],"legacyMode":"rpm"}]}}"##;
const LANG_RUBY: &str = r##"{"id":"zephyr.lang-ruby","name":"Bahasa Ruby","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Ruby (.rb).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ruby","label":"Ruby","extensions":[".rb", ".erb", ".gemspec"],"legacyMode":"ruby"}]}}"##;
const LANG_RUST: &str = r##"{"id":"zephyr.lang-rust","name":"Bahasa Rust","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Rust (.rs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"rust","label":"Rust","extensions":[".rs"],"legacyMode":"rust"}]}}"##;
const LANG_SAS: &str = r##"{"id":"zephyr.lang-sas","name":"Bahasa sas","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight sas (.sas).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sas","label":"sas","extensions":[".sas"],"legacyMode":"sas"}]}}"##;
const LANG_SASS: &str = r##"{"id":"zephyr.lang-sass","name":"Bahasa Sass","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Sass (.sass).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sass","label":"Sass","extensions":[".sass", ".scss"],"legacyMode":"sass"}]}}"##;
const LANG_SCHEME: &str = r##"{"id":"zephyr.lang-scheme","name":"Bahasa Scheme","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Scheme (.scm).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"scheme","label":"Scheme","extensions":[".scm", ".ss", ".rkt"],"legacyMode":"scheme"}]}}"##;
const LANG_SHELL: &str = r##"{"id":"zephyr.lang-shell","name":"Bahasa Shell / Bash","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Shell / Bash (.sh).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"shell","label":"Shell / Bash","extensions":[".sh", ".bash", ".zsh", ".fish"],"legacyMode":"shell"}]}}"##;
const LANG_SIEVE: &str = r##"{"id":"zephyr.lang-sieve","name":"Bahasa Sieve","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Sieve (.sieve).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sieve","label":"Sieve","extensions":[".sieve"],"legacyMode":"sieve"}]}}"##;
const LANG_SMALLTALK: &str = r##"{"id":"zephyr.lang-smalltalk","name":"Bahasa Smalltalk","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Smalltalk (.st).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"smalltalk","label":"Smalltalk","extensions":[".st", ".sq"],"legacyMode":"smalltalk"}]}}"##;
const LANG_SOLR: &str = r##"{"id":"zephyr.lang-solr","name":"Bahasa Solr","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Solr (.solr).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"solr","label":"Solr","extensions":[".solr"],"legacyMode":"solr"}]}}"##;
const LANG_SPARQL: &str = r##"{"id":"zephyr.lang-sparql","name":"Bahasa SPARQL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight SPARQL (.rq).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sparql","label":"SPARQL","extensions":[".rq", ".sparql"],"legacyMode":"sparql"}]}}"##;
const LANG_SPREADSHEET: &str = r##"{"id":"zephyr.lang-spreadsheet","name":"Bahasa CSV / TSV","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CSV / TSV (.csv).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"spreadsheet","label":"CSV / TSV","extensions":[".csv", ".tsv", ".tab"],"legacyMode":"spreadsheet"}]}}"##;
const LANG_SQL: &str = r##"{"id":"zephyr.lang-sql","name":"Bahasa SQL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight SQL (.sql).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sql","label":"SQL","extensions":[".sql"],"legacyMode":"sql"}]}}"##;
const LANG_STEX: &str = r##"{"id":"zephyr.lang-stex","name":"Bahasa LaTeX","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight LaTeX (.tex).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"stex","label":"LaTeX","extensions":[".tex", ".ltx", ".sty"],"legacyMode":"stex"}]}}"##;
const LANG_STYLUS: &str = r##"{"id":"zephyr.lang-stylus","name":"Bahasa Stylus","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Stylus (.styl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"stylus","label":"Stylus","extensions":[".styl"],"legacyMode":"stylus"}]}}"##;
const LANG_SWIFT: &str = r##"{"id":"zephyr.lang-swift","name":"Bahasa Swift","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Swift (.swift).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"swift","label":"Swift","extensions":[".swift"],"legacyMode":"swift"}]}}"##;
const LANG_TCL: &str = r##"{"id":"zephyr.lang-tcl","name":"Bahasa Tcl","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Tcl (.tcl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tcl","label":"Tcl","extensions":[".tcl", ".tk"],"legacyMode":"tcl"}]}}"##;
const LANG_TEXTILE: &str = r##"{"id":"zephyr.lang-textile","name":"Bahasa Textile","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Textile (.textile).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"textile","label":"Textile","extensions":[".textile"],"legacyMode":"textile"}]}}"##;
const LANG_TIDDLYWIKI: &str = r##"{"id":"zephyr.lang-tiddlywiki","name":"Bahasa TiddlyWiki","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TiddlyWiki (.tid).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tiddlywiki","label":"TiddlyWiki","extensions":[".tid", ".wiki"],"legacyMode":"tiddlywiki"}]}}"##;
const LANG_TIKI: &str = r##"{"id":"zephyr.lang-tiki","name":"Bahasa Tiki","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Tiki (.tiki).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tiki","label":"Tiki","extensions":[".tiki"],"legacyMode":"tiki"}]}}"##;
const LANG_TOML: &str = r##"{"id":"zephyr.lang-toml","name":"Bahasa TOML","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TOML (.toml).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"toml","label":"TOML","extensions":[".toml"],"legacyMode":"toml"}]}}"##;
const LANG_TROFF: &str = r##"{"id":"zephyr.lang-troff","name":"Bahasa troff","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight troff (.roff).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"troff","label":"troff","extensions":[".roff", ".man", ".1", ".groff"],"legacyMode":"troff"}]}}"##;
const LANG_TTCN: &str = r##"{"id":"zephyr.lang-ttcn","name":"Bahasa TTCN-3","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TTCN-3 (.ttcn).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ttcn","label":"TTCN-3","extensions":[".ttcn", ".ttcn3"],"legacyMode":"ttcn"}]}}"##;
const LANG_TTCN_CFG: &str = r##"{"id":"zephyr.lang-ttcn-cfg","name":"Bahasa TTCN CFG","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TTCN CFG (.cfg).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ttcn-cfg","label":"TTCN CFG","extensions":[".cfg"],"legacyMode":"ttcn-cfg"}]}}"##;
const LANG_TURTLE: &str = r##"{"id":"zephyr.lang-turtle","name":"Bahasa Turtle","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Turtle (.ttl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"turtle","label":"Turtle","extensions":[".ttl", ".turtle", ".nt"],"legacyMode":"turtle"}]}}"##;
const LANG_VB: &str = r##"{"id":"zephyr.lang-vb","name":"Bahasa Visual Basic","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Visual Basic (.vb).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vb","label":"Visual Basic","extensions":[".vb", ".vbs"],"legacyMode":"vb"}]}}"##;
const LANG_VBSCRIPT: &str = r##"{"id":"zephyr.lang-vbscript","name":"Bahasa VBScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight VBScript (.vbs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vbscript","label":"VBScript","extensions":[".vbs", ".vbe"],"legacyMode":"vbscript"}]}}"##;
const LANG_VELOCITY: &str = r##"{"id":"zephyr.lang-velocity","name":"Bahasa Velocity","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Velocity (.vm).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"velocity","label":"Velocity","extensions":[".vm", ".vtl", ".vsl"],"legacyMode":"velocity"}]}}"##;
const LANG_VERILOG: &str = r##"{"id":"zephyr.lang-verilog","name":"Bahasa Verilog","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Verilog (.v).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"verilog","label":"Verilog","extensions":[".v", ".sv", ".svh", ".vh"],"legacyMode":"verilog"}]}}"##;
const LANG_VHDL: &str = r##"{"id":"zephyr.lang-vhdl","name":"Bahasa VHDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight VHDL (.vhd).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vhdl","label":"VHDL","extensions":[".vhd", ".vhdl"],"legacyMode":"vhdl"}]}}"##;
const LANG_WAST: &str = r##"{"id":"zephyr.lang-wast","name":"Bahasa WebAssembly Text","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight WebAssembly Text (.wast).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"wast","label":"WebAssembly Text","extensions":[".wast", ".wat"],"legacyMode":"wast"}]}}"##;
const LANG_WEBIDL: &str = r##"{"id":"zephyr.lang-webidl","name":"Bahasa Web IDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Web IDL (.webidl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"webidl","label":"Web IDL","extensions":[".webidl", ".idl"],"legacyMode":"webidl"}]}}"##;
const LANG_XML: &str = r##"{"id":"zephyr.lang-xml","name":"Bahasa XML / HTML","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight XML / HTML (.xml).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"xml","label":"XML / HTML","extensions":[".xml", ".xsd", ".xsl", ".xhtml", ".svg"],"legacyMode":"xml"}]}}"##;
const LANG_XQUERY: &str = r##"{"id":"zephyr.lang-xquery","name":"Bahasa XQuery","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight XQuery (.xq).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"xquery","label":"XQuery","extensions":[".xq", ".xquery", ".xql"],"legacyMode":"xquery"}]}}"##;
const LANG_YACAS: &str = r##"{"id":"zephyr.lang-yacas","name":"Bahasa Yacas","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Yacas (.ys).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"yacas","label":"Yacas","extensions":[".ys"],"legacyMode":"yacas"}]}}"##;
const LANG_YAML: &str = r##"{"id":"zephyr.lang-yaml","name":"Bahasa YAML","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight YAML (.yaml).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"yaml","label":"YAML","extensions":[".yaml", ".yml"],"legacyMode":"yaml"}]}}"##;
const LANG_Z80: &str = r##"{"id":"zephyr.lang-z80","name":"Bahasa Z80 Assembly","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Z80 Assembly (.z80).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"z80","label":"Z80 Assembly","extensions":[".z80", ".asm"],"legacyMode":"z80"}]}}"##;

/// Semua paket bahasa (di-generate). Dipakai PAKET_BAHASA di bawah.
// Metadata tampilan untuk paket bahasa (dipakai index_bundled supaya
// Marketplace menampilkan nama, deskripsi, logo, dan warna resmi bahasa).
// Di-generate dari daftar mode @codemirror/legacy-modes (101 bahasa).
const META_BAHASA: &[(&str, &str, &str, &str, &str)] = &[
    (
        "zephyr.lang-apl",
        "APL",
        "Sintaks APL untuk editor (CodeMirror legacy mode).",
        "APL",
        "#ff6347",
    ),
    (
        "zephyr.lang-asciiarmor",
        "ASCII Armor",
        "Sintaks ASCII Armor untuk editor (CodeMirror legacy mode).",
        "AS",
        "#6b7280",
    ),
    (
        "zephyr.lang-asterisk",
        "Asterisk",
        "Sintaks Asterisk untuk editor (CodeMirror legacy mode).",
        "AS",
        "#f47f2a",
    ),
    (
        "zephyr.lang-brainfuck",
        "Brainfuck",
        "Sintaks Brainfuck untuk editor (CodeMirror legacy mode).",
        "BR",
        "#ff6ec7",
    ),
    (
        "zephyr.lang-clike",
        "C / C++",
        "Sintaks C / C++ untuk editor (CodeMirror legacy mode).",
        "CC",
        "#659ad2",
    ),
    (
        "zephyr.lang-clojure",
        "Clojure",
        "Sintaks Clojure untuk editor (CodeMirror legacy mode).",
        "CL",
        "#5881d8",
    ),
    (
        "zephyr.lang-cmake",
        "CMake",
        "Sintaks CMake untuk editor (CodeMirror legacy mode).",
        "CM",
        "#064f8c",
    ),
    (
        "zephyr.lang-cobol",
        "COBOL",
        "Sintaks COBOL untuk editor (CodeMirror legacy mode).",
        "CO",
        "#005ca5",
    ),
    (
        "zephyr.lang-coffeescript",
        "CoffeeScript",
        "Sintaks CoffeeScript untuk editor (CodeMirror legacy mode).",
        "CO",
        "#6f4e37",
    ),
    (
        "zephyr.lang-commonlisp",
        "Common Lisp",
        "Sintaks Common Lisp untuk editor (CodeMirror legacy mode).",
        "CO",
        "#3fb68b",
    ),
    (
        "zephyr.lang-crystal",
        "Crystal",
        "Sintaks Crystal untuk editor (CodeMirror legacy mode).",
        "CR",
        "#1a1a1a",
    ),
    (
        "zephyr.lang-css",
        "CSS",
        "Sintaks CSS untuk editor (CodeMirror legacy mode).",
        "CSS",
        "#1572b6",
    ),
    (
        "zephyr.lang-cypher",
        "Cypher",
        "Sintaks Cypher untuk editor (CodeMirror legacy mode).",
        "CY",
        "#89d3c8",
    ),
    (
        "zephyr.lang-d",
        "D",
        "Sintaks D untuk editor (CodeMirror legacy mode).",
        "D",
        "#b03931",
    ),
    (
        "zephyr.lang-diff",
        "Diff",
        "Sintaks Diff untuk editor (CodeMirror legacy mode).",
        "DIF",
        "#3b82f6",
    ),
    (
        "zephyr.lang-dockerfile",
        "Dockerfile",
        "Sintaks Dockerfile untuk editor (CodeMirror legacy mode).",
        "DO",
        "#0db7ed",
    ),
    (
        "zephyr.lang-dtd",
        "DTD",
        "Sintaks DTD untuk editor (CodeMirror legacy mode).",
        "DTD",
        "#e37933",
    ),
    (
        "zephyr.lang-dylan",
        "Dylan",
        "Sintaks Dylan untuk editor (CodeMirror legacy mode).",
        "DY",
        "#6c6c6c",
    ),
    (
        "zephyr.lang-ebnf",
        "EBNF",
        "Sintaks EBNF untuk editor (CodeMirror legacy mode).",
        "EBN",
        "#a3a3a3",
    ),
    (
        "zephyr.lang-ecl",
        "ECL",
        "Sintaks ECL untuk editor (CodeMirror legacy mode).",
        "ECL",
        "#8a2be2",
    ),
    (
        "zephyr.lang-eiffel",
        "Eiffel",
        "Sintaks Eiffel untuk editor (CodeMirror legacy mode).",
        "EI",
        "#4d41b1",
    ),
    (
        "zephyr.lang-elm",
        "Elm",
        "Sintaks Elm untuk editor (CodeMirror legacy mode).",
        "ELM",
        "#60b5cc",
    ),
    (
        "zephyr.lang-erlang",
        "Erlang",
        "Sintaks Erlang untuk editor (CodeMirror legacy mode).",
        "ER",
        "#a90533",
    ),
    (
        "zephyr.lang-factor",
        "Factor",
        "Sintaks Factor untuk editor (CodeMirror legacy mode).",
        "FA",
        "#d5539a",
    ),
    (
        "zephyr.lang-fcl",
        "FCL",
        "Sintaks FCL untuk editor (CodeMirror legacy mode).",
        "FCL",
        "#3b82f6",
    ),
    (
        "zephyr.lang-forth",
        "Forth",
        "Sintaks Forth untuk editor (CodeMirror legacy mode).",
        "FO",
        "#e62b25",
    ),
    (
        "zephyr.lang-fortran",
        "Fortran",
        "Sintaks Fortran untuk editor (CodeMirror legacy mode).",
        "FO",
        "#4d41b1",
    ),
    (
        "zephyr.lang-gas",
        "Assembly (GAS)",
        "Sintaks Assembly (GAS) untuk editor (CodeMirror legacy mode).",
        "AS",
        "#6e4c13",
    ),
    (
        "zephyr.lang-gherkin",
        "Gherkin",
        "Sintaks Gherkin untuk editor (CodeMirror legacy mode).",
        "GH",
        "#4a90d9",
    ),
    (
        "zephyr.lang-go",
        "Go",
        "Sintaks Go untuk editor (CodeMirror legacy mode).",
        "GO",
        "#00add8",
    ),
    (
        "zephyr.lang-groovy",
        "Groovy",
        "Sintaks Groovy untuk editor (CodeMirror legacy mode).",
        "GR",
        "#4298b8",
    ),
    (
        "zephyr.lang-haskell",
        "Haskell",
        "Sintaks Haskell untuk editor (CodeMirror legacy mode).",
        "HA",
        "#5e5086",
    ),
    (
        "zephyr.lang-haxe",
        "Haxe",
        "Sintaks Haxe untuk editor (CodeMirror legacy mode).",
        "HAX",
        "#ea8220",
    ),
    (
        "zephyr.lang-http",
        "HTTP",
        "Sintaks HTTP untuk editor (CodeMirror legacy mode).",
        "HTT",
        "#4a90d9",
    ),
    (
        "zephyr.lang-idl",
        "IDL",
        "Sintaks IDL untuk editor (CodeMirror legacy mode).",
        "IDL",
        "#e35b2a",
    ),
    (
        "zephyr.lang-javascript",
        "JavaScript",
        "Sintaks JavaScript untuk editor (CodeMirror legacy mode).",
        "JA",
        "#f7df1e",
    ),
    (
        "zephyr.lang-jinja2",
        "Jinja2",
        "Sintaks Jinja2 untuk editor (CodeMirror legacy mode).",
        "JI",
        "#b52e31",
    ),
    (
        "zephyr.lang-julia",
        "Julia",
        "Sintaks Julia untuk editor (CodeMirror legacy mode).",
        "JU",
        "#9558b2",
    ),
    (
        "zephyr.lang-livescript",
        "LiveScript",
        "Sintaks LiveScript untuk editor (CodeMirror legacy mode).",
        "LI",
        "#4a90d9",
    ),
    (
        "zephyr.lang-lua",
        "Lua",
        "Sintaks Lua untuk editor (CodeMirror legacy mode).",
        "LUA",
        "#2c4f7c",
    ),
    (
        "zephyr.lang-mathematica",
        "Wolfram",
        "Sintaks Wolfram untuk editor (CodeMirror legacy mode).",
        "WO",
        "#dd1100",
    ),
    (
        "zephyr.lang-mbox",
        "Mbox",
        "Sintaks Mbox untuk editor (CodeMirror legacy mode).",
        "MBO",
        "#6b7280",
    ),
    (
        "zephyr.lang-mirc",
        "mIRC",
        "Sintaks mIRC untuk editor (CodeMirror legacy mode).",
        "MIR",
        "#9c4221",
    ),
    (
        "zephyr.lang-mllike",
        "OCaml / SML",
        "Sintaks OCaml / SML untuk editor (CodeMirror legacy mode).",
        "OC",
        "#e37933",
    ),
    (
        "zephyr.lang-modelica",
        "Modelica",
        "Sintaks Modelica untuk editor (CodeMirror legacy mode).",
        "MO",
        "#e35b2a",
    ),
    (
        "zephyr.lang-mscgen",
        "MscGen",
        "Sintaks MscGen untuk editor (CodeMirror legacy mode).",
        "MS",
        "#6b7280",
    ),
    (
        "zephyr.lang-mumps",
        "MUMPS",
        "Sintaks MUMPS untuk editor (CodeMirror legacy mode).",
        "MU",
        "#0aa674",
    ),
    (
        "zephyr.lang-nginx",
        "nginx Config",
        "Sintaks nginx Config untuk editor (CodeMirror legacy mode).",
        "NG",
        "#009639",
    ),
    (
        "zephyr.lang-nsis",
        "NSIS",
        "Sintaks NSIS untuk editor (CodeMirror legacy mode).",
        "NSI",
        "#0db7ed",
    ),
    (
        "zephyr.lang-ntriples",
        "N-Triples",
        "Sintaks N-Triples untuk editor (CodeMirror legacy mode).",
        "NT",
        "#0c4b33",
    ),
    (
        "zephyr.lang-octave",
        "MATLAB / Octave",
        "Sintaks MATLAB / Octave untuk editor (CodeMirror legacy mode).",
        "MA",
        "#0790c0",
    ),
    (
        "zephyr.lang-oz",
        "Oz",
        "Sintaks Oz untuk editor (CodeMirror legacy mode).",
        "OZ",
        "#f7df1e",
    ),
    (
        "zephyr.lang-pascal",
        "Pascal",
        "Sintaks Pascal untuk editor (CodeMirror legacy mode).",
        "PA",
        "#e62b25",
    ),
    (
        "zephyr.lang-pegjs",
        "PEG.js",
        "Sintaks PEG.js untuk editor (CodeMirror legacy mode).",
        "PE",
        "#3178c6",
    ),
    (
        "zephyr.lang-perl",
        "Perl",
        "Sintaks Perl untuk editor (CodeMirror legacy mode).",
        "PER",
        "#39457e",
    ),
    (
        "zephyr.lang-pig",
        "Pig",
        "Sintaks Pig untuk editor (CodeMirror legacy mode).",
        "PIG",
        "#f7df1e",
    ),
    (
        "zephyr.lang-powershell",
        "PowerShell",
        "Sintaks PowerShell untuk editor (CodeMirror legacy mode).",
        "PO",
        "#012456",
    ),
    (
        "zephyr.lang-properties",
        "Properties",
        "Sintaks Properties untuk editor (CodeMirror legacy mode).",
        "PR",
        "#8a8a8a",
    ),
    (
        "zephyr.lang-protobuf",
        "Protocol Buffers",
        "Sintaks Protocol Buffers untuk editor (CodeMirror legacy mode).",
        "PR",
        "#4285f4",
    ),
    (
        "zephyr.lang-pug",
        "Pug",
        "Sintaks Pug untuk editor (CodeMirror legacy mode).",
        "PUG",
        "#479e4a",
    ),
    (
        "zephyr.lang-puppet",
        "Puppet",
        "Sintaks Puppet untuk editor (CodeMirror legacy mode).",
        "PU",
        "#47649e",
    ),
    (
        "zephyr.lang-python",
        "Python",
        "Sintaks Python untuk editor (CodeMirror legacy mode).",
        "PY",
        "#3776ab",
    ),
    (
        "zephyr.lang-q",
        "q/Kdb+",
        "Sintaks q/Kdb+ untuk editor (CodeMirror legacy mode).",
        "QKD",
        "#519e47",
    ),
    (
        "zephyr.lang-r",
        "R",
        "Sintaks R untuk editor (CodeMirror legacy mode).",
        "R",
        "#276dc3",
    ),
    (
        "zephyr.lang-rpm",
        "RPM Spec",
        "Sintaks RPM Spec untuk editor (CodeMirror legacy mode).",
        "RP",
        "#6b9e47",
    ),
    (
        "zephyr.lang-ruby",
        "Ruby",
        "Sintaks Ruby untuk editor (CodeMirror legacy mode).",
        "RUB",
        "#cc342d",
    ),
    (
        "zephyr.lang-rust",
        "Rust",
        "Sintaks Rust untuk editor (CodeMirror legacy mode).",
        "RUS",
        "#dea584",
    ),
    (
        "zephyr.lang-sas",
        "sas",
        "Sintaks sas untuk editor (CodeMirror legacy mode).",
        "SAS",
        "#474b9e",
    ),
    (
        "zephyr.lang-sass",
        "Sass",
        "Sintaks Sass untuk editor (CodeMirror legacy mode).",
        "SAS",
        "#67479e",
    ),
    (
        "zephyr.lang-scheme",
        "Scheme",
        "Sintaks Scheme untuk editor (CodeMirror legacy mode).",
        "SC",
        "#1b5cec",
    ),
    (
        "zephyr.lang-shell",
        "Shell / Bash",
        "Sintaks Shell / Bash untuk editor (CodeMirror legacy mode).",
        "SH",
        "#89e051",
    ),
    (
        "zephyr.lang-sieve",
        "Sieve",
        "Sintaks Sieve untuk editor (CodeMirror legacy mode).",
        "SI",
        "#72479e",
    ),
    (
        "zephyr.lang-smalltalk",
        "Smalltalk",
        "Sintaks Smalltalk untuk editor (CodeMirror legacy mode).",
        "SM",
        "#9e4788",
    ),
    (
        "zephyr.lang-solr",
        "Solr",
        "Sintaks Solr untuk editor (CodeMirror legacy mode).",
        "SOL",
        "#479e9b",
    ),
    (
        "zephyr.lang-sparql",
        "SPARQL",
        "Sintaks SPARQL untuk editor (CodeMirror legacy mode).",
        "SP",
        "#749e47",
    ),
    (
        "zephyr.lang-spreadsheet",
        "CSV / TSV",
        "Sintaks CSV / TSV untuk editor (CodeMirror legacy mode).",
        "CS",
        "#476f9e",
    ),
    (
        "zephyr.lang-sql",
        "SQL",
        "Sintaks SQL untuk editor (CodeMirror legacy mode).",
        "SQL",
        "#e38c00",
    ),
    (
        "zephyr.lang-stex",
        "LaTeX",
        "Sintaks LaTeX untuk editor (CodeMirror legacy mode).",
        "LA",
        "#6f9e47",
    ),
    (
        "zephyr.lang-stylus",
        "Stylus",
        "Sintaks Stylus untuk editor (CodeMirror legacy mode).",
        "ST",
        "#ff6347",
    ),
    (
        "zephyr.lang-swift",
        "Swift",
        "Sintaks Swift untuk editor (CodeMirror legacy mode).",
        "SW",
        "#f05138",
    ),
    (
        "zephyr.lang-tcl",
        "Tcl",
        "Sintaks Tcl untuk editor (CodeMirror legacy mode).",
        "TCL",
        "#479e93",
    ),
    (
        "zephyr.lang-textile",
        "Textile",
        "Sintaks Textile untuk editor (CodeMirror legacy mode).",
        "TE",
        "#9e9347",
    ),
    (
        "zephyr.lang-tiddlywiki",
        "TiddlyWiki",
        "Sintaks TiddlyWiki untuk editor (CodeMirror legacy mode).",
        "TI",
        "#479e61",
    ),
    (
        "zephyr.lang-tiki",
        "Tiki",
        "Sintaks Tiki untuk editor (CodeMirror legacy mode).",
        "TIK",
        "#9e8547",
    ),
    (
        "zephyr.lang-toml",
        "TOML",
        "Sintaks TOML untuk editor (CodeMirror legacy mode).",
        "TOM",
        "#9c4221",
    ),
    (
        "zephyr.lang-troff",
        "troff",
        "Sintaks troff untuk editor (CodeMirror legacy mode).",
        "TR",
        "#969e47",
    ),
    (
        "zephyr.lang-ttcn",
        "TTCN-3",
        "Sintaks TTCN-3 untuk editor (CodeMirror legacy mode).",
        "TT",
        "#91479e",
    ),
    (
        "zephyr.lang-ttcn-cfg",
        "TTCN CFG",
        "Sintaks TTCN CFG untuk editor (CodeMirror legacy mode).",
        "TT",
        "#47679e",
    ),
    (
        "zephyr.lang-turtle",
        "Turtle",
        "Sintaks Turtle untuk editor (CodeMirror legacy mode).",
        "TU",
        "#9e5847",
    ),
    (
        "zephyr.lang-vb",
        "Visual Basic",
        "Sintaks Visual Basic untuk editor (CodeMirror legacy mode).",
        "VI",
        "#005a9e",
    ),
    (
        "zephyr.lang-vbscript",
        "VBScript",
        "Sintaks VBScript untuk editor (CodeMirror legacy mode).",
        "VB",
        "#8e9e47",
    ),
    (
        "zephyr.lang-velocity",
        "Velocity",
        "Sintaks Velocity untuk editor (CodeMirror legacy mode).",
        "VE",
        "#474b9e",
    ),
    (
        "zephyr.lang-verilog",
        "Verilog",
        "Sintaks Verilog untuk editor (CodeMirror legacy mode).",
        "VE",
        "#479e72",
    ),
    (
        "zephyr.lang-vhdl",
        "VHDL",
        "Sintaks VHDL untuk editor (CodeMirror legacy mode).",
        "VHD",
        "#479e55",
    ),
    (
        "zephyr.lang-wast",
        "WebAssembly Text",
        "Sintaks WebAssembly Text untuk editor (CodeMirror legacy mode).",
        "WE",
        "#6e479e",
    ),
    (
        "zephyr.lang-webidl",
        "Web IDL",
        "Sintaks Web IDL untuk editor (CodeMirror legacy mode).",
        "WE",
        "#9e479c",
    ),
    (
        "zephyr.lang-xml",
        "XML / HTML",
        "Sintaks XML / HTML untuk editor (CodeMirror legacy mode).",
        "XM",
        "#e37933",
    ),
    (
        "zephyr.lang-xquery",
        "XQuery",
        "Sintaks XQuery untuk editor (CodeMirror legacy mode).",
        "XQ",
        "#9e9847",
    ),
    (
        "zephyr.lang-yacas",
        "Yacas",
        "Sintaks Yacas untuk editor (CodeMirror legacy mode).",
        "YA",
        "#47579e",
    ),
    (
        "zephyr.lang-yaml",
        "YAML",
        "Sintaks YAML untuk editor (CodeMirror legacy mode).",
        "YAM",
        "#cb171e",
    ),
    (
        "zephyr.lang-z80",
        "Z80 Assembly",
        "Sintaks Z80 Assembly untuk editor (CodeMirror legacy mode).",
        "Z8",
        "#475b9e",
    ),
];
const PAKET_BAHASA: &[(&str, &[(&str, &str)])] = &[
    ("zephyr.lang-apl", &[("zephyr-extension.json", LANG_APL)]),
    (
        "zephyr.lang-asciiarmor",
        &[("zephyr-extension.json", LANG_ASCIIARMOR)],
    ),
    (
        "zephyr.lang-asterisk",
        &[("zephyr-extension.json", LANG_ASTERISK)],
    ),
    (
        "zephyr.lang-brainfuck",
        &[("zephyr-extension.json", LANG_BRAINFUCK)],
    ),
    (
        "zephyr.lang-clike",
        &[("zephyr-extension.json", LANG_CLIKE)],
    ),
    (
        "zephyr.lang-clojure",
        &[("zephyr-extension.json", LANG_CLOJURE)],
    ),
    (
        "zephyr.lang-cmake",
        &[("zephyr-extension.json", LANG_CMAKE)],
    ),
    (
        "zephyr.lang-cobol",
        &[("zephyr-extension.json", LANG_COBOL)],
    ),
    (
        "zephyr.lang-coffeescript",
        &[("zephyr-extension.json", LANG_COFFEESCRIPT)],
    ),
    (
        "zephyr.lang-commonlisp",
        &[("zephyr-extension.json", LANG_COMMONLISP)],
    ),
    (
        "zephyr.lang-crystal",
        &[("zephyr-extension.json", LANG_CRYSTAL)],
    ),
    ("zephyr.lang-css", &[("zephyr-extension.json", LANG_CSS)]),
    (
        "zephyr.lang-cypher",
        &[("zephyr-extension.json", LANG_CYPHER)],
    ),
    ("zephyr.lang-d", &[("zephyr-extension.json", LANG_D)]),
    ("zephyr.lang-diff", &[("zephyr-extension.json", LANG_DIFF)]),
    (
        "zephyr.lang-dockerfile",
        &[("zephyr-extension.json", LANG_DOCKERFILE)],
    ),
    ("zephyr.lang-dtd", &[("zephyr-extension.json", LANG_DTD)]),
    (
        "zephyr.lang-dylan",
        &[("zephyr-extension.json", LANG_DYLAN)],
    ),
    ("zephyr.lang-ebnf", &[("zephyr-extension.json", LANG_EBNF)]),
    ("zephyr.lang-ecl", &[("zephyr-extension.json", LANG_ECL)]),
    (
        "zephyr.lang-eiffel",
        &[("zephyr-extension.json", LANG_EIFFEL)],
    ),
    ("zephyr.lang-elm", &[("zephyr-extension.json", LANG_ELM)]),
    (
        "zephyr.lang-erlang",
        &[("zephyr-extension.json", LANG_ERLANG)],
    ),
    (
        "zephyr.lang-factor",
        &[("zephyr-extension.json", LANG_FACTOR)],
    ),
    ("zephyr.lang-fcl", &[("zephyr-extension.json", LANG_FCL)]),
    (
        "zephyr.lang-forth",
        &[("zephyr-extension.json", LANG_FORTH)],
    ),
    (
        "zephyr.lang-fortran",
        &[("zephyr-extension.json", LANG_FORTRAN)],
    ),
    ("zephyr.lang-gas", &[("zephyr-extension.json", LANG_GAS)]),
    (
        "zephyr.lang-gherkin",
        &[("zephyr-extension.json", LANG_GHERKIN)],
    ),
    ("zephyr.lang-go", &[("zephyr-extension.json", LANG_GO)]),
    (
        "zephyr.lang-groovy",
        &[("zephyr-extension.json", LANG_GROOVY)],
    ),
    (
        "zephyr.lang-haskell",
        &[("zephyr-extension.json", LANG_HASKELL)],
    ),
    ("zephyr.lang-haxe", &[("zephyr-extension.json", LANG_HAXE)]),
    ("zephyr.lang-http", &[("zephyr-extension.json", LANG_HTTP)]),
    ("zephyr.lang-idl", &[("zephyr-extension.json", LANG_IDL)]),
    (
        "zephyr.lang-javascript",
        &[("zephyr-extension.json", LANG_JAVASCRIPT)],
    ),
    (
        "zephyr.lang-jinja2",
        &[("zephyr-extension.json", LANG_JINJA2)],
    ),
    (
        "zephyr.lang-julia",
        &[("zephyr-extension.json", LANG_JULIA)],
    ),
    (
        "zephyr.lang-livescript",
        &[("zephyr-extension.json", LANG_LIVESCRIPT)],
    ),
    ("zephyr.lang-lua", &[("zephyr-extension.json", LANG_LUA)]),
    (
        "zephyr.lang-mathematica",
        &[("zephyr-extension.json", LANG_MATHEMATICA)],
    ),
    ("zephyr.lang-mbox", &[("zephyr-extension.json", LANG_MBOX)]),
    ("zephyr.lang-mirc", &[("zephyr-extension.json", LANG_MIRC)]),
    (
        "zephyr.lang-mllike",
        &[("zephyr-extension.json", LANG_MLLIKE)],
    ),
    (
        "zephyr.lang-modelica",
        &[("zephyr-extension.json", LANG_MODELICA)],
    ),
    (
        "zephyr.lang-mscgen",
        &[("zephyr-extension.json", LANG_MSCGEN)],
    ),
    (
        "zephyr.lang-mumps",
        &[("zephyr-extension.json", LANG_MUMPS)],
    ),
    (
        "zephyr.lang-nginx",
        &[("zephyr-extension.json", LANG_NGINX)],
    ),
    ("zephyr.lang-nsis", &[("zephyr-extension.json", LANG_NSIS)]),
    (
        "zephyr.lang-ntriples",
        &[("zephyr-extension.json", LANG_NTRIPLES)],
    ),
    (
        "zephyr.lang-octave",
        &[("zephyr-extension.json", LANG_OCTAVE)],
    ),
    ("zephyr.lang-oz", &[("zephyr-extension.json", LANG_OZ)]),
    (
        "zephyr.lang-pascal",
        &[("zephyr-extension.json", LANG_PASCAL)],
    ),
    (
        "zephyr.lang-pegjs",
        &[("zephyr-extension.json", LANG_PEGJS)],
    ),
    ("zephyr.lang-perl", &[("zephyr-extension.json", LANG_PERL)]),
    ("zephyr.lang-pig", &[("zephyr-extension.json", LANG_PIG)]),
    (
        "zephyr.lang-powershell",
        &[("zephyr-extension.json", LANG_POWERSHELL)],
    ),
    (
        "zephyr.lang-properties",
        &[("zephyr-extension.json", LANG_PROPERTIES)],
    ),
    (
        "zephyr.lang-protobuf",
        &[("zephyr-extension.json", LANG_PROTOBUF)],
    ),
    ("zephyr.lang-pug", &[("zephyr-extension.json", LANG_PUG)]),
    (
        "zephyr.lang-puppet",
        &[("zephyr-extension.json", LANG_PUPPET)],
    ),
    (
        "zephyr.lang-python",
        &[("zephyr-extension.json", LANG_PYTHON)],
    ),
    ("zephyr.lang-q", &[("zephyr-extension.json", LANG_Q)]),
    ("zephyr.lang-r", &[("zephyr-extension.json", LANG_R)]),
    ("zephyr.lang-rpm", &[("zephyr-extension.json", LANG_RPM)]),
    ("zephyr.lang-ruby", &[("zephyr-extension.json", LANG_RUBY)]),
    ("zephyr.lang-rust", &[("zephyr-extension.json", LANG_RUST)]),
    ("zephyr.lang-sas", &[("zephyr-extension.json", LANG_SAS)]),
    ("zephyr.lang-sass", &[("zephyr-extension.json", LANG_SASS)]),
    (
        "zephyr.lang-scheme",
        &[("zephyr-extension.json", LANG_SCHEME)],
    ),
    (
        "zephyr.lang-shell",
        &[("zephyr-extension.json", LANG_SHELL)],
    ),
    (
        "zephyr.lang-sieve",
        &[("zephyr-extension.json", LANG_SIEVE)],
    ),
    (
        "zephyr.lang-smalltalk",
        &[("zephyr-extension.json", LANG_SMALLTALK)],
    ),
    ("zephyr.lang-solr", &[("zephyr-extension.json", LANG_SOLR)]),
    (
        "zephyr.lang-sparql",
        &[("zephyr-extension.json", LANG_SPARQL)],
    ),
    (
        "zephyr.lang-spreadsheet",
        &[("zephyr-extension.json", LANG_SPREADSHEET)],
    ),
    ("zephyr.lang-sql", &[("zephyr-extension.json", LANG_SQL)]),
    ("zephyr.lang-stex", &[("zephyr-extension.json", LANG_STEX)]),
    (
        "zephyr.lang-stylus",
        &[("zephyr-extension.json", LANG_STYLUS)],
    ),
    (
        "zephyr.lang-swift",
        &[("zephyr-extension.json", LANG_SWIFT)],
    ),
    ("zephyr.lang-tcl", &[("zephyr-extension.json", LANG_TCL)]),
    (
        "zephyr.lang-textile",
        &[("zephyr-extension.json", LANG_TEXTILE)],
    ),
    (
        "zephyr.lang-tiddlywiki",
        &[("zephyr-extension.json", LANG_TIDDLYWIKI)],
    ),
    ("zephyr.lang-tiki", &[("zephyr-extension.json", LANG_TIKI)]),
    ("zephyr.lang-toml", &[("zephyr-extension.json", LANG_TOML)]),
    (
        "zephyr.lang-troff",
        &[("zephyr-extension.json", LANG_TROFF)],
    ),
    ("zephyr.lang-ttcn", &[("zephyr-extension.json", LANG_TTCN)]),
    (
        "zephyr.lang-ttcn-cfg",
        &[("zephyr-extension.json", LANG_TTCN_CFG)],
    ),
    (
        "zephyr.lang-turtle",
        &[("zephyr-extension.json", LANG_TURTLE)],
    ),
    ("zephyr.lang-vb", &[("zephyr-extension.json", LANG_VB)]),
    (
        "zephyr.lang-vbscript",
        &[("zephyr-extension.json", LANG_VBSCRIPT)],
    ),
    (
        "zephyr.lang-velocity",
        &[("zephyr-extension.json", LANG_VELOCITY)],
    ),
    (
        "zephyr.lang-verilog",
        &[("zephyr-extension.json", LANG_VERILOG)],
    ),
    ("zephyr.lang-vhdl", &[("zephyr-extension.json", LANG_VHDL)]),
    ("zephyr.lang-wast", &[("zephyr-extension.json", LANG_WAST)]),
    (
        "zephyr.lang-webidl",
        &[("zephyr-extension.json", LANG_WEBIDL)],
    ),
    ("zephyr.lang-xml", &[("zephyr-extension.json", LANG_XML)]),
    (
        "zephyr.lang-xquery",
        &[("zephyr-extension.json", LANG_XQUERY)],
    ),
    (
        "zephyr.lang-yacas",
        &[("zephyr-extension.json", LANG_YACAS)],
    ),
    ("zephyr.lang-yaml", &[("zephyr-extension.json", LANG_YAML)]),
    ("zephyr.lang-z80", &[("zephyr-extension.json", LANG_Z80)]),
];

/// Semua paket bundled. Id WAJIB sama dengan `KATALOG_BUNDLED` di
/// src/lib/extCatalog.ts — kalau menambah, ubah keduanya.
const PAKET: &[Paket] = &[
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
        "zephyr.ikon-bulat",
        &[
            ("zephyr-extension.json", IKON_BULAT),
            ("icons/bulat.json", IKON_BULAT_JSON),
        ],
    ),
];

/// Cari paket bundled mana pun (asli atau bahasa) berdasarkan id.
fn cari_paket(id: &str) -> Option<Paket> {
    PAKET
        .iter()
        .copied()
        .find(|(pid, _)| *pid == id)
        .or_else(|| PAKET_BAHASA.iter().copied().find(|(pid, _)| *pid == id))
}

/// Tulis paket bundled ke folder staging lalu kembalikan path-nya.
/// Frontend memanggil `extensions_install` dengan path ini.
#[tauri::command]
pub fn extensions_write_bundled(state: State<AppState>, id: String) -> ZResult<String> {
    let paket =
        cari_paket(&id).ok_or_else(|| ZephyrError::NotFound(format!("paket bundled {id}")))?;

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

/// Daftar id paket bundled (dipakai UI untuk menandai "tersedia offline
/// / terpasang"). Id di sini = id di `PAKET`, dicek oleh test di bawah.
#[tauri::command]
pub fn extensions_bundled_ids() -> Vec<String> {
    PAKET
        .iter()
        .chain(PAKET_BAHASA.iter())
        .map(|(id, _)| (*id).to_string())
        .collect()
}

/// Index registry bundled — entri Marketplace untuk tiap paket di `PAKET`.
///
/// Dipakai `ext_registry_list` (folder `.registry/zephyr.json`) supaya tab
/// Marketplace tidak kosong di instalasi baru: paket bundled muncul sebagai
/// entri yang bisa dipasang offline, tanpa menunggu registry remote user.
/// Hanya field yang relevan untuk UI; `url` kosong karena paketnya ditulis
/// oleh `extensions_write_bundled`, bukan diunduh.
/// Metadata katalog tiap paket asli: nama tampilan, deskripsi, 1-3 huruf
/// logo, dan bahasa yang direkomendasikan. `id` = kunci.
const META_PAKET: &[(&str, &str, &str, &str, &[&str])] = &[
    (
        "zephyr.tema-kertas",
        "Tema Kertas",
        "Tema terang kontras rendah, cocok untuk siang di ruang terbuka.",
        "PT",
        &[],
    ),
    (
        "zephyr.keymap-sublime",
        "Keymap ala Sublime",
        "Chord familiar Sublime Text: Ctrl+P, Ctrl+Shift+D, Ctrl+K Ctrl+B.",
        "SB",
        &[],
    ),
    (
        "zephyr.snippet-python",
        "Snippet Python",
        "Kerangka cepat: def, class, if __main__",
        "PY",
        &["python"],
    ),
    (
        "zephyr.snippet-react",
        "Snippet React",
        "Komponen, useState, useEffect, rfc.",
        "RC",
        &["javascript", "typescript"],
    ),
    (
        "zephyr.ikon-bulat",
        "Ikon Bulat",
        "Tema ikon berbentuk lingkaran untuk file explorer.",
        "IB",
        &[],
    ),
];

/// Index registry bundled — entri Marketplace untuk tiap paket di `PAKET`
/// dan `PAKET_BAHASA`.
///
/// Dipakai `ext_registry_list` (folder `.registry/zephyr.json`) supaya tab
/// Marketplace tidak kosong di instalasi baru: paket bundled muncul sebagai
/// entri yang bisa dipasang offline, tanpa menunggu registry remote user.
/// `url` sengaja dikosongkan — frontend menandai entri tanpa url sebagai
/// "tersedia offline" (install lewat extensions_write_bundled, bukan unduh).
pub fn index_bundled() -> String {
    // Metadata paket asli (PAKET) — id, nama, deskripsi, logo, bahasa.
    let meta_asli = |id: &str| -> serde_json::Value {
        let (nama, desk, logo, bhs) = META_PAKET
            .iter()
            .find(|(mid, _, _, _, _)| *mid == id)
            .map(|(_, n, d, l, b)| (*n, *d, *l, *b))
            .unwrap_or((id, id, "", &[][..]));
        serde_json::json!({
            "id": id,
            "name": nama,
            "publisher": "zephyr",
            "version": "1.0.0",
            "description": desk,
            "logo": logo,
            "languages": bhs,
        })
    };
    // Metadata paket bahasa (PAKET_BAHASA) — id berakhiran .lang-<mode>.
    // `languages` diambil langsung dari manifest (contributes.languages[].id)
    // karena id itulah yang dipakai detectLang di frontend. Kalau memakai
    // nama tampilan ("Rust") rekomendasi tidak pernah cocok — detectLang
    // mengembalikan id kecil ("rust").
    let meta_bahasa = |id: &str, manifest: &str| -> serde_json::Value {
        let (nama, desk, logo, warna) = META_BAHASA
            .iter()
            .find(|(mid, _, _, _, _)| *mid == id)
            .map(|(_, n, d, l, w)| (*n, *d, *l, *w))
            .unwrap_or((id, id, "", "#6b7280"));
        // Logo asli (SVG data URI) dari crate::ext_lang_icons — kalau ada,
        // `iconUrl` diisi; frontend memakai <img> dan jatuh ke inisial saat
        // gambar gagal dimuat (tanpa ikon tetap tampil rapi berwarna brand).
        let icon_url = crate::ext_lang_icons::LOGO_URI
            .iter()
            .find(|(pid, _)| *pid == id)
            .map(|(_, uri)| *uri)
            .unwrap_or("");
        let bhs: Vec<String> = serde_json::from_str::<serde_json::Value>(manifest)
            .ok()
            .and_then(|m| {
                m.get("contributes")
                    .and_then(|c| c.get("languages"))
                    .cloned()
            })
            .and_then(|l| l.as_array().cloned())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        serde_json::json!({
            "id": id,
            "name": nama,
            "publisher": "zephyr",
            "version": "1.0.0",
            "description": desk,
            "logo": logo,
            "logoColor": warna,
            "iconUrl": icon_url,
            "languages": bhs,
        })
    };
    // Kategori dari folder kontribusi pertama (themes/keymaps/…); paket
    // bahasa hanya punya manifest → "Languages". WAJIB array — IndexEntry
    // menyimpan categories sebagai Vec<String>, string polos ditolak serde
    // dan membuat seluruh index bundled dibuang (penyebab Marketplace kosong).
    let kategori = |file: &[(&str, &str)]| -> serde_json::Value {
        let kat = file
            .iter()
            .find(|(rel, _)| *rel != "zephyr-extension.json")
            .map(|(rel, _)| match rel.split('/').next().unwrap_or("") {
                "themes" => "Themes",
                "keymaps" => "Keymaps",
                "snippets" => "Snippets",
                "icons" => "Icon Themes",
                _ => "Languages",
            })
            .unwrap_or("Languages");
        serde_json::json!([kat])
    };
    let entri: Vec<serde_json::Value> = PAKET
        .iter()
        .map(|(id, file)| {
            let mut e = meta_asli(id);
            e["categories"] = kategori(file);
            e
        })
        .chain(PAKET_BAHASA.iter().map(|(id, file)| {
            // file = [("zephyr-extension.json", <manifest>)] — kirim manifest
            // ke meta_bahasa supaya `languages` berisi id bahasa asli.
            let manifest = file
                .iter()
                .find(|(rel, _)| *rel == "zephyr-extension.json")
                .map(|(_, m)| *m)
                .unwrap_or("");
            let mut e = meta_bahasa(id, manifest);
            e["categories"] = kategori(file);
            e
        }))
        .collect();
    serde_json::json!({ "version": 1, "extensions": entri }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_bundled_valid_dan_lenyap() {
        let s = index_bundled();
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        let arr = v.get("extensions").unwrap().as_array().unwrap();
        assert_eq!(
            arr.len(),
            PAKET.len() + PAKET_BAHASA.len(),
            "index harus mencakup semua paket"
        );
        // tiap entri punya id unik (PAKET sendiri yang dijamin)
        let mut ids: Vec<_> = arr
            .iter()
            .map(|e| e["id"].as_str().unwrap().to_string())
            .collect();
        ids.sort();
        let unik: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unik.len(), ids.len(), "id index bundled harus unik");
    }

    /// Round-trip index_bundled() lewat parse_index persis seperti
    /// ext_registry_list. Penyebab Marketplace pernah kosong diam-diam:
    /// `categories` tertulis string, bukan array, jadi serde menolak
    /// seluruh index bundled. Uji ini memastikan itu tidak terulang.
    #[test]
    fn index_bundled_lolos_parse_index() {
        let s = index_bundled();
        let entri = crate::ext_registry::parse_index_pub(&s);
        assert_eq!(
            entri.len(),
            PAKET.len() + PAKET_BAHASA.len(),
            "index bundled harus bisa di-parse utuh oleh registry"
        );
        // setiap entri punya categories array (bukan string)
        for e in &entri {
            assert!(!e.categories.is_empty(), "{} butuh categories", e.id);
        }
    }

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

            let v: serde_json::Value = serde_json::from_str(manifest)
                .unwrap_or_else(|e| panic!("{id}: manifest rusak {e}"));

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
