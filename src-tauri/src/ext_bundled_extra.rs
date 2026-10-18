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
pub(super) const IKON_PADAT: &str = r##"{
  "id": "zephyr.ikon-padat",
  "name": "Ikon Padat",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Solid filled shapes: high contrast marks that stay readable at 14px.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Padat", "path": "./icons/padat.json" }]
  }
}"##;

pub(super) const IKON_PADAT_JSON: &str = r##"{
  "icons": {
    "file":   { "glyph": "■", "color": "var(--fg2)" },
    "folder": { "glyph": "▣", "color": "var(--fg2)" },
    "ts":     { "glyph": "■", "color": "#3178c6" },
    "tsx":    { "glyph": "■", "color": "#519aba" },
    "js":     { "glyph": "■", "color": "#f1e05a" },
    "jsx":    { "glyph": "■", "color": "#61dafb" },
    "rs":     { "glyph": "■", "color": "#dea584" },
    "py":     { "glyph": "■", "color": "#3572a5" },
    "go":     { "glyph": "■", "color": "#00add8" },
    "java":   { "glyph": "■", "color": "#b07219" },
    "rb":     { "glyph": "■", "color": "#cc342d" },
    "php":    { "glyph": "■", "color": "#4f5d95" },
    "cs":     { "glyph": "■", "color": "#178600" },
    "cpp":    { "glyph": "■", "color": "#f34b7d" },
    "c":      { "glyph": "■", "color": "#555555" },
    "swift":  { "glyph": "■", "color": "#f05138" },
    "kt":     { "glyph": "■", "color": "#a97bff" },
    "json":   { "glyph": "■", "color": "#cbcb41" },
    "yml":    { "glyph": "■", "color": "#cb171e" },
    "toml":   { "glyph": "■", "color": "#9c4221" },
    "css":    { "glyph": "■", "color": "#563d7c" },
    "scss":   { "glyph": "■", "color": "#c6538c" },
    "html":   { "glyph": "■", "color": "#e34c26" },
    "md":     { "glyph": "■", "color": "#519aba" },
    "sql":    { "glyph": "■", "color": "#e38c00" },
    "sh":     { "glyph": "■", "color": "#89e051" },
    "png":    { "glyph": "■", "color": "#a074c4" },
    "svg":    { "glyph": "■", "color": "#ffb13b" }
  }
}"##;

pub(super) const IKON_BINGKAI: &str = r##"{
  "id": "zephyr.ikon-bingkai",
  "name": "Ikon Bingkai",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Outlined marks: thin, quiet icons for dense file trees.",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Bingkai", "path": "./icons/bingkai.json" }]
  }
}"##;

pub(super) const IKON_BINGKAI_JSON: &str = r##"{
  "icons": {
    "file":   { "glyph": "▢", "color": "var(--fg2)" },
    "folder": { "glyph": "▤", "color": "var(--fg2)" },
    "ts":     { "glyph": "▢", "color": "#3178c6" },
    "tsx":    { "glyph": "▢", "color": "#519aba" },
    "js":     { "glyph": "▢", "color": "#f1e05a" },
    "jsx":    { "glyph": "▢", "color": "#61dafb" },
    "rs":     { "glyph": "▢", "color": "#dea584" },
    "py":     { "glyph": "▢", "color": "#3572a5" },
    "go":     { "glyph": "▢", "color": "#00add8" },
    "java":   { "glyph": "▢", "color": "#b07219" },
    "rb":     { "glyph": "▢", "color": "#cc342d" },
    "php":    { "glyph": "▢", "color": "#4f5d95" },
    "cs":     { "glyph": "▢", "color": "#178600" },
    "cpp":    { "glyph": "▢", "color": "#f34b7d" },
    "c":      { "glyph": "▢", "color": "#555555" },
    "swift":  { "glyph": "▢", "color": "#f05138" },
    "kt":     { "glyph": "▢", "color": "#a97bff" },
    "json":   { "glyph": "▢", "color": "#cbcb41" },
    "yml":    { "glyph": "▢", "color": "#cb171e" },
    "toml":   { "glyph": "▢", "color": "#9c4221" },
    "css":    { "glyph": "▢", "color": "#563d7c" },
    "scss":   { "glyph": "▢", "color": "#c6538c" },
    "html":   { "glyph": "▢", "color": "#e34c26" },
    "md":     { "glyph": "▢", "color": "#519aba" },
    "sql":    { "glyph": "▢", "color": "#e38c00" },
    "sh":     { "glyph": "▢", "color": "#89e051" },
    "png":    { "glyph": "▢", "color": "#a074c4" },
    "svg":    { "glyph": "▢", "color": "#ffb13b" }
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

pub(super) const IKON_KUBUS: &str = r##"{
  "id": "zephyr.ikon-kubus",
  "name": "Ikon Kubus",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Solid squares, one colour per language family",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kubus", "path": "./icons/kubus.json" }]
  }
}"##;

pub(super) const IKON_KUBUS_JSON: &str = r##"{
  "iconDefinitions": {
    "_25aa_varfg2": {
      "fontCharacter": "\\25aa",
      "fontColor": "var(--fg2)"
    },
    "_25fc_3178c6": {
      "fontCharacter": "\\25fc",
      "fontColor": "#3178c6"
    },
    "_25fc_519aba": {
      "fontCharacter": "\\25fc",
      "fontColor": "#519aba"
    },
    "_25fc_f1e05a": {
      "fontCharacter": "\\25fc",
      "fontColor": "#f1e05a"
    },
    "_25fc_61dafb": {
      "fontCharacter": "\\25fc",
      "fontColor": "#61dafb"
    },
    "_25fc_dea584": {
      "fontCharacter": "\\25fc",
      "fontColor": "#dea584"
    },
    "_25fc_3572a5": {
      "fontCharacter": "\\25fc",
      "fontColor": "#3572a5"
    },
    "_25fc_00add8": {
      "fontCharacter": "\\25fc",
      "fontColor": "#00add8"
    },
    "_25fc_b07219": {
      "fontCharacter": "\\25fc",
      "fontColor": "#b07219"
    },
    "_25fc_cc342d": {
      "fontCharacter": "\\25fc",
      "fontColor": "#cc342d"
    },
    "_25fc_4f5d95": {
      "fontCharacter": "\\25fc",
      "fontColor": "#4f5d95"
    },
    "_25fc_178600": {
      "fontCharacter": "\\25fc",
      "fontColor": "#178600"
    },
    "_25fc_f34b7d": {
      "fontCharacter": "\\25fc",
      "fontColor": "#f34b7d"
    },
    "_25fc_555555": {
      "fontCharacter": "\\25fc",
      "fontColor": "#555555"
    },
    "_25fc_f05138": {
      "fontCharacter": "\\25fc",
      "fontColor": "#f05138"
    },
    "_25fc_a97bff": {
      "fontCharacter": "\\25fc",
      "fontColor": "#a97bff"
    },
    "_25fc_cbcb41": {
      "fontCharacter": "\\25fc",
      "fontColor": "#cbcb41"
    },
    "_25fc_cb171e": {
      "fontCharacter": "\\25fc",
      "fontColor": "#cb171e"
    },
    "_25fc_9c4221": {
      "fontCharacter": "\\25fc",
      "fontColor": "#9c4221"
    },
    "_25fc_563d7c": {
      "fontCharacter": "\\25fc",
      "fontColor": "#563d7c"
    },
    "_25fc_c6538c": {
      "fontCharacter": "\\25fc",
      "fontColor": "#c6538c"
    },
    "_25fc_e34c26": {
      "fontCharacter": "\\25fc",
      "fontColor": "#e34c26"
    },
    "_25fc_e38c00": {
      "fontCharacter": "\\25fc",
      "fontColor": "#e38c00"
    },
    "_25fc_89e051": {
      "fontCharacter": "\\25fc",
      "fontColor": "#89e051"
    },
    "_25fc_varaccent": {
      "fontCharacter": "\\25fc",
      "fontColor": "var(--accent)"
    },
    "_25fb_varaccent": {
      "fontCharacter": "\\25fb",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25aa_varfg2",
  "folder": "_25fc_varaccent",
  "folderExpanded": "_25fb_varaccent",
  "fileExtensions": {
    "ts": "_25fc_3178c6",
    "tsx": "_25fc_519aba",
    "js": "_25fc_f1e05a",
    "jsx": "_25fc_61dafb",
    "rs": "_25fc_dea584",
    "py": "_25fc_3572a5",
    "go": "_25fc_00add8",
    "java": "_25fc_b07219",
    "rb": "_25fc_cc342d",
    "php": "_25fc_4f5d95",
    "cs": "_25fc_178600",
    "cpp": "_25fc_f34b7d",
    "c": "_25fc_555555",
    "swift": "_25fc_f05138",
    "kt": "_25fc_a97bff",
    "json": "_25fc_cbcb41",
    "yml": "_25fc_cb171e",
    "toml": "_25fc_9c4221",
    "css": "_25fc_563d7c",
    "scss": "_25fc_c6538c",
    "html": "_25fc_e34c26",
    "md": "_25fc_519aba",
    "sql": "_25fc_e38c00",
    "sh": "_25fc_89e051"
  },
  "fileNames": {
    "package.json": "_25fc_cbcb41",
    "tsconfig.json": "_25fc_cbcb41",
    "zephyr-extension.json": "_25fc_cbcb41",
    "Dockerfile": "_25fc_89e051",
    "docker-compose.yml": "_25fc_cb171e",
    "Makefile": "_25fc_89e051",
    ".gitignore": "_25fc_89e051",
    "Cargo.toml": "_25fc_9c4221",
    "README.md": "_25fc_519aba",
    "LICENSE": "_25fc_519aba"
  },
  "folderNames": {
    "src": "_25fc_varaccent",
    "node_modules": "_25fc_varaccent",
    "dist": "_25fc_varaccent",
    "build": "_25fc_varaccent",
    "test": "_25fc_varaccent",
    "tests": "_25fc_varaccent",
    "docs": "_25fc_varaccent",
    "assets": "_25fc_varaccent",
    "components": "_25fc_varaccent",
    "lib": "_25fc_varaccent",
    "public": "_25fc_varaccent",
    "scripts": "_25fc_varaccent",
    ".git": "_25fc_varaccent",
    ".github": "_25fc_varaccent",
    "target": "_25fc_varaccent",
    "vendor": "_25fc_varaccent"
  }
}"##;

pub(super) const IKON_BERLIAN: &str = r##"{
  "id": "zephyr.ikon-berlian",
  "name": "Ikon Berlian",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Diamond marks, sharp and compact",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Berlian", "path": "./icons/berlian.json" }]
  }
}"##;

pub(super) const IKON_BERLIAN_JSON: &str = r##"{
  "iconDefinitions": {
    "_25c6_varfg2": {
      "fontCharacter": "\\25c6",
      "fontColor": "var(--fg2)"
    },
    "_25c8_5b9dd9": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5b9dd9"
    },
    "_25c8_e8c547": {
      "fontCharacter": "\\25c8",
      "fontColor": "#e8c547"
    },
    "_25c8_c98a6b": {
      "fontCharacter": "\\25c8",
      "fontColor": "#c98a6b"
    },
    "_25c8_4b8bbe": {
      "fontCharacter": "\\25c8",
      "fontColor": "#4b8bbe"
    },
    "_25c8_00add8": {
      "fontCharacter": "\\25c8",
      "fontColor": "#00add8"
    },
    "_25c8_c07030": {
      "fontCharacter": "\\25c8",
      "fontColor": "#c07030"
    },
    "_25c8_b03050": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b03050"
    },
    "_25c8_6a72b5": {
      "fontCharacter": "\\25c8",
      "fontColor": "#6a72b5"
    },
    "_25c8_3a8a3a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#3a8a3a"
    },
    "_25c8_d05070": {
      "fontCharacter": "\\25c8",
      "fontColor": "#d05070"
    },
    "_25c8_707070": {
      "fontCharacter": "\\25c8",
      "fontColor": "#707070"
    },
    "_25c8_f05138": {
      "fontCharacter": "\\25c8",
      "fontColor": "#f05138"
    },
    "_25c8_9a7bd0": {
      "fontCharacter": "\\25c8",
      "fontColor": "#9a7bd0"
    },
    "_25c8_b5b53a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b5b53a"
    },
    "_25c8_b03a3a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b03a3a"
    },
    "_25c8_a05a30": {
      "fontCharacter": "\\25c8",
      "fontColor": "#a05a30"
    },
    "_25c8_7a4a9a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#7a4a9a"
    },
    "_25c8_b05080": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b05080"
    },
    "_25c8_d05a3a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#d05a3a"
    },
    "_25c8_4a8ab5": {
      "fontCharacter": "\\25c8",
      "fontColor": "#4a8ab5"
    },
    "_25c8_c08020": {
      "fontCharacter": "\\25c8",
      "fontColor": "#c08020"
    },
    "_25c8_70c060": {
      "fontCharacter": "\\25c8",
      "fontColor": "#70c060"
    },
    "_25c8_varaccent": {
      "fontCharacter": "\\25c8",
      "fontColor": "var(--accent)"
    },
    "_25c7_varaccent": {
      "fontCharacter": "\\25c7",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25c6_varfg2",
  "folder": "_25c8_varaccent",
  "folderExpanded": "_25c7_varaccent",
  "fileExtensions": {
    "ts": "_25c8_5b9dd9",
    "tsx": "_25c8_5b9dd9",
    "js": "_25c8_e8c547",
    "jsx": "_25c8_e8c547",
    "rs": "_25c8_c98a6b",
    "py": "_25c8_4b8bbe",
    "go": "_25c8_00add8",
    "java": "_25c8_c07030",
    "rb": "_25c8_b03050",
    "php": "_25c8_6a72b5",
    "cs": "_25c8_3a8a3a",
    "cpp": "_25c8_d05070",
    "c": "_25c8_707070",
    "swift": "_25c8_f05138",
    "kt": "_25c8_9a7bd0",
    "json": "_25c8_b5b53a",
    "yml": "_25c8_b03a3a",
    "toml": "_25c8_a05a30",
    "css": "_25c8_7a4a9a",
    "scss": "_25c8_b05080",
    "html": "_25c8_d05a3a",
    "md": "_25c8_4a8ab5",
    "sql": "_25c8_c08020",
    "sh": "_25c8_70c060"
  },
  "fileNames": {
    "package.json": "_25c8_b5b53a",
    "tsconfig.json": "_25c8_b5b53a",
    "zephyr-extension.json": "_25c8_b5b53a",
    "Dockerfile": "_25c8_70c060",
    "docker-compose.yml": "_25c8_b03a3a",
    "Makefile": "_25c8_70c060",
    ".gitignore": "_25c8_70c060",
    "Cargo.toml": "_25c8_a05a30",
    "README.md": "_25c8_4a8ab5",
    "LICENSE": "_25c8_4a8ab5"
  },
  "folderNames": {
    "src": "_25c8_varaccent",
    "node_modules": "_25c8_varaccent",
    "dist": "_25c8_varaccent",
    "build": "_25c8_varaccent",
    "test": "_25c8_varaccent",
    "tests": "_25c8_varaccent",
    "docs": "_25c8_varaccent",
    "assets": "_25c8_varaccent",
    "components": "_25c8_varaccent",
    "lib": "_25c8_varaccent",
    "public": "_25c8_varaccent",
    "scripts": "_25c8_varaccent",
    ".git": "_25c8_varaccent",
    ".github": "_25c8_varaccent",
    "target": "_25c8_varaccent",
    "vendor": "_25c8_varaccent"
  }
}"##;

pub(super) const IKON_SEGITIGA: &str = r##"{
  "id": "zephyr.ikon-segitiga",
  "name": "Ikon Segitiga",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Triangles, geometric and distinct",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Segitiga", "path": "./icons/segitiga.json" }]
  }
}"##;

pub(super) const IKON_SEGITIGA_JSON: &str = r##"{
  "iconDefinitions": {
    "_25b2_varfg2": {
      "fontCharacter": "\\25b2",
      "fontColor": "var(--fg2)"
    },
    "_25b4_3178c6": {
      "fontCharacter": "\\25b4",
      "fontColor": "#3178c6"
    },
    "_25b4_519aba": {
      "fontCharacter": "\\25b4",
      "fontColor": "#519aba"
    },
    "_25b4_f1e05a": {
      "fontCharacter": "\\25b4",
      "fontColor": "#f1e05a"
    },
    "_25b4_61dafb": {
      "fontCharacter": "\\25b4",
      "fontColor": "#61dafb"
    },
    "_25b4_dea584": {
      "fontCharacter": "\\25b4",
      "fontColor": "#dea584"
    },
    "_25b4_3572a5": {
      "fontCharacter": "\\25b4",
      "fontColor": "#3572a5"
    },
    "_25b4_00add8": {
      "fontCharacter": "\\25b4",
      "fontColor": "#00add8"
    },
    "_25b4_b07219": {
      "fontCharacter": "\\25b4",
      "fontColor": "#b07219"
    },
    "_25b4_cc342d": {
      "fontCharacter": "\\25b4",
      "fontColor": "#cc342d"
    },
    "_25b4_4f5d95": {
      "fontCharacter": "\\25b4",
      "fontColor": "#4f5d95"
    },
    "_25b4_178600": {
      "fontCharacter": "\\25b4",
      "fontColor": "#178600"
    },
    "_25b4_f34b7d": {
      "fontCharacter": "\\25b4",
      "fontColor": "#f34b7d"
    },
    "_25b4_555555": {
      "fontCharacter": "\\25b4",
      "fontColor": "#555555"
    },
    "_25b4_f05138": {
      "fontCharacter": "\\25b4",
      "fontColor": "#f05138"
    },
    "_25b4_a97bff": {
      "fontCharacter": "\\25b4",
      "fontColor": "#a97bff"
    },
    "_25b4_cbcb41": {
      "fontCharacter": "\\25b4",
      "fontColor": "#cbcb41"
    },
    "_25b4_cb171e": {
      "fontCharacter": "\\25b4",
      "fontColor": "#cb171e"
    },
    "_25b4_9c4221": {
      "fontCharacter": "\\25b4",
      "fontColor": "#9c4221"
    },
    "_25b4_563d7c": {
      "fontCharacter": "\\25b4",
      "fontColor": "#563d7c"
    },
    "_25b4_c6538c": {
      "fontCharacter": "\\25b4",
      "fontColor": "#c6538c"
    },
    "_25b4_e34c26": {
      "fontCharacter": "\\25b4",
      "fontColor": "#e34c26"
    },
    "_25b4_e38c00": {
      "fontCharacter": "\\25b4",
      "fontColor": "#e38c00"
    },
    "_25b4_89e051": {
      "fontCharacter": "\\25b4",
      "fontColor": "#89e051"
    },
    "_25b4_varaccent": {
      "fontCharacter": "\\25b4",
      "fontColor": "var(--accent)"
    },
    "_25b5_varaccent": {
      "fontCharacter": "\\25b5",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25b2_varfg2",
  "folder": "_25b4_varaccent",
  "folderExpanded": "_25b5_varaccent",
  "fileExtensions": {
    "ts": "_25b4_3178c6",
    "tsx": "_25b4_519aba",
    "js": "_25b4_f1e05a",
    "jsx": "_25b4_61dafb",
    "rs": "_25b4_dea584",
    "py": "_25b4_3572a5",
    "go": "_25b4_00add8",
    "java": "_25b4_b07219",
    "rb": "_25b4_cc342d",
    "php": "_25b4_4f5d95",
    "cs": "_25b4_178600",
    "cpp": "_25b4_f34b7d",
    "c": "_25b4_555555",
    "swift": "_25b4_f05138",
    "kt": "_25b4_a97bff",
    "json": "_25b4_cbcb41",
    "yml": "_25b4_cb171e",
    "toml": "_25b4_9c4221",
    "css": "_25b4_563d7c",
    "scss": "_25b4_c6538c",
    "html": "_25b4_e34c26",
    "md": "_25b4_519aba",
    "sql": "_25b4_e38c00",
    "sh": "_25b4_89e051"
  },
  "fileNames": {
    "package.json": "_25b4_cbcb41",
    "tsconfig.json": "_25b4_cbcb41",
    "zephyr-extension.json": "_25b4_cbcb41",
    "Dockerfile": "_25b4_89e051",
    "docker-compose.yml": "_25b4_cb171e",
    "Makefile": "_25b4_89e051",
    ".gitignore": "_25b4_89e051",
    "Cargo.toml": "_25b4_9c4221",
    "README.md": "_25b4_519aba",
    "LICENSE": "_25b4_519aba"
  },
  "folderNames": {
    "src": "_25b4_varaccent",
    "node_modules": "_25b4_varaccent",
    "dist": "_25b4_varaccent",
    "build": "_25b4_varaccent",
    "test": "_25b4_varaccent",
    "tests": "_25b4_varaccent",
    "docs": "_25b4_varaccent",
    "assets": "_25b4_varaccent",
    "components": "_25b4_varaccent",
    "lib": "_25b4_varaccent",
    "public": "_25b4_varaccent",
    "scripts": "_25b4_varaccent",
    ".git": "_25b4_varaccent",
    ".github": "_25b4_varaccent",
    "target": "_25b4_varaccent",
    "vendor": "_25b4_varaccent"
  }
}"##;

pub(super) const IKON_KISI: &str = r##"{
  "id": "zephyr.ikon-kisi",
  "name": "Ikon Kisi",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Grid marks, technical and neutral",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kisi", "path": "./icons/kisi.json" }]
  }
}"##;

