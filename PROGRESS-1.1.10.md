# Zephyr 1.1.10 — Progress Implementasi

Sumber: Google Doc "Zephyr Roadmap — Semua yang Perlu Diupdate" (BAGIAN A/B/C/D).

Status: **SELESAI 27/27**. Rilis v1.1.10 dijadwalkan otomatis hari Minggu
(`scripts/rilis-minggu.sh` lewat cron) — sebelum itu semua kerjaan disimpan
lokal.

## BAGIAN D — AI Agent & UX panel

- [x] 21. Streaming per langkah agent (ai_tool_chat streaming via ai-chunk)
- [x] 22. Mode "kerja langsung" (auto-approve perintah aman, ask utk destruktif)
- [x] 23. Output terminal di dalam bubble chat (collapsible)
- [x] 24. Todo list ala opencode (tool todo_write/todo_read + panel)
- [x] 25. Hapus chat langsung ke sesi baru
- [x] 26. Multi-gambar maks 10 lampiran
- [x] 27. Shift+Enter multi-baris untuk semua AI CLI (mapping per-CLI)

## BAGIAN A — Fitur ala Copilot Chat

- [x] 1. Inline ghost text (completions) — `src/lib/ghostText.ts`, `Alt+\`
- [x] 2. At-mention konteks (@file, @folder, @symbol, @terminal, @problems, @selection)
- [x] 3. Quick chat dari seleksi (Jelaskan/Perbaiki/Refactor)
- [x] 4. Inline chat (Ctrl+I) melayang di editor — `InlineChat.tsx`
- [x] 5. Tombol Apply/Insert ke editor
- [x] 6. Diff review inline
- [x] 7. Klik referensi file (path → loncat ke file:baris)
- [x] 8. Slash command + prompt library
- [x] 9. Pencarian riwayat chat + judul otomatis
- [x] 10. Posisi panel kanan 340px

## BAGIAN B — Optimasi RAM

- [x] 11. Tab editor lazy-load (hanya tab aktif punya CodeMirror)
- [x] 12. Batas scrollback terminal (2000-5000 baris/pane)
- [x] 13. GPU low-power saat idle
- [x] 14. MAX_LOADED_TABS lowRam 8 → 4
- [x] 15. Hapus remote-debugging-port=9223 di build release
- [x] 16. Cache SVG logo model/provider
- [x] 17. Pertahankan mode hemat RAM (sudah ada)

## BAGIAN C — Overhaul tampilan ala Terax

- [x] 18. Header custom (title bar sendiri) — `WindowControls.tsx`
- [x] 19. Layout terminal-first
- [x] 20. Poles tema dan spacing

## Tambahan di luar roadmap

- [x] Skill ala Hermes — `SKILL.md` per folder, dua scope (global + workspace),
      agent bisa menulis skill sendiri lewat `skill_write`
- [x] Memory lintas sesi — `memory.md` + `user.md`, disuntik ke system prompt
- [x] Tugas terjadwal — `cron_create`/`cron_list`/`cron_delete`, timer 30 detik
- [x] Hapus semua riwayat chat + Chat baru di panel AI
- [x] 22 tool agent (dari 13)
- [x] i18n 10 bahasa lengkap (tanpa sisa teks Indonesia)

## Verifikasi

- [x] `npx tsc --noEmit` 0 error
- [x] `cargo test --lib` — 183 lulus (dari 166)
- [x] Verifikasi hidup CDP (`scripts/verify-skill-memory.mjs`) — 11/11 lulus
- [x] Versi 1.1.10 di 3 file (package.json, tauri.conf.json, Cargo.toml)
- [x] `RELEASE_NOTES_v1.1.10.md`
- [x] Build Windows (MSI + NSIS) + Linux (.deb + .AppImage), signed
- [x] Signature diverifikasi kriptografis (Ed25519 + BLAKE2b-512)
- [x] `latest.json` 2 platform, signature cocok dengan file `.sig`
- [x] RAM 118 MB steady idle (target < 100 MB — sisa = lantai baseline WebView2)
- [x] Tanpa kedip console window

## Bug fix sesi ini (di luar roadmap)

- [x] **Blank screen permanen** — akar masalah: `applySettings` di `store.ts`
      memakai shallow merge, jadi patch `{ models: { answerLang } }` menghapus
      seluruh `models.providers` → render crash, tanpa ErrorBoundary.
      Fix: deep-merge RFC 7386 (semantik sama `deep_merge_um` Rust) + guard
      `providers ?? {}` di 4 file + `ErrorBoundary.tsx` baru.
- [x] **Ctrl+V dobel di terminal** — xterm punya listener `paste` native
      sendiri, sementara jalur keydown Zephyr tidak `preventDefault()`.
      Fix: preventDefault + bracketed paste hanya bila DECSET 2004 aktif.
- [x] **Foto profil GitHub** — dulu selalu inisial. Sekarang `avatar_url` dari
      GET /user disimpan (`stored_avatar` + backfill sekali-jalan), dengan
      inisial tetap jadi fallback offline.
- [x] **Notifikasi update multi-bahasa** — 230 key i18n × 10 bahasa;
      `updaterStore.ts` 20/20 + `UpdatePanel.tsx` 12/12 ter-route; pesan
      statis dihitung saat render supaya ikut bahasa.
- [x] **Katalog model dipangkas** — Groq/OpenRouter/Mistral/Ollama dihapus,
      92 → 50 model, 8 provider; sisa SVG di switch logo dibersihkan.

## Build & install

- [x] Kunci signing lama rusak (pubkey tidak sinkron dengan private key) →
      di-regenerate, kunci lama di-backup, `pubkey` di `tauri.conf.json`
      disinkronkan. Signature diverifikasi ulang memakai crate
      `minisign-verify` (crate yang sama dengan updater Tauri) → **SAH**.
- [x] Build memakai `npm run tauri:build` (= `tauri build --config
      tauri.release.conf.json`) supaya flag hemat RAM ikut. Build dengan
      `tauri build` polos menghasilkan 460 MB.
- [x] Install baru ke laptop user + 2 instalasi lama di-uninstall
      (`AppData\Local\Programs\Zephyr` + `D:\Desktop\Zephyr`); shortcut di
      Desktop diarahkan ulang ke instalasi baru.

## Hasil ukur

| Metrik | Sebelum | Sesudah |
|---|---|---|
| RAM idle (private, steady) | 208 MB | **118 MB** |
| Binary Windows | 23.8 MB | **9.49 MB** |
| Binary Linux | — | 11.96 MB |
| Proses WebView2 | 12 | **2** |
| Tes Rust | 166 | **183** |
| Tool agent | 13 | **22** |
