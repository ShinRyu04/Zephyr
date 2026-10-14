# Antrean pesan & berkas konteks workspace

Catatan rancangan + bukti untuk tiga pekerjaan di lane ini:

| Item | Yang dikerjakan | Artefak | Uji |
| --- | --- | --- | --- |
| **LAMA-c** | pesan/chat ke agen yang sedang bekerja: masuk antrean, tidak menabrak giliran, tidak hilang, urut, bisa dibatalkan, diproses begitu giliran selesai | `src/lib/antreanPesan.ts` | `scripts/uji-antrean-pesan.mjs` (18 kasus) |
| **LAMA-d** | aplikasi mengelola `.zephyr-context.md` otomatis | `src/lib/konteksZephyr.ts` | `scripts/uji-konteks-zephyr.mjs` (11 kasus) |
| **LAMA-kejam** | repro bersih bug "versi kejam" | — (penyelidikan) | `scripts/uji-bug-kejam-verifikasi.mjs` |

Semua berkas di atas adalah fungsi **murni**: tanpa jaringan, tanpa Tauri, tanpa
CDP, tanpa store. Ujinya jalan dengan `node` biasa, jadi bisa diverifikasi kapan
saja - termasuk saat aplikasi tidak dijalankan sama sekali.

```
node scripts/uji-antrean-pesan.mjs
node scripts/uji-konteks-zephyr.mjs
```

---

## 1. LAMA-c — pesan selagi agen bekerja

### Masalahnya

Saat agen sedang bekerja, pesan kedua dari user punya tiga nasib buruk, dan
ketiganya sudah pernah terjadi di panel:

1. **menabrak** giliran yang sedang jalan (riwayat percakapan jadi rusak),
2. **dibuang diam-diam** (user merasa sudah mengirim, tidak ada jejaknya di mana pun),
3. **keluar tidak urut** ("lanjutkan" diproses sebelum perintah yang sebenarnya diminta user lebih dulu).

### Aturannya

Seluruh keadaan antrean ada di satu nilai `KeadaanAntrean` (`berkas`, `sibuk`,
`batas`, `batasTeks`, `urut`), dan tiap operasi mengembalikan **keadaan baru** -
argumen lama tidak pernah diubah. Keadaan lama yang masih dipegang pemanggil
(mis. render React sebelumnya) tetap sah, jadi tidak ada perubahan tak terlihat.

| Kejadian | Yang dilakukan |
| --- | --- |
| agen **tidak** sibuk | pesan langsung dikirim - `kirim()` mengembalikan `masukAntrean: false`, antrean tidak bertambah |
| agen **sibuk** | pesan masuk antrean (`masukAntrean: true`), giliran yang jalan tidak disentuh, `sibuk` tetap `true` |
| **giliran selesai**, ada antrean | pesan paling depan **langsung diproses** (`langsungDiproses`), sisanya menunggu; `sibuk` tetap `true` |
| **giliran selesai**, antrean kosong | `sibuk` jadi `false`, tidak ada pesan yang diproses |
| "selesai" dipanggil lagi | `dilewati: true` - keadaan tidak berubah, **tidak memakan pesan kedua** |
| pesan kosong / hanya spasi | ditolak, `alasan: 'kosong'`, antrean tidak tersentuh |
| pesan > `BATAS_TEKS` | ditolak, `alasan: 'terlalu-panjang'` (bukan "penuh" - sebabnya beda, tindakan user-nya juga beda) |
| antrean sudah `BATAS_ANTREAN` | ditolak, `alasan: 'penuh'`, pesan menyebut angka batas + dua jalan keluar |
| batalkan pesan | `batalkan(keadaan, id)` - hapus **satu** item, posisi lain tidak bergeser |
| batal pesan yang sudah pergi | `ok: false` + kalimat penjelas, keadaan **tidak berubah** (pembatalan telat tidak membuang tetangganya) |
| urutan diatur user | `naikkan` / `turunkan` / `promosikan` - memindah item, tidak pernah menghilangkannya |

### Keputusan yang menentukan

