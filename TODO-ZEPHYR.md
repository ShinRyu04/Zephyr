# TODO Zephyr — sesi 30 Sep 2026

Catatan: tool `todo_list` di Hermes tidak bisa update status (bug), jadi file ini
yang jadi acuan. Tanda `[ ]` = belum, `[x]` = sudah, `[~]` = sebagian.

---

## 0. BATCH SEKARANG — permintaan user (30 Sep)

### 0.A SELESAI (verified)

| # | Item | Kondisi | Bukti |
|---|---|---|---|
| 0A1 | **Model menu unified** (Follow chat + panel subagents + Header AI) | `[x]` | `ModelMenu.tsx` 258 baris baru. **Verified DOM**: Follow chat grup 3 · item 20 · ikonSvg 22 · cek ✓ · cari ✓; panel subagents grup 3 · item 20 · ikonSvg 22 · rect 320×420 · tidak ketimun. **Verified visual (vision)**: grup "CUSTOM (OPENAI-COMPATIBLE)", ikon per model (bintang/paus/spark/api + badge inisial), checkmark, search |
| 0A2 | **Prompt AI gaya manusia/gaul** | `[x]` | `systemPrompt.ts` +3 aturan: "Tulis seperti manusia, bukan brosur" · "Boleh santai: 'oke', 'nah', 'ini masalahnya'" · "Jangan ngobrol kosong" |
| 0A3 | **Teks UI ringkas** | `[x]` | "Ask anything about this code." → "Ask about this code." · "A bash block runs in the terminal." |
| 0A4 | **Activity Bar: bintang → robot** | `[x]` | `ActivityBar.tsx` ikon `ai` diganti robot head (antenna + 2 mata + mulut) |
| 0A5 | **Composer: model ditukar ke depan** | `[x]` | `AiPanel.tsx` urutan `ModeMenu, IzinMenu, ModelSelector` → `ModelSelector, ModeMenu, IzinMenu` |
| 0A6 | **Queue/antrian** | `[x]` | Sudah ada di `aiStore.ts` (`antrian/buangAntrian/kosongkanAntrian`) + UI `ai-antrian` |
| 0A7 | **Ikon `search`** | `[x]` | `AiIkon.tsx` case baru |

### 0.B SEDANG JALAN — belum verified

| # | Item | Kondisi | Catatan |
|---|---|---|---|
| 0B1 | **Dropdown ganti sesi di header chat** | `[x]` | **Verified DOM**: judul = BUTTON, menu fixed 300px, 3 baris, cari ✓, baru ✓, tidak ketimun ✓, 3 tombol hapus |
| 0B2 | **CSS `.ai-sesi-*`** | `[x]` | `src/styles/ai-sesi.css` 188 baris; hapus hover-reveal (opacity 0 → 1) |
| 0B3 | **i18n kunci dropdown sesi** | `[x]` | `No chats match.` 10 bahasa; 1275 kunci sinkron |

### 0.C DARI GAMBAR REFERENSI (thinking)

| # | Item | Kondisi | Catatan |
|---|---|---|---|
| 0C1 | **Thinking berwarna-warni** | `[x]` | **Verified**: 8 dot, 5 warna berbeda (merah/biru/hijau/biru-muda/ungu), border-radius 50% |
| 0C2 | **Thinking beranimasi** | `[x]` | `dot-wave` (naik 1.5px + scale 0.75→1.25) + `ai-dots-breathe` strip. Verified transform bergerak |
| 0C3 | **Thinking header + durasi** | `[x]` | Sudah ada (`ReasonedBlock`: `Thinking… Ns` + chevron + collapse); ikon bintang → robot |
| 0C4 | **Tool call row** | `[x]` | **Verified**: badge `210ms`/`4.2s`, ikon per jenis, label manusiawi. `ms` di `AgentToolRun` + `mulaiTool` di aiStore |
| 0C5 | **Tool call card Input/Output terpisah** | `[x]` | Sudah ada: args + `ai-toolrun-out` + Copy + Open in terminal |
| 0C6 | **Inline code chip** di thinking | `[x]` | **Verified**: `.ai-inline` bg rgb(33,38,45) + Consolas; `.ai-file-ref` klik buka editor |
| 0C7 | **File edit chip** | `[x]` | **Verified**: `⠿src/lib/types.ts` + grip + 34/34 tool punya label |

