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

/*
 * Two more icon themes, and why these two.
 *
 * The three that shipped (Bulat, Garis, Bahasa) were all the same idea with
 * different letters: a text mark per extension. A reader trying them out could
 * not tell them apart at a glance, and none of them looked like the icon packs
 * people actually install. These add the two shapes that were missing:
 *
 *   Padat    solid filled shapes, high contrast - the "chunky" look
 *   Bingkai  outlined boxes, quiet and thin - the "minimal" look
 *
 * Both use characters that render identically on every platform (no emoji, no
 * font-specific glyphs), so a sample that looks right on the settings card looks
 * the same in the tree.
 */
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
  { "key": "Ctrl+W Ctrl+W", "command": "view.nextTab" },
  { "key": "Ctrl+W Ctrl+V", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+W Ctrl+S", "command": "view.joinEditorGroups" },
  { "key": "Ctrl+W Ctrl+Q", "command": "workbench.action.closeActiveEditor" },
  { "key": "Ctrl+W Ctrl+H", "command": "view.prevTab" },
  { "key": "Ctrl+W Ctrl+L", "command": "view.nextTab" },
  { "key": "Ctrl+W Ctrl+J", "command": "workbench.action.togglePanel" },
  { "key": "Ctrl+W Ctrl+K", "command": "terminalPanel.focus" },
  { "key": "Ctrl+W |", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+W -", "command": "view.maximizePanel" }
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
  { "key": "Ctrl+G", "command": "editor.gotoLine" },
  { "key": "Ctrl+S", "command": "workbench.action.terminal.focusFind" },
  { "key": "Ctrl+X 2", "command": "view.splitEditorRight" },
  { "key": "Ctrl+X 3", "command": "workbench.action.splitEditorRight" },
  { "key": "Ctrl+X O", "command": "view.nextTab" }
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
  { "key": "Ctrl+Alt+O", "command": "editor.quickFix" },
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
      { "language": "jsx", "path": "./snippets/js.json" }
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
      { "language": "css", "path": "./snippets/css.json" }
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
    "--bg": "#0f1216",
    "--fg": "#d3dae3",
    "--text": "#d3dae3",
    "--text-secondary": "#98a2ae",
    "--text-muted": "#6f7a86",
    "--surface": "#151a20",
    "--surface-2": "#1b2129",
    "--surface-3": "#232a33",
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
    "--success": "#7fbf7f",
    "--editor-bg": "#0f1216",
    "--editor-gutter": "#5b6673",
    "--editor-active-line": "#171d24",
    "--editor-selection": "#243043",
    "--syn-comment": "#6f7a86",
    "--syn-keyword": "#c792ea",
    "--syn-string": "#9ece6a",
    "--syn-number": "#d4a259",
    "--syn-function": "#82aaff",
    "--syn-variable": "#d3dae3",
    "--syn-type": "#7fd1c0",
    "--syn-operator": "#89a0b8",
    "--syn-tag": "#7fbf7f",
    "--syn-attr": "#82aaff",
    "--syn-invalid": "#e06c75"
  }
}"##;

pub(super) const TEMA_SAMUDRA: &str = r##"{
  "id": "zephyr.tema-samudra",
  "name": "Tema Samudra",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Deep blue dark theme with cool accents, for long reading on an OLED panel.",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Samudra",
        "kind": "dark",
        "path": "./themes/samudra.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_SAMUDRA_JSON: &str = r##"{
  "colors": {
    "--bg": "#0a1420",
    "--fg": "#d6e4f0",
    "--bg0": "#0a1420",
    "--bg1": "#0f1c2b",
    "--bg2": "#142436",
    "--bg3": "#1b3047",
    "--fg0": "#d6e4f0",
    "--fg1": "#a9c0d6",
    "--fg2": "#7891a8",
    "--accent": "#4a9eff",
    "--border": "#1e3a52",
    "--surface": "#0f1c2b",
    "--surface-2": "#142436",
    "--surface-3": "#1b3047",
    "--text": "#d6e4f0",
    "--text-secondary": "#a9c0d6",
    "--text-muted": "#7891a8",
    "--danger": "#ff6b6b",
    "--warning": "#ffc857",
    "--terminal-ansi-0": "#0a1420",
    "--editor-bg": "#0a1420",
    "--editor-gutter": "#4a6a85",
    "--editor-active-line": "#122436",
    "--editor-selection": "#1e4a70",
    "--syn-comment": "#5f7a91",
    "--syn-keyword": "#7cc4ff",
    "--syn-string": "#7fd6a0",
    "--syn-number": "#ffc857",
    "--syn-function": "#4a9eff",
    "--syn-variable": "#a9c0d6",
    "--syn-type": "#5fd3c4",
    "--syn-operator": "#7891a8",
    "--syn-tag": "#5fd3c4",
    "--syn-attr": "#7cc4ff",
    "--syn-invalid": "#ff6b6b"
  }
}"##;

pub(super) const TEMA_HUTAN: &str = r##"{
  "id": "zephyr.tema-hutan",
  "name": "Tema Hutan",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Muted forest green, low glare, for daylight work on a dark screen.",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Hutan",
        "kind": "dark",
        "path": "./themes/hutan.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_HUTAN_JSON: &str = r##"{
  "colors": {
    "--bg": "#0e1512",
    "--fg": "#d8e8dc",
    "--bg0": "#0e1512",
    "--bg1": "#141d18",
    "--bg2": "#1a2620",
    "--bg3": "#223229",
    "--fg0": "#d8e8dc",
    "--fg1": "#a8c4b0",
    "--fg2": "#7a9a84",
    "--accent": "#6ecf8e",
    "--border": "#24382c",
    "--surface": "#141d18",
    "--surface-2": "#1a2620",
    "--surface-3": "#223229",
    "--text": "#d8e8dc",
    "--text-secondary": "#a8c4b0",
    "--text-muted": "#7a9a84",
    "--danger": "#e8716b",
    "--warning": "#d9b45a",
    "--terminal-ansi-0": "#0e1512",
    "--editor-bg": "#0e1512",
    "--editor-gutter": "#4f6b58",
    "--editor-active-line": "#16211b",
    "--editor-selection": "#2a4436",
    "--syn-comment": "#63796a",
    "--syn-keyword": "#8fd6a4",
    "--syn-string": "#b8d98a",
    "--syn-number": "#d9b45a",
    "--syn-function": "#6ecf8e",
    "--syn-variable": "#a8c4b0",
    "--syn-type": "#79c9c0",
    "--syn-operator": "#7a9a84",
    "--syn-tag": "#79c9c0",
    "--syn-attr": "#8fd6a4",
    "--syn-invalid": "#e8716b"
  }
}"##;

pub(super) const TEMA_SENJA_MUDA: &str = r##"{
  "id": "zephyr.tema-senja-muda",
  "name": "Tema Senja Muda",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Warm light theme with a soft peach cast, easier on the eyes than pure white.",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Senja Muda",
        "kind": "light",
        "path": "./themes/senja-muda.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_SENJA_MUDA_JSON: &str = r##"{
  "colors": {
    "--bg": "#fdf6f0",
    "--fg": "#3a2e28",
    "--bg0": "#fdf6f0",
    "--bg1": "#f8ede3",
    "--bg2": "#f2e2d4",
    "--bg3": "#e8d3c1",
    "--fg0": "#3a2e28",
    "--fg1": "#5c4a40",
    "--fg2": "#8a7364",
    "--accent": "#c2612f",
    "--border": "#e0ccb8",
    "--surface": "#f8ede3",
    "--surface-2": "#f2e2d4",
    "--surface-3": "#e8d3c1",
    "--text": "#3a2e28",
    "--text-secondary": "#5c4a40",
    "--text-muted": "#8a7364",
    "--danger": "#b3352f",
    "--warning": "#9a6b12",
    "--terminal-ansi-0": "#3a2e28",
    "--editor-bg": "#fdf6f0",
    "--editor-gutter": "#b09a88",
    "--editor-active-line": "#f7e9dc",
    "--editor-selection": "#efd9c6",
    "--syn-comment": "#9c8574",
    "--syn-keyword": "#8a3fa0",
    "--syn-string": "#4f7a28",
    "--syn-number": "#c2612f",
    "--syn-function": "#2f6ba2",
    "--syn-variable": "#7a5c2e",
    "--syn-type": "#1f7a6f",
    "--syn-operator": "#8a7364",
    "--syn-tag": "#1f7a6f",
    "--syn-attr": "#2f6ba2",
    "--syn-invalid": "#b3352f"
  }
}"##;

pub(super) const TEMA_MONOKROM: &str = r##"{
  "id": "zephyr.tema-monokrom",
  "name": "Tema Monokrom",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Greyscale only - no hue anywhere, for readers who want the text to be the only signal.",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Monokrom",
        "kind": "dark",
        "path": "./themes/monokrom.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MONOKROM_JSON: &str = r##"{
  "colors": {
    "--bg": "#111111",
    "--fg": "#e8e8e8",
    "--bg0": "#111111",
    "--bg1": "#181818",
    "--bg2": "#202020",
    "--bg3": "#2a2a2a",
    "--fg0": "#e8e8e8",
    "--fg1": "#b8b8b8",
    "--fg2": "#888888",
    "--accent": "#d0d0d0",
    "--border": "#2e2e2e",
    "--surface": "#181818",
    "--surface-2": "#202020",
    "--surface-3": "#2a2a2a",
    "--text": "#e8e8e8",
    "--text-secondary": "#b8b8b8",
    "--text-muted": "#888888",
    "--danger": "#d8d8d8",
    "--warning": "#c0c0c0",
    "--terminal-ansi-0": "#111111",
    "--editor-bg": "#111111",
    "--editor-gutter": "#5a5a5a",
    "--editor-active-line": "#1c1c1c",
    "--editor-selection": "#3a3a3a",
    "--syn-comment": "#7a7a7a",
    "--syn-keyword": "#f0f0f0",
    "--syn-string": "#c8c8c8",
    "--syn-number": "#d8d8d8",
    "--syn-function": "#e0e0e0",
    "--syn-variable": "#b8b8b8",
    "--syn-type": "#cccccc",
    "--syn-operator": "#9a9a9a",
    "--syn-tag": "#cccccc",
    "--syn-attr": "#e0e0e0",
    "--syn-invalid": "#f0f0f0"
  }
}"##;



/* ══ TEMA MARKETPLACE — DIHASILKAN scratch/gen-tema-marketplace.cjs ══ */
/*
 * Tema marketplace.
 *
 * SATU PAKET PER TEMA, dan itu disengaja: tema adalah pilihan, bukan bawaan.
 * Memasangnya langsung ke pemilih membuat daftar Themes penuh dengan hal yang
 * tidak pernah diminta; di marketplace pembaca memilih sendiri mana yang mau
 * dipasang, sama seperti ekstensi lain.
 *
 * Setiap tema mendefinisikan 11 token `--syn-*` sendiri, jadi memasangnya
 * benar-benar mengubah WARNA KODE - bukan hanya warna sidebar.
 */

