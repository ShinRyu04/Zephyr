# Laporan cakupan paket Bahasa/Grammar bawaan

Dihasilkan oleh `scripts/uji-bahasa-live.mjs` (mode statis, bawaan). Angka di
bawah adalah keluaran nyata `node scripts/uji-bahasa-live.mjs` — bukan perkiraan.

```
node scripts/uji-bahasa-live.mjs          # rekap + tabel + exit 0/1
node scripts/uji-bahasa-live.mjs --md     # tabel markdown ke stdout
node scripts/uji-bahasa-live.mjs --json   # dump JSON ke stdout
node scripts/uji-bahasa-live.mjs --live   # uji CDP (butuh app :9223)
```

Skrip ini READ-ONLY untuk `src/**` dan `src-tauri/**`.

---

## 1. Rekap angka

| ukuran | nilai |
|---|---|
| paket bahasa di katalog bawaan (`src-tauri/src/ext_bundled.rs`) | **88** |
| paket non-bahasa di katalog yang sama | 17 |
| kontribusi `languages` di `ext_bundled_extra.rs` | 0 |
| — EFEKTIF (mode-nya bisa dimuat & mengklaim ≥1 ekstensi baru) | **87 (98.9%)** |
| — NO-OP (terpasang, tidak mengubah apa pun) | **1 (1.1%)** |
| — GAGAL (mode disebut tapi tak bisa dimuat siapa pun) | **0 (0.0%)** |
| exit code | **0** |

Sumber kebenaran bahasa native yang dipakai untuk mencocokkan:

| sumber | isi |
|---|---|
| `src/lib/cmLegacyModes.ts` → `MODE_IMPORTER` | **103** mode legacy yang punya importer statis (dipakai lewat `MODE_TERSEDIA`) |
| `src/lib/lang.ts` → `BY_EXT` | 61 ekstensi → **28** bahasa native |
| `src/lib/lang.ts` → `BY_NAME` | 6 nama berkas |
| `src/lib/lang.ts` → mode legacy dipakai `build()` | `clike, lua, perl, properties, ruby, shell, swift, toml` |
| `src/lib/extLoader.ts` → `PAKET_DIIZINKAN` | `@codemirror/lang-{css,html,json,java,sql,xml,yaml}` |
| `package.json` | 13 paket `@codemirror/lang-*`; `@codemirror/legacy-modes` `^6.5.3` |

**Mode yatim (15):** mode yang ada di allow-list `MODE_IMPORTER` tetapi tidak
ditawarkan paket mana pun. Ini sisa 13 paket bahasa yang dibuang + mode yang
dipakai jalur native.
`asn1, asterisk, clike, css, go, javascript, lua, properties, rust, simple-mode, sql, swift, toml, ttcn-cfg, yaml`

---

## 2. TEMUAN UTAMA — paket bahasa **tidak** mengubah WARNA kode

Jawaban singkat: **memasang paket bahasa tidak mengubah palet warna.** Warna
kode sepenuhnya berasal dari token CSS `--syn-*` per tema, lewat **satu** style
highlight global. Yang bisa berubah saat paket dipasang hanyalah **tag mana**
yang dikenakan pada sebuah karakter (tokenisasi), sehingga karakter itu pindah
ke **slot warna yang sudah ada** — bukan warna baru, dan tidak berlaku untuk
ekstensi yang sudah ditangani bawaan.

Bukti kode:

**(a) Style highlight-nya global & tunggal** — dipasang sekali di array ekstensi
dasar editor, bukan per-bahasa:

`src/components/editor/CodeMirrorEditor.tsx:360-362`
```ts
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      zephyrHighlight,
      themeComp.current.of(editorTheme(themeId)),
```

**(b) Warnanya = CSS var, didefinisikan sekali untuk semua bahasa:**

`src/styles/editor-themes.ts:7-8`
```ts
const v = (name: string, fallback?: string) =>
  fallback ? `var(${name}, ${fallback})` : `var(${name})`;
```
`src/styles/editor-themes.ts:114-118`
```ts
export const zephyrHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword], color: v('--syntax-keyword') },
    { tag: [t.string, t.special(t.string), t.regexp], color: v('--syntax-string') },
    { tag: [t.number, t.bool, t.null], color: v('--syntax-number') },
```

