# USULAN - lanjutan blok "cara kerja + LARANGAN" (ZEPH-LARANGAN-BLOK)

Tanggal: 14 Okt 2026 · Pasangan laporan: `docs/LAPORAN-LARANGAN-BLOK.md` · Berkas produk yang sudah diubah: `src/lib/systemPrompt.ts` (blok `LARANGAN_ID`/`LARANGAN_EN`, 6 -> 8 butir)

Yang diminta item sudah **diterapkan** (lihat laporan). Dokumen ini hanya untuk sisa yang **belum** bisa / belum sebaiknya dikerjakan dari dalam lane ini, diurutkan menurut kepentingan.

---

## U1. Regenerasi indeks - PEMILIK REPO (blocker cek hijau)

**Masalah:** `node scripts/cek-batas-inti.mjs` GAGAL di "indeks sinkron dengan sumber". Entri `src/lib/zephyrIndeks.ts` mencatat `src/lib/systemPrompt.ts` = **1374 baris**, sementara berkasnya **1.411 baris sebelum** perubahan ini dan **1.429 baris sesudahnya**. Jadi basi itu pra-existing (drift 37 baris sudah ada), bukan akibat patch ini - tapi patch menambah 18 baris, jadi drift bertambah. `node scripts/verify-fakta-zephyr.mjs` melaporkan masalah yang sama (`gen-fakta-zephyr --check`).

**Kenapa tidak saya kerjakan:** perbaikannya menulis `src/lib/zephyrIndeks.ts` / `src/lib/zephyrFakta.ts` (hasil generator) - dua berkas yang dilarang disentuh lane ini; menjalankan `scripts/gen-fakta-zephyr.mjs` tanpa izin juga dilarang.

**Usulan (urutan aman untuk pemilik repo):**

1. `node scripts/gen-fakta-zephyr.mjs --check` -> konfirmasi daftar berkas yang basi.
2. Regenerasi (`node scripts/gen-fakta-zephyr.mjs`) saat tree bersih dari lane lain, lalu `git diff src/lib/zephyrIndeks.ts src/lib/zephyrFakta.ts` **hanya** untuk memastikan diff-nya memang cuma baris/entri yang berubah (bukan seluruh berkas ditulis ulang).
3. `node scripts/cek-batas-inti.mjs` -> harus hijau; `node scripts/verify-fakta-zephyr.mjs` -> 0 masalah.
4. Catat di commit message bahwa `scripts/uji-larangan-live.mjs` (+ `docs/LAPORAN-LARANGAN-BLOK.md`, `docs/USULAN-LARANGAN-BLOK.md`) adalah berkas baru yang **belum** ada di indeks, sehingga regenerasi berikutnya ikut memasukkannya.

Tidak ada bagian dari 7 aturan wajib yang hilang gara-gara indeks basi: `uji-larangan-live.mjs` mengukur langsung dari `systemPromptFor()`, tanpa lewat indeks.

---

## U2. Sisa anggaran id tinggal 16 char - kalau nanti perlu aturan lagi

Anggaran terpakai: id **7.984 / 8.000 char (1.996 / 2.000 tok)**, en **7.925 / 8.000 (1.982)**. Artinya aturan wajib berikutnya **wajib** datang bersama pemangkasan (persis kebijakan item ini).

Kandidat pangkas yang **aman terhadap gate** (angka dihitung dari blok terkirim, bukan perkiraan):

| Bahasa | Bagian yang dibuang | Hemat | Risiko |
|---|---|---|---|
| id | butir 3: ` baru bilang` (sisa "Jalankan, baca hasilnya") | 12 char | aman - tanda tangan uji `/klaim bukan bukti\. Jalankan, baca hasilnya/` tetap utuh |
| id | butir 1: ` yang relevan` | 13 char | aman - tanda tangan `/Baca dulu sebelum menebak/` tetap utuh |
| id | butir 5: `, sebut di mana user bisa melihatnya` | 36 char | aman - tanda tangan `/Jangan tampilkan isi rahasia/` + `/API key, token, kunci SSH/` tetap utuh; **tapi** "sebut di mana" adalah satu-satunya arah aksi (user tak diberi cara melihat) |
| id | butir 7: ``: pakai fakta di atas + `zephyr_self` `` | 37 char | aman untuk gate, tapi menghapus arah satu-satunya (yang tersisa cuma larangan tanpa alternatif) |
| en | butir 4: `, then say it` | 13 char | aman |
| en | butir 5: `, say where the user can see them` | 33 char | aman |
| id | butir 6: ` (hapus, pindah, timpa, force push, matikan proses)` | 51 char | **⚠ JANGAN** - `uji-blok-kondisional.mjs` B.1 mencocokkan `hapus`/`pindah`/`timpa`; memangkas ini = gate merah |

