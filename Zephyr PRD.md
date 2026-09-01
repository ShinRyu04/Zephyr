# ZEPHYR — Product Requirements Document (PRD)

**Versi:** 1.0  
**Status:** Approved  
**Tanggal:** 2026-09-02  
**Repositori:** `D:\Zephyr`  
**Stack:** Tauri 2 + React 18 + TypeScript + Vite 6 + Tailwind 4

> Zephyr adalah code editor desktop pribadi: nyaman seperti VS Code,
> tapi **lebih lengkap dan lebih ringan** (target RAM idle < 400MB,
> startup < 3 detik). Bukan fork — dibangun dari nol. Semua data lokal.

---

## 1. Latar Belakang

User ingin aplikasi coding sendiri yang bisa dipakai seperti VS Code,
namun tanpa bloat dan dengan RAM rendah. Dari pengalaman memakai TEDI,
fitur yang paling diinginkan adalah:

1. **Terminal beragam** — Terminal biasa, Private Terminal, dan
   **Terminal AI Agents** (opencode, Claude CLI, Codex CLI, Pi,
   GitHub Copilot, Grok CLI, Gemini CLI, Browser, Split With Browser).
   Sampai **6 pane dalam satu tab**, urutan sesuai pilihan user.
   Start commands ada di **Settings → Agents**.
2. **Kontrol dari AI CLI** — register MCP server agar agent bisa
   membaca panes/terminals/editors/settings/extensions dan
   *mengemudikan* jendela Zephyr. Dengan tombol untuk mengaktifkan.
   Ada di port **9222** (mirip TEDI).
3. **SSH connections**.
4. **Settings lengkap** — General, Code Editor, Theme, Shortcuts,
   Models, Agents, Extensions, Source Control, dll.
5. **Source Control** (git).
6. **AI Agent** — masukkan API key di settings sesuai model, dengan
   **logo model AI yang sesuai**.
7. **Ringan** — jangan makan RAM banyak.

---

## 2. Persona & Use Case

- **Primary:** Pengguna power Windows yang sering coding full-stack,
  menjalankan beberapa agent AI CLI bersamaan, dan ingin satu jendela
  yang mengendalikan semuanya.
- **Use cases:**
  - Buka folder project → edit → terminal di bawah → git commit.
  - Jalankan 2 instans opencode + 1 Claude CLI bersamaan dalam satu tab
    (masing-masing pane), bandingkan hasil.
  - Perintahkan agent luar (Claude Code / Codex / opencode) mengontrol
    Zephyr lewat MCP: buka file, ketik di terminal, ambil screenshot pane.
  - Chat dengan model pilihan (Gemini/Claude/GPT/DeepSeek) tanpa keluar
    dari editor; lampirkan file aktif sebagai konteks.
  - SSH ke server, kelola code di remote via terminal pane.

---

## 3. Non-Goals (v1.0)

- Bukan plugin host penuh (ekstensi v1 = manifest-only, tanpa eksekusi JS).
- Bukan marketplace publik di v1.0.
- Bukan IntelliSense tingkat VS Code (hanya syntax highlight + autocomplete dasar).
- Bukan IDE remote penuh (SSH hanya terminal; SFTP "coming soon").
- Tidak ada telemetri/vendor — 100% lokal.

---

## 4. Fitur Fungsional

### 4.1 Editor
- Buka/simpan UTF-8, deteksi ANSI; UTF-16 read-only dengan pesan.
- Tab multi, unsaved indicator, restore session opsional.
- CodeMirror 6: syntax highlight (ts/tsx/js/jsx/json/html/css/md/py/rs/
  go/java/c/cpp/yaml/toml/sql/sh/ini/xml), line numbers, bracket match,
  indent guide, autocomplete.
- Find & Replace (single + in workspace), regex toggle, multi-cursor dasar.
- Word wrap, minimap (off default), format on save (JSON built-in).
- File besar >4MB → mode ringan/read-only warning.

### 4.2 Explorer & Workspace
- File tree dengan icon per ekstensi, drag-rename, context menu
  (new file/folder/rename/delete/reveal/copy path), watcher real-time,
  recent workspace (4), search in workspace (ignore node_modules/.git/
  .venv/dist/target), jump-to-line.

### 4.3 Terminal (keseluruhan paling penting)
- Shell: PowerShell default, bisa cmd/bash/wsl.
- **Private Terminal** (ikon incognito): spawn bersih, scrollback dihapus
  saat close; dokumentasi jujur soal history.
- **AI Agent Terminal**: popover deteksi CLI (opencode/claude/codex/
  gemini/grok/pi/gh/cursor) → pane spawn agent; klik lagi = duplikat;
  sampai **6 pane per tab**; reorder via drag; start commands kustom di
  Settings → Agents; opsi attach file aktif.
