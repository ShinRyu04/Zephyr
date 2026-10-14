# LAPORAN ANGKA DOKUMEN TOOL

Item: **`angka-dokumen-tool-68`** · Repo: `D:/Zephyr` · Branch: `feat/ai-panel-vscode-layout`
Tanggal: **2026-10-14** · Sifat: hanya **dokumen** (`docs/*.md`) yang diubah. `src/**`, `scripts/**`,
`src-tauri/**` **tidak disentuh** (read-only bagiku).
Sumber angka: **kode**, bukan diketik ulang — `src/lib/zephyrTools/catalog.ts` (`TOOL_COUNTS`,
`TOOL_CATALOG`, `TOOL_NAMES`, `TOOL_INTI`, `TOOL_DIKIRIM_SELALU`, `_WEB_AKTIF`) + `src/lib/toolGate.ts`
(`TOOL_AKTIF_AWAL`).

---

## 1. Angka nyata (dari kode, bisa diulang)

### 1.1 Hitung entri per blok katalog — pembacaan berkas, node murni, offline

```
$ cd /d/Zephyr && node C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/hitung-angka-tool.mjs
catalog.ts lines          : 646
BUILTIN block lines       : 69 .. 176
MCP block lines           : 177 .. 225
WEB block lines           : 226 .. 251
TOOL_DIKIRIM_SELALU at    : 529

builtin : 43
mcp     : 14
web     : 11
inti    : 57
TOTAL   : 68

TOOL_DIKIRIM_SELALU      : 26
  read_file, write_file, edit, multi_edit, replace_in_files, delete_file, list_directory, create_directory, grep, glob, bash_run, bash_background, bash_logs, todo_write, lsp_definition, zephyr_self, skill_view, think, ask_user, run_subagent, run_subagents, tool_search, tool_call, browser_open, browser_read, web_fetch

CHECK builtin names (last 4): calculator, ask_user, tool_search, tool_call
CHECK KODE present        : true
CHECK dupe names in katalog: none
```

### 1.2 Bukti runtime — `catalog.ts` di-bundle esbuild lalu diimpor (tanpa app, tanpa Tauri)

```
$ cd /d/Zephyr && node C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/bukti-runtime-tool.mjs
TOOL_COUNTS        : {"builtin":43,"mcp":14,"web":11,"inti":57,"total":68}
TOOL_CATALOG.length: 68
TOOL_NAMES.length  : 68
TOOL_INTI.length   : 57
TOOL_DIKIRIM_SELALU: 26
BAWAAN_AKTIF       : 57
WEB_AKTIF_AWAL     : 6
aktif-default (inti+web-aktif): 63
zephyr_kode in katalog: true
periksaKatalog()   : []
```

### 1.3 Cross-check grep independen (bukan skrip yang sama)

```
$ cd /d/Zephyr/src/lib/zephyrTools
$ sed -n '69,176p' catalog.ts | grep -c "^  \['"      -> 43     (blok BUILTIN)
$ sed -n '177,225p' catalog.ts | grep -c "^  \['"      -> 14     (blok MCP)
$ sed -n '226,251p' catalog.ts | grep -c "^  \['"      -> 11     (blok WEB)
$ sed -n '529,700p' catalog.ts | sed -n '/^\];/q;p' | grep -c "^  '[a-z]"  -> 26  (TOOL_DIKIRIM_SELALU)
$ sed -n '69,560p' catalog.ts | grep -c "^  \['"       -> 68     (seluruh TOOL_CATALOG)
```

### 1.4 Angka yang benar (per 2026-10-14)

