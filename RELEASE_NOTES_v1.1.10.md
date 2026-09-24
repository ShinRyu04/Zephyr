# Zephyr v1.1.10

Dikerjakan 23 September pagi sampai 24 September dini hari. Nomor versi **tetap
1.1.10** — isi rilis diperbarui, bukan versinya.

Semua yang tertulis di sini diuji dengan menjalankannya di aplikasi lewat CDP,
bukan dengan membaca kode.

---

## Yang paling penting dulu

**Update otomatis dari v1.1.9 diperbaiki.** Kunci tanda tangan rilis sempat
diganti pada 22 September, sehingga v1.1.10 ditandatangani dengan kunci berbeda
dari yang tertanam di v1.1.9 — updater menolak dengan *"The signature was
created with a different key than the one provided"*. Kunci lama dipasang
kembali, v1.1.10 dibangun ulang, dan sekarang **v1.1.9 bisa update langsung dari
dalam aplikasi**. Pengaman ditambahkan supaya tidak terulang:
`scripts/cek-kunci.sh` membatalkan rilis kalau kunci berubah.

**Model dari provider lain bisa dipakai lewat gateway custom.** Sebelumnya
mengetik `gemini-3.8-flash` di provider *Custom (OpenAI-compatible)* membuat
Zephyr mengalihkannya ke provider Gemini dan meminta API key Gemini — padahal
gateway custom-nya sendiri menyediakan model itu. Hasilnya error 401. Sekarang
nama model yang kamu ketik dihormati apa adanya.

**Mode Agent jauh lebih cepat.** Tiap langkah dulu mengirim ulang seluruh
percakapan, jadi langkah ke-10 membawa sepuluh kali token langkah pertama dan
makin lambat. Riwayat kini dipotong ke 8 langkah terakhir dengan catatan
pengganti. Terukur pada riwayat 61 pesan: **363 KB → 144 KB, 60% lebih kecil**.

---

## Fitur baru

**Panel AI di kolom kanan.** Bisa dipindah ke kanan tanpa ikut membuka panel
terminal di bawah, dilebarkan dengan drag, dan dimaksimalkan ala VS Code. Tab
AI di panel bawah otomatis disembunyikan saat chat dipindah ke kanan. Panel AI
juga punya tombol sembunyikan sendiri, seperti panel chat VS Code.

**Subagent jadi tab sendiri.** Enam peran — `cari`, `telaah`, `rencana`,
`audit`, `kerja`, `jelajah` — maksimal 4 berjalan bersamaan, tiap agen maksimal
15 langkah, dengan log langkah hidup dan tombol batal per agen. Hanya peran
**kerja** yang boleh menulis file; dua agen menulis file yang sama itu data
race, bukan fitur. Subagent dijalankan **oleh kamu** dari tab Subagents — bukan
dipanggil AI sendiri.

**Pemilih model dua tingkat.** Provider dulu, lalu model. Hanya provider yang
sudah punya API key yang ditampilkan, plus kotak pencarian.

**19 tema.** Zephyr Dark dan Light, Nord, Tokyo Night, Gruvbox, One Dark Pro,
Senja, Acrylic, High Contrast, Dracula, Catppuccin Mocha, Rosé Pine, Kanagawa,
Everforest, GitHub Dark, Ayu Mirage, Solarized Light, Nord Light, Min Light.
Setiap tema mengatur seluruh token sekaligus (UI, editor, sintaks, terminal),
jadi tidak ada warna yang bocor dari tema lain.

**Latar belakang kustom.** Pasang fotomu sebagai latar editor: slider kekuatan
plus preset **Samar / Sedang / Jelas**, cara pemasangan (isi / utuh / asli), dan
opsi panel tembus pandang. Latar disimpan **terpisah dari tema** — ganti tema
tidak menyentuh wallpaper, dan sebaliknya. Format didukung: PNG, JPG, GIF,
WebP, BMP, AVIF, ICO, dan SVG. Tipe gambar dideteksi dari isi file, bukan
ekstensi, jadi file `.png` yang sebenarnya JPEG tetap tampil benar.

**Halaman Tentang dirombak.** Satu kartu identitas, satu kartu build, dan satu
baris tombol: cek update, **View on GitHub**, **Report an issue**, **Join the
WhatsApp group**, **Support Zephyr**.

