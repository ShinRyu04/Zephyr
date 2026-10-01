/*
 * Extra bundled packages: icon themes, keymaps, snippets.
 *
 * Everything here is written verbatim to %APPDATA%\zephyr\extensions\.bundled\<id>
 * by extensions_write_bundled, then read back through the normal manifest loader —
 * the same path a downloaded .vsix takes, so nothing needs a special case.
 *
 * Two rules the formats enforce:
 *   - a manifest's `contributes` keys must match the file the loader reads
 *     (themes/keymaps/snippets/iconThemes), or the package installs but does
 *     nothing;
 *   - snippet bodies are arrays of lines, and `\t` inside them is a real tab,
 *     because that is what the snippet expander writes into the buffer.
 */

/* ── Icon themes ─────────────────────────────────────────────────────── */

pub(super) const IKON_GARIS: &str = r##"{
  "id": "zephyr.ikon-garis",
  "name": "Ikon Garis",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Monochrome icon theme: two-letter glyphs with no colour, for busy screens.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Garis", "path": "./icons/garis.json" }]
  }
}"##;

pub(super) const IKON_GARIS_JSON: &str = r##"{
  "icons": {
    "ts":   { "glyph": "ts", "color": "currentColor" },
    "tsx":  { "glyph": "tx", "color": "currentColor" },
    "js":   { "glyph": "js", "color": "currentColor" },
    "jsx":  { "glyph": "jx", "color": "currentColor" },
    "rs":   { "glyph": "rs", "color": "currentColor" },
    "py":   { "glyph": "py", "color": "currentColor" },
    "go":   { "glyph": "go", "color": "currentColor" },
    "json": { "glyph": "{}", "color": "currentColor" },
    "css":  { "glyph": "cs", "color": "currentColor" },
    "scss": { "glyph": "sc", "color": "currentColor" },
    "html": { "glyph": "<>", "color": "currentColor" },
    "md":   { "glyph": "md", "color": "currentColor" },
    "yml":  { "glyph": "ym", "color": "currentColor" },
    "toml": { "glyph": "tm", "color": "currentColor" },
    "sql":  { "glyph": "sq", "color": "currentColor" },
    "sh":   { "glyph": "sh", "color": "currentColor" }
  }
}"##;

pub(super) const IKON_BAHASA: &str = r##"{
  "id": "zephyr.ikon-bahasa",
  "name": "Ikon Bahasa",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Coloured icon theme: every language gets its own official colour.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Bahasa", "path": "./icons/bahasa.json" }]
  }
}"##;

pub(super) const IKON_BAHASA_JSON: &str = r##"{
  "icons": {
    "ts":   { "glyph": "TS", "color": "#3178c6" },
    "tsx":  { "glyph": "TX", "color": "#3178c6" },
    "js":   { "glyph": "JS", "color": "#f1e05a" },
    "jsx":  { "glyph": "JX", "color": "#f1e05a" },
    "rs":   { "glyph": "RS", "color": "#dea584" },
    "py":   { "glyph": "PY", "color": "#3572a5" },
    "go":   { "glyph": "GO", "color": "#00add8" },
    "rb":   { "glyph": "RB", "color": "#701516" },
    "php":  { "glyph": "PH", "color": "#4f5d95" },
    "java": { "glyph": "JV", "color": "#b07219" },
    "c":    { "glyph": "C",  "color": "#555555" },
    "cpp":  { "glyph": "C+", "color": "#f34b7d" },
    "cs":   { "glyph": "C#", "color": "#178600" },
    "json": { "glyph": "{}", "color": "#cbcb41" },
    "css":  { "glyph": "CS", "color": "#563d7c" },
    "html": { "glyph": "<>", "color": "#e34c26" },
    "md":   { "glyph": "MD", "color": "#519aba" },
    "yml":  { "glyph": "YM", "color": "#cb171e" },
    "sql":  { "glyph": "SQ", "color": "#e38c00" }
  }
}"##;

