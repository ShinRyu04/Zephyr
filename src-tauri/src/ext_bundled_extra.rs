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
pub(super) const IKON_KLASIK: &str = r##"{"id":"zephyr.ikon-klasik","name":"Ikon Klasik","publisher":"zephyr","version":"1.0.0","description":"Folder isi penuh dengan tab, sudut membulat kecil — gaya paling akrab.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Klasik","path":"./icons/klasik.json"}]}}"##;
pub(super) const IKON_KLASIK_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_KLASIK_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.47" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_KLASIK_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_GARIS: &str = r##"{"id":"zephyr.ikon-garis","name":"Ikon Garis","publisher":"zephyr","version":"1.0.0","description":"Hanya garis luar, tanpa isi — ringan dan tenang.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Garis","path":"./icons/garis.json"}]}}"##;
pub(super) const IKON_GARIS_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_GARIS_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_GARIS_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_PADAT: &str = r##"{"id":"zephyr.ikon-padat","name":"Ikon Padat","publisher":"zephyr","version":"1.0.0","description":"Isi penuh tanpa garis dalam — tegas dan mudah dibaca.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Padat","path":"./icons/padat.json"}]}}"##;
pub(super) const IKON_PADAT_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_PADAT_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 2.6Q3.4 1.8 4.2 1.8H9.4L12.6 5v8.399999999999999Q12.6 14.2 11.799999999999999 14.2H4.2Q3.4 14.2 3.4 13.399999999999999Z" fill="currentColor" opacity="0.425" stroke="currentColor" stroke-width="0" stroke-linejoin="miter"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="1"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_PADAT_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5Q1.6 4.2 2.4 4.2H6.2L7.6 2.6H13.6Q14.4 2.6 14.4 3.4V11.6Q14.4 12.4 13.6 12.4H2.4Q1.6 12.4 1.6 11.6Z" fill="currentColor" opacity="0.85"/><path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="0.85"/></svg>"##;

pub(super) const IKON_DUOTONE: &str = r##"{"id":"zephyr.ikon-duotone","name":"Ikon Duotone","publisher":"zephyr","version":"1.0.0","description":"Badan pekat, tab dan tanda lebih terang — dua nada.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Duotone","path":"./icons/duotone.json"}]}}"##;
pub(super) const IKON_DUOTONE_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_DUOTONE_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.275" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.8" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_DUOTONE_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_BULAT: &str = r##"{"id":"zephyr.ikon-bulat","name":"Ikon Bulat","publisher":"zephyr","version":"1.0.0","description":"Sudut sangat membulat, tab melengkung.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Bulat","path":"./icons/bulat.json"}]}}"##;
pub(super) const IKON_BULAT_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_BULAT_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.4000000000000004Q3.4 1.8 5 1.8H9.4L12.6 5v7.6Q12.6 14.2 11 14.2H5Q3.4 14.2 3.4 12.6Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.49" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_BULAT_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 6.6Q1.6 4.2 4 4.2H6.2L7.6 2.6H12Q14.4 2.6 14.4 5V10Q14.4 12.4 12 12.4H4Q1.6 12.4 1.6 10Z" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_TAJAM: &str = r##"{"id":"zephyr.ikon-tajam","name":"Ikon Tajam","publisher":"zephyr","version":"1.0.0","description":"Sudut siku dan tab persegi — kaku dan rapi.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Tajam","path":"./icons/tajam.json"}]}}"##;
pub(super) const IKON_TAJAM_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_TAJAM_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 1.9000000000000001Q3.4 1.8 3.5 1.8H9.4L12.6 5v9.1Q12.6 14.2 12.5 14.2H3.5Q3.4 14.2 3.4 14.1Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TAJAM_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 4.3Q1.6 4.2 1.7 4.2H6.2L7.6 2.6H14.3Q14.4 2.6 14.4 2.7V12.3Q14.4 12.4 14.3 12.4H1.7Q1.6 12.4 1.6 12.3Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_TERBUKA: &str = r##"{"id":"zephyr.ikon-terbuka","name":"Ikon Terbuka","publisher":"zephyr","version":"1.0.0","description":"Penutup folder terlipat terlihat — memberi kesan isi.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Terbuka","path":"./icons/terbuka.json"}]}}"##;
pub(super) const IKON_TERBUKA_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_TERBUKA_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3Q3.4 1.8 4.6 1.8H9.4L12.6 5v7.999999999999999Q12.6 14.2 11.4 14.2H4.6Q3.4 14.2 3.4 13Z" fill="currentColor" opacity="0.09" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.43" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_TERBUKA_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.4Q1.6 4.2 2.8 4.2H6.2L7.6 2.6H13.2Q14.4 2.6 14.4 3.8V11.2Q14.4 12.4 13.2 12.4H2.8Q1.6 12.4 1.6 11.2Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6.2 4.2H7.6V2.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;

