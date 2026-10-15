# Plan Kerja Zephyr — daftar lengkap A–F

> **STATUS: PLAN ONLY.** Nol perubahan kode dari dokumen ini.
> Eksekusi hanya setelah perintah eksplisit dari Ryu ("gas …").
> Dibuat 2026-10-13 · branch `feat/ai-panel-vscode-layout` · worktree ~190 perubahan, 0 staged.

## Aturan main (jangan dilanggar)

- Jangan commit / push tanpa diminta. **Jangan `git add -A`** (worktree kotor, banyak perubahan lain).
- Jangan hapus folder di `D:\Testing`. Port **9223** = debug WebView2, **9222** = MCP.
- Jangan tulis / tampilkan API key → `[REDACTED]`.
- Root-cause dulu; tes gagal → baca error asli, **jangan** ubah tes supaya lulus.
- 3 percobaan gagal → stop & lapor bukti. Jangan ganti model sebagai workaround.
- Kalau Ryu **bertanya** → jawab dulu, jangan langsung kerja.
- Sebelum operasi git berat: backup (`D:\Backups\Zephyr-RESCUE\zephyr-full-history.bundle`).
- `src/`, `src-tauri/`, `scripts/` **jangan pernah** masuk repo publik (lihat `docs/ATURAN-KERJA.md`).

Legenda: **P0** paling cepat/kerasa · **P1** penting · **P2** nanti · **❓** butuh keputusan Ryu · **✅** selesai

---

## F. Zephyr hidup kembali — ✅ SELESAI (2026-10-13)

| # | Item | Bukti |
|---|------|-------|
| F1 | `zephyr.exe` mati + CSS `extensions.css:169` punya `}` nyasar → postcss tolak seluruh berkas → Vite gagal compile → app mentok "Menyiapkan editor…" | 1 baris dihapus. Bukti: :9223 listening, overlay Vite hilang, `window.__ZEPHYR__` = true (61 bridge), UI render, panel ekstensi `Installed 0 / Recommended 0 / Marketplace 118`, error konsol `[]` |
| F2 | Proses dilepas dari Job Object sesi lewat `explorer.exe "D:\Zephyr\_dev-zephyr.bat"` | PID tercatat, port 9223 hidup |

Catatan: kerusakan CSS itu **sudah ada di worktree sebelum** sesi ini (file berstatus `M`), bukan akibat plan ini.

---

## A. Hapus nama TEDI — Plan B (sudah dipilih Ryu)

| # | Item | Berkas | Skala | Risiko |
|---|------|--------|-------|--------|
| A1 | `.tedi/` (33 berkas, ~324 KB, terlacak git, tidak di-ignore) → `git rm -r --cached .tedi` + hapus folder + `.tedi/` masuk `.gitignore` | `.tedi/`, `.gitignore` | S | rendah |
| A2 | Hapus `C:\Users\Zyrex\.cache\tedi` | luar repo | S | rendah |
| A3 | Hapus `scripts/hapus-tedi-docs.mjs` | scripts/ | S | rendah |
| A4 | Rename `docs/screenshots/14-subagent-tedi.png` + benerin `scripts/shot-subagent.mjs:62` | docs/, scripts/ | S | rendah |
| A5 | Buang kompat `mcp__tedi__` — **6 berkas / 9 titik**: `AlatIkon.tsx:69`, `agentTools.ts:137/141/148/152`, `mcpTools.ts:75`, `subagentStore.ts:359`, `catalog.ts:232`, `deskripsiTool.ts:637` | src/ | M | **TINGGI** — buang kompat mundur; `PROMPT-CLAUDE-DESKRIPSI.md:45` justru melarang |
| A6 | Update **6 script uji**: `uji-mcp-luar.mjs` (4x), `cek-nama-alat-hidup.mjs`, `verify-katalog-mcp.mjs`, `verify-deskripsi-tool-8bahasa.mjs`, `verify-tool-picker-51.mjs`, `shot-subagent.mjs` | scripts/ | M | sedang |
| A7 | Rapikan prosa: `TODO-ZEPHYR.md` (2), `PROMPT-CLAUDE-CODE.md` (1), `PROMPT-CLAUDE-DESKRIPSI.md` (2) | root | S | rendah |
| A8 | Verifikasi: `npx tsc --noEmit` 0 error, `cd src-tauri && cargo test --lib` lulus, 6 script hijau, grep presisi `(?<![A-Za-z])(?:tedi\|TEDI)(?![A-Za-z])` = nol | — | M | — |
| A9 | **Batas yang tidak bisa dibereskan:** riwayat git (8 commit) tetap memuat nama; bersihin = rewrite history (opsi C, ditolak). **JANGAN** hapus `AppData\Local\id.ilhamrisky.tedi` (aplikasi lain) | — | — | — |

---

## B. Tool AI (68 tool / hanya 20 dikirim per request)

Konteks (dihitung ulang 2026-10-15 lewat `node scripts/audit-katalog-tool.mjs`): BUILT-IN 54 (43 bawaan + 11 web) + MCP 14 = **68**; nyala 63, mati 5. Yang dikirim tiap request hanya **20** (`TOOL_DIKIRIM_SELALU`, `catalog.ts:529`); 48 sisanya on-demand via `tool_search` + `tool_call`. Arsitektur sudah benar → **tool TIDAK boleh dihapus permanen**.

> **Yang dimaksud "jangan hapus/gabung tool".** Kalimat ini sempat terbaca sebagai larangan memangkas daftar kirim, padahal masalah yang ditemui 2026-10-15 adalah **kebalikannya**: 26 skema per request membebani payload. Keputusan Ryu (**Opsi A**, 2026-10-15) karena itu adalah **menunda** 6 tool dari `TOOL_DIKIRIM_SELALU` ke `tool_search` — `skill_view`, `lsp_definition`, `run_subagents`, `bash_background`, `calculator`, `notes_read` (26 − 6 = 20), sambil `move_file` + `copy_file` disambungkan agar ikut dikirim. **Nol tool dihapus permanen**, `zephyr_self` tetap wajib ikut dikirim, dan penundaan itu otomatis (model menemukannya lewat `tool_search`, lalu wajib meneruskannya lewat `tool_call`). Jadi larangannya: **jangan menghapus tool dari katalog** — memangkas *daftar kirim* justru memangkas latensi dan ukuran payload, dan sudah terbukti bekerja.

