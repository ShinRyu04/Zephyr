use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use tauri::State;

type Paket = (&'static str, &'static [(&'static str, &'static str)]);

/*
 * The extra catalog (icon themes, keymaps, snippets, one theme) lives in its
 * own file: this one is already 1500 lines of language manifests, and mixing
 * another 500 lines of them in made the list impossible to scan.
 */
#[path = "ext_bundled_extra.rs"]
mod extra;

const TEMA_KERTAS: &str = r##"{
  "id": "zephyr.tema-kertas",
  "name": "Paper Theme",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Light low-contrast theme, suited to daytime in bright rooms.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Themes"],
  "contributes": {
    "themes": [{ "label": "Kertas", "kind": "light", "path": "./themes/kertas.json" }]
  }
}"##;

const TEMA_KERTAS_JSON: &str = r##"{
  "colors": {
    "--bg": "#faf7f0",
    "--fg": "#2e2a24",
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
    "--editor-bg": "#faf7f0",
    "--editor-gutter": "#a89f8c",
    "--editor-active-line": "#f0ebdd",
    "--editor-selection": "#e3dccb",
    "--syn-comment": "#8b8272",
    "--syn-keyword": "#8a3fa0",
    "--syn-string": "#4f7a28",
    "--syn-number": "#a2662f",
    "--syn-function": "#2f6ba2",
    "--syn-variable": "#7a5c2e",
    "--syn-type": "#1f7a6f",
    "--syn-operator": "#6f6759",
    "--syn-tag": "#1f7a6f",
    "--syn-attr": "#2f6ba2",
    "--syn-invalid": "#b3352f"
  }
}"##;

const KEYMAP_SUBLIME: &str = r##"{
  "id": "zephyr.keymap-sublime",
  "name": "Sublime-style Keymap",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Chord familiar Sublime Text.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Keymaps"],
  "contributes": {
    "keymaps": [{ "label": "Sublime", "path": "./keymaps/sublime.json" }]
  }
}"##;

/*
 * Every command below must already exist in the app.
 *
 * The manifest header promises chords for commands "the app already has", and
 * an earlier version of this file broke that promise three times over:
 * `editor.copyLineDown`, `editor.moveLineUp`, `editor.moveLineDown` and
 * `editor.splitRight` are NOT commands Zephyr implements. A keymap that binds a
 * missing command is worse than an empty keymap - the user switches to Sublime
 * chords, nothing happens for those keys, and no error is shown, because there
 * is no binding to fail. The real names are `editor.line.moveUp`,
 * `editor.line.moveDown`, and `pane.splitRight`.
 *
 * `Ctrl+Shift+D` was also removed: the app already binds it to `debug.focus`
 * (keybindings.ts), so a keymap claiming it could never take effect and the
 * Shortcuts table had no source to display for the row.
 *
 * If a command is renamed, this file must be updated with it. The table in
 * Settings -> Keyboard Shortcuts reads these entries to show where a chord came
 * from, so a stale name shows up as a missing source rather than as an error.
 */
const KEYMAP_SUBLIME_JSON: &str = r##"[
  { "key": "Ctrl+Shift+Up", "command": "editor.line.moveUp" },
  { "key": "Ctrl+Shift+Down", "command": "editor.line.moveDown" },
  { "key": "Ctrl+K Ctrl+B", "command": "workbench.action.toggleSidebar" },
  { "key": "Ctrl+Shift+K", "command": "editor.line.delete" },
  { "key": "Ctrl+Shift+L", "command": "editor.select.occurrences" }
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
    "description": "function definition with type annotations"
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
  "description": "Function components, useState, useEffect, custom hook, context.",
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
    "description": "function component in TS"
  },
  "useState": {
    "prefix": "us",
    "body": ["const [${1:nilai}, set${2:Nilai}] = useState<${3:string}>(${4:''});"],
    "description": "hook state"
  },
  "useEffect": {
    "prefix": "ue",
    "body": ["useEffect(() => {", "\t${1:// efek}", "\treturn () => {", "\t\t${2:// bersihkan}", "\t};", "}, [${3:}]);"],
    "description": "effect hook with cleanup"
  },
  "custom hook": {
    "prefix": "hook",
    "body": ["export function use${1:Nama}() {", "\t${2:// logika}", "\treturn { ${3:} };", "}"],
    "description": "custom hook"
  }
}"##;

const IKON_BULAT: &str = r##"{
  "id": "zephyr.ikon-bulat",
  "name": "Round Icons",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "File tree icon theme: language initials in the official colours.",
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

