# RANCANGAN — Ganti Lintas Berkas & Autocomplete Inline

Item: **ZEPH-REPLACE-IN-FILES** (ganti teks lintas banyak berkas) ·
**ZEPH-AUTOCOMPLETE-INLINE** (penyelesaian kode otomatis di editor)
Tanggal: 2026-10-14 · Sifat: **READ-ONLY**. Tidak ada berkas produk yang diubah.
Artefak baru milik item ini: `scripts/uji-replace-multi-berkas.mjs`,
`scripts/uji-autocomplete-rencana.mjs`, dokumen ini, dan
`docs/USULAN-REPLACE-DAN-AUTOCOMPLETE.md`.

Semua angka di bawah adalah **keluaran nyata** dari perintah yang tertulis, bukan
ketikan ulang. Nomor baris adalah potret pada commit saat uji; sebutkan anchor
teksnya (yang juga dicantumkan) bila baris sudah bergeser.

---

## 0. Bukti (dijalankan)

| Perintah | Hasil |
|---|---|
| `node scripts/uji-replace-multi-berkas.mjs` | **26/26 LULUS, 0 GAGAL** (P 6/6, S 8/8, M 12/12) |
| `node scripts/uji-autocomplete-rencana.mjs` | **11/11 LULUS, 0 GAGAL** |
| `npx tsc --noEmit` | **exit 0** (tanpa galat tipe) |
| `cargo test --lib ganti_` (produk nyata, Rust) | **5 passed; 0 failed** — termasuk `search::tests::ganti_ditolak_saat_daftar_melebihi_batas`, `ganti_tepat_di_batas_tetap_mengganti_seperti_biasa`, `ganti_di_bawah_batas_tidak_berubah_hasilnya` |

Keluaran mentah ada di §4 dan §5.

---

## 1. Kondisi NYATA hari ini (dari kode, bukan asumsi)

### 1a. Ganti lintas berkas

Mesinnya ada dan sudah dijaga:

- `src-tauri/src/search.rs:701` — `pub const MAKS_BERKAS_GANTI: usize = 200;`
- `src-tauri/src/search.rs:718` — `pub fn ganti_lintas_berkas(...)`
- Penolakan pola kosong: `search.rs` (`opts.query.trim().is_empty()`) — **sebelum** loop.
- Penolakan daftar >200: `search.rs:733` `if files.len() > MAKS_BERKAS_GANTI { ... }`,
  pesannya menyebut **kedua angka** (batas dan jumlah yang diminta) — bukan
  dipotong diam-diam.
- Penjaga berkas rahasia & `.git`: `src/lib/zephyrTools/builtins.ts:89` `jagaTulis`
  memanggil `periksaTulis` di `src/lib/agentGuard.ts:214`, memakai
  `POLA_RAHASIA` (`agentGuard.ts:80`, termasuk `.env`, `*.pem`, `*.key`) dan
  `DIR_TERPROTEKSI` (`agentGuard.ts:115`, termasuk `/.git`).
- Pelaporan TS: `builtins.ts:970` `berubah = hasil.filter(h => h.jumlah > 0)`,
  `builtins.ts:973` `galat = hasil.filter(h => h.error)` — berkas yang gagal
  TIDAK masuk hitungan "sukses".

Uji unit Rust untuk batas ini **sudah ada** di `search.rs` (`ganti_ditolak_...`,
`ganti_tepat_...`, `ganti_di_bawah_...`) dan lulus (§0).

### 1b. Autocomplete inline

Penyedia penyelesaian **ADA**, di dua lapis:

1. **Lapisan completion (daftar dropdown)**: `src/lib/lspCm.ts:312`
   `autocompletionZephyr(...)` (dipakai editor di
   `src/components/editor/CodeMirrorEditor.tsx:366`), plus
   `snippetCompletionSource` (`lspCm.ts:148`). `maxRenderedOptions: 60`
   (`lspCm.ts:316`) adalah batas jumlah usulan yang ditampilkan.
2. **Lapisan saran-inline (ghost text)**: `src/lib/ghostPemasok.ts` — seam murni
   dengan `PEMASOK_LOKAL` (`ghostPemasok.ts:262`), batas
   `BATAS_PANJANG_SARAN = 120` (`:34`), `BATAS_KONTEKS_KARAKTER = 4000` (`:36`),
   `BATAS_KONTEKS_BARIS = 40` (`:38`), dan `saringRahasia` (`:138`).

**Celah yang ditemukan (apa adanya):** seam `ghostPemasok.ts` **BELUM
tersambung**. `src/lib/ghostText.ts:208` `mintaSaran` masih memanggil
`cmd.aiChat` langsung (`ghostText.ts:242`), dan tidak ada satu pun berkas app
yang mengimpor `ghostPemasok`. Jadi jawabannya bukan "TIDAK ADA penyedia" —
penyedianya ada, tapi lapisan ghost-nya belum dipakai editor.