### 0.D BELUM DIKERJAKAN

| # | Item | Catatan |
|---|---|---|
| 0D1 | **Terminal shell dirombak** | User: *"UI terminal shell sih zeph msh jelek bnget, bisa di rombak dan bgusin ga?"* — **jawaban: ya** |
| 0D2 | **Menu kiri AI Assistant dibagusin** | Belum diputuskan |
| 0D3 | **Voice input dicek** | Ikon mic ada, fungsi belum diverifikasi |
| 0D4 | **Rename sesi** | Usul asisten, belum ada |

---

## A. Batch sebelumnya — SELESAI

| # | Item | Kondisi | Bukti |
|---|---|---|---|
| A1 | **Fitur Schedule** | `[x]` | `schedStore.ts` + `SchedPanel.tsx` + `sched.css`; CRUD verified: bikin → disk `cron.json` + `last_run` terisi; toggle `true→false`; hapus → disk `[]` |
| A2 | **Fitur Debug di AI** | `[x]` | `aiDebugStore.ts` + `DebugPanel.tsx` + `ai-debug.css`; verified "1 logged", status ok, 2 msgs/7.316 chars/3.9s/56 chunks |
| A3 | **Fitur Tools di AI** | `[x]` | `ToolGatePanel.tsx` + `toolGate.ts` + `tool-gate.css`; verified 560×460, 34 tool/10 grup, scrim, auto-focus, "34 of 34 on" |
| A4 | **Tab melayang** | `[x]` | Scrim + shadow + `Esc` tutup + auto-focus |
| A5 | **Robot subagents** | `[x]` | 16px (dari 30→22→16); animasi semua status verified (`robot-hue`/`robot-breathe`/`robot-blink`) |
| A6 | **Hemat RAM** | `[~]` | **AKAR**: `additionalBrowserArgs` hilang dari `tauri.release.conf.json`. Baseline **621 MB** → flag aktif **461 MB** (8-9 proses). Perlu build rilis + ukur ulang |
| A7 | Model picker modal new subagent | `[x]` | Dropdown custom 669×300, 21 model, auto-fetch, label fallback |
| A8 | Model picker subagents kekecilan | `[x]` | `min(520px)`, min-width 340px, auto-fetch → 19 model |
| A9 | **⚠️ JANGAN PLAGIAT** | aturan | Ambil pola UX, bukan aset/teks/gaya brand lain |
| A10 | **Store `toolGate.ts`** | `[x]` | 30 tool / 10 grup · `active/cari/buka/tutup` · toggle/setGrup/semua/dari |
| A11 | Custom subagent: model belum bisa diatur | `[x]` | Verified end-to-end: pilih deepseek → label berubah → simpan → disk `model: 'deepseek-v4.1-flash'` |
| A12 | Kartu custom subagent kekecilan | `[x]` | Model jadi kolom sendiri, verified 133×22 tidak terpotong |
| A13 | Tombol maximize panel AI | `[x]` | Verified: klik → 340px → **1224px**, restore → 340px |
| A14 | Header AI rata kanan | `[x]` | AKAR `margin-left: 0` → `auto`; verified 7px dari tepi kanan |
| A15 | Customize Layout ketimpa | `[x]` | AKAR `z-index: 80` di bawah panel AI → `660` |
| A16 | Menu Follow chat ketimun | `[x]` | AKAR `.sub-daftar` scroller `max-height:132px`; fix `position: fixed` + rect |
| A17 | Menu model panel subagents ketimun | `[x]` | `fixed` + rect; verified `menuDiatas: YA` |
| A18 | `opsiModel` useMemo deps salah | `[x]` | deps `[keys, baseUrlOv]` → `[providerSiap, remoteUi]` |
| A19 | Audit menu dropdown lain | `[x]` | `.ai-model-menu` 321×420 OK · `.ctx-pop` 236×182 OK |
| A20 | **Notes & Todos** | `[x]` | `notesTodosStore.ts` (159) + `NotesPanel.tsx` (466) + `notes-todos.css` (410); verified: todos 2, toggle selesai, pin naik ke atas, notes 1, tab Schedule ada form |
| A21 | **Tooltip custom `Tip.tsx`** | `[x]` | Native `title=` nutupin tombol → custom di atas, `pointer-events: none`, delay 420ms |
| A22 | **Schedule balik melayang** | `[x]` | `SchedPanel.tsx` direwrite; dihapus dari Settings; `sched-section.css` + importnya dibersihkan |

