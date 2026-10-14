# LAPORAN BLOK KONDISIONAL

Item: ZEPH-LARANGAN-BLOK + ZEPH-BLOK-KONDISIONAL (2026-10-14).
Status: SELESAI. Semua angka di bawah adalah keluaran NYATA harness (bukan perkiraan):
`node scripts/uji-blok-kondisional.mjs` -> **69/69 lulus, 0 GAGAL**, `node scripts/uji-blok-inti.mjs` -> **37/37 lulus**, `npx tsc --noEmit` -> **0 galat**.

## 1. Ambang (dibaca dari kode, bukan ditetapkan di laporan ini)

| Hal | Nilai | Sumber (berkas:baris) |
|---|---|---|
| Ambang token blok inti | 2.000 token | `src/lib/systemPrompt.ts:733` `export const AMBANG_TOKEN_INTI = 2000;` |
| Ambang char blok inti | 8.000 char | `src/lib/systemPrompt.ts:723-724` (komentar: "2.000 token = 8.000 karakter (satuan yang dipakai gate `cek-batas-inti.mjs`)") |
| Cara hitung token | `ceil(char / 4)` | `src/lib/systemPrompt.ts:720` (komentar `AMBANG_TOKEN_INTI`) |
| Anggota blok inti selalu-nyala | `faktaInti()` + `blokLarangan()` + `kepalaPotret()` | `src/lib/systemPrompt.ts:1035-1048` (komposisi nyata di `systemPromptFor`), anggota didefinisikan `:802` dan `:846` |
| Batas suntikan per giliran | 1.200 char | `src/lib/zephyrCari.ts:453` `export const BATAS_KARAKTER_SUNTIK = 1200;` |
| Sumber angka di harness | regex baca kedua berkas di atas | `scripts/uji-blok-kondisional.mjs` fungsi `batasSuntik()` - kalau konstanta hilang/berubah nama, harness GAGAL, bukan diam-diam memakai angka karangan |

Catatan kejujuran angka: **dua anggaran itu TERPISAH**. Kolom "total giliran" di bagian 2 boleh melewati
2.000 token (mis. ubah berkas id = 2.103 tok) karena isinya = blok inti (anggaran `AMBANG_TOKEN_INTI`)
+ suntikan kondisional (anggaran `BATAS_KARAKTER_SUNTIK`). Yang dijaga: A.1/A.3 = tiap anggaran sendiri,
A.4 = jumlah kedua anggaran. Tidak ada ambang yang dilonggarkan di kode; nilai 2.000 / 8.000 / 1.200 di
atas semuanya berasal dari konstanta yang sudah ada sebelum lane ini.

## 2. Angka nyata per jenis tugas

Jenis tugas = kumpulan probe pesan user yang ada di harness (3 pesan per jenis). Kolom "suntikan maks"
= blok kondisional terpanjang yang benar-benar disuntik kode produk untuk pesan di jenis itu.

Bahasa aktif **id** (`faktaInti` 6.986 + larangan 728 + kepala 96 = **7.810 char / 1.953 tok**, sisa 190 char):

| Jenis tugas | Kelas yang terpicu (kode produk) | Suntikan maks | Total giliran | <= anggaran? |
|---|---|---|---|---|
| tanya biasa | kosong (nol) | 0 char / 0 tok | 7.810 char / 1.953 tok | ya (inti 1.953 <= 2.000) |
| tulis kode | kosong (nol) | 0 char / 0 tok | 7.810 char / 1.953 tok | ya |
| ubah berkas | jendela 425, galat 602 | 602 char / 151 tok | 8.412 char / 2.103 tok | ya (suntikan 602 <= 1.200) |
| audit | tabel+galat 891, tabel+jendela 714 | 891 char / 223 tok | 8.701 char / 2.176 tok | ya (suntikan 891 <= 1.200) |

Bahasa aktif **en** (`faktaInti` 6.986 + larangan 702 + kepala 101 = **7.789 char / 1.948 tok**, sisa 211 char):