pub(super) const TEMA_MKT_MOONLIGHT: &str = r##"{
  "id": "zephyr.tema-moonlight",
  "name": "Moonlight",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Deep blue night, cool highlights",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Moonlight",
        "kind": "dark",
        "path": "./themes/moonlight.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_MOONLIGHT_JSON: &str = r##"{
  "colors": {
    "--bg": "#1e2030",
    "--bg0": "#1e2030",
    "--bg1": "#181926",
    "--bg2": "#2a2d43",
    "--surface": "#181926",
    "--surface-1": "#181926",
    "--surface-2": "#2a2d43",
    "--surface-3": "#3b3f5c",
    "--border": "#3b3f5c",
    "--border-strong": "#3b3f5c",
    "--line": "#3b3f5c",
    "--text": "#c8d3f5",
    "--text-secondary": "#828bb8",
    "--text-muted": "#828bb8",
    "--fg": "#c8d3f5",
    "--fg2": "#828bb8",
    "--accent": "#82aaff",
    "--accent-hover": "#82aaff",
    "--editor-bg": "#1e2030",
    "--titlebar-bg": "#181926",
    "--syn-keyword": "#c099ff",
    "--syn-string": "#c3e88d",
    "--syn-number": "#ff966c",
    "--syn-comment": "#6b7394",
    "--syn-function": "#82aaff",
    "--syn-variable": "#c8d3f5",
    "--syn-type": "#ffc777",
    "--syn-operator": "#86e1fc",
    "--syn-tag": "#ff757f",
    "--syn-attr": "#ffc777",
    "--syn-invalid": "#ff5370"
  }
}"##;

pub(super) const TEMA_MKT_HORIZON: &str = r##"{
  "id": "zephyr.tema-horizon",
  "name": "Horizon",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Warm sunset over cool sea",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Horizon",
        "kind": "dark",
        "path": "./themes/horizon.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_HORIZON_JSON: &str = r##"{
  "colors": {
    "--bg": "#1c1e26",
    "--bg0": "#1c1e26",
    "--bg1": "#16181f",
    "--bg2": "#2a2d3a",
    "--surface": "#16181f",
    "--surface-1": "#16181f",
    "--surface-2": "#2a2d3a",
    "--surface-3": "#3d4152",
    "--border": "#3d4152",
    "--border-strong": "#3d4152",
    "--line": "#3d4152",
    "--text": "#d5d8da",
    "--text-secondary": "#9da0a2",
    "--text-muted": "#9da0a2",
    "--fg": "#d5d8da",
    "--fg2": "#9da0a2",
    "--accent": "#e95678",
    "--accent-hover": "#e95678",
    "--editor-bg": "#1c1e26",
    "--titlebar-bg": "#16181f",
    "--syn-keyword": "#b877db",
    "--syn-string": "#29d398",
    "--syn-number": "#fab795",
    "--syn-comment": "#6c6f93",
    "--syn-function": "#25b0bc",
    "--syn-variable": "#d5d8da",
    "--syn-type": "#fac29a",
    "--syn-operator": "#e95678",
    "--syn-tag": "#e95678",
    "--syn-attr": "#fab795",
    "--syn-invalid": "#e95678"
  }
}"##;

pub(super) const TEMA_MKT_POIMANDRES: &str = r##"{
  "id": "zephyr.tema-poimandres",
  "name": "Poimandres",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Ink blue with mint",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Poimandres",
        "kind": "dark",
        "path": "./themes/poimandres.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_POIMANDRES_JSON: &str = r##"{
  "colors": {
    "--bg": "#1b1e28",
    "--bg0": "#1b1e28",
    "--bg1": "#171922",
    "--bg2": "#252838",
    "--surface": "#171922",
    "--surface-1": "#171922",
    "--surface-2": "#252838",
    "--surface-3": "#303347",
    "--border": "#303347",
    "--border-strong": "#303347",
    "--line": "#303347",
    "--text": "#a6accd",
    "--text-secondary": "#767c9d",
    "--text-muted": "#767c9d",
    "--fg": "#a6accd",
    "--fg2": "#767c9d",
    "--accent": "#5de4c7",
    "--accent-hover": "#5de4c7",
    "--editor-bg": "#1b1e28",
    "--titlebar-bg": "#171922",
    "--syn-keyword": "#add7ff",
    "--syn-string": "#5de4c7",
    "--syn-number": "#e4f0fb",
    "--syn-comment": "#506477",
    "--syn-function": "#add7ff",
    "--syn-variable": "#a6accd",
    "--syn-type": "#91b4d5",
    "--syn-operator": "#89ddff",
    "--syn-tag": "#d0679d",
    "--syn-attr": "#e4f0fb",
    "--syn-invalid": "#d0679d"
  }
}"##;

pub(super) const TEMA_MKT_OXOCARBON: &str = r##"{
  "id": "zephyr.tema-oxocarbon",
  "name": "Oxocarbon",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Monochrome with a single accent",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Oxocarbon",
        "kind": "dark",
        "path": "./themes/oxocarbon.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_OXOCARBON_JSON: &str = r##"{
  "colors": {
    "--bg": "#161616",
    "--bg0": "#161616",
    "--bg1": "#262626",
    "--bg2": "#393939",
    "--surface": "#262626",
    "--surface-1": "#262626",
    "--surface-2": "#393939",
    "--surface-3": "#525252",
    "--border": "#525252",
    "--border-strong": "#525252",
    "--line": "#525252",
    "--text": "#f2f4f8",
    "--text-secondary": "#a8a8a8",
    "--text-muted": "#a8a8a8",
    "--fg": "#f2f4f8",
    "--fg2": "#a8a8a8",
    "--accent": "#08bdba",
    "--accent-hover": "#08bdba",
    "--editor-bg": "#161616",
    "--titlebar-bg": "#262626",
    "--syn-keyword": "#3ddbd9",
    "--syn-string": "#ee5396",
    "--syn-number": "#42be65",
    "--syn-comment": "#7a7a7a",
    "--syn-function": "#78a9ff",
    "--syn-variable": "#f2f4f8",
    "--syn-type": "#be95ff",
    "--syn-operator": "#3ddbd9",
    "--syn-tag": "#33b1ff",
    "--syn-attr": "#42be65",
    "--syn-invalid": "#ee5396"
  }
}"##;

pub(super) const TEMA_MKT_ZENBURN: &str = r##"{
  "id": "zephyr.tema-zenburn",
  "name": "Zenburn",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Low contrast, easy for long sessions",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Zenburn",
        "kind": "dark",
        "path": "./themes/zenburn.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_ZENBURN_JSON: &str = r##"{
  "colors": {
    "--bg": "#3f3f3f",
    "--bg0": "#3f3f3f",
    "--bg1": "#383838",
    "--bg2": "#4a4a4a",
    "--surface": "#383838",
    "--surface-1": "#383838",
    "--surface-2": "#4a4a4a",
    "--surface-3": "#5c5c5c",
    "--border": "#5c5c5c",
    "--border-strong": "#5c5c5c",
    "--line": "#5c5c5c",
    "--text": "#dcdccc",
    "--text-secondary": "#9f9f8f",
    "--text-muted": "#9f9f8f",
    "--fg": "#dcdccc",
    "--fg2": "#9f9f8f",
    "--accent": "#f0dfaf",
    "--accent-hover": "#f0dfaf",
    "--editor-bg": "#3f3f3f",
    "--titlebar-bg": "#383838",
    "--syn-keyword": "#f0dfaf",
    "--syn-string": "#cc9393",
    "--syn-number": "#8cd0d3",
    "--syn-comment": "#7f9f7f",
    "--syn-function": "#efef8f",
    "--syn-variable": "#dcdccc",
    "--syn-type": "#dfdfbf",
    "--syn-operator": "#f0dfaf",
    "--syn-tag": "#dca3a3",
    "--syn-attr": "#bfebbf",
    "--syn-invalid": "#cc9393"
  }
}"##;

pub(super) const TEMA_MKT_ICEBERG: &str = r##"{
  "id": "zephyr.tema-iceberg",
  "name": "Iceberg",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Cold blue, quiet and flat",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Iceberg",
        "kind": "dark",
        "path": "./themes/iceberg.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_ICEBERG_JSON: &str = r##"{
  "colors": {
    "--bg": "#161821",
    "--bg0": "#161821",
    "--bg1": "#1e2132",
    "--bg2": "#272b3f",
    "--surface": "#1e2132",
    "--surface-1": "#1e2132",
    "--surface-2": "#272b3f",
    "--surface-3": "#3a3f57",
    "--border": "#3a3f57",
    "--border-strong": "#3a3f57",
    "--line": "#3a3f57",
    "--text": "#c6c8d1",
    "--text-secondary": "#8b8fa8",
    "--text-muted": "#8b8fa8",
    "--fg": "#c6c8d1",
    "--fg2": "#8b8fa8",
    "--accent": "#84a0c6",
    "--accent-hover": "#84a0c6",
    "--editor-bg": "#161821",
    "--titlebar-bg": "#1e2132",
    "--syn-keyword": "#a093c7",
    "--syn-string": "#b4be82",
    "--syn-number": "#b4be82",
    "--syn-comment": "#6b7089",
    "--syn-function": "#84a0c6",
    "--syn-variable": "#c6c8d1",
    "--syn-type": "#89b8c2",
    "--syn-operator": "#84a0c6",
    "--syn-tag": "#a093c7",
    "--syn-attr": "#89b8c2",
    "--syn-invalid": "#e27878"
  }
}"##;

pub(super) const TEMA_MKT_MELANGE: &str = r##"{
  "id": "zephyr.tema-melange",
  "name": "Melange",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Spiced neutrals, parchment dark",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Melange",
        "kind": "dark",
        "path": "./themes/melange.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_MELANGE_JSON: &str = r##"{
  "colors": {
    "--bg": "#292522",
    "--bg0": "#292522",
    "--bg1": "#22201d",
    "--bg2": "#3a3632",
    "--surface": "#22201d",
    "--surface-1": "#22201d",
    "--surface-2": "#3a3632",
    "--surface-3": "#4f4a44",
    "--border": "#4f4a44",
    "--border-strong": "#4f4a44",
    "--line": "#4f4a44",
    "--text": "#ece1d7",
    "--text-secondary": "#a89f94",
    "--text-muted": "#a89f94",
    "--fg": "#ece1d7",
    "--fg2": "#a89f94",
    "--accent": "#e4a76a",
    "--accent-hover": "#e4a76a",
    "--editor-bg": "#292522",
    "--titlebar-bg": "#22201d",
    "--syn-keyword": "#b8a1e3",
    "--syn-string": "#9cc08a",
    "--syn-number": "#e4a76a",
    "--syn-comment": "#867462",
    "--syn-function": "#e4a76a",
    "--syn-variable": "#ece1d7",
    "--syn-type": "#8bb3c9",
    "--syn-operator": "#d9a06a",
    "--syn-tag": "#d18e6a",
    "--syn-attr": "#e4a76a",
    "--syn-invalid": "#d9695b"
  }
}"##;

