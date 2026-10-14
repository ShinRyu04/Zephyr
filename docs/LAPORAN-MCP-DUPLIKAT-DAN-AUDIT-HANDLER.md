# Laporan: MCP Duplikat-Tiga + Audit Deteksi Handler

Dua item alat-audit dituntaskan. Semua perubahan hanya menyentuh tiga berkas milik
tugas ini; berkas lane lain (`catalog.ts`, `commands.ts`, `agentTools.ts`,
`builtins.ts`, `subsetTugas.ts`, `src-tauri/**`, dst.) hanya **dibaca**.

- Berkas diubah: `src/lib/zephyrTools/mcp.ts`,
  `scripts/deteksi-duplikat-tool.mjs`, `scripts/audit-katalog-tool.mjs`.
- Berkas ini: `docs/LAPORAN-MCP-DUPLIKAT-DAN-AUDIT-HANDLER.md`.

---

## DELIVERABLE 1 — `mcp-duplikat-tiga`

### Angka sebelum → sesudah (`node scripts/deteksi-duplikat-tool.mjs`)

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| Jumlah tool | 68 (builtin 43 / mcp 14 / web 11) | 68 (43 / 14 / 11) — **tetap** |
| Kapabilitas unik | 47 | 49 (**+2**) |
| (c) STUB "sukses palsu" | **3** | **0** |
| MERAH: kapabilitas diklaim belum terlayani | **2** | **0** |
| Verdict gerbang | — | **AMAN (superset)** |
| Uji diri deteksi duplikat (baru) | — | **6/6 BENAR** |
| Exit code | 0 | **0** |

### Tabel temuan → keputusan → bukti

| Temuan (keluarga STUB/mcp.ts) | Keputusan | Bukti sebelum → sesudah |
|---|---|---|
| `mcp__zephyr__extension` — klaim aksi `enable/disable/reload/update/uninstall`, handler hanya `return "Ekstensi ${id}: aksi ${action} dicatat."` | **Sambung ke backend nyata** (bukan hapus). `list/enable/disable/uninstall` → `cmd.extensionsList/SetEnabled/Uninstall`. `reload`/`update` dibuang (tidak ada perintah pelayanannya). | caps `[]` → `[ekstensi:baca, ekstensi:pasang]`; sinyal `[]` → `[extensionsList, extensionsSetEnabled, extensionsUninstall]`; `enumTerimplementasi []` → 3 aksi nyata |
| `mcp__zephyr__wait_for_terminal` — handler hanya `setTimeout` lalu `return "Selesai menunggu terminal"` (klaim kosong) | **Perbaiki akar**: benar-benar MEMBACA scrollback (`cmd.ptyTail`) sampai teks `until` muncul / keluaran idle / timeout, lalu kembalikan cuplikan keluaran sebagai bukti | caps `[]` → `[jendela:baca, shell:baca]`; sinyal `[]` → `[cmd.ptyTail, store.useTerminal]` |
| `mcp__zephyr__worktree` — klaim aksi `list/add/remove/prune/open`, handler hanya `return "Git worktree ${action} selesai."` | **Sambung ke backend nyata**. `list/add/remove/prune` → `cmd.worktreeList/Add/Remove/Prune`. `open` dibuang. | caps `[]` → `[git:kelola]`; sinyal `[]` → `[worktreeList, worktreeAdd, worktreeRemove, worktreePrune]`; `enumTerimplementasi []` → 4 aksi nyata |

**Tidak ada kemampuan produk yang hilang.** Dua aksi yang dibuang padanannya jelas:

- `extension.reload` — tidak ada perintah reload; kalau `commandRegistry` memaparkan
  perintah terkait, padanannya `mcp__zephyr__run_command`. Tidak pernah berjalan
  sebelumnya (handler lama tidak memanggil apa pun), jadi tidak ada kapabilitas yang
  hilang.
- `worktree.open` — padanannya `mcp__zephyr__workspace` `action="switch"` dengan
  `path` worktree tersebut (deskripsi tool sudah menyebutkannya).

### Perluasan `deteksi-duplikat-tool.mjs` (tanpa mengurangi kasus lama)

Ditambah uji diri **deteksi duplikat** yang memanggil fungsi `dupSejati()` yang sama
dengan jalur nyata — jadi bila kelak `dupSejati` dilonggarkan sampai tak pernah
memerah, uji ini ikut GAGAL. Ikut masuk exit code (`L.ujiDuplikat.some(...)`) dan
keluaran `--json` (`ujiDuplikat`). Kasus lama (uji gerbang 3 umpan) tidak diubah.

| # | Jenis | Kasus | Harap | Hasil |
|---|---|---|---|---|
| 1 | POSITIF | dua spec kembar (kapabilitas+sinyal+parameter identik) | TERDETEKSI | BENAR (`DUP_SEJATI`) |
| 2 | POSITIF | kembar beda urutan daftar (himpunan sama) | TERDETEKSI | BENAR (`DUP_SEJATI`) |
| 3 | NEGATIF | kapabilitas sama, sinyal backend beda | TIDAK terdeteksi | BENAR |
| 4 | NEGATIF | kapabilitas+sinyal sama, parameter terpisah | TIDAK terdeteksi | BENAR |
| 5 | NEGATIF | satu dispatcher vs satu berdirikari (beda bentuk) | TIDAK terdeteksi | BENAR |
| 6 | NEGATIF | kapabilitas tak sama | TIDAK terdeteksi | BENAR |