const LANG_APL: &str = r##"{"id":"zephyr.lang-apl","name":"Bahasa APL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight APL (.apl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"apl","label":"APL","extensions":[".apl"],"legacyMode":"apl"}]}}"##;
const LANG_ASCIIARMOR: &str = r##"{"id":"zephyr.lang-asciiarmor","name":"Bahasa ASCII Armor","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight ASCII Armor (.asc).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"asciiarmor","label":"ASCII Armor","extensions":[".asc", ".pgp"],"legacyMode":"asciiarmor"}]}}"##;
const LANG_BRAINFUCK: &str = r##"{"id":"zephyr.lang-brainfuck","name":"Bahasa Brainfuck","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Brainfuck (.bf).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"brainfuck","label":"Brainfuck","extensions":[".bf", ".b"],"legacyMode":"brainfuck"}]}}"##;
const LANG_CLOJURE: &str = r##"{"id":"zephyr.lang-clojure","name":"Bahasa Clojure","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Clojure (.clj).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"clojure","label":"Clojure","extensions":[".clj", ".cljc", ".cljs"],"legacyMode":"clojure"}]}}"##;
const LANG_CMAKE: &str = r##"{"id":"zephyr.lang-cmake","name":"Bahasa CMake","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CMake (.cmake).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"cmake","label":"CMake","extensions":[".cmake"],"legacyMode":"cmake"}]}}"##;
const LANG_COBOL: &str = r##"{"id":"zephyr.lang-cobol","name":"Bahasa COBOL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight COBOL (.cbl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"cobol","label":"COBOL","extensions":[".cbl", ".cob"],"legacyMode":"cobol"}]}}"##;
const LANG_COFFEESCRIPT: &str = r##"{"id":"zephyr.lang-coffeescript","name":"Bahasa CoffeeScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CoffeeScript (.coffee).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"coffeescript","label":"CoffeeScript","extensions":[".coffee"],"legacyMode":"coffeescript"}]}}"##;
const LANG_COMMONLISP: &str = r##"{"id":"zephyr.lang-commonlisp","name":"Bahasa Common Lisp","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Common Lisp (.lisp).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"commonlisp","label":"Common Lisp","extensions":[".lisp", ".lsp"],"legacyMode":"commonlisp"}]}}"##;
const LANG_CRYSTAL: &str = r##"{"id":"zephyr.lang-crystal","name":"Bahasa Crystal","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Crystal (.cr).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"crystal","label":"Crystal","extensions":[".cr"],"legacyMode":"crystal"}]}}"##;
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
const LANG_GROOVY: &str = r##"{"id":"zephyr.lang-groovy","name":"Bahasa Groovy","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Groovy (.groovy).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"groovy","label":"Groovy","extensions":[".groovy", ".gradle", ".gvy"],"legacyMode":"groovy"}]}}"##;
const LANG_HASKELL: &str = r##"{"id":"zephyr.lang-haskell","name":"Bahasa Haskell","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Haskell (.hs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"haskell","label":"Haskell","extensions":[".hs", ".lhs"],"legacyMode":"haskell"}]}}"##;
const LANG_HAXE: &str = r##"{"id":"zephyr.lang-haxe","name":"Bahasa Haxe","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Haxe (.hx).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"haxe","label":"Haxe","extensions":[".hx"],"legacyMode":"haxe"}]}}"##;
const LANG_HTTP: &str = r##"{"id":"zephyr.lang-http","name":"Bahasa HTTP","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight HTTP (.http).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"http","label":"HTTP","extensions":[".http", ".rest"],"legacyMode":"http"}]}}"##;
const LANG_IDL: &str = r##"{"id":"zephyr.lang-idl","name":"Bahasa IDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight IDL (.idl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"idl","label":"IDL","extensions":[".idl"],"legacyMode":"idl"}]}}"##;
const LANG_JINJA2: &str = r##"{"id":"zephyr.lang-jinja2","name":"Bahasa Jinja2","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Jinja2 (.jinja).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"jinja2","label":"Jinja2","extensions":[".jinja", ".j2", ".jinja2"],"legacyMode":"jinja2"}]}}"##;
const LANG_JULIA: &str = r##"{"id":"zephyr.lang-julia","name":"Bahasa Julia","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Julia (.jl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"julia","label":"Julia","extensions":[".jl"],"legacyMode":"julia"}]}}"##;
const LANG_LIVESCRIPT: &str = r##"{"id":"zephyr.lang-livescript","name":"Bahasa LiveScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight LiveScript (.ls).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"livescript","label":"LiveScript","extensions":[".ls"],"legacyMode":"livescript"}]}}"##;
const LANG_MATHEMATICA: &str = r##"{"id":"zephyr.lang-mathematica","name":"Bahasa Wolfram","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Wolfram (.m).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mathematica","label":"Wolfram","extensions":[".m", ".wl", ".wls"],"legacyMode":"mathematica"}]}}"##;
const LANG_MBOX: &str = r##"{"id":"zephyr.lang-mbox","name":"Bahasa Mbox","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Mbox (.mbox).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mbox","label":"Mbox","extensions":[".mbox"],"legacyMode":"mbox"}]}}"##;
const LANG_MIRC: &str = r##"{"id":"zephyr.lang-mirc","name":"Bahasa mIRC","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight mIRC (.mrc).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"mirc","label":"mIRC","extensions":[".mrc"],"legacyMode":"mirc"}]}}"##;
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
const LANG_PERL: &str = r##"{"id":"zephyr.lang-perl","name":"Bahasa Perl","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Perl (.t, .pod).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"perl","label":"Perl","extensions":[".t",".pod"],"legacyMode":"perl"}]}}"##;
const LANG_PIG: &str = r##"{"id":"zephyr.lang-pig","name":"Bahasa Pig","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Pig (.pig).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pig","label":"Pig","extensions":[".pig"],"legacyMode":"pig"}]}}"##;
const LANG_POWERSHELL: &str = r##"{"id":"zephyr.lang-powershell","name":"Bahasa PowerShell","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight PowerShell (.psm1, .psd1).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"powershell","label":"PowerShell","extensions":[".psm1",".psd1"],"legacyMode":"powershell"}]}}"##;
const LANG_PROTOBUF: &str = r##"{"id":"zephyr.lang-protobuf","name":"Bahasa Protocol Buffers","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Protocol Buffers (.proto).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"protobuf","label":"Protocol Buffers","extensions":[".proto"],"legacyMode":"protobuf"}]}}"##;
const LANG_PUG: &str = r##"{"id":"zephyr.lang-pug","name":"Bahasa Pug","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Pug (.pug).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"pug","label":"Pug","extensions":[".pug", ".jade"],"legacyMode":"pug"}]}}"##;
const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Puppet (.pp).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"puppet","label":"Puppet","extensions":[".pp"],"legacyMode":"puppet"}]}}"##;
const LANG_PYTHON: &str = r##"{"id":"zephyr.lang-python","name":"Bahasa Python","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Python (.pyi).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"python","label":"Python","extensions":[".pyi"],"legacyMode":"python"}]}}"##;
const LANG_Q: &str = r##"{"id":"zephyr.lang-q","name":"Bahasa q/Kdb+","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight q/Kdb+ (.q).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"q","label":"q/Kdb+","extensions":[".q"],"legacyMode":"q"}]}}"##;
const LANG_R: &str = r##"{"id":"zephyr.lang-r","name":"Bahasa R","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight R (.r).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"r","label":"R","extensions":[".r", ".R", ".Rmd"],"legacyMode":"r"}]}}"##;
const LANG_RPM: &str = r##"{"id":"zephyr.lang-rpm","name":"Bahasa RPM Spec","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight RPM Spec (.spec).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"rpm","label":"RPM Spec","extensions":[".spec"],"legacyMode":"rpm"}]}}"##;
const LANG_RUBY: &str = r##"{"id":"zephyr.lang-ruby","name":"Bahasa Ruby","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Ruby (.erb, .gemspec).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ruby","label":"Ruby","extensions":[".erb",".gemspec"],"legacyMode":"ruby"}]}}"##;
const LANG_SAS: &str = r##"{"id":"zephyr.lang-sas","name":"Bahasa sas","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight sas (.sas).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sas","label":"sas","extensions":[".sas"],"legacyMode":"sas"}]}}"##;
const LANG_SASS: &str = r##"{"id":"zephyr.lang-sass","name":"Bahasa Sass","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Sass (.sass).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sass","label":"Sass","extensions":[".sass"],"legacyMode":"sass"}]}}"##;
const LANG_SCHEME: &str = r##"{"id":"zephyr.lang-scheme","name":"Bahasa Scheme","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Scheme (.scm).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"scheme","label":"Scheme","extensions":[".scm", ".ss", ".rkt"],"legacyMode":"scheme"}]}}"##;
const LANG_SHELL: &str = r##"{"id":"zephyr.lang-shell","name":"Bahasa Shell / Bash","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Shell / Bash (.fish).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"shell","label":"Shell / Bash","extensions":[".fish"],"legacyMode":"shell"}]}}"##;
const LANG_SIEVE: &str = r##"{"id":"zephyr.lang-sieve","name":"Bahasa Sieve","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Sieve (.sieve).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sieve","label":"Sieve","extensions":[".sieve"],"legacyMode":"sieve"}]}}"##;
const LANG_SMALLTALK: &str = r##"{"id":"zephyr.lang-smalltalk","name":"Bahasa Smalltalk","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Smalltalk (.st).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"smalltalk","label":"Smalltalk","extensions":[".st", ".sq"],"legacyMode":"smalltalk"}]}}"##;
const LANG_SOLR: &str = r##"{"id":"zephyr.lang-solr","name":"Bahasa Solr","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Solr (.solr).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"solr","label":"Solr","extensions":[".solr"],"legacyMode":"solr"}]}}"##;
const LANG_SPARQL: &str = r##"{"id":"zephyr.lang-sparql","name":"Bahasa SPARQL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight SPARQL (.rq).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"sparql","label":"SPARQL","extensions":[".rq", ".sparql"],"legacyMode":"sparql"}]}}"##;
const LANG_SPREADSHEET: &str = r##"{"id":"zephyr.lang-spreadsheet","name":"Bahasa CSV / TSV","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight CSV / TSV (.csv).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"spreadsheet","label":"CSV / TSV","extensions":[".csv", ".tsv", ".tab"],"legacyMode":"spreadsheet"}]}}"##;
const LANG_STEX: &str = r##"{"id":"zephyr.lang-stex","name":"Bahasa LaTeX","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight LaTeX (.tex).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"stex","label":"LaTeX","extensions":[".tex", ".ltx", ".sty"],"legacyMode":"stex"}]}}"##;
const LANG_STYLUS: &str = r##"{"id":"zephyr.lang-stylus","name":"Bahasa Stylus","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Stylus (.styl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"stylus","label":"Stylus","extensions":[".styl"],"legacyMode":"stylus"}]}}"##;
const LANG_TCL: &str = r##"{"id":"zephyr.lang-tcl","name":"Bahasa Tcl","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Tcl (.tcl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tcl","label":"Tcl","extensions":[".tcl", ".tk"],"legacyMode":"tcl"}]}}"##;
const LANG_TEXTILE: &str = r##"{"id":"zephyr.lang-textile","name":"Bahasa Textile","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Textile (.textile).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"textile","label":"Textile","extensions":[".textile"],"legacyMode":"textile"}]}}"##;
const LANG_TIDDLYWIKI: &str = r##"{"id":"zephyr.lang-tiddlywiki","name":"Bahasa TiddlyWiki","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TiddlyWiki (.tid).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tiddlywiki","label":"TiddlyWiki","extensions":[".tid", ".wiki"],"legacyMode":"tiddlywiki"}]}}"##;
const LANG_TIKI: &str = r##"{"id":"zephyr.lang-tiki","name":"Bahasa Tiki","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Tiki (.tiki).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"tiki","label":"Tiki","extensions":[".tiki"],"legacyMode":"tiki"}]}}"##;
const LANG_TROFF: &str = r##"{"id":"zephyr.lang-troff","name":"Bahasa troff","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight troff (.roff).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"troff","label":"troff","extensions":[".roff", ".man", ".1", ".groff"],"legacyMode":"troff"}]}}"##;
const LANG_TTCN: &str = r##"{"id":"zephyr.lang-ttcn","name":"Bahasa TTCN-3","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight TTCN-3 (.ttcn).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"ttcn","label":"TTCN-3","extensions":[".ttcn", ".ttcn3"],"legacyMode":"ttcn"}]}}"##;
const LANG_TURTLE: &str = r##"{"id":"zephyr.lang-turtle","name":"Bahasa Turtle","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Turtle (.ttl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"turtle","label":"Turtle","extensions":[".ttl", ".turtle", ".nt"],"legacyMode":"turtle"}]}}"##;
const LANG_VB: &str = r##"{"id":"zephyr.lang-vb","name":"Bahasa Visual Basic","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Visual Basic (.vb).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vb","label":"Visual Basic","extensions":[".vb", ".vbs"],"legacyMode":"vb"}]}}"##;
const LANG_VBSCRIPT: &str = r##"{"id":"zephyr.lang-vbscript","name":"Bahasa VBScript","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight VBScript (.vbs).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vbscript","label":"VBScript","extensions":[".vbs", ".vbe"],"legacyMode":"vbscript"}]}}"##;
const LANG_VELOCITY: &str = r##"{"id":"zephyr.lang-velocity","name":"Bahasa Velocity","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Velocity (.vm).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"velocity","label":"Velocity","extensions":[".vm", ".vtl", ".vsl"],"legacyMode":"velocity"}]}}"##;
const LANG_VERILOG: &str = r##"{"id":"zephyr.lang-verilog","name":"Bahasa Verilog","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Verilog (.v).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"verilog","label":"Verilog","extensions":[".v", ".sv", ".svh", ".vh"],"legacyMode":"verilog"}]}}"##;
const LANG_VHDL: &str = r##"{"id":"zephyr.lang-vhdl","name":"Bahasa VHDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight VHDL (.vhd).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"vhdl","label":"VHDL","extensions":[".vhd", ".vhdl"],"legacyMode":"vhdl"}]}}"##;
const LANG_WAST: &str = r##"{"id":"zephyr.lang-wast","name":"Bahasa WebAssembly Text","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight WebAssembly Text (.wast).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"wast","label":"WebAssembly Text","extensions":[".wast", ".wat"],"legacyMode":"wast"}]}}"##;
const LANG_WEBIDL: &str = r##"{"id":"zephyr.lang-webidl","name":"Bahasa Web IDL","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Web IDL (.webidl).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"webidl","label":"Web IDL","extensions":[".webidl", ".idl"],"legacyMode":"webidl"}]}}"##;
const LANG_XML: &str = r##"{"id":"zephyr.lang-xml","name":"Bahasa XML / HTML","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight XML / HTML (.xsd, .xsl, .xhtml).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"xml","label":"XML / HTML","extensions":[".xsd",".xsl",".xhtml"],"legacyMode":"xml"}]}}"##;
const LANG_XQUERY: &str = r##"{"id":"zephyr.lang-xquery","name":"Bahasa XQuery","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight XQuery (.xq).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"xquery","label":"XQuery","extensions":[".xq", ".xquery", ".xql"],"legacyMode":"xquery"}]}}"##;
const LANG_YACAS: &str = r##"{"id":"zephyr.lang-yacas","name":"Bahasa Yacas","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Yacas (.ys).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"yacas","label":"Yacas","extensions":[".ys"],"legacyMode":"yacas"}]}}"##;
const LANG_Z80: &str = r##"{"id":"zephyr.lang-z80","name":"Bahasa Z80 Assembly","publisher":"zephyr","version":"1.0.0","description":"Syntax highlight Z80 Assembly (.z80).","engines":{"zephyr":">=1.0"},"categories":["Languages"],"contributes":{"languages":[{"id":"z80","label":"Z80 Assembly","extensions":[".z80", ".asm"],"legacyMode":"z80"}]}}"##;

