# Katalog ekstensi jujur — paket bahasa no-op & "ekstensi sisa"

Tanggal: 2026-10-14. Pemilik: lane katalog/UI ekstensi (`src/components/extensions/ExtensionsView.tsx`).
Branch: `feat/ai-panel-vscode-layout`. Semua keluaran di bawah adalah keluaran nyata
(disalin dari terminal sesi ini), bukan rangkuman.

Item yang dikerjakan:

- `zeph-bahasa-noop-puppet`
- `zeph-label-sudah-didukung`

---

## 1. Sumber kebenaran

| Fakta | Berkas:baris |
| --- | --- |
| 88 paket bahasa + urutan pemuatan (`PAKET_BAHASA`) | `src-tauri/src/ext_bundled.rs` (`const PAKET_BAHASA` @934) |
| Manifes tiap paket (`LANG_*`: id, language id, ekstensi, mode) | `src-tauri/src/ext_bundled.rs` (`LANG_PASCAL` @273 … `LANG_XML` @311) |
| Ekstensi → bahasa yang sudah ada DI DALAM aplikasi | `src/lib/lang.ts` (`BY_EXT` @~40, 61 ekstensi; `LANG_LABEL`, 28 bahasa) |
| Aturan "peta bawaan menang, paket hanya mengisi sisa" | `src/lib/lang.ts:90-113` (`extLangUntuk`) — baris 111: `if (detectLang(nameOrPath) !== 'plain') return null;` |
| Aturan "yang pertama menang" antar paket | `src/lib/extLoader.ts:369-386` (`langPemilik`, alasan `ekstensi .X (bahasa "Y") diabaikan: .X sudah dipakai "Z"`) |
| Urutan pemuatan nyata di runtime | `src-tauri/src/ext_pkg.rs:1520-1552` (`extensions_manifests`: `dirs.sort()` — dibaca urut nama direktori/id) |
| Daftar yang ditampilkan UI | `src/lib/extCatalog.ts` (`KATALOG_BUNDLED`, 17 item non-bahasa) + index Rust `index_bundled()` (`src-tauri/src/ext_bundled.rs:1475+`, `PAKET` 17 + `PAKET_BAHASA` 88 = **105**) |

Catatan penting soal urutan: `extensions_manifests()` mengurutkan direktori (`dirs.sort()`),
bukan `PAKET_BAHASA`, jadi urutan klaim runtime = urut id. Untuk kasus `.pp` kedua urutan
sepakat: `zephyr.lang-pascal` < `zephyr.lang-puppet` (posisi katalog 46 vs 53).

---

## 2. Bukti (a) — `zephyr.lang-puppet` benar no-op untuk `.pp`

Keluaran nyata probe sumber (sebelum perubahan apa pun saya), `EXIT=0`:

```
zephyr.lang-pascal  (posisi 46 di PAKET_BAHASA)
   const LANG_PASCAL @ src-tauri/src/ext_bundled.rs:273  desc="Syntax highlight Pascal (.pas)."
   klaim: .pas, .pp, .dpr, .lpr
   native=- | direbut=- | BARU=.pas, .pp, .dpr, .lpr

zephyr.lang-puppet  (posisi 53 di PAKET_BAHASA)
   const LANG_PUPPET @ src-tauri/src/ext_bundled.rs:280  desc="Syntax highlight Puppet (.pp)."
   klaim: .pp
   native=- | direbut=pp <- zephyr.lang-pascal | BARU=-
```

Rantai buktinya:

1. `LANG_PASCAL` (`ext_bundled.rs:273`) mengklaim `[".pas", ".pp", ".dpr", ".lpr"]` → `.pp`.
2. `LANG_PUPPET` (`ext_bundled.rs:280`, satu-satunya id `puppet` di katalog) mengklaim `[".pp"]`.
3. `PAKET_BAHASA` memuat pascal di posisi **46**, puppet di posisi **53** → pascal lebih dulu
   (dan urut id direktori di `ext_pkg.rs` juga pascal lebih dulu).
