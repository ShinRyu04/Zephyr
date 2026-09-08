# Zephyr v1.1.6

## UPDATE NIH BOSSKU

Akhirnya update gede. Banyak yang minta, gua kasi.

### Ekstensi JALAN BENERAN

Dulu cuma baca manifest doang, sekarang kode JS ekstensi dieksekusi di Web Worker terisolasi. Aman, gak bisa akses window, require, atau fs. Command dari ekstensi muncul di palette dan jalan. Gak usah khawatir ekstensi nakal.

### Marketplace Makin Kece

Sekarang tiap ekstensi di Open VSX nampilin:
- Jumlah unduhan
- Rating bintang
- Filter kategori (tinggal pilih Themes, Languages, etc)

Gak usah scroll panjang nyari-nyari.

### Git Mendingan

Amend commit dan stash (push/pop) sekarang tinggal pencet di palette. Gak perlu buka terminal lagi buat hal simpel.

### Outline & Minimap Bisa Diklik

Outline: klik simbol langsung lompat ke posisi di editor.
Minimap: klik di minimap, editor scroll ke posisi itu.
Cepet.

### Chat AI Gak Ilang

History chat per provider sekarang tersimpan. Tutup app, buka lagi, chatnya masih ada. Gak usah mulai dari nol.

### Provider AI Bisa Custom

Settings → Providers, lo bisa tambah provider AI sendiri. Nama, base URL, API key. Punya LLM lokal atau custom API? Tinggal masukin.

### Shortcut Fix

`Ctrl+Shift+T` sekarang cuma buat terminal baru. Reopen tab pindah ke menu/palette. Gak bentrok lagi.

---

## Cara Update

- **Baru pertama:** ambil `Zephyr_1.1.6_x64-setup.exe` atau `.msi` di Releases.
- **Udah punya:** Settings → About → Check for updates. Atau tunggu notif lonceng kalo auto-update nyala.

SmartScreen protes kayak biasa — More info → Run anyway. Aman.

---

**Catatan:** installer gak ditandatangani karena gua males urusan sertifikat. Kalo lo butuh signed, set `TAURI_SIGNING_PRIVATE_KEY` sendiri.

Gaskeun.