Total kandidat aman id = 98 char (blok jadi 804), en = 46 char (jadi 792) - cukup untuk ~1 aturan baru pendek, tapi **tidak** untuk menambah aturan panjang tanpa merancang ulang blok.

Kalau pemilik repo ingin ruang lebih besar, dua jalan yang lebih jujur daripada memotong kalimat: (a) pindahkan satu butir yang jarang menggigit (mis. butir 1 "baca dulu") ke blok `caraKerja` yang sudah memuatnya, atau (b) naikkan `AMBANG_TOKEN_INTI` (tidak diusulkan di sini karena angka 2.000 adalah keputusan pemilik).

---

## U3. Usulan lama P1 (815/784 char) vs yang diterapkan (902/838 char)

`docs/USULAN-BLOK-KONDISIONAL.md` §2 sudah memuat teks 8 poin versi lebih pendek (815 char id / 784 en; inti jadi 7.897 char, sisa 103 char). Yang diterapkan sekarang **bukan** P1 itu, dengan alasan yang bisa diperiksa:

| | P1 lama (usulan) | Diterapkan |
|---|---|---|
| butir wajib (1) "baca dulu sebelum menebak" | **tidak ada** sebagai butir | ada (butir 1) |
| butir wajib (5) "commit/push tanpa diminta" | **tidak eksplisit** (butir 5 hanya "destructive tool ... force push") | ada eksplisit (butir 6, "atau commit/push") |
| poin 7-8 P1 ("satu langkah satu tool", "pakai tool hanya kalau memberi info baru") | ada | tidak ada (bukan butir wajib; tidak ada ruang) |
| harga | +87 char id / +82 en | +174 / +136 |
| sisa ruang | 103 char (id) | 16 char (id) |

**Usulan:** pertahankan yang diterapkan (menutup semua butir wajib). Kalau pemilik repo lebih memilih margin besar dan menganggap "baca dulu" & "commit/push" cukup di blok `caraKerja`/`aturan`, versi P1 bisa dipasang sebagai gantinya - konsekuensinya item ini tidak lagi "tiap butir wajib ada di blok ekor", dan `docs/LAPORAN-LARANGAN-BLOK.md` §3 harus diperbarui (atau harness A diturunkan cakupannya). Jangan dua-duanya: memasang P1 di atas blok sekarang akan **gagal** gate D (aturan kembar).

---

## U4. Dua poin P1 yang belum dipakai (efisiensi tool)

`7. Satu langkah, satu tool; baca independen boleh digabung.` dan `8. Pakai tool hanya kalau memberi info baru: sudah dijawab blok konteks = jawab dari situ.` (id) / versi Inggrisnya. Ini aturan **cara kerja**, bukan larangan wajib; nilainya nyata (hemat panggilan tool) tapi harganya ~180 char id + ~150 en, sementara sisa ruang 16/75 char.

**Usulan:** jangan pasang keduanya sekaligus. Kalau mau, ambil **satu** yang paling sering menggigit (pengamatan laporan: "sudah dijawab blok konteks = jawab dari situ" lebih sering terpakai daripada aturan gabung-baca), dibayar dengan pemangkasan U2 (id butir 5 + butir 3 = 48 char aman, ditambah id butir 1 13 char = 61 char) - masih kurang ~20 char, jadi butuh satu pemangkasan yang mengorbankan arah aksi. Alternatif yang lebih murah: taruh sebagai salah satu baris `caraKerja` bila masih ada ruang di sana (bukan di blok inti).

---

## U5. Kelas kondisional: kombinasi masih melebihi 1.200 char (item terpisah)

`node scripts/uji-blok-kondisional.mjs` melaporkan TEMUAN (bukan gate): kombinasi kelas terburuk `model+keamanan = 1.358`, `model+tabel = 1.201` char, sementara plafon kombinasi 1.200 char; pemilih di kode produk **belum** punya pemotong prioritas. Ini sudah diusulkan di `docs/USULAN-BLOK-KONDISIONAL.md` (P2/P3) dan **belum** diterapkan - di luar lingkup item blok larangan, jadi tidak saya sentuh.

**Usulan:** kerjakan sebagai item sendiri di `src/lib/systemPrompt.ts` (`blokKondisional()`, ~baris 963): urutkan kelas menurut prioritas tetap, tambahkan kelas berikutnya hanya selama total <= 1.200, dan cetak kelas yang dipotong ke log debug. Kalau dijalankan, `uji-blok-kondisional.mjs` bisa dinaikkan dari TEMUAN menjadi gate agar tidak regresi.