- **Browser Pane** (Split With Browser): iframe/toolbar mini (URL,
  back/forward/reload), tombol buka eksternal bila situs menolak embed.
- PTY via Rust (`portable-pty`/ConPTY); batching output per frame.

### 4.4 SSH
- Buat/simpan konfigurasi host (key/password/save-encrypted opsional).
- Connect → pane terminal SSH (OpenSSH client), status, disconnect,
  reconnect; password diketik di pane, tidak disimpan plaintext.

### 4.5 Settings (lengkap)
General, Code Editor, Theme (6 tema), Shortcuts (editable + validasi
konflik), Models (API key + logo model + test connection), Agents
(CLI detection, max panes, start commands), Extensions, Source Control,
MCP (port/token/tulis-ke-CLI), SSH, About/Diagnostics. Reset all.

### 4.6 AI Panel
- Chat streaming (SSE), markdown render, adapter OpenAI/Anthropic/Gemini,
  dropdown model dengan **logo brand** (gemini/openai/anthropic/deepseek/
  opencode/custom), attach file aktif (maks 12KB), history 200 msg,
  tombol "Jalankan di Terminal", cancel, error mapping (401/429/404).

### 4.7 Source Control
- git init/status/stage/commit/push/pull/branch/create/delete/discard
  (konfirmasi), diff viewer, branch di status bar, sync indicator.
- Git via CLI `git` (porcelain), semaphore 1-proses.

### 4.8 MCP Server (fitur unggulan) — port 9222
- HTTP JSON-RPC 2.0, auth Bearer token, `/health` publik.
- Tools: list_panes/list_editors/list_terminals/get_settings/
  get_setting/list_extensions/get_window/terminal_write/terminal_key/
  pane_close/pane_new/editor_open/editor_close/editor_write/
  editor_insert/run_command/screenshot_pane/set_setting.
- Tombol on/off, status hijau/merah, token copyable.
- **Tulis ke CLI**: menggabung entri `zephyr` ke konfigurasi MCP gab.
  Claude Code (`.claude.json`/`.mcp.json`), Codex (`config.toml`),
  Gemini (`settings.json`), opencode (`opencode.json`), Copilot CLI
  (`mcp-config.json`), Cursor (`mcp.json`), Startup `.mcp.json`.

### 4.9 Command Palette + Shortcut
- Ctrl+Shift+P palette (fuzzy, virtual list, grup ikon), Ctrl+P open file,
  semua shortcut editor standar + terminal/AI/git.

### 4.10 Theme & Extensions
- 6 tema (Dark/Light/Nord/Tokyo/Gruvbox/One Dark), CSS vars terpusat,
  editor + shell sinkron live.
- Ekstensi v1 manifest-only (kontribusi command ke palette),
  enable/disable, marketplace "coming soon".

---

## 5. Requirement Non-Fungsional

| Item | Target |
|---|---|
| Startup (SSD, release) | < 3 detik |
| RAM idle (2 tab + 1 pane) | < 400 MB |
| RAM (20 tab + 4 pane) | < 500 MB |
| CPU (2 pane ping) | < 30% satu core |
| Build sukses | `tsc --noEmit` 0 error; `cargo build --release` OK |
| Stabilitas | no crash 24 jam stress |
| Instalasi | MSI + NSIS portable/installer, unsigned (catatan) |
| Keamanan | path di luar workspace ditolak; key tak ke frontend; force-push tidak tersedia |

---

## 6. Arsitektur

- **Frontend (React)**: semua IPC via `lib/commands.ts` → Tauri `invoke`.
- **Backend (Rust)**: fs, pty (`portable-pty`), git (`git` CLI), ssh
  (`ssh.exe`), mcp (axum HTTP), settings (`tauri-plugin-store`).
- **State**: Zustand di frontend; data user di `%APPDATA%\zephyr\`
  (`settings.json`, `secrets.json`, `recent.json`, `session.json`,
  `mcp.json`, `logs/`).
- **Keamanan kunci**: key API di Rust (secrets), frontend hanya menerima
  `hasKey` + mask. Path ops divalidasi canonical.

Struktur tree penuh — lihat **Zephyr Build Prompt.txt** (dokumen eksekusi).

---

## 7. Roadmap

- **v1.0** (fase ini): semua di atas.
- **v1.1**: Marketplace real, ekstensi ber-JS di sandbox, SFTP, IntelliSense
  lebih dalam (LSP), updater endpoint aktif, fitur remote.
- **v1.2**: multiplayer penunjuk/kursor kolaborasi (opsional).

---

## 8. Kriteria Rilis (Definition of Done)

1. Seluruh verifikasi fase 01–17 lulus (lihat Build Prompt).
2. Full smoke S1–S11 hijau pada build release.
3. `BUILD_REPORT.md` dibuat.
4. Tag git `v1.0.0`.
5. Dokumentasi user (README + CHANGELOG + RELEASE_NOTES) ada.