pub(super) const IKON_KISI_JSON: &str = r##"{
  "iconDefinitions": {
    "_25a6_varfg2": {
      "fontCharacter": "\\25a6",
      "fontColor": "var(--fg2)"
    },
    "_25a9_4a90c2": {
      "fontCharacter": "\\25a9",
      "fontColor": "#4a90c2"
    },
    "_25a9_c9b93a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#c9b93a"
    },
    "_25a9_c08a6a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#c08a6a"
    },
    "_25a9_4a80a5": {
      "fontCharacter": "\\25a9",
      "fontColor": "#4a80a5"
    },
    "_25a9_00a0c8": {
      "fontCharacter": "\\25a9",
      "fontColor": "#00a0c8"
    },
    "_25a9_a56818": {
      "fontCharacter": "\\25a9",
      "fontColor": "#a56818"
    },
    "_25a9_b82f40": {
      "fontCharacter": "\\25a9",
      "fontColor": "#b82f40"
    },
    "_25a9_4a5a9a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#4a5a9a"
    },
    "_25a9_2f7a2f": {
      "fontCharacter": "\\25a9",
      "fontColor": "#2f7a2f"
    },
    "_25a9_c04a6a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#c04a6a"
    },
    "_25a9_5a5a5a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#5a5a5a"
    },
    "_25a9_e04a30": {
      "fontCharacter": "\\25a9",
      "fontColor": "#e04a30"
    },
    "_25a9_8f6fd0": {
      "fontCharacter": "\\25a9",
      "fontColor": "#8f6fd0"
    },
    "_25a9_b0b038": {
      "fontCharacter": "\\25a9",
      "fontColor": "#b0b038"
    },
    "_25a9_b03038": {
      "fontCharacter": "\\25a9",
      "fontColor": "#b03038"
    },
    "_25a9_905028": {
      "fontCharacter": "\\25a9",
      "fontColor": "#905028"
    },
    "_25a9_5a3a8a": {
      "fontCharacter": "\\25a9",
      "fontColor": "#5a3a8a"
    },
    "_25a9_a84a78": {
      "fontCharacter": "\\25a9",
      "fontColor": "#a84a78"
    },
    "_25a9_c85430": {
      "fontCharacter": "\\25a9",
      "fontColor": "#c85430"
    },
    "_25a9_4a80a8": {
      "fontCharacter": "\\25a9",
      "fontColor": "#4a80a8"
    },
    "_25a9_b87a18": {
      "fontCharacter": "\\25a9",
      "fontColor": "#b87a18"
    },
    "_25a9_68b858": {
      "fontCharacter": "\\25a9",
      "fontColor": "#68b858"
    },
    "_25a9_varaccent": {
      "fontCharacter": "\\25a9",
      "fontColor": "var(--accent)"
    },
    "_25a8_varaccent": {
      "fontCharacter": "\\25a8",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25a6_varfg2",
  "folder": "_25a9_varaccent",
  "folderExpanded": "_25a8_varaccent",
  "fileExtensions": {
    "ts": "_25a9_4a90c2",
    "tsx": "_25a9_4a90c2",
    "js": "_25a9_c9b93a",
    "jsx": "_25a9_c9b93a",
    "rs": "_25a9_c08a6a",
    "py": "_25a9_4a80a5",
    "go": "_25a9_00a0c8",
    "java": "_25a9_a56818",
    "rb": "_25a9_b82f40",
    "php": "_25a9_4a5a9a",
    "cs": "_25a9_2f7a2f",
    "cpp": "_25a9_c04a6a",
    "c": "_25a9_5a5a5a",
    "swift": "_25a9_e04a30",
    "kt": "_25a9_8f6fd0",
    "json": "_25a9_b0b038",
    "yml": "_25a9_b03038",
    "toml": "_25a9_905028",
    "css": "_25a9_5a3a8a",
    "scss": "_25a9_a84a78",
    "html": "_25a9_c85430",
    "md": "_25a9_4a80a8",
    "sql": "_25a9_b87a18",
    "sh": "_25a9_68b858"
  },
  "fileNames": {
    "package.json": "_25a9_b0b038",
    "tsconfig.json": "_25a9_b0b038",
    "zephyr-extension.json": "_25a9_b0b038",
    "Dockerfile": "_25a9_68b858",
    "docker-compose.yml": "_25a9_b03038",
    "Makefile": "_25a9_68b858",
    ".gitignore": "_25a9_68b858",
    "Cargo.toml": "_25a9_905028",
    "README.md": "_25a9_4a80a8",
    "LICENSE": "_25a9_4a80a8"
  },
  "folderNames": {
    "src": "_25a9_varaccent",
    "node_modules": "_25a9_varaccent",
    "dist": "_25a9_varaccent",
    "build": "_25a9_varaccent",
    "test": "_25a9_varaccent",
    "tests": "_25a9_varaccent",
    "docs": "_25a9_varaccent",
    "assets": "_25a9_varaccent",
    "components": "_25a9_varaccent",
    "lib": "_25a9_varaccent",
    "public": "_25a9_varaccent",
    "scripts": "_25a9_varaccent",
    ".git": "_25a9_varaccent",
    ".github": "_25a9_varaccent",
    "target": "_25a9_varaccent",
    "vendor": "_25a9_varaccent"
  }
}"##;

pub(super) const IKON_LINGKARAN: &str = r##"{
  "id": "zephyr.ikon-lingkaran",
  "name": "Ikon Lingkaran",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Circles, the softest of the sets",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Lingkaran", "path": "./icons/lingkaran.json" }]
  }
}"##;

pub(super) const IKON_LINGKARAN_JSON: &str = r##"{
  "iconDefinitions": {
    "_25cb_varfg2": {
      "fontCharacter": "\\25cb",
      "fontColor": "var(--fg2)"
    },
    "_25cf_3178c6": {
      "fontCharacter": "\\25cf",
      "fontColor": "#3178c6"
    },
    "_25cf_519aba": {
      "fontCharacter": "\\25cf",
      "fontColor": "#519aba"
    },
    "_25cf_f1e05a": {
      "fontCharacter": "\\25cf",
      "fontColor": "#f1e05a"
    },
    "_25cf_61dafb": {
      "fontCharacter": "\\25cf",
      "fontColor": "#61dafb"
    },
    "_25cf_dea584": {
      "fontCharacter": "\\25cf",
      "fontColor": "#dea584"
    },
    "_25cf_3572a5": {
      "fontCharacter": "\\25cf",
      "fontColor": "#3572a5"
    },
    "_25cf_00add8": {
      "fontCharacter": "\\25cf",
      "fontColor": "#00add8"
    },
    "_25cf_b07219": {
      "fontCharacter": "\\25cf",
      "fontColor": "#b07219"
    },
    "_25cf_cc342d": {
      "fontCharacter": "\\25cf",
      "fontColor": "#cc342d"
    },
    "_25cf_4f5d95": {
      "fontCharacter": "\\25cf",
      "fontColor": "#4f5d95"
    },
    "_25cf_178600": {
      "fontCharacter": "\\25cf",
      "fontColor": "#178600"
    },
    "_25cf_f34b7d": {
      "fontCharacter": "\\25cf",
      "fontColor": "#f34b7d"
    },
    "_25cf_555555": {
      "fontCharacter": "\\25cf",
      "fontColor": "#555555"
    },
    "_25cf_f05138": {
      "fontCharacter": "\\25cf",
      "fontColor": "#f05138"
    },
    "_25cf_a97bff": {
      "fontCharacter": "\\25cf",
      "fontColor": "#a97bff"
    },
    "_25cf_cbcb41": {
      "fontCharacter": "\\25cf",
      "fontColor": "#cbcb41"
    },
    "_25cf_cb171e": {
      "fontCharacter": "\\25cf",
      "fontColor": "#cb171e"
    },
    "_25cf_9c4221": {
      "fontCharacter": "\\25cf",
      "fontColor": "#9c4221"
    },
    "_25cf_563d7c": {
      "fontCharacter": "\\25cf",
      "fontColor": "#563d7c"
    },
    "_25cf_c6538c": {
      "fontCharacter": "\\25cf",
      "fontColor": "#c6538c"
    },
    "_25cf_e34c26": {
      "fontCharacter": "\\25cf",
      "fontColor": "#e34c26"
    },
    "_25cf_e38c00": {
      "fontCharacter": "\\25cf",
      "fontColor": "#e38c00"
    },
    "_25cf_89e051": {
      "fontCharacter": "\\25cf",
      "fontColor": "#89e051"
    },
    "_25cf_varaccent": {
      "fontCharacter": "\\25cf",
      "fontColor": "var(--accent)"
    },
    "_25cc_varaccent": {
      "fontCharacter": "\\25cc",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25cb_varfg2",
  "folder": "_25cf_varaccent",
  "folderExpanded": "_25cc_varaccent",
  "fileExtensions": {
    "ts": "_25cf_3178c6",
    "tsx": "_25cf_519aba",
    "js": "_25cf_f1e05a",
    "jsx": "_25cf_61dafb",
    "rs": "_25cf_dea584",
    "py": "_25cf_3572a5",
    "go": "_25cf_00add8",
    "java": "_25cf_b07219",
    "rb": "_25cf_cc342d",
    "php": "_25cf_4f5d95",
    "cs": "_25cf_178600",
    "cpp": "_25cf_f34b7d",
    "c": "_25cf_555555",
    "swift": "_25cf_f05138",
    "kt": "_25cf_a97bff",
    "json": "_25cf_cbcb41",
    "yml": "_25cf_cb171e",
    "toml": "_25cf_9c4221",
    "css": "_25cf_563d7c",
    "scss": "_25cf_c6538c",
    "html": "_25cf_e34c26",
    "md": "_25cf_519aba",
    "sql": "_25cf_e38c00",
    "sh": "_25cf_89e051"
  },
  "fileNames": {
    "package.json": "_25cf_cbcb41",
    "tsconfig.json": "_25cf_cbcb41",
    "zephyr-extension.json": "_25cf_cbcb41",
    "Dockerfile": "_25cf_89e051",
    "docker-compose.yml": "_25cf_cb171e",
    "Makefile": "_25cf_89e051",
    ".gitignore": "_25cf_89e051",
    "Cargo.toml": "_25cf_9c4221",
    "README.md": "_25cf_519aba",
    "LICENSE": "_25cf_519aba"
  },
  "folderNames": {
    "src": "_25cf_varaccent",
    "node_modules": "_25cf_varaccent",
    "dist": "_25cf_varaccent",
    "build": "_25cf_varaccent",
    "test": "_25cf_varaccent",
    "tests": "_25cf_varaccent",
    "docs": "_25cf_varaccent",
    "assets": "_25cf_varaccent",
    "components": "_25cf_varaccent",
    "lib": "_25cf_varaccent",
    "public": "_25cf_varaccent",
    "scripts": "_25cf_varaccent",
    ".git": "_25cf_varaccent",
    ".github": "_25cf_varaccent",
    "target": "_25cf_varaccent",
    "vendor": "_25cf_varaccent"
  }
}"##;

pub(super) const IKON_KOTAK_GARIS: &str = r##"{
  "id": "zephyr.ikon-kotak-garis",
  "name": "Ikon Kotak Garis",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Thin outlined boxes, quiet",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kotak Garis", "path": "./icons/kotak-garis.json" }]
  }
}"##;

pub(super) const IKON_KOTAK_GARIS_JSON: &str = r##"{
  "iconDefinitions": {
    "_25a2_varfg2": {
      "fontCharacter": "\\25a2",
      "fontColor": "var(--fg2)"
    },
    "_25a3_5a8ab5": {
      "fontCharacter": "\\25a3",
      "fontColor": "#5a8ab5"
    },
    "_25a3_c2b53a": {
      "fontCharacter": "\\25a3",
      "fontColor": "#c2b53a"
    },
    "_25a3_b08060": {
      "fontCharacter": "\\25a3",
      "fontColor": "#b08060"
    },
    "_25a3_4a7595": {
      "fontCharacter": "\\25a3",
      "fontColor": "#4a7595"
    },
    "_25a3_0095bb": {
      "fontCharacter": "\\25a3",
      "fontColor": "#0095bb"
    },
    "_25a3_9a5a18": {
      "fontCharacter": "\\25a3",
      "fontColor": "#9a5a18"
    },
    "_25a3_a82f3a": {
      "fontCharacter": "\\25a3",
      "fontColor": "#a82f3a"
    },
    "_25a3_48558a": {
      "fontCharacter": "\\25a3",
      "fontColor": "#48558a"
    },
    "_25a3_2f6f2f": {
      "fontCharacter": "\\25a3",
      "fontColor": "#2f6f2f"
    },
    "_25a3_b54560": {
      "fontCharacter": "\\25a3",
      "fontColor": "#b54560"
    },
    "_25a3_5a5a5a": {
      "fontCharacter": "\\25a3",
      "fontColor": "#5a5a5a"
    },
    "_25a3_d04530": {
      "fontCharacter": "\\25a3",
      "fontColor": "#d04530"
    },
    "_25a3_8560c0": {
      "fontCharacter": "\\25a3",
      "fontColor": "#8560c0"
    },
    "_25a3_a8a838": {
      "fontCharacter": "\\25a3",
      "fontColor": "#a8a838"
    },
    "_25a3_a82f35": {
      "fontCharacter": "\\25a3",
      "fontColor": "#a82f35"
    },
    "_25a3_885028": {
      "fontCharacter": "\\25a3",
      "fontColor": "#885028"
    },
    "_25a3_553a80": {
      "fontCharacter": "\\25a3",
      "fontColor": "#553a80"
    },
    "_25a3_9a4570": {
      "fontCharacter": "\\25a3",
      "fontColor": "#9a4570"
    },
    "_25a3_bb4f2f": {
      "fontCharacter": "\\25a3",
      "fontColor": "#bb4f2f"
    },
    "_25a3_4a7aa0": {
      "fontCharacter": "\\25a3",
      "fontColor": "#4a7aa0"
    },
    "_25a3_aa7518": {
      "fontCharacter": "\\25a3",
      "fontColor": "#aa7518"
    },
    "_25a3_60aa50": {
      "fontCharacter": "\\25a3",
      "fontColor": "#60aa50"
    },
    "_25a3_varaccent": {
      "fontCharacter": "\\25a3",
      "fontColor": "var(--accent)"
    },
    "_25a4_varaccent": {
      "fontCharacter": "\\25a4",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25a2_varfg2",
  "folder": "_25a3_varaccent",
  "folderExpanded": "_25a4_varaccent",
  "fileExtensions": {
    "ts": "_25a3_5a8ab5",
    "tsx": "_25a3_5a8ab5",
    "js": "_25a3_c2b53a",
    "jsx": "_25a3_c2b53a",
    "rs": "_25a3_b08060",
    "py": "_25a3_4a7595",
    "go": "_25a3_0095bb",
    "java": "_25a3_9a5a18",
    "rb": "_25a3_a82f3a",
    "php": "_25a3_48558a",
    "cs": "_25a3_2f6f2f",
    "cpp": "_25a3_b54560",
    "c": "_25a3_5a5a5a",
    "swift": "_25a3_d04530",
    "kt": "_25a3_8560c0",
    "json": "_25a3_a8a838",
    "yml": "_25a3_a82f35",
    "toml": "_25a3_885028",
    "css": "_25a3_553a80",
    "scss": "_25a3_9a4570",
    "html": "_25a3_bb4f2f",
    "md": "_25a3_4a7aa0",
    "sql": "_25a3_aa7518",
    "sh": "_25a3_60aa50"
  },
  "fileNames": {
    "package.json": "_25a3_a8a838",
    "tsconfig.json": "_25a3_a8a838",
    "zephyr-extension.json": "_25a3_a8a838",
    "Dockerfile": "_25a3_60aa50",
    "docker-compose.yml": "_25a3_a82f35",
    "Makefile": "_25a3_60aa50",
    ".gitignore": "_25a3_60aa50",
    "Cargo.toml": "_25a3_885028",
    "README.md": "_25a3_4a7aa0",
    "LICENSE": "_25a3_4a7aa0"
  },
  "folderNames": {
    "src": "_25a3_varaccent",
    "node_modules": "_25a3_varaccent",
    "dist": "_25a3_varaccent",
    "build": "_25a3_varaccent",
    "test": "_25a3_varaccent",
    "tests": "_25a3_varaccent",
    "docs": "_25a3_varaccent",
    "assets": "_25a3_varaccent",
    "components": "_25a3_varaccent",
    "lib": "_25a3_varaccent",
    "public": "_25a3_varaccent",
    "scripts": "_25a3_varaccent",
    ".git": "_25a3_varaccent",
    ".github": "_25a3_varaccent",
    "target": "_25a3_varaccent",
    "vendor": "_25a3_varaccent"
  }
}"##;

pub(super) const IKON_PANAH: &str = r##"{
  "id": "zephyr.ikon-panah",
  "name": "Ikon Panah",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Arrow marks, direction per language",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Panah", "path": "./icons/panah.json" }]
  }
}"##;

