# Inventaris & Duplikat Tool Zephyr

Mesin pembukti untuk permintaan "hapus tool yang duplikat, **jangan sampai mengurangi jumlah tool**".
Tanpa angka, dedupe = klaim kosong. Berkas ini memuat angka nyata dari dua skrip, lengkap dengan bukti `berkas:baris`.

**Read-only pada kode produk.** Tidak ada berkas di `src/lib/zephyrTools/**` yang diubah dari lane ini.

## Cara jalan & kode keluaran

```bash
node scripts/inventaris-tool.mjs            # inventaris (EXIT 0)
node scripts/inventaris-tool.mjs --json     # inventaris, JSON penuh
node scripts/deteksi-duplikat-tool.mjs      # temuan + usulan + gerbang (EXIT 0 = semua usulan aman)
node scripts/deteksi-duplikat-tool.mjs --json
node scripts/deteksi-duplikat-tool.mjs --uji-hilang   # suntik usulan tidak aman -> WAJIB EXIT 1
```

Arti kode keluar `deteksi-duplikat-tool.mjs`:

| kode | arti |
|---|---|
| `0` | semua usulan AMAN (kapabilitas sesudah superset dari sebelum) **dan** 3 uji diri benar |
| `1` | ada usulan yang menghilangkan kapabilitas, ATAU ada uji diri yang salah, ATAU hook `--uji-hilang` tidak memerah |

## Angka pokok (keluaran nyata, 2026-10-14)

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Katalog sekarang **68**
> (builtin 43 / mcp 14 / web 11; dulu 67 = builtin 42) dan `TOOL_DIKIRIM_SELALU` tetap **26**.
> Usulan "67 → 53" di bawah dihitung dari basis audit 67; basis sekarang **68 → 54**
> (sudah dihitung ulang di `docs/LAPORAN-BACA-KODE-SAMBUNG.md:286`).

| ukuran | nilai |
|---|---|
| total tool | **68** (builtin 43 / mcp 14 / web 11) — dulu 67; +1 `zephyr_kode` |
| label kapabilitas unik | **47** |
| duplikat sejati (kapabilitas + sinyal identik) | **1** |
| kandidat gabung (kapabilitas sama, mekanisme beda) | **21 pasangan / 7 keluarga** |
| subset (himpunan bagian, ada nilai tambah) | **20** |
| stub "sukses palsu" | **3** |
| usulan aman | **24** |
| **jumlah nama tool sebelum → sesudah** | **68 → 54** (nama boleh turun) — dulu, basis audit 67: 67 → 53 |
| **kapabilitas sebelum → sesudah** | **47 → 47** |
| **kapabilitas yang BISA HILANG** | **0 (WAJIB 0)** |
| verdict gerbang | **AMAN (superset)** |
| uji diri | 3/3 BENAR |
| exit code jalur nyata | `0` |

Jalur merah dibuktikan di data nyata, bukan cuma di uji diri:

```
$ node scripts/deteksi-duplikat-tool.mjs --uji-hilang
  kapabilitas yang BISA HILANG: 1 (WAJIB 0) -> berkas:hapus
  verdict    : MERAH (kapabilitas hilang)
$ echo $?   ->  1
```

## Sumber bukti (kenapa angkanya bisa dipercaya)

- Katalog tool (`name`, `effect`) **diimpor nyata** dari `src/lib/zephyrTools/catalog.ts` lewat esbuild + data-URL (bukan diarang dari kepala), sama pola dengan `scripts/uji-kesiapan-tool.mjs` / `scripts/audit-katalog-tool.mjs`.
- Badan handler **dibaca sebagai teks** dari `src/lib/zephyrTools/*.ts` karena `builtins.ts` menyentuh DOM saat evaluasi modul → tidak bisa diimpor di Node. Disebut *parse*, bukan *impor*.
- Setiap label kapabilitas wajib punya minimal satu bukti `berkas:baris` + cuplikan. Tool tanpa label yang cocok **tidak dipaksa** punya label; `effect` dilaporkan terpisah.
- Sinyal backend per tool (`cmd.*`, request LSP, `invoke.*`, akses store, `jalankanAgentTool`) diturunkan dari blok handler, jadi dua tool yang kapabilitasnya sama masih bisa dibedakan mekanismenya.
- `PERINGATAN: nama dengan >1 blok handler` → `zephyr_self` punya dua blok (`builtins.ts:2254` mati, `zephyrSelf.ts:492` hidup). Dilaporkan, bukan dihapus dari lane ini.