pub(super) const IKON_TITIK: &str = r##"{
  "id": "zephyr.ikon-titik",
  "name": "Ikon Titik",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Minimal icon theme: one coloured dot per language family, the rest uniform.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Titik", "path": "./icons/titik.json" }]
  }
}"##;

pub(super) const IKON_TITIK_JSON: &str = r##"{
  "icons": {
    "ts":   { "glyph": "●", "color": "#3178c6" },
    "tsx":  { "glyph": "●", "color": "#3178c6" },
    "js":   { "glyph": "●", "color": "#f1e05a" },
    "jsx":  { "glyph": "●", "color": "#f1e05a" },
    "rs":   { "glyph": "●", "color": "#dea584" },
    "py":   { "glyph": "●", "color": "#3572a5" },
    "go":   { "glyph": "●", "color": "#00add8" },
    "json": { "glyph": "●", "color": "#cbcb41" },
    "css":  { "glyph": "●", "color": "#563d7c" },
    "scss": { "glyph": "●", "color": "#c6538c" },
    "html": { "glyph": "●", "color": "#e34c26" },
    "md":   { "glyph": "●", "color": "#519aba" },
    "yml":  { "glyph": "●", "color": "#cb171e" },
    "toml": { "glyph": "●", "color": "#9c4221" }
  }
}"##;

/* ── Keymaps ─────────────────────────────────────────────────────────── */

pub(super) const KEYMAP_VIM: &str = r##"{
  "id": "zephyr.keymap-vim",
  "name": "Keymap ala Vim",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "The chords Vim users reach for: splits, panes, and window navigation.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Keymaps"],
  "contributes": {
    "keymaps": [{ "label": "Vim", "path": "./keymaps/vim.json" }]
  }
}"##;

pub(super) const KEYMAP_VIM_JSON: &str = r##"[
  { "key": "Ctrl+W Ctrl+W", "command": "workbench.action.focusNextGroup" },
  { "key": "Ctrl+W Ctrl+V", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+W Ctrl+S", "command": "workbench.action.splitEditorDown" },
  { "key": "Ctrl+W Ctrl+Q", "command": "workbench.action.closeActiveEditor" },
  { "key": "Ctrl+W Ctrl+H", "command": "workbench.action.focusLeftGroup" },
  { "key": "Ctrl+W Ctrl+L", "command": "workbench.action.focusRightGroup" },
  { "key": "Ctrl+W Ctrl+J", "command": "workbench.action.focusBelowGroup" },
  { "key": "Ctrl+W Ctrl+K", "command": "workbench.action.focusAboveGroup" },
  { "key": "Ctrl+W |", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+W -", "command": "workbench.action.splitEditorDown" }
]"##;

pub(super) const KEYMAP_EMACS: &str = r##"{
  "id": "zephyr.keymap-emacs",
  "name": "Emacs-style keymap",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Emacs-style chords: C-x, C-c, C-g, and file navigation without leaving the keyboard.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Keymaps"],
  "contributes": {
    "keymaps": [{ "label": "Emacs", "path": "./keymaps/emacs.json" }]
  }
}"##;

pub(super) const KEYMAP_EMACS_JSON: &str = r##"[
  { "key": "Ctrl+X Ctrl+F", "command": "workbench.action.quickOpen" },
  { "key": "Ctrl+X Ctrl+S", "command": "workbench.action.files.save" },
  { "key": "Ctrl+X Ctrl+C", "command": "workbench.action.closeActiveEditor" },
  { "key": "Ctrl+X Ctrl+B", "command": "workbench.action.toggleSidebar" },
  { "key": "Ctrl+X Ctrl+K", "command": "workbench.action.closeAllEditors" },
  { "key": "Ctrl+C Ctrl+C", "command": "workbench.action.terminal.kill" },
  { "key": "Alt+X", "command": "workbench.action.showCommands" },
  { "key": "Ctrl+G", "command": "workbench.action.closeQuickOpen" },
  { "key": "Ctrl+S", "command": "workbench.action.terminal.focusFind" },
  { "key": "Ctrl+X 2", "command": "workbench.action.splitEditorDown" },
  { "key": "Ctrl+X 3", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+X O", "command": "workbench.action.focusNextGroup" }
]"##;