pub(super) const IKON_PANAH_JSON: &str = r##"{
  "iconDefinitions": {
    "_203a_varfg2": {
      "fontCharacter": "\\203a",
      "fontColor": "var(--fg2)"
    },
    "_bb_3178c6": {
      "fontCharacter": "\\bb",
      "fontColor": "#3178c6"
    },
    "_bb_519aba": {
      "fontCharacter": "\\bb",
      "fontColor": "#519aba"
    },
    "_bb_f1e05a": {
      "fontCharacter": "\\bb",
      "fontColor": "#f1e05a"
    },
    "_bb_61dafb": {
      "fontCharacter": "\\bb",
      "fontColor": "#61dafb"
    },
    "_bb_dea584": {
      "fontCharacter": "\\bb",
      "fontColor": "#dea584"
    },
    "_bb_3572a5": {
      "fontCharacter": "\\bb",
      "fontColor": "#3572a5"
    },
    "_bb_00add8": {
      "fontCharacter": "\\bb",
      "fontColor": "#00add8"
    },
    "_bb_b07219": {
      "fontCharacter": "\\bb",
      "fontColor": "#b07219"
    },
    "_bb_cc342d": {
      "fontCharacter": "\\bb",
      "fontColor": "#cc342d"
    },
    "_bb_4f5d95": {
      "fontCharacter": "\\bb",
      "fontColor": "#4f5d95"
    },
    "_bb_178600": {
      "fontCharacter": "\\bb",
      "fontColor": "#178600"
    },
    "_bb_f34b7d": {
      "fontCharacter": "\\bb",
      "fontColor": "#f34b7d"
    },
    "_bb_555555": {
      "fontCharacter": "\\bb",
      "fontColor": "#555555"
    },
    "_bb_f05138": {
      "fontCharacter": "\\bb",
      "fontColor": "#f05138"
    },
    "_bb_a97bff": {
      "fontCharacter": "\\bb",
      "fontColor": "#a97bff"
    },
    "_bb_cbcb41": {
      "fontCharacter": "\\bb",
      "fontColor": "#cbcb41"
    },
    "_bb_cb171e": {
      "fontCharacter": "\\bb",
      "fontColor": "#cb171e"
    },
    "_bb_9c4221": {
      "fontCharacter": "\\bb",
      "fontColor": "#9c4221"
    },
    "_bb_563d7c": {
      "fontCharacter": "\\bb",
      "fontColor": "#563d7c"
    },
    "_bb_c6538c": {
      "fontCharacter": "\\bb",
      "fontColor": "#c6538c"
    },
    "_bb_e34c26": {
      "fontCharacter": "\\bb",
      "fontColor": "#e34c26"
    },
    "_bb_e38c00": {
      "fontCharacter": "\\bb",
      "fontColor": "#e38c00"
    },
    "_bb_89e051": {
      "fontCharacter": "\\bb",
      "fontColor": "#89e051"
    },
    "_bb_varaccent": {
      "fontCharacter": "\\bb",
      "fontColor": "var(--accent)"
    },
    "_203a_varaccent": {
      "fontCharacter": "\\203a",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_203a_varfg2",
  "folder": "_bb_varaccent",
  "folderExpanded": "_203a_varaccent",
  "fileExtensions": {
    "ts": "_bb_3178c6",
    "tsx": "_bb_519aba",
    "js": "_bb_f1e05a",
    "jsx": "_bb_61dafb",
    "rs": "_bb_dea584",
    "py": "_bb_3572a5",
    "go": "_bb_00add8",
    "java": "_bb_b07219",
    "rb": "_bb_cc342d",
    "php": "_bb_4f5d95",
    "cs": "_bb_178600",
    "cpp": "_bb_f34b7d",
    "c": "_bb_555555",
    "swift": "_bb_f05138",
    "kt": "_bb_a97bff",
    "json": "_bb_cbcb41",
    "yml": "_bb_cb171e",
    "toml": "_bb_9c4221",
    "css": "_bb_563d7c",
    "scss": "_bb_c6538c",
    "html": "_bb_e34c26",
    "md": "_bb_519aba",
    "sql": "_bb_e38c00",
    "sh": "_bb_89e051"
  },
  "fileNames": {
    "package.json": "_bb_cbcb41",
    "tsconfig.json": "_bb_cbcb41",
    "zephyr-extension.json": "_bb_cbcb41",
    "Dockerfile": "_bb_89e051",
    "docker-compose.yml": "_bb_cb171e",
    "Makefile": "_bb_89e051",
    ".gitignore": "_bb_89e051",
    "Cargo.toml": "_bb_9c4221",
    "README.md": "_bb_519aba",
    "LICENSE": "_bb_519aba"
  },
  "folderNames": {
    "src": "_bb_varaccent",
    "node_modules": "_bb_varaccent",
    "dist": "_bb_varaccent",
    "build": "_bb_varaccent",
    "test": "_bb_varaccent",
    "tests": "_bb_varaccent",
    "docs": "_bb_varaccent",
    "assets": "_bb_varaccent",
    "components": "_bb_varaccent",
    "lib": "_bb_varaccent",
    "public": "_bb_varaccent",
    "scripts": "_bb_varaccent",
    ".git": "_bb_varaccent",
    ".github": "_bb_varaccent",
    "target": "_bb_varaccent",
    "vendor": "_bb_varaccent"
  }
}"##;

pub(super) const IKON_BINTANG: &str = r##"{
  "id": "zephyr.ikon-bintang",
  "name": "Ikon Bintang",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Star marks, bright and legible",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Bintang", "path": "./icons/bintang.json" }]
  }
}"##;

pub(super) const IKON_BINTANG_JSON: &str = r##"{
  "iconDefinitions": {
    "_2726_varfg2": {
      "fontCharacter": "\\2726",
      "fontColor": "var(--fg2)"
    },
    "_2727_4a90c2": {
      "fontCharacter": "\\2727",
      "fontColor": "#4a90c2"
    },
    "_2727_d4c33a": {
      "fontCharacter": "\\2727",
      "fontColor": "#d4c33a"
    },
    "_2727_c89070": {
      "fontCharacter": "\\2727",
      "fontColor": "#c89070"
    },
    "_2727_4a80a5": {
      "fontCharacter": "\\2727",
      "fontColor": "#4a80a5"
    },
    "_2727_00a0c8": {
      "fontCharacter": "\\2727",
      "fontColor": "#00a0c8"
    },
    "_2727_a87018": {
      "fontCharacter": "\\2727",
      "fontColor": "#a87018"
    },
    "_2727_b83040": {
      "fontCharacter": "\\2727",
      "fontColor": "#b83040"
    },
    "_2727_4a5a9a": {
      "fontCharacter": "\\2727",
      "fontColor": "#4a5a9a"
    },
    "_2727_2f7a2f": {
      "fontCharacter": "\\2727",
      "fontColor": "#2f7a2f"
    },
    "_2727_c0506a": {
      "fontCharacter": "\\2727",
      "fontColor": "#c0506a"
    },
    "_2727_606060": {
      "fontCharacter": "\\2727",
      "fontColor": "#606060"
    },
    "_2727_e04a30": {
      "fontCharacter": "\\2727",
      "fontColor": "#e04a30"
    },
    "_2727_8f6fd0": {
      "fontCharacter": "\\2727",
      "fontColor": "#8f6fd0"
    },
    "_2727_b5b53a": {
      "fontCharacter": "\\2727",
      "fontColor": "#b5b53a"
    },
    "_2727_b03038": {
      "fontCharacter": "\\2727",
      "fontColor": "#b03038"
    },
    "_2727_905028": {
      "fontCharacter": "\\2727",
      "fontColor": "#905028"
    },
    "_2727_5a3a8a": {
      "fontCharacter": "\\2727",
      "fontColor": "#5a3a8a"
    },
    "_2727_a84a78": {
      "fontCharacter": "\\2727",
      "fontColor": "#a84a78"
    },
    "_2727_c85430": {
      "fontCharacter": "\\2727",
      "fontColor": "#c85430"
    },
    "_2727_4a80a8": {
      "fontCharacter": "\\2727",
      "fontColor": "#4a80a8"
    },
    "_2727_b87a18": {
      "fontCharacter": "\\2727",
      "fontColor": "#b87a18"
    },
    "_2727_68b858": {
      "fontCharacter": "\\2727",
      "fontColor": "#68b858"
    },
    "_2727_varaccent": {
      "fontCharacter": "\\2727",
      "fontColor": "var(--accent)"
    },
    "_2729_varaccent": {
      "fontCharacter": "\\2729",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2726_varfg2",
  "folder": "_2727_varaccent",
  "folderExpanded": "_2729_varaccent",
  "fileExtensions": {
    "ts": "_2727_4a90c2",
    "tsx": "_2727_4a90c2",
    "js": "_2727_d4c33a",
    "jsx": "_2727_d4c33a",
    "rs": "_2727_c89070",
    "py": "_2727_4a80a5",
    "go": "_2727_00a0c8",
    "java": "_2727_a87018",
    "rb": "_2727_b83040",
    "php": "_2727_4a5a9a",
    "cs": "_2727_2f7a2f",
    "cpp": "_2727_c0506a",
    "c": "_2727_606060",
    "swift": "_2727_e04a30",
    "kt": "_2727_8f6fd0",
    "json": "_2727_b5b53a",
    "yml": "_2727_b03038",
    "toml": "_2727_905028",
    "css": "_2727_5a3a8a",
    "scss": "_2727_a84a78",
    "html": "_2727_c85430",
    "md": "_2727_4a80a8",
    "sql": "_2727_b87a18",
    "sh": "_2727_68b858"
  },
  "fileNames": {
    "package.json": "_2727_b5b53a",
    "tsconfig.json": "_2727_b5b53a",
    "zephyr-extension.json": "_2727_b5b53a",
    "Dockerfile": "_2727_68b858",
    "docker-compose.yml": "_2727_b03038",
    "Makefile": "_2727_68b858",
    ".gitignore": "_2727_68b858",
    "Cargo.toml": "_2727_905028",
    "README.md": "_2727_4a80a8",
    "LICENSE": "_2727_4a80a8"
  },
  "folderNames": {
    "src": "_2727_varaccent",
    "node_modules": "_2727_varaccent",
    "dist": "_2727_varaccent",
    "build": "_2727_varaccent",
    "test": "_2727_varaccent",
    "tests": "_2727_varaccent",
    "docs": "_2727_varaccent",
    "assets": "_2727_varaccent",
    "components": "_2727_varaccent",
    "lib": "_2727_varaccent",
    "public": "_2727_varaccent",
    "scripts": "_2727_varaccent",
    ".git": "_2727_varaccent",
    ".github": "_2727_varaccent",
    "target": "_2727_varaccent",
    "vendor": "_2727_varaccent"
  }
}"##;

pub(super) const IKON_BERLUBANG: &str = r##"{
  "id": "zephyr.ikon-berlubang",
  "name": "Ikon Berlubang",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Hollow shapes, light and airy",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Berlubang", "path": "./icons/berlubang.json" }]
  }
}"##;

pub(super) const IKON_BERLUBANG_JSON: &str = r##"{
  "iconDefinitions": {
    "_25ef_varfg2": {
      "fontCharacter": "\\25ef",
      "fontColor": "var(--fg2)"
    },
    "_25c9_5a9ac2": {
      "fontCharacter": "\\25c9",
      "fontColor": "#5a9ac2"
    },
    "_25c9_cdbf3f": {
      "fontCharacter": "\\25c9",
      "fontColor": "#cdbf3f"
    },
    "_25c9_c48e6e": {
      "fontCharacter": "\\25c9",
      "fontColor": "#c48e6e"
    },
    "_25c9_4f85aa": {
      "fontCharacter": "\\25c9",
      "fontColor": "#4f85aa"
    },
    "_25c9_00a5cd": {
      "fontCharacter": "\\25c9",
      "fontColor": "#00a5cd"
    },
    "_25c9_ad701f": {
      "fontCharacter": "\\25c9",
      "fontColor": "#ad701f"
    },
    "_25c9_bb3545": {
      "fontCharacter": "\\25c9",
      "fontColor": "#bb3545"
    },
    "_25c9_4f5f9f": {
      "fontCharacter": "\\25c9",
      "fontColor": "#4f5f9f"
    },
    "_25c9_358035": {
      "fontCharacter": "\\25c9",
      "fontColor": "#358035"
    },
    "_25c9_c55570": {
      "fontCharacter": "\\25c9",
      "fontColor": "#c55570"
    },
    "_25c9_5f5f5f": {
      "fontCharacter": "\\25c9",
      "fontColor": "#5f5f5f"
    },
    "_25c9_e5553a": {
      "fontCharacter": "\\25c9",
      "fontColor": "#e5553a"
    },
    "_25c9_9475d5": {
      "fontCharacter": "\\25c9",
      "fontColor": "#9475d5"
    },
    "_25c9_b8b840": {
      "fontCharacter": "\\25c9",
      "fontColor": "#b8b840"
    },
    "_25c9_b83540": {
      "fontCharacter": "\\25c9",
      "fontColor": "#b83540"
    },
    "_25c9_955a30": {
      "fontCharacter": "\\25c9",
      "fontColor": "#955a30"
    },
    "_25c9_5f3f8f": {
      "fontCharacter": "\\25c9",
      "fontColor": "#5f3f8f"
    },
    "_25c9_ad4f7d": {
      "fontCharacter": "\\25c9",
      "fontColor": "#ad4f7d"
    },
    "_25c9_cd5935": {
      "fontCharacter": "\\25c9",
      "fontColor": "#cd5935"
    },
    "_25c9_4f85ad": {
      "fontCharacter": "\\25c9",
      "fontColor": "#4f85ad"
    },
    "_25c9_bd7f20": {
      "fontCharacter": "\\25c9",
      "fontColor": "#bd7f20"
    },
    "_25c9_6dbd5d": {
      "fontCharacter": "\\25c9",
      "fontColor": "#6dbd5d"
    },
    "_25c9_varaccent": {
      "fontCharacter": "\\25c9",
      "fontColor": "var(--accent)"
    },
    "_25ce_varaccent": {
      "fontCharacter": "\\25ce",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25ef_varfg2",
  "folder": "_25c9_varaccent",
  "folderExpanded": "_25ce_varaccent",
  "fileExtensions": {
    "ts": "_25c9_5a9ac2",
    "tsx": "_25c9_5a9ac2",
    "js": "_25c9_cdbf3f",
    "jsx": "_25c9_cdbf3f",
    "rs": "_25c9_c48e6e",
    "py": "_25c9_4f85aa",
    "go": "_25c9_00a5cd",
    "java": "_25c9_ad701f",
    "rb": "_25c9_bb3545",
    "php": "_25c9_4f5f9f",
    "cs": "_25c9_358035",
    "cpp": "_25c9_c55570",
    "c": "_25c9_5f5f5f",
    "swift": "_25c9_e5553a",
    "kt": "_25c9_9475d5",
    "json": "_25c9_b8b840",
    "yml": "_25c9_b83540",
    "toml": "_25c9_955a30",
    "css": "_25c9_5f3f8f",
    "scss": "_25c9_ad4f7d",
    "html": "_25c9_cd5935",
    "md": "_25c9_4f85ad",
    "sql": "_25c9_bd7f20",
    "sh": "_25c9_6dbd5d"
  },
  "fileNames": {
    "package.json": "_25c9_b8b840",
    "tsconfig.json": "_25c9_b8b840",
    "zephyr-extension.json": "_25c9_b8b840",
    "Dockerfile": "_25c9_6dbd5d",
    "docker-compose.yml": "_25c9_b83540",
    "Makefile": "_25c9_6dbd5d",
    ".gitignore": "_25c9_6dbd5d",
    "Cargo.toml": "_25c9_955a30",
    "README.md": "_25c9_4f85ad",
    "LICENSE": "_25c9_4f85ad"
  },
  "folderNames": {
    "src": "_25c9_varaccent",
    "node_modules": "_25c9_varaccent",
    "dist": "_25c9_varaccent",
    "build": "_25c9_varaccent",
    "test": "_25c9_varaccent",
    "tests": "_25c9_varaccent",
    "docs": "_25c9_varaccent",
    "assets": "_25c9_varaccent",
    "components": "_25c9_varaccent",
    "lib": "_25c9_varaccent",
    "public": "_25c9_varaccent",
    "scripts": "_25c9_varaccent",
    ".git": "_25c9_varaccent",
    ".github": "_25c9_varaccent",
    "target": "_25c9_varaccent",
    "vendor": "_25c9_varaccent"
  }
}"##;

pub(super) const IKON_BLOK: &str = r##"{
  "id": "zephyr.ikon-blok",
  "name": "Ikon Blok",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Blocky marks, maximum weight",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Blok", "path": "./icons/blok.json" }]
  }
}"##;

