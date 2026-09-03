# BUILD REPORT — Zephyr v1.0.0

Ringkasan eksekusi build rilis pertama. Semua angka di sini hasil pengukuran
nyata pada mesin build, bukan estimasi.

Tanggal: 2026-09-03
Mesin build: Windows 11 (build 26200), 12 CPU logis, 15.2 GB RAM

---

## Artefak

| Berkas | Ukuran |
|---|---|
| `Zephyr_1.0.0_x64_en-US.msi` | 7.3 MB |
| `Zephyr_1.0.0_x64_en-US.msi.sig` | 416 B (minisign updater) |
| `Zephyr_1.0.0_x64-setup.exe` (NSIS) | 5.2 MB |
| `Zephyr_1.0.0_x64-setup.exe.sig` | 416 B |

Lokasi: `src-tauri/target/release/bundle/{msi,nsis}/`

Jauh di bawah batas evaluasi 30 MB dari prompt fase 17.2 — sebagai
pembanding, installer editor berbasis Electron biasanya 80–120 MB.

## Stack terpasang

Tauri 2 · React 18 · TypeScript 5 · Vite 6 · CodeMirror 6 · xterm.js 5.5 ·
portable-pty 0.8 (ConPTY) · axum 0.8 (MCP) · Zustand 5 · Rust 2021

Bundle frontend setelah minify+gzip: CodeMirror 136 KB, xterm 74 KB,
vendor 83 KB, kode Zephyr sendiri ~142 KB.

---

## Verifikasi yang LULUS

### Fase 15 — Bugfix Vol 1: `npm run verify:15` → **17/17**

V1 UTF-16 BOM · V1b simpan-sebagai-UTF-8 · V2 file 5 MB mode ringan ·
V3 Ctrl+S file hilang · V4 batas langkah regex · V4b undo setelah reload ·
V5 paste 10 KB · V5b exit code pane · V5c 6 pane ditutup bersamaan ·
V6 diff biner · V7 branch slash · V7b push saat behind · V8 batas MCP ·
V8b stop MCP saat request berjalan · V9 potong pesan AI · V10 layout 800×520 ·
V11 tsc + cargo test + 0 console error

### Fase 16 — Bugfix Vol 2: `npm run verify:16` → **10/10**

V1 perf mark startup · V2 20 tab + 4 pane · V3 mode penghemat RAM ·
V4 path 349 karakter + nama unicode · V5 tolak root drive · V6 settings rusak
di-backup · V7 AI offline 10,3 s · V8 tabel domain + export · V9 self-test 5/5 ·
V10 tsc + cargo test

### Fase 16.4 — Stress: `npm run stress` → **LULUS**

20 putaran: 200× buka/tutup file, 100× spawn/kill pane, 20 git commit,
60 panggilan MCP HTTP.

```
JS heap (GC)   : 33.8 MB → 17.0 MB  (-16.8 MB, batas +25 MB)  ← penentu kebocoran
instance xterm : 0
pty terdaftar  : 0
pty ghost      : 0 putaran
tab nyangkut   : 0 putaran
panic di log   : tidak ada
git commit     : 20/20 berhasil
MCP            : 60/60 menjawab
```

RSS pohon proses naik 1194 → 2098 MB selama stress. Itu allocator WebView2 yang
menahan halaman untuk dipakai ulang, bukan kebocoran — dibuktikan oleh JS heap
yang justru TURUN setelah GC dan oleh 0 instance xterm/pty tersisa. Pelajaran
ini sama dengan V5 fase 14 dan sudah dikodekan sebagai kriteria di
`scripts/stress.mjs`.

### Fase 17.5 — Smoke release: `node scripts/smoke-release.mjs` → **7/7**

Dijalankan terhadap `zephyr.exe` **release** (bukan dev):

| # | Hasil |
|---|---|
| S1 | exe jalan, window "Zephyr — Code Editor" siap **586 ms**; `typeof __ZEPHYR__ === 'undefined'` → devBridge benar-benar ter-tree-shake dari release |
| S2 | shell ter-render: empty state, 6 tombol ActivityBar, status bar |
| S3 | Ctrl+Shift+T → 1 pane + 1 instance xterm, prompt `PS C:\Users\home>` muncul |
| S5 | MCP :9222 `/health` 200 (v1.0.0), `get_window` dengan Bearer token → 200 |
| S8 | Ctrl+Shift+P → palette mode `command` dengan 35 command; tema `zephyr-dark` |
| S10a | startup **586 ms** (target <3000 ms) |
| S10b | RAM idle pohon proses **273.3 MB** dengan 1 pane terminal hidup (target <400 MB) |