> **Riwayat angka.** Dulu di sini tertulis BUILT-IN 52 (41+11) + MCP 14 = **66** dan "hanya **25** dikirim" (sebelum `zephyr_kode` masuk katalog) → **68** / **26** (2026-10-14) → **68** / **20** (Opsi A, 2026-10-15; diverifikasi `audit-katalog-tool.mjs` exit 0 + `npx tsc --noEmit` 0). Dokumen lain bertanggal lebih tua yang menyebut 66/67/25/26 adalah potret hari itu, bukan keadaan sekarang.

| # | Item | Prioritas | Catatan |
|---|------|-----------|---------|
| B1 | Komentar basi di `catalog.ts` (angka 29/43/54 di ±baris 255, 257, 285, 294, 477, 489) → hapus angkanya, rujuk `TOOL_COUNTS` | **P0** · ~5 mnt · risiko nol | angka panel yang benar: **68** (dihitung 2026-10-14 dari `TOOL_COUNTS`; dulu tertulis 66) |
| B2 | Dedupe `fetch` vs `web_fetch` — `catalog.ts:89`, `builtins.ts:1376`, `subsetAlat.ts:40`, `subagentCustom.ts:24/46`, `ChatMessage.tsx:291`, + deskripsi i18n + script uji | P1 ❓ | mana yang dipertahankan? |
| B3 | Peringatan/konfirmasi di tombol "All on" (+41 skema tiap request) | P1 | — |
| B4 | `POLA_AWALAN_MCP` didefinisikan **2x** (`catalog.ts:232` + `deskripsiTool.ts:637`) → satu sumber | P1 | — |
| B5 | Batasi jumlah tool dari MCP server pihak ketiga | P2 | nunggu |

---

## C. Ekstensi & Tema

**Fakta terverifikasi (2 sumber berbeda):**

(a) **Yang TERPASANG** — `installed.json` = `[]` (**0 ekstensi terpasang**). Folder `%APPDATA%\zephyr\extensions\.bundled\` cuma **21 folder sisa tulis-disk** (4 ikon · 4 keymap · 9 bahasa · 2 snippet · 2 tema).

(b) **Yang TAMPIL di panel ("Marketplace 118")** — ini daftar **katalog lengkap**, dibangun Rust di `src-tauri/src/ext_bundled.rs` (`index_bundled()`) + `ext_bundled_extra.rs`, **bukan file & bukan isi folder**. Hitungan pasti (verifikasi terakhir):

| Kategori | Jumlah | Status |
|---|---|---|
| Languages | **101** | ✅ semua mode ada di whitelist `MODE_LEGACY` (101/101) — **tapi 21 di antaranya merusak** (lihat C10/C11) |
| Snippets | **7** | ✅ 6 jalan; 1 cacat (C18) |
| Keymaps | **4** | ❌ hampir mati (2 dari 37 binding nyambung) |
| Icon Themes | **4** | ❌ mati total (nol konsumen UI) |
| Themes | **2** | ⚠️ cuma sebagian kebaca (C1/C2) |
| **TOTAL** | **118** | jalan sempurna **86** · mati total **8** · cacat **3** · aktif-tapi-merusak **21** |

Prinsip: dibereskan, **bukan** dibiarkan mati; pengecualian = 21 bahasa yang bentrok bawaan (dibuang, karena merusak).

### C-tema (2 paket)

| # | Item | Prioritas |
|---|------|-----------|
| C1 | Fix nama var: tema nulis `--syntax-*`, tapi di `tokens.css:124-130` `--syntax-*` itu **turunan** (`--syntax-keyword: var(--syn-keyword)`); sumber aslinya `--syn-*` (`var(--syn-*)` dipakai **53×** di CSS). Tema Kertas nulis 5 `--syntax-*`, Malam **0** → **warna sintaks editor tidak pernah berubah**. Fix = tulis `--syn-*`, bukan `--syntax-*` | P1, murah |
| C2 | Tema tidak menulis `--bg` (`var(--bg)` dipakai **77×**, `var(--bg0)` **55×**), padahal `tokens.css:18` `--bg0: var(--bg)` → latar utama tidak ikut ganti, cuma sebagian panel (`--bg0`) berubah → tema terlihat "setengah jalan" | P1 |
| C3 | `resolveTheme()` menolak tema light saat mode gelap **tanpa pesan** → beri tanda di UI | P1 ❓ |
| C4 | Palet nyaris kembar dengan bawaan: Malam `#0f1216` vs zephyr-dark `#0d1117`; Kertas `#faf7f0` vs zephyr-light `#ffffff` → tambah kontras atau dokumenkan sebagai contoh | P2 |

### C-kejujuran UI

| # | Item | Prioritas |
|---|------|-----------|
| C5 | Tampilkan `ringkasanLoader()` di panel ekstensi ("n kebaca · n tidak didukung · n gagal") — **datanya sudah ada**, sekarang cuma dipakai jembatan debug `devBridge.ts` | **P0 untuk keluhan "install kok gada perubahan"** |
| C6 | `catch {}` senyap di `muatTema`/`muatKeymap` → masukkan ke `gagal[]` supaya kelaporan | P2 |
| C7 | Bahasa yang di-skip (`if (langByExt.has(key)) continue`, install ≠ enable) → tampilkan alasannya | P2 |

### C-ikon (4 paket: bahasa, bulat, garis, titik)

| # | Item | Prioritas |
|---|------|-----------|
| C8 | **Mati total**: loader mengisi peta ikon, tapi `ikonUntukExt()` hanya dipakai `devBridge.ts` + `extLoader.ts` — **nol konsumen UI**. Benerin = ikon explorer/gutter baca peta ekstensi dulu, fallback ke `fileIcons.ts`. Alternatif: buang 4 paket | P1 ❓ |

### C-keymap (4 paket: emacs, ide, sublime, vim)

| # | Item | Prioritas |
|---|------|-----------|
| C9 | **Hampir mati**: 37 binding di 4 keymap, 28 command unik — **cuma 2 yang ada** di `commandRegistry.ts` (178 id): `editor.select.occurrences`, `workbench.action.togglePanel`. Sisanya command gaya VS Code (`workbench.action.quickOpen`, `workbench.action.files.save`, `editor.line.moveUp`, …) → dibuang `mergeBindings`. Benerin = peta alias nama VS Code → id Zephyr. Alternatif: buang 4 paket | P1 ❓ |