**(c) `--syn-*` didefinisikan PER TEMA (19 tema × 11 token), lalu dijembatani
ke `--syntax-*`:**

`src/styles/tokens.css:124`
```css
  --syntax-keyword: var(--syn-keyword);
```
Definisi `--syn-keyword` per tema:
- `src/styles/theme.css:63` (`#ff7b72`), `:123` (`#ff8c42`)
- `src/styles/theme-light.css:36` (`#cf222e`)
- `src/styles/themes-extra.css:36,80,124,168,212,256,300,344,388,432,476,520,564,608,652` (15 tema)
- `src/styles/a11y.css:59` (`#ff9ea8`)

Total 19 tema, konsisten dengan `EDITOR_THEME_IDS = THEMES.map(...)` di
`src/styles/editor-themes.ts:159`.

**(d) Jalur pemuatan paket bahasa tidak pernah mengembalikan `HighlightStyle`:**

`src/lib/extLoader.ts:328-352` — `muatCmBahasa` hanya mengembalikan
`StreamLanguage.define(parser)` (jalur legacy) atau ekstensi `@codemirror/lang-*`
(jalur cmLang). Tidak ada `HighlightStyle`/`syntaxHighlighting` di sana, jadi
paket bahasa **tidak mungkin** menyuntikkan warna.

**Kesimpulan untuk pengguna:** paket bahasa mengubah *tokenisasi* (dari "plain"
menjadi keyword/string/comment/dst.), bukan *palet*. Karena itu berkas yang
sudah ditangani bawaan (mis. `.py`) tidak berubah warna sama sekali saat paket
Python dipasang — paketnya hanya menambah `.pyi`.

---

## 3. Tabel per paket (88 baris)