---

## 2. Desain — Ganti lintas berkas

Tiga celah yang diangkat dari uji (semuanya **temuan**, lihat `S7`):

1. **Tidak ada lokasi.** `ReplaceHasil` (`search.rs:674`) hanya punya
   `path`, `jumlah`, `snapshot`, `error` — **tanpa nomor baris**. Pengguna diberi
   tahu *berapa* penggantian, tidak *di mana*.
2. **Tidak ada tanda baris kosong berlebih.** Penggantian yang menyisipkan
   `\n\n\n` (mis. pola mencakup dua baris lalu diganti teks berakhir ganda)
   menghasilkan baris kosong bertumpuk tanpa ditandai.
3. **Laporan TS tidak menyebut lokasi.** `builtins.ts:972` hanya
   "`path (N penggantian)`".

Desain usulan (detail patch di `USULAN-REPLACE-DAN-AUTOCOMPLETE.md`):

- Tambah medan `baris: Vec<usize>` pada `ReplaceHasil` — diisi dari posisi
  byte tiap kecocokan (`re.find_iter`) yang dikonversi ke nomor baris 1-basis.
- Tambah medan `barisKosongBerlebih: bool` — true bila isi baru memuat ≥3 baris
  kosong berurutan yang tidak ada di isi lama.
- Laporan TS menyebut hingga beberapa lokasi: `path (N): baris 12, 40`.

Invarian yang harus tetap benar (dijaga harness M): pola kosong ditolak; >200
ditolak menyebut angka; berkas rahasia/`.git` tak pernah disentuh; gagal tulis
→ `jumlah = 0` + `error` (bukan "sukses").

---

## 3. Desain — Autocomplete inline

Prinsip: **nol perintah Rust baru, nol jaringan di jalur default**. Lapisan sudah
ada; yang kurang cuma penyambungan.

- `ghostText.ts:208` `mintaSaran`: **coba seam lokal dulu** —
  `ambilSaran(konteks, bahasa, kunci)` (`ghostPemasok.ts:355`).
  Kalau seam mengembalikan usulan (bukan `null`), pakai itu dan **jangan**
  panggil `cmd.aiChat`. Kalau `null`, baru jatuh ke `cmd.aiChat` (perilaku
  sekarang) — jadi tidak ada regresi.
- Karena `ghostPemasok` murni, jalur lokalnya bisa jalan tanpa kunci API:
  mengisi saran sepele (`}`, ` {`, lanjutan baris atas) tanpa jaringan.
- Pemicu tetap **hanya di dalam editor**: keymap CodeMirror + event
  `ai-chunk`; tidak ada listener `keydown` global (dijaga kasus A5).
- Rahasia disaring: `saringRahasia` menutup kunci `sk-`, `AKIA`, `ghp_`,
  `xox[baprs]-`, `AIza`, `Bearer …`, blok `-----BEGIN … PRIVATE KEY-----`, dan
  daftar `kunci.rahasia` eksplisit (dijaga kasus A2).

Yang **TIDAK** dijanjikan: saran berbasis model (AI) tetap lewat `cmd.aiChat`
seperti sekarang; tidak ada perubahan protokol atau provider baru.

---

## 4. Keluaran nyata — harness replace (ringkas)

```
$ node scripts/uji-replace-multi-berkas.mjs
UJI REPLACE LINTAS BERKAS (item ZEPH-REPLACE-IN-FILES)
-- P. Penjaga berkas rahasia/.git (kode ASLI agentGuard.ts) --
LULUS P1  .git/config ditolak tulis (direktori terproteksi)
LULUS P2  .env ditolak tulis (pola berkas rahasia)
LULUS P3  src/.env.local di dalam workspace ditolak tulis
LULUS P4  kunci.pem ditolak tulis
LULUS P5  server.key ditolak tulis
LULUS P6  kontrol positif: src/a.ts DIIZINKAN tulis
-- S. Invarian sumber produk (search.rs + builtins.ts) --
LULUS S1  search.rs menetapkan MAKS_BERKAS_GANTI = 200 - nilai=200
LULUS S2  penolakan >batas menyebut ANGKA keduanya - batasInline=true jumlahInline=true
LULUS S3  penolakan terjadi SEBELUM loop - idxTolak=19225 idxLoop=19994
LULUS S4  pola kosong ditolak lewat trim().is_empty() sebelum loop
LULUS S5  galat per berkas menyetel jumlah: 0 DAN error terisi
LULUS S6  spec replace_in_files menandai pattern & replacement WAJIB
LULUS S7  temuan: ReplaceHasil TIDAK punya medan baris/lines
LULUS S8  pelaporan TS: berubah=jumlah>0, galat=error
-- M. Model acuan kontrak ganti lintas berkas --
LULUS M2  daftar 201 berkas -> DITOLAK, pesan menyebut 200 dan 201
LULUS M3  daftar tepat 200 berkas -> BOLEH (tidak dipotong) - hasil=200 berkas
LULUS M4  berkas di .git/ TIDAK pernah disentuh
LULUS M8  penggantian yang menghasilkan baris kosong berlebih DITANDAI
LULUS M9  tiap penggantian melaporkan berkas + NOMOR BARIS nyata - baris=[1,3,3]
LULUS M10  penulisan GAGAL -> TIDAK dilaporkan sukses (jumlah 0 + error)
RINGKASAN: 26/26 LULUS, 0 GAGAL
```

