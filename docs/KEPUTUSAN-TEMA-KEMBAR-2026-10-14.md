# Keputusan: menyembunyikan 2 tema bawaan yang kembar

Tanggal: 2026-10-14 · Branch: `feat/ai-panel-vscode-layout`

## Keputusan

Dua tema bawaan berhenti **ditawarkan** di pemilih tema: `github-dark` dan `min-light`
(→ `zephyr-dark` dan `zephyr-light`). Keduanya **tidak dihapus**: barisnya tetap ada di
tabel `THEMES`, `isKnownTheme`/`infoTema` tetap mengenali id-nya, dan blok CSS-nya tetap
ada. Yang berubah hanya satu hal — `semuaTema()` tidak lagi mengembalikannya, dan dari
situ pemilih tema, komando siklus tema, serta jembatan dev ikut bersih tanpa perlu
memanggil penyaring di masing-masing pemanggil.

Alasan singkat: dua tema ini bukan "tema yang mirip", mereka kembar token. Menawarkan
dua kartu yang menghasilkan warna hampir sama membuat pembaca memilih sesuatu yang
tidak bisa ia bedakan, dan memindahkan kedua tema itu ke paket ekstensi resmi nanti
tidak menghilangkan satu pun warna yang sudah ada.

## Bukti angka (sudah diukur)

Pembanding: tiap tema bawaan vs tema Zephyr sejenisnya, dihitung dari pasangan
`var: nilai` pada blok temanya di `src/styles/theme.css`.

| Pasangan | var:nilai identik | Token `--syn-*` identik | Putusan |
| --- | --- | --- | --- |
| `github-dark` vs `zephyr-dark` | **72%** (26/36) | **11/11 sama persis** | disembunyikan |
| `min-light` vs `zephyr-light` | **61%** (22/36) | **11/11 sama persis** | disembunyikan |
| pasangan lain | 0–6% | — | tidak relevan |

Yang membuat dua baris di atas berbeda dari pasangan lain: **seluruh 11 token warna kode
(`--syn-*`) identik**. Warna editor adalah alasan orang memilih tema, jadi tema yang
seluruh warna kodenya sama bukan variasi — dua-duanya pilihan yang sama dengan label
berbeda.

## Daftar yang dibuang: HANYA 2

- `github-dark` → ditawarkan lagi sebagai paket ekstensi resmi (`zephyr-dark`)
- `min-light` → ditawarkan lagi sebagai paket ekstensi resmi (`zephyr-light`)

## Daftar yang SENGAJA dipertahankan + angkanya

| Tema | Angka | Kenapa tetap |
| --- | --- | --- |
| `solarized-light` | 0% vs `zephyr-light` | bukan kembar sama sekali; paletnya khas Solarized |
| `nord-light` | 3% vs `zephyr-light` | bukan kembar |
| `high-contrast` | — | tema aksesibilitas; membuangnya menghapus satu-satunya tema kontras tinggi |

Ambang "identik 11/11 `--syn-*`" di atas dipakai apa adanya: 0% dan 3% jelas di bawah
dua kasus kembar (61%/72%), dan `high-contrast` tidak masuk hitungan karena fungsinya
bukan estetika.

## Keamanan migrasi (user yang tema aktifnya salah satu dari 2 itu)

- **Tabel tidak dikurangi.** `THEMES` tetap 19 baris; `tersembunyi?: boolean` hanya
  menandai 2 baris. `isKnownTheme('github-dark')` tetap `true`, jadi id lama tidak jatuh
  ke jalur "id tidak dikenal" (yang akan melempar user ke `zephyr-dark` secara diam-diam
  kalau kebetulan modenya terang).
- **`resolveTheme` memindahkan ke pasangannya** lewat `PETA_TEMA_TERSEMBUNYI`
  (`github-dark`→`zephyr-dark`, `min-light`→`zephyr-light`), dan mencatatnya **sekali per
  id** lewat `console.info` (`[tema] "github-dark" sudah disembunyikan …`). Sekali, bukan
  tiap penerapan setelan: log yang mengulang menenggelamkan baris lain di konsol.
- **Hasil render tidak berubah.** Karena pasangan tiap tema kembar memang kembar token
  (termasuk 11 `--syn-*`), user berpindah ke warna yang praktis sama — bukan ke tema lain
  yang tidak ia pilih.
- **Setelan user tidak ditulis ulang.** Pemindahan ada di `resolveTheme`, bukan di
  penyimpanan setelan: `theme.current` tetap `github-dark` sampai user memilih tema lain
  sendiri. Konsekuensi yang disengaja: kalau tema itu dirilis kembali sebagai paket
  ekstensi, pilihan lama user tetap sah dan tidak perlu dimigrasi ulang.
- **Kartu aktif di Setelan ikut benar.** Kartu aktif dihitung dari
  `resolveTheme(...) === th.id`, dan karena `resolveTheme` mengembalikan pasangannya,
  yang menyala adalah kartu `zephyr-dark`/`zephyr-light` — sama dengan yang dirender.
- **CSS tetap ada.** Blok `[data-theme='github-dark']` dan `[data-theme='min-light']` di
  `src/styles/theme.css` **tidak dihapus** dan tidak disentuh sama sekali di lane ini:
  dua-duanya jadi isi paket ekstensi resmi nanti. Tidak ada berkas CSS yang diubah.

## Sisa permukaan yang BELUM ditutup (jujur, belum beres)