| Ukuran | Angka | Asal |
|---|---|---|
| **Katalog total** | **68** | `TOOL_COUNTS.total` = `TOOL_CATALOG.length` = `TOOL_NAMES.length` |
| builtin | **43** | blok `BUILTIN` (`catalog.ts:69-176`) |
| mcp | **14** | blok `MCP` (`catalog.ts:177-225`) |
| web | **11** | blok `WEB` (`catalog.ts:226-251`) |
| inti (builtin+mcp) | **57** | `TOOL_INTI` / `TOOL_BAWAAN_AKTIF` |
| **selalu dikirim per request** | **26** | `TOOL_DIKIRIM_SELALU` (`catalog.ts:529`) |
| web aktif-default | **6** | `_WEB_AKTIF` / `TOOL_WEB_AKTIF_AWAL` (profil baru) |
| **aktif-default app** | **63** | `TOOL_AKTIF_AWAL` = `TOOL_INTI` 57 + `_WEB_AKTIF` 6 (`toolGate.ts:186-189`) |
| `zephyr_kode` di katalog | **ada** | `TOOL_NAMES.includes('zephyr_kode')` = true |
| kesehatan katalog | **bersih** | `periksaKatalog()` → `[]` |

Angka lama yang beredar di dokumen: **66** (plan-kerja: "66 menu / 25 dikirim"), **67** (katalog),
**62** (aktif-default), **17** (komentar `TOOL_DIKIRIM_SELALU (17)`), **53** (usulan nama tool).
Selisihnya = **+1 tool `zephyr_kode`**.

---

## 2. Tabel temuan (berkas:baris → lama → baru → dasar bukti)

### 2.1 Dikoreksi (klaim hidup / tabel angka, `docs/*.md`)

| berkas:baris | angka lama | angka baru | dasar bukti |
|---|---|---|---|
| `docs/plan-kerja.md:49` | `## B. Tool AI (66 menu / hanya 25 dikirim per request)` | `## B. Tool AI (68 tool / hanya 26 dikirim per request)` | §1.1/§1.2 (`TOOL_COUNTS`, `TOOL_DIKIRIM_SELALU`) |
| `docs/plan-kerja.md:51` | `BUILT-IN 52 (41+11) + MCP 14 = 66; nyala 61 ... hanya 25 dikirim` | `BUILT-IN 54 (43+11) + MCP 14 = 68; nyala 63 ... hanya 26 dikirim` + blok riwayat angka | §1.1–§1.4 |
| `docs/plan-kerja.md:55` (B1) | `angka panel yang benar: 66` | `**68**` (+ "dulu tertulis 66") | §1.2 |
| `docs/ANAK-AGEN-PERILAKU.md:9` | `katalog 67 tool, aktif-default 26` | `katalog **68** tool, kirim-selalu **26**` + catatan (aktif-default app = 63) | §1.4 |
| `docs/AUDIT-TOOL-BERKAS-2026-10-14.md:15-16` | `Total katalog tool 67 (builtin 42 …)` / `TOOL_AKTIF_AWAL 62` | `68 (builtin 43 …)` / `63` (+ catatan) | §1.1, §1.2, `toolGate.ts:186` |
| `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md:29` | `total tool 67 (builtin 42 / mcp 14 / web 11)` | `68 (builtin 43 / mcp 14 / web 11)` | §1.1 |
| `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md:36` | `jumlah nama tool sebelum → sesudah 67 → 53` | `68 → 54` (+ "dulu, basis audit 67: 67 → 53") | basis 68; konsisten `docs/LAPORAN-BACA-KODE-SAMBUNG.md:286` (`68 -> 54`) |
| `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md:120` (blok gerbang) | `nama tool : 67 -> 53` | `nama tool : 68 -> 54` (+ komentar `# dulu … 67 -> 53`) | idem |
| `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md:152` | `inventaris 67 tool + 47 kapabilitas` | `inventaris 68 tool (dulu 67) + 47 kapabilitas` | §1.1 |
| `docs/LAPORAN-JANGKAUAN-TOOL.md:66` | `Angka katalog … 67 tool = builtin 42 / mcp 14 / web 11` | `68 tool = builtin 43 / mcp 14 / web 11` (+ catatan atas kepala harness `:43`) | §1.1, §1.2 |
| `docs/LAPORAN-SUBSET-SAMBUNG.md:53` | `gerbang nyata app = 62 tool aktif (TOOL_BAWAAN_AKTIF + TOOL_WEB_AKTIF_AWAL)` | `63 tool aktif (TOOL_INTI 57 + _WEB_AKTIF 6, toolGate.ts:186)` | §1.2, `toolGate.ts:186-189` |
| `docs/LAPORAN-SUBSET-SAMBUNG.md:63` (judul §3) | `26 (acuan/audit) vs 62 (gerbang nyata)` | `26 (acuan/audit) vs **63** (gerbang nyata)` + catatan penjelas (62 = saat laporan dibuat) | §1.2 |
| `docs/LAPORAN-SUBSET-SAMBUNG.md:73` (tabel basis) | `gerbang nyata app 62 tool aktif (bawaan + web)` | `63 tool aktif (inti + web) — dulu 62` | §1.2 |
| `docs/LAPORAN-VONIS-IZIN.md:104` | `dua basis (aktif-default 62 tool, katalog penuh 67 tool)` | `(… 63 tool … 68 tool …; saat ukuran di §4 diambil angkanya masih 62 dan 67)` | §1.2 |
| `docs/LAPORAN-VONIS-IZIN.md:167` | `basis aktif-default, 62 tool` | `63 tool — saat diukur 62` | §1.2 |
| `docs/LAPORAN-VONIS-IZIN.md:178` | `Basis katalog penuh (67 tool)` | `(68 tool — saat diukur 67)` | §1.2 |
| `docs/UKUR-MUTU-JAWABAN.md:58` (rubrik A7) | `zephyr_self`, `67` (indeks kategori `tool`) | `zephyr_self`, `68` (dulu 67 — indeks sudah di-regen 2026-10-14) | `src/lib/zephyrIndeks.ts:3` → `tool=68` |
| `docs/LAPORAN-BACA-KODE-SAMBUNG.md:342-344` | "angka hardcode dokumen generator (`docs/plan-kerja.md`, `zephyrDokumenData.ts` menulis 66 tool) — sengaja tidak disentuh" | plan-kerja **sudah dikoreksi**; sisa = keluaran generator (`zephyrDokumenData.ts`, `zephyrFakta.ts`, `zephyrIndeks.ts`) | §3, §4 |
| `docs/USULAN-BACA-KODE-SAMBUNG.md:44` | `plan-kerja.md dan zephyrDokumenData.ts masih menyebut "66 tool"` | plan-kerja sudah dikoreksi; yang tertinggal = keluaran generator | §3, §4 |
| `docs/USULAN-JANGKAUAN-TOOL.md:196-198` | `Angka hardcode di dokumen generator — plan-kerja.md, zephyrDokumenData.ts, zephyrIndeks.ts` | dipisah: `plan-kerja.md` (dokumen, sudah dikoreksi) vs keluaran generator | §3, §4 |
| `docs/USULAN-JANGKAUAN-TOOL.md:205` | `Baris kepala katalog: 67 tool juga akan berubah menjadi 68` | `**sudah** berubah menjadi katalog: 68 tool` (rujuk `LAPORAN-BACA-KODE-SAMBUNG.md:46/:173`) | grep `katalog: 68 tool` |