4. `extLoader.ts:373-378`: `if (langByExt.has(key))` → ekstensi `.pp` sudah ada → paket puppet
   di-*skip* dengan alasan "`.pp sudah dipakai "zephyr.lang-pascal"`"; `muatBahasa` tidak
   mencatat satu pun kontribusi untuk puppet.
5. `lang.ts:111`: kontribusi paket hanya dipakai kalau `detectLang()` belum mengenali berkasnya.
6. Uji lane bahasa yang sudah ada membenarkan dari sisi lain: `node scripts/uji-bahasa-live.mjs`
   → `NO-OP : 1 (1.1%)`, `- puppet (Puppet) -> ekstensi sudah dipegang paket lain (pp<:zephyr.lang-pascal)`.

**Kesimpulan:** `zephyr.lang-puppet` = **no-op**. Dipasang, diaktifkan, tidak ada satu pun ekstensi
yang berubah highlight-nya.

## 3. Bukti (b) — lima paket hanya menambah ekstensi sisa, bahasanya sudah native

| Paket | const @ baris | klaim | bahasa (`langId`) sudah di `LANG_LABEL`? | ekstensi SISA |
| --- | --- | --- | --- | --- |
| `zephyr.lang-perl` | `LANG_PERL` @275 | `.t`, `.pod` | ya (`perl`) | `.t`, `.pod` |
| `zephyr.lang-python` | `LANG_PYTHON` @281 | `.pyi` | ya (`python`) | `.pyi` |
| `zephyr.lang-ruby` | `LANG_RUBY` @285 | `.erb`, `.gemspec` | ya (`ruby`) | `.erb`, `.gemspec` |
| `zephyr.lang-shell` | `LANG_SHELL` @289 | `.fish` | ya (`shell`) | `.fish` |
| `zephyr.lang-xml` | `LANG_XML` @311 | `.xsd`, `.xsl`, `.xhtml` | ya (`xml`) | `.xsd`, `.xsl`, `.xhtml` |

Tidak satu pun dari 9 ekstensi itu ada di `BY_EXT` (61 ekstensi: `py`, `rb`, `pl`/`pm`, `sh`,
`xml`, …), jadi semuanya memang "sisa" — tetapi **bahasanya sudah didukung bawaan**
(`lang.ts` `LANG_LABEL`), dan mode legacy yang dipakai pun mode yang sudah dipakai bahasa bawaan.
Uji lane bahasa mencatat hal yang sama, contoh keluaran nyata:

```
      - perl (Perl) -> menambah highlight untuk: .t, .pod — CATATAN: bahasa "perl" sudah didukung bawaan — mode "perl" juga dipakai bahasa bawaan
      - python (Python) -> menambah highlight untuk: .pyi — CATATAN: bahasa "python" sudah didukung bawaan
```

Dua turunan independen (harness baru §6 dan `uji-bahasa-live.mjs`) menghasilkan himpunan yang sama:
no-op = {puppet}, ekstensi-sisa = {perl, python, ruby, shell, xml}.

---

## 4. Keputusan + alasan

### 4.1 `zephyr.lang-puppet` — **tetap ditawarkan, diberi label NO-OP**

Terhadap pilihan "jangan tawarkan atau beri label jelas", yang dipilih: **beri label jelas**.

Alasan:

- Label jujur sudah menyelesaikan akar masalahnya (kartu yang menjanjikan sesuatu yang tidak
  terjadi). Menghapus paketnya berarti mengubah katalog — berkas `src-tauri/src/ext_bundled.rs`
  **sedang berisi perubahan lane lain** (keputusan katalog 118→105: `git diff --stat` →
  `30 insertions(+), 157 deletions(-)`, dokumen `docs/KEPUTUSAN-KATALOG-118-105.md` masih untracked),
  jadi mengeditnya berisiko menimpa pekerjaan lane itu. Sesuai aturan, saya tidak menyentuhnya dan
  menulis usulan tambalan di §8.