### C-bahasa (101 paket di katalog)

| # | Item | Prioritas |
|---|------|-----------|
| C10 | Balik presedensi di `lang.ts` `extLangUntuk()`: bawaan harus MENANG, ekstensi cuma gap-fill → stop downgrade **21 paket** (lihat C11) | P1 |
| C11 | Buang **21 paket bahasa yang bentrok bawaan** (ekstensi legacy mode mengalahkan mode kaya bawaan). Ekstensi bentrok: `lang-javascript` (.js/.jsx/.cjs/.mjs), `lang-clike` (.c/.cc/.cpp/.cxx/.h/.hpp), `lang-css`, `lang-go`, `lang-lua`, `lang-perl`, `lang-powershell`, `lang-properties`, `lang-python`, `lang-ruby`, `lang-rust`, `lang-sass`, `lang-shell`, `lang-sql`, `lang-swift`, `lang-toml`, `lang-xml`, `lang-yaml`, `lang-asterisk`, `lang-mirc`, `lang-ttcn-cfg` | P1 |
| C12 | Sisakan **80 paket yang beneran nambah** (apl, asciiarmor, brainfuck, haxe, clojure, cobol, erlang, haskell, julia, pascal, r, scheme, tcl, verilog, vhdl, z80, …) — semuanya lolos whitelist `MODE_LEGACY` | konteks |
| C13 | ✅ **TERJAWAB** — angka "101" = jumlah paket bahasa di katalog bundled (`PAKET_BAHASA` di `ext_bundled.rs`), **bukan** jumlah `MODE_LEGACY` (kebetulan sama 101) | ✅ tutup |
| C14 | ✅ **TERJAWAB** — sumber `.bundled` = `src-tauri/src/ext_bundled.rs` + `ext_bundled_extra.rs`; ditulis ke `%APPDATA%` oleh `extensions_write_bundled`, jadi **ada di repo & aman dari reinstall** | ✅ tutup |
| C18 | **Snippet JS cacat**: manifest daftar bahasa `javascript` + `javascriptreact`, padahal id Zephyr = `jsx` → ½ entri snippet JS tak pernah nyala | P2 |

### C-sampah

| # | Item | Prioritas |
|---|------|-----------|
| C15 | Hapus 6 skrip probe: `_cek-ext.mjs` … `_cek-ext5.mjs`, `_cek-url.mjs` | S, aman |
| C16 | Hapus `uji-bahasa.bf` di root repo | S, aman |
| ~~C17~~ | ~~5 paket ekstensi uji belum bersih~~ → **SUDAH BERSIH** (`installed.json` = `[]`) | ✅ tutup |

---

## D. HydraFusion

| # | Item | Status |
|---|------|--------|
| D1 | Benerin `scripts/cek-hydra-live.mjs` (mengasumsikan popup Chat Settings terbuka) | P2 |
| ~~D2~~ | Produk hijau: `tsc` 0 error, `cargo test --lib` 423/0, `uji-hydrafusion.mjs` 106/106 | ✅ tutup |

---

## E. Utang verifikasi

| # | Item | Status |
|---|------|--------|
| E1 | `HANDOFF-AI.md` (**di root**, bukan `docs/`) — verifikasi 14 item "sudah diperbaiki". **Verifikasi, jangan ulang** | P1 |
| E2 | Catatan konteks: worktree ~190 perubahan, 0 staged | — |
| E3 | **(temuan 2026-10-13, ✅ SUDAH BERES)** `tsc --noEmit` sempat lapor `SubAgentBar.tsx:434` pakai `tf(...)` tanpa definisi — snapshot itu **basi**: sekarang baris 15 berkas itu sudah punya `const tf = useTf();` (mtime 01:26:45, **bukan** dari sesi ini) dan `tsc --noEmit` = **0 error**. Tidak ada sisa utang tsc | ✅ tutup |

---

## Keputusan yang ditunggu Ryu

1. **C8 ikon** — pasang konsumen di UI, atau buang 4 paket?
2. **C9 keymap** — bikin peta alias command (rekomendasi, bikin Vim/Sublime/Emacs beneran jalan), atau buang 4 paket?
3. **C3 tema** — tema light saat mode gelap: tolak dengan pesan, atau paksa jalan?
4. **B2** — `fetch` atau `web_fetch` yang dipertahankan?
5. **G1 (baru, 2026-10-13) — ✅ DIPUTUS Ryu: HAPUS PERMANEN** ("loop nya hpus aja ,ga masalah ,kan ada konsep thinking jga"). Dicatat di list; **belum dieksekusi** — nunggu perintah "gas".
6. **H1 (baru, 2026-10-13)** — pengetahuan-diri Zephyr untuk AI: di-**generate** dari `types.ts` + `settings.rs` (ikut berubah sendiri, lebih mahal) atau blok tulis-tangan dulu + tes penjaga?
7. **H2** — seberapa luas? cuma daftar setting, atau + fitur (ekstensi/tema/keymap/tasks/hooks/MCP/subagent/loop/jadwal/debug/port)?
8. **I1 (baru, 2026-10-13)** — Language server: cuma **benerin teks saran** (murah), atau tambah **deteksi PATH internal** (`%APPDATA%\npm`, `go\bin`, `.cargo\bin`, `LLVM\bin`), atau sekalian **installer in-app** (unduh+ekstrak ke `data_dir/lsp/<id>/`)?
9. **J1 (baru, 2026-10-13)** — Tema: buang yang kembar (`min-light` identik + `github-dark` bg/text identik) saja, atau sekalian **sisakan ±5-6 tema inti** dan pindahkan sisanya jadi paket marketplace?
10. **J2** — urutan: setuju **C1+C2 dulu** (tema ekstensi baru benar-benar kebaca), baru pindah ke marketplace, baru buang?

## Sengaja TIDAK masuk plan (keputusan sadar)

- **Engine TextMate** — Zephyr tidak punya; grammar TextMate dari ekstensi tetap tidak bisa jalan. Itu arsitektur, bukan bug.
- **Rewrite riwayat git** untuk menghapus nama TEDI (8 commit) — risiko tinggi, opsi C ditolak.
- **`AppData\Local\id.ilhamrisky.tedi`** — aplikasi lain, jangan disentuh.
- **Hapus/gabung 20-an tool AI** — ditolak; desain kirim-inti + on-demand sudah benar.