const META_BAHASA: &[(&str, &str, &str, &str, &str)] = &[
    (
        "zephyr.lang-apl",
        "APL",
        "APL syntax for the editor (CodeMirror legacy mode).",
        "APL",
        "#ff6347",
    ),
    (
        "zephyr.lang-asciiarmor",
        "ASCII Armor",
        "ASCII Armor syntax for the editor (CodeMirror legacy mode).",
        "AS",
        "#6b7280",
    ),
    (
        "zephyr.lang-brainfuck",
        "Brainfuck",
        "Brainfuck syntax for the editor (CodeMirror legacy mode).",
        "BR",
        "#ff6ec7",
    ),
    (
        "zephyr.lang-clojure",
        "Clojure",
        "Clojure syntax for the editor (CodeMirror legacy mode).",
        "CL",
        "#5881d8",
    ),
    (
        "zephyr.lang-cmake",
        "CMake",
        "CMake syntax for the editor (CodeMirror legacy mode).",
        "CM",
        "#064f8c",
    ),
    (
        "zephyr.lang-cobol",
        "COBOL",
        "COBOL syntax for the editor (CodeMirror legacy mode).",
        "CO",
        "#005ca5",
    ),
    (
        "zephyr.lang-coffeescript",
        "CoffeeScript",
        "CoffeeScript syntax for the editor (CodeMirror legacy mode).",
        "CO",
        "#6f4e37",
    ),
    (
        "zephyr.lang-commonlisp",
        "Common Lisp",
        "Common Lisp syntax for the editor (CodeMirror legacy mode).",
        "CO",
        "#3fb68b",
    ),
    (
        "zephyr.lang-crystal",
        "Crystal",
        "Crystal syntax for the editor (CodeMirror legacy mode).",
        "CR",
        "#1a1a1a",
    ),
    (
        "zephyr.lang-cypher",
        "Cypher",
        "Cypher syntax for the editor (CodeMirror legacy mode).",
        "CY",
        "#89d3c8",
    ),
    (
        "zephyr.lang-d",
        "D",
        "D syntax for the editor (CodeMirror legacy mode).",
        "D",
        "#b03931",
    ),
    (
        "zephyr.lang-diff",
        "Diff",
        "Diff syntax for the editor (CodeMirror legacy mode).",
        "DIF",
        "#3b82f6",
    ),
    (
        "zephyr.lang-dockerfile",
        "Dockerfile",
        "Dockerfile syntax for the editor (CodeMirror legacy mode).",
        "DO",
        "#0db7ed",
    ),
    (
        "zephyr.lang-dtd",
        "DTD",
        "DTD syntax for the editor (CodeMirror legacy mode).",
        "DTD",
        "#e37933",
    ),
    (
        "zephyr.lang-dylan",
        "Dylan",
        "Dylan syntax for the editor (CodeMirror legacy mode).",
        "DY",
        "#6c6c6c",
    ),
    (
        "zephyr.lang-ebnf",
        "EBNF",
        "EBNF syntax for the editor (CodeMirror legacy mode).",
        "EBN",
        "#a3a3a3",
    ),
    (
        "zephyr.lang-ecl",
        "ECL",
        "ECL syntax for the editor (CodeMirror legacy mode).",
        "ECL",
        "#8a2be2",
    ),
    (
        "zephyr.lang-eiffel",
        "Eiffel",
        "Eiffel syntax for the editor (CodeMirror legacy mode).",
        "EI",
        "#4d41b1",
    ),
    (
        "zephyr.lang-elm",
        "Elm",
        "Elm syntax for the editor (CodeMirror legacy mode).",
        "ELM",
        "#60b5cc",
    ),
    (
        "zephyr.lang-erlang",
        "Erlang",
        "Erlang syntax for the editor (CodeMirror legacy mode).",
        "ER",
        "#a90533",
    ),
    (
        "zephyr.lang-factor",
        "Factor",
        "Factor syntax for the editor (CodeMirror legacy mode).",
        "FA",
        "#d5539a",
    ),
    (
        "zephyr.lang-fcl",
        "FCL",
        "FCL syntax for the editor (CodeMirror legacy mode).",
        "FCL",
        "#3b82f6",
    ),
    (
        "zephyr.lang-forth",
        "Forth",
        "Forth syntax for the editor (CodeMirror legacy mode).",
        "FO",
        "#e62b25",
    ),
    (
        "zephyr.lang-fortran",
        "Fortran",
        "Fortran syntax for the editor (CodeMirror legacy mode).",
        "FO",
        "#4d41b1",
    ),
    (
        "zephyr.lang-gas",
        "Assembly (GAS)",
        "Assembly (GAS) syntax for the editor (CodeMirror legacy mode).",
        "AS",
        "#6e4c13",
    ),
    (
        "zephyr.lang-gherkin",
        "Gherkin",
        "Gherkin syntax for the editor (CodeMirror legacy mode).",
        "GH",
        "#4a90d9",
    ),
    (
        "zephyr.lang-groovy",
        "Groovy",
        "Groovy syntax for the editor (CodeMirror legacy mode).",
        "GR",
        "#4298b8",
    ),
    (
        "zephyr.lang-haskell",
        "Haskell",
        "Haskell syntax for the editor (CodeMirror legacy mode).",
        "HA",
        "#5e5086",
    ),
    (
        "zephyr.lang-haxe",
        "Haxe",
        "Haxe syntax for the editor (CodeMirror legacy mode).",
        "HAX",
        "#ea8220",
    ),
    (
        "zephyr.lang-http",
        "HTTP",
        "HTTP syntax for the editor (CodeMirror legacy mode).",
        "HTT",
        "#4a90d9",
    ),
    (
        "zephyr.lang-idl",
        "IDL",
        "IDL syntax for the editor (CodeMirror legacy mode).",
        "IDL",
        "#e35b2a",
    ),
    (
        "zephyr.lang-jinja2",
        "Jinja2",
        "Jinja2 syntax for the editor (CodeMirror legacy mode).",
        "JI",
        "#b52e31",
    ),
    (
        "zephyr.lang-julia",
        "Julia",
        "Julia syntax for the editor (CodeMirror legacy mode).",
        "JU",
        "#9558b2",
    ),
    (
        "zephyr.lang-livescript",
        "LiveScript",
        "LiveScript syntax for the editor (CodeMirror legacy mode).",
        "LI",
        "#4a90d9",
    ),
    (
        "zephyr.lang-mathematica",
        "Wolfram",
        "Wolfram syntax for the editor (CodeMirror legacy mode).",
        "WO",
        "#dd1100",
    ),
    (
        "zephyr.lang-mbox",
        "Mbox",
        "Mbox syntax for the editor (CodeMirror legacy mode).",
        "MBO",
        "#6b7280",
    ),
    (
        "zephyr.lang-mirc",
        "mIRC",
        "mIRC syntax for the editor (CodeMirror legacy mode).",
        "MIR",
        "#9c4221",
    ),
    (
        "zephyr.lang-mllike",
        "OCaml / SML",
        "OCaml / SML syntax for the editor (CodeMirror legacy mode).",
        "OC",
        "#e37933",
    ),
    (
        "zephyr.lang-modelica",
        "Modelica",
        "Modelica syntax for the editor (CodeMirror legacy mode).",
        "MO",
        "#e35b2a",
    ),
    (
        "zephyr.lang-mscgen",
        "MscGen",
        "MscGen syntax for the editor (CodeMirror legacy mode).",
        "MS",
        "#6b7280",
    ),
    (
        "zephyr.lang-mumps",
        "MUMPS",
        "MUMPS syntax for the editor (CodeMirror legacy mode).",
        "MU",
        "#0aa674",
    ),
    (
        "zephyr.lang-nginx",
        "nginx Config",
        "nginx Config syntax for the editor (CodeMirror legacy mode).",
        "NG",
        "#009639",
    ),
    (
        "zephyr.lang-nsis",
        "NSIS",
        "NSIS syntax for the editor (CodeMirror legacy mode).",
        "NSI",
        "#0db7ed",
    ),
    (
        "zephyr.lang-ntriples",
        "N-Triples",
        "N-Triples syntax for the editor (CodeMirror legacy mode).",
        "NT",
        "#0c4b33",
    ),
    (
        "zephyr.lang-octave",
        "MATLAB / Octave",
        "MATLAB / Octave syntax for the editor (CodeMirror legacy mode).",
        "MA",
        "#0790c0",
    ),
    (
        "zephyr.lang-oz",
        "Oz",
        "Oz syntax for the editor (CodeMirror legacy mode).",
        "OZ",
        "#f7df1e",
    ),
    (
        "zephyr.lang-pascal",
        "Pascal",
        "Pascal syntax for the editor (CodeMirror legacy mode).",
        "PA",
        "#e62b25",
    ),
    (
        "zephyr.lang-pegjs",
        "PEG.js",
        "PEG.js syntax for the editor (CodeMirror legacy mode).",
        "PE",
        "#3178c6",
    ),
    (
        "zephyr.lang-perl",
        "Perl",
        "Perl syntax for the editor (CodeMirror legacy mode).",
        "PER",
        "#39457e",
    ),
    (
        "zephyr.lang-pig",
        "Pig",
        "Pig syntax for the editor (CodeMirror legacy mode).",
        "PIG",
        "#f7df1e",
    ),
    (
        "zephyr.lang-powershell",
        "PowerShell",
        "PowerShell syntax for the editor (CodeMirror legacy mode).",
        "PO",
        "#012456",
    ),
    (
        "zephyr.lang-protobuf",
        "Protocol Buffers",
        "Protocol Buffers syntax for the editor (CodeMirror legacy mode).",
        "PR",
        "#4285f4",
    ),
    (
        "zephyr.lang-pug",
        "Pug",
        "Pug syntax for the editor (CodeMirror legacy mode).",
        "PUG",
        "#479e4a",
    ),
    (
        "zephyr.lang-puppet",
        "Puppet",
        "Puppet syntax for the editor (CodeMirror legacy mode).",
        "PU",
        "#47649e",
    ),
    (
        "zephyr.lang-python",
        "Python",
        "Python syntax for the editor (CodeMirror legacy mode).",
        "PY",
        "#3776ab",
    ),
    (
        "zephyr.lang-q",
        "q/Kdb+",
        "q/Kdb+ syntax for the editor (CodeMirror legacy mode).",
        "QKD",
        "#519e47",
    ),
    (
        "zephyr.lang-r",
        "R",
        "R syntax for the editor (CodeMirror legacy mode).",
        "R",
        "#276dc3",
    ),
    (
        "zephyr.lang-rpm",
        "RPM Spec",
        "RPM Spec syntax for the editor (CodeMirror legacy mode).",
        "RP",
        "#6b9e47",
    ),
    (
        "zephyr.lang-ruby",
        "Ruby",
        "Ruby syntax for the editor (CodeMirror legacy mode).",
        "RUB",
        "#cc342d",
    ),
    (
        "zephyr.lang-sas",
        "sas",
        "sas syntax for the editor (CodeMirror legacy mode).",
        "SAS",
        "#474b9e",
    ),
    (
        "zephyr.lang-sass",
        "Sass",
        "Sass syntax for the editor (CodeMirror legacy mode).",
        "SAS",
        "#67479e",
    ),
    (
        "zephyr.lang-scheme",
        "Scheme",
        "Scheme syntax for the editor (CodeMirror legacy mode).",
        "SC",
        "#1b5cec",
    ),
    (
        "zephyr.lang-shell",
        "Shell / Bash",
        "Shell / Bash syntax for the editor (CodeMirror legacy mode).",
        "SH",
        "#89e051",
    ),
    (
        "zephyr.lang-sieve",
        "Sieve",
        "Sieve syntax for the editor (CodeMirror legacy mode).",
        "SI",
        "#72479e",
    ),
    (
        "zephyr.lang-smalltalk",
        "Smalltalk",
        "Smalltalk syntax for the editor (CodeMirror legacy mode).",
        "SM",
        "#9e4788",
    ),
    (
        "zephyr.lang-solr",
        "Solr",
        "Solr syntax for the editor (CodeMirror legacy mode).",
        "SOL",
        "#479e9b",
    ),
    (
        "zephyr.lang-sparql",
        "SPARQL",
        "SPARQL syntax for the editor (CodeMirror legacy mode).",
        "SP",
        "#749e47",
    ),
    (
        "zephyr.lang-spreadsheet",
        "CSV / TSV",
        "CSV / TSV syntax for the editor (CodeMirror legacy mode).",
        "CS",
        "#476f9e",
    ),
    (
        "zephyr.lang-stex",
        "LaTeX",
        "LaTeX syntax for the editor (CodeMirror legacy mode).",
        "LA",
        "#6f9e47",
    ),
    (
        "zephyr.lang-stylus",
        "Stylus",
        "Stylus syntax for the editor (CodeMirror legacy mode).",
        "ST",
        "#ff6347",
    ),
    (
        "zephyr.lang-tcl",
        "Tcl",
        "Tcl syntax for the editor (CodeMirror legacy mode).",
        "TCL",
        "#479e93",
    ),
    (
        "zephyr.lang-textile",
        "Textile",
        "Textile syntax for the editor (CodeMirror legacy mode).",
        "TE",
        "#9e9347",
    ),
    (
        "zephyr.lang-tiddlywiki",
        "TiddlyWiki",
        "TiddlyWiki syntax for the editor (CodeMirror legacy mode).",
        "TI",
        "#479e61",
    ),
    (
        "zephyr.lang-tiki",
        "Tiki",
        "Tiki syntax for the editor (CodeMirror legacy mode).",
        "TIK",
        "#9e8547",
    ),
    (
        "zephyr.lang-troff",
        "troff",
        "troff syntax for the editor (CodeMirror legacy mode).",
        "TR",
        "#969e47",
    ),
    (
        "zephyr.lang-ttcn",
        "TTCN-3",
        "TTCN-3 syntax for the editor (CodeMirror legacy mode).",
        "TT",
        "#91479e",
    ),
    (
        "zephyr.lang-turtle",
        "Turtle",
        "Turtle syntax for the editor (CodeMirror legacy mode).",
        "TU",
        "#9e5847",
    ),
    (
        "zephyr.lang-vb",
        "Visual Basic",
        "Visual Basic syntax for the editor (CodeMirror legacy mode).",
        "VI",
        "#005a9e",
    ),
    (
        "zephyr.lang-vbscript",
        "VBScript",
        "VBScript syntax for the editor (CodeMirror legacy mode).",
        "VB",
        "#8e9e47",
    ),
    (
        "zephyr.lang-velocity",
        "Velocity",
        "Velocity syntax for the editor (CodeMirror legacy mode).",
        "VE",
        "#474b9e",
    ),
    (
        "zephyr.lang-verilog",
        "Verilog",
        "Verilog syntax for the editor (CodeMirror legacy mode).",
        "VE",
        "#479e72",
    ),
    (
        "zephyr.lang-vhdl",
        "VHDL",
        "VHDL syntax for the editor (CodeMirror legacy mode).",
        "VHD",
        "#479e55",
    ),
    (
        "zephyr.lang-wast",
        "WebAssembly Text",
        "WebAssembly Text syntax for the editor (CodeMirror legacy mode).",
        "WE",
        "#6e479e",
    ),
    (
        "zephyr.lang-webidl",
        "Web IDL",
        "Web IDL syntax for the editor (CodeMirror legacy mode).",
        "WE",
        "#9e479c",
    ),
    (
        "zephyr.lang-xml",
        "XML / HTML",
        "XML / HTML syntax for the editor (CodeMirror legacy mode).",
        "XM",
        "#e37933",
    ),
    (
        "zephyr.lang-xquery",
        "XQuery",
        "XQuery syntax for the editor (CodeMirror legacy mode).",
        "XQ",
        "#9e9847",
    ),
    (
        "zephyr.lang-yacas",
        "Yacas",
        "Yacas syntax for the editor (CodeMirror legacy mode).",
        "YA",
        "#47579e",
    ),
    (
        "zephyr.lang-z80",
        "Z80 Assembly",
        "Z80 Assembly syntax for the editor (CodeMirror legacy mode).",
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
        "zephyr.lang-brainfuck",
        &[("zephyr-extension.json", LANG_BRAINFUCK)],
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
    ("zephyr.lang-stex", &[("zephyr-extension.json", LANG_STEX)]),
    (
        "zephyr.lang-stylus",
        &[("zephyr-extension.json", LANG_STYLUS)],
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
    (
        "zephyr.lang-troff",
        &[("zephyr-extension.json", LANG_TROFF)],
    ),
    ("zephyr.lang-ttcn", &[("zephyr-extension.json", LANG_TTCN)]),
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
    ("zephyr.lang-z80", &[("zephyr-extension.json", LANG_Z80)]),
];

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
    /* ── Extra catalog ─────────────────────────────────────────────────
    Icon themes, keymaps, snippets and one theme. Declared in
    ext_bundled_extra.rs; listed here so cari_paket and bundled_ids see
    them without a second lookup path. */
    (
        "zephyr.ikon-garis",
        &[
            ("zephyr-extension.json", extra::IKON_GARIS),
            ("icons/garis.json", extra::IKON_GARIS_JSON),
        ],
    ),
    (
        "zephyr.ikon-bahasa",
        &[
            ("zephyr-extension.json", extra::IKON_BAHASA),
            ("icons/bahasa.json", extra::IKON_BAHASA_JSON),
        ],
    ),
    (
        "zephyr.ikon-titik",
        &[
            ("zephyr-extension.json", extra::IKON_TITIK),
            ("icons/titik.json", extra::IKON_TITIK_JSON),
        ],
    ),
    (
        "zephyr.ikon-padat",
        &[
            ("zephyr-extension.json", extra::IKON_PADAT),
            ("icons/padat.json", extra::IKON_PADAT_JSON),
        ],
    ),
    (
        "zephyr.ikon-bingkai",
        &[
            ("zephyr-extension.json", extra::IKON_BINGKAI),
            ("icons/bingkai.json", extra::IKON_BINGKAI_JSON),
        ],
    ),
    (
        "zephyr.keymap-vim",
        &[
            ("zephyr-extension.json", extra::KEYMAP_VIM),
            ("keymaps/vim.json", extra::KEYMAP_VIM_JSON),
        ],
    ),
    (
        "zephyr.keymap-emacs",
        &[
            ("zephyr-extension.json", extra::KEYMAP_EMACS),
            ("keymaps/emacs.json", extra::KEYMAP_EMACS_JSON),
        ],
    ),
    (
        "zephyr.keymap-ide",
        &[
            ("zephyr-extension.json", extra::KEYMAP_IDE),
            ("keymaps/ide.json", extra::KEYMAP_IDE_JSON),
        ],
    ),
    (
        "zephyr.snippet-js",
        &[
            ("zephyr-extension.json", extra::SNIPPET_JS),
            ("snippets/js.json", extra::SNIPPET_JS_JSON),
        ],
    ),
    (
        "zephyr.snippet-go",
        &[
            ("zephyr-extension.json", extra::SNIPPET_GO),
            ("snippets/go.json", extra::SNIPPET_GO_JSON),
        ],
    ),
    (
        "zephyr.snippet-rust",
        &[
            ("zephyr-extension.json", extra::SNIPPET_RUST),
            ("snippets/rust.json", extra::SNIPPET_RUST_JSON),
        ],
    ),
    (
        "zephyr.snippet-css",
        &[
            ("zephyr-extension.json", extra::SNIPPET_CSS),
            ("snippets/css.json", extra::SNIPPET_CSS_JSON),
        ],
    ),
    (
        "zephyr.snippet-sql",
        &[
            ("zephyr-extension.json", extra::SNIPPET_SQL),
            ("snippets/sql.json", extra::SNIPPET_SQL_JSON),
        ],
    ),
    (
        "zephyr.tema-malam",
        &[
            ("zephyr-extension.json", extra::TEMA_MALAM),
            ("themes/malam.json", extra::TEMA_MALAM_JSON),
        ],
    ),
    (
        "zephyr.tema-samudra",
        &[
            ("zephyr-extension.json", extra::TEMA_SAMUDRA),
            ("themes/samudra.json", extra::TEMA_SAMUDRA_JSON),
        ],
    ),
    (
        "zephyr.tema-hutan",
        &[
            ("zephyr-extension.json", extra::TEMA_HUTAN),
            ("themes/hutan.json", extra::TEMA_HUTAN_JSON),
        ],
    ),
    (
        "zephyr.tema-senja-muda",
        &[
            ("zephyr-extension.json", extra::TEMA_SENJA_MUDA),
            ("themes/senja-muda.json", extra::TEMA_SENJA_MUDA_JSON),
        ],
    ),
    (
        "zephyr.tema-monokrom",
        &[
            ("zephyr-extension.json", extra::TEMA_MONOKROM),
            ("themes/monokrom.json", extra::TEMA_MONOKROM_JSON),
        ],
    ),

/* ══ TEMA MARKETPLACE (didaftarkan) ══ */
    (
        "zephyr.tema-moonlight",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_MOONLIGHT),
            ("themes/moonlight.json", extra::TEMA_MKT_MOONLIGHT_JSON),
        ],
    ),
    (
        "zephyr.tema-horizon",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_HORIZON),
            ("themes/horizon.json", extra::TEMA_MKT_HORIZON_JSON),
        ],
    ),
    (
        "zephyr.tema-poimandres",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_POIMANDRES),
            ("themes/poimandres.json", extra::TEMA_MKT_POIMANDRES_JSON),
        ],
    ),
    (
        "zephyr.tema-oxocarbon",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_OXOCARBON),
            ("themes/oxocarbon.json", extra::TEMA_MKT_OXOCARBON_JSON),
        ],
    ),
    (
        "zephyr.tema-zenburn",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_ZENBURN),
            ("themes/zenburn.json", extra::TEMA_MKT_ZENBURN_JSON),
        ],
    ),
    (
        "zephyr.tema-iceberg",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_ICEBERG),
            ("themes/iceberg.json", extra::TEMA_MKT_ICEBERG_JSON),
        ],
    ),
    (
        "zephyr.tema-melange",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_MELANGE),
            ("themes/melange.json", extra::TEMA_MKT_MELANGE_JSON),
        ],
    ),
    (
        "zephyr.tema-flexoki-dark",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_FLEXOKI_DARK),
            ("themes/flexoki-dark.json", extra::TEMA_MKT_FLEXOKI_DARK_JSON),
        ],
    ),
    (
        "zephyr.tema-carbonfox",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_CARBONFOX),
            ("themes/carbonfox.json", extra::TEMA_MKT_CARBONFOX_JSON),
        ],
    ),
    (
        "zephyr.tema-sonokai",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_SONOKAI),
            ("themes/sonokai.json", extra::TEMA_MKT_SONOKAI_JSON),
        ],
    ),
    (
        "zephyr.tema-edge-dark",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_EDGE_DARK),
            ("themes/edge-dark.json", extra::TEMA_MKT_EDGE_DARK_JSON),
        ],
    ),
    (
        "zephyr.tema-embark",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_EMBARK),
            ("themes/embark.json", extra::TEMA_MKT_EMBARK_JSON),
        ],
    ),
    (
        "zephyr.tema-jellybeans",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_JELLYBEANS),
            ("themes/jellybeans.json", extra::TEMA_MKT_JELLYBEANS_JSON),
        ],
    ),
    (
        "zephyr.tema-wombat",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_WOMBAT),
            ("themes/wombat.json", extra::TEMA_MKT_WOMBAT_JSON),
        ],
    ),
    (
        "zephyr.tema-papercolor-dark",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_PAPERCOLOR_DARK),
            ("themes/papercolor-dark.json", extra::TEMA_MKT_PAPERCOLOR_DARK_JSON),
        ],
    ),
    (
        "zephyr.tema-seoul256",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_SEOUL256),
            ("themes/seoul256.json", extra::TEMA_MKT_SEOUL256_JSON),
        ],
    ),
    (
        "zephyr.tema-spacegray",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_SPACEGRAY),
            ("themes/spacegray.json", extra::TEMA_MKT_SPACEGRAY_JSON),
        ],
    ),
    (
        "zephyr.tema-vscode-dark",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_VSCODE_DARK),
            ("themes/vscode-dark.json", extra::TEMA_MKT_VSCODE_DARK_JSON),
        ],
    ),
    (
        "zephyr.tema-papercolor-light",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_PAPERCOLOR_LIGHT),
            ("themes/papercolor-light.json", extra::TEMA_MKT_PAPERCOLOR_LIGHT_JSON),
        ],
    ),
    (
        "zephyr.tema-gruvbox-light",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_GRUVBOX_LIGHT),
            ("themes/gruvbox-light.json", extra::TEMA_MKT_GRUVBOX_LIGHT_JSON),
        ],
    ),
    (
        "zephyr.tema-tokyo-night-light",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_TOKYO_NIGHT_LIGHT),
            ("themes/tokyo-night-light.json", extra::TEMA_MKT_TOKYO_NIGHT_LIGHT_JSON),
        ],
    ),
    (
        "zephyr.tema-solarized-cream",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_SOLARIZED_CREAM),
            ("themes/solarized-cream.json", extra::TEMA_MKT_SOLARIZED_CREAM_JSON),
        ],
    ),
    (
        "zephyr.tema-catppuccin-frappe",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_CATPPUCCIN_FRAPPE),
            ("themes/catppuccin-frappe.json", extra::TEMA_MKT_CATPPUCCIN_FRAPPE_JSON),
        ],
    ),
    (
        "zephyr.tema-catppuccin-macchiato",
        &[
            ("zephyr-extension.json", extra::TEMA_MKT_CATPPUCCIN_MACCHIATO),
            ("themes/catppuccin-macchiato.json", extra::TEMA_MKT_CATPPUCCIN_MACCHIATO_JSON),
        ],
    ),