- **Id stabil, bukan indeks.** Id dibuat saat pesan masuk (`p1-<waktu>`), karena
  baris antrean bisa dipindah-pindah: indeks yang sama akan menunjuk pesan lain
  sesudah reorder, dan "batalkan yang tadi" bisa membuang pesan tetangga.
- **Satu giliran = satu pesan.** `giliranSelesai()` mengambil hanya kepala antrean.
  Kalau semua pesan disedot sekaligus, urutannya jadi tidak bisa diprediksi dan
  satu pesan yang gagal ikut menyeret sisanya.
- **Counter id ikut di keadaan (`urut`).** Supaya fungsinya tetap murni: keadaan
  yang sama tidak pernah melahirkan dua id yang sama.
- **Penolakan punya `alasan` bertipe.** UI memilih kalimatnya dari `alasan`,
  bukan menebak dari panjang pesan - bahasa panel bisa berubah tanpa merusak uji.
- **Batas teks = batas panel (`8 * 1024`).** Modul ini tidak boleh meloloskan pesan
  yang akan ditolak di tempat lain.

### Batas & sambungan ke app

Modul ini **belum disambungkan** ke `src/lib/aiStore.ts` (berkas itu dipegang lane
lain, jadi tidak disentuh dari sini). Sambungan yang benar nanti:
`send()` memanggil `kirim()` saat `agentBusy`; loop agen memanggil `giliranMulai()`
di awal langkah dan `giliranSelesai()` di jalur keluarnya; panel merender `daftar`
dan memakai `id` untuk tombol batalkan/pindah. Di store, antrean hari ini hidup
per-composer (`antrians: { [composerId]: [...] }`) dan isinya `{ id?, teks, images }`
(`aiStore.ts:3059`, `:3470`, `:4308`) - bentuk itu sudah cocok dengan `PesanAntrean`,
jadi penggantiannya bertahap dan bisa dicicil per pemanggil.

Bukti: **18/18 lulus** (`node scripts/uji-antrean-pesan.mjs`).

---

## 2. LAMA-d — `.zephyr-context.md` yang dikelola aplikasi

Berkas ini ditulis **aplikasi**, bukan model, di akar workspace: repo apa ini,
tugas apa yang sedang jalan, keputusan apa yang sudah diambil, berkas mana yang
penting. Gunanya: run berikutnya - chat baru, subagen, agen lain - tidak mulai
dari nol.

### Kapan dibuat, kapan diubah

| Keadaan berkas | Aksi | Sebab |
| --- | --- | --- |
| belum ada | `buat` | run pertama di sebuah workspace |
| ada, bagian aplikasi **berubah** (repo/cabang/tugas/keputusan/berkas) | `timpa` | bagian aplikasi diganti utuh supaya tidak menumpuk versi lama; **catatan agen dipertahankan** |
| ada, bagian aplikasi **sama**, ada catatan agen baru | `tambah` | hanya bagian model yang ditambahi; bagian aplikasi tidak ditulis ulang |
| ada, tidak ada yang baru | `lewati` | menulis ulang berkas identik membuat mtime berubah tiap run dan memaksa agen lain memproses ulang |
| `repo` belum diketahui | tidak menulis | `kurang: ['repo']` + pesan sebabnya - berkas tanpa repo lebih menyesatkan daripada tidak ada berkas |

Bagian milik aplikasi dipisah dari bagian milik model pada judul `## Catatan agen`
yang **dimulai sebagai awal baris**. Pencarian substring biasa salah di sini:
bagian aplikasi menyebut judul itu di baris petunjuknya sendiri, dan berkas akan
terpotong di tempat yang salah - akibatnya berkas benar dianggap berubah, ditulis
ulang tiap run, dan catatan agen diduplikasi.

### Isi minimal

`repo` (wajib), `cabang`, **tugas berjalan**, **keputusan penting[]**, **berkas
penting[]**, hasil run terakhir, dan waktu pembaruan. Yang belum terisi tetap
ditulis dengan baris "(belum ada ...)" supaya bentuk berkasnya stabil dan model
tahu bagian mana yang masih kosong.

### Batas ukuran