- Aturan tugas: jangan mengurangi kemampuan. Paket harus tetap bisa dipasang/dilepas; yang berubah
  hanya kejujuran labelnya.
- Efek kalau memilih "jangan tawarkan" (dihitung dari sumber, §6): daftar paket **105 → 104**
  (paket bahasa **88 → 87**), `zephyr.lang-puppet` hilang dari kartu, dan `uninstall` paket lama
  pengguna yang masih terpasang akan menyisakan entri "tidak ada di katalog". Itu juga melanggar
  tuntutan "jumlah paket tidak berkurang" di item ini, jadi tidak dipilih.

### 4.2 Lima paket "ekstensi sisa" — label **"sudah didukung bawaan"**

Teksnya menyebut bahasa + ekstensi sisa, tidak menyiratkan penambahan dukungan bahasa, dan
menggantikan label lama `melengkapi bahasa bawaan` (masih berpura-pura "melengkapi bahasa").
Paket tetap bisa dipasang/dilepas seperti biasa.

Semua paket lain (82 paket bahasa-baru, mis. `zephyr.lang-apl`, `zephyr.lang-cobol`) **tidak**
diberi label apa pun — dilabeli justru akan salah.

---

## 5. Teks label persis yang dilihat pengguna

Dari `src/lib/labelPaket.ts` (tabel `LABEL_PAKET`), dirender di kartu
`ExtensionsView.tsx` sebagai `<span className="xc-desc xc-label-jujur is-<jenis>"
data-testid="xc-catatan-<id>" data-jenis-label="<jenis>">`:

| id | jenis | teks persis |
| --- | --- | --- |
| `zephyr.lang-puppet` | `no-op` | `NO-OP — ekstensi .pp sudah diklaim paket Pascal yang dimuat lebih dulu, jadi paket ini tidak menambah dukungan bahasa apa pun; tetap bisa dipasang/dilepas` |
| `zephyr.lang-perl` | `ekstensi-sisa` | `sudah didukung bawaan — Perl sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa .t, .pod` |
| `zephyr.lang-python` | `ekstensi-sisa` | `sudah didukung bawaan — Python sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa .pyi` |
| `zephyr.lang-ruby` | `ekstensi-sisa` | `sudah didukung bawaan — Ruby sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa .erb, .gemspec` |
| `zephyr.lang-shell` | `ekstensi-sisa` | `sudah didukung bawaan — Shell / Bash sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa .fish` |
| `zephyr.lang-xml` | `ekstensi-sisa` | `sudah didukung bawaan — XML / HTML sudah ada di Zephyr; paket ini hanya menambah ekstensi sisa .xsd, .xsl, .xhtml` |

Kalimat lama yang dibuang: `melengkapi bahasa bawaan — menambah …` dan
`sudah tercakup (pascal dimuat lebih dulu)` (terlalu kabur: tidak menyebut bahasa & ekstensi sisa).

Kontras dengan deskripsi kartu yang masih ditampilkan katalog (dari `META_BAHASA`):
`Puppet syntax for the editor (CodeMirror legacy mode).` (`ext_bundled.rs:691`) dan
`Perl syntax for the editor (CodeMirror legacy mode).` (`:656`) — lihat usulan tambalan §8.

---

## 6. Harness baru (node-only, tanpa dependensi)

`scripts/uji-katalog-ekstensi-jujur.mjs` — membaca sumber katalog nyata + modul label nyata
(`await import('…/src/lib/labelPaket.ts')`, bisa karena Node v26.7.0 melakukan type-stripping
native), menurunkan status tiap paket sendiri, lalu menuntut tabel label setuju **dua arah**:

- sumber → modul: semua paket no-op & ekstensi-sisa dari sumber wajib ada di modul, dengan daftar
  ekstensi sisa yang **persis** (urutan ikut diperiksa);
- modul → sumber: tidak boleh ada id hantu, tidak boleh ada paket "bahasa-baru" yang dilabeli
  "sudah didukung bawaan", tidak boleh paket no-op dilabeli "sudah didukung bawaan";