**Prompt AI bisa kamu edit.** Settings → Prompt AI punya empat bagian terpisah
(Identitas, Cara kerja, Aturan, Instruksi tambahan) plus daftar izin perintah.
Yang tidak diubah tetap memakai bawaan. Ada pratinjau yang menunjukkan persis
apa yang dikirim ke model.

---

## Perbaikan bug

**Perintah Command Palette tidak mengubah apa pun.** `commandRegistry`
mengakses store layout lewat `import()` dinamis, yang di Vite menjadi *instance
modul terpisah* dari static import yang dipakai `App.tsx`. Perintah seperti
"Toggle Status Bar" mengubah store yang tidak pernah dibaca UI. Lima titik
diperbaiki menjadi static import.

**Kerapatan "Padat" tidak mengubah apa pun.** Dulu hanya mengubah 1px padding di
empat elemen. Sekarang mengubah metrik nyata: tab bar 34→28px, status bar
24→20px, activity bar 48→40px, plus baris pohon file dan pesan chat lebih rapat.
Labelnya juga diperbaiki dari **"Rapat"** (arti: meeting) menjadi **"Padat"** di
sepuluh bahasa.

**Posisi sidebar dari Customize Layout tidak bekerja.** Tombol Kiri/Kanan
menulis ke `general.layout.posisiSidebar`, sementara renderer membaca
`settings.sidebar`. Dua tempat berbeda sehingga klik tidak berpengaruh.

**Sidebar bisa hilang total.** Kalau settings tidak punya key `sidebar`,
posisinya `undefined` dan semua cabang render gagal — sidebar tidak muncul sama
sekali. Sekarang ada fallback ke `left`.

**Reset settings menghilangkan sidebar.** `reset_settings` menghapus seluruh
file, dan default Rust tidak punya key `sidebar`, `layout`, `subagent`, maupun
`general.aiPanel`. Semua sudah ditambahkan.

**Zeph mengaku sebagai model lain.** Ditanya "kamu model apa", Zeph menjawab
"saya Claude buatan Anthropic" — mengarang dari bias bobot latihan, lalu
membantah nama model yang benar-benar dikonfigurasi. Model tidak punya cara
membaca metadata dirinya sendiri, jadi identitasnya kini dituliskan sebagai
fakta di system prompt **dan** di akhir pesan user, dari nilai yang benar-benar
dikirim ke API. Settings → Prompt AI menampilkan blok ini, sengaja tidak bisa
diedit — kalau bisa, user justru bisa membuat AI mengaku model lain.

**Zeph disuruh mengisi API key Gemini padahal pakai key sendiri.** `init()`
memilih provider aktif dari settings tanpa memeriksa apakah provider itu punya
key. Sekarang ia memilih provider yang benar-benar punya key; kalau provider
aktif kosong sedangkan provider lain terisi, ia pindah otomatis sambil
menjelaskannya.

**`file_list` tanpa batas.** Mendaftar folder besar mengembalikan semua nama,
dan teks itu ikut dikirim ulang tiap langkah berikutnya. Sekarang dibatasi 300
entri dengan baris "dan N entri lain".

**Timeout provider terlalu pendek.** Panggilan streaming menyerah setelah 30
detik, sehingga langkah agent yang panjang gagal di tengah jawaban. Dinaikkan
ke 90 detik (per-call 12→120 detik).

**Perintah palette duplikat.** Dua sistem command sempat hidup bersamaan
sehingga 12 label muncul dua kali.

**Remap shortcut tidak berlaku.** `mergeBindings` mengubah chord user tapi tidak
melepas chord lama, dan ada dua sumber shortcut (`settings.shortcuts` vs
`keybindings.json`). Disatukan: settings jadi sumber kebenaran tunggal.

**Ikon gear tidak membuka Settings.** Menutup halaman Settings meninggalkan
`activity` bernilai `settings`, jadi klik berikutnya dianggap "sudah aktif" dan
malah menutup sidebar.

**Panel AI hilang saat dipindah ke kanan**, dan **tombol maximize tidak
berfungsi** — aturan CSS untuk keadaan maximize tidak ada, jadi class-nya tidak
berpengaruh dan kolom tetap 340px.