### Catatan jujur (bukan temuan baru yang saya ciptakan)

- `DUPLIKAT SEJATI: 1` (`edit == multi_edit`) ada di **`builtins.ts`** — pre-existing,
  di luar cakupan tugas (berkas lane lain, read-only bagiku). Tidak saya sentuh.
- Setelah `wait_for_terminal` jadi nyata, ia berbagi keluarga `[jendela:baca, shell:baca]`
  dengan `get_terminal_output` → muncul sebagai **KANDIDAT_GABUNG** (kuning, bukan
  merah; parameter terpisah, bukan duplikat sejati). Ini wajar: yang satu membaca
  keluaran sekarang, yang satu menunggu idle. Konsisten dengan pola
  `run_subagent` vs `run_subagents` yang sudah ada.

---

## DELIVERABLE 2 — `audit-katalog-deteksi-handler`

### Angka sebelum → sesudah (`node scripts/audit-katalog-tool.mjs`)

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| Berkas handler dipindai | 5 (daftar tangan: builtins/web/mcp/zephyrSelf/zephyrIngat) | **6** (diturunkan dari registry + gabungan cadangan) |
| Handler unik | 67 | **68** |
| Katalog tanpa handler | **1 → `zephyr_kode`** | **0** |
| Handler tanpa katalog | 0 | 0 |
| Masalah struktural | **2** | **1** (tinggal langit-langit 26 > 20 — keputusan pemilik) |
| Uji diri deteksi handler (baru) | — | **4/4 BENAR** |
| Exit code | 1 | 1 (semata karena langit-langit) |

### Akar masalah & keputusan

Temuan agen induk dikonfirmasi: `zephyr_kode` adalah **celah deteksi, bukan cacat
produk**. Handler-nya ada dan berjalan; spec-nya di `src/lib/bacaKode.ts`, didaftarkan
ke registry lewat `TOOL_BACA_KODE`, sedangkan `BERKAS_HANDLER` lama hanya memindai
builtins/web/mcp/zephyrSelf/zephyrIngat.

**Keputusan: turunkan daftar berkas handler dari REGISTRY `AGENT_TOOLS`, jangan dari
daftar tangan.**

- `berkasHandlerDariRegistry()` membaca `src/lib/agentTools.ts`, memetakan tiap impor
  nama koleksi (mis. `TOOL_BACA_KODE`) → berkas asalnya, lalu mengambil semua koleksi
  yang benar-benar di-spread di `AGENT_TOOLS`.
- Digabung dengan `BERKAS_HANDLER_LEGACY` (lima berkas lama) supaya cakupan audit
  **tidak pernah lebih lemah** dari sebelumnya ("tanpa mengurangi kasus lama").
- Menambah tool baru cukup lewat registry — audit ikut sendiri.

### Perluasan: uji diri POSITIF / NEGATIF / REGRESI (bagian D2)

| Jenis | Kasus | Harap | Hasil |
|---|---|---|---|
| POSITIF | nama katalog sintetis `uji_sintetis_tanpa_handler` (tanpa handler) | TERDETEKSI | BENAR |
| NEGATIF | `zephyr_kode` (handler di `bacaKode.ts`) | TIDAK terdeteksi | BENAR |
| NEGATIF | seluruh nama katalog nyata punya handler (daftar kosong) | TIDAK terdeteksi | BENAR |
| REGRESI | dengan daftar-lama saja, `zephyr_kode` TERLAPOR | TERDETEKSI | BENAR — membuktikan celah itu nyata |

### Langit-langit 26 > 20 (READ-ONLY, keputusan pemilik)

`TARGET_MAKS` **tidak** saya geser dan tidak ada tool yang saya hapus dari katalog.
Masalah struktural yang tersisa tinggal satu: langit-langit per giliran **26 > target
20**. Angkanya dilaporkan apa adanya; exit code audit tetap **1** karena itu. Ini
keputusan langit-langit, bukan cacat yang bisa saya perbaiki dari dalam cakupan tugas.

---

## Verifikasi

- `node scripts/deteksi-duplikat-tool.mjs` → 0 STUB, 0 MERAH, verdict **AMAN**, exit **0**.
  Uji diri duplikat 6/6 BENAR; uji gerbang 3/3 BENAR (kasus lama utuh).
- `node scripts/audit-katalog-tool.mjs` → katalog tanpa handler **0**, handler unik 68,
  kontrol handler 4/4 BENAR; masalah struktural 1 (langit-langit), exit 1.
- `npx tsc --noEmit` → **0 error** (typecheck bersih; seluruh tanda tangan perintah
  `cmd.extensions*` / `cmd.worktree*` / `cmd.ptyTail` cocok dengan `src/lib/commands.ts`).
- Jumlah tool **68** tidak berubah sebelum→sesudah (tidak ada kemampuan produk hilang).