| Jenis tugas | Kelas yang terpicu | Suntikan maks | Total giliran | <= anggaran? |
|---|---|---|---|---|
| tanya biasa | kosong | 0 char / 0 tok | 7.789 char / 1.948 tok | ya |
| tulis kode | kosong | 0 char / 0 tok | 7.789 char / 1.948 tok | ya |
| ubah berkas | jendela 404, galat 598 | 598 char / 150 tok | 8.387 char / 2.097 tok | ya |
| audit | tabel+galat 834 | 834 char / 209 tok | 8.623 char / 2.156 tok | ya |

Panjang tiap kelas kondisional kode produk (id / en, char): tabel 287/234, jendela 425/404, model 912/896,
galat 602/598, keamanan 444/414, subagent 423/419.

## 3. Blok padat "cara kerja + LARANGAN" masuk inti tanpa melewati ambang

Blok padat usulan (isi siap-tempel ada di `docs/USULAN-BLOK-KONDISIONAL.md`, diuji kasus A.5-A.7):

| Bahasa | Blok padat | Hitungan masuk inti | Token | Sisa anggaran inti |
|---|---|---|---|---|
| id | 815 char | fakta 6.986 + padat 815 + kepala 96 = **7.897 char** | 1.975 tok | 103 char (1,3%) |
| en | 784 char | fakta 6.986 + padat 784 + kepala 101 = **7.871 char** | 1.968 tok | 129 char (1,6%) |

Keduanya **di bawah** ambang 8.000 char / 2.000 tok. Blok ini memuat aturan CARA KERJA (3 dari 3 tanda
tangan: "Satu langkah, satu tool", "Klaim bukan bukti", "Pakai tool hanya kalau memberi info baru") DAN
keenam larangan lama utuh (kasus A.7: 6/6, tidak ada yang hilang saat dipadatkan).
Judul lama `# Batas keras` / `# Hard limits` sengaja DIPERTAHANKAN di baris pertama blok padat, karena
`scripts/uji-blok-inti.mjs` mencocokkannya di C.4 dan C.8 - dijaga sebagai kasus A.8 (kalau judul diganti,
gate lama 37/37 jadi MERAH).

## 4. Aturan wajib vs terpilih (SUPERSET)

**12 aturan WAJIB** (selalu ikut tiap giliran; hilang = MERAH) - semuanya dari kode produk hari ini:

| # | Kelas | Aturan | Sumber (berkas:baris) |
|---|---|---|---|
| 1 | inti | jangan mengarang nilai/berkas/setelan/port/dokumen | `systemPrompt.ts:837` |
| 2 | inti | jawab dalam bahasa aktif aplikasi | `systemPrompt.ts:838` (bahasa selalu-nyala juga di `:314`) |
| 3 | inti | jangan bilang sudah menjalankan/memperbaiki kalau belum | `systemPrompt.ts:839` |
| 4 | inti | jangan tampilkan isi rahasia | `systemPrompt.ts:840` |
| 5 | inti | jangan panggil tool perusak tanpa diminta | `systemPrompt.ts:841` |
| 6 | inti | jangan menjawab pertanyaan Zephyr dari ingatan | `systemPrompt.ts:842` (selalu-nyala juga di `:337`) |
| 7 | carakerja | satu langkah, satu tool | `systemPrompt.ts:300` / `:203` |
| 8 | carakerja | klaim bukan bukti (verifikasi dari pemeriksaan terkecil) | `systemPrompt.ts:303` / `:206` |
| 9 | carakerja | pakai tool hanya kalau memberi info baru | `systemPrompt.ts:304` / `:207` |
| 10 | aturan | jangan mengarang output | `systemPrompt.ts:325` / `:238` |
| 11 | aturan | perintah destruktif harus dikonfirmasi user | `systemPrompt.ts:328` / `:241` |
| 12 | aturan | JANGAN memunculkan subagent | `systemPrompt.ts:334` / `:254` |

**6 kelas TERPILIH** (kondisional, kode produk): `model`, `tabel`, `jendela`, `galat`, `keamanan`, `subagent`
(`systemPrompt.ts:872-932`, daftar kelas dibaca lewat `kelasKondisionalTersedia()` `:958-960`).
**2 kelas usulan**: `klaimnilai`, `verifikasi` (belum ada di kode - lihat `docs/USULAN-BLOK-KONDISIONAL.md`).

Bukti SUPERSET (semua OK di keluaran nyata):