pub(super) const IKON_BLOK_JSON: &str = r##"{
  "iconDefinitions": {
    "_2588_varfg2": {
      "fontCharacter": "\\2588",
      "fontColor": "var(--fg2)"
    },
    "_2589_3178c6": {
      "fontCharacter": "\\2589",
      "fontColor": "#3178c6"
    },
    "_2589_519aba": {
      "fontCharacter": "\\2589",
      "fontColor": "#519aba"
    },
    "_2589_f1e05a": {
      "fontCharacter": "\\2589",
      "fontColor": "#f1e05a"
    },
    "_2589_61dafb": {
      "fontCharacter": "\\2589",
      "fontColor": "#61dafb"
    },
    "_2589_dea584": {
      "fontCharacter": "\\2589",
      "fontColor": "#dea584"
    },
    "_2589_3572a5": {
      "fontCharacter": "\\2589",
      "fontColor": "#3572a5"
    },
    "_2589_00add8": {
      "fontCharacter": "\\2589",
      "fontColor": "#00add8"
    },
    "_2589_b07219": {
      "fontCharacter": "\\2589",
      "fontColor": "#b07219"
    },
    "_2589_cc342d": {
      "fontCharacter": "\\2589",
      "fontColor": "#cc342d"
    },
    "_2589_4f5d95": {
      "fontCharacter": "\\2589",
      "fontColor": "#4f5d95"
    },
    "_2589_178600": {
      "fontCharacter": "\\2589",
      "fontColor": "#178600"
    },
    "_2589_f34b7d": {
      "fontCharacter": "\\2589",
      "fontColor": "#f34b7d"
    },
    "_2589_555555": {
      "fontCharacter": "\\2589",
      "fontColor": "#555555"
    },
    "_2589_f05138": {
      "fontCharacter": "\\2589",
      "fontColor": "#f05138"
    },
    "_2589_a97bff": {
      "fontCharacter": "\\2589",
      "fontColor": "#a97bff"
    },
    "_2589_cbcb41": {
      "fontCharacter": "\\2589",
      "fontColor": "#cbcb41"
    },
    "_2589_cb171e": {
      "fontCharacter": "\\2589",
      "fontColor": "#cb171e"
    },
    "_2589_9c4221": {
      "fontCharacter": "\\2589",
      "fontColor": "#9c4221"
    },
    "_2589_563d7c": {
      "fontCharacter": "\\2589",
      "fontColor": "#563d7c"
    },
    "_2589_c6538c": {
      "fontCharacter": "\\2589",
      "fontColor": "#c6538c"
    },
    "_2589_e34c26": {
      "fontCharacter": "\\2589",
      "fontColor": "#e34c26"
    },
    "_2589_e38c00": {
      "fontCharacter": "\\2589",
      "fontColor": "#e38c00"
    },
    "_2589_89e051": {
      "fontCharacter": "\\2589",
      "fontColor": "#89e051"
    },
    "_2589_varaccent": {
      "fontCharacter": "\\2589",
      "fontColor": "var(--accent)"
    },
    "_258a_varaccent": {
      "fontCharacter": "\\258a",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2588_varfg2",
  "folder": "_2589_varaccent",
  "folderExpanded": "_258a_varaccent",
  "fileExtensions": {
    "ts": "_2589_3178c6",
    "tsx": "_2589_519aba",
    "js": "_2589_f1e05a",
    "jsx": "_2589_61dafb",
    "rs": "_2589_dea584",
    "py": "_2589_3572a5",
    "go": "_2589_00add8",
    "java": "_2589_b07219",
    "rb": "_2589_cc342d",
    "php": "_2589_4f5d95",
    "cs": "_2589_178600",
    "cpp": "_2589_f34b7d",
    "c": "_2589_555555",
    "swift": "_2589_f05138",
    "kt": "_2589_a97bff",
    "json": "_2589_cbcb41",
    "yml": "_2589_cb171e",
    "toml": "_2589_9c4221",
    "css": "_2589_563d7c",
    "scss": "_2589_c6538c",
    "html": "_2589_e34c26",
    "md": "_2589_519aba",
    "sql": "_2589_e38c00",
    "sh": "_2589_89e051"
  },
  "fileNames": {
    "package.json": "_2589_cbcb41",
    "tsconfig.json": "_2589_cbcb41",
    "zephyr-extension.json": "_2589_cbcb41",
    "Dockerfile": "_2589_89e051",
    "docker-compose.yml": "_2589_cb171e",
    "Makefile": "_2589_89e051",
    ".gitignore": "_2589_89e051",
    "Cargo.toml": "_2589_9c4221",
    "README.md": "_2589_519aba",
    "LICENSE": "_2589_519aba"
  },
  "folderNames": {
    "src": "_2589_varaccent",
    "node_modules": "_2589_varaccent",
    "dist": "_2589_varaccent",
    "build": "_2589_varaccent",
    "test": "_2589_varaccent",
    "tests": "_2589_varaccent",
    "docs": "_2589_varaccent",
    "assets": "_2589_varaccent",
    "components": "_2589_varaccent",
    "lib": "_2589_varaccent",
    "public": "_2589_varaccent",
    "scripts": "_2589_varaccent",
    ".git": "_2589_varaccent",
    ".github": "_2589_varaccent",
    "target": "_2589_varaccent",
    "vendor": "_2589_varaccent"
  }
}"##;

pub(super) const IKON_GARIS_GARIS: &str = r##"{
  "id": "zephyr.ikon-garis-garis",
  "name": "Ikon Garis-garis",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Line marks, minimal and fast to scan",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Garis-garis", "path": "./icons/garis-garis.json" }]
  }
}"##;

pub(super) const IKON_GARIS_GARIS_JSON: &str = r##"{
  "iconDefinitions": {
    "_2261_varfg2": {
      "fontCharacter": "\\2261",
      "fontColor": "var(--fg2)"
    },
    "_2630_4f95c8": {
      "fontCharacter": "\\2630",
      "fontColor": "#4f95c8"
    },
    "_2630_c8ba3a": {
      "fontCharacter": "\\2630",
      "fontColor": "#c8ba3a"
    },
    "_2630_c38a68": {
      "fontCharacter": "\\2630",
      "fontColor": "#c38a68"
    },
    "_2630_4f83a8": {
      "fontCharacter": "\\2630",
      "fontColor": "#4f83a8"
    },
    "_2630_00a2ca": {
      "fontCharacter": "\\2630",
      "fontColor": "#00a2ca"
    },
    "_2630_aa6d1c": {
      "fontCharacter": "\\2630",
      "fontColor": "#aa6d1c"
    },
    "_2630_b83242": {
      "fontCharacter": "\\2630",
      "fontColor": "#b83242"
    },
    "_2630_4c5c9c": {
      "fontCharacter": "\\2630",
      "fontColor": "#4c5c9c"
    },
    "_2630_327d32": {
      "fontCharacter": "\\2630",
      "fontColor": "#327d32"
    },
    "_2630_c3506c": {
      "fontCharacter": "\\2630",
      "fontColor": "#c3506c"
    },
    "_2630_5c5c5c": {
      "fontCharacter": "\\2630",
      "fontColor": "#5c5c5c"
    },
    "_2630_e25038": {
      "fontCharacter": "\\2630",
      "fontColor": "#e25038"
    },
    "_2630_9170d2": {
      "fontCharacter": "\\2630",
      "fontColor": "#9170d2"
    },
    "_2630_b3b33c": {
      "fontCharacter": "\\2630",
      "fontColor": "#b3b33c"
    },
    "_2630_b3323c": {
      "fontCharacter": "\\2630",
      "fontColor": "#b3323c"
    },
    "_2630_92552c": {
      "fontCharacter": "\\2630",
      "fontColor": "#92552c"
    },
    "_2630_5c3c8c": {
      "fontCharacter": "\\2630",
      "fontColor": "#5c3c8c"
    },
    "_2630_aa4c7a": {
      "fontCharacter": "\\2630",
      "fontColor": "#aa4c7a"
    },
    "_2630_ca5632": {
      "fontCharacter": "\\2630",
      "fontColor": "#ca5632"
    },
    "_2630_4f83aa": {
      "fontCharacter": "\\2630",
      "fontColor": "#4f83aa"
    },
    "_2630_ba7c1c": {
      "fontCharacter": "\\2630",
      "fontColor": "#ba7c1c"
    },
    "_2630_6aba5a": {
      "fontCharacter": "\\2630",
      "fontColor": "#6aba5a"
    },
    "_2630_varaccent": {
      "fontCharacter": "\\2630",
      "fontColor": "var(--accent)"
    },
    "_2261_varaccent": {
      "fontCharacter": "\\2261",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2261_varfg2",
  "folder": "_2630_varaccent",
  "folderExpanded": "_2261_varaccent",
  "fileExtensions": {
    "ts": "_2630_4f95c8",
    "tsx": "_2630_4f95c8",
    "js": "_2630_c8ba3a",
    "jsx": "_2630_c8ba3a",
    "rs": "_2630_c38a68",
    "py": "_2630_4f83a8",
    "go": "_2630_00a2ca",
    "java": "_2630_aa6d1c",
    "rb": "_2630_b83242",
    "php": "_2630_4c5c9c",
    "cs": "_2630_327d32",
    "cpp": "_2630_c3506c",
    "c": "_2630_5c5c5c",
    "swift": "_2630_e25038",
    "kt": "_2630_9170d2",
    "json": "_2630_b3b33c",
    "yml": "_2630_b3323c",
    "toml": "_2630_92552c",
    "css": "_2630_5c3c8c",
    "scss": "_2630_aa4c7a",
    "html": "_2630_ca5632",
    "md": "_2630_4f83aa",
    "sql": "_2630_ba7c1c",
    "sh": "_2630_6aba5a"
  },
  "fileNames": {
    "package.json": "_2630_b3b33c",
    "tsconfig.json": "_2630_b3b33c",
    "zephyr-extension.json": "_2630_b3b33c",
    "Dockerfile": "_2630_6aba5a",
    "docker-compose.yml": "_2630_b3323c",
    "Makefile": "_2630_6aba5a",
    ".gitignore": "_2630_6aba5a",
    "Cargo.toml": "_2630_92552c",
    "README.md": "_2630_4f83aa",
    "LICENSE": "_2630_4f83aa"
  },
  "folderNames": {
    "src": "_2630_varaccent",
    "node_modules": "_2630_varaccent",
    "dist": "_2630_varaccent",
    "build": "_2630_varaccent",
    "test": "_2630_varaccent",
    "tests": "_2630_varaccent",
    "docs": "_2630_varaccent",
    "assets": "_2630_varaccent",
    "components": "_2630_varaccent",
    "lib": "_2630_varaccent",
    "public": "_2630_varaccent",
    "scripts": "_2630_varaccent",
    ".git": "_2630_varaccent",
    ".github": "_2630_varaccent",
    "target": "_2630_varaccent",
    "vendor": "_2630_varaccent"
  }
}"##;

pub(super) const IKON_PETIR: &str = r##"{
  "id": "zephyr.ikon-petir",
  "name": "Ikon Petir",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Bolt marks, energetic",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Petir", "path": "./icons/petir.json" }]
  }
}"##;

pub(super) const IKON_PETIR_JSON: &str = r##"{
  "iconDefinitions": {
    "_26a1_varfg2": {
      "fontCharacter": "\\26a1",
      "fontColor": "var(--fg2)"
    },
    "_26a1_3178c6": {
      "fontCharacter": "\\26a1",
      "fontColor": "#3178c6"
    },
    "_26a1_519aba": {
      "fontCharacter": "\\26a1",
      "fontColor": "#519aba"
    },
    "_26a1_f1e05a": {
      "fontCharacter": "\\26a1",
      "fontColor": "#f1e05a"
    },
    "_26a1_61dafb": {
      "fontCharacter": "\\26a1",
      "fontColor": "#61dafb"
    },
    "_26a1_dea584": {
      "fontCharacter": "\\26a1",
      "fontColor": "#dea584"
    },
    "_26a1_3572a5": {
      "fontCharacter": "\\26a1",
      "fontColor": "#3572a5"
    },
    "_26a1_00add8": {
      "fontCharacter": "\\26a1",
      "fontColor": "#00add8"
    },
    "_26a1_b07219": {
      "fontCharacter": "\\26a1",
      "fontColor": "#b07219"
    },
    "_26a1_cc342d": {
      "fontCharacter": "\\26a1",
      "fontColor": "#cc342d"
    },
    "_26a1_4f5d95": {
      "fontCharacter": "\\26a1",
      "fontColor": "#4f5d95"
    },
    "_26a1_178600": {
      "fontCharacter": "\\26a1",
      "fontColor": "#178600"
    },
    "_26a1_f34b7d": {
      "fontCharacter": "\\26a1",
      "fontColor": "#f34b7d"
    },
    "_26a1_555555": {
      "fontCharacter": "\\26a1",
      "fontColor": "#555555"
    },
    "_26a1_f05138": {
      "fontCharacter": "\\26a1",
      "fontColor": "#f05138"
    },
    "_26a1_a97bff": {
      "fontCharacter": "\\26a1",
      "fontColor": "#a97bff"
    },
    "_26a1_cbcb41": {
      "fontCharacter": "\\26a1",
      "fontColor": "#cbcb41"
    },
    "_26a1_cb171e": {
      "fontCharacter": "\\26a1",
      "fontColor": "#cb171e"
    },
    "_26a1_9c4221": {
      "fontCharacter": "\\26a1",
      "fontColor": "#9c4221"
    },
    "_26a1_563d7c": {
      "fontCharacter": "\\26a1",
      "fontColor": "#563d7c"
    },
    "_26a1_c6538c": {
      "fontCharacter": "\\26a1",
      "fontColor": "#c6538c"
    },
    "_26a1_e34c26": {
      "fontCharacter": "\\26a1",
      "fontColor": "#e34c26"
    },
    "_26a1_e38c00": {
      "fontCharacter": "\\26a1",
      "fontColor": "#e38c00"
    },
    "_26a1_89e051": {
      "fontCharacter": "\\26a1",
      "fontColor": "#89e051"
    },
    "_26a1_varaccent": {
      "fontCharacter": "\\26a1",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_26a1_varfg2",
  "folder": "_26a1_varaccent",
  "folderExpanded": "_26a1_varaccent",
  "fileExtensions": {
    "ts": "_26a1_3178c6",
    "tsx": "_26a1_519aba",
    "js": "_26a1_f1e05a",
    "jsx": "_26a1_61dafb",
    "rs": "_26a1_dea584",
    "py": "_26a1_3572a5",
    "go": "_26a1_00add8",
    "java": "_26a1_b07219",
    "rb": "_26a1_cc342d",
    "php": "_26a1_4f5d95",
    "cs": "_26a1_178600",
    "cpp": "_26a1_f34b7d",
    "c": "_26a1_555555",
    "swift": "_26a1_f05138",
    "kt": "_26a1_a97bff",
    "json": "_26a1_cbcb41",
    "yml": "_26a1_cb171e",
    "toml": "_26a1_9c4221",
    "css": "_26a1_563d7c",
    "scss": "_26a1_c6538c",
    "html": "_26a1_e34c26",
    "md": "_26a1_519aba",
    "sql": "_26a1_e38c00",
    "sh": "_26a1_89e051"
  },
  "fileNames": {
    "package.json": "_26a1_cbcb41",
    "tsconfig.json": "_26a1_cbcb41",
    "zephyr-extension.json": "_26a1_cbcb41",
    "Dockerfile": "_26a1_89e051",
    "docker-compose.yml": "_26a1_cb171e",
    "Makefile": "_26a1_89e051",
    ".gitignore": "_26a1_89e051",
    "Cargo.toml": "_26a1_9c4221",
    "README.md": "_26a1_519aba",
    "LICENSE": "_26a1_519aba"
  },
  "folderNames": {
    "src": "_26a1_varaccent",
    "node_modules": "_26a1_varaccent",
    "dist": "_26a1_varaccent",
    "build": "_26a1_varaccent",
    "test": "_26a1_varaccent",
    "tests": "_26a1_varaccent",
    "docs": "_26a1_varaccent",
    "assets": "_26a1_varaccent",
    "components": "_26a1_varaccent",
    "lib": "_26a1_varaccent",
    "public": "_26a1_varaccent",
    "scripts": "_26a1_varaccent",
    ".git": "_26a1_varaccent",
    ".github": "_26a1_varaccent",
    "target": "_26a1_varaccent",
    "vendor": "_26a1_varaccent"
  }
}"##;

pub(super) const IKON_PERMATA: &str = r##"{
  "id": "zephyr.ikon-permata",
  "name": "Ikon Permata",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Gem marks, faceted look",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Permata", "path": "./icons/permata.json" }]
  }
}"##;

pub(super) const IKON_PERMATA_JSON: &str = r##"{
  "iconDefinitions": {
    "_2756_varfg2": {
      "fontCharacter": "\\2756",
      "fontColor": "var(--fg2)"
    },
    "_2756_5f9ec5": {
      "fontCharacter": "\\2756",
      "fontColor": "#5f9ec5"
    },
    "_2756_cfc040": {
      "fontCharacter": "\\2756",
      "fontColor": "#cfc040"
    },
    "_2756_c68f70": {
      "fontCharacter": "\\2756",
      "fontColor": "#c68f70"
    },
    "_2756_5488aa": {
      "fontCharacter": "\\2756",
      "fontColor": "#5488aa"
    },
    "_2756_00a8cf": {
      "fontCharacter": "\\2756",
      "fontColor": "#00a8cf"
    },
    "_2756_b07520": {
      "fontCharacter": "\\2756",
      "fontColor": "#b07520"
    },
    "_2756_c03a48": {
      "fontCharacter": "\\2756",
      "fontColor": "#c03a48"
    },
    "_2756_5464a4": {
      "fontCharacter": "\\2756",
      "fontColor": "#5464a4"
    },
    "_2756_3a833a": {
      "fontCharacter": "\\2756",
      "fontColor": "#3a833a"
    },
    "_2756_c85873": {
      "fontCharacter": "\\2756",
      "fontColor": "#c85873"
    },
    "_2756_606060": {
      "fontCharacter": "\\2756",
      "fontColor": "#606060"
    },
    "_2756_e85840": {
      "fontCharacter": "\\2756",
      "fontColor": "#e85840"
    },
    "_2756_9878d8": {
      "fontCharacter": "\\2756",
      "fontColor": "#9878d8"
    },
    "_2756_bbbb42": {
      "fontCharacter": "\\2756",
      "fontColor": "#bbbb42"
    },
    "_2756_bb3a42": {
      "fontCharacter": "\\2756",
      "fontColor": "#bb3a42"
    },
    "_2756_9a5c32": {
      "fontCharacter": "\\2756",
      "fontColor": "#9a5c32"
    },
    "_2756_604090": {
      "fontCharacter": "\\2756",
      "fontColor": "#604090"
    },
    "_2756_b05280": {
      "fontCharacter": "\\2756",
      "fontColor": "#b05280"
    },
    "_2756_d05c38": {
      "fontCharacter": "\\2756",
      "fontColor": "#d05c38"
    },
    "_2756_5488b0": {
      "fontCharacter": "\\2756",
      "fontColor": "#5488b0"
    },
    "_2756_c08222": {
      "fontCharacter": "\\2756",
      "fontColor": "#c08222"
    },
    "_2756_72c062": {
      "fontCharacter": "\\2756",
      "fontColor": "#72c062"
    },
    "_2756_varaccent": {
      "fontCharacter": "\\2756",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2756_varfg2",
  "folder": "_2756_varaccent",
  "folderExpanded": "_2756_varaccent",
  "fileExtensions": {
    "ts": "_2756_5f9ec5",
    "tsx": "_2756_5f9ec5",
    "js": "_2756_cfc040",
    "jsx": "_2756_cfc040",
    "rs": "_2756_c68f70",
    "py": "_2756_5488aa",
    "go": "_2756_00a8cf",
    "java": "_2756_b07520",
    "rb": "_2756_c03a48",
    "php": "_2756_5464a4",
    "cs": "_2756_3a833a",
    "cpp": "_2756_c85873",
    "c": "_2756_606060",
    "swift": "_2756_e85840",
    "kt": "_2756_9878d8",
    "json": "_2756_bbbb42",
    "yml": "_2756_bb3a42",
    "toml": "_2756_9a5c32",
    "css": "_2756_604090",
    "scss": "_2756_b05280",
    "html": "_2756_d05c38",
    "md": "_2756_5488b0",
    "sql": "_2756_c08222",
    "sh": "_2756_72c062"
  },
  "fileNames": {
    "package.json": "_2756_bbbb42",
    "tsconfig.json": "_2756_bbbb42",
    "zephyr-extension.json": "_2756_bbbb42",
    "Dockerfile": "_2756_72c062",
    "docker-compose.yml": "_2756_bb3a42",
    "Makefile": "_2756_72c062",
    ".gitignore": "_2756_72c062",
    "Cargo.toml": "_2756_9a5c32",
    "README.md": "_2756_5488b0",
    "LICENSE": "_2756_5488b0"
  },
  "folderNames": {
    "src": "_2756_varaccent",
    "node_modules": "_2756_varaccent",
    "dist": "_2756_varaccent",
    "build": "_2756_varaccent",
    "test": "_2756_varaccent",
    "tests": "_2756_varaccent",
    "docs": "_2756_varaccent",
    "assets": "_2756_varaccent",
    "components": "_2756_varaccent",
    "lib": "_2756_varaccent",
    "public": "_2756_varaccent",
    "scripts": "_2756_varaccent",
    ".git": "_2756_varaccent",
    ".github": "_2756_varaccent",
    "target": "_2756_varaccent",
    "vendor": "_2756_varaccent"
  }
}"##;

pub(super) const IKON_HEKSAGON: &str = r##"{
  "id": "zephyr.ikon-heksagon",
  "name": "Ikon Heksagon",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Hexagon marks, honeycomb feel",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Heksagon", "path": "./icons/heksagon.json" }]
  }
}"##;