`BATAS_BYTE = 16 KB`, dipotong **di batas baris** lalu ditandai
`> [!catatan] Isi dipotong aplikasi: N baris terakhir tidak dimuat ...`. Memotong
di tengah baris merusak penanda markdown, dan - yang lebih berbahaya - bisa
membelah sebuah rahasia jadi dua potong yang tidak lagi dikenali penyaring
berikutnya. Pemotongan yang tidak terlihat adalah pemotongan yang dicari user
berjam-jam, jadi ekornya selalu diberi keterangan.

### Rahasia: TIDAK boleh masuk berkas

Dua lapis, dan keduanya perlu: **nama berkas** rahasia (sering bocor sebagai
"berkas penting" hasil penelusuran direktori) dan **pola nilai** (nilai yang
sudah dikutip di dalam kalimat tugas / catatan agen).

Daftar blokir nama berkas (21 entri, `BERKAS_DIBLOKIR`):

```
.env  .env.local  .env.production  .env.development  .env.test  .npmrc  .netrc
.pgpass  .htpasswd  id_rsa  id_ed25519  credentials.json  credentials.yml
service-account.json  secrets.json  secrets.yaml  keystore.jks  .pem  .key  .pfx  .p12
```

Nama apa pun yang diawali `.env` / diakhiri `.env` juga diblokir, begitu pula
berakhiran `.pem`, `.key`, `.pfx`, `.p12`, `.jks` (`berkasDiblokir()`).

Pola nilai (`ATURAN_RAHASIA`): `kunci-anthropic`, `kunci-openai` (`sk-`, kecuali
`sk-ant-`), `kunci-github` (`ghp_/gho_/ghu_/ghs_/ghr_`), `token-github-pat`,
`kunci-aws` (`AKIA`/`ASIA`), `kunci-google` (`AIza`), `token-slack` (`xox*-`),
`jwt`, `kunci-privat-ssh`, `kunci-privat-pg`, `penugasan-kunci`
(`api_key|secret|access_token|password|... = <nilai ≥12 karakter>`), `berkas-env`,
`berkas-kunci`, `berkas-kredensial`, `ssh-privat`.

Perilakunya: kalau ada temuan, `rencanaTulis()` mengembalikan `ok: false` dengan
`teks: ''` - **berkasnya tidak ditulis sama sekali**, isi yang sudah ada dibiarkan
apa adanya. Kalau pemanggil masih mau menampilkan teksnya, `saring()`/`redaksi()`
mengganti nilainya dengan `«disensor»` sambil mempertahankan kalimatnya
(`api_key=«disensor»`), dan `cariRahasia()` hanya melaporkan NAMA aturan + cuplikan
yang sudah disensor - nilai aslinya tidak pernah ikut ke log kegagalan.

Kedua pola pencarian memakai regex **tanpa flag `g`** (salinan ber-`g` dibuat per
panggilan). Regex global menyimpan `lastIndex`, sehingga pemanggilan kedua pada
teks yang sama bisa melaporkan "tidak ketemu" - penyaring rahasia yang lulus
sekali lalu diam adalah bug yang jauh lebih mahal daripada regex-nya sendiri.

### Tidak menulis di luar folder yang diizinkan

`jalurKonteks(akar)` adalah satu-satunya jalur tulis yang diizinkan:
`<akar>/.zephyr-context.md`. Ditolak: akar kosong, akar yang memuat `..`
(cara paling halus untuk keluar workspace - hasilnya tetap terlihat normal sesudah
dinormalkan), nama berkas selain `.zephyr-context.md`, dan subfolder. `diDalamAkar(akar, jalur)`
adalah penjaga terakhir sebelum disk disentuh.

Bukti: **11/11 lulus** (`node scripts/uji-konteks-zephyr.mjs`). Kasus B8 menulis
berkas SUNGGUHAN ke folder sementara: dari 6 bentuk jalur, 5 ditolak dan 1
diterima, lalu diperiksa bahwa tidak ada `.zephyr-context.md` yang lahir di luar
folder yang diizinkan.

### Batas

Sama seperti LAMA-c: modul ini murni (tidak mengimpor `node:fs` - `src/` tidak punya
`@types/node`), jadi yang menulis ke disk adalah lapisan aplikasi lewat
`jalurKonteks()`. Pemanggilan dari `aiStore`/loop agen (akhir run: repo + tugas +
berkas yang berubah) belum dipasang dari lane ini.

