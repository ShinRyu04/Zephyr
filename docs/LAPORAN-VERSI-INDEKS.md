# LAPORAN - cap versi + hash sumber indeks Zephyr (item ZEPH-VERSI-INDEKS-BASI)

Tanggal: 2026-10-14 · Cabang: `feat/ai-panel-vscode-layout` · Alat: `scripts/uji-versi-indeks.mjs`

> STATUS: SELESAI. Setiap angka di bawah keluaran nyata dari perintah yang tertulis di
> bagiannya; tidak ada angka yang dihitung di kepala. Tidak ada berkas produk yang diubah
> (semua usulan ada di `docs/USULAN-VERSI-INDEKS.md`), dan generator indeks/fakta TIDAK
> dijalankan ulang - `cek-indeks-sinkron` dipakai apa adanya.

## 1. Ringkas

| | TERSIMPAN (yang ikut bundel) | NYATA (dihitung dari sumber sekarang) |
|---|---|---|
| versi app | `1.1.13` | `1.1.13` |
| hash sumber | `f83cc022d0c620db` | `26e682bb085f4c80` |
| jumlah entri | 6.212 | 6.248 |

*(angka pada saat pencatatan; pohon sumbernya hidup dan bergerak - lihat bagian 3b)*

**Indeks yang dibundel BASI.** Hash sumbernya dibuat dari pohon sumber yang lebih tua;
tertinggal **36 entri** (peta kode +20, permukaan/layar +16) dan **20 berkas sumber belum
punya entri peta kode** sama sekali. Versi app kebetulan masih sama (`1.1.13` di kedua sisi),
jadi pemeriksaan kebasian yang ADA di app hari ini **tidak melihatnya**: `src/lib/zephyrTools/zephyrSelf.ts:404`
dan `:540` menyimpulkan `basi` hanya dari `vApp !== vIndeks` - versi saja, hash tidak pernah
dibandingkan. Itu celah yang ditutup usulan di `docs/USULAN-VERSI-INDEKS.md`.

Cap ternyata SUDAH ada di artefak (versi + hash), dan hashnya SUDAH dihitung dari isi sumber
(bukan waktu/locale/mesin) - yang belum ada adalah **pembandingnya di app**. Jadi pekerjaan
yang tersisa bukan "menambah cap", tapi "membuat Zeph memeriksa cap itu dan menawarkan
perbaikan".

## 2. Cap tersimpan vs cap nyata

Cap tersimpan (bundel):

- `src/lib/zephyrIndeks.ts:28` - `export const FAKTA_VERSI = { aplikasi: '1.1.13', hashSumber: 'f83cc022d0c620db' } as const;`
- `src/lib/zephyrIndeks.ts:15` (komentar kepala) - `Versi app: 1.1.13 · hash sumber: f83cc022d0c620db`
- Dibaca runtime lewat `src/lib/zephyrCari.ts:250-252` (`versiFakta()`), dipakai di
  `zephyrSelf.ts:400/410/411/474/482`.

Cap nyata (`node scripts/gen-fakta-zephyr.mjs --print-cakupan`, tanpa menulis):

```
aplikasi=1.1.13  hashSumber=26e682bb085f4c80  entri=6.248
bridge=1, dokumen=176, ekstensi=17, kode=424, label=3023, layar=1992, menu=122,
panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=67
```

Hash itu **bukan stempel waktu**: `gen-fakta-zephyr.mjs:1193-1223` menghitung `sha1` atas
pasangan `nama relatif + '\u0000' + isi byte + '\u0000'` untuk daftar tertutup `SUMBER_HASH`
(`:1158-1185`) ditambah berkas permukaan (`berkasPermukaan()`, `:1213`), lalu mengambil
16 huruf hex pertama (`:1222`). Tidak ada mtime, nama mesin, jam, atau locale di dalamnya -
dibuktikan di kasus 3/4/5 harness.

## 3. Berapa yang tertinggal