pub(super) const IKON_HEKSAGON_JSON: &str = r##"{
  "iconDefinitions": {
    "_2b22_varfg2": {
      "fontCharacter": "\\2b22",
      "fontColor": "var(--fg2)"
    },
    "_2b23_3178c6": {
      "fontCharacter": "\\2b23",
      "fontColor": "#3178c6"
    },
    "_2b23_519aba": {
      "fontCharacter": "\\2b23",
      "fontColor": "#519aba"
    },
    "_2b23_f1e05a": {
      "fontCharacter": "\\2b23",
      "fontColor": "#f1e05a"
    },
    "_2b23_61dafb": {
      "fontCharacter": "\\2b23",
      "fontColor": "#61dafb"
    },
    "_2b23_dea584": {
      "fontCharacter": "\\2b23",
      "fontColor": "#dea584"
    },
    "_2b23_3572a5": {
      "fontCharacter": "\\2b23",
      "fontColor": "#3572a5"
    },
    "_2b23_00add8": {
      "fontCharacter": "\\2b23",
      "fontColor": "#00add8"
    },
    "_2b23_b07219": {
      "fontCharacter": "\\2b23",
      "fontColor": "#b07219"
    },
    "_2b23_cc342d": {
      "fontCharacter": "\\2b23",
      "fontColor": "#cc342d"
    },
    "_2b23_4f5d95": {
      "fontCharacter": "\\2b23",
      "fontColor": "#4f5d95"
    },
    "_2b23_178600": {
      "fontCharacter": "\\2b23",
      "fontColor": "#178600"
    },
    "_2b23_f34b7d": {
      "fontCharacter": "\\2b23",
      "fontColor": "#f34b7d"
    },
    "_2b23_555555": {
      "fontCharacter": "\\2b23",
      "fontColor": "#555555"
    },
    "_2b23_f05138": {
      "fontCharacter": "\\2b23",
      "fontColor": "#f05138"
    },
    "_2b23_a97bff": {
      "fontCharacter": "\\2b23",
      "fontColor": "#a97bff"
    },
    "_2b23_cbcb41": {
      "fontCharacter": "\\2b23",
      "fontColor": "#cbcb41"
    },
    "_2b23_cb171e": {
      "fontCharacter": "\\2b23",
      "fontColor": "#cb171e"
    },
    "_2b23_9c4221": {
      "fontCharacter": "\\2b23",
      "fontColor": "#9c4221"
    },
    "_2b23_563d7c": {
      "fontCharacter": "\\2b23",
      "fontColor": "#563d7c"
    },
    "_2b23_c6538c": {
      "fontCharacter": "\\2b23",
      "fontColor": "#c6538c"
    },
    "_2b23_e34c26": {
      "fontCharacter": "\\2b23",
      "fontColor": "#e34c26"
    },
    "_2b23_e38c00": {
      "fontCharacter": "\\2b23",
      "fontColor": "#e38c00"
    },
    "_2b23_89e051": {
      "fontCharacter": "\\2b23",
      "fontColor": "#89e051"
    },
    "_2b23_varaccent": {
      "fontCharacter": "\\2b23",
      "fontColor": "var(--accent)"
    },
    "_2b21_varaccent": {
      "fontCharacter": "\\2b21",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2b22_varfg2",
  "folder": "_2b23_varaccent",
  "folderExpanded": "_2b21_varaccent",
  "fileExtensions": {
    "ts": "_2b23_3178c6",
    "tsx": "_2b23_519aba",
    "js": "_2b23_f1e05a",
    "jsx": "_2b23_61dafb",
    "rs": "_2b23_dea584",
    "py": "_2b23_3572a5",
    "go": "_2b23_00add8",
    "java": "_2b23_b07219",
    "rb": "_2b23_cc342d",
    "php": "_2b23_4f5d95",
    "cs": "_2b23_178600",
    "cpp": "_2b23_f34b7d",
    "c": "_2b23_555555",
    "swift": "_2b23_f05138",
    "kt": "_2b23_a97bff",
    "json": "_2b23_cbcb41",
    "yml": "_2b23_cb171e",
    "toml": "_2b23_9c4221",
    "css": "_2b23_563d7c",
    "scss": "_2b23_c6538c",
    "html": "_2b23_e34c26",
    "md": "_2b23_519aba",
    "sql": "_2b23_e38c00",
    "sh": "_2b23_89e051"
  },
  "fileNames": {
    "package.json": "_2b23_cbcb41",
    "tsconfig.json": "_2b23_cbcb41",
    "zephyr-extension.json": "_2b23_cbcb41",
    "Dockerfile": "_2b23_89e051",
    "docker-compose.yml": "_2b23_cb171e",
    "Makefile": "_2b23_89e051",
    ".gitignore": "_2b23_89e051",
    "Cargo.toml": "_2b23_9c4221",
    "README.md": "_2b23_519aba",
    "LICENSE": "_2b23_519aba"
  },
  "folderNames": {
    "src": "_2b23_varaccent",
    "node_modules": "_2b23_varaccent",
    "dist": "_2b23_varaccent",
    "build": "_2b23_varaccent",
    "test": "_2b23_varaccent",
    "tests": "_2b23_varaccent",
    "docs": "_2b23_varaccent",
    "assets": "_2b23_varaccent",
    "components": "_2b23_varaccent",
    "lib": "_2b23_varaccent",
    "public": "_2b23_varaccent",
    "scripts": "_2b23_varaccent",
    ".git": "_2b23_varaccent",
    ".github": "_2b23_varaccent",
    "target": "_2b23_varaccent",
    "vendor": "_2b23_varaccent"
  }
}"##;

pub(super) const IKON_BERLIAN_GARIS: &str = r##"{
  "id": "zephyr.ikon-berlian-garis",
  "name": "Ikon Berlian Garis",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Outlined diamonds, precise",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Berlian Garis", "path": "./icons/berlian-garis.json" }]
  }
}"##;

pub(super) const IKON_BERLIAN_GARIS_JSON: &str = r##"{
  "iconDefinitions": {
    "_25c8_varfg2": {
      "fontCharacter": "\\25c8",
      "fontColor": "var(--fg2)"
    },
    "_25c8_5a9ac8": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5a9ac8"
    },
    "_25c8_cabd3a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#cabd3a"
    },
    "_25c8_c48b68": {
      "fontCharacter": "\\25c8",
      "fontColor": "#c48b68"
    },
    "_25c8_5085a8": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5085a8"
    },
    "_25c8_00a3cb": {
      "fontCharacter": "\\25c8",
      "fontColor": "#00a3cb"
    },
    "_25c8_ab6e1d": {
      "fontCharacter": "\\25c8",
      "fontColor": "#ab6e1d"
    },
    "_25c8_ba3343": {
      "fontCharacter": "\\25c8",
      "fontColor": "#ba3343"
    },
    "_25c8_4e5e9e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#4e5e9e"
    },
    "_25c8_337e33": {
      "fontCharacter": "\\25c8",
      "fontColor": "#337e33"
    },
    "_25c8_c4526e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#c4526e"
    },
    "_25c8_5e5e5e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5e5e5e"
    },
    "_25c8_e3523a": {
      "fontCharacter": "\\25c8",
      "fontColor": "#e3523a"
    },
    "_25c8_9373d4": {
      "fontCharacter": "\\25c8",
      "fontColor": "#9373d4"
    },
    "_25c8_b6b63e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b6b63e"
    },
    "_25c8_b6343e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#b6343e"
    },
    "_25c8_94572e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#94572e"
    },
    "_25c8_5e3e8e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5e3e8e"
    },
    "_25c8_ac4e7c": {
      "fontCharacter": "\\25c8",
      "fontColor": "#ac4e7c"
    },
    "_25c8_cc5834": {
      "fontCharacter": "\\25c8",
      "fontColor": "#cc5834"
    },
    "_25c8_5085ac": {
      "fontCharacter": "\\25c8",
      "fontColor": "#5085ac"
    },
    "_25c8_bc7e1e": {
      "fontCharacter": "\\25c8",
      "fontColor": "#bc7e1e"
    },
    "_25c8_6cbc5c": {
      "fontCharacter": "\\25c8",
      "fontColor": "#6cbc5c"
    },
    "_25c8_varaccent": {
      "fontCharacter": "\\25c8",
      "fontColor": "var(--accent)"
    },
    "_25c7_varaccent": {
      "fontCharacter": "\\25c7",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25c8_varfg2",
  "folder": "_25c8_varaccent",
  "folderExpanded": "_25c7_varaccent",
  "fileExtensions": {
    "ts": "_25c8_5a9ac8",
    "tsx": "_25c8_5a9ac8",
    "js": "_25c8_cabd3a",
    "jsx": "_25c8_cabd3a",
    "rs": "_25c8_c48b68",
    "py": "_25c8_5085a8",
    "go": "_25c8_00a3cb",
    "java": "_25c8_ab6e1d",
    "rb": "_25c8_ba3343",
    "php": "_25c8_4e5e9e",
    "cs": "_25c8_337e33",
    "cpp": "_25c8_c4526e",
    "c": "_25c8_5e5e5e",
    "swift": "_25c8_e3523a",
    "kt": "_25c8_9373d4",
    "json": "_25c8_b6b63e",
    "yml": "_25c8_b6343e",
    "toml": "_25c8_94572e",
    "css": "_25c8_5e3e8e",
    "scss": "_25c8_ac4e7c",
    "html": "_25c8_cc5834",
    "md": "_25c8_5085ac",
    "sql": "_25c8_bc7e1e",
    "sh": "_25c8_6cbc5c"
  },
  "fileNames": {
    "package.json": "_25c8_b6b63e",
    "tsconfig.json": "_25c8_b6b63e",
    "zephyr-extension.json": "_25c8_b6b63e",
    "Dockerfile": "_25c8_6cbc5c",
    "docker-compose.yml": "_25c8_b6343e",
    "Makefile": "_25c8_6cbc5c",
    ".gitignore": "_25c8_6cbc5c",
    "Cargo.toml": "_25c8_94572e",
    "README.md": "_25c8_5085ac",
    "LICENSE": "_25c8_5085ac"
  },
  "folderNames": {
    "src": "_25c8_varaccent",
    "node_modules": "_25c8_varaccent",
    "dist": "_25c8_varaccent",
    "build": "_25c8_varaccent",
    "test": "_25c8_varaccent",
    "tests": "_25c8_varaccent",
    "docs": "_25c8_varaccent",
    "assets": "_25c8_varaccent",
    "components": "_25c8_varaccent",
    "lib": "_25c8_varaccent",
    "public": "_25c8_varaccent",
    "scripts": "_25c8_varaccent",
    ".git": "_25c8_varaccent",
    ".github": "_25c8_varaccent",
    "target": "_25c8_varaccent",
    "vendor": "_25c8_varaccent"
  }
}"##;

pub(super) const IKON_TANDA: &str = r##"{
  "id": "zephyr.ikon-tanda-tanya",
  "name": "Ikon Tanda",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Punctuation marks, typographic",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Tanda", "path": "./icons/tanda-tanya.json" }]
  }
}"##;

pub(super) const IKON_TANDA_JSON: &str = r##"{
  "iconDefinitions": {
    "_a7_varfg2": {
      "fontCharacter": "\\a7",
      "fontColor": "var(--fg2)"
    },
    "_b6_3178c6": {
      "fontCharacter": "\\b6",
      "fontColor": "#3178c6"
    },
    "_b6_519aba": {
      "fontCharacter": "\\b6",
      "fontColor": "#519aba"
    },
    "_b6_f1e05a": {
      "fontCharacter": "\\b6",
      "fontColor": "#f1e05a"
    },
    "_b6_61dafb": {
      "fontCharacter": "\\b6",
      "fontColor": "#61dafb"
    },
    "_b6_dea584": {
      "fontCharacter": "\\b6",
      "fontColor": "#dea584"
    },
    "_b6_3572a5": {
      "fontCharacter": "\\b6",
      "fontColor": "#3572a5"
    },
    "_b6_00add8": {
      "fontCharacter": "\\b6",
      "fontColor": "#00add8"
    },
    "_b6_b07219": {
      "fontCharacter": "\\b6",
      "fontColor": "#b07219"
    },
    "_b6_cc342d": {
      "fontCharacter": "\\b6",
      "fontColor": "#cc342d"
    },
    "_b6_4f5d95": {
      "fontCharacter": "\\b6",
      "fontColor": "#4f5d95"
    },
    "_b6_178600": {
      "fontCharacter": "\\b6",
      "fontColor": "#178600"
    },
    "_b6_f34b7d": {
      "fontCharacter": "\\b6",
      "fontColor": "#f34b7d"
    },
    "_b6_555555": {
      "fontCharacter": "\\b6",
      "fontColor": "#555555"
    },
    "_b6_f05138": {
      "fontCharacter": "\\b6",
      "fontColor": "#f05138"
    },
    "_b6_a97bff": {
      "fontCharacter": "\\b6",
      "fontColor": "#a97bff"
    },
    "_b6_cbcb41": {
      "fontCharacter": "\\b6",
      "fontColor": "#cbcb41"
    },
    "_b6_cb171e": {
      "fontCharacter": "\\b6",
      "fontColor": "#cb171e"
    },
    "_b6_9c4221": {
      "fontCharacter": "\\b6",
      "fontColor": "#9c4221"
    },
    "_b6_563d7c": {
      "fontCharacter": "\\b6",
      "fontColor": "#563d7c"
    },
    "_b6_c6538c": {
      "fontCharacter": "\\b6",
      "fontColor": "#c6538c"
    },
    "_b6_e34c26": {
      "fontCharacter": "\\b6",
      "fontColor": "#e34c26"
    },
    "_b6_e38c00": {
      "fontCharacter": "\\b6",
      "fontColor": "#e38c00"
    },
    "_b6_89e051": {
      "fontCharacter": "\\b6",
      "fontColor": "#89e051"
    },
    "_b6_varaccent": {
      "fontCharacter": "\\b6",
      "fontColor": "var(--accent)"
    },
    "_a7_varaccent": {
      "fontCharacter": "\\a7",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_a7_varfg2",
  "folder": "_b6_varaccent",
  "folderExpanded": "_a7_varaccent",
  "fileExtensions": {
    "ts": "_b6_3178c6",
    "tsx": "_b6_519aba",
    "js": "_b6_f1e05a",
    "jsx": "_b6_61dafb",
    "rs": "_b6_dea584",
    "py": "_b6_3572a5",
    "go": "_b6_00add8",
    "java": "_b6_b07219",
    "rb": "_b6_cc342d",
    "php": "_b6_4f5d95",
    "cs": "_b6_178600",
    "cpp": "_b6_f34b7d",
    "c": "_b6_555555",
    "swift": "_b6_f05138",
    "kt": "_b6_a97bff",
    "json": "_b6_cbcb41",
    "yml": "_b6_cb171e",
    "toml": "_b6_9c4221",
    "css": "_b6_563d7c",
    "scss": "_b6_c6538c",
    "html": "_b6_e34c26",
    "md": "_b6_519aba",
    "sql": "_b6_e38c00",
    "sh": "_b6_89e051"
  },
  "fileNames": {
    "package.json": "_b6_cbcb41",
    "tsconfig.json": "_b6_cbcb41",
    "zephyr-extension.json": "_b6_cbcb41",
    "Dockerfile": "_b6_89e051",
    "docker-compose.yml": "_b6_cb171e",
    "Makefile": "_b6_89e051",
    ".gitignore": "_b6_89e051",
    "Cargo.toml": "_b6_9c4221",
    "README.md": "_b6_519aba",
    "LICENSE": "_b6_519aba"
  },
  "folderNames": {
    "src": "_b6_varaccent",
    "node_modules": "_b6_varaccent",
    "dist": "_b6_varaccent",
    "build": "_b6_varaccent",
    "test": "_b6_varaccent",
    "tests": "_b6_varaccent",
    "docs": "_b6_varaccent",
    "assets": "_b6_varaccent",
    "components": "_b6_varaccent",
    "lib": "_b6_varaccent",
    "public": "_b6_varaccent",
    "scripts": "_b6_varaccent",
    ".git": "_b6_varaccent",
    ".github": "_b6_varaccent",
    "target": "_b6_varaccent",
    "vendor": "_b6_varaccent"
  }
}"##;

pub(super) const IKON_BELAH_KETUPAT: &str = r##"{
  "id": "zephyr.ikon-belah-ketupat",
  "name": "Ikon Belah Ketupat",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Lozenges, angled and clean",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Belah Ketupat", "path": "./icons/belah-ketupat.json" }]
  }
}"##;