- `D.tanya biasa / tulis kode / ubah berkas / audit id & en` -> "12 aturan wajib utuh di 3 pesan" pada tiap jenis tugas, walaupun kelas kondisionalnya berbeda-beda (kosong / jendela+galat / tabel+galat+jendela).
- `D.luar topik id/en` -> 12 aturan wajib tetap lengkap walau **nol** blok kondisional yang disuntik.
- `D.wajib tak cond id/en` -> nol aturan wajib yang hanya hidup di blok kondisional (kalau sebuah aturan wajib cuma bisa muncul lewat kelas kondisional, kasus ini GAGAL).
- `D.kelas terpilih id/en` -> tiap kelas terdaftar punya probe pemicu DAN bloknya benar-benar muncul di rakitan: kelas terpicu = `galat, jendela, keamanan, model, subagent, tabel` (6 dari 6 terdaftar).
- `B.4` -> blok larangan berada di EKOR blok inti pada rakitan asli (offset 8.876 > offset fakta 1.888), bukan cuma "ada di suatu tempat".

## 5. Aturan yang SUDAH ada di prompt sekarang (berkas + baris)

Yang sudah ada, jadi tidak diusulkan ulang:

| Aturan | Di mana hari ini | Sudah kondisional? |
|---|---|---|
| 6 larangan inti (ngarang, bahasa, klaim palsu, rahasia, tool perusak, Zephyr dari ingatan) | `src/lib/systemPrompt.ts:825-833` (EN), `:835-843` (ID), dipakai `blokLarangan()` `:846-848` | tidak - selalu ikut (blok inti) |
| cara kerja: satu langkah satu tool / klaim bukan bukti / tool hanya kalau info baru | `:200-214` (EN `:203`, `:206`, `:207`), `:297-311` (ID `:300`, `:303`, `:304`) | tidak - selalu ikut |
| klaim bukan bukti versi "bukti dari disk" | `:335` (ID), padanan EN di blok `aturan` `:215-260` | tidak - selalu ikut |
| bentuk jawaban TABEL (markdown, maks 6 kolom, satuan di sel) | `:891-897` kelas `tabel` (`:895` ID / `:896` EN) | **ya, sudah kondisional** |
| kunci setelan panel + pintasan bawaan | `:898-906` kelas `jendela` | ya |
| prosedur debugging (blok keadaan -> Problems/Output -> berkas log; port 9223 = CDP) | `:907-914` kelas `galat` | ya |
| rahasia & kredensial (jangan cetak nilainya, sebut lokasinya) | `:915-923` kelas `keamanan` (serta selalu-nyala `:328`, `:241`) | ya + selalu-nyala |
| anggaran subagent (`subagent.maxParallel`, `allowWrite`) | `:924-931` kelas `subagent` (larangan wajibnya `:334`, `:254`) | ya |
| fakta provider/API key/daftar model | bullet dipotong dari blok inti (`ON_DEMAND` `:749-754`, `faktaInti()` `:802-808`, `faktaOnDemand()` `:782`) dan dikirim UTUH oleh kelas `model` (`:873-889`) | ya |
| pemilih kondisional (deterministik, regex, tanpa model) | `kelasKondisional()` `:935-939`, `blokKondisional()` `:942-948`, `kelasKondisionalTersedia()` `:958-960` | - |
| titik komposisi ke prompt | `faktaInti()` `:1047`, `blokLarangan()` `:1048`, `suntikanIndeks(kueri)` `:1071`, `blokKondisional(kueri)` `:1087` | - |

Kesimpulan bagian ini: **"format tabel" sudah kondisional** (kelas `tabel`, `:891-897`) dan **"verifikasi
mandiri"/"klaim-nilai" sudah ada tapi selalu-nyala** (`:303`/`:206`, `:335` untuk verifikasi; `:325`/`:238`
untuk "jangan mengarang output"). Yang benar-benar BELUM ada di kode: (a) kelas yang menegaskan **klaim
nilai/angka** hanya saat giliran ini memang menanyakan angka, (b) pemotong prioritas yang menjaga total
suntikan per giliran tetap <= 1.200 char saat beberapa kelas terpicu sekaligus.

## 6. Bukti (keluaran nyata)

