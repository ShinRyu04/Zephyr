# REPRO BUG "VERSI KEJAM" — bukti bahwa bugnya nyata

Bug ini **tidak ditebak**. Isinya diambil dari membaca harness lama, mencari
jejaknya di repo, lalu menjalankan kode nyata di disk dan melaporkan keluarannya
apa adanya.

| Pertanyaan | Jawaban singkat |
| --- | --- |
| Bugnya nyata? | **Ya — TERBUKTI**, 10/10 bukti, tanpa aplikasi hidup |
| Di mana akarnya? | `D:/Testing/bug-kejam/kasir.js:26` (`items.splice(i, 1)`) di dalam loop indeks `:21` |
| Gejala? | total laporan **365500**, seharusnya **485500** (kurang **120000**), dan **Kopi Arabika 250g hilang dari rincian** |
| Perlu app? | Untuk **membuktikan bugnya**: TIDAK. Untuk menilai **perbaikan oleh agen** (K1/K8-app/K9): **BUTUH APP** (CDP 9223) |

---

## 1. Jejaknya di repo (hasil pencarian, bukan karangan)

`grep` istilah `kejam` di `D:/Zephyr` (14 Okt 2026) menemukan jejak nyata:

| Lokasi | Isi |
| --- | --- |
| `scripts/uji-bug-kejam.mjs` (**198 baris**) | harness "versi KEJAM": agen hanya diberi **gejala**, tanpa tes, tanpa letak bug. Menyambung ke app lewat CDP (`Cdp.attach(PORT)`, `scripts/uji-bug-kejam.mjs:66`) dan menilai hasil perbaikan agen K1..K9 (`:170-184`) |
| `scripts/uji-bug-kejam-verifikasi.mjs` (**89 baris**) | menilai K2..K8 dari disk **tanpa run baru** (untuk kasus proses node mati di tengah) |
| `src/lib/aiStore.ts:5951` | komentar: *"terlalu kejam: terbukti di run Kopi Senja, model sudah menulis 3 ..."* |
| `docs/ANTREAN-DAN-KONTEKS.md:181-296` | bagian "3. LAMA-kejam — bug 'versi kejam'" (catatan lane sebelumnya; **jangan ditimpa**) |
| `D:/Testing/bug-kejam/` | workspace uji: `kasir.js`, `laporan.js`, `data/keranjang.json`, `KELUHAN.md`, `.zephyr-context.md`, `.asli/` |
| `scripts/uji-bug-kejam2.mjs` (**BARU**, 225 baris) | berkas ini: membuktikan **keberadaan** bug tanpa app |

## 2. Langkah repro minimal (tanpa aplikasi, 30 detik)

```
$ cd /d/Testing/bug-kejam
$ node laporan.js | head -c 30
{
  "total": 365500,
  "rinc          <-- dipotong di 30 karakter; totalnya 365500, bukan 485500

$ node laporan.js | grep -c '"nama"'      # 3, padahal data 4 barang
$ node D:/Zephyr/scripts/uji-bug-kejam2.mjs   # seluruh bukti + jejak loop
```

Hitungan manual dari `data/keranjang.json`:

| Item | Bruto | Diskon | Yang benar |
| --- | --- | --- | --- |
| Kopi Arabika 250g | 190000 | 28500 | 161500 |
| Tumbler 500ml | 120000 | — | 120000 |
| Gula Aren 1kg | 114000 | — | 114000 |
| Filter V60 | 90000 | — | 90000 |
| | | | **TOTAL 485500** |

## 3. Keluaran harness (apa adanya, disalin dari run 14 Okt 2026)

