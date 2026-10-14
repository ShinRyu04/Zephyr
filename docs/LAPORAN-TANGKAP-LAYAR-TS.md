# LAPORAN-TANGKAP-LAYAR-TS.md — sisi TypeScript item ZEPH-SCREENSHOT-TOOL (151)

Status: **selesai untuk lingkup TS** (bendera + propagasi `pesanGalat` + harness node-only 45 kasus).
Sisi Rust sudah selesai lebih dulu (lihat `docs/LAPORAN-TANGKAP-LAYAR.md`); laporan ini **tidak**
menyentuh `src-tauri/**` dan tidak menyentuh berkas lane lain.

## 1. Titik sambung (berkas:baris)

| Berkas:baris | Isi | Kenapa di situ |
| --- | --- | --- |
| `src/lib/zephyrTools/kendaliJendela.ts:420` | `export const TANGKAP_LAYAR_TERSEDIA = true;` | **6A.** Sebelumnya `false` → `tangkapJendela()` memulangkan laporan tanpa pernah `invoke`. |
| `src/lib/zephyrTools/kendaliJendela.ts:429-447` | `laporanTangkapLayar()` | Cabang tersedia menyebut `siap` + nama perintah + jalan yang benar-benar hidup + berkas bukti. Cabang `false` (kini dead code) dipertahankan. |
| `src/lib/zephyrTools/kendaliJendela.ts:455` | `export const TARGET_TANGKAP = ['window', 'screen'] as const;` | Mencerminkan `src-tauri/src/tangkap_layar.rs:91` (`ArgumenTangkap.target`). |
| `src/lib/zephyrTools/kendaliJendela.ts:467` | `periksaTargetTangkap()` | Target tak dikenal = salah pemanggil → ditolak di TS, tanpa perjalanan IPC. |
| `src/lib/zephyrTools/kendaliJendela.ts:492` | `periksaPathTangkap()` | `savePath` wajib absolut gaya Windows (drive/UNC), tanpa `..`, berakhiran `.png`, bukan nama perangkat. |
| `src/lib/zephyrTools/kendaliJendela.ts:552-608` | `tangkapJendela()` | `:555` penjaga bendera, `:558-559` penjagaan argumen, `:560-567` `invoke`, `:568-576` `catch` invoke, `:577-590` cabang gagal (**6B**), `:591-599` salin clipboard, `:600-607` laporan sukses. |
| `src/lib/commands.ts:134` | `export const NAMA_PERINTAH_TANGKAP = 'window_capture';` | Nama perintah terkunci di modul yang sama dengan seluruh `invoke()` lain; dibandingkan harness dengan `lib.rs`. |
| `src/lib/commands.ts:136-154` | `export interface HasilTangkapLayar` | **6C.** `path/width/height/bytes` + `berhasil?` + `pesanGalat?`. |
| `src/lib/commands.ts:156-159` | `captureWindow()` | Satu-satunya jalur `invoke` tangkap layar: `invoke<HasilTangkapLayar>(NAMA_PERINTAH_TANGKAP, { args: { target, savePath } })`. |
| `src/lib/zephyrTools/mcp.ts:108` | `tangkapLayar: laporanTangkapLayar()` | Teks laporan yang dibaca model lewat tool inspeksi. |
| `src/lib/zephyrTools/mcp.ts:194` | `tangkapJendela({ ... })` | Jalur tool `run_command({ capture: true })`. |
| `src-tauri/src/lib.rs:60`, `src-tauri/src/lib.rs:536` | `mod tangkap_layar;`, `tangkap_layar::window_capture,` | Bukti perintah Rust terdaftar — satu-satunya alasan bendera `:420` boleh `true`. |

## 2. Perubahan yang diterapkan

- **6A (WAJIB)** — `kendaliJendela.ts:420` `false` → `true`; doc comment di atasnya diperbarui
  (yang lama masih mengutip `browser.rs` dan mengklaim Rust belum punya perintah tangkap layar).
