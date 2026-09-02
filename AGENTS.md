# AGENTS.md — Panduan Agen AI untuk Zephyr

Panduan ini untuk agen AI (Hermes, Claude Code, Codex, opencode, dll)
yang bekerja/menulis kode di repositori `D:\Zephyr`.

## 1. Apa ini

Zephyr adalah code editor desktop (Tauri 2 + React + TS) yang dibangun
dari nol: ringan, lengkap, dengan terminal multi-pane (shell/private/
AI-agent), SSH, settings lengkap, Source Control, AI panel (multi-model
dengan logo), dan **MCP server port 9222** sehingga AI CLI luar bisa
mengontrol jendela.

## 2. Cara kerja

- Urutan build dipecah menjadi fases 01–17. JALANKAN URUT; jangan lompat.
- **HANYA FASE 07 (SSH) yang DITUNDA** atas keputusan user: belum punya
  hosting untuk diuji, jadi fitur ini menyusul nanti. Urutan efektif:
  06 → 08 → 09 → 10 → **11 (MCP 9222 TETAP DIKERJAKAN)** → 12 → dst.
  Kontrak command SSH tetap tercatat di `ARCHITECTURE.md` bila nanti dibuka.
- Prompt tiap fase ada di: `C:\Users\home\OneDrive\Desktop\Ai\Zephyr\`
  (`01-` .. `17-`), dimulai dari `00-BACA-DULU-URUTAN-EKSEKUSI.txt`.
- Satu fase = satu misi: implementasi → verifikasi → commit → lanjut.
- PRD lengkap: `Zephyr PRD.md`; ringkasan build: `Zephyr Build Prompt.txt`.
- **Kontrak nama (sumber kebenaran):** `ARCHITECTURE.md` — daftar final semua
  Tauri command, event, bentuk Zustand store, layout `%APPDATA%\zephyr\`, dan
  batas keamanan. Kalau prompt fase menyebut nama berbeda, ikuti `ARCHITECTURE.md`.

## 3. Perintah penting

```powershell
npm install
npx tsc --noEmit          # PASTIKAN 0 error sebelum commit
npm run tauri dev         # dev
npm run tauri build       # release (MSI + NSIS)
cd src-tauri; cargo test --lib   # unit test Rust (encoding, settings)
```

### Verifikasi otomatis (V1..Vn) lewat CDP

Verifikasi fase tidak boleh "dianggap lulus" — jalankan app lalu buktikan
dari DOM/state yang hidup:

```bash
# 1. terminal A: dev server
npm run dev

# 2. terminal B: app + port debug WebView2
cd src-tauri
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" ./target/debug/zephyr.exe

