# KEPUTUSAN: katalog bawaan 118 → 105 (13 paket bahasa dilepas)

Status: **keputusan tercatat** — 13 paket dilepas sengaja, alasannya tertulis, dan
pemeriksaannya dijaga skrip `scripts/cek-katalog-jumlah.mjs`.

Cabang: `feat/ai-panel-vscode-layout`. Semua angka di bawah keluaran nyata skrip
(`node scripts/cek-katalog-jumlah.mjs`), bukan perkiraan.

---

## 1. Angka

Perbandingan katalog bawaan, HEAD vs worktree:

| Berkas | Kategori | HEAD | worktree |
|---|---|---|---|
| `src-tauri/src/ext_bundled.rs` | Languages | **101** | **88** |
| `src-tauri/src/ext_bundled.rs` | Snippets | 2 | 2 |
| `src-tauri/src/ext_bundled.rs` | Keymaps | 1 | 1 |
| `src-tauri/src/ext_bundled.rs` | Icon Themes | 1 | 1 |
| `src-tauri/src/ext_bundled.rs` | Themes | 1 | 1 |
| | **subtotal** | **106** | **93** |
| `src-tauri/src/ext_bundled_extra.rs` | Snippets | 5 | 5 |
| `src-tauri/src/ext_bundled_extra.rs` | Keymaps | 3 | 3 |
| `src-tauri/src/ext_bundled_extra.rs` | Icon Themes | 3 | 3 |
| `src-tauri/src/ext_bundled_extra.rs` | Themes | 1 | 1 |
| | **subtotal** | **12** | **12** |
| **Gabungan** | | **118** | **105** |

Selisih = **13**, seluruhnya kategori Languages. 105 adalah angka yang cocok
dengan yang ditampilkan aplikasi; 118 adalah angka di HEAD. Tidak ada id baru di
worktree (`ID BARU DI WORKTREE (0)`).

---

## 2. Kenapa 13 paket bahasa dilepas

Ada **dua lapis bukti**, dan lapis kedua yang menentukan.

### Lapis 1 — pola dedupe ekstensi pada paket yang MASIH ada

Bahasa yang sudah native tidak lagi ditawarkan lewat paket: daftar ekstensinya
dipangkas dari paket, bukan paketnya dihapus.

| Konstanta | HEAD | worktree |
|---|---|---|
| `LANG_PYTHON` | `[".py", ".pyw", ".pyi"]` | `[".pyi"]` |
| `LANG_RUBY` | `[".rb", ".erb", ".gemspec"]` | `[".erb", ".gemspec"]` |
| `LANG_PERL` | `[".pl", ".pm", ".t", ".pod"]` | `[".t", ".pod"]` |
| `LANG_POWERSHELL` | `[".ps1", ".psm1", ".psd1"]` | `[".psm1", ".psd1"]` |
| `LANG_MIRC` | `[".mrc", ".ini"]` | `[".mrc"]` |
| `LANG_SASS` | `[".sass", ".scss"]` | `[".sass"]` |
| `LANG_SHELL` | `[".sh", ".bash", ".zsh", ".fish"]` | `[".fish"]` |

Pola: `.py`/`.rb`/`.pl`/`.ps1`/`.ini`/`.scss`/`.sh…` sudah ada di peta bawaan
`src/lib/lang.ts` (`BY_EXT`), jadi paket tidak perlu menawarkannya lagi.
Ke-13 paket yang hilang adalah kelanjutan pola yang sama — bahasanya sudah
native, paketnya sekalian dilepas.

### Lapis 2 — paket-paket itu memang tidak pernah aktif (bukan fitur hilang)

Ini temuan yang membuat keputusan jadi tegas, bukan sekadar "kelihatannya
disengaja". Peraturan aktivasi bahasa kontribusi ada di
`src/lib/lang.ts:111`:

```ts
if (detectLang(nameOrPath) !== 'plain') return null;
return bahasaUntukExt(ext);
```

Artinya: **peta bawaan menang untuk setiap ekstensi yang sudah dikenalnya**;
bahasa dari paket hanya dipakai untuk ekstensi yang tidak diklaim siapa pun
(komentar di `lang.ts:98–110` menjelaskan ini sebagai perbaikan dari bug lama).
Ekstensi yang diklaim ke-13 paket di HEAD, dan statusnya di `BY_EXT`:

