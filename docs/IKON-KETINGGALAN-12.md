# IKON-KETINGGALAN-12 — LOGO_URI & paket bahasa yang sudah dibuang

Status: **TIDAK ADA IKON MATI tersisa** — 12 id yang jadi dasar temuan sudah
dipangkas dari `LOGO_URI` (73 → 61); **0 id dibersihkan pada sesi ini** karena
tidak ada sisa yang mati. Tidak ada baris yang diubah di
`src-tauri/src/ext_lang_icons.rs` (tidak ada yang perlu diubah).

Item kanonik: `zeph-ikon-ketinggalan-12` — *(temuan 2026-10-14 dari
`cek-katalog-jumlah.mjs`): 12 id di `LOGO_URI` (`src-tauri/src/ext_lang_icons.rs`)
tidak pernah cocok karena paketnya sudah dibuang.*

---

## 1. Angka sebenarnya

| Ukuran | Nilai |
| --- | --- |
| `LOGO_URI` di **HEAD** | 73 id |
| `LOGO_URI` di **worktree** | 61 id |
| **Dipangkas (HEAD → worktree)** | **12 id** |
| Ikon **mati** tersisa di worktree | **0** |
| Id **dibersihkan pada sesi ini** | **0** |
| Id **ganda** di `LOGO_URI` | 0 |
| Paket bahasa di katalog (worktree) | 88 id |

Kesimpulan: temuan itu **nyata saat dilaporkan** (73 entri, 12 di antaranya
menunjuk paket yang sudah dibuang), tetapi **sudah diperbaiki** oleh pemangkasan
73 → 61 pada lane yang sama. Yang tersisa di worktree: **nol** ikon mati.

---

## 2. Cara membuktikan

Sumber "paket benar-benar ada" (dibaca apa adanya dari berkas Rust, tanpa app):

1. **Manifest katalog** — `"id": "zephyr.lang-…"` di dalam
   `src-tauri/src/ext_bundled.rs` + `src-tauri/src/ext_bundled_extra.rs`
   (id inilah yang ditampilkan ke pengguna).
2. **Array `PAKET_BAHASA`** — `src-tauri/src/ext_bundled.rs:934`; inilah daftar
   yang benar-benar diiterasi `index_bundled()` saat mencocokkan `LOGO_URI`
   (`src-tauri/src/ext_bundled.rs:1553` → `meta_bahasa(id, …)` →
   `LOGO_URI.iter().find(|(pid, _)| *pid == id)`, baris ~1494).

Sebuah id di `LOGO_URI` **mati** bila tidak ada di kedua sumber itu. Hasil
perbandingan worktree: **himpunan mati = {} (kosong)** — 61/61 id `LOGO_URI`
punya paket.

### 12 id yang menjadi dasar temuan (semuanya sudah tidak ada di `LOGO_URI`)

Bukti "paketnya sudah dibuang" = id tidak lagi ada di katalog (`cek-katalog-jumlah.mjs`
bagian *ID HILANG (13)*) **dan** bahasa itu kini ditangani sebagai bahasa native,
bukan paket bahasa:

| id (sudah dipangkas) | bukti paket dibuang / beralih ke native | berkas:baris |
| --- | --- | --- |
| `zephyr.lang-asterisk` | Asterisk native lewat `legacy-modes/mode/asterisk` | `src/lib/cmLegacyModes.ts:18` |
| `zephyr.lang-clike` | C-like native lewat `legacy-modes/mode/clike` | `src/lib/cmLegacyModes.ts:20` |
| `zephyr.lang-css` | CSS native lewat `@codemirror/lang-css` | `package.json:61` |
| `zephyr.lang-go` | Go native lewat `@codemirror/lang-go` | `package.json:62` |
| `zephyr.lang-javascript` | JS/TS native lewat `@codemirror/lang-javascript` | `package.json:65` |
| `zephyr.lang-lua` | Lua native lewat `legacy-modes/mode/lua` | `src/lib/cmLegacyModes.ts:55` |
| `zephyr.lang-rust` | Rust native lewat `@codemirror/lang-rust` | `package.json:69` |
| `zephyr.lang-sql` | SQL native lewat `@codemirror/lang-sql` | `package.json:70` |
| `zephyr.lang-swift` | Swift native lewat `legacy-modes/mode/swift` | `src/lib/cmLegacyModes.ts:96` |
| `zephyr.lang-toml` | TOML native lewat `legacy-modes/mode/toml` | `src/lib/cmLegacyModes.ts:101` |
| `zephyr.lang-ttcn-cfg` | TTCN-CFG native lewat `legacy-modes/mode/ttcn-cfg` | `src/lib/cmLegacyModes.ts:104` |
| `zephyr.lang-yaml` | YAML native lewat `@codemirror/lang-yaml` | `package.json:72` |

