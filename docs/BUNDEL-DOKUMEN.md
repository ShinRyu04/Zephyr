# BUNDEL-DOKUMEN — semua dokumen repo masuk ke dalam aplikasi

Status: dokumen hidup (ikut dibundel; berkas ini sendiri salah satu isi bundel).
Item: **AI-TAHU-100-4** — cabang `feat/ai-panel-vscode-layout`.

## 1. Kenapa berkas ini ada

Aplikasi yang dipasang orang lain **tidak membawa folder sumbernya**. `src/` dan
`docs/` sengaja tidak ikut repo publik (`docs/ATURAN-KERJA.md` §1), jadi Zeph tidak
bisa menjawab "apa isi dokumen Zephyr" dengan membaca disk user — di mesin user
folder itu memang tidak ada.

Karena itu seluruh dokumen **dipanen saat build** dan **dibundel bersama aplikasi**:

| Lapis | Berkas | Ikut kapan |
|---|---|---|
| Generator | `scripts/gen-dokumen-bundel.mjs` | saat repo di-build / manual |
| Artefak (hasil generate) | `src/lib/zephyrDokumenData.ts` | ikut bundel frontend |
| Mesin pencari | `src/lib/zephyrDokumen.ts` | ikut bundel frontend |
| Bukti | `scripts/cek-bundel-docs.mjs` | dijalankan dari repo (bukan bundel) |

Pola ini sama dengan fakta Zephyr yang sudah ada
(`scripts/gen-fakta-zephyr.mjs` → `src/lib/zephyrIndeks.ts` → `src/lib/zephyrCari.ts`),
tapi sasarannya berbeda: lapis itu menyimpan **fakta ringkas** (label, setelan,
pintasan), lapis ini menyimpan **isi dokumen apa adanya** (sub-bab, tabel, keputusan,
spike) sehingga pertanyaan seperti "apa isi KEPUTUSAN-MARKETPLACE-j5" atau "apa yang
baru di 1.1.12" bisa dijawab dari teks dokumennya, bukan dari ingatan model.

## 2. Isi bundel (apa yang dibaca generator)

1. **`docs/**/*.md`** — semua markdown di bawah `docs/`, termasuk sub-folder
   (rekursif).
2. **`CHANGELOG*.md`** di akar repo (`CHANGELOG.md`).
3. **`README*.md`** di akar repo (`README.md`).
4. **`RELEASE_NOTES*.md`** di akar repo — keluarga catatan rilis; inilah bahan
   jawaban "apa yang baru" untuk versi yang belum masuk `CHANGELOG.md`.

Berkas yang **tidak** diambil: `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`,
`BUGLOG.md`, `TODO-ZEPHYR.md`, `HANDOFF-AI.md`, `PUBLISH.md`, `BUILD_REPORT.md`.
Alasannya: itu berkas kerja/panduan agen, bukan dokumentasi produk; sebagian sudah
masuk indeks fakta (`AGENTS.md`, `ARCHITECTURE.md` ada di kategori `dokumen`
`zephyrIndeks.ts`). Menambahkannya cuma perlu satu baris di `PILIH_AKAR` generator.

Ukuran hari ini: **ratusan KB teks** (lihat `DOKUMEN_VERSI.totalByte` di artefak,
dan angka yang dicetak `scripts/cek-bundel-docs.mjs`). Tidak ada potongan yang
disimpan sebagai berkas gambar: PNG di `docs/screenshots/` **tidak** ikut.

## 3. Normalisasi (penting, dan berlaku di dua sisi)

- Baris baru `CRLF` → `LF` (nomor baris tidak bergeser, jadi `berkas:baris` tetap
  cocok dengan berkas aslinya).
- Kutip lengkung `’ ‘` → `'` saat **pencocokan** (bukan saat penyimpanan).
- Teks **disimpan apa adanya** (setelah CRLF→LF). Generator tidak memotong,
  meringkas, atau menerjemahkan satu baris pun.

Konsekuensinya: `potongan` yang dikembalikan pencarian bisa dicek balik ke berkas
aslinya. Harness memang melakukan itu (§7, butir 6).

## 4. Pemecahan jadi bagian + metadata

