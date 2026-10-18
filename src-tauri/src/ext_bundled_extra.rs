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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "▪",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◼",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◻",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "▪",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◼",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◻",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◼",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "◼",
      "color": "#519aba"
    },
    "js": {
      "glyph": "◼",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "◼",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "◼",
      "color": "#dea584"
    },
    "py": {
      "glyph": "◼",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "◼",
      "color": "#00add8"
    },
    "java": {
      "glyph": "◼",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "◼",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "◼",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "◼",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "◼",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "◼",
      "color": "#555555"
    },
    "swift": {
      "glyph": "◼",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "◼",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "◼",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "◼",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "◼",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "◼",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "◼",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "◼",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "◼",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "◼",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "◼",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◆",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◈",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◇",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◆",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◈",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◇",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◈",
      "color": "#5b9dd9"
    },
    "tsx": {
      "glyph": "◈",
      "color": "#5b9dd9"
    },
    "js": {
      "glyph": "◈",
      "color": "#e8c547"
    },
    "jsx": {
      "glyph": "◈",
      "color": "#e8c547"
    },
    "rs": {
      "glyph": "◈",
      "color": "#c98a6b"
    },
    "py": {
      "glyph": "◈",
      "color": "#4b8bbe"
    },
    "go": {
      "glyph": "◈",
      "color": "#00add8"
    },
    "java": {
      "glyph": "◈",
      "color": "#c07030"
    },
    "rb": {
      "glyph": "◈",
      "color": "#b03050"
    },
    "php": {
      "glyph": "◈",
      "color": "#6a72b5"
    },
    "cs": {
      "glyph": "◈",
      "color": "#3a8a3a"
    },
    "cpp": {
      "glyph": "◈",
      "color": "#d05070"
    },
    "c": {
      "glyph": "◈",
      "color": "#707070"
    },
    "swift": {
      "glyph": "◈",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "◈",
      "color": "#9a7bd0"
    },
    "json": {
      "glyph": "◈",
      "color": "#b5b53a"
    },
    "yml": {
      "glyph": "◈",
      "color": "#b03a3a"
    },
    "toml": {
      "glyph": "◈",
      "color": "#a05a30"
    },
    "css": {
      "glyph": "◈",
      "color": "#7a4a9a"
    },
    "scss": {
      "glyph": "◈",
      "color": "#b05080"
    },
    "html": {
      "glyph": "◈",
      "color": "#d05a3a"
    },
    "md": {
      "glyph": "◈",
      "color": "#4a8ab5"
    },
    "sql": {
      "glyph": "◈",
      "color": "#c08020"
    },
    "sh": {
      "glyph": "◈",
      "color": "#70c060"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "▲",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "▴",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "▵",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "▲",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "▴",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "▵",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "▴",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "▴",
      "color": "#519aba"
    },
    "js": {
      "glyph": "▴",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "▴",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "▴",
      "color": "#dea584"
    },
    "py": {
      "glyph": "▴",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "▴",
      "color": "#00add8"
    },
    "java": {
      "glyph": "▴",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "▴",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "▴",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "▴",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "▴",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "▴",
      "color": "#555555"
    },
    "swift": {
      "glyph": "▴",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "▴",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "▴",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "▴",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "▴",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "▴",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "▴",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "▴",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "▴",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "▴",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "▴",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "▦",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "▩",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "▨",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "▦",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "▩",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "▨",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "▩",
      "color": "#4a90c2"
    },
    "tsx": {
      "glyph": "▩",
      "color": "#4a90c2"
    },
    "js": {
      "glyph": "▩",
      "color": "#c9b93a"
    },
    "jsx": {
      "glyph": "▩",
      "color": "#c9b93a"
    },
    "rs": {
      "glyph": "▩",
      "color": "#c08a6a"
    },
    "py": {
      "glyph": "▩",
      "color": "#4a80a5"
    },
    "go": {
      "glyph": "▩",
      "color": "#00a0c8"
    },
    "java": {
      "glyph": "▩",
      "color": "#a56818"
    },
    "rb": {
      "glyph": "▩",
      "color": "#b82f40"
    },
    "php": {
      "glyph": "▩",
      "color": "#4a5a9a"
    },
    "cs": {
      "glyph": "▩",
      "color": "#2f7a2f"
    },
    "cpp": {
      "glyph": "▩",
      "color": "#c04a6a"
    },
    "c": {
      "glyph": "▩",
      "color": "#5a5a5a"
    },
    "swift": {
      "glyph": "▩",
      "color": "#e04a30"
    },
    "kt": {
      "glyph": "▩",
      "color": "#8f6fd0"
    },
    "json": {
      "glyph": "▩",
      "color": "#b0b038"
    },
    "yml": {
      "glyph": "▩",
      "color": "#b03038"
    },
    "toml": {
      "glyph": "▩",
      "color": "#905028"
    },
    "css": {
      "glyph": "▩",
      "color": "#5a3a8a"
    },
    "scss": {
      "glyph": "▩",
      "color": "#a84a78"
    },
    "html": {
      "glyph": "▩",
      "color": "#c85430"
    },
    "md": {
      "glyph": "▩",
      "color": "#4a80a8"
    },
    "sql": {
      "glyph": "▩",
      "color": "#b87a18"
    },
    "sh": {
      "glyph": "▩",
      "color": "#68b858"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "○",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "●",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◌",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "○",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "●",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◌",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "●",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "●",
      "color": "#519aba"
    },
    "js": {
      "glyph": "●",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "●",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "●",
      "color": "#dea584"
    },
    "py": {
      "glyph": "●",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "●",
      "color": "#00add8"
    },
    "java": {
      "glyph": "●",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "●",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "●",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "●",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "●",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "●",
      "color": "#555555"
    },
    "swift": {
      "glyph": "●",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "●",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "●",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "●",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "●",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "●",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "●",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "●",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "●",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "●",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "●",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "▢",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "▣",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "▤",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "▢",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "▣",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "▤",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "▣",
      "color": "#5a8ab5"
    },
    "tsx": {
      "glyph": "▣",
      "color": "#5a8ab5"
    },
    "js": {
      "glyph": "▣",
      "color": "#c2b53a"
    },
    "jsx": {
      "glyph": "▣",
      "color": "#c2b53a"
    },
    "rs": {
      "glyph": "▣",
      "color": "#b08060"
    },
    "py": {
      "glyph": "▣",
      "color": "#4a7595"
    },
    "go": {
      "glyph": "▣",
      "color": "#0095bb"
    },
    "java": {
      "glyph": "▣",
      "color": "#9a5a18"
    },
    "rb": {
      "glyph": "▣",
      "color": "#a82f3a"
    },
    "php": {
      "glyph": "▣",
      "color": "#48558a"
    },
    "cs": {
      "glyph": "▣",
      "color": "#2f6f2f"
    },
    "cpp": {
      "glyph": "▣",
      "color": "#b54560"
    },
    "c": {
      "glyph": "▣",
      "color": "#5a5a5a"
    },
    "swift": {
      "glyph": "▣",
      "color": "#d04530"
    },
    "kt": {
      "glyph": "▣",
      "color": "#8560c0"
    },
    "json": {
      "glyph": "▣",
      "color": "#a8a838"
    },
    "yml": {
      "glyph": "▣",
      "color": "#a82f35"
    },
    "toml": {
      "glyph": "▣",
      "color": "#885028"
    },
    "css": {
      "glyph": "▣",
      "color": "#553a80"
    },
    "scss": {
      "glyph": "▣",
      "color": "#9a4570"
    },
    "html": {
      "glyph": "▣",
      "color": "#bb4f2f"
    },
    "md": {
      "glyph": "▣",
      "color": "#4a7aa0"
    },
    "sql": {
      "glyph": "▣",
      "color": "#aa7518"
    },
    "sh": {
      "glyph": "▣",
      "color": "#60aa50"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "›",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "»",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "›",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "›",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "»",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "›",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "»",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "»",
      "color": "#519aba"
    },
    "js": {
      "glyph": "»",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "»",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "»",
      "color": "#dea584"
    },
    "py": {
      "glyph": "»",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "»",
      "color": "#00add8"
    },
    "java": {
      "glyph": "»",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "»",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "»",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "»",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "»",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "»",
      "color": "#555555"
    },
    "swift": {
      "glyph": "»",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "»",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "»",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "»",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "»",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "»",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "»",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "»",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "»",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "»",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "»",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "✦",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "✧",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "✩",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "✦",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "✧",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "✩",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "✧",
      "color": "#4a90c2"
    },
    "tsx": {
      "glyph": "✧",
      "color": "#4a90c2"
    },
    "js": {
      "glyph": "✧",
      "color": "#d4c33a"
    },
    "jsx": {
      "glyph": "✧",
      "color": "#d4c33a"
    },
    "rs": {
      "glyph": "✧",
      "color": "#c89070"
    },
    "py": {
      "glyph": "✧",
      "color": "#4a80a5"
    },
    "go": {
      "glyph": "✧",
      "color": "#00a0c8"
    },
    "java": {
      "glyph": "✧",
      "color": "#a87018"
    },
    "rb": {
      "glyph": "✧",
      "color": "#b83040"
    },
    "php": {
      "glyph": "✧",
      "color": "#4a5a9a"
    },
    "cs": {
      "glyph": "✧",
      "color": "#2f7a2f"
    },
    "cpp": {
      "glyph": "✧",
      "color": "#c0506a"
    },
    "c": {
      "glyph": "✧",
      "color": "#606060"
    },
    "swift": {
      "glyph": "✧",
      "color": "#e04a30"
    },
    "kt": {
      "glyph": "✧",
      "color": "#8f6fd0"
    },
    "json": {
      "glyph": "✧",
      "color": "#b5b53a"
    },
    "yml": {
      "glyph": "✧",
      "color": "#b03038"
    },
    "toml": {
      "glyph": "✧",
      "color": "#905028"
    },
    "css": {
      "glyph": "✧",
      "color": "#5a3a8a"
    },
    "scss": {
      "glyph": "✧",
      "color": "#a84a78"
    },
    "html": {
      "glyph": "✧",
      "color": "#c85430"
    },
    "md": {
      "glyph": "✧",
      "color": "#4a80a8"
    },
    "sql": {
      "glyph": "✧",
      "color": "#b87a18"
    },
    "sh": {
      "glyph": "✧",
      "color": "#68b858"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◯",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◉",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◎",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◯",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◉",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◎",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◉",
      "color": "#5a9ac2"
    },
    "tsx": {
      "glyph": "◉",
      "color": "#5a9ac2"
    },
    "js": {
      "glyph": "◉",
      "color": "#cdbf3f"
    },
    "jsx": {
      "glyph": "◉",
      "color": "#cdbf3f"
    },
    "rs": {
      "glyph": "◉",
      "color": "#c48e6e"
    },
    "py": {
      "glyph": "◉",
      "color": "#4f85aa"
    },
    "go": {
      "glyph": "◉",
      "color": "#00a5cd"
    },
    "java": {
      "glyph": "◉",
      "color": "#ad701f"
    },
    "rb": {
      "glyph": "◉",
      "color": "#bb3545"
    },
    "php": {
      "glyph": "◉",
      "color": "#4f5f9f"
    },
    "cs": {
      "glyph": "◉",
      "color": "#358035"
    },
    "cpp": {
      "glyph": "◉",
      "color": "#c55570"
    },
    "c": {
      "glyph": "◉",
      "color": "#5f5f5f"
    },
    "swift": {
      "glyph": "◉",
      "color": "#e5553a"
    },
    "kt": {
      "glyph": "◉",
      "color": "#9475d5"
    },
    "json": {
      "glyph": "◉",
      "color": "#b8b840"
    },
    "yml": {
      "glyph": "◉",
      "color": "#b83540"
    },
    "toml": {
      "glyph": "◉",
      "color": "#955a30"
    },
    "css": {
      "glyph": "◉",
      "color": "#5f3f8f"
    },
    "scss": {
      "glyph": "◉",
      "color": "#ad4f7d"
    },
    "html": {
      "glyph": "◉",
      "color": "#cd5935"
    },
    "md": {
      "glyph": "◉",
      "color": "#4f85ad"
    },
    "sql": {
      "glyph": "◉",
      "color": "#bd7f20"
    },
    "sh": {
      "glyph": "◉",
      "color": "#6dbd5d"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "█",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "▉",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "▊",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "█",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "▉",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "▊",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "▉",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "▉",
      "color": "#519aba"
    },
    "js": {
      "glyph": "▉",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "▉",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "▉",
      "color": "#dea584"
    },
    "py": {
      "glyph": "▉",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "▉",
      "color": "#00add8"
    },
    "java": {
      "glyph": "▉",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "▉",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "▉",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "▉",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "▉",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "▉",
      "color": "#555555"
    },
    "swift": {
      "glyph": "▉",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "▉",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "▉",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "▉",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "▉",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "▉",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "▉",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "▉",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "▉",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "▉",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "▉",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "≡",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "☰",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "≡",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "≡",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "☰",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "≡",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "☰",
      "color": "#4f95c8"
    },
    "tsx": {
      "glyph": "☰",
      "color": "#4f95c8"
    },
    "js": {
      "glyph": "☰",
      "color": "#c8ba3a"
    },
    "jsx": {
      "glyph": "☰",
      "color": "#c8ba3a"
    },
    "rs": {
      "glyph": "☰",
      "color": "#c38a68"
    },
    "py": {
      "glyph": "☰",
      "color": "#4f83a8"
    },
    "go": {
      "glyph": "☰",
      "color": "#00a2ca"
    },
    "java": {
      "glyph": "☰",
      "color": "#aa6d1c"
    },
    "rb": {
      "glyph": "☰",
      "color": "#b83242"
    },
    "php": {
      "glyph": "☰",
      "color": "#4c5c9c"
    },
    "cs": {
      "glyph": "☰",
      "color": "#327d32"
    },
    "cpp": {
      "glyph": "☰",
      "color": "#c3506c"
    },
    "c": {
      "glyph": "☰",
      "color": "#5c5c5c"
    },
    "swift": {
      "glyph": "☰",
      "color": "#e25038"
    },
    "kt": {
      "glyph": "☰",
      "color": "#9170d2"
    },
    "json": {
      "glyph": "☰",
      "color": "#b3b33c"
    },
    "yml": {
      "glyph": "☰",
      "color": "#b3323c"
    },
    "toml": {
      "glyph": "☰",
      "color": "#92552c"
    },
    "css": {
      "glyph": "☰",
      "color": "#5c3c8c"
    },
    "scss": {
      "glyph": "☰",
      "color": "#aa4c7a"
    },
    "html": {
      "glyph": "☰",
      "color": "#ca5632"
    },
    "md": {
      "glyph": "☰",
      "color": "#4f83aa"
    },
    "sql": {
      "glyph": "☰",
      "color": "#ba7c1c"
    },
    "sh": {
      "glyph": "☰",
      "color": "#6aba5a"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "⚡",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "⚡",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "⚡",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "⚡",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "⚡",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "⚡",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "⚡",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "⚡",
      "color": "#519aba"
    },
    "js": {
      "glyph": "⚡",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "⚡",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "⚡",
      "color": "#dea584"
    },
    "py": {
      "glyph": "⚡",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "⚡",
      "color": "#00add8"
    },
    "java": {
      "glyph": "⚡",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "⚡",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "⚡",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "⚡",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "⚡",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "⚡",
      "color": "#555555"
    },
    "swift": {
      "glyph": "⚡",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "⚡",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "⚡",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "⚡",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "⚡",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "⚡",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "⚡",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "⚡",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "⚡",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "⚡",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "⚡",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "❖",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "❖",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "❖",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "❖",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "❖",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "❖",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "❖",
      "color": "#5f9ec5"
    },
    "tsx": {
      "glyph": "❖",
      "color": "#5f9ec5"
    },
    "js": {
      "glyph": "❖",
      "color": "#cfc040"
    },
    "jsx": {
      "glyph": "❖",
      "color": "#cfc040"
    },
    "rs": {
      "glyph": "❖",
      "color": "#c68f70"
    },
    "py": {
      "glyph": "❖",
      "color": "#5488aa"
    },
    "go": {
      "glyph": "❖",
      "color": "#00a8cf"
    },
    "java": {
      "glyph": "❖",
      "color": "#b07520"
    },
    "rb": {
      "glyph": "❖",
      "color": "#c03a48"
    },
    "php": {
      "glyph": "❖",
      "color": "#5464a4"
    },
    "cs": {
      "glyph": "❖",
      "color": "#3a833a"
    },
    "cpp": {
      "glyph": "❖",
      "color": "#c85873"
    },
    "c": {
      "glyph": "❖",
      "color": "#606060"
    },
    "swift": {
      "glyph": "❖",
      "color": "#e85840"
    },
    "kt": {
      "glyph": "❖",
      "color": "#9878d8"
    },
    "json": {
      "glyph": "❖",
      "color": "#bbbb42"
    },
    "yml": {
      "glyph": "❖",
      "color": "#bb3a42"
    },
    "toml": {
      "glyph": "❖",
      "color": "#9a5c32"
    },
    "css": {
      "glyph": "❖",
      "color": "#604090"
    },
    "scss": {
      "glyph": "❖",
      "color": "#b05280"
    },
    "html": {
      "glyph": "❖",
      "color": "#d05c38"
    },
    "md": {
      "glyph": "❖",
      "color": "#5488b0"
    },
    "sql": {
      "glyph": "❖",
      "color": "#c08222"
    },
    "sh": {
      "glyph": "❖",
      "color": "#72c062"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "⬢",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "⬣",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "⬡",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "⬢",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "⬣",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "⬡",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "⬣",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "⬣",
      "color": "#519aba"
    },
    "js": {
      "glyph": "⬣",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "⬣",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "⬣",
      "color": "#dea584"
    },
    "py": {
      "glyph": "⬣",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "⬣",
      "color": "#00add8"
    },
    "java": {
      "glyph": "⬣",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "⬣",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "⬣",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "⬣",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "⬣",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "⬣",
      "color": "#555555"
    },
    "swift": {
      "glyph": "⬣",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "⬣",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "⬣",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "⬣",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "⬣",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "⬣",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "⬣",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "⬣",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "⬣",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "⬣",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "⬣",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◈",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◈",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◇",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◈",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◈",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◇",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◈",
      "color": "#5a9ac8"
    },
    "tsx": {
      "glyph": "◈",
      "color": "#5a9ac8"
    },
    "js": {
      "glyph": "◈",
      "color": "#cabd3a"
    },
    "jsx": {
      "glyph": "◈",
      "color": "#cabd3a"
    },
    "rs": {
      "glyph": "◈",
      "color": "#c48b68"
    },
    "py": {
      "glyph": "◈",
      "color": "#5085a8"
    },
    "go": {
      "glyph": "◈",
      "color": "#00a3cb"
    },
    "java": {
      "glyph": "◈",
      "color": "#ab6e1d"
    },
    "rb": {
      "glyph": "◈",
      "color": "#ba3343"
    },
    "php": {
      "glyph": "◈",
      "color": "#4e5e9e"
    },
    "cs": {
      "glyph": "◈",
      "color": "#337e33"
    },
    "cpp": {
      "glyph": "◈",
      "color": "#c4526e"
    },
    "c": {
      "glyph": "◈",
      "color": "#5e5e5e"
    },
    "swift": {
      "glyph": "◈",
      "color": "#e3523a"
    },
    "kt": {
      "glyph": "◈",
      "color": "#9373d4"
    },
    "json": {
      "glyph": "◈",
      "color": "#b6b63e"
    },
    "yml": {
      "glyph": "◈",
      "color": "#b6343e"
    },
    "toml": {
      "glyph": "◈",
      "color": "#94572e"
    },
    "css": {
      "glyph": "◈",
      "color": "#5e3e8e"
    },
    "scss": {
      "glyph": "◈",
      "color": "#ac4e7c"
    },
    "html": {
      "glyph": "◈",
      "color": "#cc5834"
    },
    "md": {
      "glyph": "◈",
      "color": "#5085ac"
    },
    "sql": {
      "glyph": "◈",
      "color": "#bc7e1e"
    },
    "sh": {
      "glyph": "◈",
      "color": "#6cbc5c"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "§",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "¶",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "§",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "§",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "¶",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "§",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "¶",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "¶",
      "color": "#519aba"
    },
    "js": {
      "glyph": "¶",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "¶",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "¶",
      "color": "#dea584"
    },
    "py": {
      "glyph": "¶",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "¶",
      "color": "#00add8"
    },
    "java": {
      "glyph": "¶",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "¶",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "¶",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "¶",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "¶",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "¶",
      "color": "#555555"
    },
    "swift": {
      "glyph": "¶",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "¶",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "¶",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "¶",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "¶",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "¶",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "¶",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "¶",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "¶",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "¶",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "¶",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◊",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◊",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◊",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◊",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◊",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◊",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◊",
      "color": "#4f95c8"
    },
    "tsx": {
      "glyph": "◊",
      "color": "#4f95c8"
    },
    "js": {
      "glyph": "◊",
      "color": "#c8ba3a"
    },
    "jsx": {
      "glyph": "◊",
      "color": "#c8ba3a"
    },
    "rs": {
      "glyph": "◊",
      "color": "#c38a68"
    },
    "py": {
      "glyph": "◊",
      "color": "#4f83a8"
    },
    "go": {
      "glyph": "◊",
      "color": "#00a2ca"
    },
    "java": {
      "glyph": "◊",
      "color": "#aa6d1c"
    },
    "rb": {
      "glyph": "◊",
      "color": "#b83242"
    },
    "php": {
      "glyph": "◊",
      "color": "#4c5c9c"
    },
    "cs": {
      "glyph": "◊",
      "color": "#327d32"
    },
    "cpp": {
      "glyph": "◊",
      "color": "#c3506c"
    },
    "c": {
      "glyph": "◊",
      "color": "#5c5c5c"
    },
    "swift": {
      "glyph": "◊",
      "color": "#e25038"
    },
    "kt": {
      "glyph": "◊",
      "color": "#9170d2"
    },
    "json": {
      "glyph": "◊",
      "color": "#b3b33c"
    },
    "yml": {
      "glyph": "◊",
      "color": "#b3323c"
    },
    "toml": {
      "glyph": "◊",
      "color": "#92552c"
    },
    "css": {
      "glyph": "◊",
      "color": "#5c3c8c"
    },
    "scss": {
      "glyph": "◊",
      "color": "#aa4c7a"
    },
    "html": {
      "glyph": "◊",
      "color": "#ca5632"
    },
    "md": {
      "glyph": "◊",
      "color": "#4f83aa"
    },
    "sql": {
      "glyph": "◊",
      "color": "#ba7c1c"
    },
    "sh": {
      "glyph": "◊",
      "color": "#6aba5a"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "{ }",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "[ ]",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "( )",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "{ }",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "[ ]",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "( )",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "[ ]",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "[ ]",
      "color": "#519aba"
    },
    "js": {
      "glyph": "[ ]",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "[ ]",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "[ ]",
      "color": "#dea584"
    },
    "py": {
      "glyph": "[ ]",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "[ ]",
      "color": "#00add8"
    },
    "java": {
      "glyph": "[ ]",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "[ ]",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "[ ]",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "[ ]",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "[ ]",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "[ ]",
      "color": "#555555"
    },
    "swift": {
      "glyph": "[ ]",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "[ ]",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "[ ]",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "[ ]",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "[ ]",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "[ ]",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "[ ]",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "[ ]",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "[ ]",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "[ ]",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "[ ]",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "F",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "D",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "D",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "F",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "D",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "D",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "D",
      "color": "#4a90c2"
    },
    "tsx": {
      "glyph": "D",
      "color": "#4a90c2"
    },
    "js": {
      "glyph": "D",
      "color": "#c9b93a"
    },
    "jsx": {
      "glyph": "D",
      "color": "#c9b93a"
    },
    "rs": {
      "glyph": "D",
      "color": "#c08a6a"
    },
    "py": {
      "glyph": "D",
      "color": "#4a80a5"
    },
    "go": {
      "glyph": "D",
      "color": "#00a0c8"
    },
    "java": {
      "glyph": "D",
      "color": "#a56818"
    },
    "rb": {
      "glyph": "D",
      "color": "#b82f40"
    },
    "php": {
      "glyph": "D",
      "color": "#4a5a9a"
    },
    "cs": {
      "glyph": "D",
      "color": "#2f7a2f"
    },
    "cpp": {
      "glyph": "D",
      "color": "#c04a6a"
    },
    "c": {
      "glyph": "D",
      "color": "#5a5a5a"
    },
    "swift": {
      "glyph": "D",
      "color": "#e04a30"
    },
    "kt": {
      "glyph": "D",
      "color": "#8f6fd0"
    },
    "json": {
      "glyph": "D",
      "color": "#b0b038"
    },
    "yml": {
      "glyph": "D",
      "color": "#b03038"
    },
    "toml": {
      "glyph": "D",
      "color": "#905028"
    },
    "css": {
      "glyph": "D",
      "color": "#5a3a8a"
    },
    "scss": {
      "glyph": "D",
      "color": "#a84a78"
    },
    "html": {
      "glyph": "D",
      "color": "#c85430"
    },
    "md": {
      "glyph": "D",
      "color": "#4a80a8"
    },
    "sql": {
      "glyph": "D",
      "color": "#b87a18"
    },
    "sh": {
      "glyph": "D",
      "color": "#68b858"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "f",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "d",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "d",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "f",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "d",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "d",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "d",
      "color": "#5a8ab5"
    },
    "tsx": {
      "glyph": "d",
      "color": "#5a8ab5"
    },
    "js": {
      "glyph": "d",
      "color": "#c2b53a"
    },
    "jsx": {
      "glyph": "d",
      "color": "#c2b53a"
    },
    "rs": {
      "glyph": "d",
      "color": "#b08060"
    },
    "py": {
      "glyph": "d",
      "color": "#4a7595"
    },
    "go": {
      "glyph": "d",
      "color": "#0095bb"
    },
    "java": {
      "glyph": "d",
      "color": "#9a5a18"
    },
    "rb": {
      "glyph": "d",
      "color": "#a82f3a"
    },
    "php": {
      "glyph": "d",
      "color": "#48558a"
    },
    "cs": {
      "glyph": "d",
      "color": "#2f6f2f"
    },
    "cpp": {
      "glyph": "d",
      "color": "#b54560"
    },
    "c": {
      "glyph": "d",
      "color": "#5a5a5a"
    },
    "swift": {
      "glyph": "d",
      "color": "#d04530"
    },
    "kt": {
      "glyph": "d",
      "color": "#8560c0"
    },
    "json": {
      "glyph": "d",
      "color": "#a8a838"
    },
    "yml": {
      "glyph": "d",
      "color": "#a82f35"
    },
    "toml": {
      "glyph": "d",
      "color": "#885028"
    },
    "css": {
      "glyph": "d",
      "color": "#553a80"
    },
    "scss": {
      "glyph": "d",
      "color": "#9a4570"
    },
    "html": {
      "glyph": "d",
      "color": "#bb4f2f"
    },
    "md": {
      "glyph": "d",
      "color": "#4a7aa0"
    },
    "sql": {
      "glyph": "d",
      "color": "#aa7518"
    },
    "sh": {
      "glyph": "d",
      "color": "#60aa50"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "< >",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "< / >",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "< / >",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "< >",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "< / >",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "< / >",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "< / >",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "< / >",
      "color": "#519aba"
    },
    "js": {
      "glyph": "< / >",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "< / >",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "< / >",
      "color": "#dea584"
    },
    "py": {
      "glyph": "< / >",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "< / >",
      "color": "#00add8"
    },
    "java": {
      "glyph": "< / >",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "< / >",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "< / >",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "< / >",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "< / >",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "< / >",
      "color": "#555555"
    },
    "swift": {
      "glyph": "< / >",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "< / >",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "< / >",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "< / >",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "< / >",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "< / >",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "< / >",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "< / >",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "< / >",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "< / >",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "< / >",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "❉",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "❊",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "❋",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "❉",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "❊",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "❋",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "❊",
      "color": "#4f95c8"
    },
    "tsx": {
      "glyph": "❊",
      "color": "#4f95c8"
    },
    "js": {
      "glyph": "❊",
      "color": "#c8ba3a"
    },
    "jsx": {
      "glyph": "❊",
      "color": "#c8ba3a"
    },
    "rs": {
      "glyph": "❊",
      "color": "#c38a68"
    },
    "py": {
      "glyph": "❊",
      "color": "#4f83a8"
    },
    "go": {
      "glyph": "❊",
      "color": "#00a2ca"
    },
    "java": {
      "glyph": "❊",
      "color": "#aa6d1c"
    },
    "rb": {
      "glyph": "❊",
      "color": "#b83242"
    },
    "php": {
      "glyph": "❊",
      "color": "#4c5c9c"
    },
    "cs": {
      "glyph": "❊",
      "color": "#327d32"
    },
    "cpp": {
      "glyph": "❊",
      "color": "#c3506c"
    },
    "c": {
      "glyph": "❊",
      "color": "#5c5c5c"
    },
    "swift": {
      "glyph": "❊",
      "color": "#e25038"
    },
    "kt": {
      "glyph": "❊",
      "color": "#9170d2"
    },
    "json": {
      "glyph": "❊",
      "color": "#b3b33c"
    },
    "yml": {
      "glyph": "❊",
      "color": "#b3323c"
    },
    "toml": {
      "glyph": "❊",
      "color": "#92552c"
    },
    "css": {
      "glyph": "❊",
      "color": "#5c3c8c"
    },
    "scss": {
      "glyph": "❊",
      "color": "#aa4c7a"
    },
    "html": {
      "glyph": "❊",
      "color": "#ca5632"
    },
    "md": {
      "glyph": "❊",
      "color": "#4f83aa"
    },
    "sql": {
      "glyph": "❊",
      "color": "#ba7c1c"
    },
    "sh": {
      "glyph": "❊",
      "color": "#6aba5a"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "•",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "‣",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "⁃",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "•",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "‣",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "⁃",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "‣",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "‣",
      "color": "#519aba"
    },
    "js": {
      "glyph": "‣",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "‣",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "‣",
      "color": "#dea584"
    },
    "py": {
      "glyph": "‣",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "‣",
      "color": "#00add8"
    },
    "java": {
      "glyph": "‣",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "‣",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "‣",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "‣",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "‣",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "‣",
      "color": "#555555"
    },
    "swift": {
      "glyph": "‣",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "‣",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "‣",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "‣",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "‣",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "‣",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "‣",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "‣",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "‣",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "‣",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "‣",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◐",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◑",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◒",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◐",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◑",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◒",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◑",
      "color": "#5a9ac8"
    },
    "tsx": {
      "glyph": "◑",
      "color": "#5a9ac8"
    },
    "js": {
      "glyph": "◑",
      "color": "#cabd3a"
    },
    "jsx": {
      "glyph": "◑",
      "color": "#cabd3a"
    },
    "rs": {
      "glyph": "◑",
      "color": "#c48b68"
    },
    "py": {
      "glyph": "◑",
      "color": "#5085a8"
    },
    "go": {
      "glyph": "◑",
      "color": "#00a3cb"
    },
    "java": {
      "glyph": "◑",
      "color": "#ab6e1d"
    },
    "rb": {
      "glyph": "◑",
      "color": "#ba3343"
    },
    "php": {
      "glyph": "◑",
      "color": "#4e5e9e"
    },
    "cs": {
      "glyph": "◑",
      "color": "#337e33"
    },
    "cpp": {
      "glyph": "◑",
      "color": "#c4526e"
    },
    "c": {
      "glyph": "◑",
      "color": "#5e5e5e"
    },
    "swift": {
      "glyph": "◑",
      "color": "#e3523a"
    },
    "kt": {
      "glyph": "◑",
      "color": "#9373d4"
    },
    "json": {
      "glyph": "◑",
      "color": "#b6b63e"
    },
    "yml": {
      "glyph": "◑",
      "color": "#b6343e"
    },
    "toml": {
      "glyph": "◑",
      "color": "#94572e"
    },
    "css": {
      "glyph": "◑",
      "color": "#5e3e8e"
    },
    "scss": {
      "glyph": "◑",
      "color": "#aa4c7a"
    },
    "html": {
      "glyph": "◑",
      "color": "#cc5834"
    },
    "md": {
      "glyph": "◑",
      "color": "#5085ac"
    },
    "sql": {
      "glyph": "◑",
      "color": "#bc7e1e"
    },
    "sh": {
      "glyph": "◑",
      "color": "#6cbc5c"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "✚",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "✚",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "✛",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "✚",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "✚",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "✛",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "✚",
      "color": "#3178c6"
    },
    "tsx": {
      "glyph": "✚",
      "color": "#519aba"
    },
    "js": {
      "glyph": "✚",
      "color": "#f1e05a"
    },
    "jsx": {
      "glyph": "✚",
      "color": "#61dafb"
    },
    "rs": {
      "glyph": "✚",
      "color": "#dea584"
    },
    "py": {
      "glyph": "✚",
      "color": "#3572a5"
    },
    "go": {
      "glyph": "✚",
      "color": "#00add8"
    },
    "java": {
      "glyph": "✚",
      "color": "#b07219"
    },
    "rb": {
      "glyph": "✚",
      "color": "#cc342d"
    },
    "php": {
      "glyph": "✚",
      "color": "#4f5d95"
    },
    "cs": {
      "glyph": "✚",
      "color": "#178600"
    },
    "cpp": {
      "glyph": "✚",
      "color": "#f34b7d"
    },
    "c": {
      "glyph": "✚",
      "color": "#555555"
    },
    "swift": {
      "glyph": "✚",
      "color": "#f05138"
    },
    "kt": {
      "glyph": "✚",
      "color": "#a97bff"
    },
    "json": {
      "glyph": "✚",
      "color": "#cbcb41"
    },
    "yml": {
      "glyph": "✚",
      "color": "#cb171e"
    },
    "toml": {
      "glyph": "✚",
      "color": "#9c4221"
    },
    "css": {
      "glyph": "✚",
      "color": "#563d7c"
    },
    "scss": {
      "glyph": "✚",
      "color": "#c6538c"
    },
    "html": {
      "glyph": "✚",
      "color": "#e34c26"
    },
    "md": {
      "glyph": "✚",
      "color": "#519aba"
    },
    "sql": {
      "glyph": "✚",
      "color": "#e38c00"
    },
    "sh": {
      "glyph": "✚",
      "color": "#89e051"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "◧",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "◨",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "◩",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "◧",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "◨",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "◩",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "◨",
      "color": "#4a90c2"
    },
    "tsx": {
      "glyph": "◨",
      "color": "#4a90c2"
    },
    "js": {
      "glyph": "◨",
      "color": "#c9b93a"
    },
    "jsx": {
      "glyph": "◨",
      "color": "#c9b93a"
    },
    "rs": {
      "glyph": "◨",
      "color": "#c08a6a"
    },
    "py": {
      "glyph": "◨",
      "color": "#4a80a5"
    },
    "go": {
      "glyph": "◨",
      "color": "#00a0c8"
    },
    "java": {
      "glyph": "◨",
      "color": "#a56818"
    },
    "rb": {
      "glyph": "◨",
      "color": "#b82f40"
    },
    "php": {
      "glyph": "◨",
      "color": "#4a5a9a"
    },
    "cs": {
      "glyph": "◨",
      "color": "#2f7a2f"
    },
    "cpp": {
      "glyph": "◨",
      "color": "#c04a6a"
    },
    "c": {
      "glyph": "◨",
      "color": "#5a5a5a"
    },
    "swift": {
      "glyph": "◨",
      "color": "#e04a30"
    },
    "kt": {
      "glyph": "◨",
      "color": "#8f6fd0"
    },
    "json": {
      "glyph": "◨",
      "color": "#b0b038"
    },
    "yml": {
      "glyph": "◨",
      "color": "#b03038"
    },
    "toml": {
      "glyph": "◨",
      "color": "#905028"
    },
    "css": {
      "glyph": "◨",
      "color": "#5a3a8a"
    },
    "scss": {
      "glyph": "◨",
      "color": "#a84a78"
    },
    "html": {
      "glyph": "◨",
      "color": "#c85430"
    },
    "md": {
      "glyph": "◨",
      "color": "#4a80a8"
    },
    "sql": {
      "glyph": "◨",
      "color": "#b87a18"
    },
    "sh": {
      "glyph": "◨",
      "color": "#68b858"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
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
  "_komentar": "Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.",
  "file": {
    "glyph": "✳",
    "color": "var(--fg2)"
  },
  "folder": {
    "glyph": "✴",
    "color": "var(--accent)"
  },
  "folder-open": {
    "glyph": "✵",
    "color": "var(--accent)"
  },
  "icons": {
    "file": {
      "glyph": "✳",
      "color": "var(--fg2)"
    },
    "folder": {
      "glyph": "✴",
      "color": "var(--accent)"
    },
    "folder-open": {
      "glyph": "✵",
      "color": "var(--accent)"
    },
    "ts": {
      "glyph": "✴",
      "color": "#5f9ec5"
    },
    "tsx": {
      "glyph": "✴",
      "color": "#5f9ec5"
    },
    "js": {
      "glyph": "✴",
      "color": "#cfc040"
    },
    "jsx": {
      "glyph": "✴",
      "color": "#cfc040"
    },
    "rs": {
      "glyph": "✴",
      "color": "#c68f70"
    },
    "py": {
      "glyph": "✴",
      "color": "#5488aa"
    },
    "go": {
      "glyph": "✴",
      "color": "#00a8cf"
    },
    "java": {
      "glyph": "✴",
      "color": "#b07520"
    },
    "rb": {
      "glyph": "✴",
      "color": "#c03a48"
    },
    "php": {
      "glyph": "✴",
      "color": "#5464a4"
    },
    "cs": {
      "glyph": "✴",
      "color": "#3a833a"
    },
    "cpp": {
      "glyph": "✴",
      "color": "#c85873"
    },
    "c": {
      "glyph": "✴",
      "color": "#606060"
    },
    "swift": {
      "glyph": "✴",
      "color": "#e85840"
    },
    "kt": {
      "glyph": "✴",
      "color": "#9878d8"
    },
    "json": {
      "glyph": "✴",
      "color": "#bbbb42"
    },
    "yml": {
      "glyph": "✴",
      "color": "#bb3a42"
    },
    "toml": {
      "glyph": "✴",
      "color": "#9a5c32"
    },
    "css": {
      "glyph": "✴",
      "color": "#604090"
    },
    "scss": {
      "glyph": "✴",
      "color": "#b05280"
    },
    "html": {
      "glyph": "✴",
      "color": "#d05c38"
    },
    "md": {
      "glyph": "✴",
      "color": "#5488b0"
    },
    "sql": {
      "glyph": "✴",
      "color": "#c08222"
    },
    "sh": {
      "glyph": "✴",
      "color": "#72c062"
    }
  },
  "fileNames": {
    "package.json": "json",
    "tsconfig.json": "json",
    "zephyr-extension.json": "json",
    "Dockerfile": "sh",
    "docker-compose.yml": "yml",
    "Makefile": "sh",
    ".gitignore": "sh",
    "Cargo.toml": "toml",
    "README.md": "md",
    "LICENSE": "md"
  },
  "folderNames": {
    "src": "folder",
    "node_modules": "folder",
    "dist": "folder",
    "build": "folder",
    "test": "folder",
    "tests": "folder",
    "docs": "folder",
    "assets": "folder",
    "components": "folder",
    "lib": "folder",
    "public": "folder",
    "scripts": "folder",
    ".git": "folder",
    ".github": "folder",
    "target": "folder",
    "vendor": "folder"
  }
}"##;

/* ══ AKHIR IKON MARKETPLACE ══ */
