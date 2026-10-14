# Laporan: dukungan bahasa APA ADANYA & paket bahasa NO-OP

Item: **ZEPH-LABEL-SUDAH-DIDUKUNG** + **ZEPH-BAHASA-NOOP-PUPPET**.
Repo: `D:/Zephyr`, branch `feat/ai-panel-vscode-layout`. Tanggal: 2026-10-14.
Harness (berkas BARU milik lane ini): `scripts/uji-label-bahasa.mjs`, `scripts/uji-bahasa-noop-puppet.mjs`.

## Aturan yang dipatuhi (jujur)

- **Tanpa** `git add` / `git commit`.
- **Tanpa wildcard** di `scripts/` (semua perintah menunjuk berkas/lintasan eksplisit).
- **Tidak menyentuh** berkas hasil generator (`src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts`).
- **Tidak menjalankan** harness CDP (`:9223`) — tidak ada lane lain yang terganggu.
- `src/**` dan `src-tauri/**` **READ-ONLY**: hanya dibaca. Yang ditulis lane ini hanya `scripts/uji-*.mjs`, `docs/LAPORAN-*.md`, `docs/USULAN-*.md`.
- Semua klaim di bawah menunjuk **berkas + nomor baris nyata**, dibaca saat harness jalan (bukan dikunci di kode).

## 1. Rumah deklarasi kontribusi bahasa (jawaban pertanyaan "di mana?")

| Peran | Berkas | Baris nyata |
|---|---|---|
| Manifest paket bahasa (id, ekstensi, `legacyMode`) | `src-tauri/src/ext_bundled.rs` | `LANG_*` per paket, mis. `LANG_PERL` **:275**, `LANG_PYTHON` **:281**, `LANG_RUBY` **:285**, `LANG_SHELL` **:289**, `LANG_XML` **:311**, `LANG_PASCAL` **:273**, `LANG_PUPPET` **:280**, `LANG_MIRC` **:263** |
| Tabel metadata katalog (nama, deskripsi, ikon) | `src-tauri/src/ext_bundled.rs` | `const META_BAHASA` **:316** (mis. `zephyr.lang-perl` di **:492**) |
| **Urutan** paket (siapa lebih dulu menang) | `src-tauri/src/ext_bundled.rs` | blok `PAKET_BAHASA`, mis. `("zephyr.lang-perl", &[("zephyr-extension.json", LANG_PERL)])` **:1079** |
| **Bahasa bawaan** (peta ekstensi) | `src/lib/lang.ts` | `const BY_EXT` **:6** (61 kunci), `const BY_NAME` **:71**, `detectLang()` **:81-87**, `export const LANG_LABEL` **:121-150** |
| **Aturan presedensi** (bawaan menang; paket hanya mengisi sisa) | `src/lib/lang.ts` | `if (detectLang(nameOrPath) !== 'plain') return null;` **:111** |
| Grammar bawaan yang dipasang tanpa paket | `src/lib/lang.ts` | `build()` — mis. `case 'perl':` **:266** → `import('@codemirror/legacy-modes/mode/perl')` **:268** |
| Allow-list mode legacy CodeMirror 5 | `src/lib/cmLegacyModes.ts` | `MODE_IMPORTER` (103 mode), mis. `'perl'` **:70** |
| Gerbang loader (mode yang boleh dimuat) | `src/lib/extLoader.ts` | `PAKET_DIIZINKAN` (7 `cmLang`), `muatCmBahasa`, catatan cabang TextMate **:491-495** |
| **Teks UI "sudah didukung bawaan" / "NO-OP"** | `src/lib/labelPaket.ts` + `src/components/extensions/bahasaTerpasang.ts` | lihat §5 |

## 2. Vonis per bahasa (klaim item: paket hanya menambah EKSTENSI SISA)

Untuk kelima bahasa ini **bahasanya sudah ada bawaan** (`LANG_LABEL` + `BY_EXT` + `build()` di `src/lib/lang.ts`); paket katalognya **tidak memperkenalkan bahasa baru**, ia hanya mengklaim akhiran yang belum diklaim siapa pun.