```
$ node scripts/uji-bug-kejam2.mjs
proyek uji: D:/Testing/bug-kejam
LULUS  B1   `node laporan.js` jalan tanpa error (exit=0) dan mencetak total=365500 - gejalanya angka SALAH, bukan crash
LULUS  B2   total laporan BEDA dari hitungan benar: 365500 vs 485500 (selisih 120000)
LULUS  B3   selisihnya PERSIS harga satu item yang terlewat: "Tumbler 500ml" 120000 x 1 = 120000
LULUS  B4   jejak loop nyata: hanya 3 kali baca untuk 4 item; "Tumbler 500ml" dibaca 0x - setelah splice ia ada di items[0] tapi loop sudah melompat ke i=1
LULUS  B5   rincian di keluaran laporan HANYA 3 baris (data 4 item) dan "Kopi Arabika 250g" HILANG dari struk
LULUS  B6   laporan TIDAK konsisten dengan dirinya sendiri: total=365500 tapi jumlah baris rinciannya=324000 (bukti kedua angka ini dihitung dari keadaan array yang berbeda dalam satu program yang sama)
LULUS  B7   dipanggil DUA KALI pada objek yang sama hasilnya berubah: 365500 lalu 324000 - fungsi mengubah masukannya sendiri (uji idempotensi lama memakai dua salinan baru, jadi ini lolos tanpa terlihat)
LULUS  B8   array MILIK PEMANGGIL ikut berubah: panjang 4 -> 3, sisa [Tumbler 500ml, Gula Aren 1kg, Filter V60] - inilah sebab rincian() kehilangan item berdiskon
LULUS  B9   jejak akar di sumber: loop pada kasir.js:21 memakai indeks, lalu kasir.js:26 memanggil `items.splice(i, 1)` di dalam loop - indeks berikutnya melompati satu item
LULUS  B10  harness ini TIDAK mengubah apa pun: sha256 kasir.js/laporan.js/data/keranjang.json/KELUHAN.md sama sebelum & sesudah

--- jejak nyata hitungTotal(data/keranjang.json) ---
     baca items[0] = Kopi Arabika 250g
     splice(0,1) membuang [Kopi Arabika 250g] -> isi sekarang [Tumbler 500ml, Gula Aren 1kg, Filter V60] (panjang 3)
     baca items[1] = Gula Aren 1kg
     baca items[2] = Filter V60
     -> total dihitung = 365500; sisa array = [Tumbler 500ml, Gula Aren 1kg, Filter V60]

--- rincian yang ikut tercetak (dihitung dari array yang sudah dimutasi) ---
     Tumbler 500ml: 120000
     Gula Aren 1kg: 114000
     Filter V60: 90000

--- hitungan BENAR (harness, dari data mentah) ---
     Kopi Arabika 250g: 190000 - 28500 diskon = 161500
     Tumbler 500ml: 120000 = 120000
     Gula Aren 1kg: 114000 = 114000
     Filter V60: 90000 = 90000
     TOTAL BENAR = 485500   (laporan mencetak 365500, kurang 120000)
== 10/10 bukti-bug lulus ==
BUG TERBUKTI NYATA di D:/Testing/bug-kejam (semua gejala direproduksi tanpa aplikasi hidup).
```

Warna di berkas itu **sengaja dibalik**, dan artinya ditulis di kepala harness:
`LULUS` = gejala bug berhasil direproduksi; `GAGAL` = bug tidak bisa dibuktikan lagi
(mis. ada yang sudah memperbaikinya) → seluruh harness keluar `exit 1`. Jadi
"10/10 bukti-bug lulus" artinya **sepuluh gejala bug nyata terlihat**, bukan
"sepuluh perbaikan berhasil".

Jejak di atas **bukan simulasi**: `hitungTotal` dijalankan pada array yang
dipantau (`Proxy`), jadi baris-baris `baca items[i] = …` itu adalah urutan
baca/splice yang benar-benar terjadi di kode nyata. Tidak ada berkas fixture yang
diubah untuk mendapatkannya — dijamin oleh B10 (sha256 sama sebelum & sesudah).

## 4. Akar masalah

```
kasir.js:19  function hitungTotal(items) {
kasir.js:21    for (let i = 0; i < items.length; i++) {
kasir.js:24      if (it.diskon) {
kasir.js:26        items.splice(i, 1);      // <-- AKAR
kasir.js:28      total += harga;
```

Dua akibat dari satu penyebab:

1. **Item terlewat** — `splice(0,1)` membuang Kopi dari array, lalu `i` naik ke 1
   yang kini menunjuk **Gula**, bukan Tumbler. Tumbler (120000) **tidak pernah
   dibaca** (B4). Total jadi 365500.
2. **Item hilang dari struk** — array milik pemanggil ikut berubah (B8), dan
   `laporan.js:10` memanggil `rincian(items)` **setelah** `hitungTotal(items)`,
   sehingga Kopi sudah tidak ada saat struk dibuat (B5).

Bukti tambahan yang tidak butuh oracle luar: **laporan bertentangan dengan
dirinya sendiri** — `total` 365500 tapi jumlah baris `rincian` 324000 (B6),
karena keduanya dibaca dari keadaan array yang berbeda dalam satu program yang sama.