/* ══ AKHIR TEMA MARKETPLACE (didaftarkan) ══ */
/* ══ IKON MARKETPLACE (didaftarkan) ══ */
    (
        "zephyr.ikon-kubus",
        &[
            ("zephyr-extension.json", extra::IKON_KUBUS),
            ("icons/kubus.json", extra::IKON_KUBUS_JSON),
        ],
    ),
    (
        "zephyr.ikon-berlian",
        &[
            ("zephyr-extension.json", extra::IKON_BERLIAN),
            ("icons/berlian.json", extra::IKON_BERLIAN_JSON),
        ],
    ),
    (
        "zephyr.ikon-segitiga",
        &[
            ("zephyr-extension.json", extra::IKON_SEGITIGA),
            ("icons/segitiga.json", extra::IKON_SEGITIGA_JSON),
        ],
    ),
    (
        "zephyr.ikon-kisi",
        &[
            ("zephyr-extension.json", extra::IKON_KISI),
            ("icons/kisi.json", extra::IKON_KISI_JSON),
        ],
    ),
    (
        "zephyr.ikon-lingkaran",
        &[
            ("zephyr-extension.json", extra::IKON_LINGKARAN),
            ("icons/lingkaran.json", extra::IKON_LINGKARAN_JSON),
        ],
    ),
    (
        "zephyr.ikon-kotak-garis",
        &[
            ("zephyr-extension.json", extra::IKON_KOTAK_GARIS),
            ("icons/kotak-garis.json", extra::IKON_KOTAK_GARIS_JSON),
        ],
    ),
    (
        "zephyr.ikon-panah",
        &[
            ("zephyr-extension.json", extra::IKON_PANAH),
            ("icons/panah.json", extra::IKON_PANAH_JSON),
        ],
    ),
    (
        "zephyr.ikon-bintang",
        &[
            ("zephyr-extension.json", extra::IKON_BINTANG),
            ("icons/bintang.json", extra::IKON_BINTANG_JSON),
        ],
    ),
    (
        "zephyr.ikon-berlubang",
        &[
            ("zephyr-extension.json", extra::IKON_BERLUBANG),
            ("icons/berlubang.json", extra::IKON_BERLUBANG_JSON),
        ],
    ),
    (
        "zephyr.ikon-blok",
        &[
            ("zephyr-extension.json", extra::IKON_BLOK),
            ("icons/blok.json", extra::IKON_BLOK_JSON),
        ],
    ),
    (
        "zephyr.ikon-garis-garis",
        &[
            ("zephyr-extension.json", extra::IKON_GARIS_GARIS),
            ("icons/garis-garis.json", extra::IKON_GARIS_GARIS_JSON),
        ],
    ),
    (
        "zephyr.ikon-petir",
        &[
            ("zephyr-extension.json", extra::IKON_PETIR),
            ("icons/petir.json", extra::IKON_PETIR_JSON),
        ],
    ),
    (
        "zephyr.ikon-permata",
        &[
            ("zephyr-extension.json", extra::IKON_PERMATA),
            ("icons/permata.json", extra::IKON_PERMATA_JSON),
        ],
    ),
    (
        "zephyr.ikon-heksagon",
        &[
            ("zephyr-extension.json", extra::IKON_HEKSAGON),
            ("icons/heksagon.json", extra::IKON_HEKSAGON_JSON),
        ],
    ),
    (
        "zephyr.ikon-berlian-garis",
        &[
            ("zephyr-extension.json", extra::IKON_BERLIAN_GARIS),
            ("icons/berlian-garis.json", extra::IKON_BERLIAN_GARIS_JSON),
        ],
    ),
    (
        "zephyr.ikon-tanda-tanya",
        &[
            ("zephyr-extension.json", extra::IKON_TANDA),
            ("icons/tanda-tanya.json", extra::IKON_TANDA_JSON),
        ],
    ),
    (
        "zephyr.ikon-belah-ketupat",
        &[
            ("zephyr-extension.json", extra::IKON_BELAH_KETUPAT),
            ("icons/belah-ketupat.json", extra::IKON_BELAH_KETUPAT_JSON),
        ],
    ),
    (
        "zephyr.ikon-kurung",
        &[
            ("zephyr-extension.json", extra::IKON_KURUNG),
            ("icons/kurung.json", extra::IKON_KURUNG_JSON),
        ],
    ),
    (
        "zephyr.ikon-huruf-tebal",
        &[
            ("zephyr-extension.json", extra::IKON_HURUF_TEBAL),
            ("icons/huruf-tebal.json", extra::IKON_HURUF_TEBAL_JSON),
        ],
    ),
    (
        "zephyr.ikon-huruf-miring",
        &[
            ("zephyr-extension.json", extra::IKON_HURUF_MIRING),
            ("icons/huruf-miring.json", extra::IKON_HURUF_MIRING_JSON),
        ],
    ),
    (
        "zephyr.ikon-kode",
        &[
            ("zephyr-extension.json", extra::IKON_KODE),
            ("icons/kode.json", extra::IKON_KODE_JSON),
        ],
    ),
    (
        "zephyr.ikon-simpul",
        &[
            ("zephyr-extension.json", extra::IKON_SIMPUL),
            ("icons/simpul.json", extra::IKON_SIMPUL_JSON),
        ],
    ),
    (
        "zephyr.ikon-peluru",
        &[
            ("zephyr-extension.json", extra::IKON_PELURU),
            ("icons/peluru.json", extra::IKON_PELURU_JSON),
        ],
    ),
    (
        "zephyr.ikon-belah",
        &[
            ("zephyr-extension.json", extra::IKON_BELAH),
            ("icons/belah.json", extra::IKON_BELAH_JSON),
        ],
    ),
    (
        "zephyr.ikon-tanda-plus",
        &[
            ("zephyr-extension.json", extra::IKON_TANDA_PLUS),
            ("icons/tanda-plus.json", extra::IKON_TANDA_PLUS_JSON),
        ],
    ),
    (
        "zephyr.ikon-belah-dua",
        &[
            ("zephyr-extension.json", extra::IKON_BELAH_DUA),
            ("icons/belah-dua.json", extra::IKON_BELAH_DUA_JSON),
        ],
    ),
    (
        "zephyr.ikon-kilau",
        &[
            ("zephyr-extension.json", extra::IKON_KILAU),
            ("icons/kilau.json", extra::IKON_KILAU_JSON),
        ],
    ),
