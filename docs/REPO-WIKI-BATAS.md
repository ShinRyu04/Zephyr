# Repo Wiki Zephyr — apa yang benar-benar dihasilkan, dan apa batasnya

Dokumen ini menjawab satu pertanyaan: **Repo Wiki di Zephyr itu setara apa?**
Jawabannya bukan "wiki platform", dan berkas ini menjelaskan kenapa — supaya
tidak ada yang mengira fitur ini lebih dari yang sebenarnya.

## 1. Wiki platform vs Repo Wiki Zephyr

Wiki GitHub/GitLab adalah **repo Git terpisah** dengan UI web. Zephyr bukan
hosting, jadi tidak ada UI web untuk non-developer yang bisa ditawarkan.
Yang dibangun adalah pendekatan **`docs/` yang bisa di-review lewat PR**.

| | Wiki platform (GitHub/GitLab) | Repo Wiki Zephyr |
|---|---|---|
| Bentuk | Repo Git terpisah, UI web | Berkas `.zephyr/wiki/` **di repo yang sama** |
| Review via PR | Tidak (terpisah dari repo utama) | **Ya** — ikut commit/PR yang sama |
| Versioning bareng kode | Terpisah | **Satu commit dengan kode** |
| Akses non-developer | Mudah (browser) | Perlu buka Zephyr |
| History / clone | Ya (repo sendiri) | Ya (ikut repo utama) |

Jadi: Zephyr **menang** di "dokumentasi ikut alur review kode", dan **kalah** di
"akses orang non-teknis". Itu pertukaran yang wajar untuk sebuah IDE lokal, bukan
kekurangan yang bisa ditambal tanpa membangun layanan hosting.

## 2. Dua artefak, dua pembaca

| Artefak | Pembaca | Lokasi ekspor |
|---|---|---|
| **Repo Wiki** | Manusia | `.zephyr/wiki/*.md` |
| **Knowledge Card** | Agen (Zeph AI) | `.zephyr/knowledge/*.md` |

Keduanya dihasilkan dari **satu jalan** atas workspace, bukan dua yang bisa
berbeda pendapat soal berkas mana yang ada. Itu sebabnya opsi generasi
(`autoUpdate`, `autoExport`, `citation`) tinggal di store yang sama, bukan di
masing-masing panel.

## 3. Batas yang harus disebut terang-terangan

### Yang BISA dihasilkan `Generate` (deterministik, dari disk)

- Peta modul: folder tingkat atas, jumlah berkas, berapa yang punya ekspor.
- Daftar ekspor per berkas: fungsi, kelas, tipe, konstanta (regex per bahasa).
- Ringkasan satu-dua baris **dari doc-comment penulisnya sendiri**, bukan karangan.
- Jumlah baris, jalur, nama paket + versi dari `package.json` / `Cargo.toml`.
- Ekspor ke `.zephyr/wiki/` + `.zephyr/knowledge/`, dengan **jumlah nyata**
  yang dilaporkan (bukan klaim "berhasil").

Sifatnya: **peta**. Setiap kalimat bisa dilacak ke satu berkas di disk. Tidak ada
jaringan, tidak ada model, hasil sama untuk input yang sama.

### Yang TIDAK bisa dihasilkan `Generate`

Isi wiki yang sesungguhnya menurut definisi platform:

- **Keputusan desain** — kenapa X dipilih dan bukan Y.
- **Konvensi kode** tim (di luar yang tertulis sebagai komentar).
- **Troubleshooting / FAQ** — masalah nyata yang pernah ditemui.
- **Onboarding** untuk kontributor baru.
- **Alasan** di balik sebuah arsitektur.

Semua itu **pengetahuan manusia**. Tidak ada di kode, jadi tidak bisa
diturunkan dari kode. Generator yang mencoba menebaknya akan menghasilkan
halaman yang percaya diri tentang codebase yang tidak pernah diverifikasi —
persis kelas kegagalan yang paling dihindari produk ini.

### Jalur yang menutup celah itu: `Create With Plan`

Tombol kedua membuka chat dan mengirim `/knowledge-plan`. Di situ **Anda +
agen** menuliskan alasan dan konvensi yang tidak ada di kode, lalu keduanya
menghasilkan halaman bersama. Bukan otomatis, dan memang tidak seharusnya
otomatis — pertanyaannya butuh jawaban Anda.

Karena itu dua tombol itu **bukan duplikat**:

| | `Generate` | `Create With Plan` |
|---|---|---|
| Sumber | disk saja | disk + pengetahuan Anda |
| Hasil | peta | narasi + alasan |
| Bisa diulang | ya, identik | tidak, percakapan |
| Waktu | detik | menit |

## 4. Kenapa tidak ada persistensi dulu

Hasil generasi **tidak** disimpan ke settings. Alasannya:

Wiki yang ditulis setengah jalan lebih buruk daripada yang hilang. Pembaca akan
membukanya sesi berikutnya dan membaca halaman yang menjelaskan codebase dari
tiga commit lalu **tanpa penanda apa pun** bahwa isinya basi.

Persistensi harus datang bersama **cap versi** yang membuat kebasian terlihat
(hash sumber + versi app, item `zeph-versi-indeks-basi`). Sampai itu ada, hasil
hidup selama sesi — dan itu jujur.

## 5. Cara menguji

```bash
node scripts/verify-wiki-eksplorer.mjs
```

Yang dikunci harness itu:

- Outline/Timeline **pindah** ke Explorer: tombolnya hilang dari rel **dan**
  seksinya benar-benar terpasang (kalau hanya dihapus, fiturnya lenyap tanpa error).
- Seksi lipat pakai `<button>` + `aria-expanded`, bukan `div` dengan onClick.
- Generator memakai `scanDir` + `fsRead`, dan **nol** jaringan.
- `Generate` memanggil generator dan melaporkan galat; `Create With Plan`
  mengirim prompt dan **tidak** memanggil generator (dua jalur tidak tertukar).
- Ekspor melaporkan jumlah berhasil/gagal, bukan klaim kosong.
- Kunci i18n ada di kesepuluh kamus.
