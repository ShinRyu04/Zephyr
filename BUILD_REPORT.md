# BUILD_REPORT - Zephyr

Ditulis 2026-10-02, **diperbarui 2026-10-17**. Berisi keadaan build, dan **bukti**
untuk setiap klaim. Yang tidak dijalankan tidak ditulis di sini sebagai "lulus".

---

## 1. Ringkasan

| | |
|---|---|
| Versi | **1.1.14** |
| Artefak terakhir | `src-tauri/target/release/zephyr.exe` |
| Ukuran exe | 19.18 MB |
| SHA256 exe | `F73D23BD1EDAF74F6D9BA759CB9A9BCDEB37600779F502C5096E7138253C1B13` |
| Installer MSI | `bundle/msi/Zephyr_1.1.14_x64_en-US.msi` — 10.18 MB |
| SHA256 MSI | `36E948DF1734C507164AFDF03A1C21BD3EFCF089E5CC709C4F66D568F6115798` |
| Installer NSIS | `bundle/nsis/Zephyr_1.1.14_x64-setup.exe` — 7.46 MB |
| SHA256 NSIS | `E1F497F7807D5975B4F76F99BAA357A63B76AB47793D80264223146F2C1D7AD1` |
| Dibangun | 2026-10-17 18:10-18:11 |
| Commit | HEAD `58d5f2b` |
| Frontend tertanam | **ya** (`dist/` di-embed; `assets/index-` ada di dalam exe) |

**Installer SUDAH dibangun** (MSI + NSIS). Yang **tidak** dilakukan: signing
updater — `tauri build` berhenti di langkah itu karena
`TAURI_SIGNING_PRIVATE_KEY` tidak disetel. Itu langkah terpisah dari pembuatan
installer: kedua bundel sudah ada di disk sebelum pesan itu muncul. Installer
yang tidak ditandatangani akan memicu peringatan SmartScreen di mesin lain —
itu konsekuensi yang disengaja selama belum ada sertifikat.

---

## 2. Pemeriksaan wajib

### 2.1 TypeScript

```
node node_modules/typescript/lib/tsc.js --noEmit   ->  0 error
```

### 2.2 Rust

```
cargo test --lib --offline   ->  554 passed; 0 failed; exit 0
```

(25 warning `dead_code`/`unused` yang sudah lama ada; tidak ada yang baru.)

### 2.3 Harness UI (app dev, port CDP 9223)

Dijalankan berurutan; semuanya lulus dan tidak saling merusak.

| Harness | Hasil |
|---|---|
| `verify-bahasa-ui.mjs` | 5/5 |
| `verify-hydra-agent.mjs` | 6/6 |
| `verify-hydra-picker.mjs` **(baru)** | 6/6 |
| `verify-gambar-ke-provider.mjs` **(baru)** | 6/6 |
| `verify-tabel-model.mjs` **(baru)** | 7/7 |
| `verify-mcp-katalog.mjs` | 5/5 |
| `verify-agen-fix.mjs` | 5/5 |
| `verify-agents-browser.mjs` | 13/13 |
| `verify-agents-cust-editor.mjs` | 23/23 |
| `verify-ekstensi-ikon.mjs` | 3/3 |
| `verify-ekstensi-status.mjs` | 3/3 |
| `uji-hydrafusion.mjs` | 106/106 |
| `uji-katalog-ekstensi-jujur.mjs` | 20/20 |
| `uji-set-pindah.mjs` | 19/19 |
| `uji-pane-browser-kebijakan.mjs` | 44/44 |
| `uji-label-bahasa.mjs` | 30/30 |
| `uji-bahasa-live.mjs` | 87/88 efektif, 1 no-op terdokumentasi |
| `uji-suntik-konteks.mjs` | 17/17 |
| `uji-antrean-pesan.mjs` | 18/18 |
| `uji-antrean-live.mjs` | 22/22 |
| `cek-cap-payload.mjs` | 18/18 |
| `cek-panel-tools-bahasa.mjs` | 5/5 |
| `cek-i18n-10-bahasa.mjs` | 12/12 |
| **TOTAL** | **semua hijau** |

Catatan jujur tentang dua harness yang SEMPAT merah dan mengapa:

- `verify-agen-fix` F1/F2 butuh **precondition**: pane browser siap (F1) dan
  setidaknya satu berkas berubah (F2). Dengan working tree bersih, F2 merah
  karena tidak ada baris change — bukan karena produknya. Keduanya lulus 5/5
  setelah precondition dipenuhi.
- `verify-bahasa-ui` B3 merah karena **bug produk nyata** (`extLoader.ts`
  menulis kalimat Indonesia yang dirender di UI Inggris). Sudah diperbaiki.
- `uji-katalog-ekstensi-jujur` merah karena harness mengunci **kalimat literal**
  yang baru saja diterjemahkan; pemeriksaannya diubah untuk mengunci perilaku.


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