| id paket (HEAD) | ekstensi yang diklaim | semuanya sudah di `BY_EXT`? |
|---|---|---|
| `zephyr.lang-javascript` | `.js .mjs .cjs .jsx` | ya, semua |
| `zephyr.lang-css` | `.css` | ya |
| `zephyr.lang-go` | `.go` | ya |
| `zephyr.lang-rust` | `.rs` | ya |
| `zephyr.lang-sql` | `.sql` | ya |
| `zephyr.lang-yaml` | `.yaml .yml` | ya |
| `zephyr.lang-lua` | `.lua` | ya |
| `zephyr.lang-swift` | `.swift` | ya |
| `zephyr.lang-toml` | `.toml` | ya |
| `zephyr.lang-properties` | `.properties .ini .cfg .conf` | ya, semua |
| `zephyr.lang-clike` | `.c .h .cpp .hpp .cc .cxx` | ya, semua |
| `zephyr.lang-asterisk` | `.conf` | ya |
| `zephyr.lang-ttcn-cfg` | `.cfg` | ya |

**Tidak satu pun ekstensi yang bebas.** Karena itu, dengan aturan `lang.ts:111`,
ke-13 paket itu sudah tidak bisa mengaktifkan grammar-nya sendiri bahkan di HEAD:
`extLangUntuk()` mengembalikan `null`, dan editor memakai grammar bawaan. Paket
mereka = beban katalog tanpa efek. Melepasnya **tidak menghilangkan fitur apa
pun**; yang hilang hanyalah baris daftar yang menyesatkan ("pasang paket ini"
padahal memasangnya tidak mengubah apa-apa).

Dukungan bahasa sekarang hidup di dalam aplikasi:

- `src/lib/lang.ts` — peta ekstensi → `LangId` (`BY_EXT`, 61 kunci) + pemuat
  grammar (`loadLangExtension`), termasuk cabang `lua`, `swift`, `toml`, `ini`
  (untuk `.properties`/`.ini`/`.cfg`/`.conf`), `cpp` (untuk `.c`/`.h`/`.cpp`…).
- `src/lib/cmLegacyModes.ts` — tabel impor mode legacy CodeMirror 5
  (`MODE_IMPORTER`, `MODE_TERSEDIA`), dipakai `src/lib/extLoader.ts` untuk
  paket yang menyatakan `legacyMode`.
- `package.json` — `@codemirror/lang-javascript`, `-css`, `-go`, `-rust`,
  `-sql`, `-yaml`, `-cpp`, `-python`, `-java`, `-xml`, `-json`, `-html`,
  `-markdown`, dan `@codemirror/legacy-modes`.

---

## 3. Tabel 13 id

Kolom "aktif di HEAD?" diisi dari aturan `lang.ts:111` (semua ekstensinya sudah
diklaim `BY_EXT` ⇒ paket tidak pernah dipakai).