- jumlah paket sesudah ≥ sebelum (105 vs 105);
- UI tidak memfilter daftar (`daftar.map(` tetap ada satu) dan memakai tabel nyata.

Keluaran nyata (diringkas; `EXIT=0`):

```
turunan dari sumber: 88 paket berkontribusi bahasa
  no-op         : 1  zephyr.lang-puppet
  ekstensi-sisa : 5  zephyr.lang-perl, zephyr.lang-python, zephyr.lang-ruby, zephyr.lang-shell, zephyr.lang-xml
  bahasa-baru   : 82
  bukti no-op: zephyr.lang-puppet (LANG_PUPPET @ src-tauri/src/ext_bundled.rs:280) mengklaim .pp, direbut pp <- zephyr.lang-pascal
  bukti sisa: zephyr.lang-perl (LANG_PERL @ src-tauri/src/ext_bundled.rs:275) hanya menambah .t, .pod; perl sudah native (via nama bahasa)
  …
tabel src/lib/labelPaket.ts: 6 label
  ok   paket no-op dari sumber terdeteksi sebagai no-op di modul (persis, bukan tebakan)
  ok   label puppet menyebut NO-OP, ekstensi yang direbut, dan pemiliknya (.pp <- pascal)
  ok   paket no-op: pemilik ekstensi yang direbut muncul LEBIH DULU di katalog (PAKET_BAHASA)
  ok   paket ekstensi-sisa dari sumber terdeteksi + daftar ekstensinya persis
  ok   tiap label ekstensi-sisa menulis "sudah didukung bawaan" + bahasa + ekstensi sisa persis
  ok   anti-salah-label: paket yang benar-benar menambah bahasa tidak dilabeli "sudah didukung bawaan" (contoh: zephyr.lang-apl, zephyr.lang-asciiarmor, zephyr.lang-brainfuck)
  ok   jumlah paket TIDAK berkurang: total id katalog sesudah == sebelum
  ok   UI tetap menampilkan seluruh daftar (tidak ada paket yang disembunyikan/difilter karena label)

angka katalog:
  paket ditawarkan (bahasa + non-bahasa) : SEBELUM 105 -> SESUDAH 105
  paket bahasa                            : SEBELUM 88 -> SESUDAH 88
  paket non-bahasa                        : SEBELUM 17 -> SESUDAH 17
  paket berlabel jujur                    : 0 -> 6 (no-op 1, ekstensi-sisa 5)

== 20/20 lulus ==
```

Angka "sebelum" (105 / 88 / 17 / 61 ekstensi / 28 bahasa) diukur pada katalog yang sama sebelum
perubahan label ini dan ditulis sebagai konstanta `SEBELUM` di harness; katalog tidak disentuh
perubahan ini, jadi wajib tetap sama (kalau katalog berubah, uji gagal — itu memang tujuannya).

---

## 7. Berkas

Baru (milik lane ini):

- `src/lib/labelPaket.ts` — tabel label + `labelPaket()`/`daftarLabelPaket()`, murni (tanpa impor/React).
- `scripts/uji-katalog-ekstensi-jujur.mjs`
- `docs/KATALOG-EKSTENSI-JUJUR.md` (dokumen ini)

Diubah:

- `src/components/extensions/ExtensionsView.tsx` — impor `labelPaket`, kartu memakai tabel nyata
  (`const label = labelPaket(item.id)`), tabel `CATATAN_BAHASA` lama dihapus, label dirender dengan
  `data-jenis-label`. Tidak ada perubahan pada pemasangan/pelepasan/penyaringan daftar.

Tidak disentuh (sengaja): `src-tauri/src/ext_bundled.rs`, `src-tauri/src/ext_bundled_extra.rs`,
`src/lib/lang.ts`, `src/lib/extLoader.ts`, `scripts/uji-bahasa-live.mjs`.

## 8. Usulan tambalan untuk sumber katalog (TIDAK dikerjakan di sini)