| Bahasa | Paket (deklarasi) | Ekstensi diklaim paket | Mode paket | Bahasa bawaan: `LANG_LABEL` | Ekstensi bawaan bahasa | **Ekstensi sisa** (satu-satunya yang benar-benar ditambah) | Vonis |
|---|---|---|---|---|---|---|---|
| Perl | `zephyr.lang-perl` — `ext_bundled.rs:275` | `.t`, `.pod` | `legacyMode: "perl"` | `lang.ts:145` (`perl: 'Perl',`) | `lang.ts:60-62` (`.perl`, `.pl`, `.pm`) | `.t`, `.pod` | **BAHASA-BAWAAN + EKSTENSI-SISA** |
| Python | `zephyr.lang-python` — `ext_bundled.rs:281` | `.pyi` | `legacyMode: "python"` | `lang.ts:130` (`python: 'Python',`) | `lang.ts:27-28` (`.py`, `.pyw`) | `.pyi` | **BAHASA-BAWAAN + EKSTENSI-SISA** |
| Ruby | `zephyr.lang-ruby` — `ext_bundled.rs:285` | `.erb`, `.gemspec` | `legacyMode: "ruby"` | `lang.ts:143` (`ruby: 'Ruby',`) | `lang.ts:58` (`.rb`) | `.erb`, `.gemspec` | **BAHASA-BAWAAN + EKSTENSI-SISA** |
| Shell | `zephyr.lang-shell` — `ext_bundled.rs:289` | `.fish` | `legacyMode: "shell"` | `lang.ts:140` (`shell: 'Shell',`) | `lang.ts:45-50` (`.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`, `.cmd`) | `.fish` | **BAHASA-BAWAAN + EKSTENSI-SISA** |
| XML | `zephyr.lang-xml` — `ext_bundled.rs:311` | `.xsd`, `.xsl`, `.xhtml` | `legacyMode: "xml"` | `lang.ts:136` (`xml: 'XML',`) | `lang.ts:35-36` (`.xml`, `.svg`) | `.xsd`, `.xsl`, `.xhtml` | **BAHASA-BAWAAN + EKSTENSI-SISA** |

Bukti tambahan bahwa mode paket **duplikat** (bukan kemampuan baru): untuk `perl`, mode paket `'perl'` (`cmLegacyModes.ts:70`) menunjuk **berkas impor yang sama persis** dengan yang sudah dipakai `build()` bawaan (`lang.ts:268`) — jadi sekalipun mode paket dimuat, hasil highlight-nya identik dengan bawaan.

Konsekuensi untuk UI: kartu kelima paket ini **tidak boleh** berbunyi seolah paket yang menambahkan bahasanya. Teks yang benar: "sudah didukung bawaan — <Bahasa> sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa <daftar>" (persis yang sudah ditulis di `src/lib/labelPaket.ts`, lihat §5).

## 3. Paket NO-OP / PUPPET

| Paket | Deklarasi | Ekstensi diklaim | Kenapa no-op | Vonis |
|---|---|---|---|---|
| `zephyr.lang-puppet` | `ext_bundled.rs:280` (`legacyMode: "puppet"`) | `.pp` | `.pp` **sudah dipegang** `zephyr.lang-pascal` (`ext_bundled.rs:273`, `extensions: [".pas", ".pp", ".dpr", ".lpr"]`) yang berada **lebih dulu** di urutan `PAKET_BAHASA`; aturan `lang.ts:111` + `lang.ts` `extLangUntuk` = "yang pertama menang". Maka paket puppet tidak pernah mengubah satu berkas pun. | **NO-OP / PUPPET** |
| `zephyr.lang-pascal` | `ext_bundled.rs:273` | `.pas`, `.pp`, `.dpr`, `.lpr` | — (pemilik `.pp`) | EFEKTIF |
| `zephyr.lang-mirc` | `ext_bundled.rs:263` (`legacyMode: "mirc"`) | `.mrc` | `.mrc` tidak ada di `BY_EXT` dan tidak direbut paket lain | EFEKTIF |

