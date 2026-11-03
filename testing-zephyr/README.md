# Catatan

Aplikasi catatan desktop sederhana berbasis Electron. Catatan disimpan ke berkas JSON lokal lewat IPC (contextBridge di preload, ipcMain di main).

## Fitur

- Tambah catatan baru (form di atas, tekan Enter atau tombol Tambah).
- Tandai selesai / belum selesai dengan tombol centang.
- Hapus catatan dengan tombol Hapus.
- Cari catatan lewat kolom pencarian (Ctrl+F memfokuskan).
- Filter: Semua, Belum selesai, Selesai.
- Edit catatan dengan klik dua kali pada teks.
- Simpan otomatis ke `notes.json` di folder userData Electron.

## Tentang repo ini

Aplikasi ini dibuat oleh **agent AI Zephyr** di dalam editor Zephyr sebagai uji kemampuan agent, bukan ditulis tangan.

Verifikasi otomatis lewat CDP pada build yang sama:

- tambah catatan (dua kali) — jumlah catatan benar
- toggle selesai — status `done` tersimpan
- cari — hasil filter sesuai teks
- hapus — catatan hilang dari daftar dan penyimpanan
- persistensi — setelah window di-reload, catatan tetap ada dan `notes.json` di folder userData berisi data yang sama
