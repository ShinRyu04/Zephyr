# STATUS GATE NYATA — sapuan 8 gerbang

Repo: `D:/Zephyr` · branch `feat/ai-panel-vscode-layout` · Node v26.7.0 · npx 11.19.0 · cargo 1.99.0 (5f94df478 2026-08-27)
Waktu sapuan: 2026-10-14 ~06:06–06:20 (Asia/Jakarta)
Aturan dokumen ini: **keluaran apa adanya** (bukan simpulan dari kode exit saja). Tiap gerbang dikutip teksnya, kode exit dicatat, lalu verdikt mengikuti aturan: HIJAU = lulus dengan keluaran bersih; MERAH = ada kegagalan nyata di teks; BUTUH-APP = skrip tidak bisa jalan karena butuh aplikasi hidup (bukan lulus, bukan gagal kode).

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Katalog sekarang **68** tool
> (builtin 43, mcp 14, web 11) dan aktif-default **63** (`TOOL_INTI` 57 + `TOOL_WEB_AKTIF_AWAL` 6);
> `TOOL_DIKIRIM_SELALU` tetap **26**. Semua angka dihitung dari `src/lib/zephyrTools/catalog.ts`.
> Sapuan di dokumen ini berjalan saat katalog masih **67** / aktif **62** (sebelum `zephyr_kode` masuk
> katalog) — kutipan verbatim di bawah karena itu **tidak diubah**: ia bukti hari itu, bukan keadaan sekarang.

## Tabel gerbang

| # | Perintah | Hasil teks ringkas (apa adanya) | Exit | Verdikt |
| --- | --- | --- | --- | --- |
| 1 | `npx tsc --noEmit` | (tidak ada keluaran sama sekali, 0 baris) | 0 | **HIJAU** |
| 2 | `node scripts/verify11.mjs` | `verify11 error: fetch failed` (1 baris) | 2 | **BUTUH-APP** |
| 3 | `node scripts/uji-kesiapan-tool.mjs` | `GAGAL: 4 dari 6 tugas menembus batas 20:` / `HASIL: BELUM LOLOS (exit 1) — lihat bagian (b)/(c) di atas.` | 1 | **MERAH** |
| 4 | `node scripts/uji-kesiapan-fitur.mjs` | `== LULUS == (exit 0)` | 0 | **HIJAU** (dengan temuan tercatat) |
| 5 | `node scripts/cek-indeks-sinkron.mjs` | `BASI - 5 keluhan` | 1 | **MERAH** |
| 6 | `node scripts/cek-batas-inti.mjs` | `VERDICT: GAGAL - 1 pemeriksaan: indeks sinkron dengan sumber` | 1 | **MERAH** |
| 7 | `node scripts/cek-bundel-docs.mjs` | `SKOR: 47/50 diperiksa` / `VERDICT BUNDEL DOKUMEN: GAGAL - 3 merah: artefak sinkron dengan berkas di disk \| jumlah berkas nyata == terbaca \| tidak ada berkas nyata yang hilang dari bundel` | 1 | **MERAH** |
| 8 | `cd src-tauri && cargo test --lib` | `test result: FAILED. 487 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.36s` / `CARGO_EXIT=101` | 101 | **MERAH** |

Ringkas: **1 hijau** (tsc), **1 hijau bertemuan** (kesiapan-fitur: lulus tapi melaporkan target per-giliran masih dilewati), **5 merah** (kesiapan-tool, indeks-sinkron, batas-inti, bundel-docs, cargo test), **1 butuh-app** (verify11). Total 8 gerbang, semuanya dijalankan; tidak ada yang ditandai hijau tanpa bukti.

## 1. `npx tsc --noEmit` — HIJAU

```
$ cd /d/Zephyr && npx tsc --noEmit
TSC_EXIT=0
--- output (head 40) ---
--- lines: 0
```

Tidak ada satu baris pun keluaran; tidak ada galat tipe. Verdikt HIJAU.

## 2. `node scripts/verify11.mjs` — BUTUH-APP

```
$ node scripts/verify11.mjs
verify11 error: fetch failed
VERIFY11_EXIT=2
--- baris: 1 ---
```