pub(super) const KEYMAP_IDE: &str = r##"{
  "id": "zephyr.keymap-ide",
  "name": "JetBrains-style keymap",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "IntelliJ/WebStorm chords: Ctrl+Shift+A, Alt+1, Ctrl+E, and Shift+Shift.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Keymaps"],
  "contributes": {
    "keymaps": [{ "label": "JetBrains", "path": "./keymaps/ide.json" }]
  }
}"##;

pub(super) const KEYMAP_IDE_JSON: &str = r##"[
  { "key": "Ctrl+Shift+A", "command": "workbench.action.showCommands" },
  { "key": "Alt+1", "command": "workbench.action.toggleSidebar" },
  { "key": "Alt+9", "command": "workbench.action.togglePanel" },
  { "key": "Ctrl+E", "command": "workbench.action.quickOpenRecent" },
  { "key": "Ctrl+Shift+F", "command": "workbench.action.findInFiles" },
  { "key": "Ctrl+Shift+R", "command": "workbench.action.replaceInFiles" },
  { "key": "Alt+Insert", "command": "workbench.action.files.newFile" },
  { "key": "Ctrl+Alt+L", "command": "editor.action.formatDocument" },
  { "key": "Ctrl+Alt+O", "command": "editor.action.organizeImports" },
  { "key": "F2", "command": "editor.action.rename" }
]"##;

/* ── Snippets ────────────────────────────────────────────────────────── */

pub(super) const SNIPPET_JS: &str = r##"{
  "id": "zephyr.snippet-js",
  "name": "JavaScript snippets",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Everyday JavaScript patterns: fetch, promises, destructuring, modules.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [
      { "language": "javascript", "path": "./snippets/js.json" },
      { "language": "javascriptreact", "path": "./snippets/js.json" }
    ]
  }
}"##;

pub(super) const SNIPPET_JS_JSON: &str = r##"{
  "fungsi": {
    "prefix": "fn",
    "body": ["function ${1:nama}(${2:args}) {", "\t${3:// isi}", "}"],
    "description": "deklarasi fungsi"
  },
  "arrow": {
    "prefix": "af",
    "body": ["const ${1:nama} = (${2:args}) => {", "\t${3:// isi}", "};"],
    "description": "fungsi arrow"
  },
  "promise": {
    "prefix": "prom",
    "body": ["return new Promise((resolve, reject) => {", "\t${1:// isi}", "});"],
    "description": "Promise baru"
  },
  "fetch json": {
    "prefix": "fetchj",
    "body": [
      "const res = await fetch(${1:url});",
      "if (!res.ok) throw new Error(`HTTP ${res.status}`);",
      "const data = await res.json();"
    ],
    "description": "fetch lalu parse JSON"
  },
  "try catch": {
    "prefix": "tryc",
    "body": ["try {", "\t${1:// isi}", "} catch (err) {", "\tconsole.error(err);", "}"],
    "description": "blok try/catch"
  },
  "destructure": {
    "prefix": "dest",
    "body": ["const { ${1:a}, ${2:b} } = ${3:obj};"],
    "description": "destructuring objek"
  },
  "export default": {
    "prefix": "exd",
    "body": ["export default ${1:nama};"],
    "description": "export default"
  },
  "console log": {
    "prefix": "clg",
    "body": ["console.log(${1:nilai});"],
    "description": "console.log"
  }
}"##;

pub(super) const SNIPPET_GO: &str = r##"{
  "id": "zephyr.snippet-go",
  "name": "Snippet Go",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Go patterns: HTTP handlers, struct tags, error wrapping, goroutines, tests.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [{ "language": "go", "path": "./snippets/go.json" }]
  }
}"##;