```
$ node scripts/uji-blok-kondisional.mjs
ANGGARAN: blok inti 8000 char / 2000 token (AMBANG_TOKEN_INTI, token = ceil(char/4)) | batas suntikan per giliran 1200 char (BATAS_KARAKTER_SUNTIK, src/lib/zephyrCari.ts)
  id: faktaInti 6986 + larangan 728 + kepala 96 = 7810 char / 1953 tok (sisa 190 char)
      panjang blok per kelas: tabel=287, jendela=425, model=912, galat=602, keamanan=444, subagent=423
    tanya biasa  suntikan maks    0 char /   0 tok | total giliran 7810 char / 1953 tok | kosong=0, kosong=0, kosong=0
    tulis kode   suntikan maks    0 char /   0 tok | total giliran 7810 char / 1953 tok | kosong=0, kosong=0, kosong=0
    ubah berkas  suntikan maks  602 char / 151 tok | total giliran 8412 char / 2103 tok | jendela=425, galat=602, kosong=0
    audit        suntikan maks  891 char / 223 tok | total giliran 8701 char / 2176 tok | kosong=0, tabel+galat=891, tabel+jendela=714
  en: faktaInti 6986 + larangan 702 + kepala 101 = 7789 char / 1948 tok (sisa 211 char)
      panjang blok per kelas: tabel=234, jendela=404, model=896, galat=598, keamanan=414, subagent=419
    tanya biasa  suntikan maks    0 char /   0 tok | total giliran 7789 char / 1948 tok | kosong=0, kosong=0, kosong=0
    tulis kode   suntikan maks    0 char /   0 tok | total giliran 7789 char / 1948 tok | kosong=0, kosong=0, kosong=0
    ubah berkas  suntikan maks  598 char / 150 tok | total giliran 8387 char / 2097 tok | jendela=404, galat=598, kosong=0
    audit        suntikan maks  834 char / 209 tok | total giliran 8623 char / 2156 tok | kosong=0, tabel+galat=834, tabel+jendela=640
  CATATAN ANGGARAN: "total giliran" di atas = blok inti (anggaran AMBANG_TOKEN_INTI) + suntikan kondisional (anggaran BATAS_KARAKTER_SUNTIK); ia boleh melewati 2.000 token karena dua anggaran itu terpisah. A.1/A.3 menguji tiap anggaran sendiri, A.4 menguji jumlahnya.
OK    A.1 id - blok inti selalu-nyala 7810 char / 1953 tok <= 8000 char / 2000 tok
...
  USULAN padat: id 815 char (sisa ruang 918 char) | en 784 char (sisa ruang 913 char)
OK    A.5a id - fakta 6986 + padat 815 + kepala 96 = 7897 char / 1975 tok <= 8000 char / 2000 tok
OK    A.5b en - fakta 6986 + padat 784 + kepala 101 = 7871 char / 1968 tok <= 8000 char / 2000 tok
OK    A.6 - blok padat memuat aturan CARA KERJA (bukan cuma larangan): id 3/3, en 3/3
OK    A.7 - pemadatan tidak menghilangkan larangan: 6/6 larangan lama masih utuh
OK    A.8 - blok padat mempertahankan JUDUL LAMA (# Batas keras / # Hard limits) - syarat uji-blok-inti.mjs C.4/C.8 tetap hijau
OK    B.1 id - larangan BERBAHAYA lengkap di blok larangan (728 char)
OK    B.2 id - larangan NGARANG lengkap di blok larangan
OK    B.3 - id 6 larangan bernomor (6 unik), en 6
OK    B.4 - larangan ada di EKOR blok inti di rakitan asli (offset 8876 > fakta 1888)
OK    C.1 id - 4 pesan luar topik -> NOL kelas
OK    C.2 id - blok kondisional 0 char untuk semua pesan luar topik
OK    C.3 id - tidak ada judul blok tambahan di rakitan
OK    C.4 id - tidak ada bullet fakta on-demand yang ikut
OK    D.ubah berkas id - 12 aturan wajib utuh di 3 pesan (terpilih = 12 wajib + kelas jendela,galat)
OK    D.wajib tak cond id - tidak ada aturan wajib yang hanya hidup di blok kondisional (nol)
OK    E.1 - dua kali pilih dalam satu proses = hasil sama (kelas + teks, 3+6 pesan)
OK    E.2 - proses baru (22 pesan) memberi pilihan identik
OK    E.3 - pilihan kelas identik di id & en (22 pesan)
OK    E.4 - teks blok ikut bahasa aktif (id: # Aturan tambahan, en: # Extra rule)
OK    F.4 audit - audit: total produk+usulan maks 1104 char / 276 tok <= 1200 char
OK    F.5 - pemotong hanya membuang saat anggaran benar-benar lewat (0 pembuangan sia-sia)
OK    F.6 - pesan luar topik tidak menarik kelas usulan (0 bocor)
      TEMUAN (bukan gate): kombinasi kelas terburuk model+keamanan=1358, model+tabel=1201, tabel+galat=891 - 2 kombinasi melebihi 1200 char; pemilih di kode produk belum punya pemotong prioritas (usulan: docs/USULAN-BLOK-KONDISIONAL.md)

69/69 lulus
Ringkas: blok inti 7810 char / 1953 tok (id), 7789 char / 1948 tok (en); sisa ruang di blok inti 190 char (id) - blok padat usulan 815 char / 204 tok.
```