### 2.2 Kutipan verbatim / keluaran historis — **tidak diubah**, diberi catatan bertanggal

Kutipan keluaran harness adalah **bukti**; mengubahnya = memalsukan bukti. Penanganan: satu blok
"Catatan angka (diperbarui 2026-10-14)" di dekatnya, menyebut angka baru + sebab selisihnya.

| berkas:baris | isi lama (dibiarkan) | penanganan |
|---|---|---|
| `docs/STATUS-GATE.md:12` | blok sapuan 2026-10-14 06:06–06:20 | catatan bertanggal ditambahkan **sebelum** tabel gerbang |
| `docs/STATUS-GATE.md:57-58` | `katalog : 67 tool (builtin 42 …)` / `aktif default : 62 tool` | verbatim; dijelaskan oleh catatan `:12` |
| `docs/STATUS-GATE.md:138,155` | `… tool=67` (cakupan indeks) + tabel rekap `tool=67` | verbatim; snapshot **indeks basi** (skripnya sendiri bilang `indeks basi … perbaikan: node scripts/gen-fakta-zephyr.mjs`); indeks kini `tool=68` |
| `docs/AUDIT-TOOL-BERKAS-2026-10-14.md:205-206` | `katalog : 67 tool (builtin 42 …)` / `aktif default : 62 tool` | verbatim + catatan bertanggal di `:26-32` |
| `docs/AUDIT-KATALOG-TOOL.md:11` (catatan) / `:13-27` | `builtin: 42 … TOTAL katalog: 67 … aktif default: 62 (inti 56 + web-aktif 6)` | catatan bertanggal; `DIKIRIM_SELALU : 26` di keluaran itu **sudah benar** |
| `docs/AUDIT-KATALOG-TOOL.md:317` | `Sinkron katalog ↔ handler: 67/67` | verbatim (sekarang 68/68 bila dijalankan ulang) |
| `docs/AUDIT-KATALOG-TOOL.md:403` | `builtins.ts:323 "TOOL_DIKIRIM_SELALU (17)"` + `toolGate.ts:178 "40 inti + 4 web baca-saja = 44"` | verbatim; lihat §4 (komentar `src/` masih basi) |
| `docs/LAPORAN-JANGKAUAN-TOOL.md:43` | `katalog: 67 tool \| BATAS_TOOL_TUGAS=20` | verbatim + catatan di `:68-73` |
| `docs/LAPORAN-SUBSET-SAMBUNG.md:96` | `katalog=67 tool, aktif-default=26, batas per giliran=20` | verbatim; dijelaskan catatan `:64-68` |
| `docs/LAPORAN-SUBSET-SAMBUNG.md:122` | `aktif: 62 tool, 5 di antaranya web …` | verbatim; dijelaskan catatan `:64-68` |
| `docs/VERIFIKASI-SISA-2026-10-14.md:11` (catatan) / `:127,172,198,272,273,419,601,635,685` | kutipan per skrip: `semua 67 tool OK`, `T1 67 tool di katalog`, `katalog=67 tool`, `67/67/67`, … | catatan bertanggal di atas §1; baris-barisnya verbatim |
| `docs/CATATAN-KEPUTUSAN-SESI-2026-10-14.md:201` | `indeks … tool=67`, `6.192 entri` | catatan bertanggal di `:206-209` (indeks kini **6.254 entri**, `tool=68`) |
| `docs/LAPORAN-AKAR-MERAH.md:49` | `T1–T3 lulus (67 tool, 0 deskripsi kosong)` | tidak diubah (kutipan keluaran skrip saat app mati); angka benar sekarang = 68 |
| `docs/USULAN-BACA-KODE.md:92` | usulan lama: `agentTools.ts:6 tepat 65 tools → tepat 66 tools` | tidak diubah (usulan historis); kenyataan sekarang **68** (lihat §4) |
| `docs/LAPORAN-BACA-KODE-SAMBUNG.md:46,173,313,325` & `docs/LAPORAN-FETCH-WEB-HTTPS.md:138` | `katalog: 68 tool` | **sudah benar** — tidak disentuh |