| # | id (HEAD) | Status | Alasan | Bukti / penanggungan native |
|---|---|---|---|---|
| 1 | `zephyr.lang-javascript` | dilepas sengaja | JS sudah native; paket tak pernah aktif | `package.json`: `@codemirror/lang-javascript` ^6.2.5; `BY_EXT`: js/mjs/cjs/jsx |
| 2 | `zephyr.lang-css` | dilepas sengaja | idem | `@codemirror/lang-css` ^6.3.1; `BY_EXT`: css/scss/less |
| 3 | `zephyr.lang-go` | dilepas sengaja | idem | `@codemirror/lang-go` ^6.0.1; `BY_EXT`: go |
| 4 | `zephyr.lang-rust` | dilepas sengaja | idem | `@codemirror/lang-rust` ^6.0.2; `BY_EXT`: rs |
| 5 | `zephyr.lang-sql` | dilepas sengaja | idem | `@codemirror/lang-sql` ^6.10.0; `BY_EXT`: sql |
| 6 | `zephyr.lang-yaml` | dilepas sengaja | idem | `@codemirror/lang-yaml` ^6.1.3; `BY_EXT`: yaml/yml |
| 7 | `zephyr.lang-lua` | dilepas sengaja | idem | `lang.ts:59` `lua: 'lua'`, `lang.ts:261` impor `legacy-modes/mode/lua` |
| 8 | `zephyr.lang-swift` | dilepas sengaja | idem | `lang.ts:63` `swift: 'swift'`, `lang.ts:271` impor `legacy-modes/mode/swift` |
| 9 | `zephyr.lang-toml` | dilepas sengaja | idem | `lang.ts:34` `toml: 'toml'`, `lang.ts:241` impor `legacy-modes/mode/toml` |
| 10 | `zephyr.lang-properties` | dilepas sengaja | idem | `lang.ts:55` `properties: 'ini'`; `lang.ts:251` cabang `ini` → `legacy-modes/mode/properties` |
| 11 | `zephyr.lang-clike` | dilepas sengaja | idem | `lang.ts:38–44` `.c/.h/.cpp/.hpp/.cc/.cxx` → `c`/`cpp` → `@codemirror/lang-cpp` |
| 12 | `zephyr.lang-asterisk` | dilepas sengaja | idem (lihat §4 catatan) | `BY_EXT`: `conf: 'ini'` → mode `properties`; mode `asterisk` tetap tersedia untuk paket via `cmLegacyModes.ts:18` |
| 13 | `zephyr.lang-ttcn-cfg` | dilepas sengaja | idem (lihat §4 catatan) | `BY_EXT`: `cfg: 'ini'` → mode `properties`; mode `ttcn-cfg` tetap tersedia via `cmLegacyModes.ts:104` |

Tidak ada id dengan status "tidak sengaja" — 13/13 dijelaskan, dan skrip
mengeluarkan `== katalog konsisten dengan HEAD ==` (exit 0).

---

## 4. Sisa yang belum pasti

Diperiksa: daftar mode di `src/lib/cmLegacyModes.ts`, impor `@codemirror/lang-*`
dan `@codemirror/legacy-modes` di `package.json`, dan peta `BY_EXT` di
`src/lib/lang.ts`.

| id | Status | Keterangan |
|---|---|---|
| `lang-javascript`, `-css`, `-go`, `-rust`, `-sql`, `-yaml` | **sudah native** | impor `@codemirror/lang-*` langsung; ekstensinya ada di `BY_EXT` |
| `lang-lua`, `-swift`, `-toml`, `-properties`, `-clike` | **sudah native** | cabang eksplisit di `lang.ts` (baris 241/251/261/271) + impor mode legacy; `clike` lewat `@codemirror/lang-cpp` |
| `lang-asterisk`, `-ttcn-cfg` | **BELUM PASTI (parsial)** | ekstensinya (`.conf`, `.cfg`) ditangani — tapi sebagai mode **INI/`properties`**, bukan grammar Asterisk/TTCN. Mode `asterisk`/`ttcn-cfg` **ada** di `cmLegacyModes.ts` tetapi **tidak** dirujuk `lang.ts`, jadi mode itu hanya bisa dimuat oleh paket yang menyatakan `legacyMode` — dan paketnya sudah tidak ada di katalog bawaan. **Butuh:** keputusan produk — (a) terima sorotan INI untuk `.conf`/`.cfg` (paling murah, dan tidak mengubah perilaku HEAD karena di HEAD pun grammar Asterisk tak pernah aktif — lihat §2 lapis 2), atau (b) tambah cabang `case 'asterisk'`/`case 'ttcn-cfg'` di `lang.ts` + `BY_NAME`/`BY_EXT` yang lebih spesifik (mis. `asterisk.conf`) bila sorotan dialplan memang diinginkan. Tidak ada regresi hari ini: `.conf`/`.cfg` tetap tersorot lewat jalur `ini`. |
| Sebaran `.ini` vs `.conf` | belum pasti | `.ini`, `.cfg`, `.conf`, `.properties` semuanya jatuh ke satu `LangId 'ini'` (`lang.ts:51–55`). Kalau nanti mode Asterisk/TTCN diaktifkan, ketiga ekstensi itu harus dipisah — sekarang tidak bisa dibedakan dari nama berkas saja. **Butuh:** contoh nama berkas nyata (`extensions.conf`, `*.ttcn`) untuk memutuskan. |