**Uji negatif (inti pembuktian no-op).** Kalau `zephyr.lang-pascal` dimatikan, yang hilang adalah `.pas`, `.dpr`, `.lpr` — **`.pp` tidak hilang**, karena pemiliknya langsung jatuh ke `zephyr.lang-puppet`. Artinya: selama pascal ada, puppet benar-benar tidak menambah apa pun; ia hanya "bayangan" yang baru terpakai kalau pascal dilepas. Sebaliknya, mematikan `zephyr.lang-puppet` **tidak menghilangkan satu ekstensi pun** (0 perubahan) — inilah bentuk paling telak dari "no-op terbukti".

## 4. Bukti mentah: keluaran NYATA kedua harness (apa adanya)

### 4.1 `node scripts/uji-label-bahasa.mjs`

```text
== uji label bahasa: apakah paket menambah BAHASA atau hanya EKSTENSI SISA? ==
   sumber: src-tauri/src/ext_bundled.rs | src/lib/lang.ts | src/lib/cmLegacyModes.ts | src/lib/extLoader.ts
   BY_EXT=61 ekstensi bawaan | MODE_IMPORTER=103 mode | PAKET_DIIZINKAN=7 cmLang

   [LULUS] perl/K1-paket-ada — paket zephyr.lang-perl dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA
           bukti ext_bundled.rs:275 :: const LANG_PERL: &str = r##"{"id":"zephyr.lang-perl","name":"Bahasa Perl","publisher":"zephyr","version":"1.0.0","descri
           bukti ext_bundled.rs:1079 :: ("zephyr.lang-perl", &[("zephyr-extension.json", LANG_PERL)]),
   [LULUS] perl/K2-bahasa-sudah-bawaan — bahasa "perl" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru
           bukti lang.ts:145 :: perl: 'Perl',
   [LULUS] perl/K3-grammar-bawaan-ada — build() (lang.ts) memasang grammar nyata untuk "perl": bahasa ini jalan tanpa paket apa pun
           bukti lang.ts:266 :: case 'perl': {
           bukti lang.ts:268 :: const { perl } = await import('@codemirror/legacy-modes/mode/perl');
   [LULUS] perl/K4-paket-duplikat-mode — paket memakai mode legacy "perl" — SAMA PERSIS dengan yang sudah dipakai build() bawaan (duplikat)
           bukti cmLegacyModes.ts:70 :: 'perl': () => import('@codemirror/legacy-modes/mode/perl'),
           bukti lang.ts:268 :: const { perl } = await import('@codemirror/legacy-modes/mode/perl');
   [LULUS] perl/K5-ekstensi-sisa-saja — semua ekstensi paket (.t, .pod) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa
           bukti ext_bundled.rs:275 :: const LANG_PERL: &str = r##"{"id":"zephyr.lang-perl","name":"Bahasa Perl","publisher":"zephyr","version":"1.0.0","descri
   [LULUS] perl/K6-terjangkau-tanpa-paket — "perl" sudah terjangkau lewat ekstensi bawaan .perl, .pl, .pm — paket tak diperlukan untuk bahasanya
           bukti lang.ts:60 :: perl: 'perl',
           bukti lang.ts:61 :: pl: 'perl',
           bukti lang.ts:62 :: pm: 'perl',
   [LULUS] python/K1-paket-ada — paket zephyr.lang-python dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA
           bukti ext_bundled.rs:281 :: const LANG_PYTHON: &str = r##"{"id":"zephyr.lang-python","name":"Bahasa Python","publisher":"zephyr","version":"1.0.0","
           bukti ext_bundled.rs:1095 :: "zephyr.lang-python",
   [LULUS] python/K2-bahasa-sudah-bawaan — bahasa "python" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru
           bukti lang.ts:130 :: python: 'Python',
   [LULUS] python/K3-grammar-bawaan-ada — build() (lang.ts) memasang grammar nyata untuk "python": bahasa ini jalan tanpa paket apa pun
           bukti lang.ts:224 :: case 'python':
           bukti lang.ts:225 :: return [(await import('@codemirror/lang-python')).python()];
   [LULUS] python/K4-paket-duplikat-mode — paket memakai mode legacy "python" (StreamLanguage) sementara bawaan memakai paket CM6 nyata @codemirror/lang-python — paket lebih lemah, bukan penambah bahasa
           bukti cmLegacyModes.ts:77 :: 'python': () => import('@codemirror/legacy-modes/mode/python'),
           bukti lang.ts:225 :: return [(await import('@codemirror/lang-python')).python()];
   [LULUS] python/K5-ekstensi-sisa-saja — semua ekstensi paket (.pyi) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa
           bukti ext_bundled.rs:281 :: const LANG_PYTHON: &str = r##"{"id":"zephyr.lang-python","name":"Bahasa Python","publisher":"zephyr","version":"1.0.0","
   [LULUS] python/K6-terjangkau-tanpa-paket — "python" sudah terjangkau lewat ekstensi bawaan .py, .pyw — paket tak diperlukan untuk bahasanya
           bukti lang.ts:27 :: py: 'python',
           bukti lang.ts:28 :: pyw: 'python',
   [LULUS] ruby/K1-paket-ada — paket zephyr.lang-ruby dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA
           bukti ext_bundled.rs:285 :: const LANG_RUBY: &str = r##"{"id":"zephyr.lang-ruby","name":"Bahasa Ruby","publisher":"zephyr","version":"1.0.0","descri
           bukti ext_bundled.rs:1101 :: ("zephyr.lang-ruby", &[("zephyr-extension.json", LANG_RUBY)]),
   [LULUS] ruby/K2-bahasa-sudah-bawaan — bahasa "ruby" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru
           bukti lang.ts:143 :: ruby: 'Ruby',
   [LULUS] ruby/K3-grammar-bawaan-ada — build() (lang.ts) memasang grammar nyata untuk "ruby": bahasa ini jalan tanpa paket apa pun
           bukti lang.ts:256 :: case 'ruby': {
           bukti lang.ts:258 :: const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
   [LULUS] ruby/K4-paket-duplikat-mode — paket memakai mode legacy "ruby" — SAMA PERSIS dengan yang sudah dipakai build() bawaan (duplikat)
           bukti cmLegacyModes.ts:81 :: 'ruby': () => import('@codemirror/legacy-modes/mode/ruby'),
           bukti lang.ts:258 :: const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
   [LULUS] ruby/K5-ekstensi-sisa-saja — semua ekstensi paket (.erb, .gemspec) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa
           bukti ext_bundled.rs:285 :: const LANG_RUBY: &str = r##"{"id":"zephyr.lang-ruby","name":"Bahasa Ruby","publisher":"zephyr","version":"1.0.0","descri
   [LULUS] ruby/K6-terjangkau-tanpa-paket — "ruby" sudah terjangkau lewat ekstensi bawaan .rb — paket tak diperlukan untuk bahasanya
           bukti lang.ts:58 :: rb: 'ruby',
   [LULUS] shell/K1-paket-ada — paket zephyr.lang-shell dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA
           bukti ext_bundled.rs:289 :: const LANG_SHELL: &str = r##"{"id":"zephyr.lang-shell","name":"Bahasa Shell / Bash","publisher":"zephyr","version":"1.0.
           bukti ext_bundled.rs:1109 :: "zephyr.lang-shell",
   [LULUS] shell/K2-bahasa-sudah-bawaan — bahasa "shell" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru
           bukti lang.ts:140 :: shell: 'Shell',
   [LULUS] shell/K3-grammar-bawaan-ada — build() (lang.ts) memasang grammar nyata untuk "shell": bahasa ini jalan tanpa paket apa pun
           bukti lang.ts:246 :: case 'shell': {
           bukti lang.ts:248 :: const { shell } = await import('@codemirror/legacy-modes/mode/shell');
   [LULUS] shell/K4-paket-duplikat-mode — paket memakai mode legacy "shell" — SAMA PERSIS dengan yang sudah dipakai build() bawaan (duplikat)
           bukti cmLegacyModes.ts:86 :: 'shell': () => import('@codemirror/legacy-modes/mode/shell'),
           bukti lang.ts:248 :: const { shell } = await import('@codemirror/legacy-modes/mode/shell');
   [LULUS] shell/K5-ekstensi-sisa-saja — semua ekstensi paket (.fish) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa
           bukti ext_bundled.rs:289 :: const LANG_SHELL: &str = r##"{"id":"zephyr.lang-shell","name":"Bahasa Shell / Bash","publisher":"zephyr","version":"1.0.
   [LULUS] shell/K6-terjangkau-tanpa-paket — "shell" sudah terjangkau lewat ekstensi bawaan .sh, .bash, .zsh, .ps1, .bat, .cmd — paket tak diperlukan untuk bahasanya
           bukti lang.ts:45 :: sh: 'shell',
           bukti lang.ts:46 :: bash: 'shell',
           bukti lang.ts:47 :: zsh: 'shell',
           bukti lang.ts:48 :: ps1: 'shell',
           bukti lang.ts:49 :: bat: 'shell',
           bukti lang.ts:50 :: cmd: 'shell',
   [LULUS] xml/K1-paket-ada — paket zephyr.lang-xml dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA
           bukti ext_bundled.rs:311 :: const LANG_XML: &str = r##"{"id":"zephyr.lang-xml","name":"Bahasa XML / HTML","publisher":"zephyr","version":"1.0.0","de
           bukti ext_bundled.rs:1172 :: ("zephyr.lang-xml", &[("zephyr-extension.json", LANG_XML)]),
   [LULUS] xml/K2-bahasa-sudah-bawaan — bahasa "xml" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru
           bukti lang.ts:136 :: xml: 'XML',
   [LULUS] xml/K3-grammar-bawaan-ada — build() (lang.ts) memasang grammar nyata untuk "xml": bahasa ini jalan tanpa paket apa pun
           bukti lang.ts:234 :: case 'xml':
           bukti lang.ts:235 :: return [(await import('@codemirror/lang-xml')).xml()];
   [LULUS] xml/K4-paket-duplikat-mode — paket memakai mode legacy "xml" (StreamLanguage) sementara bawaan memakai paket CM6 nyata @codemirror/lang-xml — paket lebih lemah, bukan penambah bahasa
           bukti cmLegacyModes.ts:113 :: 'xml': () => import('@codemirror/legacy-modes/mode/xml'),
           bukti lang.ts:235 :: return [(await import('@codemirror/lang-xml')).xml()];
   [LULUS] xml/K5-ekstensi-sisa-saja — semua ekstensi paket (.xsd, .xsl, .xhtml) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa
           bukti ext_bundled.rs:311 :: const LANG_XML: &str = r##"{"id":"zephyr.lang-xml","name":"Bahasa XML / HTML","publisher":"zephyr","version":"1.0.0","de
   [LULUS] xml/K6-terjangkau-tanpa-paket — "xml" sudah terjangkau lewat ekstensi bawaan .xml, .svg — paket tak diperlukan untuk bahasanya
           bukti lang.ts:35 :: xml: 'xml',
           bukti lang.ts:36 :: svg: 'xml',

   vonis per bahasa:
     - perl     -> BAHASA-BAWAAN + EKSTENSI-SISA (.t, .pod)
     - python   -> BAHASA-BAWAAN + EKSTENSI-SISA (.pyi)
     - ruby     -> BAHASA-BAWAAN + EKSTENSI-SISA (.erb, .gemspec)
     - shell    -> BAHASA-BAWAAN + EKSTENSI-SISA (.fish)
     - xml      -> BAHASA-BAWAAN + EKSTENSI-SISA (.xsd, .xsl, .xhtml)

   30 kasus: 30 lulus, 0 gagal
   LULUS: kelima paket TIDAK menambah bahasa; hanya ekstensi sisa.
EXIT=0
```

