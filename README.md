# Zephyr

Code faster. Lighter. Yours.

Zephyr adalah **code editor desktop buatan sendiri** — nyaman seperti
VS Code, tapi lebih lengkap dan lebih ringan (RAM idle < 400 MB,
startup < 3 detik). Dibangun dari nol dengan **Tauri 2 + React**.

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
- **AI Panel** multi-provider dengan **logo model yang sesuai**
  (Gemini, OpenAI, Anthropic, DeepSeek, opencode, custom) + API key
  per model + streaming chat + lampirkan file aktif.
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