## 5. Keluaran nyata — harness autocomplete (ringkas)

```
$ node scripts/uji-autocomplete-rencana.mjs
== TEMUAN: titik sambung penyelesaian (dari sumber) ==
  lspCm.ts  autocompletionZephyr    : ADA
  lspCm.ts  snippetCompletionSource : ADA
  ghostPemasok.ts PEMASOK_LOKAL     : ADA
  ghostText.ts menyambung ghostPemasok: BELUM (mintaSaran masih ke cmd.aiChat)
LULUS A2  usulan TIDAK boleh memuat isi berkas rahasia
LULUS A3  batas PANJANG usulan disebut angkanya & ditegakkan - BATAS_PANJANG_SARAN=120
LULUS A4  batas KONTEKS yang dibaca disebut angkanya - KARAKTER=4000 BARIS=40
LULUS A5  pemicu HANYA di dalam editor (bukan hotkey global) - keydownGlobal=false
LULUS A6  penyedia penyelesaian ADA + titik sambung NYATA disebut
LULUS A8  modul pemasok MURNI: nol impor Tauri/jaringan
RINGKASAN: 11/11 LULUS, 0 GAGAL
```

Dan produk nyata (Rust):

```
$ cargo test --lib ganti_
test search::tests::ganti_ditolak_saat_daftar_melebihi_batas ... ok
test search::tests::ganti_tepat_di_batas_tetap_mengganti_seperti_biasa ... ok
test search::tests::ganti_di_bawah_batas_tidak_berubah_hasilnya ... ok
test result: ok. 5 passed; 0 failed; 499 filtered out
```

---

## 6. Matriks kasus harness

**`uji-replace-multi-berkas.mjs` (26 kasus)**

- **P (produk nyata, agentGuard.ts dibundel apa adanya)**: P1 `.git/` · P2 `.env`
  · P3 `.env.local` di dalam workspace · P4 `*.pem` · P5 `*.key` · P6 kontrol
  positif `src/a.ts`.
- **S (invarian sumber)**: S1 batas=200 · S2 pesan menyebut kedua angka · S3
  urutan tolak<loop · S4 pola kosong ditolak · S5 galat→jumlah 0+error · S6
  spec wajib · S7 **temuan**: tak ada medan baris · S8 berubah vs galat.
- **M (model acuan)**: M1 pola kosong ditolak · M2 201 ditolak menyebut angka ·
  M3 200 boleh · M4–M7 `.git`/`.env`/`.pem`/`.key` tak disentuh · M8 baris kosong
  berlebih ditandai · M9 berkas+baris nyata (`[1,3,3]`) · M10 gagal≠sukses · M11
  dryRun tak mengubah · M12 tanpa cocok→jumlah 0 tanpa galat.

**`uji-autocomplete-rencana.mjs` (11 kasus)**

- A1 saran kosong→null · A2 rahasia tak bocor · A3 batas panjang=120 · A4 batas
  konteks 4000/40 · A5 pemicu hanya di editor · A6 penyedia ADA + titik sambung ·
  A7 determinisme · A8 murni (nol impor) · A9 potong di batas · A10 seam mati→tak
  dipanggil · A11 pemasok melempar→null.

---

## 7. Batas & yang belum

- Verifikasi **UI/end-to-end** (ghost muncul & Tab menerima di editor hidup)
  **BUTUH APP** — harness ini Node-only, tidak menjalankan CodeMirror/Tauri.
- Mesin Rust `ganti_lintas_berkas` diuji lewat `cargo test` (produk nyata); salinan
  semantiknya di Node adalah **model acuan**, bukan produk.
- Belum ada: penyambungan seam (patch usulan), medan `baris`, tanda baris kosong
  berlebih. Semua masih usulan; lihat `docs/USULAN-REPLACE-DAN-AUTOCOMPLETE.md`.