1. **Perintah `theme.github-dark` / `theme.min-light` masih ada di palet perintah.**
   Perintah per tema dibuat dari tabel `THEMES` di
   `src/lib/commandRegistry.ts` sekitar baris 1528 (`...THEMES.map((t) => ({ id: \`theme.${t.id}\` …`
   dan seterusnya) — bukan di `src/lib/commands.ts` seperti dugaan awal (berkas itu tidak
   menyentuh tema sama sekali). Berkas itu di luar izin lane ini, jadi tidak diubah.
   Akibatnya nyata: memilih perintah itu tetap menulis `theme.current = 'github-dark'`,
   lalu dirender sebagai `zephyr-dark` (tidak ada UI kosong), tapi diam-diam menyimpan id
   tersembunyi lagi. Sebaiknya sumber perintah itu diganti ke `semuaTema()`.
2. **`scripts/uji-t6-tema-mode.mjs` akan merah.** Harness itu memilih kartu `min-light`
   (`pilihKartu('min-light')`, sekitar baris 64) yang sekarang tidak ada lagi; harus
   diganti ke `zephyr-light`. Di luar izin lane ini, jadi belum dikoreksi.
3. **Label skrip tangkapan layar masih menulis "grid 19 tema"**
   (`scripts/shot-sesi-ini.mjs`, komentar baris 4). Kosmetik — tidak ada pemeriksaan yang
   bergantung padanya, tapi angkanya sekarang 17.
   `scripts/verify08.mjs` juga membaca jumlah kartu, tapi ambangnya `>= 6` sehingga tetap
   benar (dan kartu `zephyr-light`/`zephyr-dark` yang dikliknya masih ada).
4. **`window.__ZEPHYR_EXT19__.infoTema`** memakai `semuaTema()`, jadi ia tidak lagi
   menemukan 2 id tersembunyi (`isKnownTheme` di modul tetap mengenalinya). Hanya jembatan
   dev — `devBridge.ts` di luar izin lane ini.
5. **Bagian B `scripts/uji-t5-tema.mjs` (CDP) belum pernah dijalankan.** App tidak hidup di
   lane ini (`ECONNREFUSED 127.0.0.1:9223`) dan lane ini dilarang menyalakan app/memakai
   CDP, jadi kartu di DOM serta jalur `bg_image_read` belum diverifikasi ulang setelah
   perubahan ini. Harap dijalankan saat app hidup; harapannya sudah dikoreksi di harness.

## Langkah lanjut

1. **Rilis 2 tema itu sebagai paket ekstensi resmi** (`github-dark`, `min-light`), setelah
   **jalur warna kode (`--syn-*`) tema ekstensi beres** — tanpa itu tema ekstensi tidak
   bisa memulihkan warna kode yang jadi ukuran kekembaran di atas, dan "dihidupkan kembali"
   akan terasa seperti tema yang berubah.
2. Pindahkan blok CSS `[data-theme='github-dark']`/`[data-theme='min-light']` dari
   `src/styles/theme.css` ke dalam paket itu, baru hapus dari berkas inti.
3. Ganti sumber perintah `theme.*` di `commandRegistry.ts` ke `semuaTema()`, dan koreksi
   `uji-t6-tema-mode.mjs` (pilih `zephyr-light`, bukan `min-light`).
4. Jalankan bagian B `scripts/uji-t5-tema.mjs` di app hidup, termasuk pemeriksaan baru:
   tema tersembunyi tidak muncul sebagai kartu, dan id tersembunyi dirender sebagai
   pasangannya (warna `--bg` + `--syn-*` dibandingkan dengan pasangannya yang diukur lebih
   dulu, bukan diasumsikan).

## Verifikasi yang benar-benar dijalankan (2026-10-14, lane ini)

| Perintah | Hasil |
| --- | --- |
| `npx tsc --noEmit` | 0 error (`EXIT=0`) |
| `node scripts/uji-t5-tema.mjs` | bagian A **semua LULUS** (17 tema ditawarkan, 19 baris tabel, 2 tersembunyi, peta padanan, `resolveTheme` tidak pernah mengembalikan tema tersembunyi); bagian B **GAGAL: `ECONNREFUSED` port 9223** — app tidak hidup, lihat sisa permukaan #4 |
| `node scripts/verify08.mjs` | `verify08 error: TypeError: fetch failed` (tidak ada app di 9223) |
| `node scripts/verify09.mjs` | `verify09 error: fetch failed` (tidak ada app di 9223); settings.json dipulihkan sendiri oleh harness |
| cek sintaks potongan JS in-page harness (skrip sekali pakai di luar repo) | 8 potongan, 0 gagal sintaks — bagian B minimal tidak rusak sintaks meski belum bisa dijalankan |

Bukti bagian A lengkap (potongan keluaran nyata):

```
  LULUS  (a) 2 tema kembar TIDAK ditawarkan semuaTema()  17 tema terlihat
  LULUS  (a) jumlah tema terlihat = 19 - 2 = 17  17 tema
  LULUS  (c) Solarized Light/Nord Light/High Contrast TIDAK ikut disembunyikan
  LULUS  isKnownTheme tetap mengenali 2 id tersembunyi …  github-dark=true min-light=true
  LULUS  PETA_TEMA_TERSEMBUNYI = {github-dark: zephyr-dark, min-light: zephyr-light}
  LULUS  (b) resolveTheme(github-dark) -> zephyr-dark  zephyr-dark
  LULUS  (b) resolveTheme(min-light) -> zephyr-light  zephyr-light
  LULUS  (b) resolveTheme tidak pernah mengembalikan tema tersembunyi
  LULUS  (c) tiap tema terlihat tetap resolve ke dirinya sendiri
```