| paket | bahasa | mode | eks. baru | status | catatan |
|---|---|---|---|---|---|
| `apl` | APL | `legacy:apl` | .apl | **EFEKTIF** | menambah highlight untuk: .apl |
| `asciiarmor` | ASCII Armor | `legacy:asciiarmor` | .asc, .pgp | **EFEKTIF** | menambah highlight untuk: .asc, .pgp |
| `brainfuck` | Brainfuck | `legacy:brainfuck` | .bf, .b | **EFEKTIF** | menambah highlight untuk: .bf, .b |
| `clojure` | Clojure | `legacy:clojure` | .clj, .cljc, .cljs | **EFEKTIF** | menambah highlight untuk: .clj, .cljc, .cljs |
| `cmake` | CMake | `legacy:cmake` | .cmake | **EFEKTIF** | menambah highlight untuk: .cmake |
| `cobol` | COBOL | `legacy:cobol` | .cbl, .cob | **EFEKTIF** | menambah highlight untuk: .cbl, .cob |
| `coffeescript` | CoffeeScript | `legacy:coffeescript` | .coffee | **EFEKTIF** | menambah highlight untuk: .coffee |
| `commonlisp` | Common Lisp | `legacy:commonlisp` | .lisp, .lsp | **EFEKTIF** | menambah highlight untuk: .lisp, .lsp |
| `crystal` | Crystal | `legacy:crystal` | .cr | **EFEKTIF** | menambah highlight untuk: .cr |
| `cypher` | Cypher | `legacy:cypher` | .cyp, .cypher | **EFEKTIF** | menambah highlight untuk: .cyp, .cypher |
| `d` | D | `legacy:d` | .d | **EFEKTIF** | menambah highlight untuk: .d |
| `diff` | Diff | `legacy:diff` | .diff, .patch, .rej | **EFEKTIF** | menambah highlight untuk: .diff, .patch, .rej |
| `dockerfile` | Dockerfile | `legacy:dockerfile` | .dockerfile | **EFEKTIF** | menambah highlight untuk: .dockerfile |
| `dtd` | DTD | `legacy:dtd` | .dtd | **EFEKTIF** | menambah highlight untuk: .dtd |
| `dylan` | Dylan | `legacy:dylan` | .dylan | **EFEKTIF** | menambah highlight untuk: .dylan |
| `ebnf` | EBNF | `legacy:ebnf` | .ebnf | **EFEKTIF** | menambah highlight untuk: .ebnf |
| `ecl` | ECL | `legacy:ecl` | .ecl | **EFEKTIF** | menambah highlight untuk: .ecl |
| `eiffel` | Eiffel | `legacy:eiffel` | .e | **EFEKTIF** | menambah highlight untuk: .e |
| `elm` | Elm | `legacy:elm` | .elm | **EFEKTIF** | menambah highlight untuk: .elm |
| `erlang` | Erlang | `legacy:erlang` | .erl, .hrl | **EFEKTIF** | menambah highlight untuk: .erl, .hrl |
| `factor` | Factor | `legacy:factor` | .factor | **EFEKTIF** | menambah highlight untuk: .factor |
| `fcl` | FCL | `legacy:fcl` | .fcl | **EFEKTIF** | menambah highlight untuk: .fcl |
| `forth` | Forth | `legacy:forth` | .fs, .fth | **EFEKTIF** | menambah highlight untuk: .fs, .fth |
| `fortran` | Fortran | `legacy:fortran` | .f, .f90, .f95, .f03, .for | **EFEKTIF** | menambah highlight untuk: .f, .f90, .f95, .f03, .for |
| `gas` | Assembly (GAS) | `legacy:gas` | .s, .asm | **EFEKTIF** | menambah highlight untuk: .s, .asm |
| `gherkin` | Gherkin | `legacy:gherkin` | .feature | **EFEKTIF** | menambah highlight untuk: .feature |
| `groovy` | Groovy | `legacy:groovy` | .groovy, .gradle, .gvy | **EFEKTIF** | menambah highlight untuk: .groovy, .gradle, .gvy |
| `haskell` | Haskell | `legacy:haskell` | .hs, .lhs | **EFEKTIF** | menambah highlight untuk: .hs, .lhs |
| `haxe` | Haxe | `legacy:haxe` | .hx | **EFEKTIF** | menambah highlight untuk: .hx |
| `http` | HTTP | `legacy:http` | .http, .rest | **EFEKTIF** | menambah highlight untuk: .http, .rest |
| `idl` | IDL | `legacy:idl` | .idl | **EFEKTIF** | menambah highlight untuk: .idl |
| `jinja2` | Jinja2 | `legacy:jinja2` | .jinja, .j2, .jinja2 | **EFEKTIF** | menambah highlight untuk: .jinja, .j2, .jinja2 |
| `julia` | Julia | `legacy:julia` | .jl | **EFEKTIF** | menambah highlight untuk: .jl |
| `livescript` | LiveScript | `legacy:livescript` | .ls | **EFEKTIF** | menambah highlight untuk: .ls |
| `mathematica` | Wolfram | `legacy:mathematica` | .m, .wl, .wls | **EFEKTIF** | menambah highlight untuk: .m, .wl, .wls |
| `mbox` | Mbox | `legacy:mbox` | .mbox | **EFEKTIF** | menambah highlight untuk: .mbox |
| `mirc` | mIRC | `legacy:mirc` | .mrc | **EFEKTIF** | menambah highlight untuk: .mrc |
| `mllike` | OCaml / SML | `legacy:mllike` | .ml, .mli, .sml | **EFEKTIF** | menambah highlight untuk: .ml, .mli, .sml |
| `modelica` | Modelica | `legacy:modelica` | .mo | **EFEKTIF** | menambah highlight untuk: .mo |
| `mscgen` | MscGen | `legacy:mscgen` | .msc | **EFEKTIF** | menambah highlight untuk: .msc |
| `mumps` | MUMPS | `legacy:mumps` | .mumps, .roc | **EFEKTIF** | menambah highlight untuk: .mumps, .roc |
| `nginx` | nginx Config | `legacy:nginx` | .nginx | **EFEKTIF** | menambah highlight untuk: .nginx |
| `nsis` | NSIS | `legacy:nsis` | .nsi, .nsh | **EFEKTIF** | menambah highlight untuk: .nsi, .nsh |
| `ntriples` | N-Triples | `legacy:ntriples` | .nt | **EFEKTIF** | menambah highlight untuk: .nt |
| `octave` | MATLAB / Octave | `legacy:octave` | .octave | **EFEKTIF** | menambah highlight untuk: .octave |
| `oz` | Oz | `legacy:oz` | .oz | **EFEKTIF** | menambah highlight untuk: .oz |
| `pascal` | Pascal | `legacy:pascal` | .pas, .pp, .dpr, .lpr | **EFEKTIF** | menambah highlight untuk: .pas, .pp, .dpr, .lpr |
| `pegjs` | PEG.js | `legacy:pegjs` | .pegjs, .peg | **EFEKTIF** | menambah highlight untuk: .pegjs, .peg |
| `perl` | Perl | `legacy:perl` | .t, .pod | **EFEKTIF** | menambah highlight untuk: .t, .pod — CATATAN: bahasa "perl" sudah didukung bawaan — mode "perl" juga dipakai bahasa bawaan |
| `pig` | Pig | `legacy:pig` | .pig | **EFEKTIF** | menambah highlight untuk: .pig |
| `powershell` | PowerShell | `legacy:powershell` | .psm1, .psd1 | **EFEKTIF** | menambah highlight untuk: .psm1, .psd1 |
| `protobuf` | Protocol Buffers | `legacy:protobuf` | .proto | **EFEKTIF** | menambah highlight untuk: .proto |
| `pug` | Pug | `legacy:pug` | .pug, .jade | **EFEKTIF** | menambah highlight untuk: .pug, .jade |
| `puppet` | Puppet | `legacy:puppet` | — | **NO-OP** | ekstensi sudah dipegang paket lain (pp<:zephyr.lang-pascal) |
| `python` | Python | `legacy:python` | .pyi | **EFEKTIF** | menambah highlight untuk: .pyi — CATATAN: bahasa "python" sudah didukung bawaan |
| `q` | q/Kdb+ | `legacy:q` | .q | **EFEKTIF** | menambah highlight untuk: .q |
| `r` | R | `legacy:r` | .r, .rmd | **EFEKTIF** | menambah highlight untuk: .r, .rmd |
| `rpm` | RPM Spec | `legacy:rpm` | .spec | **EFEKTIF** | menambah highlight untuk: .spec |
| `ruby` | Ruby | `legacy:ruby` | .erb, .gemspec | **EFEKTIF** | menambah highlight untuk: .erb, .gemspec — CATATAN: bahasa "ruby" sudah didukung bawaan — mode "ruby" juga dipakai bahasa bawaan |
| `sas` | sas | `legacy:sas` | .sas | **EFEKTIF** | menambah highlight untuk: .sas |
| `sass` | Sass | `legacy:sass` | .sass | **EFEKTIF** | menambah highlight untuk: .sass |
| `scheme` | Scheme | `legacy:scheme` | .scm, .ss, .rkt | **EFEKTIF** | menambah highlight untuk: .scm, .ss, .rkt |
| `shell` | Shell / Bash | `legacy:shell` | .fish | **EFEKTIF** | menambah highlight untuk: .fish — CATATAN: bahasa "shell" sudah didukung bawaan — mode "shell" juga dipakai bahasa bawaan |
| `sieve` | Sieve | `legacy:sieve` | .sieve | **EFEKTIF** | menambah highlight untuk: .sieve |
| `smalltalk` | Smalltalk | `legacy:smalltalk` | .st, .sq | **EFEKTIF** | menambah highlight untuk: .st, .sq |
| `solr` | Solr | `legacy:solr` | .solr | **EFEKTIF** | menambah highlight untuk: .solr |
| `sparql` | SPARQL | `legacy:sparql` | .rq, .sparql | **EFEKTIF** | menambah highlight untuk: .rq, .sparql |
| `spreadsheet` | CSV / TSV | `legacy:spreadsheet` | .csv, .tsv, .tab | **EFEKTIF** | menambah highlight untuk: .csv, .tsv, .tab |
| `stex` | LaTeX | `legacy:stex` | .tex, .ltx, .sty | **EFEKTIF** | menambah highlight untuk: .tex, .ltx, .sty |
| `stylus` | Stylus | `legacy:stylus` | .styl | **EFEKTIF** | menambah highlight untuk: .styl |
| `tcl` | Tcl | `legacy:tcl` | .tcl, .tk | **EFEKTIF** | menambah highlight untuk: .tcl, .tk |
| `textile` | Textile | `legacy:textile` | .textile | **EFEKTIF** | menambah highlight untuk: .textile |
| `tiddlywiki` | TiddlyWiki | `legacy:tiddlywiki` | .tid, .wiki | **EFEKTIF** | menambah highlight untuk: .tid, .wiki |
| `tiki` | Tiki | `legacy:tiki` | .tiki | **EFEKTIF** | menambah highlight untuk: .tiki |
| `troff` | troff | `legacy:troff` | .roff, .man, .1, .groff | **EFEKTIF** | menambah highlight untuk: .roff, .man, .1, .groff |
| `ttcn` | TTCN-3 | `legacy:ttcn` | .ttcn, .ttcn3 | **EFEKTIF** | menambah highlight untuk: .ttcn, .ttcn3 |
| `turtle` | Turtle | `legacy:turtle` | .ttl, .turtle | **EFEKTIF** | menambah highlight untuk: .ttl, .turtle |
| `vb` | Visual Basic | `legacy:vb` | .vb, .vbs | **EFEKTIF** | menambah highlight untuk: .vb, .vbs |
| `vbscript` | VBScript | `legacy:vbscript` | .vbe | **EFEKTIF** | menambah highlight untuk: .vbe |
| `velocity` | Velocity | `legacy:velocity` | .vm, .vtl, .vsl | **EFEKTIF** | menambah highlight untuk: .vm, .vtl, .vsl |
| `verilog` | Verilog | `legacy:verilog` | .v, .sv, .svh, .vh | **EFEKTIF** | menambah highlight untuk: .v, .sv, .svh, .vh |
| `vhdl` | VHDL | `legacy:vhdl` | .vhd, .vhdl | **EFEKTIF** | menambah highlight untuk: .vhd, .vhdl |
| `wast` | WebAssembly Text | `legacy:wast` | .wast, .wat | **EFEKTIF** | menambah highlight untuk: .wast, .wat |
| `webidl` | Web IDL | `legacy:webidl` | .webidl | **EFEKTIF** | menambah highlight untuk: .webidl |
| `xml` | XML / HTML | `legacy:xml` | .xsd, .xsl, .xhtml | **EFEKTIF** | menambah highlight untuk: .xsd, .xsl, .xhtml — CATATAN: bahasa "xml" sudah didukung bawaan |
| `xquery` | XQuery | `legacy:xquery` | .xq, .xquery, .xql | **EFEKTIF** | menambah highlight untuk: .xq, .xquery, .xql |
| `yacas` | Yacas | `legacy:yacas` | .ys | **EFEKTIF** | menambah highlight untuk: .ys |
| `z80` | Z80 Assembly | `legacy:z80` | .z80 | **EFEKTIF** | menambah highlight untuk: .z80 |

