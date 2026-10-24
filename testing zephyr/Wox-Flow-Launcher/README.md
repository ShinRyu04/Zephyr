# Wox / Flow Launcher — launcher gaya Spotlight

Folder ini terpisah dari Zephyr. Isinya catatan dan rencana untuk launcher
pencarian cepat ala macOS Spotlight di Windows.

## Status

Belum ada kode. Launcher ini dipasang sebagai aplikasi pihak ketiga, bukan
dibangun ulang di sini.

## Dua pilihan

| | Wox | Flow Launcher |
|---|---|---|
| Berat | ringan | sedang (runtime .NET) |
| Perawatan | jarang | aktif |
| Plugin | sedikit | banyak |
| Hotkey bawaan | Alt+Space | Alt+Space |

Flow Launcher unggul untuk pemakaian harian. Wox hanya kalau laptop sangat
terbatas RAM.

## Cara pakai setelah terpasang

1. Tekan `Alt+Space` di aplikasi apa pun.
2. Ketik beberapa huruf nama aplikasi, misalnya `chro` atau `code`.
3. Enter membuka hasil teratas, Esc menutup kotak tanpa membuka apa pun.

Kotak yang sama juga mencari berkas, menghitung (`12*8`), menjalankan perintah
shell dengan awalan `>`, dan konversi satuan.

## Yang perlu diatur

- Hotkey: pastikan `Alt+Space` tidak bentrok dengan shortcut lain, ubah di
  Settings launcher.
- Startup: aktifkan agar hotkey selalu siap setelah login.