- **6B (SANGAT DISARANKAN)** — `kendaliJendela.ts:577-590`: `pesanGalat` dari Rust dipakai
  **apa adanya** (`hasil.pesanGalat.trim()`), pesan generik hanya kalau backend tidak mengirim alasan.
  Urutan pemeriksaan: `berhasil === false` lebih dulu, lalu path kosong, sehingga hasil `{}` **tidak**
  pernah dianggap sukses dan tidak ada path palsu yang dilaporkan.
- **6C** — `commands.ts:136-154` `berhasil?: boolean;` + `pesanGalat?: string;` beserta komentarnya.
- **Tambahan di luar usulan lane Rust (disebut apa adanya):**
  1. Penjagaan `target`/`savePath` di TS **sebelum** `invoke` (`:558-559`) — argumen salah bukan keadaan
     backend; menolaknya di lokal hemat satu IPC dan galatnya lebih jelas.
  2. `catch` di `:568-576`: perintah Rust tidak pernah melempar, tetapi `invoke` bisa (di luar jendela
     Tauri, perintah tidak terdaftar). Tanpa `catch`, giliran model mati tanpa jejak.
  3. Laporan `siap` menyebut **keadaan pintasan apa adanya**: `Ctrl+Alt+S` **belum terpasang** di
     `src/lib/shortcuts.ts` (grep = 0 baris). Kalimat lamanya (`siap (pintasan Ctrl+Alt+S)` tanpa
     keterangan) menyiratkan pintasannya jalan — itu klaim yang belum bisa dibuktikan.

Tidak ada anotasi tipe `: boolean` yang ditambahkan pada `:420`: regex
`/export const TANGKAP_LAYAR_TERSEDIA = true/` di `scripts/uji-tool-jendela.mjs:374` akan putus karenanya.

## 3. Harness `scripts/uji-tangkap-layar-ts.mjs` (node-only, TANPA app)

Cara kerja: `kendaliJendela.ts` + `commands.ts` **asli** di-bundle esbuild 0.25.12, dengan
plugin `onResolve`/`onLoad` yang mengganti `@tauri-apps/api/core`, `@tauri-apps/api/image`,
`@tauri-apps/plugin-clipboard-manager` dengan tiruan yang **merekam setiap panggilan**
(`globalThis.__TANGKAP_LOG__`) dan menjawab sesuai skenario uji. Store (`../store`, `../panelStore`,
`../settingsStore`, `../terminalStore`, `../commandRegistry`) ditiru supaya graf xterm/markdown/AI tidak
ikut masuk ke Node; impor dinamis `./rulesRuntime|./rulesEngine|./aiStore` dibiarkan eksternal karena
tidak pernah dipanggil jalur tangkap. Yang diperiksa karena itu bukan salinan kode, melainkan perilaku
`tangkapJendela()`/`laporanTangkapLayar()`/`captureWindow()` yang benar-benar dijalankan.

### Tabel kasus (45 assertion, semua lulus)