Pemecahan per judul ATX (`#`..`######`), **judul di dalam blok pagar
(```` ``` ```` / `~~~`) diabaikan** — tanpa aturan itu, komentar `#` di dalam blok
` ```bash ` akan dianggap sub-bab dan dokumen seperti `AGENTS.md`/`CHANGELOG.md`
pecah di tempat yang salah.

Untuk tiap bagian disimpan: **berkas, judul, baris judul, baris teks pertama, teks
bagian** — dua nomor baris itu disimpan **eksplisit**, bukan diturunkan dari rumus,
supaya pembaca tidak perlu menebak. `barisJudul = 0` berarti bagian ini memang tidak
punya judul (teks sebelum judul pertama, label `(tanpa judul)`, teksnya mulai di
baris 1); judul nyata memakai nomor barisnya sendiri (1-based). `barisTeks` adalah
baris pertama teks bagian — beda dari `barisJudul + 1` kalau ada baris kosong
sesudah judul.

**Judul tanpa badan tetap disimpan, dengan `teks: ""`.** Di `CHANGELOG.md` nyata,
blok rilis memang begitu: `## [Unreleased]` langsung disusul `### Security`. Bagian
berbadan-kosong itu **batas blok rilis** — tanpanya, penelusuran "apa yang baru"
melompat ke rilis pertama (`[1.0.0]`, perubahan setahun lalu), karena itu judul rilis
pertama yang punya teks. Pencarian melewati bagian berteks kosong: tidak ada baris
yang bisa dikutip dari sana, jadi hasilnya cuma potongan kosong yang menyesatkan.

Untuk tiap **berkas** disimpan: **nama, ukuran byte, waktu ubah (ISO 8601),
jumlah bagian, jumlah baris**. Ukuran + waktu ubah dipakai harness untuk
membedakan "berkasnya berubah setelah panen" dari "teksnya dikarang" (§7).

## 5. Pencarian lokal: batas yang ditulis sebagai angka

Semua ini konstanta ekspor di `src/lib/zephyrDokumen.ts` — bukan angka yang
disembunyikan di dalam fungsi:

| Konstanta | Nilai | Arti |
|---|---|---|
| `BATAS_HASIL_BAWAAN` | **8** | hasil kalau pemanggil tidak menyebut batas |
| `BATAS_HASIL_MAKS` | **30** | batas keras per pencarian |
| `BATAS_KARAKTER_HASIL` | **6000** | anggaran karakter seluruh hasil |
| `BATAS_POTONGAN` | **240** | panjang maksimum satu potongan (karakter) |
| `BATAS_POTONGAN_BARU` | **400** | potongan untuk jawaban "apa yang baru" |
| `BATAS_KATA_KUERI` | **12** | kata kueri yang diperhatikan (sisanya dibuang) |
| `BATAS_HASIL_SUNTIK` | **6** | bagian yang ikut suntikan otomatis ke prompt |
| `BATAS_KARAKTER_SUNTIK` | **1500** | anggaran karakter suntikan otomatis |
| `BATAS_BARU_BAWAAN` | **4** | bagian catatan rilis untuk jawaban "apa yang baru" |

Sifat pencarian (sengaja, bukan kebetulan):

- **Lokal**: tidak ada jaringan, tidak ada permintaan ke mana pun. Semua dari
  `DOKUMEN_BAGIAN` yang ikut bundel.
- **Deterministik**: pengurutan akhir memakai `(skor, berkas, baris)` sebagai kunci,
  bukan urutan kedatangan — mesin/bahasa sistem tidak mengubah hasil.
- **Semua kata isi wajib cocok** (AND). Kalau tidak ada yang cocok, pencarian
  dilonggarkan sekali (separuh kata cukup) dan hasil longgar **ditandai**
  (`cara: 'longgar'`) supaya model tidak memperlakukannya sebagai bukti kuat.
- **Kata umum dibuang** ("apa", "yang", "cara", "berapa", …): tanpa itu pertanyaan
  manusia menuntut entri memuat kata "apa" dan jawabannya nol.
- **Kata yang tidak ada di dokumen dilaporkan jujur** lewat `kataTakDikenal()`.
- **Potongan selalu bernomor baris** (`berkas:baris`); pemanggil bisa menunjuk
  pembaca ke baris yang tepat.

## 6. "Apa yang baru" dijawab dari CHANGELOG

`pertanyaanBaru(kueri)` mengenali niat kebaruan (kata: baru, terbaru, update, rilis,
release, changelog, versi) **pada kueri pendek (≤3 kata isi)** — sengaja sempit supaya
pencarian biasa tidak tergeser. Kalau niat terdeteksi:

- `apaYangBaru(batas)` menelusuri **`CHANGELOG.md`** dari blok rilis teratas
  (mis. `## [Unreleased]`), melewati judul tanpa badan, berhenti di judul blok rilis
  berikutnya, dan mengembalikan potongan ber-`berkas` + `baris`. Berhenti-di-blok
  berikutnya itu bukan hiasan: tanpa itu jawaban "apa yang baru" meluber ke
  perubahan rilis lama. Harness memeriksa batas ini secara eksplisit — semua baris
  yang dikutip harus berada **di atas** baris judul blok rilis kedua di berkas nyata
  (di `CHANGELOG.md` sekarang: semua baris < 77).
- `jawabApaYangBaru(kueri?)` merangkainya jadi teks siap kirim, dan
  `suntikanDokumen()` memakai jalur itu lebih dulu sebelum hasil pencarian biasa.

Teks yang keluar **adalah kutipan baris dari `CHANGELOG.md`**, bukan ringkasan
karangan. Harness memverifikasi setiap potongan itu benar-benar ada di berkas nyata
pada baris yang disebut.

## 7. Bukti yang harus lulus

```
node scripts/gen-dokumen-bundel.mjs          # panen ulang artefak
node scripts/gen-dokumen-bundel.mjs --check  # artefak masih sinkron dengan disk?
node scripts/cek-bundel-docs.mjs             # harness, exit 0/1, mencetak angka
npx tsc --noEmit                             # 0 galat baru
```

`scripts/cek-bundel-docs.mjs` memeriksa, dan mencetak angkanya:

1. artefak tidak basi (`gen-dokumen-bundel.mjs --check`) + bundel tidak kosong +
   `zephyrDokumen.ts` benar-benar bisa dibundel & dimuat (harness membundel ulang
   lewat esbuild lalu `import()`, jadi yang diuji adalah kode yang ikut bundel);
2. jumlah berkas nyata (walk disk) == jumlah berkas terbaca di bundel, dan himpunan
   namanya sama (yang hilang/berlebih dicetak); `jumlahBagian == DOKUMEN_BAGIAN.length`;
3. setiap bagian punya nama berkas nyata + judul; `barisJudul` benar-benar baris
   judul di berkas nyata; `barisTeks` benar-benar baris pertama teksnya; teks bagian
   **ada apa adanya di berkas nyata**; bagian berteks kosong hanya boleh judul yang
   isinya memang kosong;
4. **minimal 6 istilah nyata** (`marketplace`, `tema`, `keymap`, `plugin`, `rilis`,
   `screenshot`, `changelog`, `ssh`) masing-masing mengembalikan hasil — tanpa jaringan;
5. setiap potongan hasil punya nomor baris, dan **teks potongannya ada di berkas nyata
   pada baris itu** (dibandingkan langsung dengan isi disk);
6. batas berlaku: `batas` kecil dipatuhi, `batas` besar dipotong di `BATAS_HASIL_MAKS`,
   `batas` 0/negatif tetap memberi hasil, keluaran teks tidak melewati
   `BATAS_KARAKTER_HASIL`, potongan tidak melewati `BATAS_POTONGAN`;
7. jawaban "apa yang baru" berasal dari `CHANGELOG.md` nyata: kepala menyebut
   `CHANGELOG.md`, semua kutipannya terverifikasi ada di berkas itu, dan semuanya
   berada di dalam **blok rilis teratas** (di atas judul blok rilis berikutnya).

Harness keluar `1` kalau ada satu pemeriksaan merah — sudah diuji: menyentuh satu
dokumen tanpa generate ulang membuatnya `GAGAL` + `exit 1`.

Catatan lintas-lane: kalau lane lain menyunting `docs/` **saat** harness berjalan,
teks yang dibandingkan bisa meleset bukan karena dikarang. Harness membedakan dua
hal itu (`ukuran`/`waktu ubah` berkas di disk vs metadata panen) dan mencetak
`CATATAN ... berubah sejak panen`, bukan menuduh data palsu.

## 8. Yang belum dikerjakan di sini (jujur)

- **Penyambungan ke prompt** ada di berkas milik lane lain (`src/lib/systemPrompt.ts`).
  Modul ini menyediakan `suntikanDokumen()` dengan bentuk yang sama seperti
  `suntikanIndeks()`; lane itu yang memanggilnya. Selama belum dipanggil, isi dokumen
  hanya bisa dicapai lewat pemanggilan langsung (mis. tool `zephyr_self`).
- Pencarian **tanpa** stemming/sinonim: kueri "pasang plugin" tidak akan menemukan
  sub-bab yang hanya memakai kata "Install". Ini pilihan sadar — pencarian yang
  mengarang kecocokan lebih mahal daripada hasil nol yang jujur.
- Dokumen **tidak** dirujuk silang ke `zephyrIndeks.ts`; dua lapis itu hidup
  berdampingan (indeks fakta untuk nama teknis, bundel dokumen untuk isi prosa).