## B. Verifikasi lama

| # | Item | Kondisi | Catatan |
|---|---|---|---|
| B1 | Verifikasi model picker subagent | `[x]` | 19 model, `terpotong: false` |
| B2 | Verifikasi ikon baru terlihat | `[~]` | `@` 829 ok · explorer ok · slash 18/18 ok; **robot belum diverifikasi ulang** |
| B3 | Rebuild binary (DSML fix) | `[x]` | `cargo build` OK, **12/12 test lulus** |
| B7 | DSML bocor saat STREAMING | `[x]` | AKAR `ai.rs:629` kirim chunk mentah. Fix: tahan chunk yang mungkin awal tag |
| B8 | `\|\|DSML\|\|` ASCII tidak dinormalisasi | `[x]` | AKAR early-return kalau tidak ada fullwidth. Fix: cek `ada_ganda` dulu |
| B4 | Cek sisa TODO | `[x]` | Audit selesai |
| B5 | Editor custom subagent | `[x]` | Form terisi, Save, 24 field |
| B6 | Slash command render ikon | `[x]` | 18 command, 18 ikon, 10 warna, `tanpaIkon: 0` |

## C. Aset yang SUDAH ada (jangan bikin ulang)

| Aset | Lokasi | Status |
|---|---|---|
| 30 tool AI | `src/lib/agentTools.ts` (1036 baris) | ADA — `shell_exec`, `file_read/write/edit/patch`, `todo_write/read`, `cron_create/list/delete`, `browser_*`, `web_search/fetch`, `subagent_run`, `mcp_call`, `skill_*`, `memory_*` |
| Todo panel | `src/components/ai/TodoPanel.tsx` (74 baris) | ADA |
| Cron tool | `agentTools.ts` → `cron_create/list/delete` | ADA (backend), UI via NotesPanel |
| Debug toolbar | `src/components/debug/DebugToolbar.tsx` | ADA (DAP debugger — BUKAN debug AI) |
| 7 tab panel | `src/lib/panelStore.ts` | problems, output, debug, terminal, ports, ai, subagents |
| Ikon file | `material-icon-theme@5.38.1` | 834 ikon · 1377 ekstensi · 2135 nama file |
| Ikon model | `src/lib/modelCatalog.tsx` → `ModelLogo`/`ProviderLogo` | ADA |
| Robot subagent | `SubAgentPanel.tsx` + `ai-icons.css` | ADA |

## Selesai (batch lama)

| # | Task | Bukti |
|---|---|---|
| 1 | Custom sub-agents: store + modal | ada |
| 2 | Persona + tombol '+ New persona' | ada |
| 3 | Subagent resume | ada |
| 4 | Badge model per-baris subagent | verified |
| 6 | i18n semua teks baru 10 bahasa | 1274 kunci sinkron |
| 7 | Subagent dengan provider asli | verified: selesai 1s, 2 langkah |
| 8 | Bug 'Open log folder' | verified: `revealPath` benar |
| 9 | Provider custom tanpa key/URL | verified: `providerSiap` cek key + URL |
| 10 | Ghost text / inline AI suggestion | ada: `ghostText.ts` 214 baris + toggle |
| 11 | Form "New agent" + icon picker 6 preset | verified: 6 ikon, 34×34 |
| 12 | Logo robot + animasi warna subagents | ada (16px) |
| 13 | @ picker: ikon asli per tipe file | SELESAI — 829 ikon |
| 13b | @ picker: jumlah item | SELESAI — 201 item + scroll |
| 13c | Explorer: ikon asli | SELESAI — Material asli |
| 13d | Folder ikon spesifik | SELESAI |
| 14 | Animasi thinking (dot matrix 2×4) | SELESAI — `.ai-dots` 8 dot + 4 animasi |
| 15 | Slash `/` + ikon | SELESAI — 18 command |
| 16 | SFTP error | SELESAI — `sftpAvailable: true` |
| 17 | Dev env tidak deteksi | SELESAI — 5 runtime + 5 service |
| 18 | Custom subagent bisa EDIT | SELESAI |
| 19 | Marketplace +11 paket | SELESAI — 118 kartu |
| 20 | DSML fullwidth `｜` bocor | FIXED — 12/12 test |