`node scripts/cek-indeks-sinkron.mjs` - kode keluar **1**, **5 keluhan**, keluaran apa adanya:

```
cek-indeks-sinkron - src/lib/zephyrIndeks.ts
  ok   artefak terbaca (6212 entri) - 1033126 byte, cap 1.1.13 / f83cc022d0c620db

1. cap versi + hash sumber (deteksi basi)
  ok   versi indeks = versi app (1.1.13) - tauri=1.1.13 pkg=1.1.13
  ok   hash sumber terisi (f83cc022d0c620db)
  BASI generator --check (berkas hasil generate = sumber) - src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbernya.
  BASI hash indeks = hash sumber sekarang (f83cc022d0c620db vs 26e682bb085f4c80) - indeks dibuat dari sumber yang lebih lama -> Zeph harus bilang "jawaban bisa basi"

2. peta kode: entri yang basi
  ok   berkas entri peta kode masih ada (404/404)
  ok   entri bisa diparse (404/404)
  BASI jumlah baris masih cocok (377/404) - src-tauri/src/cron.rs (314 -> 754), src-tauri/src/ext_lang_icons.rs (76 -> 64), src-tauri/src/ext_pkg.rs (2040 -> 2302), src-tauri/src/fs_utils.rs (496 -> 733), src-tauri/src/lib.rs (608 -> 616), src-tauri/src/search.rs (982 -> 1132), ...(+21)
  ok   simpul yang tercatat masih ada di berkasnya (404/404)
   ringkas basi: berkas hilang 0 · baris geser 27 · simbol hilang 0 · entri rusak 0
  BASI semua berkas sumber punya entri peta kode (404/424) - src-tauri/src/tangkap_layar.rs, src-tauri/src/worktree.rs, src/components/extensions/bahasaTerpasang.ts, src/lib/alurVerifikasi.ts, src/lib/analisGambar.ts, src/lib/antreanPesan.ts, ...(+14)

3. cakupan label UI (kamus + permukaan komponen)
  ok   kunci kamus punya entri label (2761/2761)
   entri permukaan per berkas komponen: 141/158 (sisanya tanpa teks yang dibaca user, mis. src/components/ai/AiIkon.tsx, src/components/ai/CmdIkon.tsx, src/components/ai/DragonIcon.tsx, ...(+14))
  BASI label/teks permukaan bisa dicari (3170/3186) - "ai-tabel-bungkus" @ src/components/ai/ChatMessage.tsx, "ext-catatan-bahasa" @ src/components/extensions/ExtensionsView.tsx, "Bahasa vs bawaan" @ src/components/extensions/ExtensionsView.tsx, "diff-hunks" @ src/components/scm/DiffViewer.tsx, "diff-hunks-ringkas" @ src/components/scm/DiffViewer.tsx, "diff-hunks-terima-semua" @ src/components/scm/DiffViewer.tsx ...(+10)
   kamus 2761 kunci -> 3020 entri label; permukaan 158 berkas -> 3186 teks unik

4. jumlah entri per jenis (total 6212)
   bridge=1, dokumen=176, ekstensi=17, kode=404, label=3023, layar=1976, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=67
   label unik=3020, teks label unik=2853

BASI - 5 keluhan
```

Angka yang tertinggal, diringkas dari keluaran di atas:

| yang tertinggal | angka |
|---|---|
| hash sumber | `f83cc022d0c620db` (tersimpan) vs `26e682bb085f4c80` (nyata) |
| entri | 6.212 tersimpan vs 6.248 nyata = **36** (kode +20, layar +16) |
| berkas sumber tanpa entri peta kode | **20** dari 424 (nama sisanya dipotong `...(+14)` di keluaran) |
| berkas yang jumlah barisnya bergeser | **27** dari 404 (377 masih cocok) |
| label/teks permukaan tak terjangkau | **16** dari 3186 (3170 masih tercari) |
| keluhan pemeriksa | **5** |

