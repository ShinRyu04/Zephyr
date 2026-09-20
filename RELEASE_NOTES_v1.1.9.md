# Zephyr v1.1.9

## What's new

Terminal workflow enhancements, AI CLI multi-line support, Linux compatibility fixes, and Terax-inspired foundation.

### Terminal Clipboard & Shortcut Improvements

- **Native `Ctrl+V` Paste in Terminal:** Pasting into the terminal can now be done directly using standard `Ctrl+V`, in addition to `Ctrl+Shift+V` and `Shift+Insert`. No need to rely solely on right-clicking.
- **`Shift+Enter` for Multi-line AI CLI:** Pressing `Shift+Enter` in the terminal emulator now emits CSI u (`\x1b[13;2u`) and proper line-feed escapes instead of triggering an immediate command submission. This allows smooth multi-line prompt typing in AI CLIs (Claude Code, Codex, Aider, Hermes, etc.).
- **Anti-Truncation Bracketed Paste:** Teks paste terminal kini dibungkus sequence *Bracketed Paste Mode* (`\x1b[200~ ... \x1b[201~`) dan dipecah dalam ukuran potongan adaptif (512 byte dengan jeda alir 12ms). Mencegah ConPTY Windows mengalami overflow atau karakter terpotong saat menempel teks panjang/kode multi-baris.

### Linux Cross-Platform Compatibility Fixes

- **File Explorer:** Menambahkan penanganan `xdg-open` untuk lingkungan Linux dan `open -R` untuk macOS pada command `reveal_in_explorer` (sebelumnya hanya mendukung Windows `explorer.exe`).
- **DAP Process Tree Termination:** Perbaikan penghentian proses debuggee (DAP) pada Linux/Unix menggunakan sinyal `kill -9` sebagai pendamping `taskkill /T /F` di Windows.
- **Workflow & Bundle Configuration:** Workflow `.github/workflows/build-linux.yml` disiapkan untuk memproduksi paket `.deb` dan `.AppImage` Linux secara otomatis.

### Expanded BYOK AI Providers (Terax Parity)

- **New AI Providers:** Menambahkan dukungan native dan preset katalog untuk **Groq**, **OpenRouter**, **xAI (Grok)**, **Mistral AI**, **Cerebras**, dan **Ollama (Lokal)** ke dalam Zephyr.
- **Provider Logos & Icons:** Setiap provider baru dilengkapi SVG logo brand resmi di dropdown Model AI dan status bar.
- **Unified Base URLs:** Backend Rust (`adapters/openai.rs` dan `secrets.rs`) otomatis mengenali base URL default untuk masing-masing provider OpenAI-compatible baru ini saat validasi koneksi dan streaming.

### Visual Git Graph & Terax Dark Theme

- **Git Commit Graph Visual:** Di panel Source Control kini disertakan visualisasi diagram commit graph (titik branch, garis histori, hash commit, author, subject, dan tags/refs).
- **Tema Terax Dark Acrylic:** Menambahkan preset tema baru `terax-dark` ("Terax Acrylic") dengan estetika modern dark graphite, kontras tajam, dan palet aksen glassmorphism ala Terax.

### Agent Tools Expansion & Project Memory (Terax Parity)

- **Agent Direct File Operations:** Ditambahkan dua tool baru untuk agent: `file_write` (menulis file utuh/baru ke disk) dan `file_edit` (melakukan targeted edit find-and-replace pada file yang ada di disk). Perubahan file otomatis tersinkronisasi ke tab buffer jika file sedang aktif dibuka.
- **Project Memory (`ZEPHYR.md` / `TERAX.md`):** System prompt AI kini otomatis memuat instruksi aturan proyek dari file `ZEPHYR.md` atau `TERAX.md` di root workspace bila ada.