Catatan: `docs/VERIFIKASI-SISA-2026-10-14.md` (ledger 571 skrip) sengaja hanya diberi **satu** catatan
di kepala, bukan 9 suntingan — isinya arsip pengukuran, bukan klaim keadaan sekarang.

---

## 3. Berkas dokumen yang saya ubah

1. `docs/plan-kerja.md` (3 suntingan angka)
2. `docs/ANAK-AGEN-PERILAKU.md` (1 + catatan)
3. `docs/STATUS-GATE.md` (catatan bertanggal)
4. `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` (tabel angka + catatan)
5. `docs/INVENTARIS-DAN-DUPLIKAT-TOOL.md` (4 suntingan)
6. `docs/LAPORAN-JANGKAUAN-TOOL.md` (prosa angka + catatan)
7. `docs/LAPORAN-SUBSET-SAMBUNG.md` (judul + prosa + tabel + catatan)
8. `docs/LAPORAN-VONIS-IZIN.md` (3 suntingan)
9. `docs/LAPORAN-BACA-KODE-SAMBUNG.md` (butir 4: pemisahan dokumen vs keluaran generator)
10. `docs/USULAN-BACA-KODE-SAMBUNG.md` (§3)
11. `docs/USULAN-JANGKAUAN-TOOL.md` (butir 1 + butir 3)
12. `docs/AUDIT-KATALOG-TOOL.md` (catatan bertanggal)
13. `docs/VERIFIKASI-SISA-2026-10-14.md` (catatan bertanggal)
14. `docs/CATATAN-KEPUTUSAN-SESI-2026-10-14.md` (catatan bertanggal)
15. `docs/UKUR-MUTU-JAWABAN.md` (rubrik A7)
16. **`docs/LAPORAN-ANGKA-DOKUMEN-TOOL.md`** (berkas baru — dokumen ini)

