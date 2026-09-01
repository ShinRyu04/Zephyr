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