Dan fungsi ini **mengubah masukannya**: dipanggil dua kali pada objek yang sama
memberi 365500 lalu 324000 (B7).

Catatan penting soal uji lama: pemeriksaan idempotensi di
`scripts/uji-bug-kejam.mjs:158-162` menghitung **dua salinan baru** dari disk
(`bikin()` dipanggil dua kali), jadi kedua hasil selalu sama dan mutasinya lolos
dari pemeriksaan itu. Mutasi hanya terlihat kalau objek yang sama dipakai dua kali.

## 5. Kondisi fixture (jangan dianggap statis)

Pada 14 Okt 2026 kondisi fixture = **kondisi bug**:

```
$ sha1sum kasir.js .asli/kasir.js
c68bd1b10c5bb6123d398c73de97456e6b164858 *kasir.js
c68bd1b10c5bb6123d398c73de97456e6b164858 *.asli/kasir.js
$ sha1sum laporan.js .asli/laporan.js
816874b891611b7dab241a9581df8ac7100913d2 *laporan.js
816874b891611b7dab241a9581df8ac7100913d2 *.asli/laporan.js
$ sha1sum data/keranjang.json .asli/data/keranjang.json
4478ff38a984588352f9f9203963acc84d6af362 *data/keranjang.json
4478ff38a984588352f9f9203963acc84d6af362 *.asli/data/keranjang.json
$ wc -c kasir.js laporan.js data/keranjang.json KELUHAN.md
1058 kasir.js      359 laporan.js      270 data/keranjang.json      561 KELUHAN.md
$ node laporan.js | head -c 30
{
  "total": 365500,
  "rinc
```

Fixture ini berubah sendiri antar run karena langkah pertama
`scripts/uji-bug-kejam.mjs:41-52` **memulihkan** berkas dari `.asli/` (dan membuat
`.asli/` dari kondisi saat itu kalau belum ada). Jadi sebelum menilai: **sebut
dulu kondisinya**. Kalau `node laporan.js` sudah mencetak 485500, fixture-nya
sedang dalam kondisi diperbaiki dan semua BUKTI di atas akan MERAH — itu benar,
bukan kegagalan harness.

## 6. BUTUH APP untuk bagian ini (apa adanya)

Yang **tidak bisa** dibuktikan tanpa aplikasi hidup, dan karena itu tidak diklaim
di sini:

- **K1** run agen berakhir sendiri, **K2** `node laporan.js` jalan tanpa error,
  **K3** total yang dilaporkan sama dengan yang diharapkan, **K4** idempotensi,
  **K7** hasilnya berupa angka, **K8** agen benar-benar menjalankan programnya
  sendiri lewat `bash_run` — semuanya dinilai dari dalam aplikasi lewat CDP, karena
  yang dijalankan adalah agen di dalam app (`scripts/uji-bug-kejam.mjs:66` untuk
  attach, `:116-130` untuk membaca `agentSteps`/`agentTodos` dari store, `:170-182`
  untuk penilaian K1..K8 — daftar periksa lain di berkas itu sengaja tidak dikutip
  di sini supaya tidak salah sebut).
- Langkahnya (sama seperti yang sudah dicatat di `docs/ANTREAN-DAN-KONTEKS.md`,
  bagian "3. LAMA-kejam" baris 181 ke bawah):
  pulihkan kondisi bug dari `.asli/`, pastikan `node laporan.js` mencetak 365500,
  jalankan app dengan CDP di port 9223, pastikan `agentBusy === false`, lalu
  `node scripts/uji-bug-kejam.mjs 9223 D:/Testing/bug-kejam` (`MENIT=12`).
- Kalau app tidak bisa dijalankan, yang **tetap** bisa dibuktikan adalah bagian
  1-5 di atas: bugnya nyata, akarnya di `kasir.js:26`, dan gejalanya persis
  seperti keluhan pemilik toko.

## 7. Perbaikan TIDAK dikerjakan di lane ini

Akar masalahnya di `kasir.js` — berkas fixture milik pekerjaan lane lain (dan
justru itu yang harus ditemukan sendiri oleh agen yang diuji). Lane ini **tidak
menyentuh** `kasir.js`, `laporan.js`, `data/keranjang.json`, maupun `KELUHAN.md`;
harness baru justru membuktikan dirinya tidak mengubah apa pun (B10: sha256 keempat
berkas sama sebelum dan sesudah). Perbaikannya tetap terbuka untuk lane yang
memilikinya.