---

## 3. LAMA-kejam — bug "versi kejam"

### Jejaknya ADA (bukan dikarang)

`grep` istilah `kejam` di repo menemukan jejak nyata:

| Lokasi | Isi |
| --- | --- |
| `scripts/uji-bug-kejam.mjs` (198 baris) | harness "versi KEJAM": agen hanya diberi **gejala**, tanpa tes dan tanpa letak bug |
| `scripts/uji-bug-kejam-verifikasi.mjs` (89 baris) | menilai hasil tanpa run baru (untuk kasus proses node mati di tengah) |
| `src/lib/aiStore.ts:5950` | komentar: "terlalu kejam: terbukti di run Kopi Senja, model sudah menulis 3 ..." |
| `D:/Testing/bug-kejam/` | workspace uji: `kasir.js`, `laporan.js`, `data/keranjang.json`, `KELUHAN.md`, `.zephyr-context.md`, `.asli/` |

Di `docs/` tidak ada satu pun catatan tentang ini (grep `kejam`, `uji-bug-kejam`,
`versi kejam` di `docs/` = kosong), dan `git log` untuk `scripts/uji-bug-kejam.mjs`
tidak ada - berkas ini belum pernah di-commit. Jadi jejaknya ada di kode + fixture,
bukan di dokumen.

### Bug-nya apa

Fixture sengaja memasang tambalan-tambalan yang menggoda (hitung ulang di
`laporan.js`, ubah data supaya cocok, hapus keluhannya - semuanya DILARANG di
`KELUHAN.md`). Akarnya: `hitungTotal()` di `kasir.js` memakai
`items.splice(i, 1)` **di tengah loop indeks naik** saat item diskon ditemukan.

Akibatnya: satu item terlewat, dan item diskon itu **hilang dari `rincian`**.
Yang dinilai harness bukan kata-kata agen, tapi `node laporan.js` yang dijalankan
harness sendiri, dibandingkan dengan hitungan yang dihitung harness dari data mentah.

### Repro tanpa app (sudah dijalankan, ini hasil nyatanya)

Fixture ada di dua kondisi karena `.asli/` menyimpan salinan kondisi bug dan
`uji-bug-kejam.mjs` memulihkannya di awal run. **Kedua kondisi terbukti pada
14 Okt 2026:**

**(a) kondisi bug** (berkas `kasir.js` identik dengan `.asli/kasir.js`, 1058 byte,
`sha1 c68bd1b1`, ada `splice`):

```
$ cd /d/Testing/bug-kejam && node laporan.js
{ "total": 365500, "rincian": [ Tumbler 500ml, Gula Aren 1kg, Filter V60 ] }

$ node scripts/uji-bug-kejam-verifikasi.mjs
LULUS  K2   `node laporan.js` jalan tanpa error (exit=0)
GAGAL  K3   total laporan COCOK hitungan manual: 365500 vs 485500 (kurang 120000)
LULUS  K4   total tidak berubah kalau dihitung dua kali (365500 vs 365500)
LULUS  K5   data & keluhan TIDAK diubah (berubah: tidak ada)
GAGAL  K6   perbaikan ada di kasir.js, laporan.js tidak ditambal (berubah: tidak ada)
LULUS  K7   API kasir.js tetap utuh (hitungTotal(array) -> number)
GAGAL  K8   aman dipanggil pada objek array yang SAMA dua kali (tidak memutasi)

catatan: splice/pop masih ada di kasir.js? ya; tambalan rekap di laporan.js? tidak
== 4/7 lulus ==
```

Gejala persis seperti keluhan pemilik toko: total KURANG 120000 dari hitungan
manual (485500), dan **Kopi Arabika 250g tidak muncul di `rincian`** meskipun
keranjangnya bersisi 4 barang. Barang diskon itu dihapus dari array oleh `splice`
sehingga loop melompati "Tumbler 500ml" tepat di belakangnya.

**(b) kondisi sudah diperbaiki** (satu run agen sebelumnya berhasil; `kasir.js`
1032 byte, tanpa `splice`):