Catatan kejujuran soal angka 27: keluaran itu memotong daftarnya (`...(+21)`) dan
`cek-indeks-sinkron` menghitung berkas dari pohon yang hidup, jadi angka ini bergerak kalau
ada berkas sumber disunting lagi - 377/404 dan "baris geser 27" konsisten satu sama lain
(404 - 27 = 377). Harness membaca angka yang sama dari keluaran yang sama (kasus 12/18),
bukan angka sendiri.

## 3b. Angka ini bergerak (pohon sumber hidup)

Angka di bagian 3 adalah potret satu waktu. Menjelang akhir pengerjaan, pohon sumber
bertambah 5 berkas (ada suntingan bersamaan di cabang ini), dan pemeriksa yang dijalankan
ulang mencetak angka yang lebih besar - apa adanya:

```
  BASI jumlah baris masih cocok (374/404) - ... ...(+24)
   ringkas basi: berkas hilang 0 · baris geser 30 · simbol hilang 0 · entri rusak 0
  BASI semua berkas sumber punya entri peta kode (404/429) - ... ...(+19)
BASI - 5 keluhan
```

dan `--print-cakupan` menyebut `kode=429` (dari 424), sementara

```
uji-versi-indeks: 18/18 lulus, 0 gagal, 0 dilewati - cap tersimpan 1.1.13 / f83cc022d0c620db vs cap nyata 1.1.13/26e682bb085f4c80; tertinggal 25 berkas peta kode dari 429 dan 41 entri
```

Dua hal penting dari pergeseran ini:

1. **Hash sumber TIDAK berubah** (`26e682bb085f4c80` di kedua potret) padahal 5 berkas baru
   muncul. Artinya berkas baru itu **tidak masuk daftar `SUMBER_HASH`** - jadi cap hash lebih
   sempit daripada pemindai entri, persis seperti yang diukur kasus 7. Ini bukan alasan untuk
   meninggalkan cap hash (ia menangkap perubahan 1 byte pada berkas yang memang dikunci -
   kasus 6), tapi alasan kenapa usulan tetap menjadikan `--check`/`cek-indeks-sinkron` sebagai
   pemeriksa utama dan cap hash sebagai penanda cepat.
2. **Kesimpulan "BASI" tidak berubah** (`5 keluhan`, kode keluar 1, hash tersimpan
   `f83cc022d0c620db` != nyata `26e682bb085f4c80`), dan porosnya adalah hash - bukan versi,
   yang tetap `1.1.13` di kedua sisi. Ini contoh hidup dari celah yang ditutup usulan: app
   hari ini akan bilang "segar" untuk pohon yang makin tertinggal.

## 4. Bukti harness

```
node scripts/uji-versi-indeks.mjs
```

`18/18 lulus, 0 gagal, 0 dilewati` - kode keluar **0**, dan dua jalan berturut-turut
menghasilkan keluaran **byte-identik** (163.651 byte vs 163.651 byte, kasus 4).

Blok di bawah ini adalah keluaran run yang **dicatat** saat pengerjaan
(`C:/Users/Zyrex/AppData/Local/Temp/uji-2.log`); angka yang ikut bergerak karena pohonnya hidup
disebut ulang di 3b. Run final atas pohon yang sudah bergerak
(`C:/Users/Zyrex/AppData/Local/Temp/uji-3.log`) juga `EXIT 0` dan `18/18 lulus`, dengan
`sandbox vs repo` tetap `26e682bb085f4c80` (entri 6.203 vs 6.253).