Teksnya satu baris: `verify11 error: fetch failed`. Skrip ini bekerja lewat HTTP/CDP ke aplikasi yang berjalan; karena tidak ada app/endpoint hidup di sesi sapuan ini, ia berhenti dengan `fetch failed`. Jadi **bukan MERAH dan bukan HIJAU** — bukti belum bisa didapat tanpa aplikasi menyala. Perlu dijalankan ulang dengan app hidup untuk verdikt sebenarnya.

## 3. `node scripts/uji-kesiapan-tool.mjs` — MERAH

Potongan keluaran asli:

```
== (a) Tool yang DITAWARKAN per giliran ==
sumber angka   : impor src/lib/toolGate.ts (TOOL_AKTIF_AWAL)
katalog        : 67 tool (builtin 42, mcp 14, web 11)
aktif default  : 62 tool
dikirim selalu : 26 tool
batas kebijakan: 20 tool per giliran

17 tool          | web=tidak berat=tidak | baca berkas
23 tool >> TEMBUS 20 | web=tidak berat=tidak | perbaiki kode + uji
23 tool >> TEMBUS 20 | web=tidak berat=ya | tulis banyak berkas
20 tool          | web=ya berat=tidak | tugas web + berkas
23 tool >> TEMBUS 20 | web=tidak berat=tidak | berat: shell + hapus
23 tool >> TEMBUS 20 | web=tidak berat=tidak | berat: repo-wide + tulis

== (b) Batas per giliran ==
GAGAL: 4 dari 6 tugas menembus batas 20:
  - perbaiki kode + uji (Perbaiki bug di src/lib/zephyrTools/builtins.ts …) = 23
  - tulis banyak berkas (Tulis 20 komponen React baru untuk halaman admin…) = 23
  ...
HASIL: BELUM LOLOS (exit 1) — lihat bagian (b)/(c) di atas.
```

Catatan tambahan yang ikut tercetak (temuan di dalam teks, bukan verdikt):

```
- mcp__zephyr__extension dan mcp__zephyr__wait_for_terminal juga STUB: keduanya melaporkan sukses
  tanpa melakukan apa pun (mcp.ts:332-336, 501-505) — "sukses palsu" lebih buruk daripada error.
```

Verdikt MERAH: 4 dari 6 tugas menembus batas 20 tool.

## 4. `node scripts/uji-kesiapan-fitur.mjs` — HIJAU (dengan temuan tercatat)

Baris terakhir:

```
== LULUS == (exit 0)
```

Potongan temuan asli di dalam keluaran (sengaja dikutip, karena ini bagian dari hasil):

```
akar repo: D:\Zephyr
== A. PENYARING TOOL PER GILIRAN (target <= 20) ==
  26  LEWAT  WEB, ada folder
  17  OK     WEB, tanpa folder
  23  LEWAT  tulis berkas, tanpa web, ada folder
  14  OK     tulis berkas, tanpa web, tanpa folder
  17  OK     tanya/baca, tanpa web, ada folder
  14  OK     tanya/baca, tanpa web, tanpa folder
  MAKS per giliran : 26  (target 20) -> MELEWATI TARGET (sudah ada sebelum spike)
  katalog total    : 67 (builtin 42 + mcp 14 + web 11)
  DIKIRIM_SELALU   : 26
  [150] Pane BROWSER bawaan + otomasi
     pakai-ulang : 5/5 ada
     celah       : browser_pick (selektor) TIDAK ADA; screenshot sengaja tidak didukung
```

Verdikt HIJAU menurut skripnya sendiri (exit 0, "LULUS"), tetapi keluaran yang sama menyatakan target per giliran masih dilewati (26 > 20, "sudah ada sebelum spike") dan celah `browser_pick` masih terbuka. Keduanya dicatat apa adanya.

## 5. `node scripts/cek-indeks-sinkron.mjs` — MERAH

Keluaran lengkap (28 baris):