### 4.2 `node scripts/uji-bahasa-noop-puppet.mjs`

```text
== uji bahasa no-op / puppet: siapa yang benar-benar mengubah, siapa yang cuma terpasang? ==
   sumber: src-tauri/src/ext_bundled.rs | src-tauri/src/ext_bundled_extra.rs | src/lib/lang.ts | src/lib/cmLegacyModes.ts | src/lib/extLoader.ts
   BY_EXT=61 | LANG_LABEL=28 | MODE_IMPORTER=103 | paket bahasa=88

   [LULUS] C01-katalog-terbaca — katalog memuat 88 paket bahasa (manifest + urutan PAKET_BAHASA)
           bukti ext_bundled.rs:934 :: const PAKET_BAHASA: &[(&str, &[(&str, &str)])] = &[
   [LULUS] C02-tak-ada-mode-hantu — setiap paket menyebut mode yang benar-benar bisa dimuat (MODE_IMPORTER / PAKET_DIIZINKAN) — jadi NO-OP bukan karena mode hilang
           bukti cmLegacyModes.ts:14 :: export const MODE_IMPORTER: Record<string, () => Promise<unknown>> = {
   [LULUS] C03-tak-ada-penyumbang-textmate — tidak ada paket bahasa yang menyumbang grammar TextMate — jadi cabang "terpasang tetapi mesin TextMate belum ada" kosong (bukan sumber no-op di sini)
           bukti extLoader.ts:491 :: * TextMate grammars are parsed by Rust (`contributes.grammars`) but nothing
   [LULUS] C04-mirc-efektif — zephyr.lang-mirc EFEKTIF: .mrc tidak ada di BY_EXT, bukan diklaim paket lain, mode "mirc" bisa dimuat
           bukti ext_bundled.rs:263 :: const LANG_MIRC: &str = r##"{"id":"zephyr.lang-mirc","name":"Bahasa mIRC","publisher":"zephyr","version":"1.0.
           bukti cmLegacyModes.ts:58 :: 'mirc': () => import('@codemirror/legacy-modes/mode/mirc'),
   [LULUS] C05-pascal-pemilik-pp — zephyr.lang-pascal EFEKTIF dan pemilik .pp: .pp tidak ada di BY_EXT dan pascal lebih dulu di urutan PAKET_BAHASA
           bukti ext_bundled.rs:273 :: const LANG_PASCAL: &str = r##"{"id":"zephyr.lang-pascal","name":"Bahasa Pascal","publisher":"zephyr","version"
           bukti ext_bundled.rs:1072 :: (entri urutan pascal)
   [LULUS] C06-puppet-noop — zephyr.lang-puppet NO-OP: satu-satunya ekstensi .pp sudah dipegang pascal yang lebih dulu di urutan — terpasang, tampil di daftar, nol efek
           bukti ext_bundled.rs:280 :: const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version"
           bukti ext_bundled.rs:1072 :: (entri pascal — lebih dulu)
           bukti ext_bundled.rs:1091 :: (entri puppet — lebih belakang)
   [LULUS] C07-negatif-puppet-nol — NEGATIF: pupppet dimatikan -> 0 ekstensi kehilangan highlight = tidak ada yang berubah = NO-OP terbukti
           bukti ext_bundled.rs:280 :: const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version"
   [LULUS] C08-negatif-pascal-pp — NEGATIF: pascal dimatikan -> .pas/.dpr/.lpr kehilangan highlight, TETAPI .pp tidak, karena pemiliknya langsung jatuh ke puppet — puppet hanya bayangan pascal, bukan penyumbang apa pun
           bukti ext_bundled.rs:273 :: const LANG_PASCAL: &str = r##"{"id":"zephyr.lang-pascal","name":"Bahasa Pascal","publisher":"zephyr","version"
           bukti ext_bundled.rs:280 :: const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version"
   [LULUS] C09-perl-hilang-hanya-sisa — NEGATIF: zephyr.lang-perl dimatikan -> hanya ekstensi sisa (.pod, .t) yang kehilangan highlight; bahasa "perl" TETAP ada (LANG_LABEL + BY_EXT)
           bukti ext_bundled.rs:275 :: const LANG_PERL: &str = r##"{"id":"zephyr.lang-perl","name":"Bahasa Perl","publisher":"zephyr","version":"1.0.
           bukti lang.ts:145 :: perl: 'Perl',
   [LULUS] C09-python-hilang-hanya-sisa — NEGATIF: zephyr.lang-python dimatikan -> hanya ekstensi sisa (.pyi) yang kehilangan highlight; bahasa "python" TETAP ada (LANG_LABEL + BY_EXT)
           bukti ext_bundled.rs:281 :: const LANG_PYTHON: &str = r##"{"id":"zephyr.lang-python","name":"Bahasa Python","publisher":"zephyr","version"
           bukti lang.ts:130 :: python: 'Python',
   [LULUS] C09-ruby-hilang-hanya-sisa — NEGATIF: zephyr.lang-ruby dimatikan -> hanya ekstensi sisa (.erb, .gemspec) yang kehilangan highlight; bahasa "ruby" TETAP ada (LANG_LABEL + BY_EXT)
           bukti ext_bundled.rs:285 :: const LANG_RUBY: &str = r##"{"id":"zephyr.lang-ruby","name":"Bahasa Ruby","publisher":"zephyr","version":"1.0.
           bukti lang.ts:143 :: ruby: 'Ruby',
   [LULUS] C09-shell-hilang-hanya-sisa — NEGATIF: zephyr.lang-shell dimatikan -> hanya ekstensi sisa (.fish) yang kehilangan highlight; bahasa "shell" TETAP ada (LANG_LABEL + BY_EXT)
           bukti ext_bundled.rs:289 :: const LANG_SHELL: &str = r##"{"id":"zephyr.lang-shell","name":"Bahasa Shell / Bash","publisher":"zephyr","vers
           bukti lang.ts:140 :: shell: 'Shell',
   [LULUS] C09-xml-hilang-hanya-sisa — NEGATIF: zephyr.lang-xml dimatikan -> hanya ekstensi sisa (.xhtml, .xsd, .xsl) yang kehilangan highlight; bahasa "xml" TETAP ada (LANG_LABEL + BY_EXT)
           bukti ext_bundled.rs:311 :: const LANG_XML: &str = r##"{"id":"zephyr.lang-xml","name":"Bahasa XML / HTML","publisher":"zephyr","version":"
           bukti lang.ts:136 :: xml: 'XML',
   [LULUS] C14-rekap-87-1 — rekap: 87 paket EFEKTIF (mengubah apa yang dilihat pemakai), 1 NO-OP (puppet), 0 GAGAL
   [LULUS] C15-daftar-noop — daftar NO-OP: zephyr.lang-puppet
           bukti ext_bundled.rs:280 :: const LANG_PUPPET: &str = r##"{"id":"zephyr.lang-puppet","name":"Bahasa Puppet","publisher":"zephyr","version"

   vonis: 87 EFEKTIF, 1 NO-OP, 0 GAGAL
   NO-OP: zephyr.lang-puppet (pp<-zephyr.lang-pascal)
   15 kasus: 15 lulus, 0 gagal
   LULUS: 1 paket terbukti NO-OP (puppet); sisanya mengubah ekstensi nyata.
EXIT=0
```

