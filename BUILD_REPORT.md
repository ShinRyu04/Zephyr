# BUILD_REPORT - Zephyr

Ditulis 2026-10-02. Berisi keadaan build, dan **bukti** untuk setiap klaim.
Yang tidak dijalankan tidak ditulis di sini sebagai "lulus".

---

## 1. Ringkasan

| | |
|---|---|
| Versi | **1.1.13** |
| Artefak terakhir | `src-tauri/target/release/zephyr.exe` |
| Ukuran | 10.69 MB |
| SHA256 | `5C71B36ABB03CB5CE64443CD0AA9D85CD3078176617BBA61AE32878929628309` |
| Commit | 221 commit, HEAD `a4bd979` |
| Frontend tertanam | **ya** (`assets/index-` ada di dalam exe) |

**Installer belum dibangun, dan itu memang disengaja** - menunggu hasil tes
portable oleh user.

---

## 2. Pemeriksaan wajib

### 2.1 TypeScript

```
npx tsc --noEmit    ->  0 error
```

### 2.2 Rust

```
cargo test --lib            ->  268 lulus, 0 gagal
cargo test --test encoding_replace  ->  5 lulus
cargo check                 ->  bersih (tanpa error)
```

### 2.3 Harness UI (app dev, port CDP 9223)

Dijalankan berurutan; semuanya lulus dan tidak saling merusak.

| Harness | Hasil |
|---|---|
| `verify-tool-gate.mjs` | 9/9 |
| `verify-tools-g7.mjs` | 16/16 |
| `verify-ask-user.mjs` | 10/10 |
| `verify-gelombang7.mjs` | 7/7 |
| `verify-wallpaper.mjs` | 4/4 |
| `verify-todo-card.mjs` | 28/28 |
| `uji-repeat.mjs` | 12/12 |
| `verify-fase-loop.mjs` | 20/20 |
| `uji-tool-pill.mjs` | 8/8 |
| `uji-work-step.mjs` | 8/8 |
| `uji-i18n-kunci.mjs` | 3/3 |
| `uji-gerbang-git.mjs` | 7/7 |
| `uji-token-css.mjs` | 3/3 |
| **TOTAL** | **135/135** |

### 2.4 Harness RILIS (exe rilis, port CDP 9444)

Exe rilis tidak punya `window.__ZEPHYR__` (bridge dev di-tree-shake), jadi
harness ini memakai `cdp.eval` dan menguji lewat UI.

| Harness | Hasil | Catatan |
|---|---|---|
| `uji-terminal-rilis.mjs` | 6/6 | prompt asli `PS C:\Users\home>`, 1201x440 px |
| `uji-rilis-mcp.mjs` | 15/15 | MCP lewat halaman Settings |
| `uji-putar-token.mjs` | 7/7 | mengunci bug token |

---

## 3. Bug yang ditemukan dan diperbaiki di Gelombang 9

Urut dari yang paling mahal akibatnya.

### 3.1 Penggantian teks merusak encoding berkas (PERMANEN)

`search_replace` membaca dengan `String::from_utf8_lossy` dan menulis dengan
`baru.as_bytes()`. Pada "Replace All":

- berkas ANSI: byte non-UTF8 menjadi U+FFFD, lalu ditulis sebagai UTF-8 -
  **seluruh** karakter beraksen di berkas itu rusak
- berkas UTF-8 ber-BOM: BOM hilang
- berkas CRLF: seluruh `\r` hilang, git melaporkan seluruh berkas berubah

Tidak bisa dikembalikan byte-per-byte, karena encoding aslinya sudah terbuang
saat membaca. Sekarang memakai `read_file_detect` + `write_file_encoded`.

### 3.2 Token MCP tidak bisa diputar (401 permanen)

`rotate_token` menulis token baru ke `mcp.json` dan menampilkannya di UI, tapi
server masih memegang salinan dari saat bind. Setiap permintaan dijawab **401
selamanya**, dan tombol yang seharusnya memperbaikinya justru penyebabnya.
Sekarang token disimpan di runtime dan diperiksa lewat `Ctx::terautentikasi()`.

Terbukti di exe rilis:

```
T1  token lama diterima          -> 200, 20 tool
T2b mcp.json berubah             -> 569186e1 vs 11c39dfd
T2  token BARU langsung diterima -> 200 (tanpa restart)
T3  token LAMA sekarang DITOLAK  -> 401
```

### 3.3 Hapus berkas menghapus yang belum disimpan tanpa peringatan

`closeTabsUnder` memakai `forceCloseTab` untuk semua tab - termasuk yang belum
disimpan. Jalurnya nyata: hapus/ganti nama folder di explorer, dan tutup
workspace.

### 3.4 Seluruh badge status tetap Inggris di 9 bahasa

Akar gandanya. Yang dangkal: `tr('Running')` padahal kamusnya berkunci
Indonesia (`'Berjalan'`). Yang dalam: di `translate()`,
`DICTS.en[key]` yang dipakai sebagai jaring terakhir adalah kamus **DASAR**
(pasangan Indonesia->Inggris), bukan kamus Inggris terjemahan - jadi semua
bahasa jatuh ke situ.