pub(super) const TEMA_MKT_FLEXOKI_DARK: &str = r##"{
  "id": "zephyr.tema-flexoki-dark",
  "name": "Flexoki Dark",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Ink on charcoal paper",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Flexoki Dark",
        "kind": "dark",
        "path": "./themes/flexoki-dark.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_FLEXOKI_DARK_JSON: &str = r##"{
  "colors": {
    "--bg": "#100f0f",
    "--bg0": "#100f0f",
    "--bg1": "#1c1b1a",
    "--bg2": "#282726",
    "--surface": "#1c1b1a",
    "--surface-1": "#1c1b1a",
    "--surface-2": "#282726",
    "--surface-3": "#343331",
    "--border": "#343331",
    "--border-strong": "#343331",
    "--line": "#343331",
    "--text": "#cecdc3",
    "--text-secondary": "#878580",
    "--text-muted": "#878580",
    "--fg": "#cecdc3",
    "--fg2": "#878580",
    "--accent": "#4385be",
    "--accent-hover": "#4385be",
    "--editor-bg": "#100f0f",
    "--titlebar-bg": "#1c1b1a",
    "--syn-keyword": "#d14d41",
    "--syn-string": "#879a39",
    "--syn-number": "#d0a215",
    "--syn-comment": "#6f6e69",
    "--syn-function": "#4385be",
    "--syn-variable": "#cecdc3",
    "--syn-type": "#8b7ec8",
    "--syn-operator": "#da702c",
    "--syn-tag": "#ce5d97",
    "--syn-attr": "#d0a215",
    "--syn-invalid": "#d14d41"
  }
}"##;

pub(super) const TEMA_MKT_CARBONFOX: &str = r##"{
  "id": "zephyr.tema-carbonfox",
  "name": "Carbonfox",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Industrial grey, sharp accents",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Carbonfox",
        "kind": "dark",
        "path": "./themes/carbonfox.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_CARBONFOX_JSON: &str = r##"{
  "colors": {
    "--bg": "#161616",
    "--bg0": "#161616",
    "--bg1": "#1f1f1f",
    "--bg2": "#2b2b2b",
    "--surface": "#1f1f1f",
    "--surface-1": "#1f1f1f",
    "--surface-2": "#2b2b2b",
    "--surface-3": "#3d3d3d",
    "--border": "#3d3d3d",
    "--border-strong": "#3d3d3d",
    "--line": "#3d3d3d",
    "--text": "#f2f4f8",
    "--text-secondary": "#a2a2a2",
    "--text-muted": "#a2a2a2",
    "--fg": "#f2f4f8",
    "--fg2": "#a2a2a2",
    "--accent": "#33b1ff",
    "--accent-hover": "#33b1ff",
    "--editor-bg": "#161616",
    "--titlebar-bg": "#1f1f1f",
    "--syn-keyword": "#be95ff",
    "--syn-string": "#42be65",
    "--syn-number": "#ff832b",
    "--syn-comment": "#6f6f6f",
    "--syn-function": "#33b1ff",
    "--syn-variable": "#f2f4f8",
    "--syn-type": "#08bdba",
    "--syn-operator": "#3ddbd9",
    "--syn-tag": "#ee5396",
    "--syn-attr": "#ff832b",
    "--syn-invalid": "#fa4d56"
  }
}"##;

pub(super) const TEMA_MKT_SONOKAI: &str = r##"{
  "id": "zephyr.tema-sonokai",
  "name": "Sonokai",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Vivid, high-chroma dark",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Sonokai",
        "kind": "dark",
        "path": "./themes/sonokai.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_SONOKAI_JSON: &str = r##"{
  "colors": {
    "--bg": "#2c2e34",
    "--bg0": "#2c2e34",
    "--bg1": "#232429",
    "--bg2": "#3a3d45",
    "--surface": "#232429",
    "--surface-1": "#232429",
    "--surface-2": "#3a3d45",
    "--surface-3": "#4d5059",
    "--border": "#4d5059",
    "--border-strong": "#4d5059",
    "--line": "#4d5059",
    "--text": "#e2e2e3",
    "--text-secondary": "#9a9c9f",
    "--text-muted": "#9a9c9f",
    "--fg": "#e2e2e3",
    "--fg2": "#9a9c9f",
    "--accent": "#9ed072",
    "--accent-hover": "#9ed072",
    "--editor-bg": "#2c2e34",
    "--titlebar-bg": "#232429",
    "--syn-keyword": "#f69c5e",
    "--syn-string": "#9ed072",
    "--syn-number": "#e7c664",
    "--syn-comment": "#7f8490",
    "--syn-function": "#fcb468",
    "--syn-variable": "#e2e2e3",
    "--syn-type": "#76cce0",
    "--syn-operator": "#f69c5e",
    "--syn-tag": "#f28fad",
    "--syn-attr": "#e7c664",
    "--syn-invalid": "#fc5d7c"
  }
}"##;

pub(super) const TEMA_MKT_EDGE_DARK: &str = r##"{
  "id": "zephyr.tema-edge-dark",
  "name": "Edge Dark",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Deep navy, restrained",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Edge Dark",
        "kind": "dark",
        "path": "./themes/edge-dark.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_EDGE_DARK_JSON: &str = r##"{
  "colors": {
    "--bg": "#1b1d27",
    "--bg0": "#1b1d27",
    "--bg1": "#151721",
    "--bg2": "#282c3a",
    "--surface": "#151721",
    "--surface-1": "#151721",
    "--surface-2": "#282c3a",
    "--surface-3": "#3b4053",
    "--border": "#3b4053",
    "--border-strong": "#3b4053",
    "--line": "#3b4053",
    "--text": "#c5cdd9",
    "--text-secondary": "#8b93a5",
    "--text-muted": "#8b93a5",
    "--fg": "#c5cdd9",
    "--fg2": "#8b93a5",
    "--accent": "#77a5d4",
    "--accent-hover": "#77a5d4",
    "--editor-bg": "#1b1d27",
    "--titlebar-bg": "#151721",
    "--syn-keyword": "#c6a0f6",
    "--syn-string": "#a6da95",
    "--syn-number": "#f5a97f",
    "--syn-comment": "#6c7388",
    "--syn-function": "#8aadf4",
    "--syn-variable": "#c5cdd9",
    "--syn-type": "#eed49f",
    "--syn-operator": "#8bd5ca",
    "--syn-tag": "#ed8796",
    "--syn-attr": "#eed49f",
    "--syn-invalid": "#ed8796"
  }
}"##;

pub(super) const TEMA_MKT_EMBARK: &str = r##"{
  "id": "zephyr.tema-embark",
  "name": "Embark",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Voyage blue and coral",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Embark",
        "kind": "dark",
        "path": "./themes/embark.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_EMBARK_JSON: &str = r##"{
  "colors": {
    "--bg": "#1e1c31",
    "--bg0": "#1e1c31",
    "--bg1": "#181626",
    "--bg2": "#2a2740",
    "--surface": "#181626",
    "--surface-1": "#181626",
    "--surface-2": "#2a2740",
    "--surface-3": "#3d3a5c",
    "--border": "#3d3a5c",
    "--border-strong": "#3d3a5c",
    "--line": "#3d3a5c",
    "--text": "#cbe3e7",
    "--text-secondary": "#8b93b0",
    "--text-muted": "#8b93b0",
    "--fg": "#cbe3e7",
    "--fg2": "#8b93b0",
    "--accent": "#a1efd3",
    "--accent-hover": "#a1efd3",
    "--editor-bg": "#1e1c31",
    "--titlebar-bg": "#181626",
    "--syn-keyword": "#a1efd3",
    "--syn-string": "#a1efd3",
    "--syn-number": "#f2b89b",
    "--syn-comment": "#6b6a8a",
    "--syn-function": "#91ddff",
    "--syn-variable": "#cbe3e7",
    "--syn-type": "#f2b89b",
    "--syn-operator": "#a1efd3",
    "--syn-tag": "#d4bfff",
    "--syn-attr": "#f2b89b",
    "--syn-invalid": "#f48fb1"
  }
}"##;

pub(super) const TEMA_MKT_JELLYBEANS: &str = r##"{
  "id": "zephyr.tema-jellybeans",
  "name": "Jellybeans",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Soft dark with candy accents",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Jellybeans",
        "kind": "dark",
        "path": "./themes/jellybeans.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_JELLYBEANS_JSON: &str = r##"{
  "colors": {
    "--bg": "#151515",
    "--bg0": "#151515",
    "--bg1": "#1c1c1c",
    "--bg2": "#282828",
    "--surface": "#1c1c1c",
    "--surface-1": "#1c1c1c",
    "--surface-2": "#282828",
    "--surface-3": "#3a3a3a",
    "--border": "#3a3a3a",
    "--border-strong": "#3a3a3a",
    "--line": "#3a3a3a",
    "--text": "#e8e8d3",
    "--text-secondary": "#a0a08c",
    "--text-muted": "#a0a08c",
    "--fg": "#e8e8d3",
    "--fg2": "#a0a08c",
    "--accent": "#8fbfdc",
    "--accent-hover": "#8fbfdc",
    "--editor-bg": "#151515",
    "--titlebar-bg": "#1c1c1c",
    "--syn-keyword": "#8197bf",
    "--syn-string": "#99ad6a",
    "--syn-number": "#cf6a4c",
    "--syn-comment": "#888888",
    "--syn-function": "#fad07a",
    "--syn-variable": "#e8e8d3",
    "--syn-type": "#8fbfdc",
    "--syn-operator": "#8197bf",
    "--syn-tag": "#e8e8d3",
    "--syn-attr": "#fad07a",
    "--syn-invalid": "#cf6a4c"
  }
}"##;

pub(super) const TEMA_MKT_WOMBAT: &str = r##"{
  "id": "zephyr.tema-wombat",
  "name": "Wombat",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Earthy dark, olive and tan",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Wombat",
        "kind": "dark",
        "path": "./themes/wombat.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_WOMBAT_JSON: &str = r##"{
  "colors": {
    "--bg": "#242424",
    "--bg0": "#242424",
    "--bg1": "#1e1e1e",
    "--bg2": "#2f2f2f",
    "--surface": "#1e1e1e",
    "--surface-1": "#1e1e1e",
    "--surface-2": "#2f2f2f",
    "--surface-3": "#414141",
    "--border": "#414141",
    "--border-strong": "#414141",
    "--line": "#414141",
    "--text": "#e8e8e8",
    "--text-secondary": "#a5a5a5",
    "--text-muted": "#a5a5a5",
    "--fg": "#e8e8e8",
    "--fg2": "#a5a5a5",
    "--accent": "#b5d5c5",
    "--accent-hover": "#b5d5c5",
    "--editor-bg": "#242424",
    "--titlebar-bg": "#1e1e1e",
    "--syn-keyword": "#b5d5c5",
    "--syn-string": "#b1d631",
    "--syn-number": "#d8a05a",
    "--syn-comment": "#8a8a8a",
    "--syn-function": "#bde3c5",
    "--syn-variable": "#e8e8e8",
    "--syn-type": "#b5d5c5",
    "--syn-operator": "#b5d5c5",
    "--syn-tag": "#d8a05a",
    "--syn-attr": "#b1d631",
    "--syn-invalid": "#e5786d"
  }
}"##;