---

## U6. Verifikasi di APP HIDUP (yang tidak bisa dibuktikan lane ini)

Harness membuktikan teks yang diserahkan `systemPromptFor()` dengan stub untuk modul runtime (persona/indeks/MCP/gaya jawaban kosong/statis). App hidup mengisi blok-blok itu dan memakai `uiLang` sungguhan, sehingga prompt nyata **lebih panjang** dan blok larangan bergeser posisi (dokumen runtime menyebut ~22.988 char di app hidup vs 21.901 char di harness).

**Usulan (butuh lane CDP/app, bukan lane ini):**

1. Di app hidup: `__ZEPHYR_PROMPT__.system('id','','')` dan `('en','','')` -> simpan string.
2. Jalankan pemeriksaan yang sama seperti `uji-larangan-live.mjs` kasus A/C/F terhadap string itu (7 tanda tangan x 2 bahasa, judul baris pertama, blok utuh di dalam prompt) dan catat panjang nyata blok inti.
3. Baru setelah itu klaim "sampai ke model di app" bisa ditulis tanpa embel-embel "versi harness".

---

## U7. Cakupan bahasa: hanya id/en yang punya teks larangan

`blokLarangan()` jatuh ke teks **Inggris** untuk bahasa selain id. Jadi 7 aturan wajib "terbukti ada" hanya untuk id dan en; bahasa lain mewarisi EN (dan itu tidak diukur gate mana pun).

**Usulan:** kalau `src/lib/systemPromptLanguages.ts` (`LANGS`) menambah bahasa, blok larangan tidak ikut otomatis. Minimal: tambahkan pemeriksaan gate bahwa `blokLarangan()` untuk setiap bahasa yang ada di `LANGS` **tidak gagal** salah satu dari 2 hal - (a) judul baris pertama ada, (b) tidak null/kosong; dan biarkan jatuh ke EN sebagai perilaku resmi (didokumentasikan di komentar). Menerjemahkan penuh 8 butir ke tiap bahasa menambah baris kode, bukan anggaran inti id/en, tapi harus lewat gate bahasa yang sama supaya tidak ada bahasa yang diam-diam tanpa larangan.

---

## U8. Berkas generator - hanya bisa dijalankan pemilik repo

Kalau aturan baru ini ingin **bisa ditemukan retrieval** (`zephyr_self` / indeks), teksnya harus terdaftar di dokumen yang diindeks (`docs/JAWABAN-*.md` dsb.) lalu indeks diregenerasi. Itu menyentuh `src/lib/zephyrIndeks.ts`/`src/lib/zephyrFakta.ts` (dilarang) dan `scripts/gen-fakta-zephyr.mjs` (dilarang dijalankan tanpa izin).

**Usulan:** setelah patch ini stabil, pemilik repo menambahkan satu entri dokumen pendek ("blok batas keras: 8 butir, judul `# Batas keras`/`# Hard limits`, anggaran 2.000 tok, gate `scripts/uji-larangan-live.mjs`") ke dokumen yang diindeks, lalu regenerasi. Tanpa itu, Zeph tetap bisa menjawab soal aturannya dari **teks prompt** (blok inti), bukan dari retrieval.

---

## U9. Pencegahan regresi (usulan struktural, opsional)

Saat ini 7 aturan wajib hidup di tiga tempat (`caraKerja`, `aturan`, blok larangan) dan hanya dijaga oleh harness. Risiko berikutnya: seseorang memangkas satu kalimat di blok `aturan`/`caraKerja` dan salah satu butir wajib hilang tanpa ada gate yang menangkapnya (harness baru ini menangkapnya, tapi ia harus dijalankan).

**Usulan:** jadikan `scripts/uji-larangan-live.mjs` bagian dari rangkaian cek standar repo (sejajar `uji-blok-inti.mjs`/`uji-blok-kondisional.mjs`), dan tambahkan satu cek "tanda tangan 7 aturan wajib muncul persis 1x" ke `scripts/cek-batas-inti.mjs`/CI. Kalau pemilik repo ingin yang lebih kuat: pindahkan teks 7 butir wajib ke satu array di `src/lib/systemPrompt.ts` yang dipakai untuk mencetak blok ekor, lalu harness A membandingkan array itu dengan teks terkirim (satu sumber kebenaran; tidak menambah char ke prompt, hanya menambah kode).