```
uji-versi-indeks - cap hash sumber + versi app (item ZEPH-VERSI-INDEKS-BASI)
  ok     1. cap tersimpan di src/lib/zephyrIndeks.ts terbaca & berbentuk benar
         - cap tersimpan: aplikasi=1.1.13, hashSumber=f83cc022d0c620db
  ok     2. cap nyata dari `gen-fakta-zephyr.mjs --print-cakupan` terbaca (tanpa menulis)
         - cap nyata: aplikasi=1.1.13, hashSumber=26e682bb085f4c80, 6.248 entri (bridge=1, dokumen=176, ekstensi=17, kode=424, label=3023, layar=1992, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=67)
  ok     3. hash = fungsi ISI sumber: salinan pohon sepadan -> hash sepadan
         - repo 26e682bb085f4c80 vs salinan C:\Users\Zyrex\AppData\Local\Temp\zephyr-uji-versi-indeks-lab-70324 -> 26e682bb085f4c80; entri 6.198 vs 6.248, selisih per kategori: dokumen-50. Dua fakta itu digabung: hash IDENTIK padahal jumlah entri BEDA -> semua berkas yang masuk daftar hash ada & byte-sepadan di salinan (sebab itu hash sama), sementara pemindai entri juga membaca berkas yang tidak ikut tersalin (sebab itu entri beda) -> daftar berkas hash adalah himpunan BAGIAN dari berkas yang dipindai entri, dan hashnya murni fungsi (nama relatif + isi byte), bukan mesin/waktu/locale
  ok     4. hash byte-identik antar dua pemanggilan (deterministik)
         - pemanggilan 1 -> 26e682bb085f4c80, pemanggilan 2 -> 26e682bb085f4c80; keluaran utuh sama persis (163.651 byte vs 163.651 byte)
  ok     5. hash tidak bergantung locale/env mesin
         - LC_ALL=id_ID.UTF-8/TZ=Asia/Jakarta -> 26e682bb085f4c80 vs LC_ALL=C/TZ=UTC -> 26e682bb085f4c80; hash hanya dari nama berkas RELATIF + isi byte, jadi nama mesin, HOME, dan jam tidak masuk
  ok     6. satu byte di satu berkas sumber mengubah hash
         - src/lib/commandRegistry.ts: "expor[t]" -> "expor[u]" (1 byte; panjang 77.098 byte tetap: true) -> hash 26e682bb085f4c80 menjadi bf38750dc890d742
  ok     7. kontrol negatif: berkas di luar daftar sumber tidak mengubah hash
         - hash tetap 26e682bb085f4c80 setelah menambah CATATAN-LAB.txt (26e682bb085f4c80) dan src/lib/zz-lab.test.tsx (26e682bb085f4c80) -> daftar berkas hash tertutup, bukan jelajah seluruh pohon. Catatan yang ikut ketahuan: berkas uji .test.tsx TIDAK masuk hash tapi MASUK peta kode (entri 6.198 -> 6.199, +1) - jadi hash lebih lemah daripada --check untuk perubahan seperti itu
  ok     8. versi app dibaca dari package.json dan ikut masuk cap
         - package.json=1.1.13, tauri.conf.json=1.1.13, cap.aplikasi=1.1.13 - ketiganya sama; generator mendahulukan tauri.conf.json dan package.json jadi cadangannya (versiAplikasi(), gen-fakta-zephyr.mjs baris 1187-1191)
  ok     9. versi berubah -> cap.aplikasi berubah (versi ikut masuk cap)
         - di salinan: cap 1.1.13 -> tauri.conf.json=9.9.9 -> 9.9.9 -> package.json=8.8.8 (tauri tetap 9.9.9) -> 9.9.9; hash 26e682bb085f4c80 -> 94f92472826b89fb (hash sendiri tidak memuat versi - versi masuk cap lewat field aplikasi)
  ok    10. deteksi basi membandingkan cap TANPA menulis apa pun
         - sha1 src/lib/zephyrIndeks.ts 88014db01104 -> 88014db01104; src/lib/zephyrFakta.ts 00f91ee64f8a -> 00f91ee64f8a; seluruh uji (18 kasus, 15 pemanggilan generator) tidak menulis apa pun ke repo
  ok    11. deteksi basi: cap beda -> basi, cap sama -> segar
         - tersimpan vs nyata -> basi=true (hash f83cc022d0c620db != 26e682bb085f4c80); tersimpan vs tersimpan -> basi=false; hash dibuat 0000 -> basi=true; versi dibuat 0.0.0 -> basi=true
  ok    12. jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata
         - cap tersimpan 1.1.13 / f83cc022d0c620db vs cap nyata 1.1.13 / 26e682bb085f4c80; berkas sumber tanpa entri peta kode 20 dari 424, baris bergeser di 27 berkas, label tak terjangkau 16, entri 6.212 tersimpan vs 6.248 nyata (tertinggal 36: kode+20, layar+16), keluhan cek-indeks-sinkron 5
  ok    13. jumlah entri tersimpan cocok antara dua parser independen
         - parser harness -> 6.212 entri, parser cek-indeks-sinkron -> 6.212 entri, berkas 1.033.126 byte; src/lib/zephyrIndeks.ts mendeklarasikan FAKTA_INDEKS=true, FAKTA_KATEGORI=true
  ok    14. tidak ada jalur baca/tulis .env atau kunci API
         - harness: tidak ada pola .env/kunci; kontrol positif (jebakan harus tertangkap): true; membaca process.env berisi kunci: false; berkas repo yang benar-benar dibaca harness (4): package.json, src-tauri/tauri.conf.json, scripts/uji-versi-indeks.mjs, src/lib/zephyrIndeks.ts -> tidak ada .env/.pem/.key; SUMBER_HASH generator: tidak memuat nama berkas sensitif
  ok    15. pemisah ribuan dihitung sendiri (toLocaleString/Intl.NumberFormat DILARANG)
         - ribuan(6212)='6.212', ribuan(1234567)='1.234.567', ribuan(-1234)='-1.234'; pola terlarang di sumber harness: tidak ada; kontrol positif (jebakan harus tertangkap): true
  ok    16. `--check` tidak menulis berkas (salinan tetap byte-identik)
         - berkas hasil generate ada di salinan; kode keluar --check=1 ("src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbernya."); sha1 src/lib/zephyrIndeks.ts 88014db01104 -> 88014db01104, src/lib/zephyrFakta.ts 00f91ee64f8a -> 00f91ee64f8a -> tidak menulis
  ok    17. cap hash berformat 16 huruf hex kecil (tersimpan & nyata)
         - tersimpan=f83cc022d0c620db (16 huruf), nyata=26e682bb085f4c80 (16 huruf) - sha1 dipotong 16, sama seperti cap di kode produk
  ok    18. cap nyata rekonsiliasi dengan angka scripts/cek-indeks-sinkron.mjs
         - cek-indeks-sinkron: cap tersimpan 1.1.13/f83cc022d0c620db (harness: f83cc022d0c620db), hash nyata 26e682bb085f4c80 (harness: 26e682bb085f4c80), baris "generator --check" ada=true; keluhan 5, kode keluar 1 -> dua alat menyebut angka yang sama

uji-versi-indeks: 18/18 lulus, 0 gagal, 0 dilewati - cap tersimpan 1.1.13 / f83cc022d0c620db vs cap nyata 1.1.13/26e682bb085f4c80; tertinggal 20 berkas peta kode dari 424 dan 36 entri
```