| # | Kasus | Yang dibuktikan |
| --- | --- | --- |
| 1 | `TANGKAP_LAYAR_TERSEDIA === true` | 6A menyala. |
| 2-4 | laporan menyebut `siap`, **tidak** `belum didukung`, menyebut `Ctrl+Alt+S` | 6A terlihat di teks yang dibaca model, bukan hanya konstanta. |
| 5-9 | `invoke` **tepat sekali**, `cmd = window_capture`, argumen **hanya** `{ args: { target, savePath } }` | b) poin tugas: tak ada parameter jaringan/telemetri. |
| 10-13 | sukses `{berhasil:true, path:'C:/x/a.png', 1536x960, 4425043 byte}` | Path itu yang dipakai; dimensi+byte ikut dilaporkan; tanpa `undefined`. |
| 14 | sukses tanpa `width/height` | laporan tetap bersih (`.`) tidak `undefinedxundefined`. |
| 15-17 | gagal `{berhasil:false, pesanGalat:'semua cara tangkap gagal'}` | Pesan backend **muncul apa adanya**, bukan `tidak mengembalikan path berkas`. |
| 18 | gagal tanpa `pesanGalat` | pesan generik yang jelas + menyebut `window_capture`. |
| 19-21 | hasil `{}` | **tidak** dianggap sukses, tidak mengarang path, `invoke` tetap 1×. |
| 22-23 | `berhasil:false` + `path` terisi | tetap GAGAL; alasan verifikasi byte ikut disebut (tak ada sukses palsu). |
| 24-25 | `path` relatif `gambar.png` | ditolak **sebelum** invoke (`invoke = 0`). |
| 26-27 | `path` ber-`..` `C:/x/../a.png` | ditolak sebelum invoke (`invoke = 0`). |
| 28-29 | ekstensi `C:/x/a.jpg` | ditolak sebelum invoke (`invoke = 0`). |
| 30-31 | `target: 'piksel-aneh'` | ditolak sebelum invoke (`invoke = 0`). |
| 32-33 | `target: 'screen'` | diteruskan apa adanya dan tetap sukses. |
| 34-35 | tanpa `path` | `savePath: null` (bukan `''`) → Rust memakai path bawaannya; kunci argumen tepat dua. |
| 36 | `invoke` melempar (`__TAURI_INTERNALS__ is undefined`) | dilaporkan jujur, bukan exception. |
| 37-38 | `writeImage` gagal | path yang sudah tertulis tetap dilaporkan + alasan gagal salin. |
| 39-40 | `salin:false` | clipboard tak disentuh, tak mengklaim tersalin. |
| 41-44 | `periksaPathTangkap`/`targetTangkapDikenal` murni | UNC diterima, spasi = path bawaan, `NUL.png` ditolak, `window`+`screen` dikenal. |
| 45 | statis: blok `captureWindow` di `commands.ts` | hanya mengirim `{ args }`, tanpa `fetch(`/`http`/`token`/`endpoint`/`telemetri`. |

## 4. Keluaran nyata tiap perintah (exit code apa adanya)

```
$ node scripts/uji-tangkap-layar-ts.mjs
...
  OK    hasil {} tidak dianggap sukses  [Tangkap layar GAGAL: window_capture tidak mengembalikan path]
  OK    berhasil=false dengan path terisi tetap GAGAL  [... berkas tidak lolos verifikasi byte ...]
  OK    captureWindow() tanpa fetch/url/telemetri  [bersih]

== 45/45 lulus ==
EXIT=0
```

```
$ node scripts/uji-tool-jendela.mjs
cek laporan tangkap layar            : 10/10

LULUS: 26 panel+bagian setelan terjangkau (6 panel + 20 setelan), 0 celah.
EXIT=0
```

**0 assertion diubah di `scripts/uji-tool-jendela.mjs`** — `git diff --stat -- scripts/uji-tool-jendela.mjs`
kosong. Assertion yang dulu gagal sudah lulus apa adanya karena bendera `:420` menyala; reproduksi
sebelum/sesudah (logika `:373-379` disalin tanpa mengubah berkasnya):

```
$ node -e "...rust=/window_capture|screen_capture/.test(lib.rs)..."
rustPunyaTangkap= true
SEBELUM (bendera false): benderaMenyala=false -> tidak sinkron: true
SESUDAH (bendera true) : benderaMenyala=true  -> tidak sinkron: false
```

```
$ node scripts/uji-runtime-jendela.mjs     # app hidup lewat CDP localhost:5173
laporanTangkapLayar() -> Tangkap layar siap (pintasan Ctrl+Alt+S, BELUM terpasang di ...)
tangkapJendela()      -> Tangkap layar GAGAL: window_capture menolak dipanggil
                         (Command window_capture not found). Keadaan: ...

LULUS: modul kendaliJendela dimuat aplikasi hidup; 10 id peta cocok dengan registry nyata; laporan keadaan terjawab.
EXIT=0
```

`uji-runtime-jendela.mjs:148` menuntut frasa `siap (pintasan`; kalimat "belum terpasang" karena itu
ditulis **di dalam** tanda kurung yang sama, bukan mengganti frasanya — kontrak harness lama tetap utuh.

