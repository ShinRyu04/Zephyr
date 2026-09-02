<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" alt="Zephyr" />

# Zephyr

**Code faster. Lighter. Yours.**

Code editor desktop Windows yang dibangun dari nol — bukan fork VS Code.

`v1.0.0` · Tauri 2 · React 18 · TypeScript · Rust

</div>

---

## Kenapa ini ada

Saya ingin editor yang terasa seperti VS Code tetapi tidak menyeret ratusan
megabyte Electron, dan yang bisa dikendalikan langsung oleh AI CLI yang sudah
saya pakai sehari-hari. Zephyr dibangun untuk itu: satu proses Rust yang
ramping, WebView2 bawaan Windows sebagai renderer, dan server MCP di port 9222
supaya Claude Code, Codex, Gemini CLI, atau opencode bisa membaca dan
mengendalikan jendelanya.

## Yang ada di dalamnya

**Editor** — CodeMirror 6, tab multi-file, deteksi encoding (UTF-8/BOM/
Windows-1252/UTF-16), file >4MB masuk mode ringan baca-saja, find & replace
regex dengan batas langkah supaya tidak menggantung UI.

**Terminal** — sampai 6 pane per tab lewat ConPTY: PowerShell, cmd, pwsh, bash,
WSL, Private Terminal yang tidak menulis riwayat ke disk, dan pane khusus untuk
AI agent CLI (opencode, Claude Code, Codex, Gemini, Copilot). Ada browser pane
dan "Split With Browser".

**Source Control** — status, diff, stage, commit, branch, push/pull/sync, log.
Diff file biner dilabeli, bukan byte mentah. Push saat remote lebih baru
menawarkan pull dulu.

**AI Panel** — chat streaming dengan tiga adapter (OpenAI, Anthropic, Gemini),
katalog model berlogo, API key per provider disimpan di sisi Rust dan tidak
pernah dikirim ke frontend.

**MCP Server :9222** — HTTP JSON-RPC dengan Bearer token. 20+ method untuk
membaca pane, menulis ke terminal, membuka/mengubah buffer editor, menjalankan
command palette. `editor_write` sengaja hanya menyentuh buffer, tidak disk.

**Settings** — 11 section, shortcut bisa di-remap dengan deteksi konflik, 6
tema yang mewarnai UI + editor + ANSI terminal dari satu sumber token, mode
penghemat RAM.

**Diagnostics** — RAM proses + WebView2, status per domain, self-test yang
benar-benar menulis file dan menyambung socket, export laporan JSON.

## Kondisi jujur

Yang **belum** ada di v1.0.0: SSH remote, IntelliSense/LSP, debugger, tasks
runner, minimap, global search ripgrep, local history, menu bar atas, panel
bawah. Marketplace ekstensi masih placeholder — ekstensi v1 hanya membaca
manifest, kode JS-nya tidak dijalankan (itu keputusan keamanan).

Installer tidak ditandatangani, jadi SmartScreen akan memperingatkan. Detail
lengkap ada di [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Bangun dari sumber

```bash
npm install
npm run tauri dev          # jalankan mode dev
npm run tauri build        # MSI + NSIS di src-tauri/target/release/bundle/
```

Butuh Rust stable, Node 20+, dan WebView2 Runtime (sudah ada di Windows 11).

Verifikasi per fase dijalankan terhadap app yang hidup lewat CDP:

```bash
npm run dev                # terminal 1
# terminal 2:
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" \
  src-tauri/target/debug/zephyr.exe
npm run verify:15          # terminal 3 — dan verify, verify:04..16
npm run stress             # skenario stres 16.4
```

## Lisensi & privasi

Sumber tertutup (repositori privat). Tidak ada telemetri, tidak ada analytics,
tidak ada crash reporting otomatis. Log dan settings hanya lokal di
`%APPDATA%\zephyr\`.

## Dokumen

- [CHANGELOG.md](CHANGELOG.md) — apa yang berubah per rilis
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — instalasi, kebutuhan, keterbatasan
- [BUGLOG.md](BUGLOG.md) — bug yang ditemukan & diperbaiki, dengan akar masalahnya
- [BUILD_REPORT.md](BUILD_REPORT.md) — ringkasan eksekusi build v1.0.0