## Urutan batch yang diusulkan

1. **Batch 1 — aman & cepat (~30 mnt, risiko nol):** C15 + C16 (sampah) + B1 (komentar basi) + D1 (script cek).
2. **Batch 2 — dampak ke keluhan "install kok gada perubahan":** C5 (ringkasan di UI) + C1 + C2 (tema) + C9 (keymap) + C10/C11 (bahasa) + C8 (ikon).
3. **Batch 3 — pembersihan TEDI:** A1–A8, lalu B3 + B4 + E1.
4. **Batch 4 (baru, permintaan Ryu 2026-10-13):** G1 (baris "Loop running") + H1 (pengetahuan-diri Zephyr buat AI).
5. **Batch 5 (baru, permintaan Ryu 2026-10-13):** I (language server: teks + deteksi PATH, lalu installer) + J (tema: kembar dibuang, sisanya jadi paket marketplace — **setelah** C1+C2).
6. **Butuh keputusan dulu:** B2, C3, C8, C9, G1, H1, H2, I1, J1, J2.

## Definisi selesai (tiap batch)

- `npx tsc --noEmit` → 0 error
- `cd src-tauri && cargo test --lib` → lulus
- script uji relevan hijau — **baca teksnya**, exit code pipeline bukan verdict
- khusus TEDI: grep presisi nama = nol

---

## G. Baris "Loop running" di atas composer — permintaan hapus permanen (Ryu, 2026-10-13)

Fakta terverifikasi (baca kode, bukan tebak):

| # | Fakta | Bukti |
|---|-------|-------|
| G1 | Baris itu bernama **"Loop running"** dan nongol di dalam blok status `ai-work-stack` di atas composer | `src/components/ai/AiPanel.tsx` — `<section … data-testid="ai-work-stack-loop">` **baris 1233**, judul `tr('Loop running')` **baris 1297**, tutup section **baris 1464** |
| G2 | **Gerbangnya `sibuk`, bukan state `/loop`** → muncul tiap agen jalan, walau user tak pernah pakai `/loop` | baris 1230 `{(!stackKosong \|\| todosAda) && (` → baris 1232 `{sibuk && (` → 1233; definisi `sibuk = pending \|\| agentBusy` baris 336; `stackKosong = !sibuk && backgroundCount === 0 && antrian.length === 0` baris 400 |
| G3 | Angka "· n runs" = **jumlah step agen** (`kind === 'mulai'`), bukan jumlah loop → satu giliran cetak `1 runs` | baris 366 `loopRuns = agentSteps.filter((step) => step.kind === 'mulai').length`; label baris 1298 `· {n} runs` |
| G4 | Komentar dev menyebut baris ini **sengaja di-scope** "hanya saat loop jalan" — dan yang dimaksud "loop" di situ adalah **run agen**, bukan fitur `/loop` | AiPanel.tsx baris 388–399: "It used to linger as 'Loop finished · 1 runs' above the composer… The row (and its step detail) now exists only while the loop is running" |
| G5 | Jejak kalau dihapus cuma **3 berkas** | `AiPanel.tsx` (gerbang 1232 → section 1233–1464) + `src/styles/ai-work-stack.css:145` + `scripts/cek-hydra-live.mjs:42` (query testid itu) |

Opsi (pilih satu — G1 di daftar keputusan):

- **(a) Hapus permanen** blok `{sibuk && (<section data-testid="ai-work-stack-loop"> … </section>)}` (1232–1465) + aturan CSS + perbarui script uji. Status agen tetap kelihatan dari baris status lain di stack yang sama + timeline step. **Ini yang diminta Ryu.**
- **✅ KEPUTUSAN Ryu (2026-10-13): pilih (a) — hapus permanen.** Kata-katanya: *"loop nya hpus aja ,ga masalah ,kan ada konsep thinking jga"*. **BELUM DIEKSEKUSI** — ini catatan list, bukan izin kerja; tunggu perintah "gas".
  Lingkup hapus (kalau nanti dikerjakan): judul `Loop running` + label `· {n} runs` + menu `⋯` / `Stop loop` (blok `ai-work-head` 1245–1343 di `AiPanel.tsx`); **isi panel JANGAN ikut** — bar `thinking` (ThinkingBar), baris tahap HydraFusion, fase/step/elapsed/durasi, prompt, dan cadence tetap hidup, karena itu "konsep thinking" yang Ryu maksud. Efek samping: state `loopBuka`, `loopMenuBuka`, `loopRuns` jadi tak terpakai dan **wajib ikut dihapus** (kalau tidak, `tsc` gagal karena `noUnusedLocals`); 3 berkas tersentuh = `AiPanel.tsx` + `ai-work-stack.css:145` (urutan section) + `scripts/cek-hydra-live.mjs:42` yang masih menguji baris itu.
- **(b) Benerin, jangan buang:** gerbangi ke state `/loop` asli (`loopJadwal.loopRunning()` / `useCliAgent.loops`), ganti nama jadi "Agent running", betulin pluralisasi `1 run` / `n runs`. Baris jadi jujur — tapi tetap nongol saat kerja.

## H. AI belum ngerti Zephyr sendiri — setting & fitur (Ryu, 2026-10-13)

| # | Fakta | Bukti |
|---|-------|-------|
| H1 | Pengetahuan AI soal Zephyr cuma **3 baris**: "editor desktop Tauri 2 + React + TS backend Rust; user lihat tab, pohon file, panel bawah, terminal" + aturan "pakai blok konteks" | `src/lib/systemPrompt.ts` blok `editorFakta` — EN baris 36–40, ID baris 127–131 |
| H2 | **Nol** di prompt soal: daftar setting & lokasinya (`src/lib/types.ts`, `src-tauri/src/settings.rs`), seksi Settings UI, ekstensi/marketplace (118 paket, cuma 5 jenis kontribusi didukung), aturan tema/keymap/bahasa, tasks/hooks/MCP/subagent/HydraFusion/`/loop`/jadwal, debug & port (9222 MCP, 9223 WebView2), keybinding, skill, persona, aturan tulis, i18n | `systemPrompt.ts` = aturan kerja + daftar alat; tak ada seksi produk |
| H3 | Akibat: pertanyaan "gimana nyetel X di Zephyr?" dijawab dari tebakan model → ngawur | konsekuensi H1+H2 |