pub(super) const IKON_BELAH_KETUPAT_JSON: &str = r##"{
  "iconDefinitions": {
    "_25ca_varfg2": {
      "fontCharacter": "\\25ca",
      "fontColor": "var(--fg2)"
    },
    "_25ca_4f95c8": {
      "fontCharacter": "\\25ca",
      "fontColor": "#4f95c8"
    },
    "_25ca_c8ba3a": {
      "fontCharacter": "\\25ca",
      "fontColor": "#c8ba3a"
    },
    "_25ca_c38a68": {
      "fontCharacter": "\\25ca",
      "fontColor": "#c38a68"
    },
    "_25ca_4f83a8": {
      "fontCharacter": "\\25ca",
      "fontColor": "#4f83a8"
    },
    "_25ca_00a2ca": {
      "fontCharacter": "\\25ca",
      "fontColor": "#00a2ca"
    },
    "_25ca_aa6d1c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#aa6d1c"
    },
    "_25ca_b83242": {
      "fontCharacter": "\\25ca",
      "fontColor": "#b83242"
    },
    "_25ca_4c5c9c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#4c5c9c"
    },
    "_25ca_327d32": {
      "fontCharacter": "\\25ca",
      "fontColor": "#327d32"
    },
    "_25ca_c3506c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#c3506c"
    },
    "_25ca_5c5c5c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#5c5c5c"
    },
    "_25ca_e25038": {
      "fontCharacter": "\\25ca",
      "fontColor": "#e25038"
    },
    "_25ca_9170d2": {
      "fontCharacter": "\\25ca",
      "fontColor": "#9170d2"
    },
    "_25ca_b3b33c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#b3b33c"
    },
    "_25ca_b3323c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#b3323c"
    },
    "_25ca_92552c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#92552c"
    },
    "_25ca_5c3c8c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#5c3c8c"
    },
    "_25ca_aa4c7a": {
      "fontCharacter": "\\25ca",
      "fontColor": "#aa4c7a"
    },
    "_25ca_ca5632": {
      "fontCharacter": "\\25ca",
      "fontColor": "#ca5632"
    },
    "_25ca_4f83aa": {
      "fontCharacter": "\\25ca",
      "fontColor": "#4f83aa"
    },
    "_25ca_ba7c1c": {
      "fontCharacter": "\\25ca",
      "fontColor": "#ba7c1c"
    },
    "_25ca_6aba5a": {
      "fontCharacter": "\\25ca",
      "fontColor": "#6aba5a"
    },
    "_25ca_varaccent": {
      "fontCharacter": "\\25ca",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25ca_varfg2",
  "folder": "_25ca_varaccent",
  "folderExpanded": "_25ca_varaccent",
  "fileExtensions": {
    "ts": "_25ca_4f95c8",
    "tsx": "_25ca_4f95c8",
    "js": "_25ca_c8ba3a",
    "jsx": "_25ca_c8ba3a",
    "rs": "_25ca_c38a68",
    "py": "_25ca_4f83a8",
    "go": "_25ca_00a2ca",
    "java": "_25ca_aa6d1c",
    "rb": "_25ca_b83242",
    "php": "_25ca_4c5c9c",
    "cs": "_25ca_327d32",
    "cpp": "_25ca_c3506c",
    "c": "_25ca_5c5c5c",
    "swift": "_25ca_e25038",
    "kt": "_25ca_9170d2",
    "json": "_25ca_b3b33c",
    "yml": "_25ca_b3323c",
    "toml": "_25ca_92552c",
    "css": "_25ca_5c3c8c",
    "scss": "_25ca_aa4c7a",
    "html": "_25ca_ca5632",
    "md": "_25ca_4f83aa",
    "sql": "_25ca_ba7c1c",
    "sh": "_25ca_6aba5a"
  },
  "fileNames": {
    "package.json": "_25ca_b3b33c",
    "tsconfig.json": "_25ca_b3b33c",
    "zephyr-extension.json": "_25ca_b3b33c",
    "Dockerfile": "_25ca_6aba5a",
    "docker-compose.yml": "_25ca_b3323c",
    "Makefile": "_25ca_6aba5a",
    ".gitignore": "_25ca_6aba5a",
    "Cargo.toml": "_25ca_92552c",
    "README.md": "_25ca_4f83aa",
    "LICENSE": "_25ca_4f83aa"
  },
  "folderNames": {
    "src": "_25ca_varaccent",
    "node_modules": "_25ca_varaccent",
    "dist": "_25ca_varaccent",
    "build": "_25ca_varaccent",
    "test": "_25ca_varaccent",
    "tests": "_25ca_varaccent",
    "docs": "_25ca_varaccent",
    "assets": "_25ca_varaccent",
    "components": "_25ca_varaccent",
    "lib": "_25ca_varaccent",
    "public": "_25ca_varaccent",
    "scripts": "_25ca_varaccent",
    ".git": "_25ca_varaccent",
    ".github": "_25ca_varaccent",
    "target": "_25ca_varaccent",
    "vendor": "_25ca_varaccent"
  }
}"##;

pub(super) const IKON_KURUNG: &str = r##"{
  "id": "zephyr.ikon-kurung",
  "name": "Ikon Kurung",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Bracket marks, code-native",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kurung", "path": "./icons/kurung.json" }]
  }
}"##;

pub(super) const IKON_KURUNG_JSON: &str = r##"{
  "iconDefinitions": {
    "_7b_varfg2": {
      "fontCharacter": "\\7b",
      "fontColor": "var(--fg2)"
    },
    "_5b_3178c6": {
      "fontCharacter": "\\5b",
      "fontColor": "#3178c6"
    },
    "_5b_519aba": {
      "fontCharacter": "\\5b",
      "fontColor": "#519aba"
    },
    "_5b_f1e05a": {
      "fontCharacter": "\\5b",
      "fontColor": "#f1e05a"
    },
    "_5b_61dafb": {
      "fontCharacter": "\\5b",
      "fontColor": "#61dafb"
    },
    "_5b_dea584": {
      "fontCharacter": "\\5b",
      "fontColor": "#dea584"
    },
    "_5b_3572a5": {
      "fontCharacter": "\\5b",
      "fontColor": "#3572a5"
    },
    "_5b_00add8": {
      "fontCharacter": "\\5b",
      "fontColor": "#00add8"
    },
    "_5b_b07219": {
      "fontCharacter": "\\5b",
      "fontColor": "#b07219"
    },
    "_5b_cc342d": {
      "fontCharacter": "\\5b",
      "fontColor": "#cc342d"
    },
    "_5b_4f5d95": {
      "fontCharacter": "\\5b",
      "fontColor": "#4f5d95"
    },
    "_5b_178600": {
      "fontCharacter": "\\5b",
      "fontColor": "#178600"
    },
    "_5b_f34b7d": {
      "fontCharacter": "\\5b",
      "fontColor": "#f34b7d"
    },
    "_5b_555555": {
      "fontCharacter": "\\5b",
      "fontColor": "#555555"
    },
    "_5b_f05138": {
      "fontCharacter": "\\5b",
      "fontColor": "#f05138"
    },
    "_5b_a97bff": {
      "fontCharacter": "\\5b",
      "fontColor": "#a97bff"
    },
    "_5b_cbcb41": {
      "fontCharacter": "\\5b",
      "fontColor": "#cbcb41"
    },
    "_5b_cb171e": {
      "fontCharacter": "\\5b",
      "fontColor": "#cb171e"
    },
    "_5b_9c4221": {
      "fontCharacter": "\\5b",
      "fontColor": "#9c4221"
    },
    "_5b_563d7c": {
      "fontCharacter": "\\5b",
      "fontColor": "#563d7c"
    },
    "_5b_c6538c": {
      "fontCharacter": "\\5b",
      "fontColor": "#c6538c"
    },
    "_5b_e34c26": {
      "fontCharacter": "\\5b",
      "fontColor": "#e34c26"
    },
    "_5b_e38c00": {
      "fontCharacter": "\\5b",
      "fontColor": "#e38c00"
    },
    "_5b_89e051": {
      "fontCharacter": "\\5b",
      "fontColor": "#89e051"
    },
    "_5b_varaccent": {
      "fontCharacter": "\\5b",
      "fontColor": "var(--accent)"
    },
    "_28_varaccent": {
      "fontCharacter": "\\28",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_7b_varfg2",
  "folder": "_5b_varaccent",
  "folderExpanded": "_28_varaccent",
  "fileExtensions": {
    "ts": "_5b_3178c6",
    "tsx": "_5b_519aba",
    "js": "_5b_f1e05a",
    "jsx": "_5b_61dafb",
    "rs": "_5b_dea584",
    "py": "_5b_3572a5",
    "go": "_5b_00add8",
    "java": "_5b_b07219",
    "rb": "_5b_cc342d",
    "php": "_5b_4f5d95",
    "cs": "_5b_178600",
    "cpp": "_5b_f34b7d",
    "c": "_5b_555555",
    "swift": "_5b_f05138",
    "kt": "_5b_a97bff",
    "json": "_5b_cbcb41",
    "yml": "_5b_cb171e",
    "toml": "_5b_9c4221",
    "css": "_5b_563d7c",
    "scss": "_5b_c6538c",
    "html": "_5b_e34c26",
    "md": "_5b_519aba",
    "sql": "_5b_e38c00",
    "sh": "_5b_89e051"
  },
  "fileNames": {
    "package.json": "_5b_cbcb41",
    "tsconfig.json": "_5b_cbcb41",
    "zephyr-extension.json": "_5b_cbcb41",
    "Dockerfile": "_5b_89e051",
    "docker-compose.yml": "_5b_cb171e",
    "Makefile": "_5b_89e051",
    ".gitignore": "_5b_89e051",
    "Cargo.toml": "_5b_9c4221",
    "README.md": "_5b_519aba",
    "LICENSE": "_5b_519aba"
  },
  "folderNames": {
    "src": "_5b_varaccent",
    "node_modules": "_5b_varaccent",
    "dist": "_5b_varaccent",
    "build": "_5b_varaccent",
    "test": "_5b_varaccent",
    "tests": "_5b_varaccent",
    "docs": "_5b_varaccent",
    "assets": "_5b_varaccent",
    "components": "_5b_varaccent",
    "lib": "_5b_varaccent",
    "public": "_5b_varaccent",
    "scripts": "_5b_varaccent",
    ".git": "_5b_varaccent",
    ".github": "_5b_varaccent",
    "target": "_5b_varaccent",
    "vendor": "_5b_varaccent"
  }
}"##;

pub(super) const IKON_HURUF_TEBAL: &str = r##"{
  "id": "zephyr.ikon-huruf-tebal",
  "name": "Ikon Huruf Tebal",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Bold initials, maximum legibility",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Huruf Tebal", "path": "./icons/huruf-tebal.json" }]
  }
}"##;

pub(super) const IKON_HURUF_TEBAL_JSON: &str = r##"{
  "iconDefinitions": {
    "_46_varfg2": {
      "fontCharacter": "\\46",
      "fontColor": "var(--fg2)"
    },
    "_44_4a90c2": {
      "fontCharacter": "\\44",
      "fontColor": "#4a90c2"
    },
    "_44_c9b93a": {
      "fontCharacter": "\\44",
      "fontColor": "#c9b93a"
    },
    "_44_c08a6a": {
      "fontCharacter": "\\44",
      "fontColor": "#c08a6a"
    },
    "_44_4a80a5": {
      "fontCharacter": "\\44",
      "fontColor": "#4a80a5"
    },
    "_44_00a0c8": {
      "fontCharacter": "\\44",
      "fontColor": "#00a0c8"
    },
    "_44_a56818": {
      "fontCharacter": "\\44",
      "fontColor": "#a56818"
    },
    "_44_b82f40": {
      "fontCharacter": "\\44",
      "fontColor": "#b82f40"
    },
    "_44_4a5a9a": {
      "fontCharacter": "\\44",
      "fontColor": "#4a5a9a"
    },
    "_44_2f7a2f": {
      "fontCharacter": "\\44",
      "fontColor": "#2f7a2f"
    },
    "_44_c04a6a": {
      "fontCharacter": "\\44",
      "fontColor": "#c04a6a"
    },
    "_44_5a5a5a": {
      "fontCharacter": "\\44",
      "fontColor": "#5a5a5a"
    },
    "_44_e04a30": {
      "fontCharacter": "\\44",
      "fontColor": "#e04a30"
    },
    "_44_8f6fd0": {
      "fontCharacter": "\\44",
      "fontColor": "#8f6fd0"
    },
    "_44_b0b038": {
      "fontCharacter": "\\44",
      "fontColor": "#b0b038"
    },
    "_44_b03038": {
      "fontCharacter": "\\44",
      "fontColor": "#b03038"
    },
    "_44_905028": {
      "fontCharacter": "\\44",
      "fontColor": "#905028"
    },
    "_44_5a3a8a": {
      "fontCharacter": "\\44",
      "fontColor": "#5a3a8a"
    },
    "_44_a84a78": {
      "fontCharacter": "\\44",
      "fontColor": "#a84a78"
    },
    "_44_c85430": {
      "fontCharacter": "\\44",
      "fontColor": "#c85430"
    },
    "_44_4a80a8": {
      "fontCharacter": "\\44",
      "fontColor": "#4a80a8"
    },
    "_44_b87a18": {
      "fontCharacter": "\\44",
      "fontColor": "#b87a18"
    },
    "_44_68b858": {
      "fontCharacter": "\\44",
      "fontColor": "#68b858"
    },
    "_44_varaccent": {
      "fontCharacter": "\\44",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_46_varfg2",
  "folder": "_44_varaccent",
  "folderExpanded": "_44_varaccent",
  "fileExtensions": {
    "ts": "_44_4a90c2",
    "tsx": "_44_4a90c2",
    "js": "_44_c9b93a",
    "jsx": "_44_c9b93a",
    "rs": "_44_c08a6a",
    "py": "_44_4a80a5",
    "go": "_44_00a0c8",
    "java": "_44_a56818",
    "rb": "_44_b82f40",
    "php": "_44_4a5a9a",
    "cs": "_44_2f7a2f",
    "cpp": "_44_c04a6a",
    "c": "_44_5a5a5a",
    "swift": "_44_e04a30",
    "kt": "_44_8f6fd0",
    "json": "_44_b0b038",
    "yml": "_44_b03038",
    "toml": "_44_905028",
    "css": "_44_5a3a8a",
    "scss": "_44_a84a78",
    "html": "_44_c85430",
    "md": "_44_4a80a8",
    "sql": "_44_b87a18",
    "sh": "_44_68b858"
  },
  "fileNames": {
    "package.json": "_44_b0b038",
    "tsconfig.json": "_44_b0b038",
    "zephyr-extension.json": "_44_b0b038",
    "Dockerfile": "_44_68b858",
    "docker-compose.yml": "_44_b03038",
    "Makefile": "_44_68b858",
    ".gitignore": "_44_68b858",
    "Cargo.toml": "_44_905028",
    "README.md": "_44_4a80a8",
    "LICENSE": "_44_4a80a8"
  },
  "folderNames": {
    "src": "_44_varaccent",
    "node_modules": "_44_varaccent",
    "dist": "_44_varaccent",
    "build": "_44_varaccent",
    "test": "_44_varaccent",
    "tests": "_44_varaccent",
    "docs": "_44_varaccent",
    "assets": "_44_varaccent",
    "components": "_44_varaccent",
    "lib": "_44_varaccent",
    "public": "_44_varaccent",
    "scripts": "_44_varaccent",
    ".git": "_44_varaccent",
    ".github": "_44_varaccent",
    "target": "_44_varaccent",
    "vendor": "_44_varaccent"
  }
}"##;

pub(super) const IKON_HURUF_MIRING: &str = r##"{
  "id": "zephyr.ikon-huruf-miring",
  "name": "Ikon Huruf Miring",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Italic initials, softer than bold",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Huruf Miring", "path": "./icons/huruf-miring.json" }]
  }
}"##;

pub(super) const IKON_HURUF_MIRING_JSON: &str = r##"{
  "iconDefinitions": {
    "_66_varfg2": {
      "fontCharacter": "\\66",
      "fontColor": "var(--fg2)"
    },
    "_64_5a8ab5": {
      "fontCharacter": "\\64",
      "fontColor": "#5a8ab5"
    },
    "_64_c2b53a": {
      "fontCharacter": "\\64",
      "fontColor": "#c2b53a"
    },
    "_64_b08060": {
      "fontCharacter": "\\64",
      "fontColor": "#b08060"
    },
    "_64_4a7595": {
      "fontCharacter": "\\64",
      "fontColor": "#4a7595"
    },
    "_64_0095bb": {
      "fontCharacter": "\\64",
      "fontColor": "#0095bb"
    },
    "_64_9a5a18": {
      "fontCharacter": "\\64",
      "fontColor": "#9a5a18"
    },
    "_64_a82f3a": {
      "fontCharacter": "\\64",
      "fontColor": "#a82f3a"
    },
    "_64_48558a": {
      "fontCharacter": "\\64",
      "fontColor": "#48558a"
    },
    "_64_2f6f2f": {
      "fontCharacter": "\\64",
      "fontColor": "#2f6f2f"
    },
    "_64_b54560": {
      "fontCharacter": "\\64",
      "fontColor": "#b54560"
    },
    "_64_5a5a5a": {
      "fontCharacter": "\\64",
      "fontColor": "#5a5a5a"
    },
    "_64_d04530": {
      "fontCharacter": "\\64",
      "fontColor": "#d04530"
    },
    "_64_8560c0": {
      "fontCharacter": "\\64",
      "fontColor": "#8560c0"
    },
    "_64_a8a838": {
      "fontCharacter": "\\64",
      "fontColor": "#a8a838"
    },
    "_64_a82f35": {
      "fontCharacter": "\\64",
      "fontColor": "#a82f35"
    },
    "_64_885028": {
      "fontCharacter": "\\64",
      "fontColor": "#885028"
    },
    "_64_553a80": {
      "fontCharacter": "\\64",
      "fontColor": "#553a80"
    },
    "_64_9a4570": {
      "fontCharacter": "\\64",
      "fontColor": "#9a4570"
    },
    "_64_bb4f2f": {
      "fontCharacter": "\\64",
      "fontColor": "#bb4f2f"
    },
    "_64_4a7aa0": {
      "fontCharacter": "\\64",
      "fontColor": "#4a7aa0"
    },
    "_64_aa7518": {
      "fontCharacter": "\\64",
      "fontColor": "#aa7518"
    },
    "_64_60aa50": {
      "fontCharacter": "\\64",
      "fontColor": "#60aa50"
    },
    "_64_varaccent": {
      "fontCharacter": "\\64",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_66_varfg2",
  "folder": "_64_varaccent",
  "folderExpanded": "_64_varaccent",
  "fileExtensions": {
    "ts": "_64_5a8ab5",
    "tsx": "_64_5a8ab5",
    "js": "_64_c2b53a",
    "jsx": "_64_c2b53a",
    "rs": "_64_b08060",
    "py": "_64_4a7595",
    "go": "_64_0095bb",
    "java": "_64_9a5a18",
    "rb": "_64_a82f3a",
    "php": "_64_48558a",
    "cs": "_64_2f6f2f",
    "cpp": "_64_b54560",
    "c": "_64_5a5a5a",
    "swift": "_64_d04530",
    "kt": "_64_8560c0",
    "json": "_64_a8a838",
    "yml": "_64_a82f35",
    "toml": "_64_885028",
    "css": "_64_553a80",
    "scss": "_64_9a4570",
    "html": "_64_bb4f2f",
    "md": "_64_4a7aa0",
    "sql": "_64_aa7518",
    "sh": "_64_60aa50"
  },
  "fileNames": {
    "package.json": "_64_a8a838",
    "tsconfig.json": "_64_a8a838",
    "zephyr-extension.json": "_64_a8a838",
    "Dockerfile": "_64_60aa50",
    "docker-compose.yml": "_64_a82f35",
    "Makefile": "_64_60aa50",
    ".gitignore": "_64_60aa50",
    "Cargo.toml": "_64_885028",
    "README.md": "_64_4a7aa0",
    "LICENSE": "_64_4a7aa0"
  },
  "folderNames": {
    "src": "_64_varaccent",
    "node_modules": "_64_varaccent",
    "dist": "_64_varaccent",
    "build": "_64_varaccent",
    "test": "_64_varaccent",
    "tests": "_64_varaccent",
    "docs": "_64_varaccent",
    "assets": "_64_varaccent",
    "components": "_64_varaccent",
    "lib": "_64_varaccent",
    "public": "_64_varaccent",
    "scripts": "_64_varaccent",
    ".git": "_64_varaccent",
    ".github": "_64_varaccent",
    "target": "_64_varaccent",
    "vendor": "_64_varaccent"
  }
}"##;

pub(super) const IKON_KODE: &str = r##"{
  "id": "zephyr.ikon-kode",
  "name": "Ikon Kode",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Angle brackets, the developer default",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kode", "path": "./icons/kode.json" }]
  }
}"##;

