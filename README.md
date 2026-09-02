<div align="center">
  <img src="src-tauri/icons/icon.png" width="120" height="120" alt="Zephyr" />
  <h1>Zephyr</h1>
  <p><em>Code faster. Lighter. Yours.</em></p>
  <p><strong>Satu jendela ringan: editor, terminal multi-pane, AI agent, git, dan MCP server — tanpa Electron.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/runtime-no%20Electron-brightgreen" alt="no Electron" />
    <img src="https://img.shields.io/badge/telemetry-none-blue" alt="no telemetry" />
    <img src="https://img.shields.io/badge/RAM%20idle-%3C400MB-orange" alt="RAM" />
  </p>
</div>

---

## Apa itu Zephyr?

Zephyr adalah **code editor desktop buatan sendiri** — nyaman seperti
VS Code, tapi lebih lengkap dan lebih ringan (RAM idle < 400 MB,
startup < 3 detik). Dibangun dari nol dengan **Tauri 2 + React**: inti Rust
memegang semua resource OS, UI-nya satu webview — tanpa runtime Node dan
tanpa Chromium yang dibundel. **Tanpa telemetri**; API key disimpan Rust di
`%APPDATA%\zephyr\secrets.json`, tidak pernah dikirim ke UI.

## Fitur Utama

- **Editor modern**: tab, syntax highlight, find & replace, multi-cursor,
  autocomplete, restore session.
- **Explorer & Search** di workspace dengan file watcher real-time.
- **Terminal multi-pane** (sampai 6 pane per tab):
  - Shell biasa & **Private Terminal**
  - **AI Agent Terminal**: spawn opencode / Claude CLI / Codex / Gemini
    CLI / Grok / Pi / GitHub Copilot langsung di dalam pane; klik lagi
    untuk duplikat.
  - **Browser Pane** (Split With Browser).
- **SSH Connections** untuk remote work.
- **Settings lengkap**: General, Code Editor, Theme, Shortcuts, Models,
  Agents, Extensions, Source Control, MCP, About.
- **AI Panel** multi-provider dengan **logo brand yang sesuai**
  (Gemini, OpenAI, Anthropic, DeepSeek, opencode, custom): chat streaming
  kata-per-kata, render markdown + blok kode, lampirkan file aktif sebagai
  konteks (maks 12KB), tombol **Jalankan di Terminal** untuk jawaban yang
  memuat perintah shell (perintah berisiko wajib dikonfirmasi), Stop di
  tengah jawaban, dan riwayat chat yang pulih setelah app ditutup.
  API key per provider disimpan Rust — frontend hanya melihat mask.
- **Source Control** (git): status, diff, commit, branch, push/pull.
- **MCP Server port 9222**: AI CLI luar (Claude Code, Codex, Gemini CLI,
  opencode, Copilot CLI, Cursor) bisa **membaca dan mengendalikan**
  Zephyr — panes, terminal, editor, settings, extensions, screenshot,
  run command. Ada tombol on/off.
- **6 tema** (Dark/Light/Nord/Tokyo Night/Gruvbox/One Dark).

## Persyaratan

- Windows 10 22H2+ (64-bit)
- WebView2 Runtime (bawaan Windows 11 / update Windows 10)
- `git` (untuk Source Control)
- OpenSSH Client (opsional, untuk SSH)
- CLI agent (opencode/Claude/etc.) — opsional, untuk Agent Terminal

## Install

Rilis v1.0.0 menyediakan:
- `Zephyr_1.0.0_x64_en-US.msi` — installer MSI
- `Zephyr_1.0.0_x64-setup.exe` — installer NSIS (setup/portable)

## Build dari sumber

```powershell
npm install
npm run tauri dev     # mode pengembangan
npm run tauri build   # rilis (MSI + NSIS)
```

Data Anda tersimpan aman di `%APPDATA%\zephyr\`.

## Catatan: Private Terminal (jujur, apa adanya)

Private Terminal bukan sandbox dan bukan sesi user lain. Yang benar-benar
dilakukan Zephyr:

- shell dijalankan dengan `-NoProfile` (profil PowerShell Anda tidak dimuat),
- `Set-PSReadLineOption -HistorySaveStyle SaveNothing` — perintah yang Anda
  ketik **tidak ditulis** ke `ConsoleHost_history.txt` milik akun Anda
  (diverifikasi otomatis di `npm run verify:05`, V6a),
- env `ZEPHYR_PRIVATE=1` supaya skrip Anda bisa mendeteksi mode ini,
- scrollback pane dihapus dari memori saat tab ditutup.

Yang **tidak** dilakukan: mengganti user Windows, mengisolasi filesystem,
atau menyembunyikan proses. Perintah tetap berjalan sebagai akun Anda dan
tetap bisa terlihat di Task Manager / event log sistem. Untuk sesi yang
benar-benar bersih, gunakan akun Windows terpisah.

## Konfigurasi AI

**Settings → Model AI**, pilih provider lalu tempel API key. Key ditulis Rust
ke `%APPDATA%\zephyr\secrets.json` (XOR + kunci turunan mesin), TIDAK ke
`settings.json` dan tidak pernah dikirim ke UI — frontend hanya menerima
`hasKey` + mask `sk-…4f2a`. Katalog provider & model: `src/lib/modelCatalog.tsx`.

Zephyr memakai tiga adapter di sisi Rust, jadi format request tiap provider
benar apa adanya: OpenAI-compatible (`/chat/completions` + SSE) untuk
OpenAI/DeepSeek/local/custom, Anthropic Messages API (`x-api-key` +
`anthropic-version`), dan Gemini (`:streamGenerateContent?alt=sse`).

**Mau sepenuhnya lokal?** Pilih provider *Lokal (opencode / loopback)* dan
arahkan base URL ke server OpenAI-compatible milikmu (LM Studio, Ollama,
llama.cpp, vLLM) — mis. `http://127.0.0.1:1234/v1`.

## Dokumentasi

- PRD: `Zephyr PRD.md`
- Panduan agen AI: `AGENTS.md`
- Buglog: `BUGLOG.md` (setelah fase 15)
- Laporan build: `BUILD_REPORT.md` (setelah fase 17)
- `CHANGELOG.md` · `RELEASE_NOTES.md`

## Roadmap

v1.1: Marketplace ekstensi, LSP/IntelliSense lebih dalam, SFTP, updater.
v1.2: Kolaborasi (opsional).

---

Dibuat untuk dipakai sendiri, dengan bantuan AI. MIT License.<br>
Logo *Zephyr* — angin yang ringan, tapi kencang. 💨