/* ══ AKHIR IKON MARKETPLACE (didaftarkan) ══ */
];

fn cari_paket(id: &str) -> Option<Paket> {
    PAKET
        .iter()
        .copied()
        .find(|(pid, _)| *pid == id)
        .or_else(|| PAKET_BAHASA.iter().copied().find(|(pid, _)| *pid == id))
}

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

#[tauri::command]
pub fn extensions_bundled_ids() -> Vec<String> {
    PAKET
        .iter()
        .chain(PAKET_BAHASA.iter())
        .map(|(id, _)| (*id).to_string())
        .collect()
}

const META_PAKET: &[(&str, &str, &str, &str, &[&str])] = &[
    (
        "zephyr.tema-kertas",
        "Paper Theme",
        "Light low-contrast theme, suited to daytime in bright rooms.",
        "PT",
        &[],
    ),
    (
        "zephyr.keymap-sublime",
        "Sublime-style Keymap",
        "Sublime Text keyboard chords: Ctrl+P, Ctrl+Shift+D, Ctrl+K Ctrl+B.",
        "SB",
        &[],
    ),
    (
        "zephyr.snippet-python",
        "Snippet Python",
        "Quick skeleton: def, class, if __main__",
        "PY",
        &["python"],
    ),
    (
        "zephyr.snippet-react",
        "Snippet React",
        "Components, useState, useEffect, rfc.",
        "RC",
        &["javascript", "typescript"],
    ),
    (
        "zephyr.ikon-bulat",
        "Round Icons",
        "Circular icon theme for the file explorer.",
        "IB",
        &[],
    ),
    /* The extra catalog. An entry missing here is not an error — index_bundled
    falls back to the id as the name — but the card then reads
    "zephyr.ikon-garis" instead of "Ikon Garis", which looks like a bug. */
    (
        "zephyr.ikon-garis",
        "Line Icons",
        "Monochrome icon theme: two-letter glyphs with no colour, for busy screens.",
        "IG",
        &[],
    ),
    (
        "zephyr.ikon-bahasa",
        "Language Icons",
        "Every language gets its own official colour — TS blue, Go cyan, Rust orange.",
        "IW",
        &[],
    ),
    (
        "zephyr.ikon-titik",
        "Dot Icons",
        "One coloured dot per language family, the rest uniform.",
        "IT",
        &[],
    ),
    (
        "zephyr.keymap-vim",
        "Vim-style Keymap",
        "Ctrl+W then H/J/K/L to move between panes, Ctrl+W V for a vertical split.",
        "VM",
        &[],
    ),
    (
        "zephyr.keymap-emacs",
        "Emacs-style Keymap",
        "C-x C-f opens a file, C-x C-s saves, C-x C-c closes, Alt+X lists commands.",
        "EM",
        &[],
    ),
    (
        "zephyr.keymap-ide",
        "JetBrains-style Keymap",
        "Ctrl+Shift+A to find an action, Alt+1 sidebar, Alt+9 panel, Ctrl+Alt+L to format.",
        "JB",
        &[],
    ),
    (
        "zephyr.snippet-js",
        "JavaScript snippets",
        "fetch + JSON, promise, destructuring, try/catch, arrow, console.log.",
        "JS",
        &["javascript", "javascriptreact"],
    ),
    (
        "zephyr.snippet-go",
        "Snippet Go",
        "HTTP handlers with method guards, struct tags, error wrapping, goroutines, tests.",
        "GO",
        &["go"],
    ),
    (
        "zephyr.snippet-rust",
        "Snippet Rust",
        "Struct derive, impl + constructor, Result, match, if let, tests.",
        "RS",
        &["rust"],
    ),
    (
        "zephyr.snippet-css",
        "Snippet CSS",
        "Flex centering, column grid, media queries, custom properties, ellipsis.",
        "CS",
        &["css", "scss"],
    ),
    (
        "zephyr.snippet-sql",
        "Snippet SQL",
        "Select joins, insert, update, create table, index, transactions.",
        "SQ",
        &["sql"],
    ),
    (
        "zephyr.tema-malam",
        "Night Theme",
        "Dark with lower contrast than the default, for long night sessions.",
        "TM",
        &[],
    ),
];

