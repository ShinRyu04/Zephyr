# Rancangan: Tangkap layar jendela Zephyr (item ZEPH-SCREENSHOT-TOOL / 151)

Status hari ini: **BELUM ADA perintah penangkap layar di `src-tauri/src/`** — jadi
tidak ada pintasan, tidak ada simpan, dan tidak ada salin-ke-clipboard yang bisa
dipasang. Berkas ini mencatat buktinya, bagian mana yang kurang, dan rancangan
perintah Tauri-nya supaya pengkerjaannya bisa diambil terpisah.

## 1. Bukti keadaan sekarang

- `src-tauri/src/browser.rs:88-90` — komentar keputusan, bukan TODO:
  > WebView2 CapturePreview is not exposed by the Tauri 2 Webview API used by
  > this application. Keep screenshot unsupported rather than producing a fake
  > PNG or using undocumented native handles.
- `src-tauri/src/lib.rs:249` (`tauri::generate_handler![...]`) — tidak ada satu pun
  entri `window_capture` / `screen_capture` / `screenshot`. Yang ada dan mirip
  nama tetapi BUKAN gambar layar: `browser::browser_probe`,
  `browser_pane::browser_pane_*` (pane browser), dan `ai::ai_capture_*` (perekam
  request/response AI untuk diagnosis).
- Zeph AI melaporkan keadaan ini apa adanya lewat `inspect { what: "window" }`
  (lihat `src/lib/zephyrTools/kendaliJendela.ts` -> `laporanTangkapLayar()`).

Kesimpulan: **tidak** ada jalur "kalau ada -> sambungkan". Yang berlaku adalah
jalur fallback: rancangan + laporan, dan UI/pintasan tidak dipasang karena
berkasnya di luar izin lane ini (lihat bagian 4).

## 2. Bagian yang kurang

| # | Bagian | Letak | Keterangan |
|---|--------|-------|------------|
| 1 | Perintah Tauri penangkap jendela | `src-tauri/src/` (modul baru, mis. `capture.rs`) | **Belum ada** — satu-satunya bagian yang benar-benar kurang |
| 2 | Registrasi di `invoke_handler` | `src-tauri/src/lib.rs:249` | **Belum ada** — satu baris `capture::window_capture,` |
| 3 | Pembungkus TypeScript | `src/lib/commands.ts` | **SUDAH ADA** — `captureWindow()` + `NAMA_PERINTAH_TANGKAP = 'window_capture'` |
| 4 | Id perintah + pintasan | `src/lib/shortcuts.ts`, `src/lib/keybindings.ts` | Belum: `view.tangkapLayar`, default `Ctrl+Alt+S` (di luar izin lane ini) |
| 5 | Menu | `src/lib/menu.ts` (View) | Belum: item "Tangkap Layar" (di luar izin lane ini) |
| 6 | Salin ke clipboard | plugin yang sudah terpasang | **Jalurnya sudah dipakai** — `Image.fromPath(path)` -> `writeImage()` di `tangkapJendela()` |
| 7 | Tool untuk Zeph | `src/lib/zephyrTools/mcp.ts` (`run_command`) | **SUDAH ADA** — `run_command({ capture: true, path?, copy? })`, plus `inspect { what: "window" }` untuk laporan |

## 3. Rancangan perintah Tauri

```rust
// src-tauri/src/capture.rs
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureArgs {
    /// "window" (jendela Zephyr saja) atau "screen" (layar penuh).
    pub target: String,
    /// Path PNG tujuan. Kalau kosong, file ditulis ke folder gambar user.
    pub save_path: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
}

#[tauri::command]
pub fn window_capture(
    window: tauri::Window,
    args: CaptureArgs,
) -> ZResult<CaptureResult> { /* lihat pilihan (a) */ }
```

Pilihan implementasi, dari yang paling aman ke paling berisiko:

(a) **Crate `xcap`** (Direkomendasikan.) Menangkap jendela/layar lewat API OS yang
    resmi dan mengembalikan RGBA. Nol `unsafe` di kode kita, lintas-platform
    (Windows/macOS/Linux), dan tidak menyentuh handle WebView2 sama sekali —
    berbeda dari yang ditolak komentar di `browser.rs` (klaim itu soal
    `CapturePreview` WebView2, bukan soal menangkap jendela OS).
    Biaya: satu dependensi baru.

(b) **`windows` crate + `PrintWindow`/`BitBlt`** pada HWND jendela Tauri
    (`window.hwnd()`). Tanpa dependensi baru kalau `windows` sudah masuk lewat
    Tauri, tetapi ~80 baris `unsafe` + penanganan DPI + `OpenClipboard` untuk
    clipboard manual. Dipakai hanya kalau menolak dependensi baru.

(c) **WebView2 `CapturePreview`** — yang sudah ditolak `browser.rs`. Jangan
    diulang kecuali ada alasan baru: Tauri 2 tidak memaparkan antarmuka itu, dan
    menembusnya lewat handle tidak terdokumentasi adalah sumber kerapuhan.

Alur simpan + salin:

1. Tangkap -> RGBA.
2. Tulis PNG ke `savePath` (atau `%USERPROFILE%\Pictures\Zephyr\zephyr-<stamp>.png`).
   Verifikasi byte tertulis sebelum melaporkan sukses (pola yang sudah dipakai
   `browser::browser_download_url` di `browser.rs:71-81`).
3. Salin ke clipboard. Jalur paling ringkas: `tauri-plugin-clipboard-manager`
   (`writeImage`). Alternatif tanpa plugin: `arboard` atau `CF_DIB` manual.
4. Balikan `CaptureResult` — path nyata, ukuran, jumlah byte. Pelaporannya tidak
   boleh berbentuk "berhasil" tanpa path.