pub(super) const SNIPPET_GO_JSON: &str = r##"{
  "func": {
    "prefix": "func",
    "body": ["func ${1:Nama}(${2:args}) ${3:error} {", "\t${4:// isi}", "\treturn nil", "}"],
    "description": "function returning an error"
  },
  "struct": {
    "prefix": "struct",
    "body": ["type ${1:Nama} struct {", "\t${2:Field} ${3:string} `json:\"${4:field}\"`", "}"],
    "description": "struct with json tags"
  },
  "handler": {
    "prefix": "handler",
    "body": [
      "func ${1:nama}(w http.ResponseWriter, r *http.Request) {",
      "\tif r.Method != http.MethodPost {",
      "\t\thttp.Error(w, \"method not allowed\", http.StatusMethodNotAllowed)",
      "\t\treturn",
      "\t}",
      "\t${2:// isi}",
      "}"
    ],
    "description": "HTTP handler with a method guard"
  },
  "err wrap": {
    "prefix": "iferr",
    "body": ["if err != nil {", "\treturn fmt.Errorf(\"${1:konteks}: %w\", err)", "}"],
    "description": "cek error + wrap"
  },
  "goroutine": {
    "prefix": "go",
    "body": ["go func() {", "\t${1:// isi}", "}()"],
    "description": "goroutine anonim"
  },
  "test": {
    "prefix": "test",
    "body": [
      "func Test${1:Nama}(t *testing.T) {",
      "\tgot := ${2:nilai}",
      "\tif got != ${3:ingin} {",
      "\t\tt.Fatalf(\"got %v, want %v\", got, ${3:ingin})",
      "\t}",
      "}"
    ],
    "description": "unit test tabel tunggal"
  }
}"##;

pub(super) const SNIPPET_RUST: &str = r##"{
  "id": "zephyr.snippet-rust",
  "name": "Snippet Rust",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Rust patterns: struct derive, impl, Result, match, tests.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [{ "language": "rust", "path": "./snippets/rust.json" }]
  }
}"##;

pub(super) const SNIPPET_RUST_JSON: &str = r##"{
  "struct": {
    "prefix": "struct",
    "body": ["#[derive(Debug, Clone, Default)]", "pub struct ${1:Nama} {", "    pub ${2:field}: ${3:String},", "}"],
    "description": "struct with common derives"
  },
  "impl": {
    "prefix": "impl",
    "body": ["impl ${1:Nama} {", "    pub fn ${2:baru}(${3:args}) -> Self {", "        Self { ${4:field} }", "    }", "}"],
    "description": "impl block with a constructor"
  },
  "match": {
    "prefix": "match",
    "body": ["match ${1:nilai} {", "    ${2:Pola} => ${3:hasil},", "    _ => ${4:lainnya},", "}"],
    "description": "ekspresi match"
  },
  "result fn": {
    "prefix": "fnr",
    "body": ["pub fn ${1:nama}(${2:args}) -> Result<${3:()}, ${4:Error}> {", "    ${5:// isi}", "    Ok(${6:()})", "}"],
    "description": "function returning a Result"
  },
  "test": {
    "prefix": "test",
    "body": ["#[test]", "fn ${1:nama}() {", "    assert_eq!(${2:kiri}, ${3:kanan});", "}"],
    "description": "unit test"
  },
  "if let some": {
    "prefix": "iflet",
    "body": ["if let Some(${1:nilai}) = ${2:opsi} {", "    ${3:// isi}", "}"],
    "description": "if let Some"
  }
}"##;

pub(super) const SNIPPET_CSS: &str = r##"{
  "id": "zephyr.snippet-css",
  "name": "Snippet CSS",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "CSS patterns: flex, grid, media queries, variables, transitions.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [
      { "language": "css", "path": "./snippets/css.json" },
      { "language": "scss", "path": "./snippets/css.json" }
    ]
  }
}"##;

