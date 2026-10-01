# Zephyr — Aturan Kerja (baca sebelum ngutak-ngatik repo)

## 1. Repo publik sengaja tanpa kode

`github.com/ShinRyu04/Zephyr` itu **PUBLIC**, tapi **SENGAJA** tidak berisi:

```
src/         → source frontend
src-tauri/   → source backend Rust
scripts/     → script dev
```

**Jangan kaget kalau `src/` tidak ada di git** — itu keputusan Ryu, bukan kerusakan.
**JANGAN pernah commit folder itu ke repo publik.**

Yang **boleh** ada di repo publik: `docs/`, `README`, `CHANGELOG`, `package.json`,
`tsconfig`, `.github/workflows/`, screenshot.

## 2. Backup wajib sebelum operasi git berat

```
D:\Backups\Zephyr-RESCUE\zephyr-full-history.bundle   (39 MB, SEMUA history)
```

Kalau mau rebase, reset, clean, rewrite, atau force-push: **backup dulu**
atau minimal kerja di branch baru.

## 3. Build rilis

```bash
npm run tauri:build          # WAJIB — `tauri build` polos membuang flag hemat RAM
```

Signing: `%APPDATA%\zephyr\zephyr.key` (+ `.pub`), password di `signing-key.txt`.
Public key di `tauri.conf.json` harus sinkron dengan private key.

**Jangan pernah bawa `secrets.json` ke dalam build.** `scripts/safe-build.mjs`
memindahkannya sementara; pastikan `[secrets-guard] artefak bersih` muncul.

## 4. Discord RPC (sudah jalan — jangan diutak-atik tanpa alasan)

| Item | Nilai |
|---|---|
| Application ID | `1554470184771649629` |
| Art asset key | `icon-source` (harus persis) |
| Large text | Zephyr Editor |
| Dependency | `discord-rich-presence = "1.1.0"` |
| File | `src-tauri/src/discord_rpc.rs` |
| Wiring | `lib.rs`: modul (19), `start` (154), `stop` (474) |

`details` = "Lightweight AI Code Editor", `state` = "Workspace: <nama>",
refresh tiap 5 detik, auto-reconnect kalau Discord restart.

Cek berhasil: `%APPDATA%\zephyr\logs\zephyr-<tanggal>.log` →
`INFO zephyr_lib::discord_rpc: Discord RPC: terhubung ke Discord`

**Jebakan:** Discord harus kebuka saat Zephyr jalan. Kalau Discord belum nyala,
thread-nya tetap mencoba terus dan tersambung sendiri begitu Discord dibuka.

## 5. Jangan tindak tanpa perintah

Ryu marah kalau ada aksi yang tidak diminta — terutama soal repo
(private-kan, hapus, force-push, upload rilis). Kalau ragu: **tanya**, jangan tebak.

## 6. Rilis yang belum siap jangan dipublikasikan

Kalau Ryu bilang "jangan push dulu, gua mau coba":
- Draft **masih bisa dicari** lewat URL tag → jangan cuma di-draft.
- Simpan installer di `D:\Zephyr\release\<versi>\` untuk dites lokal.
- Publikasikan hanya setelah Ryu bilang OK.