Usul (H1/H2 di daftar keputusan):

- **Blok pengetahuan-diri yang di-generate dari sumber asli** (biar nggak basi): `src/lib/types.ts` (interface Settings + default) + `src-tauri/src/settings.rs` (`default_settings()`) + daftar seksi `src/components/settings/*` → indeks ringkas (**kunci → default → guna → seksi UI**) ditempel ke `editorFakta` EN + ID.
- **Aturan tambahan:** pertanyaan soal setting/fitur Zephyr yang nggak ada di blok → **BACA** `types.ts` / `settings.rs`, jangan ngarang.
- **Penjaga:** tes yang gagal kalau ada kunci setting baru yang belum masuk blok (opsi: generate saat build, atau tulis tangan + tes penjaga).

---

## I. Language server: install sering error (Ryu, 2026-10-13)

Konteks: screenshot Settings → **Language Servers**, 11 baris semua **merah dengan tulisan "Install: …"**. Keluhan: *"pas di install malah sering error, perbarui lagi cara installannya gimana"*.

Fakta (semua terverifikasi di kode):

- **I1.** Halaman: `src/components/settings/LanguageServersSection.tsx` — daftar baris datang dari **tabel statis** `LSP_SERVERS` (`src/lib/lsp.ts:20`), isi tiap baris: `label`, `langs`, `extensions`, `cmd`, `install`. Status diprobe lewat `useLsp.probeAll()` saat mount (`:74`) → Rust `lsp_probe` → `resolve_cmd` (`src-tauri/src/lsp.rs:136`).
- **I2. Zephyr TIDAK PERNAH meng-install apa pun.** Teks `Install: …` itu **saran statis** (field `install` di `lsp.ts`), bukan tombol yang mengerjakan sesuatu. Probe = pencarian PATH saja.
- **I3. Slot privat untuk server sudah ADA dan sudah dibaca resolver, tapi NOL kode yang pernah menulis ke sana.** `resolve_cmd` urut: (1) path absolut, (2) **`<data_dir>/lsp/<id>/<exe>` (+`.exe/.cmd/.bat`)** `lsp.rs:151`, (3) `node_modules/<exe>` workspace, (4) `node_modules/.bin/<exe>.{cmd,exe,bat}`, (5) `which::which(exe)` `:185` → kalau semua gagal: `"{exe} not found. Install the '…' language server onto PATH, or set the path to {data_dir}/lsp/<id>"` `:189`.
  Bukti nol penulis: `data_dir.join("lsp")` muncul **hanya 2×** di seluruh `src-tauri/src` — satu untuk **baca** kandidat (`:151`), satu di **teks error** (`:192`). Grep `npm i -g` / `npm install -g` / `winget` di seluruh `src-tauri/src` = **0 hasil**.
- **I4. Tiga saran install SALAH NAMA BINER → mustahil "found" walau user ikut instruksi persis.** Paket npm `vscode-langservers-extracted` menyediakan biner **`vscode-css-language-server`**, **`vscode-html-language-server`**, **`vscode-json-language-server`** (pakai tanda hubung sebelum `server`) — sumber: halaman npm paket tsb. `cmd[0]` Zephyr justru `vscode-css-languageserver` (`lsp.ts:109`), `vscode-html-languageserver` (`:100`), `vscode-json-languageserver` (`:82`) — **tanpa** tanda hubung. Efek: css/html/json tetap merah selamanya, walau `npm i -g vscode-langservers-extracted` sukses. (Di screenshot, baris **CSS** memang memakai hint itu.)
- **I5. Lima saran TANPA perintah sama sekali** (mustahil diikuti): csharp `lsp.ts:147` ("Install OmniSharp… and put it on PATH"), java `:138`, dart `:120`, lua `:165`, kotlin `:174` — semuanya hanya "Install X dan taruh di PATH".
- **I6. Saran lain perintahnya BENAR tapi binernya TIDAK masuk PATH proses app** (klasik "sudah di-install, masih not found"):
  - `winget install LLVM.LLVM` (`:65`) → `clangd.exe` mendarat di `C:\Program Files\LLVM\bin`; winget tak menambah PATH.
  - `go install golang.org/x/tools/gopls@latest` (`:56`) → `%USERPROFILE%\go\bin`, default belum di PATH.
  - `npm i -g …` (`:29` tsserver, `:38` pyright, `:74` bash-ls, `:129` php, `:92` yaml) → masuk `%APPDATA%\npm`; kalau prefix npm bukan di PATH **proses**, probe gagal walau biner ada di disk.
  - `gem install solargraph` (`:156`) → `%USERPROFILE%\.gem` / dir bin Ruby; sama.
  - rust `rustup component add rust-analyzer` (`:47`) → `.cargo\bin` (biasanya aman).
- **I7. Bahan untuk installer sendiri SUDAH ADA di repo:** `ureq = "3"` (HTTP) + `zip = "5"` (`src-tauri/Cargo.toml:39` dan `:56`), dan slot `data_dir/lsp/<id>/` sudah dibaca resolver (I3). Jadi installer yang mengunduh+ekstrak ke slot itu **langsung ketemu tanpa menyentuh PATH** — tak perlu minta user ngoprek PATH lagi.
- **I8. Kegagalan tampil menyesatkan.** Satu-satunya pesan adalah `not found` (I3) — user tak pernah diberi tahu **kenapa** (biner salah nama, PATH proses kosong, unduhan mati). Ini persis yang bikin "sering error"-nya terasa acak.

Pilihan (butuh keputusan I1):

- **(a) Benerin teks dulu — paling murah.** Perbaiki 3 nama biner (I4), isi perintah untuk 5 saran kosong (I5), dan sebut eksplisit kalau biner tak masuk PATH (I6: LLVM/go/gem/npm). Dampak: user yang ikut instruksi benar-benar ketemu.
- **(b) Deteksi PATH internal — penyelesaian langsung untuk "sudah install tapi not found".** Tambah kandidat cari di `resolve_cmd`: `%APPDATA%\npm`, `%USERPROFILE%\go\bin`, `%USERPROFILE%\.cargo\bin`, `C:\Program Files\LLVM\bin`, `%USERPROFILE%\.gem` (+ `npm prefix -g` / `go env GOPATH` dibaca sekali). Kecil, tanpa unduhan, tanpa restart.
- **(c) Installer in-app — yang bikin keluhan hilang total.** Tombol **Install** per baris → unduh arsip rilis (ureq) → ekstrak (zip) ke `data_dir/lsp/<id>/` → probe ulang otomatis → kalau gagal, tampilkan **alasan asli**. Perlu daftar URL+versi per server (11 server) dan penanganan unduhan gagal.