pub(super) const SNIPPET_CSS_JSON: &str = r##"{
  "flex center": {
    "prefix": "flexc",
    "body": ["display: flex;", "align-items: center;", "justify-content: center;"],
    "description": "flex terpusat"
  },
  "grid kolom": {
    "prefix": "grid",
    "body": ["display: grid;", "grid-template-columns: repeat(${1:3}, minmax(0, 1fr));", "gap: ${2:12px};"],
    "description": "grid kolom seragam"
  },
  "media query": {
    "prefix": "mq",
    "body": ["@media (max-width: ${1:768px}) {", "\t${2:/* aturan */}", "}"],
    "description": "media query max-width"
  },
  "variabel": {
    "prefix": "var",
    "body": ["--${1:nama}: ${2:nilai};"],
    "description": "custom property"
  },
  "transisi": {
    "prefix": "tr",
    "body": ["transition: ${1:color} ${2:0.15s} ${3:ease};"],
    "description": "transisi"
  },
  "ellipsis": {
    "prefix": "ell",
    "body": ["overflow: hidden;", "text-overflow: ellipsis;", "white-space: nowrap;"],
    "description": "potong teks satu baris"
  },
  "dark mode": {
    "prefix": "dark",
    "body": ["@media (prefers-color-scheme: dark) {", "\t${1:/* aturan */}", "}"],
    "description": "blok mode gelap"
  }
}"##;

pub(super) const SNIPPET_SQL: &str = r##"{
  "id": "zephyr.snippet-sql",
  "name": "Snippet SQL",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "SQL patterns: select with joins, insert, update, index, transactions.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Snippets"],
  "contributes": {
    "snippets": [{ "language": "sql", "path": "./snippets/sql.json" }]
  }
}"##;

pub(super) const SNIPPET_SQL_JSON: &str = r##"{
  "select join": {
    "prefix": "selj",
    "body": [
      "SELECT ${1:a.id}, ${2:a.name}",
      "FROM ${3:table_a} a",
      "JOIN ${4:table_b} b ON b.${5:a_id} = a.id",
      "WHERE ${6:a.active} = 1",
      "ORDER BY ${2:a.name};"
    ],
    "description": "select with a join"
  },
  "insert": {
    "prefix": "ins",
    "body": ["INSERT INTO ${1:table} (${2:column})", "VALUES (${3:value});"],
    "description": "insert satu baris"
  },
  "update": {
    "prefix": "upd",
    "body": ["UPDATE ${1:table}", "SET ${2:column} = ${3:value}", "WHERE ${4:id} = ${5:1};"],
    "description": "update with a where clause"
  },
  "create table": {
    "prefix": "ct",
    "body": [
      "CREATE TABLE ${1:name} (",
      "\tid INTEGER PRIMARY KEY AUTOINCREMENT,",
      "\t${2:kolom} ${3:TEXT} NOT NULL,",
      "\tdibuat TEXT NOT NULL DEFAULT (datetime('now'))",
      ");"
    ],
    "description": "buat tabel"
  },
  "index": {
    "prefix": "idx",
    "body": ["CREATE INDEX idx_${1:table}_${2:column} ON ${1:table} (${2:column});"],
    "description": "buat index"
  },
  "transaksi": {
    "prefix": "tx",
    "body": ["BEGIN;", "${1:-- perubahan}", "COMMIT;"],
    "description": "blok transaksi"
  }
}"##;

/* ── Theme ───────────────────────────────────────────────────────────── */

pub(super) const TEMA_MALAM: &str = r##"{
  "id": "zephyr.tema-malam",
  "name": "Tema Malam",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Dark theme with lower contrast than the default, for long night sessions.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Themes"],
  "contributes": {
    "themes": [{ "label": "Malam", "kind": "dark", "path": "./themes/malam.json" }]
  }
}"##;

pub(super) const TEMA_MALAM_JSON: &str = r##"{
  "colors": {
    "--bg0": "#0f1216",
    "--bg1": "#151a20",
    "--bg2": "#1b2129",
    "--bg3": "#232a33",
    "--fg0": "#d3dae3",
    "--fg1": "#98a2ae",
    "--fg2": "#6f7a86",
    "--border": "#262e38",
    "--accent": "#5b8def",
    "--accent-hover": "#6f9cf2",
    "--accent-subtle": "rgba(91, 141, 239, 0.14)",
    "--danger": "#e06c75",
    "--warning": "#d4a259",
    "--success": "#7fbf7f"
  }
}"##;
