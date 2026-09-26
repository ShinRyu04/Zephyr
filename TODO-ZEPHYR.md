# TODO Zephyr — Pekerjaan Fitur Baru

> Diperbarui otomatis oleh Hermes. Versi target **1.1.11**.
> Repo: `D:\Zephyr`

## ✅ SELESAI v1.1.11

| Item | Catatan |
|------|---------|
| Parser tool-call XML/DSML | Model gateway (mr-vip) yang kirim tool call sebagai teks XML kini dijalankan |
| Auto-konteks workspace | AI tahu folder, teknologi, entry point, contoh file tanpa tool-call |
| Semua file aturan | AGENTS.md + CLAUDE.md + ZEPHYR.md + .cursorrules dibaca |
| Status pekerjaan agent | Rencana, progres langkah, error dikirim ke model tiap giliran |
| Watchdog subagent | Anti-macet 90 detik |
| Settings rusak (BOM UTF-8) | Akar ditemukan: file ber-BOM dianggap rusak lalu direset |
| Sinkron model AI | Panel ikut settings, tidak lagi pakai placeholder `custom-model` |
| Loading lebih cepat | Panel/dialog/palette di-lazy-load |
| Git blame | Backend + command + Output |
| Git stash | save/list/pop/drop |
| Merge conflict | take ours/theirs |
| Git rebase | Backend + command |
| AI commit message | Isi pesan commit dari diff |
| Subagent progress bar | UI |

## ⏳ BELUM DIKERJAKAN

| ID | Task | Catatan |
|----|------|---------|
| T1.3 | HTTP Client `.http` | |
| T2.2 | API Client (collection, env) | |
| T2.3 | Cloudflare Tunnel | Risiko keamanan |
| T2.4 | Test Explorer | |
| T3.2 | Database browser | RAM concern |
| T3.3 | SFTP + SSH forwarding | |
| T3.4 | Docker, Notebook, Sync, Profiles, Blame-UI, LiveShare, MultiAcc, Vim, Hierarchy, Peek, Zen | 12 item |
| T4.1 | CLI subcommand `zephyr ext install` | |
| T4.2 | Portable mode | |
| - | Vim/emacs keybinding | Butuh paket eksternal |
| - | Outline/Symbols panel | LspOverlay sudah punya sebagian |
| - | Peek definition inline | Parsial |
| - | MCP client (server luar) | Config saja |

## ✅ SKIP (keputusan user)

| No | Fitur | Alasan |
|----|-------|--------|
| 32 | Code signing EV | Perlu sertifikat komersial |
| 33 | Delta/incremental update | Installer sudah kecil |
| 34 | Extension Open VSX | Butuh host API |

---

*File ini diperbarui agen. Jangan hapus.*