pub fn index_bundled() -> String {
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

    let meta_bahasa = |id: &str, manifest: &str| -> serde_json::Value {
        let (nama, desk, logo, warna) = META_BAHASA
            .iter()
            .find(|(mid, _, _, _, _)| *mid == id)
            .map(|(_, n, d, l, w)| (*n, *d, *l, *w))
            .unwrap_or((id, id, "", "#6b7280"));

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

        let mut ids: Vec<_> = arr
            .iter()
            .map(|e| e["id"].as_str().unwrap().to_string())
            .collect();
        ids.sort();
        let unik: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unik.len(), ids.len(), "id index bundled harus unik");
    }

    #[test]
    fn index_bundled_lolos_parse_index() {
        let s = index_bundled();
        let entri = crate::ext_registry::parse_index_pub(&s);
        assert_eq!(
            entri.len(),
            PAKET.len() + PAKET_BAHASA.len(),
            "index bundled harus bisa di-parse utuh oleh registry"
        );

        for e in &entri {
            assert!(!e.categories.is_empty(), "{} butuh categories", e.id);
        }
    }

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

    /// Every bundled package has to survive the SAME gate a downloaded one
    /// passes.
    ///
    /// `extensions_install` runs `pengaruh_paket` and refuses the package when
    /// nothing in it can be applied (`tolak_paket` -> `NOTHING TO INSTALL:`).
    /// A bundled package the gate rejects is a card in the marketplace that
    /// can never be installed - which is exactly what a user reads as "this
    /// kind of extension is broken here".
    ///
    /// `paket_bundled_konsisten` above only checks that paths exist and the
    /// JSON parses, so a contribution file in a shape the counter does not
    /// read sailed through it.
    #[test]
    fn paket_bundled_lolos_gerbang_pengaruh() {
        let d = std::env::temp_dir().join(format!("zephyr-bundled-gate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();

        let mut ditolak: Vec<String> = vec![];
        for (id, files) in PAKET {
            let dir = d.join(id);
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            for (rel, isi) in *files {
                let f = dir.join(rel);
                if let Some(p) = f.parent() {
                    std::fs::create_dir_all(p).unwrap();
                }
                std::fs::write(&f, isi).unwrap();
            }

            let m = crate::ext_pkg::read_manifest(&dir)
                .unwrap_or_else(|e| panic!("{id}: manifest tidak terbaca: {e}"));
            let p = crate::ext_pkg::pengaruh_paket(&dir, &m);
            if let Some(tolak) = crate::ext_pkg::tolak_paket(&m, &p) {
                ditolak.push(format!("{id}: {tolak}"));
            }
        }

        let _ = std::fs::remove_dir_all(&d);

        /* Collected, not first-fail: the point of this test is the LIST of
           bundled packages that cannot be installed, and a panic on the first
           one hides every package after it. */
        assert!(
            ditolak.is_empty(),
            "{} bundled package(s) would be refused at install time:\n{}",
            ditolak.len(),
            ditolak.join("\n")
        );
    }
}