## 4. Kenapa pintasan/menu belum dipasang hari ini

Id perintah dan pintasannya (`view.tangkapLayar`, `Ctrl+Alt+S`) plus item menu
hanya bisa hidup di `src/lib/shortcuts.ts`, `src/lib/keybindings.ts`, dan
`src/lib/menu.ts`. Ketiganya di luar daftar berkas yang boleh disentuh lane ini
(daftar izin hanya memuat `src/lib/zephyrTools/**`, `subsetAlat.ts`,
`devBridge.ts`, `commands.ts`, `src-tauri/src/**`, plus berkas baru di `scripts/`
dan `docs/`). Jadi langkah 4 dan 5 TIDAK dikerjakan, bukan dikerjakan setengah:
memasang tombol yang memanggil perintah yang tidak ada akan membuat satpura yang
gagal diam-diam — persis pola yang dihindari di seluruh jalur tool ini.

Yang SUDAH tersedia tanpa menyentuh berkas itu: nama perintah yang disepakati
(`view.tangkapLayar`), tombol default yang diusulkan (`Ctrl+Alt+S`), rancangan
perintah Rust di atas, dan laporan keadaan yang bisa dibaca Zeph lewat
`inspect { what: "window" }`.

## 5. Rencana verifikasi (kalau #1-#4 dikerjakan)

1. `cargo test --lib` di `src-tauri` — tambahkan unit test untuk penulisan PNG +
   verifikasi byte (tanpa perlu clipboard).
2. Uji manual sekali: `Ctrl+Alt+S` -> notifikasi memuat path; file benar-benar ada
   dan bisa dibuka; `Ctrl+V` menempelkan gambarnya.
3. Tool Zeph: `run_command({ id: 'view.tangkapLayar' })` harus mengembalikan path
   nyata di ringkasan keadaan, bukan "berhasil".
4. Saat itu tercapai, ubah `TANGKAP_LAYAR_TERSEDIA` menjadi `true` di
   `src/lib/zephyrTools/kendaliJendela.ts` — satu baris, dan laporan Zeph
   otomatis berubah dari "belum didukung" menjadi "siap".

## 6. Mengapa tidak memakai `screenshot_pane` yang sudah ada

`src-tauri/src/mcp_server.rs` sudah punya tool bernama `screenshot_pane`, dan namanya mudah
disalahartikan sebagai penangkap layar. Ia **bukan** penangkap layar: implementasinya
memanggil `pane_text` lalu menulis ISI TEKS buffer pane ke `.txt` di `%TEMP%`
(`mcp_server.rs:971-990`), dan deskripsi tool-nya sendiri menyatakan hal itu
(`mcp_server.rs:510`):

> `screenshot_pane v1 saves the terminal buffer contents as a text file in %TEMP%.`

Alasan tidak ada tangkapan gambar sungguhan ada di `src-tauri/src/browser.rs:88-90`:

> `WebView2 CapturePreview is not exposed by the Tauri 2 Webview API used by this`
> `application. Keep screenshot unsupported rather than producing a fake PNG or`
> `using undocumented native handles.`

Jadi jangan menyambungkan `screenshot_pane` ke pintasan/tombol "Tangkap Layar": yang didapat
user adalah berkas teks, bukan gambar. Item ZEPH-SCREENSHOT-TOOL butuh perintah Tauri baru
(baris #1 di tabel bagian 2), bukan pembungkus ulang tool yang sudah ada. Kalimat itu juga
ikut dilaporkan `laporanTangkapLayar()` supaya Zeph tidak menjawab "ada, namanya
screenshot_pane".

## 7. Yang sudah jadi di sisi TypeScript

- `src/lib/commands.ts`: `NAMA_PERINTAH_TANGKAP = 'window_capture'`, `captureWindow()`, dan
  tipe `HasilTangkapLayar` — kontrak nama terkunci di satu tempat, sebaris dengan seluruh
  `invoke()` lain.
- `src/lib/zephyrTools/kendaliJendela.ts`: `tangkapJendela({ path?, salin })`. Selama
  `TANGKAP_LAYAR_TERSEDIA = false` ia mengembalikan laporan keadaan — bukan lemparan error,
  bukan pula klaim berhasil. Begitu Rust-nya ada, jalur yang sama menyimpan PNG dan
  menyalin GAMBARNYA ke clipboard lewat plugin clipboard-manager yang sudah terpasang
  (`Image.fromPath` -> `writeImage`) — jadi tidak perlu perintah Rust kedua untuk salin.
- `src/lib/zephyrTools/mcp.ts`: `run_command({ capture: true, path?, copy? })`, plus
  `inspect({ what: "window" })` untuk laporan keadaan jendela.
- Dijaga `scripts/uji-tool-jendela.mjs` (bagian "cek laporan tangkap layar") dan diuji
  gigi-nya: 4 kasus baru memastikan cek itu benar-benar gagal ketika penjaga bendera,
  konstanta nama perintah, parameter `capture`, atau laporan keadaannya dicabut.
- `scripts/uji-runtime-jendela.mjs` (BARU) memeriksa hal yang tidak bisa dijawab analisis
  sumber: memuat modul di APLIKASI YANG HIDUP lewat CDP dan mencocokkan peta panel/setelan
  dengan `findCommand()` registry NYATA (saat dijalankan: 6 panel, 20 setelan, 11 aksi pane,
  10 id peta, 0 id tak dikenal). Ia hanya memanggil fungsi BACA - `bukaPanel()`,
  `bukaSetelan()`, dan `aksiPane()` sengaja TIDAK dipanggil karena mengubah UI user.
  Tanpa aplikasi hidup ia mencetak `DILEWATI` dan keluar 0; tambahkan `--wajib` kalau
  aplikasi seharusnya hidup dan absennya berarti ada yang salah.