Saran urutan: **(a) + (b) dulu** (kecil, nol risiko, langsung mengubah "merah semua" → sebagian hijau), **(c)** batch terpisah karena butuh daftar URL yang harus dijaga tetap hidup.

## J. Tema: kurangi, pindahkan ke marketplace, buang yang kembar (Ryu, 2026-10-13)

Konteks: screenshot Settings → **Appearance**, **19 kartu tema**. Permintaan: *"tema lu kurangin lagi, masukin ke marketplace biar orang install, dan buang yang sama warnanya"*.

Fakta (hasil ukur ulang palet dari `src/styles/*.css`, tersimpan di scratch `tema_audit.json`):

- **J1. 19 tema, dan SEMUANYA masih bawaan aplikasi** — daftar di `src/lib/themes.ts:52–79`, palet hardcoded di CSS: `theme.css` (zephyr-dark, senja), `theme-light.css` (zephyr-light), `themes-extra.css` (15 tema), `a11y.css` (high-contrast). Lewat jalur ekstensi cuma **2** (`zephyr.tema-kertas`, `zephyr.tema-malam`) — itu sebabnya "masukin ke marketplace" belum ada jalurnya untuk 17 sisanya.
- **J2. KEMBAR IDENTIK → wajib buang: `min-light`.** Jarak RGB gabungan (bg+editor-aksen) = **0,0** terhadap `zephyr-light`: bg `#ffffff`, editor `#ffffff`, aksen `#0969da` — sama semua. Bedanya cuma `--text` (`#24292f` vs `#1f2328`), tak terlihat.
- **J3. KEMBAR NYATA → `github-dark` vs `zephyr-dark`.** bg **sama persis `#0d1117`**, text **sama persis `#e6edf3`**; aksen saja yang beda (`#58a6ff` vs `#3884ff`). Ini jawaban "tema kembar, gada bedanya". Pilihan: **buang `github-dark`**, atau ubah bg `zephyr-dark` jadi `#0f1216` supaya benar-benar beda.
- **J4. Pasangan dekat lain** (jarak RGB gabungan, kecil = makin mirip): `tokyo-night`↔`kanagawa` **33** · `dracula`↔`catppuccin-mocha` **34** · `zephyr-acrylic`↔`github-dark` **41** · `high-contrast`↔`github-dark` **46** · `tokyo-night`↔`one-dark` **47** · `zephyr-dark`↔`zephyr-acrylic` **58**. (Bukan kembar — masih bisa dibedakan; daftar prioritas kalau tetap mau dikurangi.)
- **J5. "Masukin ke marketplace" TIDAK bisa jalan sebelum C1+C2 beres.** Loader tema ekstensi cuma sebagian kebaca: C1 (nama var `--syntax-*` vs `--syn-*`) + C2 (tidak menulis `--bg`) → tema yang di-install bakal tampak "gada bedanya" lagi. **Urutan wajib: C1 + C2 → baru pindah ke marketplace → baru buang.**

Pilihan (butuh keputusan J1/J2):

- **(a) Minimal:** buang `min-light` (identik, J2) + `github-dark` (J3, sekalian ganti bg `zephyr-dark` ke `#0f1216` untuk menutup temuan C2). **19 → 17.**
- **(b) Ramping + marketplace:** sisakan **±5–6 tema inti** (Zephyr Dark, Zephyr Light, High Contrast, Nord, Tokyo Night, Senja), sisanya (Dracula, Catppuccin Mocha, Rosé Pine, Kanagawa, Everforest, Ayu Mirage, Gruvbox, One Dark, Acrylic, Solarized Light, Nord Light, Min Light, GitHub Dark) → **paket marketplace** yang bisa di-install/uninstall orang lain. Bergantung (J5): **setelah** C1+C2.
- **(c) Urutan:** setuju C1+C2 dulu → marketplace → buang?



## Lampiran — DAFTAR LENGKAP 118 katalog ekstensi

_Hasil hitung langsung dari `ext_bundled.rs` + `ext_bundled_extra.rs`. Kolom status = kondisi sekarang._

### Languages (101)