# 3. terminal C: jalankan seluruh verifikasi
npm run verify           # fase 02+03 -> "== 26/26 lulus =="
npm run verify:04        # fase 04    -> "== 17/17 lulus =="
npm run verify:05        # fase 05    -> "== 12/12 lulus ==" (butuh ~90s)
npm run verify:06        # fase 06    -> "== 12/12 lulus ==" (butuh ~2 menit)
npm run verify:08        # fase 08    -> "== 15/15 lulus =="
npm run verify:09        # fase 09    -> "== 10/10 lulus ==" (butuh ~2 menit)
npm run soak             # stabilitas 180s (V11 fase 04)
```

`scripts/verify*.mjs` menempel via CDP dan memeriksa DOM + store nyata.
`scripts/probe.mjs <port> "<expr>" [--reload]` untuk cek satu ekspresi.
Jembatan `window.__ZEPHYR__` / `__ZEPHYR_EX__` hanya ada di mode dev
(`src/lib/devBridge.ts`), di-tree-shake dari build release.

Catatan menulis verifikasi: `Runtime.evaluate` dengan `awaitPromise:true`
sering gagal di WebView2 ("Promise was collected") — pakai helper
`runAsync()` yang menyimpan promise di `window` lalu polling. Untuk mencari
baris tree jangan cocokkan `textContent` (ikut glyph SVG ikon); pakai
atribut `title` yang berisi path lengkap.

Khusus terminal (fase 05):
- `navigator.clipboard` **selalu gagal** di WebView2 saat dokumen tidak
  fokus (`NotAllowedError`). Copy/paste memakai plugin Tauri
  `clipboard-manager` lewat `src/lib/clipboard.ts` — verifikasi juga harus
  lewat jalur itu (`__ZEPHYR_PTY__.copy/paste/clipRead`).
- Ctrl+C: `AttachConsole` + `GenerateConsoleCtrlEvent` MEMATIKAN proses
  Zephyr sendiri (sudah dibuktikan). Jangan dicoba lagi; `pty_interrupt`
  mengirim `\x03` lalu membunuh pohon proses turunan shell.
- Listener `pty-output` harus dipasang sekali per proses (guard modul, bukan
  hanya cleanup effect) — StrictMode dev memasangnya dua kali dan setiap byte
  output tampil dobel.
- V2 warna: jangan hitung semua span `xterm-fg-*` (PSReadLine mewarnai baris
  input juga). Cocokkan span yang isinya tepat sama dengan penanda output.

Khusus multi-pane (fase 06):
- Port **8080 TIDAK bisa dipakai** di mesin ini (`WinError 10013` — masuk
  excluded port range Hyper-V/WinNAT). Server uji browser pane pakai 8099.
- Isi DOM `<iframe>` pane browser TIDAK bisa dibaca dari luar (sandbox =
  origin lain). Bukti yang sah: `data-loads` (event `load`) + log request di
  server uji.
- Store terminal sekarang `terminalTabs[].panes[]` (bukan `sessions[]`):
  `addPane/closePane/killPane/allPanes/findPane`. `pane.id` = id sesi PTY.
- Batas pane dari `settings.agents.maxPanes` (default 6) — verifikasi yang
  membuat banyak pane harus `closeTab` dulu, kalau tidak kena toast batas.

## 4. Konvensi

- IPC: semua panggilan Rust lewat `lib/commands.ts` (`invoke`). Jangan
  panggil command Tauri langsung dari komponen.
- Data user: `%APPDATA%\zephyr\` via plugin store. Jangan hardcode.
- Warna UI: WAJIB dari CSS variables di `src/styles/*.css` — dilarang
  hex hardcoded di komponen (kecuali token khusus).
- API key: lewat Rust `secrets`; frontend hanya lihat `hasKey`/mask.
- Git: `git` CLI (porcelain); semaphore 1 proses git paralel.
- PTY: `portable-pty` (atau `conpty` fallback). Konsisten antar fase.
- Keamanan path: operasi tulis di luar workspace ditolak.

## 5. Kualitas (Definition of Done per fase)

- `npx tsc --noEmit` 0 error.
- App dev jalan; verifikasi per fase benar-benar dijalankan & lulus.
- Tidak merusak fitur fase sebelumnya.
- Commit rapi: `zephyr: fase NN <nama>`.
- Akhir: build release v1.0.0 + `BUILD_REPORT.md`.

## 6. Fitur kunci yang harus dijaga ketat

- **MCP 9222**: server HTTP JSON-RPC, auth Bearer; `editor_write` hanya
  mengubah buffer (bukan disk). Fitur ini fitur unggulan — jangan rusak.
- **Terminal agent pane**: sampai 6 pane; start commands di Settings.
- **Private terminal**: spawn bersih; scrollback dihapus saat close.
- **AI panel**: adapter 3 format (OpenAI/Anthropic/Gemini), logo model.
- **Settings → Models**: API key per provider; test connection.

## 7. Larangan

- Jangan push/commit tanpa diminta user.
- Jangan tambah telemetri eksternal.
- Jangan buka port selain 9222 (MCP) tanpa persetujuan.
- Jangan pernah menampilkan/menulis API key ke log.

Baca PRD dulu bila ragu terhadap keputusan arsitektur.

## 8. Jebakan fase 08 (Settings) — sudah kena, jangan diulang

- **Nav 11 section + tombol "Reset Semua" ada di SIDEBAR KIRI**
  (`components/settings/SettingsNav.tsx`), BUKAN di dalam `SettingsPage`.
  Pernah dibuat di dua tempat → daftar section tampil dobel di layar.
- **Tombol ActivityBar Settings harus toggle** seperti ikon lain: klik = buka,
  klik lagi saat aktif = tutup panel + halaman.
- **`deep_merge` di `settings.rs` memakai `null` = HAPUS key** (RFC 7386).
  Tombol "reset per item" (shortcut / start command) WAJIB mengirim
  `{ shortcuts: { 'x': null } }`; mengirim objek tanpa key itu tidak
  menghapus apa pun karena patch di-merge, bukan menimpa.
- **Mengubah `input.value` dari CDP tidak memicu React `onChange`.** Harness
  `verify08.mjs` memakai helper `setNativeValue()` (setter asli prototipe +
  event input & change). Tanpa itu semua uji "isi field lalu cek disk" gagal
  padahal aplikasinya benar.
- **`get_public_models` selalu mengembalikan 6 provider katalog**, walau
  `secrets.json` kosong — supaya frontend dapat `hasKey:false` alih-alih
  entri yang hilang (`undefined`).
- **Flag `capturing` (perekam shortcut) mematikan SEMUA shortcut global.**
  `ShortcutsSection` wajib membersihkannya saat unmount, kalau tidak flag
  nyangkut dan seluruh shortcut app mati sampai reload.
- **Harness fase 02/03 memeriksa empty-state editor**, jadi `verify08.mjs`
  harus menutup halaman Settings di akhir (`setSettingsOpen(false)`) —
  kalau tidak `F03-V0` gagal karena editor tertutup halaman Settings.
- **API key**: `%APPDATA%\zephyr\secrets.json`, XOR + kunci BLAKE3 dari
  MachineGuid+host+user. Ini OBFUSKASI, bukan proteksi dari orang yang sudah
  memegang akun Windows. `reset_settings` TIDAK menghapus file ini.

## 9. Jebakan fase 09 (AI panel) — sudah kena, jangan diulang

- **Gemini WAJIB `?alt=sse`.** Tanpa itu `:streamGenerateContent` membalas
  JSON array yang di-pretty-print dan dipecah sembarang antar paket TCP —
  satu objek tersebar di banyak baris, jadi parsing per baris menghasilkan
  0 token dan pesan "Provider tidak mengirim teks apa pun".
- **Selector zustand v5 tidak boleh membuat objek/array baru.**
  `useTerminal((s) => s.terminalTabs.flatMap(...))` di `AiPanel` langsung
  memicu `Maximum update depth exceeded` (hasil selector dibandingkan `===`).
  Ambil primitif: `reduce((n,t) => n + t.panes.length, 0)`.
- **Listener `ai-chunk` butuh guard modul** (`aiListenerBound` di App.tsx),
  sama seperti `pty-output`: StrictMode dev memasang dua kali → setiap token
  tampil dobel.
- **Cancel harus menyaring chunk yang sudah di jalan.** `ai_cancel` hanya
  menyetel flag; Rust bisa sudah mengirim beberapa potongan. `aiStore` punya
  `Set` id yang dibatalkan dan mengabaikan chunk-nya, kalau tidak teks masih
  bertambah setelah user menekan Stop.
- **`ai_chat` mengembalikan `()` lalu streaming lewat event.** Pesan error
  dari `invoke` (mis. belum ada key) tetap harus diubah jadi bubble error —
  lihat `send()` yang memanggil `onChunk` manual.
- **Harness verify09 memakai mock provider** (`scripts/mock-ai.mjs`, port
  8098, versi dicek lewat `/__version`) supaya streaming/adapter/cancel
  diuji lewat jalur Rust asli tanpa kuota. Mock versi lama yang nyangkut di
  port pernah membuat V3–V5 gagal padahal aplikasinya benar — karena itu
  harness menolak versi yang tidak cocok.
- **Toast AI hidup 3.2 detik.** Harness yang membaca toast sebagai "kirim
  diblokir" harus membersihkannya (`setToast(null)`) sebelum pengiriman
  berikutnya, kalau tidak uji berikutnya lanjut sebelum jawaban datang.