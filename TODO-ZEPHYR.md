# TODO Zephyr — Pekerjaan Fitur Baru

> Diperbarui otomatis oleh Hermes. Versi target tetap **1.1.10**.
> Lokasi runtime dev: `D:\DevEnv\` · Repo: `D:\Zephyr`

## 🔨 SEDANG DIKERJAKAN

| ID | Task | Progress |
|----|------|----------|
| **T1.1** | Blok Reasoned + Thinking/Effort (minimal→ultra) | 🔨 50% — `ReasoningEffort` enum ✅, `adapters/mod.rs` ✅, `openai.rs` ✅, `anthropic.rs` (parsial) |

## ⏳ BELUM DIKERJAKAN (14)

| ID | Task | Catatan |
|----|------|---------|
| T1.2 | CLI login multi-provider (Codex + Claude + Gemini + Opencode) | Jalur B: spawn CLI headless. Codex CLI sudah dipasang |
| T1.3 | HTTP Client `.http` (ala REST Client) | |
| T1.4 | Format on save | Toggle sudah ada, belum fungsional |
| T1.5 | Rapikan UI AI panel: tab Native/CLI + status login + input maxOut token | maxOut penting untuk Mr Vip |
| T2.1 | Subagent paralel — spawn N agent bareng + progress live | `ai_reqs: HashMap` per-id → paralel aman |
| T2.2 | API Client — collection, request/response, env vars | |
| T2.3 | Cloudflare Tunnel — start/stop + URL publik | Ada risiko keamanan |
| T2.4 | Test Explorer | |
| T3.1 | Dev Environment — panel UI | **Runtime SUDAH terpasang di `D:\DevEnv\`** |
| T3.2 | Database browser (MySQL/Postgres/SQLite) | |
| T3.3 | SFTP + SSH forwarding | |
| T3.4 | Sisa B: Docker, Notebook, Sync, Profiles, Blame, LiveShare, Image, MultiAcc, Vim, Hierarchy, Peek, Zen | 12 item |
| T4.1 | CLI subcommand — `zephyr ext install` | |
| T4.2 | Portable mode | |

## ✅ SKIP (keputusan user)

| No | Fitur | Alasan |
|----|-------|--------|
| 32 | Code signing EV | Perlu beli sertifikat komersial |
| 33 | Delta/incremental update | Installer sudah kecil (3,8 MB), nggak worth |
| 34 | Extension Open VSX | Sengaja tidak ada — ekstensi VS Code butuh host API, hampir semua gagal |

---

## 📌 PEKERJAAN BESAR SESI INI

| | Item | Status |
|---|------|--------|
| A | Kerjakan semua item A+B+C (kecuali 32/33/34) | 🔨 jalan |
| B | `npm run dev` **tidak boleh muncul di latar depan** (user main game) | ✅ **SOLVED** — `Start-Process -WindowStyle Minimized`, CDP 9223 hidup |
| C | Rebuild rilis — **tetap v1.1.10** (jangan naik versi) | ⏳ |
| D | Commit **LOKAL saja**, JANGAN push ke GitHub | ⏳ |
| E | Update README | ⏳ |
| F | Perbarui SEMUA screenshot | ⏳ |
| G | Perbarui release notes | ⏳ |

## ✅ SUDAH SELESAI (di luar TODO)

- **DevEnv** `D:\DevEnv\` — PHP 8.3.33 + 8.1.34, Nginx 1.31.6, Redis 5.0.14.1, MariaDB 11.4.4 (~500 MB)
- **Codex CLI** — `codex-cli 0.155.1`
- **Hermes** — `model.context_length` = 1.000.000 · `agent.max_turns` = 1000
- **Google Docs** "Update Zephyr" — gap analysis lengkap (80 paragraf, di-share)

## 📊 Ringkasan Gap Analysis (dari Google Docs)

| Kategori | Jumlah |
|----------|--------|
| A. Fitur TEDI belum ada | 8 |
| B. Fitur IDE standar belum ada | 16 + 1 belum fungsional |
| C. Platform belum ada | 5 (32, 33, 35, 36; 34 sengaja tidak ada) |
| **TOTAL GAP** | **29** |
| Dikoreksi jadi sudah ada | 3 (no. 23, 25, 27) |

---

*File ini diperbarui Hermes. Jangan hapus — dipakai untuk memantau progres.*