| # | id | nama | status |
|---|---|---|---|
| 1 | `zephyr.lang-apl` | Bahasa APL | ✅ jalan (nambah bahasa) |
| 2 | `zephyr.lang-asciiarmor` | Bahasa ASCII Armor | ✅ jalan (nambah bahasa) |
| 3 | `zephyr.lang-gas` | Bahasa Assembly (GAS) | ✅ jalan (nambah bahasa) |
| 4 | `zephyr.lang-asterisk` | Bahasa Asterisk | ⚠️ merusak bawaan (.conf) |
| 5 | `zephyr.lang-brainfuck` | Bahasa Brainfuck | ✅ jalan (nambah bahasa) |
| 6 | `zephyr.lang-clike` | Bahasa C / C++ | ⚠️ merusak bawaan (.c, .cc, .cpp, .cxx, .h, .hpp) |
| 7 | `zephyr.lang-cmake` | Bahasa CMake | ✅ jalan (nambah bahasa) |
| 8 | `zephyr.lang-cobol` | Bahasa COBOL | ✅ jalan (nambah bahasa) |
| 9 | `zephyr.lang-css` | Bahasa CSS | ⚠️ merusak bawaan (.css) |
| 10 | `zephyr.lang-spreadsheet` | Bahasa CSV / TSV | ✅ jalan (nambah bahasa) |
| 11 | `zephyr.lang-clojure` | Bahasa Clojure | ✅ jalan (nambah bahasa) |
| 12 | `zephyr.lang-coffeescript` | Bahasa CoffeeScript | ✅ jalan (nambah bahasa) |
| 13 | `zephyr.lang-commonlisp` | Bahasa Common Lisp | ✅ jalan (nambah bahasa) |
| 14 | `zephyr.lang-crystal` | Bahasa Crystal | ✅ jalan (nambah bahasa) |
| 15 | `zephyr.lang-cypher` | Bahasa Cypher | ✅ jalan (nambah bahasa) |
| 16 | `zephyr.lang-d` | Bahasa D | ✅ jalan (nambah bahasa) |
| 17 | `zephyr.lang-dtd` | Bahasa DTD | ✅ jalan (nambah bahasa) |
| 18 | `zephyr.lang-diff` | Bahasa Diff | ✅ jalan (nambah bahasa) |
| 19 | `zephyr.lang-dockerfile` | Bahasa Dockerfile | ✅ jalan (nambah bahasa) |
| 20 | `zephyr.lang-dylan` | Bahasa Dylan | ✅ jalan (nambah bahasa) |
| 21 | `zephyr.lang-ebnf` | Bahasa EBNF | ✅ jalan (nambah bahasa) |
| 22 | `zephyr.lang-ecl` | Bahasa ECL | ✅ jalan (nambah bahasa) |
| 23 | `zephyr.lang-eiffel` | Bahasa Eiffel | ✅ jalan (nambah bahasa) |
| 24 | `zephyr.lang-elm` | Bahasa Elm | ✅ jalan (nambah bahasa) |
| 25 | `zephyr.lang-erlang` | Bahasa Erlang | ✅ jalan (nambah bahasa) |
| 26 | `zephyr.lang-fcl` | Bahasa FCL | ✅ jalan (nambah bahasa) |
| 27 | `zephyr.lang-factor` | Bahasa Factor | ✅ jalan (nambah bahasa) |
| 28 | `zephyr.lang-forth` | Bahasa Forth | ✅ jalan (nambah bahasa) |
| 29 | `zephyr.lang-fortran` | Bahasa Fortran | ✅ jalan (nambah bahasa) |
| 30 | `zephyr.lang-gherkin` | Bahasa Gherkin | ✅ jalan (nambah bahasa) |
| 31 | `zephyr.lang-go` | Bahasa Go | ⚠️ merusak bawaan (.go) |
| 32 | `zephyr.lang-groovy` | Bahasa Groovy | ✅ jalan (nambah bahasa) |
| 33 | `zephyr.lang-http` | Bahasa HTTP | ✅ jalan (nambah bahasa) |
| 34 | `zephyr.lang-haskell` | Bahasa Haskell | ✅ jalan (nambah bahasa) |
| 35 | `zephyr.lang-haxe` | Bahasa Haxe | ✅ jalan (nambah bahasa) |
| 36 | `zephyr.lang-idl` | Bahasa IDL | ✅ jalan (nambah bahasa) |
| 37 | `zephyr.lang-javascript` | Bahasa JavaScript | ⚠️ merusak bawaan (.cjs, .js, .jsx, .mjs) |
| 38 | `zephyr.lang-jinja2` | Bahasa Jinja2 | ✅ jalan (nambah bahasa) |
| 39 | `zephyr.lang-julia` | Bahasa Julia | ✅ jalan (nambah bahasa) |
| 40 | `zephyr.lang-stex` | Bahasa LaTeX | ✅ jalan (nambah bahasa) |
| 41 | `zephyr.lang-livescript` | Bahasa LiveScript | ✅ jalan (nambah bahasa) |
| 42 | `zephyr.lang-lua` | Bahasa Lua | ⚠️ merusak bawaan (.lua) |
| 43 | `zephyr.lang-octave` | Bahasa MATLAB / Octave | ✅ jalan (nambah bahasa) |
| 44 | `zephyr.lang-mumps` | Bahasa MUMPS | ✅ jalan (nambah bahasa) |
| 45 | `zephyr.lang-mbox` | Bahasa Mbox | ✅ jalan (nambah bahasa) |
| 46 | `zephyr.lang-modelica` | Bahasa Modelica | ✅ jalan (nambah bahasa) |
| 47 | `zephyr.lang-mscgen` | Bahasa MscGen | ✅ jalan (nambah bahasa) |
| 48 | `zephyr.lang-ntriples` | Bahasa N-Triples | ✅ jalan (nambah bahasa) |
| 49 | `zephyr.lang-nsis` | Bahasa NSIS | ✅ jalan (nambah bahasa) |
| 50 | `zephyr.lang-mllike` | Bahasa OCaml / SML | ✅ jalan (nambah bahasa) |
| 51 | `zephyr.lang-oz` | Bahasa Oz | ✅ jalan (nambah bahasa) |
| 52 | `zephyr.lang-pegjs` | Bahasa PEG.js | ✅ jalan (nambah bahasa) |
| 53 | `zephyr.lang-pascal` | Bahasa Pascal | ✅ jalan (nambah bahasa) |
| 54 | `zephyr.lang-perl` | Bahasa Perl | ⚠️ merusak bawaan (.pl, .pm) |
| 55 | `zephyr.lang-pig` | Bahasa Pig | ✅ jalan (nambah bahasa) |
| 56 | `zephyr.lang-powershell` | Bahasa PowerShell | ⚠️ merusak bawaan (.ps1) |
| 57 | `zephyr.lang-properties` | Bahasa Properties | ⚠️ merusak bawaan (.cfg, .conf, .ini, .properties) |
| 58 | `zephyr.lang-protobuf` | Bahasa Protocol Buffers | ✅ jalan (nambah bahasa) |
| 59 | `zephyr.lang-pug` | Bahasa Pug | ✅ jalan (nambah bahasa) |
| 60 | `zephyr.lang-puppet` | Bahasa Puppet | ✅ jalan (nambah bahasa) |
| 61 | `zephyr.lang-python` | Bahasa Python | ⚠️ merusak bawaan (.py, .pyw) |
| 62 | `zephyr.lang-r` | Bahasa R | ✅ jalan (nambah bahasa) |
| 63 | `zephyr.lang-rpm` | Bahasa RPM Spec | ✅ jalan (nambah bahasa) |
| 64 | `zephyr.lang-ruby` | Bahasa Ruby | ⚠️ merusak bawaan (.rb) |
| 65 | `zephyr.lang-rust` | Bahasa Rust | ⚠️ merusak bawaan (.rs) |
| 66 | `zephyr.lang-sparql` | Bahasa SPARQL | ✅ jalan (nambah bahasa) |
| 67 | `zephyr.lang-sql` | Bahasa SQL | ⚠️ merusak bawaan (.sql) |
| 68 | `zephyr.lang-sass` | Bahasa Sass | ⚠️ merusak bawaan (.scss) |
| 69 | `zephyr.lang-scheme` | Bahasa Scheme | ✅ jalan (nambah bahasa) |
| 70 | `zephyr.lang-shell` | Bahasa Shell / Bash | ⚠️ merusak bawaan (.bash, .sh, .zsh) |
| 71 | `zephyr.lang-sieve` | Bahasa Sieve | ✅ jalan (nambah bahasa) |
| 72 | `zephyr.lang-smalltalk` | Bahasa Smalltalk | ✅ jalan (nambah bahasa) |
| 73 | `zephyr.lang-solr` | Bahasa Solr | ✅ jalan (nambah bahasa) |
| 74 | `zephyr.lang-stylus` | Bahasa Stylus | ✅ jalan (nambah bahasa) |
| 75 | `zephyr.lang-swift` | Bahasa Swift | ⚠️ merusak bawaan (.swift) |
| 76 | `zephyr.lang-toml` | Bahasa TOML | ⚠️ merusak bawaan (.toml) |
| 77 | `zephyr.lang-ttcn-cfg` | Bahasa TTCN CFG | ⚠️ merusak bawaan (.cfg) |
| 78 | `zephyr.lang-ttcn` | Bahasa TTCN-3 | ✅ jalan (nambah bahasa) |
| 79 | `zephyr.lang-tcl` | Bahasa Tcl | ✅ jalan (nambah bahasa) |
| 80 | `zephyr.lang-textile` | Bahasa Textile | ✅ jalan (nambah bahasa) |
| 81 | `zephyr.lang-tiddlywiki` | Bahasa TiddlyWiki | ✅ jalan (nambah bahasa) |
| 82 | `zephyr.lang-tiki` | Bahasa Tiki | ✅ jalan (nambah bahasa) |
| 83 | `zephyr.lang-turtle` | Bahasa Turtle | ✅ jalan (nambah bahasa) |
| 84 | `zephyr.lang-vbscript` | Bahasa VBScript | ✅ jalan (nambah bahasa) |
| 85 | `zephyr.lang-vhdl` | Bahasa VHDL | ✅ jalan (nambah bahasa) |
| 86 | `zephyr.lang-velocity` | Bahasa Velocity | ✅ jalan (nambah bahasa) |
| 87 | `zephyr.lang-verilog` | Bahasa Verilog | ✅ jalan (nambah bahasa) |
| 88 | `zephyr.lang-vb` | Bahasa Visual Basic | ✅ jalan (nambah bahasa) |
| 89 | `zephyr.lang-webidl` | Bahasa Web IDL | ✅ jalan (nambah bahasa) |
| 90 | `zephyr.lang-wast` | Bahasa WebAssembly Text | ✅ jalan (nambah bahasa) |
| 91 | `zephyr.lang-mathematica` | Bahasa Wolfram | ✅ jalan (nambah bahasa) |
| 92 | `zephyr.lang-xml` | Bahasa XML / HTML | ⚠️ merusak bawaan (.svg, .xml) |
| 93 | `zephyr.lang-xquery` | Bahasa XQuery | ✅ jalan (nambah bahasa) |
| 94 | `zephyr.lang-yaml` | Bahasa YAML | ⚠️ merusak bawaan (.yaml, .yml) |
| 95 | `zephyr.lang-yacas` | Bahasa Yacas | ✅ jalan (nambah bahasa) |
| 96 | `zephyr.lang-z80` | Bahasa Z80 Assembly | ✅ jalan (nambah bahasa) |
| 97 | `zephyr.lang-mirc` | Bahasa mIRC | ⚠️ merusak bawaan (.ini) |
| 98 | `zephyr.lang-nginx` | Bahasa nginx Config | ✅ jalan (nambah bahasa) |
| 99 | `zephyr.lang-q` | Bahasa q/Kdb+ | ✅ jalan (nambah bahasa) |
| 100 | `zephyr.lang-sas` | Bahasa sas | ✅ jalan (nambah bahasa) |
| 101 | `zephyr.lang-troff` | Bahasa troff | ✅ jalan (nambah bahasa) |

