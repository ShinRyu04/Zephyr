# Mond untuk Rainmeter

Skin "Mond" bergaya macOS: panel putih membulat, teks tipis, aksen hijau.
Isinya empat skin Rainmeter + satu layout siap pakai.

## Syarat

- Windows 10/11
- Rainmeter (versi 4.5 ke atas): https://www.rainmeter.net/
- Koneksi internet hanya untuk skin Weather (Open-Meteo, tanpa API key)

## Isi paket

| Berkas | Fungsi |
| --- | --- |
| `Skins/Mond/Clock/Clock.ini` | Jam analog (jam, menit, detik) |
| `Skins/Mond/DigitalClock/DigitalClock.ini` | Jam digital + hari dan tanggal (Indonesia) |
| `Skins/Mond/System/System.ini` | Bar CPU, RAM, dan ruang disk C: |
| `Skins/Mond/Weather/Weather.ini` | Suhu dan kondisi cuaca |
| `Layouts/Mond.ini` | Posisi keempat skin untuk layar 1366x768+ |

## Cara pasang manual

1. Pasang Rainmeter, lalu tutup jendela sambutan.
2. Klik kanan ikon Rainmeter di tray, pilih **Open skin folder**.
3. Salin folder `Skins/Mond` dari paket ini ke folder skin Rainmeter tadi.
   Hasil akhirnya: `Rainmeter\Skins\Mond\Clock\Clock.ini`, dan seterusnya.
4. Salin `Layouts/Mond.ini` ke folder `Rainmeter\Layouts\`.
5. Klik kanan tray > **Manage** > tab **Layouts** > pilih `Mond` > **Load**.

## Cara pasang lewat .rmskin

Klik dua kali `Mond.rmskin` (dibuat oleh `build-rmskin.ps1`). Rainmeter akan
memasang skin dan layout sekaligus. Paket ini tidak memuat plugin tambahan,
jadi tidak ada peringatan plugin pihak ketiga.

## Menyesuaikan

- **Kota cuaca**: buka `Skins\Mond\Weather\Weather.ini`, ubah `Latitude`,
  `Longitude`, dan `City` di bagian `[Variables]`. Ambil koordinat dari
  https://open-meteo.com/ lalu klik kanan skin > **Refresh skin**.
- **Warna dan ukuran**: semua warna ada di `[Variables]` tiap berkas
  (`PanelColor`, `TextColor`, `SubColor`, `BarFill`). Jam analog: ubah
  `Size` untuk memperbesar diameter.
- **Bahasa**: nama hari/bulan di skin DigitalClock sudah berbahasa Indonesia
  lewat `Substitute`. Ganti pasangan katanya bila ingin bahasa lain.
- **Ikut saat login**: di Manage > Settings centang **Start Rainmeter with Windows**.

## Catatan

Skin System memakai `Measure=FreeDiskSpace` untuk drive `C:`. Ganti `Drive=C:`
di `System.ini` bila sistem kamu di drive lain.