Catatan "eks. baru" = ekstensi yang benar-benar baru dimiliki paket ini, setelah
ekstensi native dipangkas dan ekstensi yang sudah diklaim paket lain (urutan
`PAKET_BAHASA`) dibuang. Contoh dedupe yang terlihat di tabel:

- `python`: `.py/.pyw` sudah native → sisa `.pyi`
- `shell`: `.sh/.bash/.zsh` sudah native → sisa `.fish`
- `perl`: `.pl/.pm` sudah native → sisa `.t, .pod`
- `ruby`: `.rb` sudah native → sisa `.erb, .gemspec`
- `turtle`: `.nt` sudah diklaim `ntriples` → sisa `.ttl, .turtle`
- `octave`: `.m` sudah diklaim `mathematica` → sisa `.octave`
- `z80`: `.asm` sudah diklaim `gas` → sisa `.z80`
- `vbscript`: `.vbs` sudah diklaim `vb` → sisa `.vbe`

---

## 4. Paket yang sebaiknya **tidak** ditawarkan lagi

**NO-OP murni (1 paket):**

- **`puppet`** — satu-satunya ekstensinya `.pp` sudah diklaim paket `pascal`
  (dimuat lebih dulu di `PAKET_BAHASA`). Memasangnya tidak menambah satu pun
  ekstensi baru. → kandidat kuat untuk dihapus dari katalog atau diberi label.