pub(super) const TEMA_MKT_PAPERCOLOR_DARK: &str = r##"{
  "id": "zephyr.tema-papercolor-dark",
  "name": "PaperColor Dark",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Paper feel, muted ink",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "PaperColor Dark",
        "kind": "dark",
        "path": "./themes/papercolor-dark.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_PAPERCOLOR_DARK_JSON: &str = r##"{
  "colors": {
    "--bg": "#1c1c1c",
    "--bg0": "#1c1c1c",
    "--bg1": "#262626",
    "--bg2": "#333333",
    "--surface": "#262626",
    "--surface-1": "#262626",
    "--surface-2": "#333333",
    "--surface-3": "#484848",
    "--border": "#484848",
    "--border-strong": "#484848",
    "--line": "#484848",
    "--text": "#d0d0d0",
    "--text-secondary": "#949494",
    "--text-muted": "#949494",
    "--fg": "#d0d0d0",
    "--fg2": "#949494",
    "--accent": "#5fafd7",
    "--accent-hover": "#5fafd7",
    "--editor-bg": "#1c1c1c",
    "--titlebar-bg": "#262626",
    "--syn-keyword": "#5fafd7",
    "--syn-string": "#af87d7",
    "--syn-number": "#d7875f",
    "--syn-comment": "#767676",
    "--syn-function": "#87af87",
    "--syn-variable": "#d0d0d0",
    "--syn-type": "#afd7af",
    "--syn-operator": "#5fafd7",
    "--syn-tag": "#d75f87",
    "--syn-attr": "#d7af5f",
    "--syn-invalid": "#d75f5f"
  }
}"##;

pub(super) const TEMA_MKT_SEOUL256: &str = r##"{
  "id": "zephyr.tema-seoul256",
  "name": "Seoul256",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Muted Korean palette, quiet",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Seoul256",
        "kind": "dark",
        "path": "./themes/seoul256.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_SEOUL256_JSON: &str = r##"{
  "colors": {
    "--bg": "#262626",
    "--bg0": "#262626",
    "--bg1": "#1f1f1f",
    "--bg2": "#333333",
    "--surface": "#1f1f1f",
    "--surface-1": "#1f1f1f",
    "--surface-2": "#333333",
    "--surface-3": "#474747",
    "--border": "#474747",
    "--border-strong": "#474747",
    "--line": "#474747",
    "--text": "#d9d9d9",
    "--text-secondary": "#9a9a9a",
    "--text-muted": "#9a9a9a",
    "--fg": "#d9d9d9",
    "--fg2": "#9a9a9a",
    "--accent": "#7fb4ca",
    "--accent-hover": "#7fb4ca",
    "--editor-bg": "#262626",
    "--titlebar-bg": "#1f1f1f",
    "--syn-keyword": "#d7af87",
    "--syn-string": "#87af87",
    "--syn-number": "#d78787",
    "--syn-comment": "#767676",
    "--syn-function": "#87afd7",
    "--syn-variable": "#d9d9d9",
    "--syn-type": "#afd7d7",
    "--syn-operator": "#d7af87",
    "--syn-tag": "#af87af",
    "--syn-attr": "#d7d787",
    "--syn-invalid": "#d75f5f"
  }
}"##;

pub(super) const TEMA_MKT_SPACEGRAY: &str = r##"{
  "id": "zephyr.tema-spacegray",
  "name": "Spacegray",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Space grey with soft blue",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Spacegray",
        "kind": "dark",
        "path": "./themes/spacegray.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_SPACEGRAY_JSON: &str = r##"{
  "colors": {
    "--bg": "#202020",
    "--bg0": "#202020",
    "--bg1": "#1a1a1a",
    "--bg2": "#2b2b2b",
    "--surface": "#1a1a1a",
    "--surface-1": "#1a1a1a",
    "--surface-2": "#2b2b2b",
    "--surface-3": "#3d3d3d",
    "--border": "#3d3d3d",
    "--border-strong": "#3d3d3d",
    "--line": "#3d3d3d",
    "--text": "#c0c0c0",
    "--text-secondary": "#8f8f8f",
    "--text-muted": "#8f8f8f",
    "--fg": "#c0c0c0",
    "--fg2": "#8f8f8f",
    "--accent": "#7fa6d4",
    "--accent-hover": "#7fa6d4",
    "--editor-bg": "#202020",
    "--titlebar-bg": "#1a1a1a",
    "--syn-keyword": "#c58fbf",
    "--syn-string": "#9ec49f",
    "--syn-number": "#d4a06a",
    "--syn-comment": "#6e6e6e",
    "--syn-function": "#7fa6d4",
    "--syn-variable": "#c0c0c0",
    "--syn-type": "#8fc6c6",
    "--syn-operator": "#c58fbf",
    "--syn-tag": "#d47f7f",
    "--syn-attr": "#d4a06a",
    "--syn-invalid": "#d46f6f"
  }
}"##;

pub(super) const TEMA_MKT_VSCODE_DARK: &str = r##"{
  "id": "zephyr.tema-vscode-dark",
  "name": "VS Code Dark",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "The familiar default dark",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "VS Code Dark",
        "kind": "dark",
        "path": "./themes/vscode-dark.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_VSCODE_DARK_JSON: &str = r##"{
  "colors": {
    "--bg": "#1e1e1e",
    "--bg0": "#1e1e1e",
    "--bg1": "#252526",
    "--bg2": "#2d2d30",
    "--surface": "#252526",
    "--surface-1": "#252526",
    "--surface-2": "#2d2d30",
    "--surface-3": "#3e3e42",
    "--border": "#3e3e42",
    "--border-strong": "#3e3e42",
    "--line": "#3e3e42",
    "--text": "#d4d4d4",
    "--text-secondary": "#9d9d9d",
    "--text-muted": "#9d9d9d",
    "--fg": "#d4d4d4",
    "--fg2": "#9d9d9d",
    "--accent": "#007acc",
    "--accent-hover": "#007acc",
    "--editor-bg": "#1e1e1e",
    "--titlebar-bg": "#252526",
    "--syn-keyword": "#569cd6",
    "--syn-string": "#ce9178",
    "--syn-number": "#b5cea8",
    "--syn-comment": "#6a9955",
    "--syn-function": "#dcdcaa",
    "--syn-variable": "#9cdcfe",
    "--syn-type": "#4ec9b0",
    "--syn-operator": "#d4d4d4",
    "--syn-tag": "#569cd6",
    "--syn-attr": "#9cdcfe",
    "--syn-invalid": "#f44747"
  }
}"##;

pub(super) const TEMA_MKT_PAPERCOLOR_LIGHT: &str = r##"{
  "id": "zephyr.tema-papercolor-light",
  "name": "PaperColor Light",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Paper white, soft ink",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "PaperColor Light",
        "kind": "light",
        "path": "./themes/papercolor-light.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_PAPERCOLOR_LIGHT_JSON: &str = r##"{
  "colors": {
    "--bg": "#eeeeee",
    "--bg0": "#eeeeee",
    "--bg1": "#e4e4e4",
    "--bg2": "#d7d7d7",
    "--surface": "#e4e4e4",
    "--surface-1": "#e4e4e4",
    "--surface-2": "#d7d7d7",
    "--surface-3": "#c4c4c4",
    "--border": "#c4c4c4",
    "--border-strong": "#c4c4c4",
    "--line": "#c4c4c4",
    "--text": "#444444",
    "--text-secondary": "#878787",
    "--text-muted": "#878787",
    "--fg": "#444444",
    "--fg2": "#878787",
    "--accent": "#0087af",
    "--accent-hover": "#0087af",
    "--editor-bg": "#eeeeee",
    "--titlebar-bg": "#e4e4e4",
    "--syn-keyword": "#0087af",
    "--syn-string": "#8700af",
    "--syn-number": "#d75f00",
    "--syn-comment": "#878787",
    "--syn-function": "#005f87",
    "--syn-variable": "#444444",
    "--syn-type": "#5f8700",
    "--syn-operator": "#0087af",
    "--syn-tag": "#d7005f",
    "--syn-attr": "#d75f00",
    "--syn-invalid": "#d70000"
  }
}"##;

pub(super) const TEMA_MKT_GRUVBOX_LIGHT: &str = r##"{
  "id": "zephyr.tema-gruvbox-light",
  "name": "Gruvbox Light",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Warm retro, light",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Gruvbox Light",
        "kind": "light",
        "path": "./themes/gruvbox-light.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_GRUVBOX_LIGHT_JSON: &str = r##"{
  "colors": {
    "--bg": "#fbf1c7",
    "--bg0": "#fbf1c7",
    "--bg1": "#f2e5bc",
    "--bg2": "#ebdbb2",
    "--surface": "#f2e5bc",
    "--surface-1": "#f2e5bc",
    "--surface-2": "#ebdbb2",
    "--surface-3": "#d5c4a1",
    "--border": "#d5c4a1",
    "--border-strong": "#d5c4a1",
    "--line": "#d5c4a1",
    "--text": "#3c3836",
    "--text-secondary": "#7c6f64",
    "--text-muted": "#7c6f64",
    "--fg": "#3c3836",
    "--fg2": "#7c6f64",
    "--accent": "#b57614",
    "--accent-hover": "#b57614",
    "--editor-bg": "#fbf1c7",
    "--titlebar-bg": "#f2e5bc",
    "--syn-keyword": "#9d0006",
    "--syn-string": "#79740e",
    "--syn-number": "#8f3f71",
    "--syn-comment": "#928374",
    "--syn-function": "#b57614",
    "--syn-variable": "#076678",
    "--syn-type": "#427b58",
    "--syn-operator": "#af3a03",
    "--syn-tag": "#9d0006",
    "--syn-attr": "#b57614",
    "--syn-invalid": "#9d0006"
  }
}"##;