Cara memisahkan kekuatan bukti (kenapa tiap kasus ada):

| yang harus dibuktikan | kasus |
|---|---|
| cap tersimpan berbentuk benar & bisa dibandingkan | 1, 11, 17 |
| cap nyata = isi sumber, bukan waktu/locale/mesin | 3 (salinan pohon), 4 (dua panggilan byte-identik), 5 (locale/TZ dibalik) |
| satu byte mengubah hash; berkas di luar daftar TIDAK | 6, 7 (kontrol negatif) |
| versi app dari `package.json` ikut masuk cap | 8, 9 |
| deteksi basi tanpa menulis apa pun | 10 (sha1 dua berkas hasil sebelum/sesudah), 16 (`--check`) |
| angka tertinggal nyata | 12, 13, 18 |
| tidak menyentuh `.env`/kunci API | 14 |
| disiplin angka (`ribuan()` sendiri) | 15 |

Mode `--tanpa-sandbox` melewati kasus yang butuh salinan pohon (3, 7, 9, 16) - dipakai saat
mengerjakan infra dulu, bukan untuk "lulus murah". Keluaran lengkap kedua mode sama-sama hijau.

## 5. Bukti tipe

```
npx tsc --noEmit
```

Saat pencatatan: kode keluar **0**, keluaran kosong (0 baris) - pohon produk rapi, dan item
ini tidak mengubah satu berkas produk pun.