**Sudah punya dukungan native (5 paket)** — paketnya masih EFEKTIF untuk
ekstensi sisa, tetapi bahasa/mode-nya sudah ada bawaan, jadi tawaran "tambah
bahasa X" itu menyesatkan:

| paket | bahasa native | mode juga dipakai native | sisa nilai |
|---|---|---|---|
| `perl` | ya | ya | hanya `.t, .pod` |
| `ruby` | ya | ya | hanya `.erb, .gemspec` |
| `shell` | ya | ya | hanya `.fish` |
| `python` | ya | — | hanya `.pyi` |
| `xml` | ya | — | hanya `.xsd, .xsl, .xhtml` |

---

## 5. Usulan kalimat UI

Tiga kelas pesan, bukan dua:

1. **EFEKTIF dengan ekstensi sisa yang jelas** → kalimat biasa:
   `Tambah dukungan <bahasa> untuk <ekstensi>.`

2. **Bahasa/mode sudah native** (`perl`, `ruby`, `shell`, `python`, `xml`) →
   **"sudah didukung bawaan"**:
   `Bahasa <X> sudah didukung bawaan. Paket ini hanya menambahkan
   <ekstensi sisa> (mis. .pyi).`
   Alasan: memasangnya tidak mengubah warna berkas `<X>` yang sudah ada — hanya
   mengenali ekstensi ekstra.