## (a) Duplikat sejati — kapabilitas DAN sinyal identik

| tool A | tool B | kapabilitas | sinyal | bukti |
|---|---|---|---|---|
| `edit` | `multi_edit` | `berkas:baca, berkas:ganti, berkas:tulis` | `cmd.fsRead, cmd.fsWrite, store.useStore.tabs, store.useStore.updateTabContent` | `builtins.ts:985` vs `builtins.ts:1038` |

**Usulan aman:** satu nama kanonik `edit`, `multi_edit` tetap hidup sebagai **alias**.
Beda parameter (`edit`: `path, old_string, new_string, replace_all` vs `multi_edit`: `path, edits`) harus tetap dilayani → alias memetakan bentuk lama ke bentuk kanonik. Kapabilitas hilang: **0**.

Kandidat yang **sengaja TIDAK** diusulkan hapus — kapabilitas sama tapi mekanisme beda (7 keluarga):

| keluarga | anggota (sinyal) |
|---|---|
| `shell:jalan` | `bash_run` (`cmd.agentExec`), `bash_background` (`cmd.tasksRun`) |
| `shell:baca` | `bash_logs` (`cmd.ptyTail, cmd.tasksRuns`), `bash_list` (`cmd.tasksRuns`) |
| `subagen:jalan` | `run_subagent`, `run_subagents` (keduanya via `store.useSubAgent`) |
| `kode:analisis` | `lsp_symbols`, `lsp_references`, `lsp_definition`, `lsp_hover`, `lsp_diagnostics` (baca `store.useProblems.byFile` — server yang push, tidak ada request), `lsp_call_hierarchy` |
| `jendela:buka` | `mcp__zephyr__open_file` (`openPath`), `mcp__zephyr__workspace` (`.openWorkspace`, punya enum `action`) |
| `jendela:baca` | `mcp__zephyr__state`, `browser_list` |
| `web:ambil` | `web_search` (`query`), `web_fetch` (`url, max_chars`) |

Untuk keluarga ini usulannya bukan "hapus", tapi **satu nama + parameter mode** — dan itu keputusan lane pemilik `zephyrTools/**`, bukan lane ini.

## (b) Subset — himpunan bagian kapabilitas, masih ada nilai tambah

Syarat lolos: kapabilitas kecil **⊊** kapabilitas besar, sinyal kecil **⊊** sinyal besar (strict, sinyal tidak boleh kosong), dan bentuk kedua tool sama (bukan satu dispatcher vs satu tool berdikari).

| kecil | kandidat induk | kapabilitas kecil ⊂ besar | nilai tambah (param) |
|---|---|---|---|
| `copy_file` | `write_file` / `edit` / `multi_edit` | `berkas:baca, berkas:tulis` | `from, to` |
| `glob` | `grep` / `replace_in_files` | `cari:nama` | `limit` |
| `grep` | `replace_in_files` | `cari:isi, cari:nama` | `ignoreCase, limit` |
| `bash_list` | `bash_kill` | `shell:baca` | — |
| `get_terminal_output` | `mcp__zephyr__read` | `jendela:baca, shell:baca` | `paneId` |
| `open_preview` | `browser_open` | `jendela:baca, jendela:buka` | — |
| `mcp__zephyr__open_file` | `mcp__zephyr__run_command` | `jendela:buka` | — |
| `mcp__zephyr__workspace` | `mcp__zephyr__pane` | `jendela:buka` | `path` |
| `mcp__zephyr__state` | `mcp__zephyr__inspect` / `run_command` / `read` | `jendela:baca` | — |
| `mcp__zephyr__focus_pane` | `browser_open` | `jendela:baca, jendela:fokus` | `leafId` |
| `web_search` | `browser_read` / `browser_download_url` | `web:ambil` | `query` |
| `web_fetch` | `browser_read` / `browser_download_url` | `web:ambil` | `url, max_chars` |
| `browser_list` | `browser_read` | `jendela:baca` | — |

Induk di atas bersifat **alternatif** (satu tool kecil bisa ⊂ beberapa induk); pilih satu. Usulan tetap "kanonik + alias", jadi nama lama tetap bisa dipanggil dan kapabilitasnya tidak hilang.