pub(super) const TEMA_MKT_TOKYO_NIGHT_LIGHT: &str = r##"{
  "id": "zephyr.tema-tokyo-night-light",
  "name": "Tokyo Night Light",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Daylight version of the neon classic",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Tokyo Night Light",
        "kind": "light",
        "path": "./themes/tokyo-night-light.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_TOKYO_NIGHT_LIGHT_JSON: &str = r##"{
  "colors": {
    "--bg": "#e6e7ed",
    "--bg0": "#e6e7ed",
    "--bg1": "#dcdde4",
    "--bg2": "#cfd0d8",
    "--surface": "#dcdde4",
    "--surface-1": "#dcdde4",
    "--surface-2": "#cfd0d8",
    "--surface-3": "#bcbdc6",
    "--border": "#bcbdc6",
    "--border-strong": "#bcbdc6",
    "--line": "#bcbdc6",
    "--text": "#343b58",
    "--text-secondary": "#6172a0",
    "--text-muted": "#6172a0",
    "--fg": "#343b58",
    "--fg2": "#6172a0",
    "--accent": "#2e7de9",
    "--accent-hover": "#2e7de9",
    "--editor-bg": "#e6e7ed",
    "--titlebar-bg": "#dcdde4",
    "--syn-keyword": "#9854f1",
    "--syn-string": "#587539",
    "--syn-number": "#b15c00",
    "--syn-comment": "#9699a3",
    "--syn-function": "#2e7de9",
    "--syn-variable": "#343b58",
    "--syn-type": "#007197",
    "--syn-operator": "#007197",
    "--syn-tag": "#f52a65",
    "--syn-attr": "#8c6c3e",
    "--syn-invalid": "#f52a65"
  }
}"##;

pub(super) const TEMA_MKT_SOLARIZED_CREAM: &str = r##"{
  "id": "zephyr.tema-solarized-cream",
  "name": "Solarized Cream",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Warmer Solarized, low glare",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Solarized Cream",
        "kind": "light",
        "path": "./themes/solarized-cream.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_SOLARIZED_CREAM_JSON: &str = r##"{
  "colors": {
    "--bg": "#fdf6e3",
    "--bg0": "#fdf6e3",
    "--bg1": "#f5efdc",
    "--bg2": "#eee8d5",
    "--surface": "#f5efdc",
    "--surface-1": "#f5efdc",
    "--surface-2": "#eee8d5",
    "--surface-3": "#ded8c4",
    "--border": "#ded8c4",
    "--border-strong": "#ded8c4",
    "--line": "#ded8c4",
    "--text": "#657b83",
    "--text-secondary": "#93a1a1",
    "--text-muted": "#93a1a1",
    "--fg": "#657b83",
    "--fg2": "#93a1a1",
    "--accent": "#cb4b16",
    "--accent-hover": "#cb4b16",
    "--editor-bg": "#fdf6e3",
    "--titlebar-bg": "#f5efdc",
    "--syn-keyword": "#859900",
    "--syn-string": "#2aa198",
    "--syn-number": "#d33682",
    "--syn-comment": "#93a1a1",
    "--syn-function": "#268bd2",
    "--syn-variable": "#b58900",
    "--syn-type": "#cb4b16",
    "--syn-operator": "#859900",
    "--syn-tag": "#268bd2",
    "--syn-attr": "#b58900",
    "--syn-invalid": "#dc322f"
  }
}"##;

pub(super) const TEMA_MKT_CATPPUCCIN_FRAPPE: &str = r##"{
  "id": "zephyr.tema-catppuccin-frappe",
  "name": "Catppuccin Frappé",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Cool pastel, mid-dark",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Catppuccin Frappé",
        "kind": "dark",
        "path": "./themes/catppuccin-frappe.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_CATPPUCCIN_FRAPPE_JSON: &str = r##"{
  "colors": {
    "--bg": "#303446",
    "--bg0": "#303446",
    "--bg1": "#292c3c",
    "--bg2": "#414559",
    "--surface": "#292c3c",
    "--surface-1": "#292c3c",
    "--surface-2": "#414559",
    "--surface-3": "#51576d",
    "--border": "#51576d",
    "--border-strong": "#51576d",
    "--line": "#51576d",
    "--text": "#c6d0f5",
    "--text-secondary": "#a5adce",
    "--text-muted": "#a5adce",
    "--fg": "#c6d0f5",
    "--fg2": "#a5adce",
    "--accent": "#ca9ee6",
    "--accent-hover": "#ca9ee6",
    "--editor-bg": "#303446",
    "--titlebar-bg": "#292c3c",
    "--syn-keyword": "#ca9ee6",
    "--syn-string": "#a6d189",
    "--syn-number": "#ef9f76",
    "--syn-comment": "#737994",
    "--syn-function": "#8caaee",
    "--syn-variable": "#c6d0f5",
    "--syn-type": "#e5c890",
    "--syn-operator": "#99d1db",
    "--syn-tag": "#e78284",
    "--syn-attr": "#e5c890",
    "--syn-invalid": "#e78284"
  }
}"##;

pub(super) const TEMA_MKT_CATPPUCCIN_MACCHIATO: &str = r##"{
  "id": "zephyr.tema-catppuccin-macchiato",
  "name": "Catppuccin Macchiato",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Pastel, deeper than Frappé",
  "engines": {
    "zephyr": ">=1.0"
  },
  "categories": [
    "Themes"
  ],
  "contributes": {
    "themes": [
      {
        "label": "Catppuccin Macchiato",
        "kind": "dark",
        "path": "./themes/catppuccin-macchiato.json"
      }
    ]
  }
}"##;

pub(super) const TEMA_MKT_CATPPUCCIN_MACCHIATO_JSON: &str = r##"{
  "colors": {
    "--bg": "#24273a",
    "--bg0": "#24273a",
    "--bg1": "#1e2030",
    "--bg2": "#363a4f",
    "--surface": "#1e2030",
    "--surface-1": "#1e2030",
    "--surface-2": "#363a4f",
    "--surface-3": "#494d64",
    "--border": "#494d64",
    "--border-strong": "#494d64",
    "--line": "#494d64",
    "--text": "#cad3f5",
    "--text-secondary": "#a5adcb",
    "--text-muted": "#a5adcb",
    "--fg": "#cad3f5",
    "--fg2": "#a5adcb",
    "--accent": "#c6a0f6",
    "--accent-hover": "#c6a0f6",
    "--editor-bg": "#24273a",
    "--titlebar-bg": "#1e2030",
    "--syn-keyword": "#c6a0f6",
    "--syn-string": "#a6da95",
    "--syn-number": "#f5a97f",
    "--syn-comment": "#6e738d",
    "--syn-function": "#8aadf4",
    "--syn-variable": "#cad3f5",
    "--syn-type": "#eed49f",
    "--syn-operator": "#91d7e3",
    "--syn-tag": "#ed8796",
    "--syn-attr": "#eed49f",
    "--syn-invalid": "#ed8796"
  }
}"##;

/* ══ AKHIR TEMA MARKETPLACE ══ */

/* ══ IKON MARKETPLACE — DIHASILKAN scratch/gen-tema-marketplace.cjs ══ */
/*
 * Paket ikon marketplace.
 *
 * Tiap paket mendefinisikan `folder`, `folder-open`, dan `folderNames`, jadi
 * memilihnya benar-benar mengubah ikon FOLDER di pohon berkas - bukan hanya
 * huruf per ekstensi. Itu inti keluhan "folder nggak berubah sama sekali".
 */

/* ══ AKHIR IKON MARKETPLACE ══ */