Tidak ada klaim lain yang diubah (bukan angka tool): cap 20 tool/giliran, 26 `DIKIRIM_SELALU`,
47 kapabilitas, `zephyr_self`/`ingat`, dll dibiarkan apa adanya.

---

## 4. SISA — yang TIDAK boleh saya sentuh (bukan `docs/*.md`)

Ini **keluaran generator / kode**, bukan dokumen. Angkanya masih tertinggal dan butuh pemiliknya.
Baris-baris ini **read-only** bagiku (item ini hanya memiliki `docs/*.md`).

| berkas:baris | isi | kenapa tidak disentuh | siapa yang harus memperbarui |
|---|---|---|---|
| `src/lib/zephyrDokumenData.ts:246` | embed §1 `AUDIT-KATALOG-TOOL.md`: `TOTAL katalog : 67`, `aktif default : 62 (inti 56 + web-aktif 6)`, `builtin : 42` | **keluaran generator** (embed dokumen: 378 entri `["docs/…", judul, baris_awal, baris_akhir, isi]`); menyunting tangan = melanggar aturan pipeline | `scripts/gen-fakta-zephyr.mjs` (dijalankan pemilik pipeline) |
| `src/lib/zephyrDokumenData.ts:254,261,271` | embed `AUDIT-TOOL-BERKAS-2026-10-14.md` §6/§3/§8 termasuk `katalog : 67 tool`, `aktif default : 62 tool` | idem (isi + rentang baris ikut basi setelah dokumen aslinya disunting) | idem |
| `src/lib/zephyrIndeks.ts:3` | `… kode=429, … tool=68` | indeks **sudah segar** (`tool=68`) — **tidak ada masalah**; dicatat supaya tidak dianggap salah | — (tidak perlu) |
| `src/lib/zephyrFakta.ts` | fakta turunan indeks | keluaran generator; **dilarang** disunting tangan | `scripts/gen-fakta-zephyr.mjs` |
| `src/lib/zephyrTools/builtins.ts:331` | komentar: `TOOL_DIKIRIM_SELALU (17) ride every request` — **sekarang 26** | `src/**` = bukan milikku | pemilik item kebersihan komentar (`docs/plan-kerja.md` §B item **B1** "komentar basi") |
| `src/lib/toolGate.ts:178` | komentar: `Tool yang nyala pada profil baru: 40 inti + 4 web baca-saja = 44` — **sekarang 57 + 6 = 63** | idem | idem (tercatat juga di `docs/AUDIT-KATALOG-TOOL.md:403`) |
| `src/lib/agentTools.ts:6` | komentar: `Registry ini terdiri dari tepat 65 tools` — **sekarang 68** | idem | idem (usulan lama di `docs/USULAN-BACA-KODE.md:92`) |

Ringkas: **satu regenerasi pipeline** (`node scripts/gen-fakta-zephyr.mjs`) akan memperbarui
`zephyrDokumenData.ts` + `zephyrFakta.ts`; tiga komentar `src/` butuh item kebersihan komentar
(plan-kerja §B/B1). Keduanya **bukan** lingkup `angka-dokumen-tool-68`.

---

## 5. Perintah ulang (semuanya offline, node murni)

```bash
# 1. hitung entri katalog dari berkas (read-only)
node C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/hitung-angka-tool.mjs
# 2. bukti runtime: bundle catalog.ts (esbuild dari D:/Zephyr) lalu baca TOOL_COUNTS dkk
node C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/bukti-runtime-tool.mjs
# 3. cross-check grep
cd /d/Zephyr/src/lib/zephyrTools && sed -n '69,176p' catalog.ts | grep -c "^  \['"
```

Tidak ada generator repo yang dijalankan; app tidak dibutuhkan (`CDP :9223` mati) — kedua skrip
bukti berjalan tanpa app.