pub(super) const IKON_KODE_JSON: &str = r##"{
  "iconDefinitions": {
    "_3c_varfg2": {
      "fontCharacter": "\\3c",
      "fontColor": "var(--fg2)"
    },
    "_3c_3178c6": {
      "fontCharacter": "\\3c",
      "fontColor": "#3178c6"
    },
    "_3c_519aba": {
      "fontCharacter": "\\3c",
      "fontColor": "#519aba"
    },
    "_3c_f1e05a": {
      "fontCharacter": "\\3c",
      "fontColor": "#f1e05a"
    },
    "_3c_61dafb": {
      "fontCharacter": "\\3c",
      "fontColor": "#61dafb"
    },
    "_3c_dea584": {
      "fontCharacter": "\\3c",
      "fontColor": "#dea584"
    },
    "_3c_3572a5": {
      "fontCharacter": "\\3c",
      "fontColor": "#3572a5"
    },
    "_3c_00add8": {
      "fontCharacter": "\\3c",
      "fontColor": "#00add8"
    },
    "_3c_b07219": {
      "fontCharacter": "\\3c",
      "fontColor": "#b07219"
    },
    "_3c_cc342d": {
      "fontCharacter": "\\3c",
      "fontColor": "#cc342d"
    },
    "_3c_4f5d95": {
      "fontCharacter": "\\3c",
      "fontColor": "#4f5d95"
    },
    "_3c_178600": {
      "fontCharacter": "\\3c",
      "fontColor": "#178600"
    },
    "_3c_f34b7d": {
      "fontCharacter": "\\3c",
      "fontColor": "#f34b7d"
    },
    "_3c_555555": {
      "fontCharacter": "\\3c",
      "fontColor": "#555555"
    },
    "_3c_f05138": {
      "fontCharacter": "\\3c",
      "fontColor": "#f05138"
    },
    "_3c_a97bff": {
      "fontCharacter": "\\3c",
      "fontColor": "#a97bff"
    },
    "_3c_cbcb41": {
      "fontCharacter": "\\3c",
      "fontColor": "#cbcb41"
    },
    "_3c_cb171e": {
      "fontCharacter": "\\3c",
      "fontColor": "#cb171e"
    },
    "_3c_9c4221": {
      "fontCharacter": "\\3c",
      "fontColor": "#9c4221"
    },
    "_3c_563d7c": {
      "fontCharacter": "\\3c",
      "fontColor": "#563d7c"
    },
    "_3c_c6538c": {
      "fontCharacter": "\\3c",
      "fontColor": "#c6538c"
    },
    "_3c_e34c26": {
      "fontCharacter": "\\3c",
      "fontColor": "#e34c26"
    },
    "_3c_e38c00": {
      "fontCharacter": "\\3c",
      "fontColor": "#e38c00"
    },
    "_3c_89e051": {
      "fontCharacter": "\\3c",
      "fontColor": "#89e051"
    },
    "_3c_varaccent": {
      "fontCharacter": "\\3c",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_3c_varfg2",
  "folder": "_3c_varaccent",
  "folderExpanded": "_3c_varaccent",
  "fileExtensions": {
    "ts": "_3c_3178c6",
    "tsx": "_3c_519aba",
    "js": "_3c_f1e05a",
    "jsx": "_3c_61dafb",
    "rs": "_3c_dea584",
    "py": "_3c_3572a5",
    "go": "_3c_00add8",
    "java": "_3c_b07219",
    "rb": "_3c_cc342d",
    "php": "_3c_4f5d95",
    "cs": "_3c_178600",
    "cpp": "_3c_f34b7d",
    "c": "_3c_555555",
    "swift": "_3c_f05138",
    "kt": "_3c_a97bff",
    "json": "_3c_cbcb41",
    "yml": "_3c_cb171e",
    "toml": "_3c_9c4221",
    "css": "_3c_563d7c",
    "scss": "_3c_c6538c",
    "html": "_3c_e34c26",
    "md": "_3c_519aba",
    "sql": "_3c_e38c00",
    "sh": "_3c_89e051"
  },
  "fileNames": {
    "package.json": "_3c_cbcb41",
    "tsconfig.json": "_3c_cbcb41",
    "zephyr-extension.json": "_3c_cbcb41",
    "Dockerfile": "_3c_89e051",
    "docker-compose.yml": "_3c_cb171e",
    "Makefile": "_3c_89e051",
    ".gitignore": "_3c_89e051",
    "Cargo.toml": "_3c_9c4221",
    "README.md": "_3c_519aba",
    "LICENSE": "_3c_519aba"
  },
  "folderNames": {
    "src": "_3c_varaccent",
    "node_modules": "_3c_varaccent",
    "dist": "_3c_varaccent",
    "build": "_3c_varaccent",
    "test": "_3c_varaccent",
    "tests": "_3c_varaccent",
    "docs": "_3c_varaccent",
    "assets": "_3c_varaccent",
    "components": "_3c_varaccent",
    "lib": "_3c_varaccent",
    "public": "_3c_varaccent",
    "scripts": "_3c_varaccent",
    ".git": "_3c_varaccent",
    ".github": "_3c_varaccent",
    "target": "_3c_varaccent",
    "vendor": "_3c_varaccent"
  }
}"##;

pub(super) const IKON_SIMPUL: &str = r##"{
  "id": "zephyr.ikon-simpul",
  "name": "Ikon Simpul",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Knot marks, connected feel",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Simpul", "path": "./icons/simpul.json" }]
  }
}"##;

pub(super) const IKON_SIMPUL_JSON: &str = r##"{
  "iconDefinitions": {
    "_2749_varfg2": {
      "fontCharacter": "\\2749",
      "fontColor": "var(--fg2)"
    },
    "_274a_4f95c8": {
      "fontCharacter": "\\274a",
      "fontColor": "#4f95c8"
    },
    "_274a_c8ba3a": {
      "fontCharacter": "\\274a",
      "fontColor": "#c8ba3a"
    },
    "_274a_c38a68": {
      "fontCharacter": "\\274a",
      "fontColor": "#c38a68"
    },
    "_274a_4f83a8": {
      "fontCharacter": "\\274a",
      "fontColor": "#4f83a8"
    },
    "_274a_00a2ca": {
      "fontCharacter": "\\274a",
      "fontColor": "#00a2ca"
    },
    "_274a_aa6d1c": {
      "fontCharacter": "\\274a",
      "fontColor": "#aa6d1c"
    },
    "_274a_b83242": {
      "fontCharacter": "\\274a",
      "fontColor": "#b83242"
    },
    "_274a_4c5c9c": {
      "fontCharacter": "\\274a",
      "fontColor": "#4c5c9c"
    },
    "_274a_327d32": {
      "fontCharacter": "\\274a",
      "fontColor": "#327d32"
    },
    "_274a_c3506c": {
      "fontCharacter": "\\274a",
      "fontColor": "#c3506c"
    },
    "_274a_5c5c5c": {
      "fontCharacter": "\\274a",
      "fontColor": "#5c5c5c"
    },
    "_274a_e25038": {
      "fontCharacter": "\\274a",
      "fontColor": "#e25038"
    },
    "_274a_9170d2": {
      "fontCharacter": "\\274a",
      "fontColor": "#9170d2"
    },
    "_274a_b3b33c": {
      "fontCharacter": "\\274a",
      "fontColor": "#b3b33c"
    },
    "_274a_b3323c": {
      "fontCharacter": "\\274a",
      "fontColor": "#b3323c"
    },
    "_274a_92552c": {
      "fontCharacter": "\\274a",
      "fontColor": "#92552c"
    },
    "_274a_5c3c8c": {
      "fontCharacter": "\\274a",
      "fontColor": "#5c3c8c"
    },
    "_274a_aa4c7a": {
      "fontCharacter": "\\274a",
      "fontColor": "#aa4c7a"
    },
    "_274a_ca5632": {
      "fontCharacter": "\\274a",
      "fontColor": "#ca5632"
    },
    "_274a_4f83aa": {
      "fontCharacter": "\\274a",
      "fontColor": "#4f83aa"
    },
    "_274a_ba7c1c": {
      "fontCharacter": "\\274a",
      "fontColor": "#ba7c1c"
    },
    "_274a_6aba5a": {
      "fontCharacter": "\\274a",
      "fontColor": "#6aba5a"
    },
    "_274a_varaccent": {
      "fontCharacter": "\\274a",
      "fontColor": "var(--accent)"
    },
    "_274b_varaccent": {
      "fontCharacter": "\\274b",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2749_varfg2",
  "folder": "_274a_varaccent",
  "folderExpanded": "_274b_varaccent",
  "fileExtensions": {
    "ts": "_274a_4f95c8",
    "tsx": "_274a_4f95c8",
    "js": "_274a_c8ba3a",
    "jsx": "_274a_c8ba3a",
    "rs": "_274a_c38a68",
    "py": "_274a_4f83a8",
    "go": "_274a_00a2ca",
    "java": "_274a_aa6d1c",
    "rb": "_274a_b83242",
    "php": "_274a_4c5c9c",
    "cs": "_274a_327d32",
    "cpp": "_274a_c3506c",
    "c": "_274a_5c5c5c",
    "swift": "_274a_e25038",
    "kt": "_274a_9170d2",
    "json": "_274a_b3b33c",
    "yml": "_274a_b3323c",
    "toml": "_274a_92552c",
    "css": "_274a_5c3c8c",
    "scss": "_274a_aa4c7a",
    "html": "_274a_ca5632",
    "md": "_274a_4f83aa",
    "sql": "_274a_ba7c1c",
    "sh": "_274a_6aba5a"
  },
  "fileNames": {
    "package.json": "_274a_b3b33c",
    "tsconfig.json": "_274a_b3b33c",
    "zephyr-extension.json": "_274a_b3b33c",
    "Dockerfile": "_274a_6aba5a",
    "docker-compose.yml": "_274a_b3323c",
    "Makefile": "_274a_6aba5a",
    ".gitignore": "_274a_6aba5a",
    "Cargo.toml": "_274a_92552c",
    "README.md": "_274a_4f83aa",
    "LICENSE": "_274a_4f83aa"
  },
  "folderNames": {
    "src": "_274a_varaccent",
    "node_modules": "_274a_varaccent",
    "dist": "_274a_varaccent",
    "build": "_274a_varaccent",
    "test": "_274a_varaccent",
    "tests": "_274a_varaccent",
    "docs": "_274a_varaccent",
    "assets": "_274a_varaccent",
    "components": "_274a_varaccent",
    "lib": "_274a_varaccent",
    "public": "_274a_varaccent",
    "scripts": "_274a_varaccent",
    ".git": "_274a_varaccent",
    ".github": "_274a_varaccent",
    "target": "_274a_varaccent",
    "vendor": "_274a_varaccent"
  }
}"##;

pub(super) const IKON_PELURU: &str = r##"{
  "id": "zephyr.ikon-peluru",
  "name": "Ikon Peluru",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Bullet marks, tiny and fast",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Peluru", "path": "./icons/peluru.json" }]
  }
}"##;

pub(super) const IKON_PELURU_JSON: &str = r##"{
  "iconDefinitions": {
    "_2022_varfg2": {
      "fontCharacter": "\\2022",
      "fontColor": "var(--fg2)"
    },
    "_2023_3178c6": {
      "fontCharacter": "\\2023",
      "fontColor": "#3178c6"
    },
    "_2023_519aba": {
      "fontCharacter": "\\2023",
      "fontColor": "#519aba"
    },
    "_2023_f1e05a": {
      "fontCharacter": "\\2023",
      "fontColor": "#f1e05a"
    },
    "_2023_61dafb": {
      "fontCharacter": "\\2023",
      "fontColor": "#61dafb"
    },
    "_2023_dea584": {
      "fontCharacter": "\\2023",
      "fontColor": "#dea584"
    },
    "_2023_3572a5": {
      "fontCharacter": "\\2023",
      "fontColor": "#3572a5"
    },
    "_2023_00add8": {
      "fontCharacter": "\\2023",
      "fontColor": "#00add8"
    },
    "_2023_b07219": {
      "fontCharacter": "\\2023",
      "fontColor": "#b07219"
    },
    "_2023_cc342d": {
      "fontCharacter": "\\2023",
      "fontColor": "#cc342d"
    },
    "_2023_4f5d95": {
      "fontCharacter": "\\2023",
      "fontColor": "#4f5d95"
    },
    "_2023_178600": {
      "fontCharacter": "\\2023",
      "fontColor": "#178600"
    },
    "_2023_f34b7d": {
      "fontCharacter": "\\2023",
      "fontColor": "#f34b7d"
    },
    "_2023_555555": {
      "fontCharacter": "\\2023",
      "fontColor": "#555555"
    },
    "_2023_f05138": {
      "fontCharacter": "\\2023",
      "fontColor": "#f05138"
    },
    "_2023_a97bff": {
      "fontCharacter": "\\2023",
      "fontColor": "#a97bff"
    },
    "_2023_cbcb41": {
      "fontCharacter": "\\2023",
      "fontColor": "#cbcb41"
    },
    "_2023_cb171e": {
      "fontCharacter": "\\2023",
      "fontColor": "#cb171e"
    },
    "_2023_9c4221": {
      "fontCharacter": "\\2023",
      "fontColor": "#9c4221"
    },
    "_2023_563d7c": {
      "fontCharacter": "\\2023",
      "fontColor": "#563d7c"
    },
    "_2023_c6538c": {
      "fontCharacter": "\\2023",
      "fontColor": "#c6538c"
    },
    "_2023_e34c26": {
      "fontCharacter": "\\2023",
      "fontColor": "#e34c26"
    },
    "_2023_e38c00": {
      "fontCharacter": "\\2023",
      "fontColor": "#e38c00"
    },
    "_2023_89e051": {
      "fontCharacter": "\\2023",
      "fontColor": "#89e051"
    },
    "_2023_varaccent": {
      "fontCharacter": "\\2023",
      "fontColor": "var(--accent)"
    },
    "_2043_varaccent": {
      "fontCharacter": "\\2043",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2022_varfg2",
  "folder": "_2023_varaccent",
  "folderExpanded": "_2043_varaccent",
  "fileExtensions": {
    "ts": "_2023_3178c6",
    "tsx": "_2023_519aba",
    "js": "_2023_f1e05a",
    "jsx": "_2023_61dafb",
    "rs": "_2023_dea584",
    "py": "_2023_3572a5",
    "go": "_2023_00add8",
    "java": "_2023_b07219",
    "rb": "_2023_cc342d",
    "php": "_2023_4f5d95",
    "cs": "_2023_178600",
    "cpp": "_2023_f34b7d",
    "c": "_2023_555555",
    "swift": "_2023_f05138",
    "kt": "_2023_a97bff",
    "json": "_2023_cbcb41",
    "yml": "_2023_cb171e",
    "toml": "_2023_9c4221",
    "css": "_2023_563d7c",
    "scss": "_2023_c6538c",
    "html": "_2023_e34c26",
    "md": "_2023_519aba",
    "sql": "_2023_e38c00",
    "sh": "_2023_89e051"
  },
  "fileNames": {
    "package.json": "_2023_cbcb41",
    "tsconfig.json": "_2023_cbcb41",
    "zephyr-extension.json": "_2023_cbcb41",
    "Dockerfile": "_2023_89e051",
    "docker-compose.yml": "_2023_cb171e",
    "Makefile": "_2023_89e051",
    ".gitignore": "_2023_89e051",
    "Cargo.toml": "_2023_9c4221",
    "README.md": "_2023_519aba",
    "LICENSE": "_2023_519aba"
  },
  "folderNames": {
    "src": "_2023_varaccent",
    "node_modules": "_2023_varaccent",
    "dist": "_2023_varaccent",
    "build": "_2023_varaccent",
    "test": "_2023_varaccent",
    "tests": "_2023_varaccent",
    "docs": "_2023_varaccent",
    "assets": "_2023_varaccent",
    "components": "_2023_varaccent",
    "lib": "_2023_varaccent",
    "public": "_2023_varaccent",
    "scripts": "_2023_varaccent",
    ".git": "_2023_varaccent",
    ".github": "_2023_varaccent",
    "target": "_2023_varaccent",
    "vendor": "_2023_varaccent"
  }
}"##;

pub(super) const IKON_BELAH: &str = r##"{
  "id": "zephyr.ikon-belah",
  "name": "Ikon Belah",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Split marks, two-tone feel",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Belah", "path": "./icons/belah.json" }]
  }
}"##;