pub(super) const IKON_MINIMAL: &str = r##"{"id":"zephyr.ikon-minimal","name":"Ikon Minimal","publisher":"zephyr","version":"1.0.0","description":"Garis tipis satu warna, tanpa isi dan tanpa tab.","engines":{"zephyr":">=1.0"},"categories":["Icon Themes"],"contributes":{"iconThemes":[{"label":"Minimal","path":"./icons/minimal.json"}]}}"##;
pub(super) const IKON_MINIMAL_JSON: &str = r##"{"iconDefinitions":{"_f_kode":{"iconPath":"./icons/file-kode.svg"},"_f_uji":{"iconPath":"./icons/file-uji.svg"},"_f_dokumen":{"iconPath":"./icons/file-dokumen.svg"},"_f_aset":{"iconPath":"./icons/file-aset.svg"},"_f_hasil":{"iconPath":"./icons/file-hasil.svg"},"_f_konfig":{"iconPath":"./icons/file-konfig.svg"},"_f_teks":{"iconPath":"./icons/file-teks.svg"},"_f_data":{"iconPath":"./icons/file-data.svg"},"_f_gaya":{"iconPath":"./icons/file-gaya.svg"},"_d_kode":{"iconPath":"./icons/folder-kode.svg"},"_d_kodeOpen":{"iconPath":"./icons/folder-kode-open.svg"},"_d_uji":{"iconPath":"./icons/folder-uji.svg"},"_d_ujiOpen":{"iconPath":"./icons/folder-uji-open.svg"},"_d_dokumen":{"iconPath":"./icons/folder-dokumen.svg"},"_d_dokumenOpen":{"iconPath":"./icons/folder-dokumen-open.svg"},"_d_aset":{"iconPath":"./icons/folder-aset.svg"},"_d_asetOpen":{"iconPath":"./icons/folder-aset-open.svg"},"_d_hasil":{"iconPath":"./icons/folder-hasil.svg"},"_d_hasilOpen":{"iconPath":"./icons/folder-hasil-open.svg"},"_d_konfig":{"iconPath":"./icons/folder-konfig.svg"},"_d_konfigOpen":{"iconPath":"./icons/folder-konfig-open.svg"},"_d_teks":{"iconPath":"./icons/folder-teks.svg"},"_d_teksOpen":{"iconPath":"./icons/folder-teks-open.svg"},"_d_data":{"iconPath":"./icons/folder-data.svg"},"_d_dataOpen":{"iconPath":"./icons/folder-data-open.svg"},"_d_gaya":{"iconPath":"./icons/folder-gaya.svg"},"_d_gayaOpen":{"iconPath":"./icons/folder-gaya-open.svg"},"_folder":{"iconPath":"./icons/folder.svg"},"_folderOpen":{"iconPath":"./icons/folder-open.svg"},"_file":{"iconPath":"./icons/file.svg"}},"file":"_file","folder":"_folder","folderExpanded":"_folderOpen","fileExtensions":{"ts":"_f_kode","tsx":"_f_kode","js":"_f_kode","jsx":"_f_kode","mjs":"_f_kode","cjs":"_f_kode","rs":"_f_kode","go":"_f_kode","py":"_f_kode","java":"_f_kode","kt":"_f_kode","c":"_f_kode","cpp":"_f_kode","h":"_f_kode","hpp":"_f_kode","cs":"_f_kode","rb":"_f_kode","php":"_f_kode","swift":"_f_kode","sh":"_f_kode","ps1":"_f_kode","lua":"_f_kode","md":"_f_teks","txt":"_f_teks","rst":"_f_teks","log":"_f_teks","json":"_f_data","yml":"_f_data","yaml":"_f_data","toml":"_f_data","xml":"_f_data","csv":"_f_data","sql":"_f_data","png":"_f_aset","jpg":"_f_aset","jpeg":"_f_aset","gif":"_f_aset","svg":"_f_aset","webp":"_f_aset","ico":"_f_aset","bmp":"_f_aset","css":"_f_gaya","scss":"_f_gaya","sass":"_f_gaya","less":"_f_gaya","lock":"_f_konfig","pem":"_f_konfig","key":"_f_konfig","zip":"_f_hasil","tar":"_f_hasil","gz":"_f_hasil","7z":"_f_hasil","rar":"_f_hasil"},"fileNames":{"package.json":"_f_data","package-lock.json":"_f_data","tsconfig.json":"_f_data","cargo.toml":"_f_data","cargo.lock":"_f_data","composer.json":"_f_data","readme.md":"_f_teks","readme":"_f_teks","changelog.md":"_f_teks","license":"_f_konfig","license.md":"_f_konfig","licence":"_f_konfig",".gitignore":"_f_konfig",".gitattributes":"_f_konfig",".gitmodules":"_f_konfig",".env":"_f_konfig",".env.local":"_f_konfig",".npmrc":"_f_konfig",".editorconfig":"_f_konfig","dockerfile":"_f_hasil","docker-compose.yml":"_f_hasil","docker-compose.yaml":"_f_hasil","makefile":"_f_konfig","justfile":"_f_konfig","procfile":"_f_konfig","gemfile":"_f_data","gemfile.lock":"_f_data","requirements.txt":"_f_data","go.mod":"_f_data","go.sum":"_f_data","pom.xml":"_f_data","build.gradle":"_f_data","vite.config.ts":"_f_konfig","tailwind.config.js":"_f_konfig","eslint.config.js":"_f_konfig","index.html":"_f_teks","favicon.ico":"_f_aset"},"folderNames":{"src":"_d_kode","lib":"_d_kode","app":"_d_kode","components":"_d_kode","hooks":"_d_kode","store":"_d_kode","stores":"_d_kode","utils":"_d_kode","core":"_d_kode","server":"_d_kode","client":"_d_kode","api":"_d_kode","cmd":"_d_kode","test":"_d_uji","tests":"_d_uji","__tests__":"_d_uji","spec":"_d_uji","specs":"_d_uji","e2e":"_d_uji","fixtures":"_d_uji","testfiles":"_d_uji","bench":"_d_uji","benches":"_d_uji","docs":"_d_dokumen","doc":"_d_dokumen","documentation":"_d_dokumen","wiki":"_d_dokumen","guides":"_d_dokumen","examples":"_d_dokumen","assets":"_d_aset","images":"_d_aset","img":"_d_aset","icons":"_d_aset","fonts":"_d_aset","media":"_d_aset","screenshots":"_d_aset","public":"_d_aset","static":"_d_aset","dist":"_d_hasil","build":"_d_hasil","out":"_d_hasil","target":"_d_hasil","release":"_d_hasil","coverage":"_d_hasil","vendor":"_d_hasil","node_modules":"_d_hasil",".next":"_d_hasil",".cache":"_d_hasil",".git":"_d_konfig",".github":"_d_konfig",".vscode":"_d_konfig",".idea":"_d_konfig",".zephyr":"_d_konfig",".claude":"_d_konfig","scripts":"_d_konfig","tools":"_d_konfig","config":"_d_konfig","configs":"_d_konfig","ci":"_d_konfig"},"folderNamesExpanded":{"src":"_d_kodeOpen","lib":"_d_kodeOpen","app":"_d_kodeOpen","components":"_d_kodeOpen","hooks":"_d_kodeOpen","store":"_d_kodeOpen","stores":"_d_kodeOpen","utils":"_d_kodeOpen","core":"_d_kodeOpen","server":"_d_kodeOpen","client":"_d_kodeOpen","api":"_d_kodeOpen","cmd":"_d_kodeOpen","test":"_d_ujiOpen","tests":"_d_ujiOpen","__tests__":"_d_ujiOpen","spec":"_d_ujiOpen","specs":"_d_ujiOpen","e2e":"_d_ujiOpen","fixtures":"_d_ujiOpen","testfiles":"_d_ujiOpen","bench":"_d_ujiOpen","benches":"_d_ujiOpen","docs":"_d_dokumenOpen","doc":"_d_dokumenOpen","documentation":"_d_dokumenOpen","wiki":"_d_dokumenOpen","guides":"_d_dokumenOpen","examples":"_d_dokumenOpen","assets":"_d_asetOpen","images":"_d_asetOpen","img":"_d_asetOpen","icons":"_d_asetOpen","fonts":"_d_asetOpen","media":"_d_asetOpen","screenshots":"_d_asetOpen","public":"_d_asetOpen","static":"_d_asetOpen","dist":"_d_hasilOpen","build":"_d_hasilOpen","out":"_d_hasilOpen","target":"_d_hasilOpen","release":"_d_hasilOpen","coverage":"_d_hasilOpen","vendor":"_d_hasilOpen","node_modules":"_d_hasilOpen",".next":"_d_hasilOpen",".cache":"_d_hasilOpen",".git":"_d_konfigOpen",".github":"_d_konfigOpen",".vscode":"_d_konfigOpen",".idea":"_d_konfigOpen",".zephyr":"_d_konfigOpen",".claude":"_d_konfigOpen","scripts":"_d_konfigOpen","tools":"_d_konfigOpen","config":"_d_konfigOpen","configs":"_d_konfigOpen","ci":"_d_konfigOpen"}}"##;
pub(super) const IKON_MINIMAL_SVG_FILE_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="6.776" cy="8.576" r="0.7040000000000001" fill="currentColor"/><path d="M5.367999999999999 11.648 7.16 9.728000000000002 8.312 10.752 10.232 8.96v2.688Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><ellipse cx="7.8" cy="8.064" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.752 8.064v2.9440000000000004M9.847999999999999 8.064v2.9440000000000004" stroke="currentColor" stroke-width="1.05"/><ellipse cx="7.8" cy="11.008" rx="2.048" ry="0.8320000000000001" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.752 7.808000000000001h4.096M5.752 9.344000000000001h4.096M5.752 10.879999999999999h2.5600000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.135999999999999 7.5520000000000005 7.8 9.600000000000001 6.135999999999999 11.648" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.079999999999998" cy="9.600000000000001" r="0.8960000000000001" fill="currentColor"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M7.8 7.424 10.104 8.704v1.92L7.8 11.904 5.4959999999999996 10.624v-1.92Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.776 7.808000000000001 4.984 9.600000000000001 6.776 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.824 7.808000000000001 10.616 9.600000000000001 8.824 11.392000000000001" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="7.8" cy="9.600000000000001" r="1.088" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7.8 7.296v0.768M7.8 11.136v0.768M5.4959999999999996 9.600000000000001h0.768M9.335999999999999 9.600000000000001h0.768" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.52 7.5520000000000005v2.176L5.367999999999999 11.520000000000001h4.864000000000001L9.079999999999998 9.728000000000002V7.5520000000000005" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.008 7.5520000000000005h3.5840000000000005" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FILE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.4 3.2Q3.4 1.8 4.8 1.8H9.4L12.6 5v7.799999999999999Q12.6 14.2 11.2 14.2H4.8Q3.4 14.2 3.4 12.799999999999999Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.88 8.064h3.84M5.88 9.600000000000001h3.84M5.88 11.136h2.4320000000000004" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_ASET_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_ASET: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="6.848000000000001" cy="8.648" r="0.792" fill="currentColor"/><path d="M5.264 12.104 7.280000000000001 9.944 8.576 11.096 10.736 9.08v3.024Z" fill="currentColor" opacity="0.85"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_DATA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_DATA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><ellipse cx="8" cy="8.072000000000001" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M5.696000000000001 8.072000000000001v3.3120000000000003M10.304 8.072000000000001v3.3120000000000003" stroke="currentColor" stroke-width="1.05"/><ellipse cx="8" cy="11.384" rx="2.3040000000000003" ry="0.936" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_DOKUMEN_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_DOKUMEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.696000000000001 7.784000000000001h4.6080000000000005M5.696000000000001 9.512h4.6080000000000005M5.696000000000001 11.24h2.8800000000000003" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_GAYA_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_GAYA: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.128 7.496 8 9.8 6.128 12.104" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.440000000000001" cy="9.8" r="1.0080000000000002" fill="currentColor"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_HASIL_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_HASIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M8 7.352 10.592 8.792v2.16L8 12.392 5.408 10.952000000000002v-2.16Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_KODE_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_KODE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.848000000000001 7.784000000000001 4.832000000000001 9.8 6.848000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.152000000000001 7.784000000000001 11.168 9.8 9.152000000000001 11.816" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_KONFIG_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_KONFIG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><circle cx="8" cy="9.8" r="1.2240000000000002" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7.208v0.864M8 11.528v0.864M5.408 9.8h0.864M9.728000000000002 9.8h0.864" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_TEKS_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_TEKS: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M5.840000000000001 8.072000000000001h4.32M5.840000000000001 9.8h4.32M5.840000000000001 11.528h2.736" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_UJI_OPEN: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M2.6 12.4 3.8 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER_UJI: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/><path d="M6.5600000000000005 7.496v2.4480000000000004L5.264 11.96h5.472L9.440000000000001 9.944V7.496" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.984 7.496h4.032000000000001" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>"##;
pub(super) const IKON_MINIMAL_SVG_FOLDER: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1.6 5.6Q1.6 4.2 3 4.2H6.2L7.6 2.6H13Q14.4 2.6 14.4 4V11Q14.4 12.4 13 12.4H3Q1.6 12.4 1.6 11Z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/></svg>"##;

/* ══ AKHIR IKON SVG ══ */