/* ══ IKON SVG (dihasilkan scratch/ikon-svg.cjs) ══ */
pub(super) const IKON_BELAH: &str = r##"{"id":"zephyr.ikon-belah","name":"Ikon Belah","publisher":"zephyr","version":"1.0.0","description":"Belah — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Belah","path":"./icons/belah.json"}]}}"##;
pub(super) const IKON_BELAH_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_BELAH_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8" cy="5.976" rx="3.128" ry="1.288" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.872 5.976v4.048M11.127999999999998 5.976v4.048" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="10.024" rx="3.128" ry="1.288" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.779999999999999 5.699999999999999h6.4399999999999995M4.779999999999999 8h6.4399999999999995M4.779999999999999 10.299999999999999h4.14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.38272" y="6.7232" width="3.2345599999999997" height="2.5535999999999994" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.2339199999999995" cy="7.48928" r="0.34047999999999995" fill="currentColor"/><path d="M6.55296 9.10656 7.65952 8 8.51072 8.680959999999999 9.44704 7.829759999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.872" y="6.32" width="4.255999999999999" height="3.36" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.992" cy="7.327999999999999" r="0.44799999999999995" fill="currentColor"/><path d="M6.096 9.456 7.552 8 8.672 8.896 9.904 7.776" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5104 6.936h2.979199999999999M6.5104 8h2.979199999999999M6.5104 9.064h1.9151999999999998" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.04 6.6h3.9199999999999995M6.04 8h3.9199999999999995M6.04 9.399999999999999h2.52" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.46784 9.61728 7.319039999999999v1.4470399999999999L8 9.61728 6.38272 8.766079999999999V7.319039999999999Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.38272 7.319039999999999 8 8.17024 9.61728 7.319039999999999" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.984 10.128 7.104v1.904L8 10.128 5.872 9.008V7.104Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.872 7.104 8 8.224 10.128 7.104" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.2339199999999995 6.7232 5.95712 8 7.2339199999999995 9.2768" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.766079999999999 6.7232 10.04288 8 8.766079999999999 9.2768" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.992 6.32 5.312 8 6.992 9.68" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.008 6.32 10.687999999999999 8 9.008 9.68" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="7.2339199999999995" r="0.8512" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.08512v1.2767999999999997" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="6.992" r="1.1199999999999999" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.112v1.68" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.6 8 8 5.6 10.4 8 8 10.4Z" fill="currentColor"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.38272" y="6.7232" width="3.2345599999999997" height="2.5535999999999994" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.2339199999999995" cy="7.48928" r="0.34047999999999995" fill="currentColor"/><path d="M6.55296 9.10656 7.65952 8 8.51072 8.680959999999999 9.44704 7.829759999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.872" y="6.32" width="4.255999999999999" height="3.36" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.992" cy="7.327999999999999" r="0.44799999999999995" fill="currentColor"/><path d="M6.096 9.456 7.552 8 8.672 8.896 9.904 7.776" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.8v4.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="4.504" y="5.24" width="6.991999999999999" height="5.52" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.343999999999999" cy="6.895999999999999" r="0.736" fill="currentColor"/><path d="M4.872 10.392 7.263999999999999 8 9.104 9.472 11.127999999999998 7.632" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.24 5.056 8 8 5.24 10.943999999999999" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.024" cy="8" r="1.472" fill="currentColor"/></svg>"##;
pub(super) const IKON_BELAH_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.343999999999999 5.24 3.584 8 6.343999999999999 10.76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.656 5.24 12.416 8 9.656 10.76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="6.343999999999999" r="1.8399999999999999" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.184v2.76" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BELAH_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 4.688 11.496 6.5280000000000005v3.128L8 11.496 4.504 9.656V6.5280000000000005Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.504 6.5280000000000005 8 8.368 11.496 6.5280000000000005" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_BELAH_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.779999999999999 5.699999999999999h6.4399999999999995M4.779999999999999 8h6.4399999999999995M4.779999999999999 10.299999999999999h4.14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_KUBUS: &str = r##"{"id":"zephyr.ikon-kubus","name":"Ikon Kubus","publisher":"zephyr","version":"1.0.0","description":"Kubus — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Kubus","path":"./icons/kubus.json"}]}}"##;
pub(super) const IKON_KUBUS_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_KUBUS_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><ellipse cx="8" cy="6.328" rx="2.584" ry="1.064" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.416 6.328v3.344M10.584 6.328v3.344" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.672" rx="2.584" ry="1.064" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><path d="M5.34 6.1h5.319999999999999M5.34 8h5.319999999999999M5.34 9.899999999999999h3.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.2672" y="6.632" width="3.4656000000000002" height="2.736" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.1792" cy="7.4528" r="0.36480000000000007" fill="currentColor"/><path d="M6.4496 9.1856 7.6352 8 8.5472 8.7296 9.5504 7.8176000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.72" y="6.2" width="4.5600000000000005" height="3.5999999999999996" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.92" cy="7.28" r="0.48" fill="currentColor"/><path d="M5.96 9.56 7.52 8 8.719999999999999 8.96 10.04 7.76" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.404 6.859999999999999h3.192M6.404 8h3.192M6.404 9.14h2.0520000000000005" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.9 6.5h4.199999999999999M5.9 8h4.199999999999999M5.9 9.5h2.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.3584 9.732800000000001 7.2704v1.5504000000000002L8 9.732800000000001 6.2672 8.8208V7.2704Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2672 7.2704 8 8.182400000000001 9.732800000000001 7.2704" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.84 10.280000000000001 7.04v2.04L8 10.280000000000001 5.72 9.08V7.04Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.72 7.04 8 8.24 10.280000000000001 7.04" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.1792 6.632 5.8111999999999995 8 7.1792 9.368" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.8208 6.632 10.1888 8 8.8208 9.368" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.92 6.2 5.12 8 6.92 9.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.08 6.2 10.879999999999999 8 9.08 9.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="7.1792" r="0.9120000000000001" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.0912v1.368" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="6.92" r="1.2000000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.120000000000001v1.7999999999999998" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 4.4 11.2 6.2v3.6L8 11.6 4.8 9.8V6.2Z" fill="currentColor"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.2672" y="6.632" width="3.4656000000000002" height="2.736" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.1792" cy="7.4528" r="0.36480000000000007" fill="currentColor"/><path d="M6.4496 9.1856 7.6352 8 8.5472 8.7296 9.5504 7.8176000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.72" y="6.2" width="4.5600000000000005" height="3.5999999999999996" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.92" cy="7.28" r="0.48" fill="currentColor"/><path d="M5.96 9.56 7.52 8 8.719999999999999 8.96 10.04 7.76" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M4.8 5.4 8 3.6l3.2 1.8v5L8 12.2l-3.2-1.8Z" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><rect x="5.112" y="5.720000000000001" width="5.776" height="4.56" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.632" cy="7.088" r="0.608" fill="currentColor"/><path d="M5.416 9.975999999999999 7.3919999999999995 8 8.911999999999999 9.216000000000001 10.584 7.696" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><path d="M5.720000000000001 5.568 8 8 5.720000000000001 10.431999999999999" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.672" cy="8" r="1.216" fill="currentColor"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><path d="M6.632 5.720000000000001 4.352 8 6.632 10.280000000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.368 5.720000000000001 11.648 8 9.368 10.280000000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><circle cx="8" cy="6.632" r="1.52" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.152000000000001v2.28" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><path d="M8 5.264 10.888 6.784000000000001v2.584L8 10.888 5.112 9.368V6.784000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.112 6.784000000000001 8 8.304 10.888 6.784000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KUBUS_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/><path d="M5.34 6.1h5.319999999999999M5.34 8h5.319999999999999M5.34 9.899999999999999h3.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_LINGKARAN: &str = r##"{"id":"zephyr.ikon-lingkaran","name":"Ikon Lingkaran","publisher":"zephyr","version":"1.0.0","description":"Lingkaran — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Lingkaran","path":"./icons/lingkaran.json"}]}}"##;
pub(super) const IKON_LINGKARAN_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_LINGKARAN_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="6.152" rx="2.8560000000000003" ry="1.1760000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.144 6.152v3.696M10.856 6.152v3.696" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.847999999999999" rx="2.8560000000000003" ry="1.1760000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.06 5.9h5.88M5.06 8h5.88M5.06 10.100000000000001h3.7800000000000002" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6.15168" y="6.5408" width="3.696640000000001" height="2.9184000000000005" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.12448" cy="7.41632" r="0.3891200000000001" fill="currentColor"/><path d="M6.34624 9.26464 7.61088 8 8.583680000000001 8.77824 9.65376 7.80544" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5.568" y="6.08" width="4.864000000000001" height="3.84" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.848" cy="7.232" r="0.512" fill="currentColor"/><path d="M5.824 9.664000000000001 7.4879999999999995 8 8.768 9.024000000000001 10.176 7.744" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.2976 6.784h3.4048000000000003M6.2976 8h3.4048000000000003M6.2976 9.216000000000001h2.1888000000000005" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.76 6.4h4.4799999999999995M5.76 8h4.4799999999999995M5.76 9.600000000000001h2.8800000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 6.248959999999999 9.848320000000001 7.22176v1.6537600000000003L8 9.848320000000001 6.15168 8.87552V7.22176Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.15168 7.22176 8 8.19456 9.848320000000001 7.22176" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5.696 10.432 6.976v2.176L8 10.432 5.568 9.152000000000001V6.976Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.568 6.976 8 8.256 10.432 6.976" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7.12448 6.5408 5.665279999999999 8 7.12448 9.459200000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.87552 6.5408 10.33472 8 8.87552 9.459200000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.848 6.08 4.928 8 6.848 9.920000000000002" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 6.08 11.072 8 9.152000000000001 9.920000000000002" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="7.12448" r="0.9728000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.09728v1.4592000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="6.848" r="1.2800000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.128v1.92" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3.1" fill="currentColor"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6.15168" y="6.5408" width="3.696640000000001" height="2.9184000000000005" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.12448" cy="7.41632" r="0.3891200000000001" fill="currentColor"/><path d="M6.34624 9.26464 7.61088 8 8.583680000000001 8.77824 9.65376 7.80544" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5.568" y="6.08" width="4.864000000000001" height="3.84" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.848" cy="7.232" r="0.512" fill="currentColor"/><path d="M5.824 9.664000000000001 7.4879999999999995 8 8.768 9.024000000000001 10.176 7.744" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.8v6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="4.808" y="5.48" width="6.384" height="5.04" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.4879999999999995" cy="6.992" r="0.672" fill="currentColor"/><path d="M5.144 10.184000000000001 7.327999999999999 8 9.008 9.344000000000001 10.856 7.664" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.48 5.311999999999999 8 8 5.48 10.687999999999999" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.847999999999999" cy="8" r="1.344" fill="currentColor"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6.4879999999999995 5.48 3.968 8 6.4879999999999995 10.52" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.512 5.48 12.032 8 9.512 10.52" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="6.4879999999999995" r="1.6800000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.168v2.52" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 4.976 11.192 6.656000000000001v2.8560000000000003L8 11.192 4.808 9.512V6.656000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.808 6.656000000000001 8 8.336 11.192 6.656000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_LINGKARAN_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.06 5.9h5.88M5.06 8h5.88M5.06 10.100000000000001h3.7800000000000002" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_GARIS: &str = r##"{"id":"zephyr.ikon-garis","name":"Ikon Garis","publisher":"zephyr","version":"1.0.0","description":"Garis — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Garis","path":"./icons/garis.json"}]}}"##;
pub(super) const IKON_GARIS_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_GARIS_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><ellipse cx="8" cy="6.416" rx="2.4480000000000004" ry="1.0080000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.5520000000000005 6.416v3.168M10.448 6.416v3.168" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.584" rx="2.4480000000000004" ry="1.0080000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><path d="M5.48 6.2h5.04M5.48 8h5.04M5.48 9.8h3.24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="6.03616" y="6.449599999999999" width="3.92768" height="3.1008" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.06976" cy="7.37984" r="0.41344000000000003" fill="currentColor"/><path d="M6.2428799999999995 9.343679999999999 7.5865599999999995 8 8.620159999999998 8.82688 9.75712 7.793279999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="5.4159999999999995" y="5.96" width="5.168" height="4.08" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.776" cy="7.183999999999999" r="0.544" fill="currentColor"/><path d="M5.688 9.768 7.4559999999999995 8 8.815999999999999 9.088000000000001 10.312 7.728" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.191199999999999 6.707999999999999h3.6176M6.191199999999999 8h3.6176M6.191199999999999 9.292h2.3256" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.619999999999999 6.3h4.76M5.619999999999999 8h4.76M5.619999999999999 9.7h3.06" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 6.139519999999999 9.96384 7.17312v1.7571200000000002L8 9.96384 6.03616 8.93024V7.17312Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.03616 7.17312 8 8.20672 9.96384 7.17312" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 5.552 10.584 6.912v2.3120000000000003L8 10.584 5.4159999999999995 9.224V6.912Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.4159999999999995 6.912 8 8.272 10.584 6.912" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M7.06976 6.449599999999999 5.51936 8 7.06976 9.5504" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.93024 6.449599999999999 10.48064 8 8.93024 9.5504" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.776 5.96 4.736 8 6.776 10.04" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.224 5.96 11.264 8 9.224 10.04" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="7.06976" r="1.0336" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.103359999999999v1.5504" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="6.776" r="1.36" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.136v2.04" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.6 8h6.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="6.03616" y="6.449599999999999" width="3.92768" height="3.1008" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.06976" cy="7.37984" r="0.41344000000000003" fill="currentColor"/><path d="M6.2428799999999995 9.343679999999999 7.5865599999999995 8 8.620159999999998 8.82688 9.75712 7.793279999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="5.4159999999999995" y="5.96" width="5.168" height="4.08" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.776" cy="7.183999999999999" r="0.544" fill="currentColor"/><path d="M5.688 9.768 7.4559999999999995 8 8.815999999999999 9.088000000000001 10.312 7.728" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><rect x="5.264" y="5.840000000000001" width="5.472" height="4.32" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.704000000000001" cy="7.136000000000001" r="0.5760000000000001" fill="currentColor"/><path d="M5.5520000000000005 9.872 7.424 8 8.864 9.152000000000001 10.448 7.712000000000001" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><path d="M5.840000000000001 5.696000000000001 8 8 5.840000000000001 10.304" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.584" cy="8" r="1.1520000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_GARIS_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><path d="M6.704000000000001 5.840000000000001 4.5440000000000005 8 6.704000000000001 10.16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.296000000000001 5.840000000000001 11.456 8 9.296000000000001 10.16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><circle cx="8" cy="6.704000000000001" r="1.4400000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.144v2.16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><path d="M8 5.408 10.736 6.848000000000001v2.4480000000000004L8 10.736 5.264 9.296000000000001V6.848000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.264 6.848000000000001 8 8.288 10.736 6.848000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_GARIS_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/><path d="M5.48 6.2h5.04M5.48 8h5.04M5.48 9.8h3.24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_KISI: &str = r##"{"id":"zephyr.ikon-kisi","name":"Ikon Kisi","publisher":"zephyr","version":"1.0.0","description":"Kisi — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Kisi","path":"./icons/kisi.json"}]}}"##;
pub(super) const IKON_KISI_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_KISI_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><ellipse cx="8" cy="6.064" rx="2.9920000000000004" ry="1.2320000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.008 6.064v3.8720000000000003M10.992 6.064v3.8720000000000003" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.936" rx="2.9920000000000004" ry="1.2320000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_KISI_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><path d="M4.92 5.800000000000001h6.16M4.92 8h6.16M4.92 10.200000000000001h3.9600000000000004" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><rect x="6.15168" y="7.5408" width="3.696640000000001" height="2.9184000000000005" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.12448" cy="8.41632" r="0.3891200000000001" fill="currentColor"/><path d="M6.34624 10.26464 7.61088 9 8.583680000000001 9.77824 9.65376 8.80544" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><rect x="5.568" y="7.08" width="4.864000000000001" height="3.84" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.848" cy="8.232" r="0.512" fill="currentColor"/><path d="M5.824 10.664000000000001 7.4879999999999995 9 8.768 10.024000000000001 10.176 8.744" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M6.2976 7.784h3.4048000000000003M6.2976 9h3.4048000000000003M6.2976 10.216000000000001h2.1888000000000005" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M5.76 7.4h4.4799999999999995M5.76 9h4.4799999999999995M5.76 10.600000000000001h2.8800000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.248959999999999 9.848320000000001 8.22176v1.6537600000000003L8 10.848320000000001 6.15168 9.87552V8.22176Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.15168 8.22176 8 9.19456 9.848320000000001 8.22176" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 6.696 10.432 7.976v2.176L8 11.432 5.568 10.152000000000001V7.976Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.568 7.976 8 9.256 10.432 7.976" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M7.12448 7.5408 5.665279999999999 9 7.12448 10.459200000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.87552 7.5408 10.33472 9 8.87552 10.459200000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M6.848 7.08 4.928 9 6.848 10.920000000000002" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.08 11.072 9 9.152000000000001 10.920000000000002" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8.12448" r="0.9728000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9.09728v1.4592000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="7.848" r="1.2800000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9.128v1.92" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="7.4" width="6" height="4.4" rx="0.8" fill="currentColor"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><rect x="6.15168" y="7.5408" width="3.696640000000001" height="2.9184000000000005" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.12448" cy="8.41632" r="0.3891200000000001" fill="currentColor"/><path d="M6.34624 10.26464 7.61088 9 8.583680000000001 9.77824 9.65376 8.80544" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><rect x="5.568" y="7.08" width="4.864000000000001" height="3.84" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.848" cy="8.232" r="0.512" fill="currentColor"/><path d="M5.824 10.664000000000001 7.4879999999999995 9 8.768 10.024000000000001 10.176 8.744" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M5 9.6h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><rect x="4.656000000000001" y="5.36" width="6.688000000000001" height="5.28" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.416" cy="6.944000000000001" r="0.7040000000000001" fill="currentColor"/><path d="M5.008 10.288 7.296 8 9.056000000000001 9.408000000000001 10.992 7.6480000000000015" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><path d="M5.36 5.184 8 8 5.36 10.816" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.936" cy="8" r="1.4080000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_KISI_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><path d="M6.416 5.36 3.7760000000000002 8 6.416 10.64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.584000000000001 5.36 12.224 8 9.584000000000001 10.64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><circle cx="8" cy="6.416" r="1.7600000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.176v2.64" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KISI_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><path d="M8 4.832000000000001 11.344000000000001 6.5920000000000005v2.9920000000000004L8 11.344000000000001 4.656000000000001 9.584000000000001V6.5920000000000005Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.656000000000001 6.5920000000000005 8 8.352 11.344000000000001 6.5920000000000005" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_KISI_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/><path d="M4.92 5.800000000000001h6.16M4.92 8h6.16M4.92 10.200000000000001h3.9600000000000004" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_SEGITIGA: &str = r##"{"id":"zephyr.ikon-segitiga","name":"Ikon Segitiga","publisher":"zephyr","version":"1.0.0","description":"Segitiga — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Segitiga","path":"./icons/segitiga.json"}]}}"##;
pub(super) const IKON_SEGITIGA_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_SEGITIGA_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8" cy="7.992000000000001" rx="2.176" ry="0.8960000000000001" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.824 7.992000000000001v2.8160000000000003M10.176 7.992000000000001v2.8160000000000003" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="10.808" rx="2.176" ry="0.8960000000000001" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.76 7.800000000000001h4.4799999999999995M5.76 9.4h4.4799999999999995M5.76 11h2.8800000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.38272" y="8.123199999999999" width="3.2345599999999997" height="2.5535999999999994" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.2339199999999995" cy="8.88928" r="0.34047999999999995" fill="currentColor"/><path d="M6.55296 10.506559999999999 7.65952 9.399999999999999 8.51072 10.08096 9.44704 9.229759999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.872" y="7.72" width="4.255999999999999" height="3.36" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.992" cy="8.728" r="0.44799999999999995" fill="currentColor"/><path d="M6.096 10.855999999999998 7.552 9.399999999999999 8.672 10.296 9.904 9.176" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5104 8.335999999999999h2.979199999999999M6.5104 9.399999999999999h2.979199999999999M6.5104 10.463999999999999h1.9151999999999998" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.04 8h3.9199999999999995M6.04 9.399999999999999h3.9199999999999995M6.04 10.799999999999999h2.52" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 7.867839999999999 9.61728 8.71904v1.4470399999999999L8 11.01728 6.38272 10.16608V8.71904Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.38272 8.71904 8 9.570239999999998 9.61728 8.71904" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 7.3839999999999995 10.128 8.504v1.904L8 11.527999999999999 5.872 10.408V8.504Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.872 8.504 8 9.623999999999999 10.128 8.504" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.2339199999999995 8.123199999999999 5.95712 9.399999999999999 7.2339199999999995 10.6768" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.766079999999999 8.123199999999999 10.04288 9.399999999999999 8.766079999999999 10.6768" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.992 7.72 5.312 9.399999999999999 6.992 11.079999999999998" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.008 7.72 10.687999999999999 9.399999999999999 9.008 11.079999999999998" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8.63392" r="0.8512" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9.485119999999998v1.2767999999999997" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8.392" r="1.1199999999999999" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9.512v1.68" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.6 11 12H5Z" fill="currentColor"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.38272" y="8.123199999999999" width="3.2345599999999997" height="2.5535999999999994" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.2339199999999995" cy="8.88928" r="0.34047999999999995" fill="currentColor"/><path d="M6.55296 10.506559999999999 7.65952 9.399999999999999 8.51072 10.08096 9.44704 9.229759999999999" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.872" y="7.72" width="4.255999999999999" height="3.36" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.992" cy="8.728" r="0.44799999999999995" fill="currentColor"/><path d="M6.096 10.855999999999998 7.552 9.399999999999999 8.672 10.296 9.904 9.176" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 7.6v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="5.568" y="7.48" width="4.864000000000001" height="3.84" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.848" cy="8.632000000000001" r="0.512" fill="currentColor"/><path d="M5.824 11.064 7.4879999999999995 9.4 8.768 10.424 10.176 9.144" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.08 7.352 8 9.4 6.08 11.448" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.408" cy="9.4" r="1.024" fill="currentColor"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.848 7.48 4.928 9.4 6.848 11.32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.48 11.072 9.4 9.152000000000001 11.32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="8.248000000000001" r="1.2800000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9.528v1.92" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 7.096 10.432 8.376000000000001v2.176L8 11.832 5.568 10.552V8.376000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.568 8.376000000000001 8 9.656 10.432 8.376000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_SEGITIGA_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.76 7.800000000000001h4.4799999999999995M5.76 9.4h4.4799999999999995M5.76 11h2.8800000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_HEKSAGON: &str = r##"{"id":"zephyr.ikon-heksagon","name":"Ikon Heksagon","publisher":"zephyr","version":"1.0.0","description":"Heksagon — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Heksagon","path":"./icons/heksagon.json"}]}}"##;
pub(super) const IKON_HEKSAGON_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_HEKSAGON_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8" cy="6.24" rx="2.72" ry="1.12" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.28 6.24v3.52M10.719999999999999 6.24v3.52" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.76" rx="2.72" ry="1.12" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.2 6h5.6M5.2 8h5.6M5.2 10h3.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.2672" y="6.632" width="3.4656000000000002" height="2.736" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.1792" cy="7.4528" r="0.36480000000000007" fill="currentColor"/><path d="M6.4496 9.1856 7.6352 8 8.5472 8.7296 9.5504 7.8176000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.72" y="6.2" width="4.5600000000000005" height="3.5999999999999996" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.92" cy="7.28" r="0.48" fill="currentColor"/><path d="M5.96 9.56 7.52 8 8.719999999999999 8.96 10.04 7.76" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.404 6.859999999999999h3.192M6.404 8h3.192M6.404 9.14h2.0520000000000005" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.9 6.5h4.199999999999999M5.9 8h4.199999999999999M5.9 9.5h2.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.3584 9.732800000000001 7.2704v1.5504000000000002L8 9.732800000000001 6.2672 8.8208V7.2704Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2672 7.2704 8 8.182400000000001 9.732800000000001 7.2704" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.84 10.280000000000001 7.04v2.04L8 10.280000000000001 5.72 9.08V7.04Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.72 7.04 8 8.24 10.280000000000001 7.04" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.1792 6.632 5.8111999999999995 8 7.1792 9.368" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.8208 6.632 10.1888 8 8.8208 9.368" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.92 6.2 5.12 8 6.92 9.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.08 6.2 10.879999999999999 8 9.08 9.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="7.1792" r="0.9120000000000001" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.0912v1.368" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="6.92" r="1.2000000000000002" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.120000000000001v1.7999999999999998" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5 11 6.8v3L8 11.6 5 9.8v-3Z" fill="currentColor"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.2672" y="6.632" width="3.4656000000000002" height="2.736" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.1792" cy="7.4528" r="0.36480000000000007" fill="currentColor"/><path d="M6.4496 9.1856 7.6352 8 8.5472 8.7296 9.5504 7.8176000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="5.72" y="6.2" width="4.5600000000000005" height="3.5999999999999996" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.92" cy="7.28" r="0.48" fill="currentColor"/><path d="M5.96 9.56 7.52 8 8.719999999999999 8.96 10.04 7.76" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.6 7.4 8 6l2.4 1.4v2.8L8 11.6 5.6 10.2Z" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="4.96" y="5.6" width="6.08" height="4.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.5600000000000005" cy="7.04" r="0.64" fill="currentColor"/><path d="M5.28 10.08 7.359999999999999 8 8.96 9.280000000000001 10.719999999999999 7.68" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.6 5.4399999999999995 8 8 5.6 10.559999999999999" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.76" cy="8" r="1.28" fill="currentColor"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.5600000000000005 5.6 4.16 8 6.5600000000000005 10.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.440000000000001 5.6 11.84 8 9.440000000000001 10.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="6.5600000000000005" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.16v2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 5.12 11.04 6.720000000000001v2.72L8 11.04 4.96 9.440000000000001V6.720000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.96 6.720000000000001 8 8.32 11.04 6.720000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_HEKSAGON_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.2 6h5.6M5.2 8h5.6M5.2 10h3.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