**Angka.** Harness 1: **30 kasus (6 kasus x 5 bahasa), 30 lulus, 0 gagal, exit 0.**
Harness 2: **15 kasus, 15 lulus, 0 gagal, exit 0.** Harness 2 mendukung `--json`.

## 5. Temuan penting: mesin label jujur SUDAH ADA di repo

Ini temuan yang mengubah bentuk pekerjaan: permintaan item ini (UI menulis "sudah didukung bawaan" + keputusan label untuk paket no-op) **sudah diimplementasikan** di worktree:

| Bagian | Berkas:baris | Isi |
|---|---|---|
| Tabel tangan label | `src/lib/labelPaket.ts:46-105` | 6 entri: `zephyr.lang-puppet` → `jenis: 'no-op'` (**:47-57**); `perl`, `python`, `ruby`, `shell`, `xml` → `jenis: 'ekstensi-sisa'` dengan teks "sudah didukung bawaan — … hanya menambah ekstensi sisa …" (**:58-104**) |
| Catatan dihitung dari manifest | `src/components/extensions/bahasaTerpasang.ts:85-155` | `catatanBahasaTerpasang()` — menghitung `ditambah` vs `tidakEfek` dari `detectLang()`, bukan tabel tangan; menutup paket ke-8 dan paket unduhan. Teks "sudah didukung bawaan - …" di **:135-139** |
| Dipakai di kartu | `src/components/extensions/ExtensionsView.tsx:367` (`labelPaket`) → render **:411-414** (`data-testid=\`xc-catatan-${item.id}\``) | kartu menulis label NO-OP / ekstensi-sisa |
| Dipakai di panel detail | `ExtensionsView.tsx:549` (`catatanBahasaTerpasang`) → render **:631-646** (`data-testid="ext-catatan-bahasa"`, judul "Bahasa vs bawaan") | catatan per baris bahasa |
| Uji penjaga tabel | `scripts/uji-katalog-ekstensi-jujur.mjs` | menurunkan status dari katalog nyata lalu menuntut tabel `labelPaket.ts` setuju |