Catatan: daftar `DIBUANG_SENGAJA` di `scripts/cek-katalog-jumlah.mjs:57` memuat
**13** id (12 di atas + `zephyr.lang-properties`, lihat `cmLegacyModes.ts:73`).
`zephyr.lang-properties` **tidak pernah** ada di `LOGO_URI` (tidak termasuk 73
maupun 61), jadi dari sisi ikon jumlah yang relevan tetap **12**.

### Bukti langsung (diff HEAD → worktree, id `LOGO_URI` yang hilang)

```
2d1
< zephyr.lang-asterisk
4d2
< zephyr.lang-clike
11d8
< zephyr.lang-css
24d20
< zephyr.lang-go
29d24
< zephyr.lang-javascript
33d27
< zephyr.lang-lua
49d42
< zephyr.lang-rust
56d48
< zephyr.lang-sql
59d50
< zephyr.lang-swift
63d53
< zephyr.lang-toml
65d54
< zephyr.lang-ttcn-cfg
73d61
< zephyr.lang-yaml
```

Tepat 12 baris, semuanya persis id yang paketnya dibuang → **tidak ada sisa**.

### 61 id yang masih ada di `LOGO_URI` (semua punya paket di `PAKET_BAHASA`)

`apl, brainfuck, clojure, cmake, cobol, coffeescript, commonlisp, crystal,
cypher, d, diff, dockerfile, dtd, dylan, elm, erlang, forth, fortran, gas,
gherkin, groovy, haskell, haxe, http, jinja2, julia, livescript, mathematica,
mllike, nginx, nsis, octave, pascal, perl, powershell, protobuf, pug, puppet,
python, q, r, ruby, sas, sass, scheme, shell, solr, sparql, stex, stylus, tcl,
textile, tiddlywiki, ttcn, vb, velocity, verilog, vhdl, wast, xml, xquery`

---

## 3. Penjaga otomatis

`scripts/uji-ikon-bersih.mjs` (BARU, node-only, tanpa app) menuntut, dari sumber
Rust yang nyata:

1. setiap id `LOGO_URI` punya paket yang benar-benar ada (daftar mati = kosong);
2. tidak ada id ganda di `LOGO_URI`;
3. jumlah id tercetak sebelum/sesudah, lalu menutup dengan `== n/n lulus ==`;
4. `exit != 0` bila ada satu saja yang gagal.

---

## 4. Keluaran nyata tiap perintah

### (a) `node scripts/uji-ikon-bersih.mjs` → exit **0**

```
== UJI IKON BERSIH (LOGO_URI vs katalog paket bahasa) ==

Akar kerja: D:\Zephyr

SEBELUM:
  id di LOGO_URI (HEAD)      : 73
  id di LOGO_URI (worktree)  : 61

SESUDAH (setelah id mati dibuang):
  id di LOGO_URI             : 61
  id ikon mati dibuang       : 0

Katalog paket bahasa terbaca : 88 id

  LULUS  katalog paket terbaca (parser tidak kosong)
  LULUS  LOGO_URI tidak kosong
  LULUS  tidak ada id ganda di LOGO_URI
  LULUS  setiap id LOGO_URI punya paket yang ada (daftar mati kosong)

== 4/4 lulus ==
```

### (b) `node scripts/cek-katalog-jumlah.mjs` → exit **0**

```
== JUMLAH PAKET KATALOG BAWAAN ==

Akar kerja: D:\Zephyr

src-tauri/src/ext_bundled.rs: 93 paket
src-tauri/src/ext_bundled_extra.rs: 12 paket

GABUNGAN:
    Languages        88
    — total —       105

== IKON BAHASA (ext_lang_icons.rs) ==

Total id ikon bahasa: 61
Id yang sudah dibuang katalognya: 13

OK - tidak ada ikon ketinggalan

== REKAP ==
  total paket worktree : 105
  total id unik HEAD   : 118
  id hilang            : 13 (dijelaskan 13)
  id baru              : 0
  peringatan ikon/lain : 0

== katalog konsisten dengan HEAD ==
```

### (c) `cd src-tauri && cargo test --lib` → exit **0**

```
test result: ok. 503 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.70s
```

Gerbang **≥ 490 lulus / 0 gagal** aman: **503 lulus / 0 gagal**.
(Tidak ada berkas Rust yang disentuh pada sesi ini, jadi angka tes tidak berubah;
peringatan `unused import` yang muncul sudah ada sebelumnya dan tak terkait.)

---

## 5. Sisa yang butuh app — BUTUH APP

Semua klaim di atas berbasis berkas sumber (statis) dan lulus tanpa app.
Yang **belum** bisa diverifikasi di lane node-only ini:

- **Apakah tiap bahasa menampilkan ikon yang benar di UI hidup** (logo pada
  daftar paket bahasa), termasuk bahwa bahasa yang ikonnya sudah dipangkas
  (CSS/Go/JS/Rust/SQL/YAML/dll.) jatuh ke ikon bawaan dengan rapi. —

  **BUTUH APP** (jalankan Zephyr, buka panel Extensions/Languages, periksa
  ke-61 ikon + bahasa native yang dipangkas).