```
$ node scripts/uji-bug-kejam-verifikasi.mjs
LULUS  K2   `node laporan.js` jalan tanpa error (exit=0)
LULUS  K3   total laporan COCOK hitungan manual: 485500 vs 485500 (kurang 0)
LULUS  K4   total tidak berubah kalau dihitung dua kali (485500 vs 485500)
LULUS  K5   data & keluhan TIDAK diubah (berubah: kasir.js)
LULUS  K6   perbaikan ada di kasir.js, laporan.js tidak ditambal (berubah: kasir.js)
LULUS  K7   API kasir.js tetap utuh (hitungTotal(array) -> number)
LULUS  K8   aman dipanggil pada objek array yang SAMA dua kali (tidak memutasi)

catatan: splice/pop masih ada di kasir.js? tidak; tambalan rekap di laporan.js? tidak
== 7/7 lulus ==
```

Catatan penting: kondisi berubah sendiri di antara dua pengamatan (kasir.js 1032 →
1058 byte, mtime kembali ke 19:19) - itu efek samping langkah pemulihan di awal
`uji-bug-kejam.mjs`. Jadi **jangan menganggap fixture ini statis**; sebut dulu
kondisinya sebelum menilai.

### Cara mereproduksi nanti saat app hidup (BUTUH APP)

Penilaian penuh (K1, K9, dan K8 versi app) hanya bisa dari harness utama, karena
yang dijalankan adalah agen di dalam aplikasi lewat CDP. Langkah konkret:

1. Pulihkan kondisi bug: `cp -f /d/Testing/bug-kejam/.asli/kasir.js /d/Testing/bug-kejam/kasir.js`
   (dan `laporan.js`, `data/keranjang.json`, `KELUHAN.md` bila perlu). Ini juga
   dilakukan otomatis oleh langkah pertama `uji-bug-kejam.mjs`.
2. Cek kondisi awal: `cd /d/Testing/bug-kejam && node laporan.js` harus mencetak
   `"total": 365500` **tanpa** Kopi Arabika di `rincian`. Kalau sudah 485500,
   fixture-nya sedang dalam kondisi diperbaiki - ulangi langkah 1.
3. Jalankan aplikasi dengan CDP di port 9223 (`Zephyr`), lalu pastikan agen tidak
   sibuk: `window.__ZEPHYR_AI__.store.getState().agentBusy` harus `false`.
   Harness berhenti sendiri dengan pesan "agen masih sibuk" kalau tidak.
4. `node scripts/uji-bug-kejam.mjs 9223 D:/Testing/bug-kejam` (batas waktu
   `MENIT=12` lewat env). Harness ini mengalihkan workspace ke `D:/Testing/bug-kejam`
   (kalau `openWorkspace` diabaikan, ia berhenti - perbaikan di folder lain akan
   terbaca sebagai "kasir.js tidak berubah"), mengirim tugas gejala-saja, dan
   menunggu agentBusy turun.
5. Nilai hasilnya TANPA app kalau proses node-nya mati di tengah:
   `node scripts/uji-bug-kejam-verifikasi.mjs` (menilai K2-K8 dari disk; itu yang
   dipakai di atas).
6. Tangga yang diharapkan lulus: **K1** run berakhir sendiri, **K2** `laporan.js`
   exit 0, **K3** total laporan == 485500 (dihitung harness dari data mentah),
   **K4** hasil sama kalau dihitung dua kali, **K5** data & `KELUHAN.md` tidak
   diubah, **K6** perbaikan di `kasir.js` dan `laporan.js` TIDAK ditambal,
   **K7** API `hitungTotal(array) -> number` tetap, **K8** aman dipanggil dua kali
   pada array yang sama, **K9** tanpa error provider, dan agen minimal sekali
   `bash_run` untuk membuktikan sendiri.

Kalau nanti app-nya tidak bisa dijalankan, **yang bisa dibuktikan tetap sama**:
langkah 1-2 dan 5 di atas tidak butuh app sama sekali - dan itu sudah memisahkan
perbaikan akar dari tambalan (`splice/pop masih ada? ya/tidak`, `tambalan rekap di
laporan.js? ya/tidak`) pada KODE, bukan pada klaim agen.