pub(super) const IKON_PETIR: &str = r##"{"id":"zephyr.ikon-petir","name":"Ikon Petir","publisher":"zephyr","version":"1.0.0","description":"Petir — icon theme with real SVG art for files and folders","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Petir","path":"./icons/petir.json"}]}}"##;
pub(super) const IKON_PETIR_JSON: &str = r##"{"iconDefinitions":{"_kode":{"iconPath":"./icons/folder-kode.svg"},"_teks":{"iconPath":"./icons/teks.svg"},"_data":{"iconPath":"./icons/data.svg"},"_gambar":{"iconPath":"./icons/gambar.svg"},"_gaya":{"iconPath":"./icons/gaya.svg"},"_kunci":{"iconPath":"./icons/kunci.svg"},"_paket":{"iconPath":"./icons/paket.svg"},"_file":{"iconPath":"./icons/file.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_uji":{"iconPath":"./icons/folder-uji.svg"},"_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_aset":{"iconPath":"./icons/folder-aset.svg"},"_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_kode","tsx":"_kode","js":"_kode","jsx":"_kode","mjs":"_kode","cjs":"_kode","rs":"_kode","go":"_kode","py":"_kode","java":"_kode","kt":"_kode","c":"_kode","cpp":"_kode","h":"_kode","hpp":"_kode","cs":"_kode","rb":"_kode","php":"_kode","swift":"_kode","sh":"_kode","ps1":"_kode","lua":"_kode","sql":"_data","md":"_teks","txt":"_teks","rst":"_teks","log":"_teks","json":"_data","yml":"_data","yaml":"_data","toml":"_data","xml":"_data","csv":"_data","png":"_gambar","jpg":"_gambar","jpeg":"_gambar","gif":"_gambar","svg":"_gambar","webp":"_gambar","ico":"_gambar","bmp":"_gambar","css":"_gaya","scss":"_gaya","sass":"_gaya","less":"_gaya","lock":"_kunci","pem":"_kunci","key":"_kunci","zip":"_paket","tar":"_paket","gz":"_paket","7z":"_paket","rar":"_paket"},"fileNames":{"package.json":"_data","package-lock.json":"_data","tsconfig.json":"_data","cargo.toml":"_data","cargo.lock":"_data","composer.json":"_data","readme.md":"_teks","readme":"_teks","changelog.md":"_teks","license":"_kunci","license.md":"_kunci","licence":"_kunci",".gitignore":"_kunci",".gitattributes":"_kunci",".gitmodules":"_kunci",".env":"_kunci",".env.local":"_kunci",".npmrc":"_kunci",".editorconfig":"_kunci","dockerfile":"_paket","docker-compose.yml":"_paket","docker-compose.yaml":"_paket","makefile":"_kunci","justfile":"_kunci","procfile":"_kunci","gemfile":"_data","gemfile.lock":"_data","requirements.txt":"_data","go.mod":"_data","go.sum":"_data","pom.xml":"_data","build.gradle":"_data","vite.config.ts":"_data","tailwind.config.js":"_data","eslint.config.js":"_data","index.html":"_teks","favicon.ico":"_gambar"},"folderNames":{"src":"_kode","lib":"_kode","app":"_kode","components":"_kode","hooks":"_kode","store":"_kode","stores":"_kode","utils":"_kode","core":"_kode","server":"_kode","client":"_kode","api":"_kode","test":"_uji","tests":"_uji","__tests__":"_uji","spec":"_uji","specs":"_uji","e2e":"_uji","fixtures":"_uji","testfiles":"_uji","bench":"_uji","benches":"_uji","docs":"_dokumen","doc":"_dokumen","documentation":"_dokumen","wiki":"_dokumen","guides":"_dokumen","examples":"_dokumen","assets":"_aset","images":"_aset","img":"_aset","icons":"_aset","fonts":"_aset","media":"_aset","screenshots":"_aset","public":"_aset","static":"_aset","dist":"_hasil","build":"_hasil","out":"_hasil","target":"_hasil","release":"_hasil","coverage":"_hasil","vendor":"_hasil","node_modules":"_hasil",".next":"_hasil",".cache":"_hasil",".git":"_konfig",".github":"_konfig",".vscode":"_konfig",".idea":"_konfig",".zephyr":"_konfig",".claude":"_konfig","scripts":"_konfig","tools":"_konfig","config":"_konfig","configs":"_konfig","ci":"_konfig"},"folderNamesExpanded":{"src":"_kodeOpen","lib":"_kodeOpen","app":"_kodeOpen","components":"_kodeOpen","hooks":"_kodeOpen","store":"_kodeOpen","stores":"_kodeOpen","utils":"_kodeOpen","core":"_kodeOpen","server":"_kodeOpen","client":"_kodeOpen","api":"_kodeOpen","test":"_ujiOpen","tests":"_ujiOpen","__tests__":"_ujiOpen","spec":"_ujiOpen","specs":"_ujiOpen","e2e":"_ujiOpen","fixtures":"_ujiOpen","testfiles":"_ujiOpen","bench":"_ujiOpen","benches":"_ujiOpen","docs":"_dokumenOpen","doc":"_dokumenOpen","documentation":"_dokumenOpen","wiki":"_dokumenOpen","guides":"_dokumenOpen","examples":"_dokumenOpen","assets":"_asetOpen","images":"_asetOpen","img":"_asetOpen","icons":"_asetOpen","fonts":"_asetOpen","media":"_asetOpen","screenshots":"_asetOpen","public":"_asetOpen","static":"_asetOpen","dist":"_hasilOpen","build":"_hasilOpen","out":"_hasilOpen","target":"_hasilOpen","release":"_hasilOpen","coverage":"_hasilOpen","vendor":"_hasilOpen","node_modules":"_hasilOpen",".next":"_hasilOpen",".cache":"_hasilOpen",".git":"_konfigOpen",".github":"_konfigOpen",".vscode":"_konfigOpen",".idea":"_konfigOpen",".zephyr":"_konfigOpen",".claude":"_konfigOpen","scripts":"_konfigOpen","tools":"_konfigOpen","config":"_konfigOpen","configs":"_konfigOpen","ci":"_konfigOpen"}}"##;
pub(super) const IKON_PETIR_SVG_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8" cy="6.856000000000001" rx="1.7680000000000002" ry="0.7280000000000001" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6.232 6.856000000000001v2.2880000000000003M9.768 6.856000000000001v2.2880000000000003" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="9.144" rx="1.7680000000000002" ry="0.7280000000000001" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.180000000000001 6.7h3.6399999999999997M6.180000000000001 8h3.6399999999999997M6.180000000000001 9.3h2.3400000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.49824" y="6.8144" width="3.0035200000000004" height="2.3712" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.28864" cy="7.52576" r="0.31616000000000005" fill="currentColor"/><path d="M6.65632 9.02752 7.68384 8 8.47424 8.63232 9.34368 7.84192" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.024" y="6.44" width="3.9520000000000004" height="3.12" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.064" cy="7.376" r="0.41600000000000004" fill="currentColor"/><path d="M6.232 9.352 7.5840000000000005 8 8.624 8.832 9.768 7.792000000000001" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.6168 7.0120000000000005h2.7664M6.6168 8h2.7664M6.6168 8.988h1.7784000000000002" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.180000000000001 6.7h3.6399999999999997M6.180000000000001 8h3.6399999999999997M6.180000000000001 9.3h2.3400000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.57728 9.50176 7.36768v1.3436800000000002L8 9.50176 6.49824 8.71136V7.36768Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.49824 7.36768 8 8.15808 9.50176 7.36768" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.128 9.976 7.168000000000001v1.7680000000000002L8 9.976 6.024 8.936V7.168000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.024 7.168000000000001 8 8.208 9.976 7.168000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.28864 6.8144 6.10304 8 7.28864 9.1856" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.71136 6.8144 9.89696 8 8.71136 9.1856" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.064 6.44 5.5040000000000004 8 7.064 9.56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.936 6.44 10.496 8 8.936 9.56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="7.28864" r="0.7904000000000001" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.07904v1.1856" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="7.064" r="1.04" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.104000000000001v1.56" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.49824" y="6.8144" width="3.0035200000000004" height="2.3712" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.28864" cy="7.52576" r="0.31616000000000005" fill="currentColor"/><path d="M6.65632 9.02752 7.68384 8 8.47424 8.63232 9.34368 7.84192" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.024" y="6.44" width="3.9520000000000004" height="3.12" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.064" cy="7.376" r="0.41600000000000004" fill="currentColor"/><path d="M6.232 9.352 7.5840000000000005 8 8.624 8.832 9.768 7.792000000000001" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.4v5.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_GAMBAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="6.024" y="6.44" width="3.9520000000000004" height="3.12" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="7.064" cy="7.376" r="0.41600000000000004" fill="currentColor"/><path d="M6.232 9.352 7.5840000000000005 8 8.624 8.832 9.768 7.792000000000001" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.44 6.336 8 8 6.44 9.664000000000001" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.144" cy="8" r="0.8320000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_PETIR_SVG_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7.064 6.44 5.5040000000000004 8 7.064 9.56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.936 6.44 10.496 8 8.936 9.56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_KUNCI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="7.064" r="1.04" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.104000000000001v1.56" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PETIR_SVG_PAKET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 6.128 9.976 7.168000000000001v1.7680000000000002L8 9.976 6.024 8.936V7.168000000000001Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.024 7.168000000000001 8 8.208 9.976 7.168000000000001" fill="none" stroke="currentColor" stroke-width="0.9"/></svg>"##;
pub(super) const IKON_PETIR_SVG_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.180000000000001 6.7h3.6399999999999997M6.180000000000001 8h3.6399999999999997M6.180000000000001 9.3h2.3400000000000003" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>"##;

/* ══ AKHIR IKON SVG ══ */