### 3.5 Operasi git berganda

`busy` diset 19 fungsi, diperiksa **0**. Dua `git commit` bersamaan atas indeks
yang sama menghasilkan commit yang isinya bukan yang dilihat user.

### 3.6 Penulisan berkas state tidak atomik

8 tempat memakai `std::fs::write` (O_TRUNC - isi lama dihapus dulu). Crash di
tengah = berkas separuh. Untuk `meta.json` itu berarti **seluruh** riwayat sesi
tidak terbaca. Sekarang satu helper `tulis_aman` dipakai kesepuluhnya (termasuk
`settings.rs` dan `secrets.rs` yang punya salinan masing-masing).

### 3.7 `read_file_detect` tanpa batas ukuran

`std::fs::read` + salinan decode + salinan replace: berkas 500MB menjadi
lonjakan beberapa GB dan UI membeku. Sekarang batas 32MB diperiksa dari
**metadata sebelum** membaca.

### 3.8 MCP `editor_close` membuang buffer

Satu-satunya dari tiga pemanggil `forceCloseTab` yang tidak memeriksa `unsaved`.
Sekarang ditolak dengan pesan yang menyebut langkah berikutnya.

### 3.9 Sembilan listener Tauri rawan StrictMode

Hanya mengandalkan cleanup useEffect, dan itu tidak cukup untuk listener async.
Untuk drag-drop itu berarti berkas terbuka **dua kali** per drop.

### 3.10 Identitas tugas dibuang

`setAgentTodos` membuang `id`, dan TodoPanel memakai `key={i}` - React
memasangkan baris ke POSISI. Urutannya memang berubah tiap putaran, jadi
centang dan durasi melompat ke tugas yang salah.

### 3.11 Batas pane ditembus lewat SSH

`daftarkanPaneEksternal` tidak memeriksa `maxPanes`; sesi backend sudah hidup
sebelum pendaftaran bisa ditolak.

### 3.12 ~43 token CSS tidak terdefinisi

Banyak tanpa fallback, sehingga `color` gagal berlaku dan teksnya jatuh ke
hitam bawaan browser - hilang di atas latar gelap.

### 3.13 `mcp.allow_terminal_control` tidak bisa diset

Rust membacanya, tidak ada UI untuk menulisnya. Terkunci `false` permanen.

### 3.14 Nama fungsi yang menjanjikan penegakan yang tidak ada

`ensure_readable` selalu `Ok(())`. Komentar di `uji-file-read.mjs` mengklaim
penjaga bacaan "hanya mengizinkan berkas di bawah root workspace" - tidak pernah
benar. Namanya sekarang `periksa_path_baca`.

---

## 4. Klaim audit yang DIBANTAH

Diperiksa sendiri sebelum dikerjakan; tidak ada yang "diperbaiki" tanpa bukti.

| Klaim | Kenyataan |
|---|---|
| "PTY bocor saat tab ditutup" | **Salah.** 7 jalur diperiksa, semuanya mematikan PTY |
| "Penulisan settings tidak atomik" | **Salah.** Sudah atomik sejak lama |
| "Scrollback terminal tidak dibatasi" | **Salah.** Sudah dibatasi 5000 baris (1000 saat RAM rendah) |
| "Sesi AI hilang saat tutup paksa" | **Salah.** Sudah dipersistensi |
| "Ada jalur tulis tanpa validasi workspace" | **Salah.** 13 command memanggil `ensure_writable`; `fs_rename` memvalidasi KEDUA ujungnya |

---

## 5. Yang BELUM dikerjakan

- **Installer (MSI/NSIS)**: menunggu hasil tes portable oleh user.
- **Build Linux**: tidak dikerjakan, atas permintaan.
- **Gelombang 8**: belum dimulai - menunggu konfirmasi eksplisit user.
- **Upload/rilis**: tidak dilakukan.

---

## 6. Cara menjalankan ulang seluruh verifikasi

```powershell
# 1. dev server
npm run dev

# 2. app + port debug (terminal lain)
cd src-tauri
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
.\target\debug\zephyr.exe

# 3. seluruh harness
foreach($f in @("verify-tool-gate","verify-tools-g7","verify-ask-user",
  "verify-gelombang7","verify-wallpaper","verify-todo-card","uji-repeat",
  "verify-fase-loop","uji-tool-pill","uji-work-step","uji-i18n-kunci",
  "uji-gerbang-git","uji-token-css")) { node "scripts/$f.mjs" 9223 }
```

Untuk rilis: bangun dengan `npx tauri build --no-bundle`, jalankan exe dengan
`--remote-debugging-port=9444`, lalu

```powershell
node scripts/uji-terminal-rilis.mjs 9444
node scripts/uji-rilis-mcp.mjs 9444
node scripts/uji-putar-token.mjs 9444
```

**Catatan penting**: port MCP BUKAN selalu 9222. Daftar cadangannya
`[9222, 9224, 9225, 9226, 9227]`, dan 9223 sengaja dilewati (port debug
WebView2). Di mesin ini 9222 dipegang `msedgewebview2`, sehingga Zephyr memakai
**9224**.
