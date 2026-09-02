# Changelog — Zephyr

Semua perubahan penting per rilis. Format mengikuti semangat
[Keep a Changelog](https://keepachangelog.com/); versi memakai SemVer.

## [1.0.0] — 2026-09-03

Rilis pertama. Editor kode desktop Windows yang dibangun dari nol (bukan fork
VS Code): Tauri 2 + React 18 + TypeScript, CodeMirror 6 untuk editor, xterm.js
+ ConPTY untuk terminal, dan backend Rust untuk semua operasi berat.

### Editor
- Tab multi-file, buka/simpan, Save As, drag-reorder tab, restore sesi.
- Deteksi encoding otomatis: UTF-8, UTF-8 BOM, Windows-1252, UTF-16 LE/BE.
  File UTF-16 dibuka baca-saja dengan tombol "Simpan sebagai UTF-8".
- File >4MB masuk mode ringan baca-saja (tanpa parser & ekstensi berat) supaya
  tidak membekukan UI.
- Find & Replace di dalam editor: regex, case-sensitive, hitung hasil, dengan
  batas 20.000 langkah agar pola seperti `a*` tidak menggantung UI.
- Ctrl+S saat file sudah lenyap dari disk menanyakan "buat baru?" alih-alih
  membuatnya kembali diam-diam.
- Deteksi bahasa 21 tipe file, breadcrumbs, indikator Ln/Col & encoding.

### Explorer & Search
- File tree dengan lazy-load, rename/hapus/buat, multi-select, context menu.
- Watcher perubahan dari luar app: tree ikut ter-refresh, tab yang tidak dirty
  dibaca ulang.
- Search lintas file dengan glob, regex, dan replace-in-file.
- Quick Open (Ctrl+P) dengan pencarian fuzzy.

### Terminal
- Multi-pane sampai 6 pane per tab: shell, cmd, PowerShell 7, bash, WSL.
- Private Terminal: PSReadLine `SaveNothing` + `HISTFILE`/`HISTSIZE` dikosongkan
  untuk shell POSIX; scrollback dibuang saat pane ditutup.
- Terminal AI Agent: opencode, Claude Code, Codex CLI, Gemini CLI, GitHub
  Copilot CLI, Grok, Pi — perintah start bisa diatur di Settings.
- Browser pane + "Split With Browser", dengan pemeriksaan header
  X-Frame-Options di Rust sehingga alasan gagal embed ditampilkan sebenarnya.
- Copy/paste lewat plugin clipboard (paste dipecah 4KB agar tidak korup),
  Ctrl+C yang menghentikan program tanpa mematikan Zephyr, exit code proses
  ditampilkan sebagai `[process exited code N]`.

### Source Control
- Status, diff, stage/unstage, commit, discard, branch (buat/checkout/hapus),
  push/pull/fetch/sync, log.
- Diff file biner dilabeli beserta ukurannya, bukan byte mentah.
- Push saat remote lebih baru menawarkan "pull dulu" alih-alih error git mentah.
- Login GitHub: OAuth device flow atau PAT; token disimpan terenkripsi.

### AI Panel
- Chat streaming dengan tiga format adapter: OpenAI, Anthropic, Gemini.
- Katalog model berlogo (Gemini, Claude, GPT, DeepSeek, Grok, dll), API key
  per provider disimpan di Rust dan tidak pernah dikirim ke frontend.
- Lampirkan file aktif (maks 12KB), jalankan blok kode ke terminal dengan
  konfirmasi untuk perintah berisiko, cancel streaming yang bersih.
- Pesan >8KB dipotong dengan catatan yang terlihat.

### MCP Server (port 9222)
- Server HTTP JSON-RPC dengan auth Bearer token; AI CLI luar bisa membaca dan
  mengendalikan jendela Zephyr.
- 20+ method: list_panes, terminal_write/key, editor_open/write/insert/close,
  pane_new/close, run_command, get_settings, set_setting, screenshot_pane, dll.
- `editor_write` HANYA mengubah buffer, tidak menulis ke disk.
- Batas payload: 1MB untuk editor, 64KB untuk terminal.
- Menulis konfigurasi otomatis ke Claude Code, Codex, Gemini CLI, opencode,
  Copilot CLI, Cursor, dan `.mcp.json` startup.

### Settings
- 11 section: General, Code Editor, Theme, Shortcuts, Models, Agents,
  Extensions, Source Control, MCP, SSH, Tentang.
- Shortcut bisa di-remap dengan perekam tombol dan deteksi konflik.
- Mode penghemat RAM: smooth scroll off, minimap dipaksa off, batas tab
  termuat 8.
- Bahasa UI Indonesia/Inggris, zoom 50–200%, tema mengikuti sistem.

### Tema & Ekstensi
- 6 tema: Zephyr Dark, Zephyr Light, Nord, Tokyo Night, Gruvbox, One Dark Pro.
  Seluruh UI + editor + terminal ANSI ikut satu sumber token CSS.
- Ekstensi v1 manifest-only: `contributes.commands` didaftarkan ke Command
  Palette. Kode JS ekstensi TIDAK dieksekusi — keputusan keamanan, bukan
  keterbatasan.

### Command Palette
- Ctrl+Shift+P untuk perintah, Ctrl+P untuk file; hasil ter-virtualisasi
  sehingga 5.000 file tetap ringan.

### Diagnostics & keandalan
- Panel Diagnostics: OS, CPU, RAM mesin, RAM proses + WebView2, uptime, port
  MCP, file log, status per domain, penanda perf, penghitung operasi.
- Self-test cepat: tulis/baca file, resolve shell, `git --version`, socket MCP,
  tulis log — semuanya dijalankan sungguhan.
- Export report JSON (tanpa secret) dan buka folder log.
- Logging `tracing` ke `%APPDATA%\zephyr\logs` dengan rotasi 2MB, panic hook +
  dialog crash, error frontend ikut tercatat.
- `settings.json` yang rusak dipindahkan ke `.broken-<timestamp>` lalu default
  dipakai — settings user tidak hilang diam-diam.
- Path Windows >260 karakter didukung lewat prefix `\\?\`.
- Membuka root drive (`C:\`) sebagai workspace ditolak dengan penjelasan.

### Auto-update
- Kerangka lengkap (plugin updater, artefak `.msi.zip` + `.sig`, UI di
  Settings → Tentang). Endpoint rilis belum diisi; tombolnya menampilkan
  "Update belum dikonfigurasi" dan app tetap berjalan normal.

### Belum ada di 1.0.0
- SSH remote (fase 07) — ditunda menunggu host uji.
- IntelliSense/LSP, debugger, tasks, minimap, global search ripgrep,
  local history, notification center, menu bar, panel bawah. Semuanya
  direncanakan masuk lewat auto-update.