**`Ctrl+Shift+O` bentrok** — "Explorer: Open Folder…" menduplikasi "File: Open
Folder…" (handler sama, shortcut sama, dua entri).

**Judul section Language Server kosong** — memakai `h3` sementara section lain
`h2`.

**Hasil subagent bocor ke chat.** Batch yang selesai dulu menyuntikkan
ringkasannya ke percakapan; sekarang subagent berdiri sendiri.

---

## Kualitas

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0 error** |
| i18n | **581 kunci × 10 bahasa** (ID, EN, JA, KO, ZH, ES, FR, DE, PT, AR) |
| `cargo test --lib` | lulus, termasuk 3 tes baru deteksi format gambar |
| `uji-t7-performa.mjs` (performa + kerapatan) | 10/10 |
| `uji-t6-identitas.mjs` (identitas model) | 8/8 |
| `uji-t5-tema.mjs` (tema + latar) | 32/32 |
| `uji-t4-16.mjs` (reset tidak merusak UI) | 19/19 |
| `uji-t4-11.mjs` (tab AI, kolom kanan, maximize) | 20/20 |
| `uji-t4-15.mjs` (halaman About) | 25/25 |
| `uji-t4-13.mjs` (subagent berdiri sendiri) | 11/11 |
| `uji-t4-10.mjs` (pemilih model dua tingkat) | 23/23 |
| `uji-subagent-nyata.mjs` | 13/13 |
| `sweep-bug.mjs` (semua ikon, tab, section) | 31/31 |

Signature rilis diverifikasi secara kriptografis dengan crate `minisign-verify`
terhadap installer yang **diunduh dari GitHub**, bukan file lokal.

---

## Yang dibawa dari build sebelumnya

**Panel agent** — streaming per langkah, mode persetujuan "kerja langsung",
output terminal di dalam bubble chat, panel todo, 22 tool agent, sampai 10
lampiran gambar per pesan.

**Skill, memori, tugas terjadwal** — folder `SKILL.md` yang dimuat hanya saat
relevan (global dan per-workspace), `memory.md` / `user.md` yang disuntik ke
setiap percakapan dengan batas karakter, dan `cron_create` / `cron_list` /
`cron_delete` berbasis JSON biasa.

**Asisten inline** — ghost-text completion (`Alt+\`), inline chat (`Ctrl+I`),
apply sebagai pengganti/sisipan/diff, referensi `file:baris` yang bisa diklik,
konteks `@file` / `@folder` / `@symbol` / `@terminal` / `@problems`, dan prompt
library yang bisa dicari.

**Title bar sendiri** — chrome jendela digambar Zephyr, dengan menu bar yang
sejajar dengan kolom activity bar 48px.

**Ringan** — binary rilis 9,4 MB, ~118 MB saat idle (sekitar 104 MB di antaranya
lantai dasar WebView2 yang tidak bisa dihilangkan flag apa pun). Setiap proses
anak dijalankan dengan `CREATE_NO_WINDOW`, jadi tidak ada console yang berkedip
saat start.

**Build Linux** — `.deb` dan `.AppImage` untuk x86_64, ditandatangani dengan
kunci minisign yang sama dengan installer Windows.

---

## Yang dihapus

Fitur yang jadi aplikasi kedua di dalam editor, dibuang daripada dibiarkan
setengah jalan:

- **Dev Environment** (manajer PHP/Nginx/MariaDB/Redis)
- **API client** (koleksi ala Postman)
- **SQLite browser**
- **Cloudflare Tunnel**
- **Test Explorer**
- **SFTP + port forwarding**

File `.http` masih bisa dijalankan. API key tidak tersentuh — `reset_settings`
tidak pernah menghapus `secrets.json`.

---

## Cara update

- **Pertama kali:** unduh `Zephyr_1.1.10_x64-setup.exe` atau `.msi` dari
  Releases.
- **Sudah punya:** buka Zephyr, dialog update muncul otomatis. Atau
  Settings → About → Check for updates.
- **Masih di v1.1.9 atau lebih lama:** kalau tombol update gagal, install manual
  sekali dari halaman ini — setelah itu update otomatis bekerja normal.

Aplikasi memverifikasi signature installer sebelum memasang. SmartScreen masih
bisa memperingatkan karena ini bukan sertifikat EV: klik **More info → Run
anyway**.