**Kecocokan dengan hasil harness lane ini (angka nyata).** Tabel tangan itu setuju **persis** dengan yang saya buktikan dari berkas sumber: `.t/.pod`, `.pyi`, `.erb/.gemspec`, `.fish`, `.xsd/.xsl/.xhtml`, dan puppet = no-op dengan pemilik `.pp` = pascal. Jadi klaim item "paket hanya menambah ekstensi sisa" dan "puppet no-op" **sudah benar dan sudah tertulis di UI** — yang kurang dari worktree hanya hal-hal di §6.

## 6. Temuan yang MASIH menunggu usulan patch (jujur, belum dikerjakan)

1. **Komentar basi "7 id" vs tabel 6 entri.** `bahasaTerpasang.ts:6` dan `ExtensionsView.tsx:546` menulis tabel tangan `labelPaket.ts` menutup **7 id** bawaan; `grep -c "^  'zephyr.lang-" src/lib/labelPaket.ts` = **6**. Turunan dari katalog nyata (harness 2) juga hanya menemukan **6** paket yang perlu catatan (puppet + 5 ekstensi-sisa). Jadi angkanya basi.
2. **Kelas label jujur tanpa aturan CSS.** `ExtensionsView.tsx:411` menulis `className={\`xc-desc xc-label-jujur is-${label.jenis}\`}` sehingga menghasilkan `xc-label-jujur is-no-op` / `is-ekstensi-sisa`, tetapi **tidak ada satu pun** aturan untuk kelas-kelas itu di `src/styles/**` (pencarian ripgrep atas `src/` atas `xc-label-jujur|is-no-op|is-ekstensi-sisa|\.xc-desc` hanya menemukan 2 kecocokan: definisi `.xc-desc` di `src/styles/extensions.css:470` dan pemakaian className di `ExtensionsView.tsx:411`). Akibatnya label "NO-OP — …" tampil sebagai baris deskripsi biasa, **tak terbedakan sekilas** dari `item.description`: sinyal jujurnya hilang secara visual.
3. **Baris `Languages` di panel detail masih menulis klaim manifest apa adanya.** `ExtensionsView.tsx:562` menulis `${x.label} (.${x.extensions.join(', .')})` — mis. `Python (.pyi)`, `Perl (.t, .pod)` — tanpa penanda "bahasa sudah bawaan" di baris itu; penandanya ada di blok terpisah di bawahnya (`:631-646`).
4. **Belum ada gate "jangan tawarkan" untuk paket no-op.** `zephyr.lang-puppet` tetap muncul di katalog dan tetap bisa dipasang/dilepas; yang ada baru label. Ini keputusan produk (label vs sembunyikan), belum diputuskan di berkas.
5. **Catatan lulus (tanpa patch).** Teks `labelPaket.ts:54-56` untuk puppet cocok dengan uji negatif saya: melepas puppet memang tidak mengubah apa pun.

Usulan patch konkret (berkas + baris + teks lama/baru) ada di `docs/USULAN-LABEL-DAN-NOOP.md`.

## 7. Verifikasi TypeScript

```
node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
=> TSC_EXIT=0 (0 galat, tanpa keluaran)
```