`src-tauri/src/ext_bundled.rs` sedang berisi perubahan lane lain (keputusan katalog 118→105,
`30 insertions(+), 157 deletions(-)`, belum di-commit), jadi sesuai aturan berkas itu tidak saya
kerjakan. Usulan untuk lane pemilik katalog:

1. `META_BAHASA` (deskripsi kartu, satu-satunya teks katalog yang tampil di kartu):
   - `:691` `"zephyr.lang-puppet"`: `"Puppet syntax for the editor (CodeMirror legacy mode)."`
     → mis. `"Syntax highlight Puppet — .pp sudah diklaim paket Bahasa Pascal, memasang paket ini tidak mengubah highlight."`
   - `:656`, `:698`, `:726`, `:754`, `:908` (perl/python/ruby/shell/xml):
     akhiri deskripsi dengan `"bahasa ini sudah didukung bawaan; paket hanya menambah .t, .pod"` (dst.)
2. `LANG_*` `description`: puppet `"Syntax highlight Puppet (.pp)."` → sebutkan bahwa `.pp` tidak
   efektif; sisanya sudah benar (`"Syntax highlight Perl (.t, .pod)."`).
3. Kalau kelak memilih "jangan tawarkan": hapus entri `zephyr.lang-puppet` dari `PAKET_BAHASA`
   + `META_BAHASA` (dan `ext_lang_icons::LOGO_URI`), lalu perbarui `docs/KEPUTUSAN-KATALOG-118-105.md`
   (105 → 104). Efeknya: paket bahasa 88 → 87, dan label di `src/lib/labelPaket.ts` untuk id itu
   harus ikut dihapus atau uji ini akan gagal (memang disengaja).

## 9. Keluaran nyata tiap perintah + exit

| Perintah | Keluaran nyata (ringkas) | Exit |
| --- | --- | --- |
| `node scripts/uji-katalog-ekstensi-jujur.mjs` | `== 20/20 lulus ==`; no-op 1, ekstensi-sisa 5; 105 → 105 | `0` |
| `node scripts/uji-bahasa-live.mjs` | `LULUS: 88 paket bahasa diklasifikasikan; 87 efektif (98.9%), 1 no-op, 0 gagal.` + blok `[c]`/`[d]` menyebut puppet no-op dan 5 paket "sudah didukung bawaan" | `0` |
| `npx tsc --noEmit` | (tanpa keluaran) | `0` |
| `git status --porcelain -- src/lib/labelPaket.ts scripts/uji-katalog-ekstensi-jujur.mjs docs/KATALOG-EKSTENSI-JUJUR.md src/components/extensions/ExtensionsView.tsx src-tauri/src/ext_bundled.rs` | `M src-tauri/src/ext_bundled.rs` (lane lain, katalog 118→105) · `M src/components/extensions/ExtensionsView.tsx` (317 insertions, 3 deletions) · `?? docs/KATALOG-EKSTENSI-JUJUR.md` · `?? scripts/uji-katalog-ekstensi-jujur.mjs` · `?? src/lib/labelPaket.ts` | `0` |

## 10. Sisa yang BUTUH APP

- **Render kartu sungguhan**: memastikan kartu `zephyr.lang-puppet` menampilkan teks NO-OP dan
  lima kartu menampilkan "sudah didukung bawaan" di jendela Zephyr (Tauri) — BUTUH APP. Yang bisa
  dibuktikan tanpa aplikasi sekarang: tabel label, jalur render (`labelPaket(item.id)` +
  `data-testid="xc-catatan-<id>"` + `data-jenis-label`), 20/20 uji harness, `tsc` 0 galat.
- **Perilaku pasang/lepas paket** (paket tetap bisa dipasang/dilepas, `data-inert="1"` muncul untuk
  paket yang terpasang tanpa efek) — BUTUH APP.
- **Deskripsi kartu** masih dari `META_BAHASA` (§8) — usulan tambalan, belum diterapkan karena
  berkas katalog sedang dipakai lane lain.
