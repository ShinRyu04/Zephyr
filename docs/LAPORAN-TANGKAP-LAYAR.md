# Laporan tangkap layar jendela (item ZEPH-SCREENSHOT-TOOL / 151 — sisi Rust)

Tanggal: 14 Oktober 2026 · Lane: Rust tangkap layar · Rancangan asal: `docs/RANCANGAN-TANGKAP-JENDELA.md`

---

## 1. Keputusan: **ADA** jalur tanpa dependensi baru

Perintah `window_capture` **sudah ada dan jalan** di backend Rust, memakai API
Windows yang benar-benar tersedia di runtime, **tanpa satu pun dependensi baru**
(`Cargo.toml` tidak disentuh sama sekali).

Tiga hal yang diperiksa lebih dulu — semuanya baris yang bisa dibuka sendiri:

| # | Yang diperiksa | Baris bukti | Hasil |
|---|----------------|-------------|-------|
| 1 | Versi Tauri & API tangkap layarnya | `src-tauri/Cargo.toml:17` (`tauri = { version = "2", features = ["devtools", "unstable"] }`), `src-tauri/Cargo.lock:4420-4421` (`tauri 2.11.5`) | Tauri **tidak punya** API tangkap layar. Perintah `grep -rni "fn capture" ~/.cargo/registry/src/*/tauri-2.11.5/src/ \| wc -l` = **0**. Tidak ada `Window::capture_page`/`capture()`/plugin-screenshot di versi ini. Yang memang dipaparkan hanyalah handle jendela: `tauri-2.11.5/src/window/mod.rs:1668` → `pub fn hwnd(&self) -> crate::Result<HWND>` |
| 2 | Cara memanggil API Windows tanpa dependensi | `src-tauri/src/titlebar.rs:8-9` → `#[link(name = "dwmapi")] extern "system" { … }`; `titlebar.rs:55` → `jendela.hwnd()?.0 as isize` | Pola FFI mentah **sudah dipakai repo ini**. Modul baru memakai pola yang sama untuk `user32`/`gdi32`, jadi tidak perlu crate `windows`. Hanya `isize` (HWND) yang menyeberang batas FFI. |
| 3 | WebView2 `CapturePreview` | `src-tauri/src/browser.rs:88-90` | **Tetap tidak dipakai** — itu API untuk ISI webview, bukan jendela OS, dan Tauri 2 tidak memaparkannya. Keputusan lama itu tidak dibatalkan; yang baru menangkap jendela OS (klien + isi yang sudah di-composite). |

Yang **tidak** dipakai (sesuai batas lane): `screenshot_pane` di
`mcp_server.rs` yang menulis **teks** buffer pane ke `.txt`
(`mcp_server.rs:510` → `"screenshot_pane v1 saves the terminal buffer contents as a text file in %TEMP%."`).

### API capture yang dipakai (dan urutannya)

1. `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)` — pilihan pertama untuk
   jendela; tetap bekerja walau jendela terhalang jendela lain.
2. `PrintWindow(hwnd, hdc, 0)` — flag lama, dicoba kalau yang di atas menolak.
3. `BitBlt` dari DC layar pada kotak jendela — jalan terakhir, andal hanya kalau
   jendela benar-benar terlihat.

Kalau sebuah percobaan "berhasil" tetapi **seluruh pikselnya nol** (gejala klasik
`PrintWindow` pada jendela yang di-render GPU), percobaan berikutnya tetap
dijalankan; kalau semua gagal, hasilnya **galat dengan pesan**, bukan PNG hitam
yang diklaim berhasil.

---

## 2. Apa yang BENAR-BENAR terukur di runtime ini

Uji `strategi_tangkap_tercatat_bukan_tebakan` (memanggil lapis GDI langsung pada
jendela desktop) mencetak:

```
TANGKAP: cara=BitBlt(layar)
```

Artinya **di sesi ini `BitBlt` dari DC layar-lah yang menghasilkan piksel** untuk
jendela desktop (`GetDesktopWindow()`); `PrintWindow` tidak memberi gambar di
sana. Hasil nyatanya dua berkas PNG dari jalur perintah penuh:

```
$ ls -la .../zephyr-tangkap-layar/layar/layar.png .../desktop/desktop.png
-rw-r--r-- 1 Zyrex 197121 4425043 desktop.png
-rw-r--r-- 1 Zyrex 197121 4425043 layar.png
```

Diverifikasi **independen** (skrip Python stdlib `zlib`, tanpa memakai kode Rust
mana pun):

```
chunk          : [('IHDR', 13), ('IDAT', 4424986), ('IEND', 0)]
dimensi        : 1536x960 bit_depth=8 color_type=2 interlace=0 -> RGB 8-bit
byte IDAT      : 4424986 -> inflate 4424640 byte
piksel sampel  : [(32, 22, 29), (37, 16, 21), (13, 17, 23), (32, 22, 29)]
seluruhnya nol : False; warna unik pada 40x40 sampel: 39
OK: PNG sah, dimensi cocok, isi bukan gambar kosong.
```

→ CRC tiap chunk sah, `zlib.decompress` menerima stream + adler32-nya, dimensi
IHDR sama dengan yang dilaporkan perintah, dan isinya gambar nyata (bukan hitam).

### BUTUH APP

`PrintWindow` terhadap jendela **aplikasi** (WebView2 Zephyr, konten GPU) tidak
bisa dibuktikan di sini karena app harus hidup: `cargo test` tidak punya jendela
Tauri. Yang bisa dijawab sekarang: jalur `PrintWindow` ada, dicoba lebih dulu, dan
kalau hasilnya kosong otomatis jatuh ke `BitBlt` — tetapi **cabang mana yang
menang untuk jendela Zephyr belum diukur** (jangan dibaca sebagai "PrintWindow
berhasil"). Cara mengukurnya saat app hidup ada di bagian 8.

---

## 3. Berkas yang diubah

| Berkas | Perubahan |
|--------|-----------|
| `src-tauri/src/tangkap_layar.rs` | **BARU**, 1470 baris — seluruh isi item ini: struct hasil, argumen, penjagaan path, kodek PNG, FFI Win32, perintah `window_capture`, dan 22 uji |
| `src-tauri/src/lib.rs:60` | `mod tangkap_layar;` (satu baris) |
| `src-tauri/src/lib.rs:534-536` | `// item ZEPH-SCREENSHOT-TOOL (151) …` + `tangkap_layar::window_capture,` di `tauri::generate_handler!` |
| `docs/LAPORAN-TANGKAP-LAYAR.md` | dokumen ini (baru) |

Tidak ada berkas lain yang disentuh. `Cargo.toml`/`Cargo.lock` **tidak berubah
karena lane ini** (tidak ada dependensi baru): di `git status` keduanya memang
tampak `M`, tetapi itu milik lane lain — `git diff src-tauri/Cargo.toml`
selengkapnya hanya 4 baris berisi komentar + `sha2 = "0.10"` untuk verifikasi
unduhan registry, dan `grep -n "png\|^image" src-tauri/Cargo.toml` tidak
menemukan apa pun. Sisi TypeScript **tidak dikerjakan** — usulannya di
bagian 6.

### Titik masuk penting di `src-tauri/src/tangkap_layar.rs`

| Baris | Isi |
|-------|-----|
| 74 | `pub const NAMA_PERINTAH_TANGKAP: &str = "window_capture";` (cermin `src/lib/commands.ts:131`) |
| 91 | `pub struct ArgumenTangkap { target, savePath }` (`#[serde(rename_all = "camelCase")]`) |
| 109 | `pub struct HasilTangkapLayar` (`berhasil`, `path`, `width`, `height`, `bytes`, `pesanGalat`) |
| 145 | `pub fn bungkus(ZResult<HasilTangkapLayar>) -> HasilTangkapLayar` |
| 201 | `pub fn periksa_path_keluaran` (penjagaan path) |
| 278 | `pub fn path_bawaan` (`%USERPROFILE%\Pictures\Zephyr\zephyr-<stamp>.png`) |
| 356 | `pub fn kodek_png_rgb` (PNG tanpa dependensi) |
| 777 | `pub fn jalankan_tangkap` (inti, bisa diuji tanpa jendela) |
| 888 | `pub fn window_capture(jendela: tauri::Window, args: ArgumenTangkap) -> HasilTangkapLayar` ← perintah Tauri |

---

## 4. Bentuk kontrak

Perintah: `window_capture`, parameter `args` (karena TS mengirim
`invoke('window_capture', { args: { target, savePath } })` — lihat
`src/lib/commands.ts:141-144`).

Argumen:

```jsonc
{ "target": "window" | "screen",  // default "window"
  "savePath": "C:/…/x.png"        // null/kosong -> %USERPROFILE%\Pictures\Zephyr\zephyr-<stamp>.png
}
```

Hasil (JSON):

```jsonc
{ "berhasil": true, "path": "C:/…/x.png", "width": 1536, "height": 960, "bytes": 4425043 }
{ "berhasil": false, "path": "", "width": 0, "height": 0, "bytes": 0,
  "pesanGalat": "path keluaran harus absolut, bukan relatif: gambar.png" }
```

Catatan penting: perintah ini **tidak pernah melempar** (`Err`), dan
`berhasil=true` hanya dikeluarkan setelah berkasnya benar-benar ada di disk dan
jumlah byte-nya diverifikasi. Pemanggil yang memeriksa `path` (`tangkapJendela()`
memang melakukannya) tidak bisa tertipu oleh keberhasilan palsu.

`berhasil`/`pesanGalat` adalah tambahan di luar `interface HasilTangkapLayar`
(`src/lib/commands.ts:133-139`); field tambahan diabaikan TypeScript, jadi
kontrak lama tidak rusak — tetapi menambahkannya di sisi TS membuat alasan
gagalnya terlihat (usulan 6C).

### Keamanan

* **Hanya menulis berkas.** Tidak ada parameter URL/jaringan/"kirim ke …" di
  `ArgumenTangkap` maupun di `window_capture`. Tidak ada jalur di mana perintah
  ini membaca sesuatu lalu mengirimnya keluar.
* **Penjagaan path keluaran** (`periksa_path_keluaran`, baris 201), meniru pola
  yang sudah ada di repo — bukan pola baru:
  * tolak path kosong & **relatif** → pola `ext_pkg.rs:409-411`
    (`resolve_in_ext`: `is_absolute()`) dan `paths.rs`/`cli.rs` yang menuntut
    absolut lebih dulu;
  * tolak komponen **`..`** → pola `ext_pkg.rs:414-420` (`Component::ParentDir`
    → `Permission`);
  * tolak berkas **bukan `.png`**, komponen berakhir titik/spasi (Windows
    membuangnya → berkas yang tertulis bukan path yang dilaporkan), dan nama
    perangkat (`NUL`/`CON`/`COM1`/…);
  * tolak folder sistem (`%SystemRoot%`, `%windir%`, `%ProgramFiles%`,
    `%ProgramFiles(x86)%`) memakai `paths.rs:107` (`canonical_or_parent`, sadar
    UNC) + `paths.rs:131` (`is_inside`, tidak peka huruf besar/kecil & separator)
    — menyamakan path dulu, baru membandingkan, jadi `C:\Windows\..\Windows` atau
    bentuk UNC tidak bisa menyelinap;
  * tulis dengan `tulis_aman.rs:31` (`tulis_atomik`: berkas sementara + `sync_all`
    + rename, membuat direktori induk) lalu **verifikasi byte di disk** sebelum
    melaporkan sukses — pola `browser.rs:70-82` (download yang memverifikasi
    hasil sebelum mengaku berhasil);
  * handle GDI dilepas lewat penjaga `Drop` (`SumberDaya`) di semua jalur keluar,
    termasuk galat — tidak menumpuk kebocoran handle DC/bitmap.

---

## 5. Uji

Perintah: `cd src-tauri && cargo test --lib`

```
test result: ok. 490 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.44s
```

Sebelum lane ini: **468 lulus / 0 gagal**. Sesudah: **490 lulus / 0 gagal**
(468 lama tetap + **22 uji baru**). Tidak ada uji lama yang diubah.

Catatan jujur: pada satu kali jalan dengan `--nocapture`,
`lsp::tests::shim_cmd_bisa_dijalankan` (berkas `src/lsp.rs:1197`, BUKAN milik
lane ini, tidak menyentuh tangkap layar) sempat gagal karena stdout shim `.cmd`
kosong; jalan berikutnya hijau. Itu uji yang men-spawn `cmd.exe`, sifatnya
lingkungan/flaky, dan bukan akibat perubahan di sini.

### 22 uji baru (semuanya `ok`)

Kodek PNG & piksel:

1. `kodek_png_menghasilkan_berkas_png_sah` — chunk IHDR/IDAT/IEND, bit depth 8,
   truecolor, tanpa interlace, **CRC tiap chunk dihitung ulang**, panjang berkas
   dicocokkan dengan hitungan persis, dan IDAT di-*inflate* balik lalu dibandingkan
   piksel per baris.
2. `kodek_png_menolak_ukuran_dan_panjang_yang_tidak_masuk_akal` — lebar/tinggi 0,
   panjang piksel tidak cocok, ukuran raksasa.
3. `zlib_tersimpan_memecah_data_besar_jadi_beberapa_blok` — 200.000 byte
   (> batas 65535 blok stored) bolak-balik utuh.
4. `bgra_ke_rgb_membalik_baris_dan_membuang_alpha` — urutan baris DIB
   (bawah→atas) dan pembuangan alpha; kalau salah, tangkapan layar akan terbalik.

Penjagaan path keluaran:

5. `tolak_path_kosong_dan_relatif`
6. `tolak_path_dengan_parent_dir`
7. `tolak_ekstensi_bukan_png` (`.txt`, `.png.exe`, tanpa ekstensi)
8. `tolak_komponen_path_aneh_dan_nama_perangkat` (folder berakhir spasi/titik,
   `NUL`/`CON`/`COM1`; `console.png` & spasi di tengah nama tetap diterima)
9. `tolak_folder_sistem` (memakai `%SystemRoot%`/`%ProgramFiles%` nyata)
10. `terima_path_absolut_yang_wajar`
11. `path_bawaan_di_folder_gambar_user`
12. `stempel_waktu_aman_untuk_nama_berkas`

Bentuk hasil:

13. `hasil_sukses_serialisasi_ikut_kontrak_typescript` — nama field JSON persis
    `path`/`width`/`height`/`bytes` (kalau berubah, TS membaca `undefined`).
14. `hasil_gagal_serialisasi_tidak_klaim_berhasil` — `berhasil=false`, `path`
    kosong, `pesanGalat` ada dan memuat sebabnya.
15. `bungkus_meneruskan_hasil_sukses_apa_adanya`

Perilaku gagal (tidak boleh sukses palsu):

16. `target_tidak_dikenal_ditolak_dengan_pesan`
17. `path_berbahaya_ditolak_sebelum_menyentuh_layar`
18. `hwnd_tidak_masuk_akal_tidak_pernah_mengaku_berhasil` (hwnd 0, hwnd 1, dan
    tanpa hwnd)
19. `tangkap_jendela_desktop_lewat_printwindow_atau_galat_jelas`
20. `tangkap_layar_nyata_atau_galat_jelas` (target `screen`)
21. `strategi_tangkap_tercatat_bukan_tebakan` (mencetak `cara=` — lihat bagian 2)
22. `berkas_yang_sudah_ada_tidak_ditinggalkan_setengah_saat_gagal`

Uji 19-20 memakai pemeriksa bersama `periksa_hasil_jujur`: kalau hasilnya sukses,
berkasnya **wajib** ada, PNG sah (semua CRC), dimensi IHDR sama dengan yang
dilaporkan, `bytes` sama dengan ukuran di disk, dan isinya tidak mungkin lebih
kecil dari `w*h*3/2`; kalau gagal, pesannya wajib tidak kosong dan **tidak boleh
ada berkas tertinggal**. Di CI headless (tidak ada desktop), uji-uji itu memang
gagal — dan yang diuji adalah bahwa kegagalannya jujur, bukan bahwa tangkap layar
selalu berhasil.

---

## 6. Usulan tambalan TypeScript — **BELUM dikerjakan** (di luar izin lane ini)

Sisi TS sudah siap: `captureWindow()` (`src/lib/commands.ts:141-144`) mengirim
`{ args: { target, savePath } }` persis seperti yang dibaca `ArgumenTangkap`, dan
`tangkapJendela()` (`src/lib/zephyrTools/kendaliJendela.ts:452-455`) sudah membaca
`hasil.path/width/height/bytes`. Jadi yang perlu hanya menyalakan bendera dan
(saran) meneruskan `pesanGalat`.

### 6A. `src/lib/zephyrTools/kendaliJendela.ts:413` — WAJIB

```diff
--- a/src/lib/zephyrTools/kendaliJendela.ts
+++ b/src/lib/zephyrTools/kendaliJendela.ts
@@ -410,4 +410,4 @@
  * menaikkan bendera ini (dan menambahkan parameter `tangkap` pada tool) -
  * sehingga pemanggil tidak perlu tahu kapan ia berubah.
  */
-export const TANGKAP_LAYAR_TERSEDIA = false;
+export const TANGKAP_LAYAR_TERSEDIA = true;
```

Efeknya: `laporanTangkapLayar()` (baris 419-431) berubah dari "BELUM didukung"
menjadi "Tangkap layar siap (pintasan Ctrl+Alt+S)", dan `tangkapJendela()`
(baris 443) berhenti memulangkan laporan lalu benar-benar memanggil
`window_capture`.

### 6B. `src/lib/zephyrTools/kendaliJendela.ts:452-455` — sangat disarankan

Perintah Rust tidak melempar, jadi tanpa ini alasan gagal dari Rust hilang dan
pesannya menjadi generik:

```diff
--- a/src/lib/zephyrTools/kendaliJendela.ts
+++ b/src/lib/zephyrTools/kendaliJendela.ts
@@ -451,6 +451,11 @@
   ]);
   const hasil = await captureWindow({ target: 'window', savePath: opsi.path });
+  const pesanGalat = (hasil as unknown as { pesanGalat?: string }).pesanGalat;
   if (!hasil?.path) {
-    return `Tangkap layar GAGAL: ${NAMA_PERINTAH_TANGKAP} tidak mengembalikan path berkas. ${ringkasJendela()}`;
+    return (
+      `Tangkap layar GAGAL: ` +
+      `${pesanGalat ?? `${NAMA_PERINTAH_TANGKAP} tidak mengembalikan path berkas`}. ` +
+      ringkasJendela()
+    );
   }
   let salin = '';
```

### 6C. `src/lib/commands.ts:133-139` — opsional (tipe)

```diff
--- a/src/lib/commands.ts
+++ b/src/lib/commands.ts
@@ -133,7 +133,11 @@
 export interface HasilTangkapLayar {
   /** Path PNG yang benar-benar tertulis. */
   path: string;
   width: number;
   height: number;
   bytes: number;
+  /** true hanya kalau PNG benar-benar tertulis & diverifikasi. */
+  berhasil?: boolean;
+  /** Alasan gagal saat `path` kosong. */
+  pesanGalat?: string;
 }
```

`src/lib/commands.ts:141-144` **tidak perlu diubah**; begitu juga pemanggilan
salin-ke-clipboard (`Image.fromPath(hasil.path)` → `writeImage`) di
`kendaliJendela.ts:456-465`, yang memang menunggu `path` terisi lebih dulu.

### 6D. Di luar dua berkas itu (konteks, bukan usulan lane ini)

`zephyrDokumenData.ts` mencatat sisa pekerjaan item ini: id perintah + pintasan
(`view.tangkapLayar`, `Ctrl+Alt+S` di `src/lib/shortcuts.ts` / `keybindings.ts`)
dan item menu View di `src/lib/menu.ts`. Tool `run_command({ capture: true })` di
`src/lib/zephyrTools/mcp.ts` sudah ada. Setelah 6A, alur tool Zephyr → PNG → path
nyata langsung berfungsi tanpa perubahan Rust lagi.

---

## 7. Batas yang diketahui (jujur, bukan tersembunyi)

1. **PNG-nya besar.** Pengodean memakai blok deflate *stored* (tanpa kompresi),
   ditulis sendiri supaya nol dependensi baru: 1536x960 RGB = 4,4 MB, sementara
   kompresor biasa memberi ~10%. Berkasnya tetap PNG **sah** (dibuktikan uji CRC +
   inflate balik + dekoder Python independen). Kalau suatu saat `png = "0.17"`
   ditambahkan ke `Cargo.toml` (crate-nya sudah ada di `Cargo.lock` secara
   transitif: 0.17.16 & 0.18.1), cukup ganti `chunk(&mut out, b"IDAT", …)` di
   `kodek_png_rgb` — sisa modul tidak berubah.
2. **Alpha dibuang, bukan ditulis.** `GetDIBits` pada bitmap kompatibel GDI
   meninggalkan alpha nol; menuliskannya menghasilkan PNG tembus pandang yang
   terlihat "kosong" di penampil. PNG di sini truecolor RGB 8-bit.
3. **Cara yang dipakai tidak ikut di hasil.** Nama strategi
   (`PrintWindow(render-full-content)` / `PrintWindow(legacy)` / `BitBlt(layar)`)
   hanya muncul di log `tracing::debug!` (`jalankan_tangkap`, baris 829-830) supaya
   kontrak TS tidak berubah. Kalau pemanggil perlu tahu apakah gambarnya
   "render jendela" atau "salinan layar", tambahkan field `cara` di
   `HasilTangkapLayar` — TypeScript akan mengabaikannya.
4. **`BitBlt` menyalin apa yang terlihat.** Sebagai jalan terakhir ia menangkap
   isi layar pada kotak jendela; kalau jendela Zephyr tertutup jendela lain,
   isinya bisa jadi jendela yang menutupinya. Itu sebabnya `PrintWindow` dicoba
   lebih dulu, dan sebabnya butir 3 berguna.
5. **DPI**: semuanya memakai koordinat piksel fisik (proses Tauri sudah
   per-monitor DPI aware), jadi gambar bisa lebih besar dari ukuran CSS jendela
   pada layar berskala 125%/150%.

---

## 8. Verifikasi saat aplikasi hidup (yang belum bisa diuji di sini)

1. Jalankan app, lalu dari sisi Zephyr/Zeph: `run_command({ capture: true })`.
   Harapan: ringkasan memuat **path nyata** + `WxH` + jumlah byte, dan berkasnya
   bisa dibuka penampil gambar. Kalau `path` kosong, baca `pesanGalat` (usulan 6B).
2. Untuk memastikan **PrintWindow** benar-benar dipakai pada jendela WebView2
   (dan bukan jatuh ke `BitBlt`): jalankan dengan level log debug, cari baris
   `tangkap layar: piksel tersalin … cara=…`. Kalau `cara=BitBlt(layar)`,
   PrintWindow menghasilkan nol untuk jendela app — gambar tetap sah selama
   jendela terlihat, dan pada saat itu menaikkan urutan BitBlt di
   `win32::tangkap` (`src-tauri/src/tangkap_layar.rs`, daftar `percobaan`)
   bisa dipertimbangkan **setelah diukur**, bukan ditebak.
3. Kali pertama: cara tercepat adalah memanggil perintah dari sisi TS yang
   **sudah ada** — naikkan `TANGKAP_LAYAR_TERSEDIA` (6A) lalu pakai tool, atau
   panggil `captureWindow({ target: 'window' })` lewat devtools/console dev.