```
$ npx tsc --noEmit
(no output)
EXIT_TSC=0        # 0 galat
$ npx tsc --noEmit 2>&1 | grep -E "kendaliJendela\.ts|lib/commands\.ts" | wc -l
0
```

Catatan apa adanya selama pengerjaan: dua kali `tsc` sempat **merah** (exit 2) karena lane lain masih di
tengah edit — galatnya berpindah dari `src/components/extensions/ExtensionsView.tsx` (TS6133/TS2304
`CATATAN_BAHASA`) ke `src/lib/commandRegistry.ts:646-647` (`semuaTema`) dan kembali hijau setelah kedua
berkas itu ditulis lagi (mtime 06:43:26 dan 06:43:36). **Tidak satu pun galat menyebut berkas saya**
(`grep -c "kendaliJendela\|commands.ts"` = 0 di tiap percobaan), dan `tsc` sekarang exit 0 tanpa keluaran.

```
$ cd src-tauri && cargo test --lib
test result: ok. 503 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.54s
EXIT=0
```

503 > 490 (lane lain menambah uji sesudah pengukuran 490) dan **0 gagal** — tidak turun. Tidak satu baris
pun `src-tauri/**` saya ubah (`git status` tidak menyentuh sana dari sisi saya).

## 5. BUTUH APP (jujur, belum terukur)

1. **Tangkapan nyata dari jendela Zephyr yang hidup.** Belum ada. Aplikasi yang sedang hidup
   (`zephyr.exe`, `src-tauri/target/debug`, dibangun **2026-10-14 01:10:27**) menolak perintahnya:
   `invoke('window_capture', { args: { target: 'window', savePath: null } })` →
   `Command window_capture not found`; `get_app_info` sendiri jalan
   (`{"version":"1.1.13","webview":"154.0.4258.62","profile":"debug"}`). Biner itu lebih tua daripada
   `src-tauri/src/tangkap_layar.rs` (06:11:36) dan `src-tauri/src/lib.rs` (06:34:14) — jadi perlu
   bangun-ulang + restart app dulu. Sampai itu terjadi, jalur sukses hanya terbukti di harness tiruan.
2. **Cabang mana yang menang untuk jendela WebView2/GPU** (BitBlt dari DC layar, sebagaimana terukur untuk
   jendela desktop, vs PrintWindow) — masih tidak diketahui; hanya bisa diukur dengan app hidup + biner baru.
3. **Clipping jendela yang tertutup minimize/occluded** dan hasil PNG nyata (dimensi/byte sebenarnya) —
   juga butuh app.
4. **Pintasan `Ctrl+Alt+S`** belum terpasang di `src/lib/shortcuts.ts` (grep 0 baris); jalur yang benar-benar
   hidup sekarang adalah tool `run_command({ capture: true, path?, copy? })`. Di luar item ini.

Catatan untuk pemilik `scripts/uji-runtime-jendela.mjs`: komentarnya masih menulis bahwa `tangkapJendela()`
"berhenti di penjaga bendera, tak invoke apa pun" — sesudah 6A tidak lagi begitu (skrip itu sudah saya
jalankan: exit 0, dan justru memberi bukti biner basi di atas). Satu baris komentar itu perlu diperbarui
oleh pemiliknya; saya tidak menyentuhnya.

## 6. Berkas

**Diubah:** `src/lib/zephyrTools/kendaliJendela.ts`, `src/lib/commands.ts` (hanya blok
`NAMA_PERINTAH_TANGKAP` + `HasilTangkapLayar` + `captureWindow`).
**Baru:** `scripts/uji-tangkap-layar-ts.mjs`, `docs/LAPORAN-TANGKAP-LAYAR-TS.md`.
**Tidak disentuh:** `src-tauri/**`, `scripts/uji-tool-jendela.mjs`, `scripts/uji-runtime-jendela.mjs`,
`src/lib/aiStore.ts`, `src/lib/subsetTugas.ts`, `src/lib/devBridge.ts`, `src/lib/zephyrTools/**` selain
`kendaliJendela.ts`, `src/components/**`, `src/lib/i18n-extra.ts`, dan seluruh skrip di daftar larangan.