Saat pemeriksaan ulang di akhir pengerjaan, pohon sudah disunting jalur lain dan hasilnya
**kode keluar 2, satu kesalahan**:

```
src/lib/bacaKode.ts(154,24): error TS2304: Cannot find name 'BATAS_BERKAS_PER_PANGGILAN'.
```

Yang itu **bukan dari item ini**: `src/lib/bacaKode.ts` adalah berkas **belum terlacak**
(`git status` menjawab `?? src/lib/bacaKode.ts`), bertanggal 2026-10-14 07:49:47 lokal -
dibuat setelah pencatatan - dan simbol `BATAS_BERKAS_PER_PANGGILAN` hanya muncul sekali di
seluruh `src/`+`scripts/` (dipakai, tidak ada definisinya). Jadi itu suntingan yang belum
selesai di jalur lain, bukan akibat pekerjaan ini. Saya tidak memperbaikinya: berkas itu bukan
milik item ini, dan memperbaiki berkas orang lain di tengah pengerjaan justru merusak.

Catatan cakupan: `tsconfig.json` hanya memuat `"include": ["src"]`, jadi `npx tsc --noEmit`
**tidak** memeriksa `scripts/*.mjs`. Untuk harness ini, buktinya adalah menjalankannya
(`18/18 lulus`, EXIT 0) - bukan pemeriksa tipe. `tsconfig` memakai `noUnusedLocals: true`,
dan itu relevan untuk usulan patch 4c di `docs/USULAN-VERSI-INDEKS.md` (variabel yang tidak
dipakai akan ditolak compiler).

## 6. Usulan perbaikan mandiri (ringkas)

Masalahnya bukan capnya, tapi tidak ada yang memeriksanya: app hanya membandingkan **versi**
(`zephyrSelf.ts:404`, `:540`), sementara hash - satu-satunya penanda yang melihat perubahan
isi sumber walau versi belum naik - tidak pernah dibandingkan di dalam app. Usulan lengkapnya
(berkas + baris + teks LAMA/BARU) ada di `docs/USULAN-VERSI-INDEKS.md`:

1. generator mencetak daftar tertutup berkas hash ke artefak (`FAKTA_HASH_BERKAS`) + jumlah
   berkas/entri di `FAKTA_VERSI`, supaya cap bisa dihitung ulang dari luar generator;
2. `zephyrCari.ts` menambah pembanding murni `capBasi(capNyata)` (tanpa I/O) di samping
   `versiFakta()`;
3. `zephyr_self` menambah bagian `indeks`: menyebut cap tersimpan, status basi (versi **dan**
   hash), angka yang tertinggal, dan jalur satu-perintah untuk menyegarkan;
4. "mau saya segarkan?" dijalankan sebagai **kartu saran perintah** (`suggest_command`, gaya
   yang sudah dipakai Zeph: user yang menekan Enter), bukan app yang diam-diam menulis indeks.

Batas yang jujur disebut di usulan: aplikasi yang sudah terpasang **tidak membawa pohon
sumber**, jadi ia tidak bisa menghitung hash sendiri - yang bisa dilakukan Zeph di sana adalah
menyebut cap tersimpannya dan bilang "tidak bisa diverifikasi dari sini". Perhitungan ulang
hanya mungkin saat pohon sumbernya ada (mesin kerja / repo terbuka).
