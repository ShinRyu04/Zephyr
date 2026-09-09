# Zephyr v1.1.7

Menu layout yang kemaren gua bikin ribet (popover) gua lepasin, sekarang tinggal pencet tombol langsung di menu bar. Sisanya nyusul nih.

## UPDATE NIH

### Panel Bisa Pindah Atas/Bawah

Dulu panel cuma bisa kiri/kanan. Sekarang ada 4 tombol posisi yang selalu kelihatan di kanan atas menu bar: kiri, kanan, atas, bawah. Plus tombol mata buat nyembunyiin panel. Klik langsung pindah, gak usah buka menu lagi.

Panel yang dipindah ke atas/bawah bisa di-resize vertikal, tinggal drag divider-nya. Menu View → Panel Position sama command palette juga kebagian (`Move Panel Top/Bottom`).

### Bahasa Jawaban AI

Settings → Model AI → **Bahasa jawaban AI**. Tinggal pilih:

- Ikuti pertanyaan (otomatis)
- Indonesia
- English
- Lainnya — tulis nama bahasa bebas, mis. Jawa, Español, Français

Instruksinya dikirim sebagai system message di awal tiap percakapan, jdi model konsisten jawab pake bahasa pilihan. Gak cuma ikut-ikutan bahasa prompt.

### Ekstensi Gede Bisa Masuk

Batas ekstensi dinaikin gede-gedean:

- Unduhan `.vsix`: 64 MB → 1 GB
- Unzip arsip: 16 MB → 1 GB (total hasil unzip 2 GB)
- File `main`: 1 MB → 20 MB

Ekstensi bahasa (Python, Java, dll) yang bundle-nya puluhan MB sekarang bisa dipasang tanpa ditolak.

### Sandbox Ekstensi: require Relatif Jalan

Dulu cuma file `main` yang dimuat di sandbox. Sekarang backend baca semua file JS/JSON ekstensi, jdi `require('./dist/extension.bundle')` dan require relatif lain beneran resolve. Notifikasi dari ekstensi (`showInformationMessage`, `showErrorMessage`) juga diteruskan ke notifikasi Zephyr.

### Ekstensi Gagal = Auto Nonaktif

Ekstensi yang gagal dimuat di sandbox sekarang otomatis dinonaktifkan. Gak error melulu tiap kali buka app. Pesannya jelas: kebanyakan butuh runtime eksternal (Python/Java/Docker) yang gak ada di sandbox. Mau coba ulang? Aktifkan lagi di Settings → Ekstensi.

### Fix

Drag & drop file dan event tutup window dibungkus `try/catch` — dulu bisa bikin layar hitam pas jalan di browser dev.

---

## Cara Update

- **Baru pertama:** ambil `Zephyr_1.1.7_x64-setup.exe` atau `.msi` di Releases.
- **Udah punya:** Settings → About → Check for updates. Atau tunggu notif lonceng kalo auto-update nyala.

Signature installer diverifikasi app sebelum install. SmartScreen tetep bisa protes karena bukan sertifikat EV — More info → Run anyway. Aman.

---

**Catatan:** installer sekarang udah ditandatangani (minisign) buat auto-update, jdi update yang ke-download cuma dipasang kalo signature-nya cocok.

Gaskeun.