Tidak ada item lain yang menggantung: 13/13 id hilang punya alasan, 0 id baru.

---

## 5. Rekomendasi tegas

1. **Pertahankan 105.** 13 paket itu tidak pernah mengubah perilaku editor
   (bukti §2 lapis 2). Mengembalikannya hanya menambah 13 baris katalog yang
   menjanjikan sesuatu yang tidak terjadi.
2. **Pertahankan daftar `DIBUANG_SENGAJA` di skrip** sebagai satu-satunya tempat
   resmi "paket ini tidak ditawarkan karena sudah bawaan". Menambah paket baru
   ke katalog tidak perlu mengubah skrip; menghapus paket tanpa mencatat alasan
   akan menggagalkan skrip (exit 1) — itulah tujuan skrip ini.
3. **Jalankan skrip sebelum merge** kalau `ext_bundled*.rs` disentuh:
   `node scripts/cek-katalog-jumlah.mjs` (exit 0 = konsisten). Layak dijadikan
   langkah CI/pre-commit, tetapi itu di luar lane ini.
4. **Jangan hapus mode legacy di `cmLegacyModes.ts`** hanya karena paketnya
   hilang: tabel itu jalur paket pihak ketiga (`.vsix`) yang menyatakan
   `legacyMode`. Yang boleh dibersihkan hanya entri ikon (§7).
5. **`.conf`/`.cfg`**: pilih (a) dari §4 — tanpa perubahan kode. Kalau (b)
   dipilih, kerjakan terpisah karena itu perubahan perilaku, bukan pembersihan.

---

## 6. Usulan kalimat UI (supaya tidak terasa hilang)

Masalah sesungguhnya bukan angkanya, tapi user yang pernah melihat 13 nama
bahasa lalu tidak menemukannya. Tiga usulan, dari yang paling murah:

1. **Kelompok "Sudah didukung bawaan" di kategori Languages.** Daftar 13 bahasa
   tetap tampil, tetapi sebagai baris non-install dengan lencana `Bawaan`:

   > **JavaScript** — Bawaan · Sudah didukung Zephyr, tanpa paket.
   > *(tooltip)* "Zephyr sudah menyertakan grammar JavaScript. Paket terpisah
   > tidak diperlukan, jadi tidak ditawarkan lagi di katalog."

   Variasi teks siap pakai:
   - lencana: `Bawaan`
   - baris sekunder: `Sudah didukung Zephyr — tidak perlu dipasang`
   - heading kelompok: `Sudah didukung bawaan (13)`

2. **Catatan di kepala kategori Languages** (satu baris, sekali baca):

   > "13 bahasa sudah didukung bawaan dan tidak ditawarkan sebagai paket:
   > JavaScript, CSS, Go, Rust, SQL, YAML, Lua, Swift, TOML, Properties,
   > C-like, Asterisk, TTCN-CFG."

3. **Pesan saat pencarian tidak menemukan paket** yang namanya bahasa bawaan:

   > "Tidak ada paket untuk *Go* karena Go sudah didukung bawaan."

Yang **tidak** disarankan: menyembunyikan 13 baris itu sepenuhnya tanpa
penjelasan apa pun — itu persis kondisi sekarang, dan itu yang bikin terasa
hilang.

---

## 7. Usulan penanganan ikon ketinggalan

Temuan: `src-tauri/src/ext_lang_icons.rs` menyimpan tabel `LOGO_URI`
(`pub const LOGO_URI: &[(&str, &str)]`, key = id paket) dan **12 dari 13 id yang
sudah dilepas masih ada di dalamnya** — semuanya kecuali `zephyr.lang-properties`
yang memang tidak pernah punya baris. Contoh nyata: baris 30
`("zephyr.lang-javascript", "data:image/svg+xml;base64,…")`.

Kenapa ini layak dibereskan (dan kenapa tidak berbahaya): tabel itu dipakai untuk
mencari logo paket bawaan — `ext_bundled.rs:1500`

```rust
let icon_url = crate::ext_lang_icons::LOGO_URI
    .iter()
    .find(|(pid, _)| *pid == id)
```