### Snippets (7)

| # | id | nama | status |
|---|---|---|---|
| 1 | `zephyr.snippet-js` | JavaScript snippets | ½ cacat: `javascriptreact` ≠ `jsx` |
| 2 | `zephyr.snippet-css` | Snippet CSS | ✅ jalan |
| 3 | `zephyr.snippet-go` | Snippet Go | ✅ jalan |
| 4 | `zephyr.snippet-python` | Snippet Python | ✅ jalan |
| 5 | `zephyr.snippet-react` | Snippet React + TS | ✅ jalan |
| 6 | `zephyr.snippet-rust` | Snippet Rust | ✅ jalan |
| 7 | `zephyr.snippet-sql` | Snippet SQL | ✅ jalan |

### Keymaps (4)

| # | id | nama | status |
|---|---|---|---|
| 1 | `zephyr.keymap-emacs` | Emacs-style keymap | ❌ hampir mati (2 dari 37 binding nyambung) |
| 2 | `zephyr.keymap-ide` | JetBrains-style keymap | ❌ hampir mati (2 dari 37 binding nyambung) |
| 3 | `zephyr.keymap-vim` | Keymap ala Vim | ❌ hampir mati (2 dari 37 binding nyambung) |
| 4 | `zephyr.keymap-sublime` | Sublime-style Keymap | ❌ hampir mati (2 dari 37 binding nyambung) |

### Icon Themes (4)

| # | id | nama | status |
|---|---|---|---|
| 1 | `zephyr.ikon-bahasa` | Ikon Bahasa | ❌ mati total (nol konsumen UI) |
| 2 | `zephyr.ikon-garis` | Ikon Garis | ❌ mati total (nol konsumen UI) |
| 3 | `zephyr.ikon-titik` | Ikon Titik | ❌ mati total (nol konsumen UI) |
| 4 | `zephyr.ikon-bulat` | Round Icons | ❌ mati total (nol konsumen UI) |

### Themes (2)

| # | id | nama | status |
|---|---|---|---|
| 1 | `zephyr.tema-kertas` | Paper Theme | ⚠️ sebagian kebaca (C1/C2) |
| 2 | `zephyr.tema-malam` | Tema Malam | ⚠️ sebagian kebaca (C1/C2) |

**Total terhitung: 118 paket** — Languages 101, Snippets 7, Keymaps 4, Icon Themes 4, Themes 2.