## Bug besar yang ditemukan & difix

| Bug | Akar | Status |
|---|---|---|
| SFTP "OpenSSH not installed" | `sftp.rs` tidak di-`mod` di lib.rs | FIXED |
| Dev env semua `installed: false` | `devenv.rs` tidak di-`mod` di lib.rs | FIXED |
| `.ts` dapat ikon flutter | 3 map ditulis jadi 1 objek | FIXED |
| @ picker cuma 12 file | `MAKS = 12` + cache menyimpan hasil kosong | FIXED |
| Explorer ikon kotak teks | `FileIcon.tsx` gambar glyph sendiri | FIXED |
| Nama file dobel di @ picker | Kolom kedua cetak path penuh | FIXED |
| DSML `<｜｜DSML｜｜ calls>` bocor | FULLWIDTH `｜` U+FF5C vs parser ASCII | FIXED |
| Thinking cuma 1 dot | render 1 `<i />`, CSS butuh 8 | FIXED |
| Tema Malam duplikat | `.bundled/` + `extensions/` dua-duanya dibaca | FIXED |
| Marketplace pakai ID | frontend buang data registry | FIXED |
| Model picker subagent cuma 2 opsi | `remoteModels: {}` | FIXED |
| Agent lama simpan `custom-model` | Dibuat sebelum auto-fetch | FIXED |
| **Vite mati → React gagal render** | `sched-section.css` dihapus tapi import masih ada | FIXED |

## Temuan penting

- **verify16.mjs menghapus `models.providers`** — sudah difix: restore byte-exact + check `V6-pulih`.
- **baseUrl custom** = `https://modelrouter.web.id/v1`.
- **30 file `settings.json.broken-*`** — sampah verify16, sudah dibersihkan.
- **React duplicate key** di CommandPalette — sudah difix: 149→140 command.
- **`verify.mjs` `wait is not defined`** — sudah difix: verify 26/26, verify:04 17/17, verify:05 12/12, verify:06 12/12.
- **`__ZEPHYR_SETUI__` = `{ store, section, setSection, sections }`** — BUKAN `.getState()`.
- **`getBoundingClientRect` TIDAK bisa deteksi ketimun** → pakai `elementFromPoint`.

## Bug harness yang sudah difix

1. `verify.mjs` — `wait` helper hilang
2. `verify.mjs/04/05/08` — `JSON.stringify(Error)` = `{}` menyembunyikan error
3. `verify06.mjs` — `null.click()` di 3 tempat + `terminalTabs[0]` salah asumsi
4. `verify04.mjs` — `sleep` tetap → poll sampai tree render
5. `verify16.mjs` — penghapus baseUrl

## Temuan TERBESAR (batch lama)

**`devenv.rs` dan `sftp.rs` ada sebagai file tapi TIDAK PERNAH di-`mod` di `lib.rs`.**

Artinya dua modul itu tidak pernah di-compile, dan semua command-nya menjawab
"Command not found":

- SFTP: "OpenSSH client is not installed" padahal `ssh.exe` ADA
- Dev Env: semua runtime `installed: false` padahal file-nya ADA

Perbaikan: `mod devenv;` + `mod sftp;` + 13 command didaftarkan di
`generate_handler!`. Setelah build:

```
sftpAvailable : true
runtimes      : node 22.23.2, php 8.3.33, python 3.11.16, rust 1.98.0, git 2.55.0
services      : nginx, apache, mysql (MariaDB 11.4.4), postgres 18.6 (JALAN), redis 5.0.14.1
```

## Kondisi teknis saat ini

```
tsc              : 0 error (sebelum patch dropdown sesi)
Rust test        : adapters::xml_tools 12/12 lulus
i18n             : 1274 kunci × 10 bahasa sinkron (AR 1392)
vite             : hidup (localhost:5173 → 200)
app              : hidup (CDP 9223 → 200), flag RAM aktif
RAM              : 621 MB → ~461 MB (8-9 proses)
versi            : 1.1.12
HEAD             : 09112a0 (belum commit — sesuai perintah user)
```

## Aturan yang mengikat

1. **JANGAN commit / JANGAN build installer** tanpa perintah eksplisit.
2. **JANGAN upload ke Releases** sampai user selesai test.
3. **API key user JANGAN terbawa** saat rebuild (`secrets.json` keluar → balik).
4. **i18n**: setiap kunci baru wajib 10 bahasa (ID/EN/JA/KO/ZH/ES/FR/DE/PT/AR).
5. **Antislop-UI** wajib untuk edit UI; komentar dalam Inggris.
6. **Warna WAJIB token tema** (`--accent`, `--danger`, `--success`, `--syn-*`), bukan hex.
7. **Modul Rust baru WAJIB** didaftarkan `mod` + `generate_handler!` di `lib.rs`.
8. **Original Zephyr** — jangan plagiat aset/teks/gaya brand lain.
9. **Tanya dulu sebelum ubah** — user pernah marah karena build tanpa perintah.

---

## 1. BATCH BARU — permintaan user (30 Sep, lanjutan)

| # | Item | Catatan |
|---|---|---|
| 1.1 | **Ghost text / inline suggestion** — cek apakah ada saat mengetik kode | Ada `ghostText.ts` (214 baris) + toggle, perlu verify jalan |
| 1.2 | **Kutipan teks di atas (comment/docstring highlight)** | Foto `0da3e1` — referensi |
| 1.3 | **Animasi buka/tutup folder di Explorer** | Chevron putar + slide; Zephyr belum ada |
| 1.4 | **Indent guide berwarna di editor** | Foto: garis vertikal berwarna per level, Zephyr putih polos |
| 1.5 | **Bracket colorization** | Foto: kurung berwarna pasangan |
| 1.6 | **Thinking masih bulatan + biru** | Harus jadi warna-warni + animasi baru (belum berubah?) |
| 1.7 | **Queue — cara pakai tidak jelas** | Perlu UI/documentation di panel |
| 1.8 | **MCP sebagai tool di agent** | Tools Zephyr belum ada MCP; tambahkan |

---

## 2. BATCH BARU — permintaan user (30 Sep, lanjutan 2)

| # | Item | Catatan |
|---|---|---|
| 2.1 | **"Pojok kanan yang ada di TEDI, kenapa Zephyr gada?"** | Foto `f41a04`+`cc34c4`+`690c4c`: lihat panel kanan. Kemungkinan: sidebar kanan / secondary sidebar / outline |
| 2.2 | **Autocomplete/IntelliSense popup saat ngetik** | Foto `d2f818`: popup "import named / import default" + hint `Accept [Tab]` |
| 2.3 | **Inline hint "Accept [Tab] / Accept Word [Ctrl+Right]"** | Foto `8eef58`: bilah hint di atas ghost text, gaya Copilot |
| 2.4 | **UI Terminal dirombak** | Foto `690c4c`: panel TERMINAL dengan empty state, kartu agent CLI, footer shortcut |
| 2.5 | **UI Run & Debug dirombak** | Foto `b65b25`: label section, dropdown launch.json, tombol play, status |
| 2.6 | **UI Extensions (Installed/Recommended/Marketplace)** | Foto `35032f`+`b1f414`+`50106f`+`dcad33`+`2ef091`: 3 tab + search + kartu ekstensi |
| 2.7 | **Animasi folder di Explorer** | Foto `2ef091`: TEDI punya animasi buka/tutup folder |
