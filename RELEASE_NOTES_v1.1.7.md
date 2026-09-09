# Zephyr v1.1.7

## UPDATE LAGI

### Panel Bisa Pindah Atas/Bawah

Sebelumnya panel cuma bisa kiri/kanan. Sekarang ada 4 tombol posisi yang selalu kelihatan di kanan atas menu bar: kiri, kanan, atas, bawah — plus tombol mata buat nyembunyiin panel. Klik langsung pindah, gak usah buka menu.

Panel yang dipindah ke atas/bawah juga bisa di-resize vertikal (drag divider). Menu View → Panel Position dan command palette kebagian juga (`Move Panel Top/Bottom`).

### Bahasa Jawaban AI

Settings → Model AI → **Bahasa jawaban AI**. Pilih:

- Ikuti pertanyaan (otomatis)
- Indonesia
- English
- Lainnya — tulis nama bahasa bebas, mis. Jawa, Español, Français

Instruksinya dikirim sebagai system message di awal tiap percakapan, jadi model konsisten jawab pake bahasa pilihan, bukan cuma ikut-ikutan bahasa prompt.

### Ekstensi Gede Bisa Masuk

Batas ekstensi dinaikin gede-gedean:

- Unduhan `.vsix`: 64 MB → 1 GB
- Unzip arsip: 16 MB → 1 GB (total hasil unzip 2 GB)
- File `main`: 1 MB → 20 MB

Ekstensi bahasa (Python, Java, dll) yang bundle-nya puluhan MB sekarang bisa dipasang tanpa ditolak.

### Sandbox Ekstensi: require Relatif Jalan

Dulu cuma file `main` yang dimuat di sandbox. Sekarang backend baca semua file JS/JSON ekstensi, jadi `require('./dist/extension.bundle')` dan require relatif lain beneran resolve. Notifikasi dari ekstensi (`showInformationMessage`, `showErrorMessage`) juga diteruskan ke notifikasi Zephyr.

### Ekstensi Gagal = Auto Nonaktif

Ekstensi yang gagal dimuat di sandbox sekarang otomatis dinonaktifkan — bukan error melulu tiap kali buka app. Pesannya jelas: kebanyakan butuh runtime eksternal (Python/Java/Docker) yang gak ada di sandbox. Mau coba ulang? Aktifkan lagi di Settings → Ekstensi.

### Fix

- Drag & drop file dan event tutup window dibungkus `try/catch` — dulu bisa bikin layar hitam pas jalan di browser dev.

---

## Cara Update

- **Baru pertama:** ambil `Zephyr_1.1.7_x64-setup.exe` atau `.msi` di Releases.
- **Udah punya:** Settings → About → Check for updates. Atau tunggu notif lonceng kalo auto-update nyala.

Signature installer diverifikasi app sebelum install (minisign). SmartScreen tetep bisa protes karena bukan sertifikat EV — More info → Run anyway. Aman.

---

Gaskeun.