```
cek-indeks-sinkron - src/lib/zephyrIndeks.ts
  ok   artefak terbaca (6212 entri) - 1033126 byte, cap 1.1.13 / f83cc022d0c620db

1. cap versi + hash sumber (deteksi basi)
  ok   versi indeks = versi app (1.1.13) - tauri=1.1.13 pkg=1.1.13
  ok   hash sumber terisi (f83cc022d0c620db)
  BASI generator --check (berkas hasil generate = sumber) - src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbernya.
  BASI hash indeks = hash sumber sekarang (f83cc022d0c620db vs 6836342b7ae8b298) - indeks dibuat dari sumber yang lebih lama -> Zeph harus bilang "jawaban bisa basi"

2. peta kode: entri yang basi
  ok   berkas entri peta kode masih ada (404/404)
  ok   entri bisa diparse (404/404)
  BASI jumlah baris masih cocok (382/404) - src-tauri/src/cron.rs (314 -> 754), src-tauri/src/ext_lang_icons.rs (76 -> 64), src-tauri/src/ext_pkg.rs (2040 -> 2302), src-tauri/src/fs_utils.rs (496 -> 733), src-tauri/src/lib.rs (608 -> 612), src-tauri/src/search.rs (982 -> 1132), ...(+16)
  ok   simpul yang tercatat masih ada di berkasnya (404/404)
   ringkas basi: berkas hilang 0 · baris geser 22 · simbol hilang 0 · entri rusak 0
  BASI semua berkas sumber punya entri peta kode (404/420) - src-tauri/src/tangkap_layar.rs, src/lib/alurVerifikasi.ts, src/lib/analisGambar.ts, src/lib/antreanPesan.ts, src/lib/ghostPemasok.ts, src/lib/hunkUnified.ts, ...(+10)

3. cakupan label UI (kamus + permukaan komponen)
  ok   kunci kamus punya entri label (2761/2761)
   entri permukaan per berkas komponen: 141/158 (sisanya tanpa teks yang dibaca user, mis. src/components/ai/AiIkon.tsx, ...)
  BASI label/teks permukaan bisa dicari (3170/3175) - "ai-tabel-bungkus" @ src/components/ai/ChatMessage.tsx, "theme-hitung" @ src/components/settings/SectionsBasic.tsx, "theme-preview-besar" @ src/components/settings/SectionsBasic.tsx, "theme-preview-besar-nama" @ src/components/settings/SectionsBasic.tsx, "theme-kosong" @ src/components/settings/SectionsBasic.tsx
   kamus 2761 kunci -> 3020 entri label; permukaan 158 berkas -> 3175 teks unik

4. jumlah entri per jenis (total 6212)
   bridge=1, dokumen=176, ekstensi=17, kode=404, label=3023, layar=1976, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=67
   label unik=3020, teks label unik=2853

BASI - 5 keluhan
```

Verdikt MERAH: indeks `src/lib/zephyrIndeks.ts` basi (hash f83cc022d0c620db vs sumber sekarang 6836342b7ae8b298). Perbaikan yang skrip ini sebut: `node scripts/gen-fakta-zephyr.mjs`.

## 6. `node scripts/cek-batas-inti.mjs` — MERAH

Keluaran lengkap (9 baris):

```
CEK BATAS INTI (pengetahuan dua lapis, ai-tahu-100-7)
  OK    ukuran blok inti                   7950 char ~ 1988 token (ambang 8000 char ~ 2000 token)
  OK    inti menyebut zephyr_self          ya
  OK    zephyr_self dikirim selalu         ya (26 tool selalu dikirim)
  OK    kategori indeks terisi             6212 entri; bridge=1 dokumen=176 ekstensi=17 kode=404 label=3023 layar=1976 menu=122 panel=22 perintah=179 pintasan=66 port=4 seksi=31 setelan=124 tool=67
src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbernya.
Jalankan: node scripts/gen-fakta-zephyr.mjs
  GAGAL indeks sinkron dengan sumber       BASI/GAGAL (exit 1) Jalankan: node scripts/gen-fakta-zephyr.mjs
  VERDICT: GAGAL - 1 pemeriksaan: indeks sinkron dengan sumber
```

Verdikt MERAH, dengan sebab **tunggal**: indeks basi (yaitu keluhan yang sama dengan gerbang 5). Tiga pemeriksaan batas inti lainnya OK.

## 7. `node scripts/cek-bundel-docs.mjs` — MERAH

Baris kunci keluaran asli:

```
  GAGAL artefak sinkron dengan berkas di disk  [BASI: D:\Zephyr\src\lib\zephyrDokumenData.ts tidak sama dengan hasil panen sekarang (52 berkas / 625 bagian). Jalankan: node scripts/gen-dokumen-bundel.mjs]
  GAGAL jumlah berkas nyata == terbaca  [52 vs 41]
  GAGAL tidak ada berkas nyata yang hilang dari bundel  [hilang: docs/ANAK-AGEN-PERILAKU.md, docs/ANTREAN-PESAN-AGEN.md, docs/BATAS-DAN-JADWAL.md, docs/GHOST-175.md, docs/KONTEKS-ZEPHYR.md, docs/LAPORAN-TEMA-DAN-DEKORASI.md, docs/REPRO-BUG-KEJAM.md, docs/STATUS-ITEM-KANONIK.md, docs/USULAN-SUBSET-TUGAS.md, docs/USULAN-SUNTIK-KONTEKS.md, docs/USULAN-TEMA-DAN-DEKORASI.md]
  ANGKA BATAS_HASIL_BAWAAN / MAKS              8 / 30
  ANGKA BATAS_KARAKTER_HASIL / POTONGAN        6000 / 240
  ANGKA BATAS_HASIL_SUNTIK / KARAKTER_SUNTIK   6 / 1500
  OK    batas besar dijepit BATAS_HASIL_MAKS  [30 <= 30 (diminta 9999)]
  SKOR: 47/50 diperiksa
  VERDICT BUNDEL DOKUMEN: GAGAL - 3 merah: artefak sinkron dengan berkas di disk | jumlah berkas nyata == terbaca | tidak ada berkas nyata yang hilang dari bundel
```

Verdikt MERAH (3 merah dari 50 pemeriksaan; 47 OK). Dua catatan kejujuran:
- Bundel dokumen panen (`src/lib/zephyrDokumenData.ts`) basi: panen sekarang menghasilkan 52 berkas / 625 bagian, tersimpan masih 41 berkas / 458 bagian (perbaikan: `node scripts/gen-dokumen-bundel.mjs`).
- Daftar "hilang dari bundel" memuat **`docs/STATUS-ITEM-KANONIK.md`** — itu dokumen yang baru saya tulis di sapuan ini; ia ikut masuk daftar karena bundel belum dipanen ulang, bukan karena cacat dokumen.

## 8. `cd src-tauri && cargo test --lib` — MERAH

Dijalankan sebagai proses latar (log penuh: `scan-docs/g8-cargo-test.txt`, 673 baris). Awalnya menunggu kunci build milik lane lain:

```
    Blocking waiting for file lock on package cache
    Blocking waiting for file lock on build directory
```

Baris hasil dan kegagalan apa adanya:

```
test result: FAILED. 487 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.36s
error: test failed, to rerun pass `--lib`
CARGO_EXIT=101
```

Rincian 3 uji yang gagal (kutipan panik asli):

```
failures:

---- cli_agents::tests::baca_shim_npm_mengenali_shim stdout ----
thread 'cli_agents::tests::baca_shim_npm_mengenali_shim' (59780) panicked at src\cli_agents.rs:427:34:
shim harus dikenali

---- tulis_aman::tests::menimpa_isi_lama stdout ----
thread 'tulis_aman::tests::menimpa_isi_lama' (54612) panicked at src\tulis_aman.rs:115:39:
called `Result::unwrap()` on an `Err` value: Internal("gagal menyimpan C:\\Users\\Zyrex\\AppData\\Local\\Temp\\zephyr-tulis-atomik\\timpa\\a.txt: The system cannot find the path specified. (os error 3)")

---- tulis_aman::tests::tidak_meninggalkan_berkas_sementara stdout ----
thread 'tulis_aman::tests::tidak_meninggalkan_berkas_sementara' (47656) panicked at src\tulis_aman.rs:128:38:
called `Result::unwrap()` on an `Err` value: Internal("gagal menyimpan C:\\Users\\Zyrex\\AppData\\Local\\Temp\\zephyr-tulis-atomik\\bersih\\a.txt: The system cannot find the path specified. (os error 3)")

failures:
    cli_agents::tests::baca_shim_npm_mengenali_shim
    tulis_aman::tests::menimpa_isi_lama
    tulis_aman::tests::tidak_meninggalkan_berkas_sementara
```

Verdikt MERAH: 487 lulus / 3 gagal (exit 101). Dua kegagalan `tulis_aman` adalah `os error 3` (path sementara `zephyr-tulis-atomik` tidak ada — dugaan kuat karena TMPDIR/TEMP di sesi ini mengarah ke temp yang berbeda, bukan cacat kode produk); satu kegagalan `cli_agents::baca_shim_npm_mengenali_shim` murni assertion `shim harus dikenali`. Dua-duanya dilaporkan apa adanya tanpa penyimpulan tambahan.