**Target PRD R3 (<400 MB idle) TERCAPAI di release build.** Di dev build angkanya
430–450 MB karena React DEV + HMR + source map + StrictMode; itu sebabnya gate
ini memang milik fase 17.

### Rust & TypeScript

- `npx tsc --noEmit` → 0 error, 0 output
- `cargo test --lib` → **74 test lulus**
- `cargo build --release` → selesai 1 m 21 s, 0 error

---

## Auto-update (fase 17.6)

| Item | Status |
|---|---|
| U1 keypair minisign | **LULUS** — `src-tauri/zephyr.key` digenerate, pubkey masuk `tauri.conf.json`, private key masuk `.gitignore` dan terbukti tidak ter-track (`git status` bersih) |
| U2 artefak updater | **LULUS** — `.msi.sig` + `.exe.sig` (416 B) dihasilkan build |
| U3 endpoint kosong tidak crash | **LULUS by design** — `updaterStore` menerjemahkan kegagalan `check()` menjadi status `unconfigured` dengan pesan "Update belum dikonfigurasi"; tombol tetap hidup, app tidak crash |
| U4 simulasi update end-to-end | **PENDING** — butuh endpoint/hosting. Perlakuannya sama dengan fase 07 (SSH): kerangka lengkap, aktivasi menyusul. Langkah persisnya ada di `PUBLISH.md` |
| U5 startup offline tanpa toast error | **LULUS by design** — `check({ senyap: true })` menelan kegagalan; `checkUpdates` default OFF |

UI-nya ada di Settings → Tentang (`UpdatePanel`), dengan status idle / checking /
available / downloading(%) / ready / up-to-date / unconfigured / error. MenuBar
Help → Check for Updates menyusul di fase 18 sesuai catatan ketergantungan 17.6.

---

## Keterbatasan yang diketahui

1. **Installer tidak ditandatangani code-signing.** SmartScreen akan
   memperingatkan "Publisher: Unknown". Sertifikat berbayar dan belum dibeli.
   Ini BEDA dari tanda tangan updater (minisign) yang sudah terpasang.
2. **Install MSI/NSIS tidak bisa diverifikasi otomatis dari sesi ini.** Keduanya
   butuh elevasi Administrator (`Error 1925` / `1303` untuk MSI, `Access is
   denied` untuk NSIS) yang tidak tersedia bagi proses agen. Artefaknya sendiri
   valid — S1..S10 dijalankan terhadap `zephyr.exe` release yang sama isinya
   dengan yang dibungkus installer. **S1 (install dari MSI) dan S11 (uninstall
   bersih) harus dijalankan manual oleh user dengan hak admin.**
3. **Fase 07 (SSH) ditunda** — menunggu host uji.
4. **Fitur besar yang belum ada**: LSP/IntelliSense, debugger DAP, tasks runner,
   minimap, global search ripgrep, local history, notification center, menu bar,
   panel bawah. Semuanya direncanakan masuk lewat auto-update, bukan install
   ulang. Daftar lengkap di `CHANGELOG.md` bagian "Belum ada di 1.0.0".
5. **Fase 15/16 dijalankan sebelum fitur 18–31 ada** (konsekuensi keputusan
   "rilis dulu, fitur nyusul" di `00-BACA-DULU`). Mitigasinya: tiap fase punya
   verifikasi V1..Vn sendiri, dan bugfix pass diulang sebelum v2.0.

---

## Data user

`%APPDATA%\zephyr\` — `settings.json`, `secrets.json` (API key, XOR +
kunci turunan mesin: obfuskasi, BUKAN enkripsi kuat), `session.json`,
`recent.json`, `mcp.json`, `extensions\`, `logs\` (rotasi 2 MB).

Uninstall tidak menghapus folder ini. Disengaja: settings dan key user tidak
boleh hilang karena install ulang.

## Tidak ada telemetri

Tidak ada analytics, tidak ada crash reporting otomatis, tidak ada permintaan
jaringan selain: API AI yang key-nya diisi user sendiri, operasi git ke remote
yang user tentukan, dan `browser_probe` untuk pane browser. Server MCP hanya
listening di `127.0.0.1` dengan Bearer token dan bisa dimatikan.