## (c) Stub "sukses palsu" — dipanggil, tidak ada efek nyata

Diverifikasi sendiri di sumber, bukan menerima hasil audit sebelumnya:

| tool | efek_katalog | isi handler | bukti |
|---|---|---|---|
| `mcp__zephyr__extension` | `appWrite` | 5 aksi `[enable, disable, reload, update, uninstall]`, tidak ada satu pun cabang nyata; `return \`Ekstensi ${id}: aksi ${action} dicatat.\`` | `mcp.ts:341` (run: `mcp.ts:352-356`) |
| `mcp__zephyr__wait_for_terminal` | `read` | `await new Promise(setTimeout, ms)` lalu `return \`Selesai menunggu terminal (${ms} ms).\`` — tidur buta, **tidak** menunggu keadaan terminal apa pun | `mcp.ts:511` (run: `mcp.ts:521-525`) |
| `mcp__zephyr__worktree` | `appWrite` | 5 aksi `[list, add, remove, prune, open]`, tidak ada cabang nyata; `return \`Git worktree ${action} selesai.\`` | `mcp.ts:531` (run: `mcp.ts:542-545`) |

**Usulan: JANGAN hapus** (menghapus = kapabilitas `appWrite`/`read` hilang). Dua pilihan untuk lane pemilik: (1) perbaiki jadi pemanggilan nyata, atau (2) petakan sebagai alias ke tool nyata yang mengerjakan hal sama. Usulan ini sengaja tidak mengubah daftar tool, sehingga tidak bisa menurunkan kapabilitas.

## Gerbang superset

```
nama tool  : 68 -> 54  (nama boleh turun)   # dulu, basis audit 67: 67 -> 53
kapabilitas: 47 -> 47
kapabilitas yang BISA HILANG: 0 (WAJIB 0)
verdict    : AMAN (superset)
```

Cara gerbang bekerja: usulan diterapkan ke daftar tool (`gabung-alias` menyatukan kapabilitas + sinyal ke kanonik; `hapus-tanpa-alias` membuang nama), lalu himpunan kapabilitas **sesudah** dicek harus superset dari **sebelum**. Kalau ada satu label hilang → nama labelnya dicetak + `EXIT 1`.

### Uji diri (3 umpan, semua BENAR)

| kasus umpan | harap | dapat |
|---|---|---|
| dua tool kapabilitas identik, digabung jadi kanonik + alias | LOLOS | LOLOS |
| alias membawa kapabilitas yang tidak dimiliki kanonik | MERAH | MERAH (hilang: `web:ambil`) |
| tool dengan kapabilitas unik dibuang tanpa alias | MERAH | MERAH (hilang: `berkas:tulis`) |

## Keterbatasan (jangan dibaca lebih dari yang bisa dibuktikan)

1. Label kapabilitas bersifat **kasar**: `jendela:buka` dipakai untuk `open_file` (`openPath`) maupun `workspace` (`.openWorkspace`). Karena itu keputusan duplikat tidak hanya pakai label — ada pembanding sinyal dan bentuk tool, dan setiap temuan mencetak cuplikan bukti supaya manusia bisa menolaknya.
2. Sinyal store bisa lebih kasar dari kenyataan (mis. `store.useStore` untuk dua operasi berbeda) — ini alasan `open_file` vs `workspace` **tidak** diklaim duplikat sejati, hanya kandidat.
3. Angka "kapabilitas tidak turun" hanya berlaku untuk **daftar usulan di skrip**. Kalau ada usulan lain (mis. menghapus stub tanpa alias), gerbang akan memerah — silakan uji dengan `--uji-hilang`.
4. Perubahan sungguhan di `src/lib/zephyrTools/**` **menunggu lane pemiliknya**; berkas ini hanya mesin bukti + usulan.

## Berkas

| berkas | isi |
|---|---|
| `scripts/inventaris-tool.mjs` | inventaris 68 tool (dulu 67) + 47 kapabilitas dari sumber nyata; ekspor `buildInventory()`, `PETA_FUNGSI`; `--json`; peta kapabilitas → daftar tool |
| `scripts/deteksi-duplikat-tool.mjs` | detektor duplikat/subset/stub + usulan kanonik+alias + gerbang superset (`EXIT 1` bila kapabilitas hilang) + 3 uji diri + hook `--uji-hilang` |
| `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md` | berkas ini |
