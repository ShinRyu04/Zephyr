# Dua jebakan yang menipu: klik di luar layar, dan hitungan yang salah

Ditulis 2026-10-03, saat mengerjakan tampilan LSP ala Terax. Dua bug muncul
berturut-turut, dan **keduanya bukan bug aplikasi** - keduanya salah ukur.
Menghabiskan tiga putaran.

## 1. Klik CDP pada elemen di luar viewport TIDAK SAMPAI

Daftar Language Server punya 21 baris. Tombol di bagian bawah berada di
`y = 1410` pada jendela 1080p - **di luar layar**.

Gejalanya menipu sempurna:

    toggle php: aria-checked false -> false   (tidak berubah)
    settings:   { }                            (tidak tersimpan)

Terbaca seperti **toggle rusak**. Padahal:

    kotak: [1069, 1410, 36, 20]
    elemenDiTitikTengah: null      <- tidak ada elemen di koordinat itu
    klikSampai: false              <- kliknya tidak pernah mengenai tombolnya

`Input.dispatchMouseEvent` memakai koordinat **LAYAR**. Untuk elemen di luar
viewport, `elementFromPoint` mengembalikan null dan kliknya jatuh ke tempat lain
tanpa error apa pun.

**Yang benar:** `scrollIntoView({ block: 'center' })` DULU, lalu ukur ulang
koordinatnya **sesudah** menggulir. Mengukur sebelum menggulir menghasilkan
angka yang sudah basi.

Tambahkan juga pemeriksaan `elementFromPoint` yang memastikan elemennya memang di
titik itu, dan laporkan kalau tidak - supaya kegagalan seperti ini berbunyi
"klik tidak sampai", bukan "fitur rusak".

## 2. Menghitung "10 kamus" dengan menghitung BARIS, bukan kamus

Menambahkan 10 terjemahan ke 10 kamus di `i18n-extra.ts` **GAGAL**:

- skrip menyisipkan pada satu kalimat penanda (`'No server matches that filter.':`)
- penanda itu kebetulan **hanya ada di kamus ID**
- sehingga **10 kunci masuk ke SATU kamus**
- skrip melaporkan **"berhasil ke 11 kamus"** - ia menghitung kemunculan teks

`tsc` yang menemukannya: **TS1117**, 10 properti bernama sama dalam satu objek.
Tanpa `tsc`, ini akan lolos dan menjadi halaman yang rusak.

**Yang benar:** sisipkan **per kamus**, dengan batas kamus yang dibaca dari
strukturnya (`const XX: Dict = {` ... baris `};`), lalu **baca ulang** dan hitung
per kamus. Skrip penjaga juga harus memeriksa **duplikat**, bukan hanya
keberadaan.

## 3. Berkas kamus memakai CRLF

`baris[j] === '};'` **tidak pernah kena**, karena barisnya berbunyi `};\r`.
Akibatnya tidak satu pun kamus ditemukan, dan skripnya melaporkan "KAMUS TIDAK
DITEMUKAN" untuk kesepuluhnya sekaligus.

**Pakai `baris[j].trim() === '};'`**, bukan perbandingan persis.

## 4. Penjaga berkutip tunggal lolos pada kunci berkutip ganda

Pemeriksaan `teks.includes("'" + KUNCI + "'")` melaporkan "belum ada" padahal
kunci itu sudah ada dengan **kutip ganda** - lalu terjemahannya disisipkan lagi
sebagai duplikat.

**Periksa kedua bentuk kutip.** Dan jangan pernah menyimpulkan "berhasil" dari
skrip yang menulis: jalankan `npx tsc --noEmit` sebelum percaya.

## Pola yang layak diulang

- **`tsc` menangkap dalam sekali jalan** apa yang tiga skrip penjaga lewatkan.
  Jalankan sebelum menyimpulkan apa pun berhasil.
- **Uji harus mengukur hal yang benar.** Uji yang mengukur `.lsp-grup` untuk
  memeriksa perendupan `.lsp-baris` melaporkan gagal padahal CSS-nya bekerja.
  Uji yang salah mengukur lebih buruk daripada tidak ada uji: ia menolak
  perbaikan yang benar.
- **Lock keadaan awal sebelum menguji toggle.** Server terpasang bisa sudah
  menyala dari sesi sebelumnya, jadi klik tunggalnya justru MEMATIKAN - dan
  ujinya berbunyi gagal. Kunci ke nilai yang diinginkan dulu, dan **lewati
  dengan pesan jelas** kalau tidak bisa dikunci, alih-alih melaporkan gagal.