3. **NO-OP / TextMate / grammar tak termuat** → **"terpasang tetapi belum ada
   efek"**. Untuk `puppet`:
   `Semua ekstensi paket ini (.pp) sudah ditangani paket lain. Terpasang,
   tetapi tidak menambah apa pun.`

Untuk TextMate (`contributes.grammars`), kalimatnya sudah disediakan kode —
`src/lib/extLoader.ts:48-51`:
> A TextMate grammar pack (`contributes.grammars`) installs, appears in the
> list, and changes nothing: highlighting comes from the bundled CodeMirror
> languages, and there is no TextMate engine. Saying so at load time is the
> difference between "this pack is broken" and "this pack is not supported".

Dan di `src/lib/extLoader.ts:490-494` komentar yang sama untuk `grammars`.
Katalog bahasa bawaan saat ini **tidak** memakai `contributes.grammars`
(0 kejadian) — semuanya `legacyMode` — jadi kelas ini belum terpakai, tetapi
jalurnya sudah ada.

---

## 6. Catatan jujur — apa yang belum bisa dipastikan tanpa menjalankan app

- Skrip ini **statis**. Label **EFEKTIF** berarti: mode-nya ada di allow-list
  `MODE_IMPORTER` (`grammarTersedia()` menerimanya di
  `src/lib/extLoader.ts:323-326`) **dan** paketnya mengklaim ≥1 ekstensi yang
  belum ada pemiliknya. Itu bukti terkuat yang bisa didapat tanpa GUI —
  **bukan** bukti bahwa pixel-nya benar-benar berwarna saat dijalankan.
- Verifikasi empiris satu-satunya adalah `--live` (CDP :9223): memasang
  `zephyr.lang-mirc`, membuka berkas `.mrc`, dan membandingkan jumlah token
  sebelum/sesudah. **Belum dijalankan di sini** (aplikasi tidak boleh distart).
- Header uji `--live` yang lama menyebut jalur legacy "gagal senyap" karena
  Vite tak bisa me-rewrite `import('@codemirror/legacy-modes/mode/${...}')`.
  Itu **kekhawatiran sebelum `cmLegacyModes.ts` ada**: sekarang importer-nya
  literal per-mode (`MODE_IMPORTER`), jadi Vite bisa menganalisisnya statis.
  Klaim "gagal senyap" harus dianggap **basi** sampai `--live` membuktikannya —
  baik arahnya.
- Tidak ada satu pun paket bermode hantu: 0 GAGAL. 15 mode yatim di
  `MODE_IMPORTER` memang tak dipakai paket, tetapi itu tidak membuat paket
  gagal — hanya berarti mode itu sisa (atau dipakai jalur native).
- Angka 98.9% EFEKTIF jangan dibaca sebagai "semua bekerja sempurna": ia
  mengukur *kelayakan pemuatan*, bukan *kualitas tokenisasi*.