```
$ node scripts/uji-blok-inti.mjs
...
37/37 lulus
Ringkas: blok inti id 7810 char / 1953 tok, en 7789 char / 1948 tok (ambang 2000 tok).

$ npx tsc --noEmit
(0 galat, exit 0)
```

## 7. Temuan (bukan gate)

1. **Kombinasi kelas bisa lewat anggaran 1.200 char** di kode produk: `model`+`keamanan` = 1.358 char,
   `model`+`tabel` = 1.201 char. Belum ada pemotong prioritas; pemilih sekarang menggabung semua kelas yang
   cocok. Usulannya ada di `docs/USULAN-BLOK-KONDISIONAL.md` (Patch 3).
2. **Giliran "tulis kode" hari ini menyuntik 0 char** - tidak ada kelas yang menegaskan verifikasi mandiri
   saat model menulis kode; aturan itu hanya ada sebagai aturan selalu-nyala (`:303`/`:206`).
3. **Luar topik benar-benar nol**: 4 pesan x 2 bahasa -> nol kelas, nol teks, nol judul blok, nol bullet fakta on-demand.
4. **Blok padat usulan masih menyisakan ruang** 103 char (id) / 129 char (en) di anggaran inti - masuk dengan
   margin, bukan pas-pasan 0 char.

## 8. Batas laporan ini (apa yang TIDAK dibuktikan di sini)

- **Token = perkiraan** `ceil(char/4)` yang dipakai konsisten oleh gate yang sudah ada (`cek-batas-inti.mjs`,
  `uji-blok-inti.mjs`); ini bukan hitungan tokenizer sungguhan.
- Harness baru **memakai modul stub** untuk `./store`, `./zephyrCari` (`suntikanIndeks`), `./personaStore`,
  `./aiZephyrState`, `./terminalStore`, `./historyStore`, `./aiMemori`, `./instructionsStore`, `./commands`,
  `./zephyrRuntime`, `./mcpTools` (esbuild plugin, lihat `scripts/uji-blok-kondisional.mjs`). Yang diukur
  NYATA dari kode produk: `faktaInti()`, `blokLarangan()`, `kepalaPotret()`, `kelasKondisional()`,
  `blokKondisional()`, `kelasKondisionalTersedia()`, `AMBANG_TOKEN_INTI`, dan rakitan `systemPromptFor()`.
- Karena blok indeks di-stub, **kolom "total giliran" belum termasuk potongan indeks** (anggarannya sendiri
  1.200 char, `src/lib/zephyrCari.ts:453`, diisi satu per satu entri di `suntikanIndeks()` `:513-517`).
  Kalau potongan indeks juga dibebankan ke anggaran yang sama dengan blok kondisional, pemotong di usulan
  harus memakai `opsi.batasKarakter` pada `suntikanIndeks()` - itu disebut di `docs/USULAN-BLOK-KONDISIONAL.md`.
- Lapis `F` (kelas `klaimnilai`/`verifikasi` + pemotong) adalah **SIMULASI di harness**, bukan kode produk:
  kode produknya belum diubah (READ-ONLY). Angka F ikut dilaporkan apa adanya, termasuk pemotongannya.
- Tidak ada model yang dipanggil: seluruh kasus deterministik dan bisa diulang tanpa API.