`id` di sini adalah id paket bawaan yang sedang didaftarkan. Karena ke-12 paket
itu tidak lagi didaftarkan, barisnya **tidak akan pernah cocok** — murni entri
mati. Efeknya hanya satu: `ext_lang_icons.rs` jadi bukti bahwa pembersihan
setengah jalan, dan sisa 12 baris base64 itu ikut masuk bundel.

Rekomendasi:

1. **Hapus 12 baris mati** dari `LOGO_URI` di `ext_lang_icons.rs`
   (`zephyr.lang-asterisk`, `-clike`, `-css`, `-go`, `-javascript`, `-lua`,
   `-rust`, `-sql`, `-swift`, `-toml`, `-ttcn-cfg`, `-yaml`), dengan satu
   komentar kepala tabel: *"hanya untuk id paket bawaan yang benar-benar
   didaftarkan; id yang dilepas dari katalog harus ikut dihapus"*. Ini lane kode,
   jadi di luar izin laporan ini — **belum dikerjakan**.
2. **Jadikan skrip ini penjaganya.** `scripts/cek-katalog-jumlah.mjs` melaporkan
   setiap baris ikon yang id paketnya sudah dilepas sebagai
   `PERINGATAN - IKON KETINGGALAN`. Sengaja **peringatan, bukan kegagalan**
   (exit tetap 0), karena ikon mati tidak merusak apa pun — kalau dijadikan
   kegagalan, setiap pembersihan bertahap akan memblokir build tanpa alasan.
3. **Kalau paket dipasang kembali** (atau sebuah `.vsix` memakai id itu), baris
   ikon boleh diambil ulang dari riwayat git — jadi tidak ada data yang benar-
   benar hilang dengan menghapusnya.

Keluaran nyata pemeriksaan sekarang:

```
== IKON BAHASA (ext_lang_icons.rs) ==

Total id ikon bahasa: 73
Id yang sudah dibuang katalognya: 13

PERINGATAN - IKON KETINGGALAN (12) — paketnya sudah tidak ada, barisnya masih ada:
  zephyr.lang-asterisk   <- hapus barisnya agar pembersihan tidak setengah jalan
  zephyr.lang-clike
  zephyr.lang-css
  zephyr.lang-go
  zephyr.lang-javascript
  zephyr.lang-lua
  zephyr.lang-rust
  zephyr.lang-sql
  zephyr.lang-swift
  zephyr.lang-toml
  zephyr.lang-ttcn-cfg
  zephyr.lang-yaml

Sudah bersih ikonnya (1): zephyr.lang-properties
```

---

## 8. Pemeriksa: `scripts/cek-katalog-jumlah.mjs`

```
node scripts/cek-katalog-jumlah.mjs
```

- (a) hitung paket per kategori di `ext_bundled.rs` + `ext_bundled_extra.rs`;
- (b) bandingkan dengan HEAD lewat `git show HEAD:<berkas>` (`child_process`),
  cetak id hilang + id baru;
- (c) cetak rekap per kategori + total (keluaran worktree: 93 + 12 = **105**);
- (d) **exit 1** bila ada id yang ada di HEAD tapi hilang di worktree tanpa
  alasan di `DIBUANG_SENGAJA` (sudah diuji: satu entri dikomentari → exit 1,
  `dijelaskan DIBUANG_SENGAJA: 12/13`);
- (e) **peringatan** (bukan gagal) untuk id yang dibuang tapi barisnya masih ada
  di `ext_lang_icons.rs`, plus peringatan kalau ada entri `DIBUANG_SENGAJA` yang
  sebenarnya masih ada di katalog (daftar basi).

Keluaran ringkas saat ini:

```
src-tauri/src/ext_bundled.rs: 93 paket
src-tauri/src/ext_bundled_extra.rs: 12 paket
...
Total id unik  HEAD: 118   worktree: 105   selisih: 13
ID BARU DI WORKTREE (0): -
ID HILANG (13): ... dijelaskan DIBUANG_SENGAJA: 13/13
...
== REKAP ==
  total paket worktree : 105
  total id unik HEAD   : 118
  id hilang            : 13 (dijelaskan 13)
  id baru              : 0
  peringatan ikon/lain : 1

== katalog konsisten dengan HEAD ==   (exit 0)
```