pub(super) const IKON_BELAH_JSON: &str = r##"{
  "iconDefinitions": {
    "_25d0_varfg2": {
      "fontCharacter": "\\25d0",
      "fontColor": "var(--fg2)"
    },
    "_25d1_5a9ac8": {
      "fontCharacter": "\\25d1",
      "fontColor": "#5a9ac8"
    },
    "_25d1_cabd3a": {
      "fontCharacter": "\\25d1",
      "fontColor": "#cabd3a"
    },
    "_25d1_c48b68": {
      "fontCharacter": "\\25d1",
      "fontColor": "#c48b68"
    },
    "_25d1_5085a8": {
      "fontCharacter": "\\25d1",
      "fontColor": "#5085a8"
    },
    "_25d1_00a3cb": {
      "fontCharacter": "\\25d1",
      "fontColor": "#00a3cb"
    },
    "_25d1_ab6e1d": {
      "fontCharacter": "\\25d1",
      "fontColor": "#ab6e1d"
    },
    "_25d1_ba3343": {
      "fontCharacter": "\\25d1",
      "fontColor": "#ba3343"
    },
    "_25d1_4e5e9e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#4e5e9e"
    },
    "_25d1_337e33": {
      "fontCharacter": "\\25d1",
      "fontColor": "#337e33"
    },
    "_25d1_c4526e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#c4526e"
    },
    "_25d1_5e5e5e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#5e5e5e"
    },
    "_25d1_e3523a": {
      "fontCharacter": "\\25d1",
      "fontColor": "#e3523a"
    },
    "_25d1_9373d4": {
      "fontCharacter": "\\25d1",
      "fontColor": "#9373d4"
    },
    "_25d1_b6b63e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#b6b63e"
    },
    "_25d1_b6343e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#b6343e"
    },
    "_25d1_94572e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#94572e"
    },
    "_25d1_5e3e8e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#5e3e8e"
    },
    "_25d1_aa4c7a": {
      "fontCharacter": "\\25d1",
      "fontColor": "#aa4c7a"
    },
    "_25d1_cc5834": {
      "fontCharacter": "\\25d1",
      "fontColor": "#cc5834"
    },
    "_25d1_5085ac": {
      "fontCharacter": "\\25d1",
      "fontColor": "#5085ac"
    },
    "_25d1_bc7e1e": {
      "fontCharacter": "\\25d1",
      "fontColor": "#bc7e1e"
    },
    "_25d1_6cbc5c": {
      "fontCharacter": "\\25d1",
      "fontColor": "#6cbc5c"
    },
    "_25d1_varaccent": {
      "fontCharacter": "\\25d1",
      "fontColor": "var(--accent)"
    },
    "_25d2_varaccent": {
      "fontCharacter": "\\25d2",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25d0_varfg2",
  "folder": "_25d1_varaccent",
  "folderExpanded": "_25d2_varaccent",
  "fileExtensions": {
    "ts": "_25d1_5a9ac8",
    "tsx": "_25d1_5a9ac8",
    "js": "_25d1_cabd3a",
    "jsx": "_25d1_cabd3a",
    "rs": "_25d1_c48b68",
    "py": "_25d1_5085a8",
    "go": "_25d1_00a3cb",
    "java": "_25d1_ab6e1d",
    "rb": "_25d1_ba3343",
    "php": "_25d1_4e5e9e",
    "cs": "_25d1_337e33",
    "cpp": "_25d1_c4526e",
    "c": "_25d1_5e5e5e",
    "swift": "_25d1_e3523a",
    "kt": "_25d1_9373d4",
    "json": "_25d1_b6b63e",
    "yml": "_25d1_b6343e",
    "toml": "_25d1_94572e",
    "css": "_25d1_5e3e8e",
    "scss": "_25d1_aa4c7a",
    "html": "_25d1_cc5834",
    "md": "_25d1_5085ac",
    "sql": "_25d1_bc7e1e",
    "sh": "_25d1_6cbc5c"
  },
  "fileNames": {
    "package.json": "_25d1_b6b63e",
    "tsconfig.json": "_25d1_b6b63e",
    "zephyr-extension.json": "_25d1_b6b63e",
    "Dockerfile": "_25d1_6cbc5c",
    "docker-compose.yml": "_25d1_b6343e",
    "Makefile": "_25d1_6cbc5c",
    ".gitignore": "_25d1_6cbc5c",
    "Cargo.toml": "_25d1_94572e",
    "README.md": "_25d1_5085ac",
    "LICENSE": "_25d1_5085ac"
  },
  "folderNames": {
    "src": "_25d1_varaccent",
    "node_modules": "_25d1_varaccent",
    "dist": "_25d1_varaccent",
    "build": "_25d1_varaccent",
    "test": "_25d1_varaccent",
    "tests": "_25d1_varaccent",
    "docs": "_25d1_varaccent",
    "assets": "_25d1_varaccent",
    "components": "_25d1_varaccent",
    "lib": "_25d1_varaccent",
    "public": "_25d1_varaccent",
    "scripts": "_25d1_varaccent",
    ".git": "_25d1_varaccent",
    ".github": "_25d1_varaccent",
    "target": "_25d1_varaccent",
    "vendor": "_25d1_varaccent"
  }
}"##;

pub(super) const IKON_TANDA_PLUS: &str = r##"{
  "id": "zephyr.ikon-tanda-plus",
  "name": "Ikon Tanda Plus",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Cross marks, medical-clean",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Tanda Plus", "path": "./icons/tanda-plus.json" }]
  }
}"##;

pub(super) const IKON_TANDA_PLUS_JSON: &str = r##"{
  "iconDefinitions": {
    "_271a_varfg2": {
      "fontCharacter": "\\271a",
      "fontColor": "var(--fg2)"
    },
    "_271a_3178c6": {
      "fontCharacter": "\\271a",
      "fontColor": "#3178c6"
    },
    "_271a_519aba": {
      "fontCharacter": "\\271a",
      "fontColor": "#519aba"
    },
    "_271a_f1e05a": {
      "fontCharacter": "\\271a",
      "fontColor": "#f1e05a"
    },
    "_271a_61dafb": {
      "fontCharacter": "\\271a",
      "fontColor": "#61dafb"
    },
    "_271a_dea584": {
      "fontCharacter": "\\271a",
      "fontColor": "#dea584"
    },
    "_271a_3572a5": {
      "fontCharacter": "\\271a",
      "fontColor": "#3572a5"
    },
    "_271a_00add8": {
      "fontCharacter": "\\271a",
      "fontColor": "#00add8"
    },
    "_271a_b07219": {
      "fontCharacter": "\\271a",
      "fontColor": "#b07219"
    },
    "_271a_cc342d": {
      "fontCharacter": "\\271a",
      "fontColor": "#cc342d"
    },
    "_271a_4f5d95": {
      "fontCharacter": "\\271a",
      "fontColor": "#4f5d95"
    },
    "_271a_178600": {
      "fontCharacter": "\\271a",
      "fontColor": "#178600"
    },
    "_271a_f34b7d": {
      "fontCharacter": "\\271a",
      "fontColor": "#f34b7d"
    },
    "_271a_555555": {
      "fontCharacter": "\\271a",
      "fontColor": "#555555"
    },
    "_271a_f05138": {
      "fontCharacter": "\\271a",
      "fontColor": "#f05138"
    },
    "_271a_a97bff": {
      "fontCharacter": "\\271a",
      "fontColor": "#a97bff"
    },
    "_271a_cbcb41": {
      "fontCharacter": "\\271a",
      "fontColor": "#cbcb41"
    },
    "_271a_cb171e": {
      "fontCharacter": "\\271a",
      "fontColor": "#cb171e"
    },
    "_271a_9c4221": {
      "fontCharacter": "\\271a",
      "fontColor": "#9c4221"
    },
    "_271a_563d7c": {
      "fontCharacter": "\\271a",
      "fontColor": "#563d7c"
    },
    "_271a_c6538c": {
      "fontCharacter": "\\271a",
      "fontColor": "#c6538c"
    },
    "_271a_e34c26": {
      "fontCharacter": "\\271a",
      "fontColor": "#e34c26"
    },
    "_271a_e38c00": {
      "fontCharacter": "\\271a",
      "fontColor": "#e38c00"
    },
    "_271a_89e051": {
      "fontCharacter": "\\271a",
      "fontColor": "#89e051"
    },
    "_271a_varaccent": {
      "fontCharacter": "\\271a",
      "fontColor": "var(--accent)"
    },
    "_271b_varaccent": {
      "fontCharacter": "\\271b",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_271a_varfg2",
  "folder": "_271a_varaccent",
  "folderExpanded": "_271b_varaccent",
  "fileExtensions": {
    "ts": "_271a_3178c6",
    "tsx": "_271a_519aba",
    "js": "_271a_f1e05a",
    "jsx": "_271a_61dafb",
    "rs": "_271a_dea584",
    "py": "_271a_3572a5",
    "go": "_271a_00add8",
    "java": "_271a_b07219",
    "rb": "_271a_cc342d",
    "php": "_271a_4f5d95",
    "cs": "_271a_178600",
    "cpp": "_271a_f34b7d",
    "c": "_271a_555555",
    "swift": "_271a_f05138",
    "kt": "_271a_a97bff",
    "json": "_271a_cbcb41",
    "yml": "_271a_cb171e",
    "toml": "_271a_9c4221",
    "css": "_271a_563d7c",
    "scss": "_271a_c6538c",
    "html": "_271a_e34c26",
    "md": "_271a_519aba",
    "sql": "_271a_e38c00",
    "sh": "_271a_89e051"
  },
  "fileNames": {
    "package.json": "_271a_cbcb41",
    "tsconfig.json": "_271a_cbcb41",
    "zephyr-extension.json": "_271a_cbcb41",
    "Dockerfile": "_271a_89e051",
    "docker-compose.yml": "_271a_cb171e",
    "Makefile": "_271a_89e051",
    ".gitignore": "_271a_89e051",
    "Cargo.toml": "_271a_9c4221",
    "README.md": "_271a_519aba",
    "LICENSE": "_271a_519aba"
  },
  "folderNames": {
    "src": "_271a_varaccent",
    "node_modules": "_271a_varaccent",
    "dist": "_271a_varaccent",
    "build": "_271a_varaccent",
    "test": "_271a_varaccent",
    "tests": "_271a_varaccent",
    "docs": "_271a_varaccent",
    "assets": "_271a_varaccent",
    "components": "_271a_varaccent",
    "lib": "_271a_varaccent",
    "public": "_271a_varaccent",
    "scripts": "_271a_varaccent",
    ".git": "_271a_varaccent",
    ".github": "_271a_varaccent",
    "target": "_271a_varaccent",
    "vendor": "_271a_varaccent"
  }
}"##;

pub(super) const IKON_BELAH_DUA: &str = r##"{
  "id": "zephyr.ikon-belah-dua",
  "name": "Ikon Belah Dua",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Half-filled marks, high contrast",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Belah Dua", "path": "./icons/belah-dua.json" }]
  }
}"##;

pub(super) const IKON_BELAH_DUA_JSON: &str = r##"{
  "iconDefinitions": {
    "_25e7_varfg2": {
      "fontCharacter": "\\25e7",
      "fontColor": "var(--fg2)"
    },
    "_25e8_4a90c2": {
      "fontCharacter": "\\25e8",
      "fontColor": "#4a90c2"
    },
    "_25e8_c9b93a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#c9b93a"
    },
    "_25e8_c08a6a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#c08a6a"
    },
    "_25e8_4a80a5": {
      "fontCharacter": "\\25e8",
      "fontColor": "#4a80a5"
    },
    "_25e8_00a0c8": {
      "fontCharacter": "\\25e8",
      "fontColor": "#00a0c8"
    },
    "_25e8_a56818": {
      "fontCharacter": "\\25e8",
      "fontColor": "#a56818"
    },
    "_25e8_b82f40": {
      "fontCharacter": "\\25e8",
      "fontColor": "#b82f40"
    },
    "_25e8_4a5a9a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#4a5a9a"
    },
    "_25e8_2f7a2f": {
      "fontCharacter": "\\25e8",
      "fontColor": "#2f7a2f"
    },
    "_25e8_c04a6a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#c04a6a"
    },
    "_25e8_5a5a5a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#5a5a5a"
    },
    "_25e8_e04a30": {
      "fontCharacter": "\\25e8",
      "fontColor": "#e04a30"
    },
    "_25e8_8f6fd0": {
      "fontCharacter": "\\25e8",
      "fontColor": "#8f6fd0"
    },
    "_25e8_b0b038": {
      "fontCharacter": "\\25e8",
      "fontColor": "#b0b038"
    },
    "_25e8_b03038": {
      "fontCharacter": "\\25e8",
      "fontColor": "#b03038"
    },
    "_25e8_905028": {
      "fontCharacter": "\\25e8",
      "fontColor": "#905028"
    },
    "_25e8_5a3a8a": {
      "fontCharacter": "\\25e8",
      "fontColor": "#5a3a8a"
    },
    "_25e8_a84a78": {
      "fontCharacter": "\\25e8",
      "fontColor": "#a84a78"
    },
    "_25e8_c85430": {
      "fontCharacter": "\\25e8",
      "fontColor": "#c85430"
    },
    "_25e8_4a80a8": {
      "fontCharacter": "\\25e8",
      "fontColor": "#4a80a8"
    },
    "_25e8_b87a18": {
      "fontCharacter": "\\25e8",
      "fontColor": "#b87a18"
    },
    "_25e8_68b858": {
      "fontCharacter": "\\25e8",
      "fontColor": "#68b858"
    },
    "_25e8_varaccent": {
      "fontCharacter": "\\25e8",
      "fontColor": "var(--accent)"
    },
    "_25e9_varaccent": {
      "fontCharacter": "\\25e9",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_25e7_varfg2",
  "folder": "_25e8_varaccent",
  "folderExpanded": "_25e9_varaccent",
  "fileExtensions": {
    "ts": "_25e8_4a90c2",
    "tsx": "_25e8_4a90c2",
    "js": "_25e8_c9b93a",
    "jsx": "_25e8_c9b93a",
    "rs": "_25e8_c08a6a",
    "py": "_25e8_4a80a5",
    "go": "_25e8_00a0c8",
    "java": "_25e8_a56818",
    "rb": "_25e8_b82f40",
    "php": "_25e8_4a5a9a",
    "cs": "_25e8_2f7a2f",
    "cpp": "_25e8_c04a6a",
    "c": "_25e8_5a5a5a",
    "swift": "_25e8_e04a30",
    "kt": "_25e8_8f6fd0",
    "json": "_25e8_b0b038",
    "yml": "_25e8_b03038",
    "toml": "_25e8_905028",
    "css": "_25e8_5a3a8a",
    "scss": "_25e8_a84a78",
    "html": "_25e8_c85430",
    "md": "_25e8_4a80a8",
    "sql": "_25e8_b87a18",
    "sh": "_25e8_68b858"
  },
  "fileNames": {
    "package.json": "_25e8_b0b038",
    "tsconfig.json": "_25e8_b0b038",
    "zephyr-extension.json": "_25e8_b0b038",
    "Dockerfile": "_25e8_68b858",
    "docker-compose.yml": "_25e8_b03038",
    "Makefile": "_25e8_68b858",
    ".gitignore": "_25e8_68b858",
    "Cargo.toml": "_25e8_905028",
    "README.md": "_25e8_4a80a8",
    "LICENSE": "_25e8_4a80a8"
  },
  "folderNames": {
    "src": "_25e8_varaccent",
    "node_modules": "_25e8_varaccent",
    "dist": "_25e8_varaccent",
    "build": "_25e8_varaccent",
    "test": "_25e8_varaccent",
    "tests": "_25e8_varaccent",
    "docs": "_25e8_varaccent",
    "assets": "_25e8_varaccent",
    "components": "_25e8_varaccent",
    "lib": "_25e8_varaccent",
    "public": "_25e8_varaccent",
    "scripts": "_25e8_varaccent",
    ".git": "_25e8_varaccent",
    ".github": "_25e8_varaccent",
    "target": "_25e8_varaccent",
    "vendor": "_25e8_varaccent"
  }
}"##;

pub(super) const IKON_KILAU: &str = r##"{
  "id": "zephyr.ikon-kilau",
  "name": "Ikon Kilau",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "Sparkle marks, playful",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "Kilau", "path": "./icons/kilau.json" }]
  }
}"##;

pub(super) const IKON_KILAU_JSON: &str = r##"{
  "iconDefinitions": {
    "_2733_varfg2": {
      "fontCharacter": "\\2733",
      "fontColor": "var(--fg2)"
    },
    "_2734_5f9ec5": {
      "fontCharacter": "\\2734",
      "fontColor": "#5f9ec5"
    },
    "_2734_cfc040": {
      "fontCharacter": "\\2734",
      "fontColor": "#cfc040"
    },
    "_2734_c68f70": {
      "fontCharacter": "\\2734",
      "fontColor": "#c68f70"
    },
    "_2734_5488aa": {
      "fontCharacter": "\\2734",
      "fontColor": "#5488aa"
    },
    "_2734_00a8cf": {
      "fontCharacter": "\\2734",
      "fontColor": "#00a8cf"
    },
    "_2734_b07520": {
      "fontCharacter": "\\2734",
      "fontColor": "#b07520"
    },
    "_2734_c03a48": {
      "fontCharacter": "\\2734",
      "fontColor": "#c03a48"
    },
    "_2734_5464a4": {
      "fontCharacter": "\\2734",
      "fontColor": "#5464a4"
    },
    "_2734_3a833a": {
      "fontCharacter": "\\2734",
      "fontColor": "#3a833a"
    },
    "_2734_c85873": {
      "fontCharacter": "\\2734",
      "fontColor": "#c85873"
    },
    "_2734_606060": {
      "fontCharacter": "\\2734",
      "fontColor": "#606060"
    },
    "_2734_e85840": {
      "fontCharacter": "\\2734",
      "fontColor": "#e85840"
    },
    "_2734_9878d8": {
      "fontCharacter": "\\2734",
      "fontColor": "#9878d8"
    },
    "_2734_bbbb42": {
      "fontCharacter": "\\2734",
      "fontColor": "#bbbb42"
    },
    "_2734_bb3a42": {
      "fontCharacter": "\\2734",
      "fontColor": "#bb3a42"
    },
    "_2734_9a5c32": {
      "fontCharacter": "\\2734",
      "fontColor": "#9a5c32"
    },
    "_2734_604090": {
      "fontCharacter": "\\2734",
      "fontColor": "#604090"
    },
    "_2734_b05280": {
      "fontCharacter": "\\2734",
      "fontColor": "#b05280"
    },
    "_2734_d05c38": {
      "fontCharacter": "\\2734",
      "fontColor": "#d05c38"
    },
    "_2734_5488b0": {
      "fontCharacter": "\\2734",
      "fontColor": "#5488b0"
    },
    "_2734_c08222": {
      "fontCharacter": "\\2734",
      "fontColor": "#c08222"
    },
    "_2734_72c062": {
      "fontCharacter": "\\2734",
      "fontColor": "#72c062"
    },
    "_2734_varaccent": {
      "fontCharacter": "\\2734",
      "fontColor": "var(--accent)"
    },
    "_2735_varaccent": {
      "fontCharacter": "\\2735",
      "fontColor": "var(--accent)"
    }
  },
  "file": "_2733_varfg2",
  "folder": "_2734_varaccent",
  "folderExpanded": "_2735_varaccent",
  "fileExtensions": {
    "ts": "_2734_5f9ec5",
    "tsx": "_2734_5f9ec5",
    "js": "_2734_cfc040",
    "jsx": "_2734_cfc040",
    "rs": "_2734_c68f70",
    "py": "_2734_5488aa",
    "go": "_2734_00a8cf",
    "java": "_2734_b07520",
    "rb": "_2734_c03a48",
    "php": "_2734_5464a4",
    "cs": "_2734_3a833a",
    "cpp": "_2734_c85873",
    "c": "_2734_606060",
    "swift": "_2734_e85840",
    "kt": "_2734_9878d8",
    "json": "_2734_bbbb42",
    "yml": "_2734_bb3a42",
    "toml": "_2734_9a5c32",
    "css": "_2734_604090",
    "scss": "_2734_b05280",
    "html": "_2734_d05c38",
    "md": "_2734_5488b0",
    "sql": "_2734_c08222",
    "sh": "_2734_72c062"
  },
  "fileNames": {
    "package.json": "_2734_bbbb42",
    "tsconfig.json": "_2734_bbbb42",
    "zephyr-extension.json": "_2734_bbbb42",
    "Dockerfile": "_2734_72c062",
    "docker-compose.yml": "_2734_bb3a42",
    "Makefile": "_2734_72c062",
    ".gitignore": "_2734_72c062",
    "Cargo.toml": "_2734_9a5c32",
    "README.md": "_2734_5488b0",
    "LICENSE": "_2734_5488b0"
  },
  "folderNames": {
    "src": "_2734_varaccent",
    "node_modules": "_2734_varaccent",
    "dist": "_2734_varaccent",
    "build": "_2734_varaccent",
    "test": "_2734_varaccent",
    "tests": "_2734_varaccent",
    "docs": "_2734_varaccent",
    "assets": "_2734_varaccent",
    "components": "_2734_varaccent",
    "lib": "_2734_varaccent",
    "public": "_2734_varaccent",
    "scripts": "_2734_varaccent",
    ".git": "_2734_varaccent",
    ".github": "_2734_varaccent",
    "target": "_2734_varaccent",
    "vendor": "_2734_varaccent"
  }
}"##;

/* ══ AKHIR IKON MARKETPLACE ══ */
