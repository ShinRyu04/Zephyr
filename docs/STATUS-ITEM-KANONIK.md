# STATUS ITEM KANONIK ZEPHYR — apa adanya

Sumber tunggal: pelacak item sesi (dump `todo-src.json`, **revisi 89**, mtime 2026-10-14 04:55) —
berkas state milik pelacak; dibaca apa adanya, tidak diubah. Pandangan bernomor dari pelacak yang sama
(berkas `pending.txt`) mencetak **TOTAL 186** dengan 120 completed / 6 in_progress / 60 pending,
sedangkan dump terbaru berisi **193 entri** dengan 127 completed / 5 in_progress / 61 pending —
jadi pandangan bernomor itu snapshot pada revisi yang lebih lama (selisih: completed +7, in_progress −1, pending +1).
**Semua 193 entri dump terbaru dilaporkan di sini — tidak ada satu pun yang dibuang.**

Dokumen ini TIDAK mengubah kode produk (`src/**`, `src-tauri/**`) dan tidak meng-commit apa pun.

## Aturan status (dibuktikan, bukan diklaim)

| Verdikt | Artinya |
| --- | --- |
| **SELESAI** | pelacak bilang `completed` DAN ada artefak/keterangan hasil (berkas di repo, skrip uji, atau tanda hasil nyata di teks tracker) |
| **SELESAI-KLAIM** | pelacak bilang `completed` tetapi tidak ada artefak maupun keterangan hasil yang bisa ditunjuk |
| **DIGARAP** | ada artefak (dokumen/skrip/berkas) tapi pekerjaan belum tuntas (status pelacak `in_progress`, atau `pending` yang sudah punya artefak) |
| **BELUM** | tidak ada bukti apa pun: `pending`, tanpa berkas, tanpa skrip, tanpa keterangan hasil |

## Ringkasan angka

| Ukuran | Jumlah |
| --- | --- |
| Total item dilaporkan | **193** |
| Status pelacak: completed | 127 |
| Status pelacak: in_progress | 5 |
| Status pelacak: pending | 61 |
| Verdikt SELESAI | 112 |
| Verdikt SELESAI-KLAIM (tanpa bukti tertunjuk) | 15 |
| Verdikt DIGARAP | 57 |
| Verdikt BELUM | 9 |

### Item TIDAK punya bukti apa pun

**BELUM (pending, nol artefak):** `a9`, `e2`, `lama-kurs`, `prompt9-commit`, `pakai-subagent`, `zeph-baca-kode-sendiri`, `zeph-versi-indeks-basi`, `zeph-klaim-nilai`, `zeph-label-sudah-didukung`

**SELESAI-KLAIM (completed, nol artefak tertunjuk):** `b2`, `b3`, `c15`, `c16`, `i5`, `i8`, `aim-pop-0`, `aim-pop-1`, `aim-pop-2`, `aim-pop-3`, `aim-pop-4`, `aim-pop-5`, `aim-pop-6`, `aim-pop-7`, `aim-pop-8`

## Daftar lengkap (urut pelacak, apa adanya)

Kolom *Bukti* = berkas di repo yang menyebut item ini / artefak yang dirujuk teks item. Kolom *Keterangan tracker* = teks asli pemilik (dipotong, penuh di lampiran untuk item berjalan).

| # | Item | Status pelacak | Verdikt | Bukti | Keterangan tracker |
| --- | --- | --- | --- | --- | --- |
| 1 (—) | `c6` | completed | SELESAI | teks tracker bertanda bukti: ✅, beres | C6 catch {} senyap → catat ke gagal[] (extLoader.ts) — ✅ BERES: muatTema + muatKeymap + muatSnippet + muatIconTheme semua nyatet alasan; catch senyap 0 sisa |
| 2 (—) | `c5` | completed | SELESAI | teks tracker bertanda bukti: ✅, live | C5 tampilkan ringkasan loader di panel — ✅ LIVE: pasang 'Language Icons' → panel muncul '19 icon themes / nothing skipped', Installed 0→1. |
| 3 (—) | `c-verif-sisa` | completed | SELESAI | `ALUR-VERIFIKASI-MANDIRI.md`, `package.json`, `uji-gagal-loader-live.mjs` | c-verif-sisa. Verifikasi lanjutan tipe marketplace yang BELUM terbukti live: (a) 7 paket snippet benar-benar dipakai saat mengetik; (b) jalur gagal panel loader; (c) palet 0 diukur ulang; (d) 68 todo UI dicek render. — SELESAI 4/4: (a) uji… |
| 4 (—) | `c18` | completed | SELESAI | `uji-snippet-live.mjs` | C18 snippet JS cacat (javascriptreact ≠ jsx) — SELESAI & TERBUKTI LIVE 13 Okt (sesudah patch Bug B + harness diperbaiki). Bukti 3 kaki, tiap kaki punya kaki kontrol 'sebelum' & 'dicabut': `node scripts/uji-snippet-live.mjs` exit 0 untuk (a… |
| 5 (—) | `a1` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | A1 .tedi/ (33 berkas): git rm --cached + hapus folder + .gitignore — ✅ SELESAI: 33 berkas di-unstage & dihapus, .tedi/ masuk .gitignore. |
| 6 (—) | `a2` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | A2 hapus cache ~\.cache\tedi — ✅ SELESAI: folder cache dihapus. |
| 7 (—) | `a3` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | A3 hapus scripts/hapus-tedi-docs.mjs — ✅ SELESAI: skrip sekali-pakai dihapus. |
| 8 (—) | `a4` | completed | SELESAI | `shot-subagent.mjs` | A4 rename docs/screenshots/14-subagent-tedi.png + shot-subagent.mjs:62 — ✅ SELESAI: jadi 14-subagent.png, rujukan di shot-subagent.mjs:62 ikut diperbarui. |
| 9 (—) | `a5` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai, live | A5 buang kompat mcp__tedi__ (6 berkas / 9 titik) — RISIKO TINGGI — ✅ SELESAI: awalan.ts (POLA_AWALAN_MCP kini /^mcp__zephyr__/), agentTools.ts (2 titik + impor AWALAN_MCP/POLA_AWALAN_MCP), mcpTools.ts, subagentStore.ts (kode+komentar), Ala… |
| 10 (—) | `a8` | completed | SELESAI | teks tracker bertanda bukti: ✅, live, hijau | A8 verifikasi: tsc 0 error ✅, cargo test --lib 423 passed ✅, grep presisi 0 sisa TEDI ✅, script A6: uji-mcp-luar 24/24 ✅, cek-nama-alat-hidup 2/2 ✅, verify-katalog-mcp 31/31 ✅, verify-deskripsi-tool-8bahasa 66/66 ✅, 5 harness live foregrou… |
| 11 (—) | `a6` | completed | SELESAI | `cek-nama-alat-hidup.mjs`, `uji-mcp-luar.mjs`, `verify-deskripsi-tool-8bahasa.mjs` | A6 update 6 script uji yang nyebut TEDI — ✅ SELESAI: uji-mcp-luar.mjs 24/24, cek-nama-alat-hidup.mjs 2/2, verify-katalog-mcp.mjs 31/31 (bagian 8 + daftar LAMA), verify-deskripsi-tool-8bahasa.mjs, verify-tool-picker-51.mjs. |
| 12 (—) | `a7` | completed | SELESAI | `TODO-ZEPHYR.md` | A7 rapikan 3 prosa/docs soal TEDI — ✅ SELESAI: TODO-ZEPHYR.md 2 baris ('aplikasi acuan'), komentar kode lain sudah bersih (grep presisi 0 di src/ + TODO-ZEPHYR.md). |
| 13 (—) | `b5` | completed | SELESAI | `cek-batas-mcp-live.mjs` | B5 batasi tool MCP pihak ketiga — SELESAI: batas per server (mcp.maxToolsPerServer, bawaan 40, 0=tanpa batas) + ringkasan jujur (total/dipakai/dibuang/contoh) + blok prompt ke MODEL + baris panel Setelan + input batas; harness cek-batas-mc… |
| 14 (—) | `v1` | completed | SELESAI | teks tracker bertanda bukti: selesai, hijau, pass | v1. V1 verifikasi akhir: tsc 0 error + cargo test --lib + script uji (dulu v1) [SELESAI 2026-10-13 malam. (1) tsc: `npx tsc --noEmit` = 0 error, diulang SESUDAH 8 kamus i18n diisi + SESUDAH penyambungan memori ke prompt + jembatan __ZEPHYR… |
| 15 (15) | `j5` | completed | SELESAI | `KEPUTUSAN-MARKETPLACE-j5.md`, `bagian1.mjs`, `cek-ext.mjs` | J5 marketplace mustahil sebelum C1+C2 (opsi a/b/c) — MENUNGGU KEPUTUSAN RYU (item baru ditutup setelah Ryu memilih; investigasi read-only SUDAH SELESAI 2026-10-13, laporan `scratch/laporan-j1-j5.md`). PRASYARAT TEKNIS terverifikasi: (1) pa… |
| 16 (16) | `a9` | pending | BELUM | — | A9 batas: riwayat git 8 commit TIDAK dibersihkan (rewrite history ditolak) |
| 17 (—) | `b1` | completed | SELESAI | teks tracker bertanda bukti: ✅, beres | B1 komentar basi catalog.ts — ✅ BERES: 15 blok prosa ditulis ulang, angka keras dibuang (jumlah dari TOOL_COUNTS/periksaKatalog), blok doc ganda dibuang, 'Empat'→'Tiga' tool web. |
| 18 (—) | `b2` | completed | SELESAI-KLAIM | — | B2 dedupe fetch vs web_fetch ❓ |
| 19 (—) | `b3` | completed | SELESAI-KLAIM | — | B3 warning di tombol 'All on' |
| 20 (—) | `b4` | completed | SELESAI | `awalan.ts` | B4 POLA_AWALAN_MCP didefinisi 2× → satu sumber — ✅ SELESAI (dikerjakan bersama A5): definisi tunggal di src/lib/zephyrTools/awalan.ts, agentTools.ts kini mengimpor POLA_AWALAN_MCP/AWALAN_MCP (regex inline 2× dibuang); sisa salinan hanya di… |
| 21 (—) | `c1` | completed | SELESAI | `themes.ts` | C1 --syntax-* → --syn-*: SELESAI & TERVERIFIKASI. Paket tema kertas/malam pasang dari kartu Marketplace → token tema terterap di DOM (--syn-keyword #8a3fa0 / #c792ea, --syn-tag, --syn-attr, --syn-variable, --syn-invalid). Bug nyata ditemuk… |
| 22 (—) | `c2` | completed | SELESAI | teks tracker bertanda bukti: selesai, terverifikasi | C2 tema tulis --bg: SELESAI & TERVERIFIKASI. Kertas → --bg #faf7f0/--surface #f3efe5/--text #2e2a24; Malam → --bg #0f1216/--surface #151a20/--text #d3dae3. Keduanya kini juga membawa token editor (--editor-bg/gutter/active-line/selection) … |
| 23 (—) | `c3` | completed | SELESAI | `uji-t6-tema-mode.mjs` | C3 resolveTheme() tolak light-saat-dark tanpa pesan ❓ — SELESAI: pill Zephyr Light/Dark ikut pindah theme.current + kartu tema aktif dari resolveTheme(); uji live scripts/uji-t6-tema-mode.mjs 7/7 LULUS; doc komentar di themes.ts |
| 24 (—) | `c4` | completed | SELESAI | `banding-tema.mjs`, `rapikan-kontras-tema.mjs` | C4 palet nyaris kembar (rapikan) — SELESAI: gate kontras 19 tema 83→0 gagal (0 tak terbaca) via scripts/rapikan-kontras-tema.mjs + 2 accent manual (solarized-light #1f71ab, nord-light #4e6b8f); alat baru scripts/banding-tema.mjs: 0 pasanga… |
| 25 (—) | `c7` | completed | SELESAI | `uji-gagal-loader-live.mjs` | C7 alasan bahasa di-skip: SUDAH ditulis (muatBahasa + langPemilik → tidakDidukung) — TERBUKTI LIVE 2026-10-13: harness uji-gagal-loader-live.mjs exit 0, panel menampilkan baris skip 'zephyr.uji-bahasa-ngawur (bahasa): bahasa "ujingawur" ti… |
| 26 (—) | `c8` | completed | SELESAI | `uji-ikon-live.mjs` | C8 4 paket ikon mati; ikonUntukExt() nol konsumen UI ❓ — SELESAI & TERBUKTI LIVE (2026-10-13): harness `node scripts/uji-ikon-live.mjs` exit 0 LULUS, diukur dari DOM (bukan nilai fungsi): sebelum pasang ikon berbasis paket 0, tab aktif "lu… |
| 27 (—) | `c9` | completed | SELESAI | `uji-keymap-live.mjs` | C9 keymap hampir mati — 37 binding, 2 command ❓ (dulu k1) — SELESAI & TERBUKTI LIVE (2026-10-13): AKAR = chord paket Ctrl+K Ctrl+B jalan 2x (handler lama App.tsx onKey + mesin keymap dua-duanya memproses stroke kedua → toggle netto 0). FIX… |
| 28 (—) | `c10` | completed | SELESAI | `uji-bahasa-live.mjs` | C10 presedensi lang.ts → bawaan harus MENANG — SELESAI & TERBUKTI LIVE: extLangUntuk() `if (detectLang(nameOrPath) !== 'plain') return null; return bahasaUntukExt(ext)`; komentar extensiUntukFile() diselaraskan. Bukti uji-bahasa-live.mjs: … |
| 29 (—) | `c11` | completed | SELESAI | `uji-bahasa-live.mjs` | C11 buang 21 paket bahasa bentrok — SELESAI & TERVERIFIKASI: 13 dibuang TOTAL (asterisk, clike, css, go, javascript, lua, properties, rust, sql, swift, toml, ttcn-cfg, yaml) + 8 DIPANGKAS (mirc→mrc, perl→t/pod, powershell→psm1/psd1, python… |
| 30 (—) | `c12` | completed | SELESAI | `uji-bahasa-live.mjs` | C12 sisakan 80 paket yang nambah — SELESAI & TERBUKTI LIVE (13 Okt): node scripts/uji-bahasa-live.mjs LULUS — sebelum paket: 10 span/2 ragam/'Plain Text'; sesudah zephyr.lang-mirc terpasang: 28 span/6 ragam/'mIRC' (komentar ;→ͼs, if/$nick→… |
| 31 (—) | `c15` | completed | SELESAI-KLAIM | — | C15 hapus 6 script probe (_cek-ext.._cek-ext5, _cek-url) |
| 32 (—) | `c16` | completed | SELESAI-KLAIM | — | C16 hapus uji-bahasa.bf (root repo) |
| 33 (—) | `d1` | completed | SELESAI | `cek-hydra-live.mjs` | D1 benerin cek-hydra-live.mjs |
| 34 (—) | `e1` | completed | SELESAI | `.zephyr-context.md`, `HANDOFF-AI.md` | E1 verifikasi 14 item HANDOFF-AI.md (jangan ulang) — SELESAI 2026-10-13: ke-14 perbaikan DIPERIKSA ada di kode (bukan diulang): (1) resetAgentToolCache/finishAgentToolCache membersihkan agentToolCache (aiStore.ts:578-587, TTL Infinity utk … |
| 35 (35) | `e2` | pending | BELUM | — | E2 worktree ~190 perubahan / 0 staged (jangan git add -A) |
| 36 (—) | `e3` | completed | SELESAI | teks tracker bertanda bukti: ✅, exit=0, terverifikasi | E3 tsc 0 error — ✅ BERES (TSC_EXIT=0 terverifikasi) |
| 37 (—) | `g1` | completed | SELESAI | `cek-stack-loop-live.mjs` | G1 hapus permanen 'Loop running' (+ n runs + menu ⋯/Stop) — TUNTAS 2026-10-13: AiPanel.tsx (judul jadi tr('Thinking'), loopRuns/loopMenuBuka/agentSteps dibuang, blok menu ⋯+Stop loop dihapus), ai-work-stack.css (-651 char: .ai-work-menu-po… |
| 38 (—) | `h1` | completed | SELESAI | `zephyrFakta.ts` | H1 pengetahuan-diri cuma 3 baris (systemPrompt.ts) ❓ — SELESAI: blok fakta generated (src/lib/zephyrFakta.ts 11.6 KB) disuntik ke prompt tepat setelah editorFakta; prompt terkirim memuat identitas, setelan default, port, bridge, seksi Chat… |
| 39 (—) | `h2` | completed | SELESAI | teks tracker bertanda bukti: selesai, lulus | H2 nol pengetahuan soal setting/ekstensi/tema/keymap/hooks/MCP/Hydra/loop/debug/port ❓ — SELESAI: fakta mencakup setelan default (flat group.key dari settings.rs), SECTION_ORDER/SectionId, shortcut bawaan (shortcuts.ts), seksi Chat Setting… |
| 40 (—) | `h3` | completed | SELESAI | `gen-fakta-zephyr.mjs`, `vite.config.ts` | H3 usul: blok pengetahuan digenerate dari types.ts + settings.rs + aturan anti-ngarang — SELESAI: scripts/gen-fakta-zephyr.mjs (--check/--print-keys) men-generate zephyrFakta.ts dari settings.rs default_settings(), settingsStore.ts, shortc… |
| 41 (—) | `i1` | completed | SELESAI | `cek-lsp-pasang-ui-live.mjs` | I1 halaman LSP dari tabel statis — TUNTAS lewat rung 3: baris tak lagi cuma menampilkan teks saran; baris beresep punya tombol pasang yang benar-benar menjalankan npm (bukti: cek-lsp-pasang-ui-live.mjs 9/9). |
| 42 (—) | `i2` | completed | SELESAI | teks tracker bertanda bukti: live, tuntas | I2 Zephyr nggak pernah install apa pun — TUNTAS: backend `lsp_pasang` menjalankan `npm install --prefix <slot>` sebagai child process; terpasang live 5 detik, biner ada di disk. |
| 43 (—) | `i3` | completed | SELESAI | teks tracker bertanda bukti: terverifikasi, tuntas | I3 slot data_dir/lsp/<id>/ nol kode nulis — TUNTAS: slot kini ditulis installer (`%APPDATA%\zephyr\lsp\docker\node_modules\.bin\docker-langserver.cmd` terverifikasi ada setelah klik tombol). |
| 44 (—) | `i4` | completed | SELESAI | teks tracker bertanda bukti: live, terbukti, hijau | I4 3 nama biner salah → merah selamanya (vscode-json/html/css-languageserver → *-language-server) — TERBUKTI LIVE: 3 baris kini HIJAU, biner di %APPDATA%\npm, tiap klaim ok dicek fs.existsSync (L2: 10 hijau, 0 tanpa berkas) |
| 45 (—) | `i5` | completed | SELESAI-KLAIM | — | I5 5 saran tanpa perintah install → diganti perintah nyata / lokasi taruh biner (dart, java, csharp, lua, kotlin) — L6: modul tersaji 0 sisa 'put it on PATH' |
| 46 (—) | `i6` | completed | SELESAI | teks tracker bertanda bukti: live, lulus, terbukti | I6 5 saran biner nggak masuk PATH → resolve_cmd cari APPDATA\npm, %USERPROFILE%\go\bin, .cargo\bin, .local\bin, .gem\ruby\<ver>\bin, ProgramFiles\LLVM\bin + varian .exe/.cmd/.bat — TERBUKTI LIVE: clangd/go/ruby sekarang py lokasi dicari, 2… |
| 47 (—) | `i7` | completed | SELESAI | teks tracker bertanda bukti: selesai | I7 bahan installer (ureq + zip) — SELESAI dengan keputusan berbeda: TIDAK pakai unduh+ekstrak ureq/zip (tarball manual kehilangan pohon dependensi → biner mati saat require pertama). Jalur yang dipakai: `npm install --prefix` yang menyeles… |
| 48 (—) | `i8` | completed | SELESAI-KLAIM | — | I8 pesan gagal cuma 'not found' → kini sebut SEMUA lokasi yang sudah diperiksa ('Checked: <slot>; PATH; ...') dan tooltip di baris Install; L3 11/11 gagal punya alasan, L8 11 tooltip ok |
| 49 (—) | `j1` | completed | SELESAI | `ext_bundled.rs`, `theme.css`, `themes.ts` | J1 19 tema, cuma 2 lewat jalur ekstensi ❓ — SELESAI/TERJAWAB 2026-10-13 (penyelidik read-only `sa-0-66a1ab9a`/`deleg_97f791b7`, laporan `scratch/laporan-j1-j5.md`, 222 baris, punya berkas:baris). VERDIKT: klaim lama '2 dari 19 tema bawaan … |
| 50 (—) | `j2` | completed | SELESAI | `banding-tema.mjs` | J2 min-light identik zephyr-light — SELESAI: 0→18 token beda (border/surface/text/selection/ansi ikut beda), terukur scripts/banding-tema.mjs |
| 51 (—) | `j3` | completed | SELESAI | teks tracker bertanda bukti: selesai | J3 github-dark vs zephyr-dark sama persis — SELESAI: 0→10 token beda (accent #58a6ff vs #3884ff, text-secondary, border, selection) sekaligus lebih setia ke palet GitHub |
| 52 (—) | `j4` | completed | SELESAI | teks tracker bertanda bukti: selesai | J4 pasangan dekat (tokyo-night↔kanagawa 33, dracula↔catppuccin 34) — SELESAI: sekarang 37 & 35 token beda, di luar ambang 'nyaris kembar' |
| 53 (—) | `u1` | completed | SELESAI | teks tracker bertanda bukti: ✅, terbukti | U1 UI ringkasan loader kebaca/dibuang/gagal — ✅ = C5 (jalur sukses terbukti; jalur gagal nunggu C7) |
| 54 (—) | `lama-pane` | completed | SELESAI | `SPIKE-150-pane-browser.md` | LAMA-pane: SATU pane browser (browser_open pakai-ulang, paneBrowserId() = pane AKTIF) [list rev.1 — completed] |
| 55 (55) | `lama-pane-uji` | pending | DIGARAP | `SPIKE-150-pane-browser.md` | LAMA-pane-uji: verifikasi 1 pane lewat run agen nyata (Google → exchangerates → API kurs) [list rev.1 — terakhir in_progress] |
| 56 (—) | `lama-guard-browser` | completed | SELESAI | `SPIKE-150-pane-browser.md` | LAMA-guard-browser: guard treadmill browser, beri peringatan sekali sebelum stop [list rev.1 — completed] |
| 57 (—) | `lama-prompt-context` | completed | SELESAI | `.zephyr-context.md` | LAMA-prompt-context: prompt .zephyr-context.md → agen BUAT pakai write_file [list rev.1 — completed] |
| 58 (58) | `lama-kurs` | pending | BELUM | — | LAMA-kurs: tugas kurs 1 USD→IDR 1998..2026 end-to-end, berkas kurs-dollar.md + tabel + sumber [list rev.1] |
| 59 (59) | `lama-a1` | pending | DIGARAP | `docs/ANAK-AGEN-PERILAKU.md`, `scripts/cek-subset-tugas.mjs`, `scripts/uji-anak-agen.mjs` | LAMA-a1: A(i) subset tool per tugas: kirim hanya tool relevan ke provider [list rev.1] |
| 60 (60) | `lama-a2` | pending | DIGARAP | `docs/ANAK-AGEN-PERILAKU.md`, `scripts/uji-anak-agen.mjs` | LAMA-a2: A(ii) auto-compact/ringkas riwayat: jalur ulang-belum tuntas [list rev.1] |
| 61 (61) | `lama-a4` | pending | DIGARAP | `docs/ANAK-AGEN-PERILAKU.md`, `scripts/uji-anak-agen.mjs` | LAMA-a4: A(iv) paksa todo_write di langkah pertama tugas berat [list rev.1] |
| 62 (62) | `lama-c` | pending | DIGARAP | `docs/ANTREAN-DAN-KONTEKS.md` | LAMA-c: C kirim pesan/chat ke agen yang SEDANG kerja (sekarang harus nunggu run kelar) [list rev.1] |
| 63 (63) | `lama-d` | pending | DIGARAP | `.zephyr-context.md`, `docs/ANTREAN-DAN-KONTEKS.md` | LAMA-d: D aplikasi kelola .zephyr-context.md otomatis [list rev.1] |
| 64 (64) | `lama-busy` | pending | DIGARAP | `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs` | LAMA-busy: agentBusy telat reset (~5 menit setelah run kelar) → peluncuran uji berikutnya kebatal [root cause ditemukan & diperbaiki 2026-10-13: peta per-permukaan tak dibersihkan di jalur setState mentah — lihat h2-busy-permukaan; SISA: verifikasi ulang lewat run agen nyata, bukan cuma jalur chat] |
| 65 (65) | `lama-merah` | pending | DIGARAP | `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs` | LAMA-merah: repro bersih error 'tool call X returned malformed JSON arguments' [list rev.1] |
| 66 (66) | `lama-besar` | pending | DIGARAP | `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs` | LAMA-besar: uji tugas raksasa 40+ berkas (bukti kuat baru 6 & 8 berkas) [list rev.1] |
| 67 (67) | `lama-kejam` | pending | DIGARAP | `REPRO-BUG-KEJAM.md`, `docs/ANTREAN-DAN-KONTEKS.md`, `docs/REPRO-BUG-KEJAM.md` | LAMA-kejam: tes bug 'versi kejam' (cuma gejala, tanpa tes otomatis) [list rev.1] |
| 68 (—) | `lama-scratch` | completed | SELESAI | `_tutup-setelan.mjs` | LAMA-scratch: 18 skrip scratch scripts/_*.mjs (probe/cek sekali pakai, semua nol rujukan dari luar) DIPINDAH ke scripts/_arsip/; yang tersisa di scripts/ cuma _tutup-setelan.mjs + launcher .bat/.vbs (_dev-zephyr, _run-*). Tidak ada yang di… |
| 69 (—) | `lama-sampah` | completed | SELESAI | `.opencode-context.md`, `.zephyr-context.md` | LAMA-sampah: berkas sampah uji di D:/Testing sudah rapi — _fetch_kurs.ps1, _kurs_hist.ps1/.txt, _kurs_raw.txt sudah ada di D:/Testing/_arsip/; hari ini dipindahkan juga `$((Get-ChildItem` (berkas rusak 890 byte) dan busy-reset.txt ke _arsi… |
| 70 (—) | `c13` | completed | SELESAI | teks tracker bertanda bukti: selesai, live, terbukti | C13 muatCmBahasa() specifier rakitan → SELESAI & TERBUKTI LIVE: tabel importer statis cmLegacyModes.ts (MODE_IMPORTER/MODE_TERSEDIA) dipakai extLoader; sebelumnya specifier bare yang tak pernah diload Vite, sekarang /node_modules/.vite/dep… |
| 71 (—) | `c19` | completed | SELESAI | teks tracker bertanda bukti: live, terbukti | C19 BARU (temuan saat c12): status bar bilang 'Plain Text' padahal berkas dihighlight paket → StatusBar.tsx pakai labelBahasa(tab.path), bukan LANG_LABEL[tab.lang]; terbukti live label jadi 'mIRC'; tsc 0 error. |
| 72 (—) | `todo-batas20` | completed | SELESAI | `uji-todo-panel-live.mjs` | todo-batas20 (TEMUAN LIVE 2026-10-13) — SELESAI & TERBUKTI LIVE: MAX_TODOS 20→200 di aiStore.ts + penghitung dipangkasTodo/todoTerpangkas(); tool todo_write kini menempel PERINGATAN berisi JUMLAH yang dibuang. Bukti `node scripts/uji-todo-… |
| 73 (—) | `todo-tombol-bersih` | completed | SELESAI | teks tracker bertanda bukti: selesai, live, exit 0 | todo-tombol-bersih (TEMUAN LIVE 2026-10-13) — SELESAI & TERBUKTI LIVE: aksi eksplisit kosongkanTodos() & buangTodosSelesai() di aiStore (set + persist), kedua tombol menu ⋯ di ComposerStatusStack.tsx memakainya (dulu lewat setAgentTodos ya… |
| 74 (—) | `bug-b-deco` | completed | SELESAI | `lspCm.ts` | Bug B editor crash 'Position N is out of range for changeset of length 0' (TEMUAN 13 Okt, FATAL) — PATCH DITERAPKAN: src/lib/lspCm.ts squiggleCompartment dibuang → squiggleField (StateField, deco di-map lewat tr.changes, dibangun ulang HAN… |
| 75 (—) | `bug-a-gutter` | completed | SELESAI | teks tracker bertanda bukti: live, terverifikasi | Bug A diagnosticsGutter 'Invalid line number 3 in 1-line document' — PATCH + TERVERIFIKASI (markers() clamp ke dokumen LIVE, bukan snapshot docLines) |
| 76 (—) | `a10` | completed | SELESAI | teks tracker bertanda bukti: ✅ | A10 (temuan 2026-10-13) deskripsi tool: 10 tool terbaru (lsp_symbols/references/definition/hover/diagnostics/call_hierarchy + skill_view + ask_user + tool_search + tool_call) NOL kunci di SEMUA 10 peta → deskripsi kosong = panel MENYEMBUNY… |
| 77 (—) | `a11` | completed | SELESAI | `awalan.ts`, `verify-deskripsi-tool-8bahasa.mjs` | A11 verify-deskripsi-tool-8bahasa.mjs: ✅ transpilasi 2 berkas ke folder sementara; AWALAN_MCP dibaca dari sumbernya (src/lib/zephyrTools/awalan.ts) + validasi catalog.ts mengimpor './awalan' → 66 kunci × 10 peta, 14 MCP terverifikasi benar… |
| 78 (—) | `d3` | completed | SELESAI | `verify-tool-picker-51.mjs` | D3 verify-tool-picker-51.mjs: ✅ pembuka stale diperbaiki. Jalur UI nyata = menu ⋯ (ai-more) → item "Tool Sets" (ai-open-toolsets); tombol ai-toolgate & ai-toolgate-angka sudah dihapus dari UI. Assertion trigger→footer diganti: pembuka ada … |
| 79 (—) | `ai-workspace` | completed | SELESAI | `scripts/uji28/buat-fixture28.mjs`, `scripts/verify28.mjs` | AI-workspace (permintaan Ryu): tool AI selalu jalan dgn folder Zephyr; Ryu minta JANGAN dipaksa + chat tak butuh workspace. — SELESAI: TIDAK ada pemaksaan folder Zephyr; tanpa folder app jalan penuh (uji subset-alat S8-S10: list_directory/… |
| 80 (—) | `ai-workspace-prompt` | completed | SELESAI | teks tracker bertanda bukti: selesai, live, lulus | AI-workspace-PROMPT (perintah Ryu): prompt + jalur tool supaya (a) chat tak butuh workspace, (b) tool tak selalu mengarah ke root D:\Zephyr. — SELESAI: sysPromptFor() memancarkan b.tanpaWorkspace saat workspace null (bukan saat konteks kos… |
| 81 (—) | `ai-self-knowledge` | completed | SELESAI | teks tracker bertanda bukti: selesai, live | AI-self-knowledge (permintaan Ryu 2026-10-13): Zeph harus tahu SEMUA yang ada di Zephyr & bisa menjelaskan ke user saat ada masalah. — SELESAI dgn bukti live 22/22 (cek-pengetahuan-live A1-A9, B1-B8, C1-C5): (B) tanpa folder, pertanyaan Ze… |
| 82 (—) | `i9` | completed | SELESAI | `cek-lsp-live.mjs`, `cek-lsp-pasang-live.mjs`, `cek-lsp-pasang-ui-live.mjs` | I9 installer DI DALAM app — TUNTAS 2026-10-13 (backend + UI). Backend: lsp_resep/lsp_pasang (npm ke %APPDATA%\zephyr\lsp\<id>\) → cek-lsp-pasang-live.mjs 12/12 + cek-lsp-live.mjs 11/11 (L9 docker=Dockerfile). UI: tombol 'Install with Zephy… |
| 83 (—) | `h2-busy-permukaan` | completed | SELESAI | teks tracker bertanda bukti: hijau | H2 FIX (root cause lama-busy): peta run per-permukaan (pendings[composerId]) tak pernah dibersihkan karena onChunk memakai useAi.setState MENTAH (lewati mirrorRun) → strip tetap 'Thinking' selamanya, peluncuran berikutnya kebatal; watchdog… |
| 84 (—) | `h3-hydra-gagal-palsu` | completed | SELESAI | teks tracker bertanda bukti: selesai, pass | H3 FIX: laporan HydraFusion salah 'gagal' ('Stage 1 failed: empty answer') padahal jawaban sampai ke pembaca — buffer pass dibaca tepat setelah await cmd.aiChat, sedangkan frame 'ai-chunk' datang sebagai pengiriman TERPISAH dari hasil invo… |
| 85 (—) | `ext-sadar` | completed | SELESAI | `scripts/cek-runtime-sadar-live.mjs`, `scripts/uji-keadaan-prompt.mjs` | EXT-SADAR: Zephyr AI harus tahu SEMUA ekstensi yang terpasang dan bisa menjelaskan mana yang BISA dipakai vs TIDAK (mis. paket tema/snippet/ikon/keymap/bahasa yang gagal dimuat + alasannya), dijawab dari fakta bukan tebakan — permintaan Ry… |
| 86 (—) | `mode-ai` | completed | SELESAI | teks tracker bertanda bukti: selesai | MODE-AI: hapus mode Chat dari AI Zephyr (chip composer jadi Persona, mode = Run Mode: Interactive/Plan/Autopilot) — agentMode kini selalu 'agent' (bootAgentMode + setAgentMode dipaksa), label/tab 'Chat' → 'Agent', hint CLI chat dibuang [SE… |
| 87 (—) | `persona-teks` | completed | SELESAI | `KONTEKS-ZEPHYR.md`, `USULAN-SUNTIK-KONTEKS.md`, `USULAN-konteks-repo.md` | PERSONA-TEKS: hapus tulisan label di atas daftar persona (header 'PERSONA' di ModeMenu) — permintaan Ryu 2026-10-13 (screenshot image_fb1eaf.png) [SELESAI 2026-10-13: heading dihapus dari ModeMenu; uji hidup U2 'judul seksi PERSONA sudah h… |
| 88 (—) | `ui-copilot` | completed | SELESAI | `uji-copilot-menu.mjs` | UI-COPILOT: bikin composer AI Zephyr mirip VS Code Copilot Chat (screenshot image_fb51bf.png): dropdown mode dengan tanda centang ✓ + item 'Configure Custom Agents…', toolbar bawah (+ | Agent | Auto/Balance | kirim ↑), baris status izin (A… |
| 89 (—) | `i18n-ar-1` | completed | SELESAI | `cek-kunci-i18n-10-kamus.mjs`, `cek-kunci-i18n-extra.mjs` | I18N-AR-1 — SELESAI 2026-10-13 (+ verifikasi gua sendiri): bukan cuma AR, tapi 8 kamus (JA/KO/ZH/ES/FR/DE/PT/AR) yang KURANG 73 kunci yang sama (=584 string UI) sudah TERISI SEMUA lewat subagent `sa-0-221c0156` (`deleg_25388ff9`, 461 detik… |
| 90 (—) | `v1-agen-attach` | completed | SELESAI | `ANTREAN-PESAN-AGEN.md`, `LAPORAN-KETAHANAN-AGEN.md`, `PERAN-SUBAGEN-ZEPH.md` | V1-agen-attach: blok lampiran berkas aktif di jalur AGEN benar-benar terkirim ke provider (bukan kode mati) - payloadAgen dipakai di history.push; bukti: verify09 V4 LULUS, prompt mock memuat 'active working context' + nama tab dan jawaban… |
| 91 (—) | `v1-harness-busy` | completed | SELESAI | teks tracker bertanda bukti: selesai | V1-harness-busy: tungguSelesai() verify09 menunggu agentBusy DAN pending (jalur agen memakai agentBusy; 'pending' milik jalur chat yang pensiun) - sebelumnya uji membaca jawaban di tengah streaming (2026-10-13) |
| 92 (—) | `ai-kanan` | completed | SELESAI | `mcpStore.ts`, `scripts/cek-ai-dua-posisi.mjs`, `scripts/shot-sesi-ini.mjs` | AI-KANAN — SELESAI & TERBUKTI LIVE 2026-10-13 (diverifikasi sendiri oleh asisten, bukan cuma percaya laporan anak). Laporan anak `sa-0-39a017a9` (`deleg_a75643cc`, 898 s, 72 panggilan): SEMUA jalur yang bikin AI muncul/pindah ke PANEL BAWA… |
| 93 (—) | `ai-kanan-2` | completed | SELESAI | `uji-ai-kanan-live.mjs` | AI-KANAN-2 — SELESAI & TERBUKTI LIVE 2026-10-13: container SIDEBAR KANAN memang sudah ada dan sekarang jadi satu-satunya rumah AI — `aside.ai-side-col` (480px, `data-pos='kanan'`, resizer) di `src/App.tsx`, dirapikan bukan dibangun ulang; … |
| 94 (—) | `ai-kanan-3` | completed | SELESAI | `i18n-src.ts`, `i18n.ts` | AI-KANAN-3 — SELESAI 2026-10-13, dan bagian i18n-nya SUDAH dibereskan oleh gua sendiri (bukan ditunda): anak dilarang menyentuh `src/lib/i18n.ts`/`i18n-extra.ts` dan memang tidak menyentuhnya — yang perlu dihapus ternyata cuma SATU kunci m… |
| 95 (—) | `ai-tahu-100-1` | completed | SELESAI | `gen-fakta-zephyr.mjs` | AI-TAHU-100-1 — SELESAI 2026-10-13: fakta digenerate dari SEMUA sumber kebenaran + AKAR MASALAH diperbaiki di generator, bukan cuma gejalanya. Angka SEBELUM (artefak basi): 3713 entri / hashSumber 08a37592659d515b / `--check` EXIT 1 ('zeph… |
| 96 (—) | `ai-tahu-100-2` | completed | SELESAI | `scripts/cek-runtime-sadar-live.mjs`, `scripts/uji-keadaan-prompt.mjs`, `uji-keadaan-prompt.mjs` | AI-TAHU-100-2: keadaan runtime disuntik TIAP GILIRAN dari dalam app (bukan dibaca model/dari disk): nilai setting yang dipakai sekarang, ekstensi terpasang + yang gagal + alasannya, LSP terpasang, layout/panel aktif, MCP on/off+port, versi… |
| 97 (—) | `ai-tahu-100-3` | completed | SELESAI | `scripts/uji-zephyr-self.mjs`, `uji-zephyr-self.mjs` | AI-TAHU-100-3: tool internal 'zephyr_self' di dalam app (BUKAN grep folder user): baca settings.json aktif, tail log, registry ekstensi, hasil loader, dan berkas docs yang dikirim di bundel — dipakai saat pertanyaan dalam (label persis, ke… |
| 98 (98) | `ai-tahu-100-4` | pending | DIGARAP | `docs/BUNDEL-DOKUMEN.md`, `scripts/cek-bundel-docs.mjs`, `scripts/uji-zephyr-self.mjs` | AI-TAHU-100-4: bundel docs/*.md + CHANGELOG + indeks cari di dalam app, agar 'apa yang baru' / 'cara kerja X' dijawab dari dokumen yang dikirim bersama app (bukan dari folder user) — permintaan Khalid 2026-10-13 |
| 99 (—) | `ai-tahu-100-5` | completed | SELESAI | `cek-cakupan-fakta.mjs`, `gen-fakta-zephyr.mjs`, `verify-fakta-zephyr.mjs` | AI-TAHU-100-5 — SELESAI 2026-10-13: '100%' terukur DAN uji negatif gate SUDAH TERBUKTI (syarat yang dulu bolong). Bukti gate bisa MERAH: sesudah sumber berubah tapi artefak belum diregen, `gen-fakta-zephyr.mjs --check` EXIT 1 ('TIDAK SINKR… |
| 100 (—) | `ai-tahu-100-6` | completed | SELESAI | `agentTools.ts`, `devBridge.ts`, `scripts/uji-batas-tulis.mjs` | AI-TAHU-100-6 (temuan Khalid 2026-10-13, BUKTI BARU 2026-10-13): aturan prompt vs perilaku TIDAK KONSISTEN soal tanpa-workspace — blok fakta bilang 'path absolut tetap jalan', tapi shell ditolak 'Menjalankan perintah butuh workspace terbuk… |
| 101 (101) | `ai-tahu-100-7` | pending | DIGARAP | `scripts/cek-batas-inti.mjs`, `scripts/gen-fakta-zephyr.mjs`, `scripts/uji-blok-inti.mjs` | AI-TAHU-100-7 (setuju Khalid + Zeph AI, 2026-10-13): DESAIN PENGETAHUAN DUA LAPIS untuk Zephyr AI, dengan ANGKA — (a) inti tetap selalu nyala ≤2.000 token (identitas, aturan, default+layout kunci, anti-ngarang); (b) sisanya dicari on-demand lewat tool internal + docs bundel: maks 4 potongan × 800 token, cache per sesi; (c) aturan eksplisit isi 'inti' vs 'yang dicari' ditulis di kode/generator (bukan terserah model) supaya prompt tak menggelembung; (d) pencarian LOKAL + deterministik (indeks di dalam app, nol jaringan) dan WAJIB jalan tanpa folder user; (e) keberhasilan diukur harness cakupan N/N + cap hash sumber & versi app (kalau basi, bilang basi). Catatan: todo Zeph AI (panel Todo Zephyr) ≠ list Hermes ini — item ini yang mengikat |
| 102 (102) | `ai-tahu-100-8` | in_progress | DIGARAP | — | AI-TAHU-100-8 — peta kode 393 entri (berkas→simbol/ekspor) + 176 dokumen + 2662 label, `--check` sinkron, cakupan menolak berkas/simbol hantu; akar masalah 'seksi keluar dari Settings lenyap diam-diam' sudah diperbaiki di generator (throw bila seksi keluar tanpa rumah). SISA: (a) tool internal ai-tahu-100-3 untuk MEMBACA berkas kode itu tanpa folder user. (Uji negatif gate SUDAH dibuktikan — lihat ai-tahu-100-5.) |
| 103 (—) | `subagent-tulis` | completed | SELESAI | `scripts/mock-ai.mjs`, `scripts/uji-subagent-tulis.mjs`, `uji-subagent-tulis.mjs` | SUBAGENT-TULIS: SELESAI 2026-10-13 — subagent Zephyr sekarang BENAR-BENAR BISA MENULIS berkas (bukan read-only lagi). Kode: `subagentStore.ts:tulisDiskDilarang()` tidak lagi menahan tulis sampai mode persetujuan `auto`; gerbangnya = setela… |
| 104 (—) | `ai-ingat-sesi` | completed | SELESAI | `CATATAN-KEPUTUSAN-SESI-2026-10-14.md`, `aiMemori.ts`, `aiStore.ts` | AI-INGAT-SESI: AI Zephyr BELUM punya memori antar sesi - tiap sesi mulai dari nol (lupa keputusan, preferensi, hasil kerja sebelumnya; tidak tahu apa yang sudah pernah dikerjakan). Bikin memori persisten ala Hermes: berkas memori (global +… |
| 105 (—) | `ai-set-pindah-1` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | AI-SET-PINDAH-1 — ✅ SELESAI: sapuan akhir seluruh `src` (pola setSettingsOpen(true)/openSettingsSection(/setSection('/buka('/__ZEPHYR_SETTINGS__) = 15 berkas; SEMUA sisa-nya app-level, bukan setelan yang pindah: App.tsx:595 keybinding 'vie… |
| 106 (—) | `ai-set-pindah-2` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | AI-SET-PINDAH-2 — ✅ SELESAI (semua call-site AI sudah ke Pengaturan Chat): ModelSelector.tsx `bukaSettings()` = `useAiChatSettings.getState().bukaDi('models')` dipakai dua tempat (baris 396 tombol empty-state 'Open Chat Settings → Models';… |
| 107 (—) | `ai-set-pindah-3` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | AI-SET-PINDAH-3 — ✅ SELESAI: ChatSettingsPage.tsx tidak lagi punya pembuka Settings lama (satu-satunya hit setSettingsOpen keluarga = baris 170 `applySettings` yang cuma MEMBACA store). Baris 332 → `useAgentCustom.getState().buka('agents')… |
| 108 (—) | `ai-set-pindah-4` | completed | SELESAI | teks tracker bertanda bukti: ✅, selesai | AI-SET-PINDAH-4 — ✅ SELESAI: perintah palet `ai.models` kini `useAiChatSettings.getState().bukaDi('models')` (dibaca langsung dari bytes berkas, bukan ditebak); sisa perintah yang memang app-level dibiarkan (shortcuts/keybindings, mcp, gen… |
| 109 (—) | `ai-set-pindah-5` | completed | SELESAI | `lib-cdp.mjs`, `uji-set-pindah-2026-10-13T11-48-10.json`, `uji-set-pindah.mjs` | AI-SET-PINDAH-5 — SELESAI & TERBUKTI LIVE 2026-10-13 18:48: `node scripts/uji-set-pindah.mjs 9223` → **19/19 PASS, EXIT=0**. 19 pemeriksaan: P0/P1/P2 (permukaan AI ada & tampak, garis dasar bersih, tak ada kontrol bernama lama), A0 KONTROL… |
| 110 (—) | `aim-pop-0` | completed | SELESAI-KLAIM | — | AIM-POP-0 (status, jangan bingung): sore ini gua SUDAH balikin seksi AI Models ke Settings kiri (settingsStore.ts union + SECTION_ORDER 'models', SettingsPage.tsx import+5 case, SettingsNav.tsx 5 NAV_KEY + 5 ikon; diff bersih, tsc 0). Peri… |
| 111 (—) | `aim-pop-1` | completed | SELESAI-KLAIM | — | AIM-POP-1: bikin pop-up/modal 'AI Models' yang BERDIRI SENDIRI (pola sama seperti Agent Customizations: modal di tengah, bisa ditutup, bisa dibuka dari mana saja). Isinya = SELURUH setelan AI Models yang sekarang ada di halaman Settings (l… |
| 112 (—) | `aim-pop-2` | completed | SELESAI-KLAIM | — | AIM-POP-2: Settings KIRI — cabut seksi 'AI Models' dari nav Settings (kembalikan ke luar union/nav-order seperti hasil kerja SETELAN-PINDAH: hapus lagi 'models' dari SectionId + SECTION_ORDER + case render di SettingsPage + baris NAV_KEY/N… |
| 113 (—) | `aim-pop-3` | completed | SELESAI-KLAIM | — | AIM-POP-3: menu '…' di panel chat (gambar image_a2cec3.png) — CABUT entri 'Tool Sets', GANTI jadi entri 'AI Models' yang kalau dipencet LANGSUNG membuka pop-up AI Models (bukan pindah seksi, bukan buka Settings). Catatan: 'Tool Sets' TIDAK… |
| 114 (—) | `aim-pop-4` | completed | SELESAI-KLAIM | — | AIM-POP-4: menu '…' di panel chat — CABUT entri 'Show Voice Transcripts' (di gambar tampak abu-abu/disabled). Alasan user: gaguna. Ikut bersihkan i18n/aksi yang jadi tak terpakai kalau memang tak ada rujukan lain. permintaan user 2026-10-1… |
| 115 (—) | `aim-pop-5` | completed | SELESAI-KLAIM | — | AIM-POP-5: kartu pemberitahuan tanpa API key (gambar image_08b403.png: 'This provider does not have an API key yet — Add an API key for <provider> so the AI can answer. Without a key, every request will fail with 401') — tombolnya HARUS la… |
| 116 (—) | `aim-pop-6` | completed | SELESAI-KLAIM | — | AIM-POP-6: dropdown pemilih model (gambar image_805e11.png: 'Search models…', pesan 'No API key installed yet. Add a key first to pick a model.', tombol 'Open Chat Settings → Models', baris 'Refresh models' & 'Edit models…') — tombol DAN b… |
| 117 (—) | `aim-pop-7` | completed | SELESAI-KLAIM | — | AIM-POP-7: sapu semua jalur/pointer lama yang masih mengarah ke 'Chat Settings → Models' untuk urusan setelan model/API key (mis. ModelSelector bukaDi('models'), deep link di CliChat, commandRegistry, README/AGENTS.md) supaya satu-satunya … |
| 118 (—) | `aim-pop-8` | completed | SELESAI-KLAIM | — | AIM-POP-8: Chat Settings → Models — sisakan 'hydrafusion' saja dulu (setelan provider/API key/base URL/model dipindah ke pop-up AI Models). User sadar skema VS Code-nya belum jelas, jadi versi sekarang cukup menampilkan hydrafusion; jangan… |
| 119 (—) | `aim-pop-9` | completed | SELESAI | `hydraFusion.ts` | AIM-POP-9 (RISET, bukan kerja kode — jangan ngarang): cari tahu skema setelan model 'hydrafusion' yang benar (dan cara VS Code/Copilot mengelola daftar model + API key: provider, baseUrl, model id, penyimpanan key) supaya pengisian pop-up … |
| 120 (—) | `aim-pop-10` | completed | SELESAI | `uji-ai-models-pop.mjs` | AIM-POP-10 — SELESAI & TERBUKTI LIVE 2026-10-13 18:35: `node scripts/uji-ai-models-pop.mjs 9223` **21/21 PASS, EXIT=0** (bukti JSON: C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/uji-ai-models-pop-2026-10-13T11-35-35.json). Semua 6 kri… |
| 121 (—) | `i18n-9kamus-fill` | completed | SELESAI | `i18n-extra.ts` | I18N-9KAMUS-FILL — SELESAI & DITUTUP 2026-10-13. 584 entri baru (73 × 8 bahasa) di src/lib/i18n-extra.ts; kamus 2335 → 2408 kunci masing-masing; ID (2408) & EN (2325) dilaporkan tak disentuh dan jumlah kuncinya tetap sama. Verifikasi INDEP… |
| 122 (—) | `pointer-mati` | completed | SELESAI | `aiStore.ts` | POINTER-MATI (temuan checker fakta 2026-10-13): teks UI yang menyuruh pengguna buka Settings untuk urusan model/API key. SELESAI & TERVERIFIKASI MANDIRI 2026-10-13 19:30: (1) KUNCI di-RENAME (bukan cuma nilai) ke teks sumber baru di SEMUA … |
| 123 (—) | `harness-cdp-rapuh` | completed | SELESAI | `lib-cdp.mjs` | HARNESS-CDP-RAPUH: harness DOM Zephyr bisa keluar angka beda (16/19 vs 19/19 di berkas yang sama) kalau dijalankan sementara agen lain menyunting src/ — Vite HMR me-reload halaman, `window[slot]` hilang. Aturan: jalankan harness DOM hanya … |
| 124 (—) | `pointer-verif` | completed | SELESAI | `ALUR-VERIFIKASI-MANDIRI.md` | POINTER-VERIF (gerbang independen milik asisten): scratch/verif-pointer.mjs — periksa sendiri jumlah kunci/kamus + himpunan identik dgn ID, kunci ganda, frasa mati di NAMA KUNCI & NILAI, dan literal di src/**. SELESAI 2026-10-13 19:30 — RU… |
| 125 (—) | `ai-state-kolektor` | completed | SELESAI | `aiZephyrState.ts` | AI-STATE-KOLEKTOR (AI-TAHU-100-2 + EXT-SADAR tahap 1 — KOLEKTOR saja): berkas BARU src/lib/aiZephyrState.ts. SELESAI & TERVERIFIKASI MANDIRI 2026-10-13 19:30 — src/lib/aiZephyrState.ts 34.148 byte (19:22) ada; 0 impor statis; grep kemurnia… |
| 126 (—) | `prompt6-artefak` | completed | SELESAI | `laporan-prompt6-klasifikasi.md`, `uji-ai-berat.mjs` | PROMPT6-ARTEFAK — SELESAI 2026-10-13: `ZEPHYR-UJI-COBA.txt` TIDAK ADA di akar repo maupun di disk (ls = No such file; `find /d /c/Users/Zyrex` = kosong; `git ls-files '*UJI-COBA*'` = kosong; `git status` = kosong) → tugas hapus tidak butuh… |
| 127 (—) | `prompt6-klasifikasi` | completed | SELESAI | `laporan-prompt6-klasifikasi.md`, `lib-cdp.mjs`, `package.json` | PROMPT6-KLASIFIKASI — SELESAI 2026-10-13, klasifikasi DARI ISI BERKAS (bukan tebakan nama). Angka nyata: `scripts/uji-*.mjs` ter-track **82**, untracked **61**, untracked .mjs akar scripts/ 83, di `scripts/_arsip/` 86 (sengaja diarsipkan, … |
| 128 (128) | `i18n-final` | pending | DIGARAP | `cek-kunci-i18n-10-kamus.mjs`, `cek-kunci-i18n-extra.mjs`, `i18n-extra.ts` | PROMPT7-I18N-FINAL [URUTAN: DIKERJAKAN TERAKHIR — tunggu SEMUA item lain kelar, baru ini]: seluruh bahasa harus SINKRON — kalau pakai Indonesia ya Indonesia, kalau English ya English, TANPA ada yang tertinggal (teks nyasar Inggris di kamus ID / sebaliknya / kunci tak diterjemahkan). Ruang lingkup: 10 kamus di src/lib/i18n-extra.ts (ID acuan + EN/JA/KO/ZH/ES/FR/DE/PT/AR) + src/lib/i18n.ts + src/lib/i18n-src.ts; gate = cek-kunci-i18n-extra.mjs (E1) + cek-kunci-i18n-10-kamus.mjs (E2) + verif-pointer.mjs + tsc 0. Perintah Ryu 2026-10-13: 'prompt 7 i18n, jdi smua bahasa hrs sinkron smua, klo pke indo hrs indo, klo english hrs english, tnpa ada yg tertinggal'. Keadaan sekarang: 2404 kunci identik antar kamus, EN 2321 (kurang 83, teks sumbernya memang Inggris), E1+E2 hijau, ganda 0, tsc 0. Hasil sapuan isi (alat gua scratch/i18n-kerja-list.mjs): 449 kunci perlu ditambal — 161 kunci belum diter… |
| 129 (129) | `prompt8-bug-sisa` | pending | DIGARAP | `uji-keadaan-prompt.mjs`, `uji-zephyr-self.mjs` | PROMPT8-BUG-SISA [URUTAN: DIKERJAKAN TERAKHIR, sesudah prompt 7]: cari dan perbaiki bug SISA sebelum commit — pembersihan akhir sesi: jalankan gate/harness yang ada (verify:11 12/12, verify:09 11/11, cargo test --lib 432/0, tsc 0, E1/E2, uji-memori-sesi 94/94, cek-batas-inti, uji-tahu-zephyr 23/23, uji-panel-memori 8/8, uji-tool-ingat 14/14), perbaiki yang merah, JANGAN commit di item ini. Perintah Ryu 2026-10-13: 'prompt 8 cari dan perbaiki bug sisa sebelum commit'. STATUS 2026-10-13 malam (diperbarui lagi): M5 'blok memori tanpa penanda' SUDAH DIPERBAIKI (uji-memori-live 10/10). Gap `zephyr_self` SUDAH DIVERIFIKASI MANDIRI: uji-zephyr-self.mjs 43/43 EXIT=0 + uji-keadaan-prompt.mjs 21/21 EXIT=0 (dua harness hasil batch deleg_1b0bc315 yang tadinya BELUM pernah dijalankan) — 3 kegagalan yang muncul semuanya bug ACUAN di harness-nya sendiri (toolGate.aktif = Set, IPC Tauri dihitung jaring… |
| 130 (130) | `prompt9-commit` | pending | BELUM | teks tracker bertanda bukti: beres, hijau | PROMPT9-COMMIT [URUTAN: PALING TERAKHIR]: commit lokal SEMUA pekerjaan sesi ini dalam SATU commit (git add eksplisit per berkas/path — DILARANG `git add -A`/`git add .` mengikuti peringatan E2 & kecelakaan wildcard historis; jangan pakai wildcard di scripts/). Baru dijalankan SETELAH prompt 7 + prompt 8 beres dan Ryu memberi lampu hijau. Perintah Ryu 2026-10-13: 'prompt 9 commit local ... commit SEMUA pekerjaan sesi ini dalam satu commit'. |
| 131 (—) | `uji-3bug-acuan` | completed | SELESAI | teks tracker bertanda bukti: exit=0 | UJI-3BUG-ACUAN: 3 bug ACUAN di harness buatan anak delegasi diperbaiki + dibuktikan (bukan bug tool/app): (1) uji-zephyr-self A3 baca toolGate.aktif dengan Array.prototype.slice.call(Set) -> SELALU [] (toolGate.ts:235 aktif = Set<string>) … |
| 132 (—) | `bug-store-mcp-basi` | completed | SELESAI | `aiZephyrState.ts`, `store.ts`, `uji-keadaan-prompt.mjs` | BUG-store.mcp-BASI (temuan baru 2026-10-13, dari akar K11): src/lib/store.ts:88 + :504 menyimpan field `mcp: {enabled,running,port}` = {false,false,9222} yang TIDAK PERNAH ditulis siapa pun di seluruh src/ — padahal ia (a) diekspos lewat j… |
| 133 (133) | `ai-tahu-100-2-sisa` | pending | DIGARAP | `uji-keadaan-prompt.mjs` | AI-TAHU-100-2 SISA (2026-10-13, setelah potret keadaan hijau): (a) LOKALISASI teks blok keadaan — kepala blok masih Inggris ('# Zephyr runtime state - snapshot taken') dan belum ada kunci kamus (usulan: ai.state.snapshotHead / ai.state.snapshotNote) => masuk PROMPT 7 i18n; (b) perilaku LINTAS-RESTART MCP (hidup->mati->hidup) belum dibuktikan dengan pembanding independen; (c) ✅ SELESAI 2026-10-13: dulu F.mcpPort yang dibaca tepat sesudah reload = port DIMINTA (9224) bukan port terpakai (9225), dan field warisan store.mcp menyuntik angka palsu — keduanya sudah ditutup (field dibuang dari store; acuan kini mcp_status + useMcp.status; `uji-keadaan-prompt.mjs` 22/22 termasuk penjaga K11b). |
| 134 (—) | `ai-tahu-100-3-sisa` | completed | SELESAI | `lib.rs`, `logging.rs`, `uji-zephyr-self.mjs` | AI-TAHU-100-3 RUST SELESAI 2026-10-14: log_tail ditambahkan di src-tauri/src/logging.rs (baca_ekor MUNDUR dari ekor berkas, buang baris pertama terpotong rotasi, clamp n 1..1000 / max_bytes 1 KiB..1 MiB, READ-ONLY, tidak menerima path dari… |
| 135 (—) | `bug-git-permit-mati` | completed | SELESAI | `git.rs`, `verify11.mjs` | BUG-GIT-PERMIT-MATI — SELESAI 2026-10-14. Akar (ditemukan 2026-10-14 dari bukti log Rust): repo git tak sengaja di C:/Users/Zyrex → `git status -uall` 36,5s / 68MB (di atas timeout 30s) → badai 'git antre waited_ms=26657..88140' → 'the git… |
| 136 (—) | `ai-tahu-100-3-rust` | completed | SELESAI | `logging.rs`, `uji-zephyr-self.mjs` | AI-TAHU-100-3 RUST SELESAI 2026-10-14: log_tail di src-tauri/src/logging.rs + lib.rs, 8 tes unit, cargo 440/0, build + relaunch app, frontend zephyrSelf.ts tersambung, harness uji-zephyr-self.mjs 44/44 EXIT=0 (B9 + B9b pembanding independe… |
| 137 (137) | `v4v12-izin-terminal-harness` | in_progress | DIGARAP | `mcp_server.rs`, `verify11.mjs` | V4+V12 MERAH = CACAT HARNESS, bukan bug produk & bukan soal timing (selesai diperiksa 2026-10-14): verify11 memanggil terminal_write/terminal_key padahal izin opt-in `mcp.allow_terminal_control` (deny-by-default di src-tauri/src/mcp_server.rs:263-280 → `unwrap_or(false)`) tidak pernah dinyalakan oleh harness mana pun (grep scripts/: 0 sebutan). BUKTI app idle (scratch/probe-v4.mjs): izin MATI → dijawab 'permission denied: terminal control is disabled for MCP' (V4 gagal + screenshot V12 tak memuat marker); izin NYALA → terminal_write/terminal_key ok:true dan baris marker muncul di buffer xterm pada 564 ms (jendela tunggu harness 2200 ms). TINDAKAN: verify11.mjs kini menyalakan izin itu di persiapan V4 lewat jalur app yang sama dengan sakelar Settings (applySettings) dan MEMULIHKAN nilai semula di blok bersih-bersih. SISA: buktikan lewat run penuh (harus 12/12) — run latar UJI_LOG=uji-log… |
| 138 (138) | `zeph-ngawur-bahasa` | pending | DIGARAP | `aiZephyrState.ts`, `scripts/uji-bahasa-jawaban.mjs`, `systemPrompt.ts` | ZEPH-NGAWUR-BAHASA: Zeph AI masih menjawab ngawur dan tiba-tiba beralih ke INGGRIS walau ditanya bahasa Indonesia (laporan Ryu 2026-10-14: 'ditnya" msih ngawur tiba" pke inggris dll'). Wajib: jawab dalam bahasa yang dipakai user (ID→ID) termasuk ketika sumber jawabannya berbahasa Inggris — blok inti `src/lib/zephyrFakta.ts`, indeks `src/lib/zephyrIndeks.ts`, dan kepala blok keadaan '# Zephyr runtime state - snapshot taken' (`src/lib/aiZephyrState.ts`) semuanya berbahasa Inggris dan belum punya kunci kamus (usulan `ai.state.snapshotHead`/`ai.state.snapshotNote` → masuk PROMPT 7). Titik kode: `src/lib/systemPrompt.ts:146` + `:243` (aturan bahasa SUDAH ada tapi dilanggar → periksa urutan/penekanan blok), `bahasaPrompt()` `:308`, bagian `# Language` `:533`. Bukti wajib: contoh jawaban nyata sebelum/sesudah + harness. |
| 139 (139) | `zeph-tahu-100p` | pending | DIGARAP | `gen-fakta-zephyr.mjs`, `shortcuts.ts`, `zephyrIndeks.ts` | ZEPH-TAHU-100PERSEN: Zeph harus paham 100% SELURUH isi Zephyr — bukan cuma daftar setelan: semua TOMBOL/label antarmuka, menu, panel bawah & samping, tiap seksi Settings, pintasan, perintah palet, port, ekstensi bawaan, dokumen bundel (kata Ryu 2026-10-14: 'hrus lengkap smua ny 100% dia ngerti tntang zephyr dri tombol" ny dll nya, intinya smuanya yg ada di zephyr'). Keadaan sekarang: indeks `src/lib/zephyrIndeks.ts` (676KB) sudah punya kategori label/setelan/pintasan/perintah/tool/ekstensi/seksi/port/dokumen/kode/bridge (label ≈2662 entri), TAPI blok inti sudah dipotong ke 7.950 char (keputusan `ai-tahu-100-7a`) sehingga sisanya hanya terjangkau lewat tool `zephyr_self`. SISA: (a) sapu setiap permukaan UI nyata vs kategori `label` (tombol/label dari `src/components/**`, `src/lib/shortcuts.ts`, perintah palet) dan tambal generator `scripts/gen-fakta-zephyr.mjs` bila bolong; (b) buktikan … |
| 140 (140) | `zeph-retrieval-otomatis` | pending | DIGARAP | `aiStore.ts`, `systemPrompt.ts`, `zephyrCari.ts` | ZEPH-RETRIEVAL-OTOMATIS (ini `ai-tahu-100-7b`, akar dari 'bego'): suntik potongan indeks secara OTOMATIS tiap giliran berdasarkan pesan user — maks 4 potongan × 800 token, cache per sesi, lokal + deterministik (nol jaringan, tetap jalan tanpa folder user) — supaya Zeph TIDAK bergantung pada model memanggil `zephyr_self` sendiri. Kalau model malas/tidak memanggil, blok inti 7.950 char tidak cukup untuk pertanyaan tombol/setelan → jawaban ngawur. Titik kode: `src/lib/zephyrCari.ts` (`cariFakta` :203), penyusun prompt `src/lib/systemPrompt.ts` (:446-570), `src/lib/zephyrTools/zephyrSelf.ts`, jalur kirim `src/lib/aiStore.ts`. Bukti: harness dua-lapis + hitungan potongan yang BENAR-BENAR masuk body request ke provider. |
| 141 (141) | `harness-pengetahuan-2lapis` | pending | DIGARAP | `cek-pengetahuan-live.mjs`, `mock-ai.mjs` | HARNESS-PENGETAHUAN-DUA-LAPIS: `scripts/cek-pengetahuan-live.mjs` MUSTAHIL lulus dengan mock — `scripts/mock-ai.mjs` (499 baris) adalah boneka scripted: perilakunya hanya ditentukan penanda di prompt (BASHCMD/RMCMD/TEXTONLY/TOOLCALL:<nama>/ERR401/WRITEPATH), default balas tool call `todo_write` dulu + ringkasan kosong. Jadi B3/B4/B5 + C2/C3/C5 mengukur boneka, bukan aplikasi, dan C4 ('tidak pakai tool') mustahil karena mock selalu menjalankan `todo_write` lebih dulu. TINDAKAN: ubah bagian B/C jadi DUA LAPIS — (1) periksa body request yang benar-benar diterima provider: `agents.maxPanes` + nilai bawaannya, port MCP 9222, port CDP/debug 9223, kontrol sub-agent (maxParallel/allowWrite) di Chat Settings, Ctrl+J, settings.json harus ADA di blok inti ATAU dijawab lewat `zephyr_self`; (2) run nyata hanya dijalankan bila provider ber-key asli — kalau tidak, tandai SKIP dengan alasan jujur, buka… |
| 142 (142) | `pakai-subagent` | pending | BELUM | — | PAKAI-SUBAGENT (perintah Ryu 2026-10-14: 'pke subagents lu biar cpet kelar kerjaan ini'): pecah backlog jadi jalur paralel yang berkasnya TIDAK bertabrakan. Aturan wajib untuk tiap anak: (i) JANGAN menjalankan harness CDP selagi ada agen lain menyunting `src/**` (Vite HMR me-reload halaman dan mematikan jembatan/slot) dan jangan dua harness bareng, (ii) JANGAN `git add`/`git commit`, (iii) JANGAN pakai wildcard di `scripts/` (insiden `rm -f scripts/p-*.mjs` pernah menghapus 43 script), (iv) berkas hasil generator (`zephyrIndeks.ts`, `zephyrFakta.ts`) hanya boleh disunting SATU agen, sisanya regenerasi milik gua, (v) klaim anak ≠ bukti: hasil wajib diverifikasi gua dengan gate + harness. |
| 143 (—) | `zeph-retrieval-kata-tanya` | completed | SELESAI | `AUDIT-KATALOG-TOOL.md`, `KEPUTUSAN-KATALOG-118-105.md` | zeph-retrieval-kata-tanya (SELESAI & TERBUKTI 2026-10-14): pencari indeks `zephyrCari.ts` diperbaiki — KATA_UMUM 83→128 (+berapa,tombol,fungsi,label,live/panel,menu,nama,daftar,sebutkan,port), ditambah fallback kecocokan token NAMA (`namaD… |
| 144 (—) | `zeph-cari-kamus-cache` | completed | SELESAI | `zephyrCari.ts` | ZEPH-CARI-KAMUS-CACHE (SELESAI 2026-10-14): `src/lib/zephyrCari.ts` memakai cache modul `KAMUS_INDEKS` (baris 199 & 213: `if (KAMUS_INDEKS) return KAMUS_INDEKS;` / `KAMUS_INDEKS = kamus;`) TANPA pernah mendeklarasikannya — agen 1 (lane bah… |
| 145 (145) | `agen-1-mati-429` | in_progress | DIGARAP | `ANTREAN-PESAN-AGEN.md`, `LAPORAN-KETAHANAN-AGEN.md`, `PERAN-SUBAGEN-ZEPH.md` | AGEN-MATI-429 (SEMUA ANAK DELEGASI MATI, gua ambil alih): 2 dari 4 anak deleg_48bc31b8 MATI oleh `HTTP 429 batas kecepatan VIP Pass` — sa-0 (lane bahasa+retrieval, 1439 s) dan sa-1 (lane indeks/generator, 1455 s); 2 anak lain (harness dua-lapis + subset tool) SELESAI normal. Warisan yang sudah gua verifikasi: `namaDalamKueri()`/`kamusIndeks()`/`kataTakDikenal()` (zephyrCari.ts), `subsetAlat.ts` + `agentDorong.ts` (terpasang nyata di aiStore.ts:31-34 & :5637-5640, subsetAlat diekspos devBridge.ts:313), `cek-pengetahuan-2lapis.mjs` (27.235 B) + `uji-jawab-bahasa.mjs` (9.405 B), `cek-pengetahuan-live.mjs` UTUH (15.396 B, tidak ditimpa). DUA BUG WARISAN sudah gua tambal: deklarasi `KAMUS_INDEKS` hilang (ReferenceError senyap) + regresi anti-ngarang `kataTakDikenal`. SISA: bukti bahasa Indonesia lewat jawaban nyata + hasil 8 harness CDP — sedang berjalan = `gate-2026-10-14i.sh` (proc_0f2f2da… |
| 146 (—) | `zeph-cari-asing-konten` | completed | SELESAI | `uji-tahu-zephyr.mjs` | ZEPH-CARI-ASING-KONTEN (SELESAI 2026-10-14): REGRESI ANTI-NGARANG ketemu+ditambal. Versi agen 1 membuat `kataTakDikenal()` HANYA melaporkan token NAMA, sehingga istilah karangan huruf kecil TIDAK pernah dilaporkan — gate `uji-tahu-zephyr.m… |
| 147 (—) | `zeph-indeks-regen-429` | completed | SELESAI | `gen-fakta-zephyr.mjs` | ZEPH-INDEKS-REGEN-429 (SELESAI 2026-10-14): agen indeks/generator (sa-1-a789c0a0) juga MATI oleh HTTP 429 di tengah kerja, jadi regenerasi indeks gua kerjakan sendiri: `node scripts/gen-fakta-zephyr.mjs` EXIT=0 -> zephyrFakta.ts 9.843 B + … |
| 148 (—) | `harness-2lapis-escape-bug` | completed | SELESAI | `cek-pengetahuan-2lapis.mjs`, `cek-pengetahuan-live.mjs`, `verify-fakta-zephyr.mjs` | HARNESS-2LAPIS-ESCAPE-BUG (SELESAI 2026-10-14, gua sendiri): `scripts/cek-pengetahuan-2lapis.mjs` (warisan agen) punya regex dengan SATU LAPIS ESCAPE BERLEBIH: `/Folder-scoped tools \\(list_directory, glob, grep\\) are not offered/` dituli… |
| 149 (149) | `zeph-format-tabel` | pending | DIGARAP | `JAWABAN-TABEL-DAN-DAFTAR.md`, `scripts/uji-tabel-markdown.mjs`, `systemPrompt.ts` | ZEPH-FORMAT-TABEL (baru 2026-10-14, dari obrolan Ryu): Zeph AI HARUS bisa mengeluarkan TABEL Markdown + list seperti jawaban agen luar. DUA SISI terpisah yang keduanya belum terverifikasi: (1) INSTRUKSI FORMAT di prompt — trik ini yang dipakai agen lain: tulis contoh sintaks persis di prompt (`| kolom | kolom |` + baris pemisah `|---|`) + 'pakai tabel kalau datanya punya baris+kolom, bullet kalau cuma daftar, numbered kalau urutan'; yang sudah gua lihat di blok inti Zephyr baru aturan bahasa + anti-ngarang + fakta UI, aturan format jawaban BELUM ada; (2) RENDERER di panel chat — kalau komponen pesan cuma teks biasa, tabel akan tampil sebagai deretan pipa mentah walau modelnya benar. Langkah: baca `src/lib/systemPrompt.ts` + `src/lib/zephyrFakta.ts` (aturan format ada/nggak) dan komponen renderer pesan chat panel AI (dukungan GFM tabel). Tambalan kalau bolong: ~5 baris contoh sintaks di … |
| 150 (150) | `zeph-browser-builtin` | pending | DIGARAP | `SPIKE-150-pane-browser.md` | ZEPH-BROWSER-BUILTIN (jurang terbesar vs TEDI, 2026-10-14): pane browser di dalam Zephyr + otomasi AI-nya (buka/klik/isi form/screenshot/cek console). DUA jalur yang sudah tergambar: (a) sambung server MCP Playwright lewat klien MCP Zephyr yang SUDAH jalan (port 9222) = jalur terpendek, nol editor-host baru; (b) child webview Tauri seperti TEDI (pane sendiri, Windows-only di versi TEDI). BATAS: konten web tidak boleh seenaknya dikasih ke model — perlu kebijakan (izinn opt-in + daftar host) dan batas ukuran output. Bukti wajib: screenshot pane + satu tugas nyata end-to-end (buka URL, isi form, baca hasil) DIJALANKAN, bukan rancangan. |
| 151 (151) | `zeph-screenshot-tool` | pending | DIGARAP | `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `docs/RANCANGAN-TANGKAP-JENDELA.md` | ZEPH-SCREENSHOT-TOOL (baru 2026-10-14): tangkapan layar window Zephyr sebagai fitur (pintasan + simpan + clipboard) DAN sekaligus sebagai TOOL untuk Zeph AI — jadi 'mata' model (model multimodal bisa melihat UI Zephyr sendiri: panel, dialog, error yang muncul di layar). Ini pasangan alami dari indeks label/elemen: indeks bilang di mana tombol, screenshot membuktikan tampilannya. Murah, dampak besar. Bukti wajib: berkas PNG di disk + jalur kirim gambar ke provider terbaca di body request (bukan cuma klaim). |
| 152 (152) | `zeph-ekstensi-jalur` | pending | DIGARAP | `LAPORAN-TEMUAN-EKSTENSI-A-2026-10-14.md`, `SPESIFIKASI-EKOSISTEM-EKSTENSI-ZEPHYR.md`, `SPIKE-169-jalur-ssh.md` | ZEPH-EKSTENSI-JALUR (baru 2026-10-14, jawaban atas pertanyaan Ryu 'bikin ekstensi sendiri + tarok di GitHub lalu sambungin?'): ekosistem ekstensi SENDIRI baru layak setelah jalurnya dibuka. DUA KELAS yang harus dibedakan — (A) DEKLARATIF (tema/snippet/icon theme/grammar/keymap): SUDAH terbukti hidup live di Zephyr (tema VS Code cocopon.iceberg terpasang, 7 paket snippet kepakai saat mengetik, icon theme '19 icon themes / nothing skipped'); (B) BERKODE (browser/SQL/API client/dev-env): BELUM ADA extension host-nya — dan inilah alasan TEDI harus menulis semuanya sendiri. URUTAN yang benar: (1) buka jalur = tambah host GitHub ke allowlist unduh (sekarang cuma `IZIN=['open-vsx.org','www.open-vsx.org']`, `ext_pkg.rs:1152`) + sediakan indeks registry + validasi manifest SEBELUM dipakai (https-only, batas MAX_ZEXT_BYTES, id_aman, engine_cocok — komponennya ~90% sudah ada); (2) buktikan pipelin… |
| 153 (153) | `zeph-larangan-blok` | pending | DIGARAP | `BLOK-INTI-101-133-153-162.md` | ZEPH-LARANGAN-BLOK (2026-10-14): blok 'cara kerja + LARANGAN' padat di dalam inti — ambil STRUKTUR penegasan agen luar, BUKAN panjangnya. Isi minimal: baca dulu sebelum menebak; kalau tool gagal, baca error + coba cara lain, jangan ulangi perintah yang sama; JANGAN mengarang output — gagal ya bilang gagal + error persisnya; JANGAN menampilkan kredensial walau diminta; JANGAN commit/push tanpa diminta; 'selesai' wajib berarti sudah dijalankan + hasilnya dibaca; ikuti bahasa user (ID → ID). HAMBATAN NYATA: blok inti sekarang 7.950 char (1.988 dari ±2.000 token) — nambah aturan WAJIB disertai pemangkasan/penyaringan blok lain (lihat zeph-blok-kondisional). Jangan salin daftar panjang agen luar (langsung jebol batas). Bukti wajib: batas-inti tetap LULUS setelah penambahan + perbandingan jawaban sebelum/sesudah pada kasus 'ngarang output saat tool gagal'. |
| 154 (154) | `zeph-peran-subagent` | pending | DIGARAP | `PERAN-SUBAGEN-ZEPH.md` | ZEPH-PERAN-SUBAGENT (2026-10-14): peran sub-agent TERKETIK + batas per peran — explorer (baca saja), worker (tulis, folder dibatasi), reviewer (baca + komentar, tanpa tulis), peneliti dokumen. Pondasi sudah ada dan terbukti: `agents.maxParallel` + `allowWrite` + `maxPanes` (default 6) di Chat Settings, ditambah temuan hari ini bahwa agen yang mati di tengah kerja meninggalkan berkas setengah jadi (2 anak delegasi mati 429). Jadi peran + batas tulis juga soal KESELAMATAN, bukan cuma kerapian. Bukti wajib: satu tugas dijalankan dengan >=2 peran berbeda dan batasnya benar-benar menahan (mis. reviewer ditolak saat mencoba menulis). |
| 155 (155) | `zeph-tool-jendela` | pending | DIGARAP | `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `RANCANGAN-TANGKAP-JENDELA.md` | ZEPH-TOOL-JENDELA (2026-10-14): ekspos kontrol jendela/editor sebagai TOOL RESMI (buka/tutup/split pane, ganti tab, rotate layout, buka Settings / Source Control / Command Palette, ganti tema/font/zoom) supaya model MEMANGGIL tool, bukan MENGARANG nama tombol — ini akar langsung dari keluhan 'ngawur'. Sekarang sebagian sudah ada lewat perintah internal + dev bridge, tapi belum jadi permukaan tool yang ketat dengan nama & skema jelas. Bukti wajib: harness yang menyuruh model melakukan 5 aksi UI dan memeriksa KEADAAN app sesudahnya (pane/tab/tema benar-benar berubah), bukan sekadar jawaban teks. |
| 156 (156) | `zeph-ukur-mutu-jawaban` | pending | DIGARAP | `JAWABAN-TABEL-DAN-DAFTAR.md`, `UKUR-MUTU-JAWABAN.md`, `uji-jawaban` | ZEPH-UKUR-MUTU-JAWABAN (2026-10-14, ini yang mengubah 'kayaknya paham' jadi ANGKA seperti permintaan Ryu '100% ngerti'): set pertanyaan acuan + jawaban resmi yang dinilai OTOMATIS. Sekarang harness menguji 'prompt memuat X' dan 'kata terlarang muncul', BUKAN 'jawabannya benar'. Harus ada: kumpulan soal uji (tombol/label antarmuka, setelan + nilai bawaannya, pintasan, port, perintah palet, lokasi berkas) + jawaban acuan dari indeks + penilai otomatis + laporan skor per kategori, dijalankan ke PROVIDER NYATA (bukan mock). Tanpa ini, tiap kali Ryu merasa 'masih bego', tidak ada cara membuktikan sudah beres atau belum. |
| 157 (157) | `zeph-konteks-repo` | pending | DIGARAP | `KONTEKS-REPO.md`, `USULAN-SUNTIK-KONTEKS.md`, `USULAN-konteks-repo.md` | ZEPH-KONTEKS-REPO (2026-10-14): konteks repo USER (kode yang sedang dibuka) — simbol/ekspor/impor/berkas uji, dicari LOKAL + deterministik seperti indeks Zephyr sendiri. Keadaan sekarang: indeks 6.192 entri itu SEMUANYA tentang Zephyr (aplikasinya), jadi Zeph AI paham dirinya sendiri tapi tidak paham proyek yang sedang Ryu kerjakan — ini harga masuk untuk jadi pengganti VS Code + Copilot sehari-hari (Copilot menang justru di sini). Harus tetap jalan tanpa jaringan dan tanpa mengirim kode ke luar batas yang disetujui user. |
| 158 (158) | `zeph-provider-fallback` | pending | DIGARAP | `PROVIDER-429.md` | ZEPH-PROVIDER-FALLBACK (2026-10-14, kejadian nyata hari ini): penanganan provider gagal untuk Zeph AI — HTTP 429 (batas kecepatan) membunuh 2 dari 4 anak delegasi (1439 s & 1455 s, 104 & 102 panggilan) dan perilaku app saat itu tidak dirancang: tidak ada retry berjenjang, tidak ada fallback model, tidak ada pesan jujur ke user. Wajib: retry + backoff untuk 429, fallback antar-model/provider, batas waktu per giliran, dan pesan yang jelas ('provider menolak sementara, ini yang dicoba') — bukan diam-diam gagal. Ini juga menjelaskan kenapa 'kadang bego' terasa random: sebagian kegagalan sebenarnya kegagalan provider, bukan kegagalan pengetahuan. |
| 159 (159) | `zeph-baca-kode-sendiri` | pending | BELUM | — | ZEPH-BACA-KODE-SENDIRI (sisa ai-tahu-100-8a, 2026-10-14): tool internal untuk MEMBACA ISI berkas kode Zephyr (bukan cuma peta 393 entri berkas→simbol). Sekarang Zeph bisa menunjuk `ActivityBar.tsx:371` tapi tidak bisa membaca isinya untuk menjelaskan cara kerjanya — jadi jawaban 'cara kerja X' berhenti di tingkat daftar. Wajib: baca terbatas (baris/potongan), tanpa folder user, tetap lokal. |
| 160 (160) | `zeph-versi-indeks-basi` | pending | BELUM | — | ZEPH-VERSI-INDEKS-BASI (2026-10-14): indeks/fakta harus memuat cap hash sumber + versi app, dan Zeph WAJIB bilang 'ini bisa basi' kalau cap tidak cocok. Sudah kejadian nyata: indeks digenerate sementara agen masih menulis `src/**` → gate 'indeks sinkron' merah dan sebentar app menjawab dari indeks basi. Sekarang generator dijalankan manual; tanpa cap, tidak ada yang tahu jawabannya sudah usang. |
| 161 (161) | `zeph-klaim-nilai` | pending | BELUM | — | ZEPH-KLAIM-NILAI (2026-10-14): penjaga anti-ngarang tahap kedua — sekarang `kataTakDikenal()` menangkap ISTILAH yang tidak ada di Zephyr ('teleportasi' ketangkep), tapi NILAI/ANGKA salah tetap lolos: misalnya model menjawab 'bawaan maxPanes 8' padahal faktanya 6, atau menukar port MCP 9222 dengan CDP 9223. Perlu pemeriksa klaim-nilai (angka/port/default/pintasan) yang membandingkan jawaban dengan indeks setelah jawaban jadi + retry/perbaikan bila menyimpang. |
| 162 (162) | `zeph-blok-kondisional` | pending | DIGARAP | `BLOK-INTI-101-133-153-162.md` | ZEPH-BLOK-KONDISIONAL (2026-10-14): pemilihan blok inti KONDISIONAL supaya aturan baru (format tabel, larangan, dsb) bisa masuk TANPA menembus batas ±2.000 token yang sekarang sudah mepet (1.988/2.000). Contoh: kalau pertanyaannya jelas soal kode/repo, blok UI-timeout bisa dimatikan; kalau pertanyaan soal tombol/setelan, blok kode diringkas. Ini yang menjaga keputusan desain inti-kecil + indeks on-demand tetap hidup sambil menambah aturan. |
| 163 (163) | `zeph-verifikasi-sisa-2` | in_progress | DIGARAP | `ALUR-VERIFIKASI-MANDIRI.md`, `cek-pengetahuan-2lapis.mjs`, `verify11.mjs` | ZEPH-VERIFIKASI-SISA-2 (2026-10-14, kerjaan yang KEBURU KEBUNUH): (a) jalankan ulang `node scripts/cek-pengetahuan-2lapis.mjs` untuk membuktikan tambalan escape gua — sebelumnya A9 GAGAL karena regex di berkas harness kelebihan satu lapis backslash, sudah dirapikan + `node --check` EXIT=0, tapi BELUM dibuktikan hijau lewat run; (b) lanjutkan `verify11.mjs` dari V10 — run terakhir sampai V1-V9 LULUS (termasuk V4 setelah izin kendali terminal dinyalakan harness) lalu prosesnya dimatikan; sisa V10/V11/V12 belum ada hasilnya. |
| 164 (164) | `zeph-munculin-ui` | pending | DIGARAP | `aiZephyrState.ts` | ZEPH-MUNCULIN-UI (tambahan Ryu 2026-10-14, contoh dari agen lain: 'Settings sudah saya buka di perintah sebelumnya (lewat settings.open). Cek state:'): Zeph AI harus bisa LANGSUNG MEMUNCULKAN UI di Zephyr dan MEMBUKTIKANNYA, bukan cuma menjawab teks. Dua perilaku yang harus ada sekaligus: (1) AKSI UI NYATA — buka Settings (`settings.open`), panel samping/bawah, Command Palette, Source Control, berkas/folder di editor, terminal, tab baru, mode/zoom/tema — dieksekusi lewat tool resmi berjalan; (2) CEK KEADAAN SESUDAHNYA — model membaca kembali keadaan app (pane terbuka? tab aktif mana? tema apa? seksi mana yang tampil?) lalu melaporkannya apa adanya, mis. 'Settings sudah dibuka lewat settings.open. Cek state: seksi X aktif, nilai Y = Z'. Alasan ini penting: 'berkata sudah membuka padahal tidak' adalah kegagalan yang SAMA dengan mengarang output — jadi aksi UI wajib diikuti pembacaan keada… |
| 165 (165) | `zeph-tool-berkas-audit` | pending | DIGARAP | `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `catalog.ts` | ZEPH-TOOL-BERKAS-AUDIT (tambahan Ryu 2026-10-14, dari daftar kemampuan agen lain poin 3): AUDIT DULU lalu tambal yang bolong untuk operasi berkas di DALAM app (bukan cuma lewat shell): baca/tulis/edit/hapus/rename/copy/move berkas + glob (cari berkas) + grep (cari ISI kode di seluruh repo) + buka berkas di editor. Keadaan yang gua tahu: katalog tool internal Zephyr ada 62 entri (56 lolos penyaringan subset, terbukti uji-subset-alat 10/10 live), TAPI gua BELUM memeriksa satu per satu mana operasi yang sudah punya tool sendiri dan mana yang selama ini cuma mengandalkan terminal. Langkah: daftar isi `src/lib/zephyrTools/catalog.ts` lalu bandingkan dengan daftar operasi di atas, catat bolongnya, tambal HANYA yang bolong (jangan bikin tool kembar). Batas wajib: nol akses ke folder user di luar yang dibuka, hapus/rename/copy harus punya jalur konfirmasi + reversibilitas, dan hasil besar dipot… |
| 166 (166) | `zeph-replace-in-files` | pending | DIGARAP | `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` | ZEPH-REPLACE-IN-FILES (tambahan Ryu 2026-10-14, dari poin 3 agen lain: 'Refactor lintas file (replace_in_files)'): cari-dan-ganti yang SADAR KODE di banyak berkas sekaligus dalam satu panggilan — bukan memaksa model membuka-tulis satu per satu (lambat + rawan setengah jalan kalau run mati, sudah kejadian hari ini: 2 anak delegasi mati 429 dan meninggalkan berkas setengah jadi). Wajib: batas (daftar berkas/folder, pola berkas), laporan per-berkas (berapa penggantian, mana yang dilewati), dan JALUR BATAL (revert sekali perintah) karena ini operasi paling berbahaya untuk repo user. Wajib juga: pilihan pratinjau diff sebelum jalan untuk jumlah penggantian besar. Bukti wajib: satu refactor nyata >=5 berkas dengan hitungan penggantian + pemeriksaan `tsc`/test setelahnya + perintah batal diuji. |
| 167 (167) | `zeph-alur-verifikasi-mandiri` | pending | DIGARAP | `ALUR-VERIFIKASI-MANDIRI.md`, `SPIKE-169-jalur-ssh.md`, `docs/ALUR-VERIFIKASI-MANDIRI.md` | ZEPH-ALUR-VERIFIKASI-MANDIRI (tambahan Ryu 2026-10-14, dari poin 4 agen lain: 'Jalankan test/lint/typecheck buat verifikasi'): Zeph AI harus menjalankan pemeriksaan SENDIRI lalu MEMBACA kegagalannya dan memperbaiki — lingkar penuh: tulis perubahan → jalankan tsc/test/lint gate → baca keluaran → benerin → ulangi sampai hijau atau berhenti dengan alasan jujur. Sekarang pondasinya ada (gate proyek: verify:11 12/12, verify:09 11/11, cargo test --lib 441/0, tsc 0; plus pemangkas keluaran tool) tapi yang belum pasti adalah perilaku MODEL-nya: apakah ia benar-benar menjalankan lalu membaca, atau berhenti setelah 'sepertinya sudah benar' (persis kelas kegagalan yang kita larang di zeph-larangan-blok). Wajib: jalur perintah uji bisa ditentukan per proyek, keluaran dipotong supaya hemat konteks, dan bila lingkungan menghalangi pemeriksaan (dependensi hilang dsb) model WAJIB melaporkan 'belum dive… |
| 168 (168) | `zeph-analis-gambar` | pending | DIGARAP | `ANALIS-GAMBAR.md`, `USULAN-analis-gambar.md`, `aiStore.ts` | ZEPH-ANALIS-GAMBAR (tambahan Ryu 2026-10-14, dari poin 5 'analis gambar' + poin 7 'Analisis gambar/screenshot — baca grafik, diagram'): Zeph AI harus bisa MENERIMA dan MEMBACA gambar yang dikirim user (tangkapan layar error, diagram, grafik, desain, foto UI) dan mengirimnya ke model yang mendukung gambar. Sekalian jadi pasangan zeph-screenshot-tool: model bisa melihat UI/tangkapan layar Zephyr sendiri dan menilai tampilannya. Yang BELUM gua verifikasi dan tidak gua klaim: apakah panel chat Zephyr sudah punya lampiran gambar, apakah provider yang dipakai diberi isi gambar, dan berapa batas ukuran. Langkah: periksa jalur kirim pesan (`src/lib/aiStore.ts`) + komponen input chat; bila bolong, tambal (tempel gambar / seret berkas / dari clipboard) + perbesar/potong gambar sebelum kirim + beri tahu bila model tidak mendukung gambar (jangan diam-diam buang lampiran). Bukti wajib: satu pertanya… |
| 169 (169) | `zeph-ssh-jalur` | pending | DIGARAP | `SPIKE-169-jalur-ssh.md` | ZEPH-SSH-JALUR (tambahan Ryu 2026-10-14, poin 6 agen lain: 'SSH: buka koneksi tersimpan & jalankan perintah di server'): dukungan SSH di Zephyr — daftar koneksi tersimpan (host/port/user/kunci), buka sesi di terminal pane, jalankan perintah di server, plus dipakai model (jalankan perintah remote, baca hasil). NOL sekarang (belum ada jalurnya). KESELAMATAN wajib lebih ketat daripada terminal lokal: izin opt-in terpisah (deny-by-default, seperti kendali terminal MCP sekarang yang dimatikan secara bawaan), kunci/kredensial disimpan lewat penyimpanan rahasia OS — TIDAK di berkas setelan biasa dan TIDAK pernah ditampilkan di jawaban model, dan perintah yang menghapus/berbahaya butuh konfirmasi. Bukti wajib: satu sesi nyata ke server uji dengan perintah sederhana yang hasilnya diperiksa, plus uji negatif: kunci TIDAK muncul di berkas setelan maupun di jawaban. |
| 170 (170) | `zeph-git-worktree` | pending | DIGARAP | `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` | ZEPH-GIT-WORKTREE (tambahan Ryu 2026-10-14, poin 6 agen lain: 'Git worktree: bikin checkout paralel'): buat/daftar/hapus git worktree dari dalam Zephyr (UI + tool untuk model) supaya kerja paralel di beberapa cabang tidak saling menimpa — kebutuhan yang sudah terasa nyata di sesi ini (banyak perubahan sementara di worktree utama + butuh tempat bersih untuk menguji). Wajib: nama folder + cabang jelas, cek cabang sudah dipakai worktree lain, dan JANGAN menghapus worktree yang masih punya perubahan tanpa konfirmasi + peringatan eksplisit. TERKAIT: item lama E2 (larangan `git add -A`) dan riwayat insiden wildcard di scripts/ — jadi jalur ini juga harus menolak operasi destruktif massal. Bukti wajib: satu alur nyata bikin worktree → jalankan sesuatu di sana → hapus dengan aman, diperiksa dari terminal biasa. |
| 171 (171) | `zeph-jadwal-command` | pending | DIGARAP | `BATAS-DAN-JADWAL.md`, `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` | ZEPH-JADWAL-COMMAND (tambahan Ryu 2026-10-14, poin 7 agen lain: 'Jadwalkan perintah di masa depan (schedule_command)'): penjadwalan tugas di Zephyr — model (atau user) bisa menaruh perintah/pekerjaan berjalan di waktu tertentu (mis. 'jam 15.00 jalankan gate dan laporkan', 'setiap Senin periksa pembaruan') dan hasilnya masuk kembali ke panel chat/notifikasi. NOL sekarang. Yang sudah ada sebagai rujukan pola: sisi Hermes memakai cron terpisah, jadi di Zephyr ini harus mandiri (penyimpanan tugas + pemanggil waktu + antrean + jalan saat app hidup; kalau app mati, harus jelas apakah tugas dilewatkan atau dijalankan saat menyala — jangan diam-diam hilang). Wajib: batas jumlah tugas, daftar yang bisa dilihat/dibatalkan user, dan izin: tugas terjadwal TIDAK boleh memakai kendali terminal/kredensial tanpa persetujuan terpisah. Bukti wajib: satu tugas terjadwal nyata yang berjalan sendiri lalu ha… |
| 172 (172) | `zeph-audit-katalog-tool` | pending | DIGARAP | `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `KEPUTUSAN-KATALOG-118-105.md` | ZEPH-AUDIT-KATALOG-TOOL (2026-10-14, keputusan Ryu: MASUKIN hasil obrolan — ini langkah pertama yang disepakati untuk semua urusan tool): AUDIT READ-ONLY `src/lib/zephyrTools/catalog.ts` + penyaring subset (`src/lib/subsetAlat.ts`) TANPA menyentuh kode. Yang harus keluar dari audit: (a) daftar SEMUA nama tool apa adanya + jumlahnya (angka fakta, bukan perkiraan '70an'); (b) tandai yang KEMBAR/NYEREMpet (dua tool yang fungsinya tumpang tindih → penyebab 'ngawur' karena model milih yang salah); (c) tandai yang bisa DIGABUNG jadi satu tool berparameter (contoh: `panel.open{which:settings|sourceControl|palette}` bukan tiga tool; `file.op{op:rename|copy|delete}`); (d) hitung berapa tool yang BENAR-BENAR ditawarkan per giliran sekarang (angka inilah yang dijaga, bukan total katalog); (e) bandingkan dengan daftar kemampuan agen lain + daftar kebutuhan Ryu (unduh/fetch/git/package/browser/SSH) … |
| 173 (173) | `zeph-fetch-web` | pending | DIGARAP | `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` | ZEPH-FETCH-WEB (2026-10-14, dari obrolan 'isi halaman/teks/JSON'): tool internal AMBIL-WEB yang benar, bukan sekadar menyuruh model memakai curl di shell. Alasan (bukan sekadar menambah tool): curl di shell rawan kutip → satu tanda kutip salah, perintah rusak dan model salah baca error; keluaran mentah bisa banjir (halaman 500 KB masuk konteks); efek samping bebas. Yang benar: URL divalidasi (https-only, host dibatasi izin seperti pola allowlist unduh `ext_pkg.rs:1152`, jangan izinkan localhost/internal tanpa izin), keluaran DIPOTONG, JSON bisa dibaca langsung (bukan teks mentah), nol shell, ada batas ukuran + waktu, dan hasilnya bisa langsung ditulis ke berkas. STATUS: apakah katalog Zephyr SUDAH punya tool fetch belum diperiksa (masuk audit); item ini tetap berlaku sebagai 'rumah yang benar' untuk kemampuan itu. TERKAIT: nomor 5 agen lain (aset dari halaman yang butuh login/JS) TIDAK … |
| 174 (174) | `zeph-unduh-instal-teruji` | pending | DIGARAP | `UNDUH-INSTAL-TERUJI.md`, `docs/UNDUH-INSTAL-TERUJI.md` | ZEPH-UNDUH-INSTAL-TERUJI (2026-10-14, dari obrolan: 'file apa pun dari URL', 'repo GitHub', 'package npm/pip/winget'): ketiganya SEKARANG bisa lewat terminal, tapi BELUM PERNAH DIBUKTIKAN dengan kasus nyata dan ada tiga titik yang bisa bikin kacau — jadi item ini soal MEMBUKTIKAN + MERAPIKAN, bukan membangun dari nol. (1) PEMANGKAS KELUARAN: curl mencetak bar progres dan npm install mencetak ratusan baris — pemangkas tool Zephyr sudah teruji (uji-trim-tool 15/15) tapi belum pernah diuji dengan keluaran unduhan/instalasi; (2) PERINTAH INTERAKTIF: npm menanya Y/n, winget menanya setuju, sudo meminta sandi → kalau model tidak bisa menjawab prompt, perintah menggantung dan model akan MENGARANG hasilnya (ini kelas kegagalan yang dilarang di zeph-larangan-blok); sandi WAJIB DITOLAK, bukan diketik; (3) IZIN: kendali terminal deny-by-default (`mcp_server.rs:263-280`) harus tetap begitu — yang p… |
| 175 (175) | `zeph-autocomplete-inline` | pending | DIGARAP | `SPIKE-175-autocomplete-inline.md` | ZEPH-AUTOCOMPLETE-INLINE (2026-10-14, poin penting obrolan 'kenapa Zephyr ada karena VS Code + Copilot'): HARGA MASUK untuk bisa dipakai sehari-hari sebagai pengganti VS Code + Copilot = saran kode sebaris (ghost text/inline completion) + saran lanjutan setelah edit (Next-Edit) + konteks repo user. Ini yang bikin Copilot sulit ditinggalkan, dan Zephyr sekarang menang di 'paham dirinya sendiri', bukan di melengkapi ketikan user. STATUS BELUM DIVERIFIKASI: gua belum memeriksa apakah Zephyr sudah punya mesin saran-sebaris sama sekali; jangan diklaim ada sebelum dibuktikan. Kalau bolong: harus deterministik-cepat (debounce + batal saat user mengetik), hemat biaya (jangan kirim seluruh berkas tiap ketikan), dan bisa DIMATIKAN. Bukti wajib: satu saran nyata muncul saat mengetik di berkas proyek user + satu uji negatif (saran dibatalkan saat user mengetik lewat). |
| 176 (176) | `zeph-review-diff-hunk` | pending | DIGARAP | `SPIKE-176-review-diff-per-hunk.md` | ZEPH-REVIEW-DIFF-HUNK (2026-10-14, poin penting obrolan prioritas produk Zephyr): review perubahan PER BAGIAN (hunk) — terima/tolak tiap potongan diff, bukan per-berkas (sekarang menerima satu berkas berarti menerima semua perubahan di dalamnya, termasuk yang tidak diminta). Ini penopang kepercayaan: user harus bisa menerima satu tambalan sambil menolak tambalan lain dari giliran yang sama. Terkait: setiap perubahan dari AI sudah terlihat sebagai diff di editor, tapi tanpa tingkatan hunk, 'terima' jadi keputusan borongan. Bukti wajib: satu jawaban AI dengan >=3 potongan berbeda di SATU berkas, lalu terima 1 + tolak 2, dan diperiksa isi berkasnya benar-benar hanya memuat potongan yang diterima. |
| 177 (177) | `catatan-keputusan-sesi` | pending | DIGARAP | `CATATAN-KEPUTUSAN-SESI-2026-10-14.md`, `KEPUTUSAN-MARKETPLACE-j5.md`, `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` | CATATAN-KEPUTUSAN-SESI (2026-10-14, jalan supaya hasil obrolan tidak hilang): tulis SATU dokumen ringkasan keputusan di repo (mis. `docs/CATATAN-KEPUTUSAN-2026-10-14.md`) yang memuat: (1) Zephyr dibikin karena VS Code + Copilot → jadi pembeda harus STRUKTURAL, bukan 'lebih lengkap' (3 titik menang: AI mengoperasikan editornya sendiri, kompatibel ekosistem VS Code, model bebas/BYOM; harga masuk: autocomplete sebaris + konteks repo user); (2) tabel perbandingan kemampuan Zephyr vs agen lain (terminal, browser, berkas/kode, coding+uji, sub-agent+peran, kontrol jendela, SSH/worktree, fetch/AI gambar/penjadwalan, notes/todo) — mana ADA / mana NOL / mana BELUM DIBUKTIKAN; (3) daftar lubang AI Zephyr yang sudah dipecah jadi item (buktikan-jangan-klaim, penegakan bahasa, format tabel, klaim nilai, indeks basi, provider gagal, baca kode sendiri, alat ukur mutu jawaban); (4) keputusan strategi ek… |
| 178 (178) | `zeph-tema-kurangi-bawaan` | completed | SELESAI | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-TEMA-KURANGI-BAWAAN (keputusan Ryu 2026-10-14: 'tema bawaan zephyr itu terlalu banyak, mau lu kurangin dn jdiin extension?' + 'hilangin yg warna nya sama kek github dark itu hilangin, dan untuk warna putih di kurangin lgi'): KURANGI t… |
| 179 (179) | `zeph-tema-warna-sintaks` | completed | SELESAI | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-TEMA-WARNA-SINTAKS (keputusan Ryu 2026-10-14: 'hrus ngubah warna kode nya jga'): setiap tema WAJIB benar-benar mengubah WARNA SINTAKS kode (kata kunci, string, komentar, nama fungsi, angka) — bukan cuma warna UI/sidebar/panel. PISAHKA… |
| 180 (180) | `zeph-marketplace-jaminan-kepake` | completed | SELESAI | `KEPUTUSAN-MARKETPLACE-j5.md`, `docs/KEPUTUSAN-MARKETPLACE-j5.md`, `docs/SPESIFIKASI-EKOSISTEM-EKSTENSI-ZEPHYR.md` | ZEPH-MARKETPLACE-JAMINAN-KEPAKE (keputusan Ryu 2026-10-14: 'HARUS SMUA EXTENSION DI MARKETPLACE BISA KEPAKE BKN INSTALL DOANG, DAN MISALKAN KEYMAPS, TRUS INSTALL KEYMAPS, ITU ADA PERUBAHAN JGA, GIMNA?'): aturan yang mengikat — paket yang Z… |
| 181 (181) | `zeph-tema-cari-pratinjau-tanpa-dup` | pending | DIGARAP | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-TEMA-CARI-PRATINJAU-TANPA-DUP (dari obrolan 2026-10-14): halaman Theme Zephyr (19 tema, grid 4 kolom, thumbnail cuma STRIP WARNA) disamakan mutunya dengan halaman Themes agen luar yang Ryu kirim: kotak cari ('Search 58 palettes…') + PRATINJAU yang benar-benar berisi contoh KODE (termasuk baris diff `-`/`+`) supaya perbedaan antar tema kelihatan SEBELUM dipilih + badge 'Active' + asal tema (bawaan vs ekstensi). TAMBAHAN yang Ryu minta: tandai/hilangkan tema yang praktis SAMA (duplikat) dan kurangi tema putih — pelaksanaan pengurangan ada di item `zeph-tema-kurangi-bawaan`, item INI yang menyediakan ALAT BUKTINYA (ukur jarak token antar tema → daftar pasangan praktis kembar, jangan nilai pakai mata). JANGAN digabung dengan opsi B j5 (menyatukan tabel statis ke jalur ekstensi) — risiko regresi tinggi. Bukti wajib: pilih 3 tema yang berbeda jauh → UI + editor + terminal benar-benar ber… |
| 182 (182) | `zeph-dekorasi-kode-ala-copilot` | pending | DIGARAP | `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`, `docs/LAPORAN-TEMA-DAN-DEKORASI.md` | ZEPH-DEKORASI-KODE-ALA-COPILOT (dari obrolan 2026-10-14, Ryu: 'di github copilot desktop dia ngubah warna code nya jg dll, gimna mnurut lu bisa gtu jga ga?'): dekorasi saran/perubahan di dalam editor — teks usulan diredupkan (ghost text), penambahan dan buangan diwarnai berbeda, baris yang akan diubah giliran berikutnya disorot, plus terima/tolak per potongan. INI BUKAN PEKERJAAN TEMA (tema hanya data warna deklaratif, tidak bisa menyentuh teks) — ini lapisan editor/app. LANGKAH WAJIB SEBELUM MENYENTUH APA PUN: periksa dulu Zephyr memakai mesin editor apa (Monaco? CodeMirror? buatan sendiri?) karena jalur dekorasinya beda total — BELUM gua periksa dan tidak gua klaim. SYARAT yang tidak boleh dilanggar: (a) warna dekorasi WAJIB ikut token tema, dilarang mematok hijau/merah keras (kalau dipatok, tema terang jadi tidak terbaca, dan Zephyr punya tema terang); (b) dekorasi TIDAK BOLEH menyen… |
| 183 (183) | `zeph-marketplace-katalog-118-105` | completed | SELESAI | `AUDIT-KATALOG-TOOL.md`, `KEPUTUSAN-KATALOG-118-105.md`, `KEPUTUSAN-MARKETPLACE-j5.md` | ZEPH-MARKETPLACE-KATALOG-118-105 (temuan terukur 2026-10-14, dari obrolan 'prasaan marketplace smpe 118 ya, kok kurang?'): katalog bawaan di HEAD ter-commit = 118 paket, di worktree sekarang = 105 -> 13 paket bahasa HILANG dari daftar mark… |
| 184 (184) | `zeph-tema-duplikat-angka` | completed | SELESAI | `LAPORAN-TEMA-DAN-DEKORASI.md`, `RANCANGAN-TANGKAP-JENDELA.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-TEMA-DUPLIKAT-ANGKA (hasil ukur keras 2026-10-14 pakai scratch/ukur-tema.py, KOREKSI untuk zeph-tema-kurangi-bawaan): github-dark vs zephyr-dark = 72% identik (26/36 pasangan var:nilai sama persis) dan SELURUH 11 token sintaks sama pe… |
| 185 (185) | `zeph-keymap-bukti-live` | in_progress | DIGARAP | `uji-keymap-live.mjs` | ZEPH-KEYMAP-BUKTI-LIVE (tuntutan Ryu 2026-10-14: 'MISALKAN KEYMAPS ... ITU ADA PERUBAHAN JGA, GIMNA?'): keymap = satu-satunya jenis deklaratif yang jalur muatnya ada (muatKeymap di extLoader.ts) tapi BELUM pernah dibuktikan mengubah binding nyata. Katalog bundel punya 4 paket keymap. Wajib: (1) bukti live lewat resolver yang SAMA dipakai UI (bukan resolver kedua di uji); (2) tabel pemetaan ID workbench.action.* -> perintah Zephyr yang benar-benar ada (berkas ext_bundled.rs sudah pernah kena kasus ini: editor.copyLineDown / editor.moveLineUp / editor.moveLineDown / editor.splitRight BUKAN perintah Zephyr; yang benar editor.line.moveUp, editor.line.moveDown, pane.splitRight; Ctrl+Shift+D dibuang karena sudah dipakai debug.focus); (3) laporan cakupan ('dari N pintasan, M tak punya padanan'); (4) aturan bentrok: binding user/UI menang; (5) bukti 'sebelum vs sesudah' pasang paket keymap. [20… |
| 186 (186) | `zeph-bahasa-bukti-live` | completed | SELESAI | teks tracker bertanda bukti: selesai, live | ZEPH-BAHASA-BUKTI-LIVE (tuntutan Ryu 2026-10-14: semua jenis harus beda/aktif): 88 paket bahasa di katalog bundel (mode legacy CodeMirror) belum ada bukti bahwa memasangnya benar-benar mengubah pewarnaan/fitur editor. Wajib: (1) bukti sebe… |
| 187 (—) | `zeph-keymap-merge-satu-chord` | pending | DIGARAP | `keybindings.ts`, `uji-keymap-live.mjs` | ZEPH-KEYMAP-MERGE-SATU-CHORD (temuan nyata 2026-10-14 dari scripts/uji-keymap-live.mjs): gabungan 4 paket keymap = 26/37 chord mendarat; 11 chord DITOLAK dan 18 pintasan bawaan HILANG (Ctrl+P, Ctrl+N, Ctrl+S, Ctrl+W, Ctrl+F, Ctrl+H, Alt+Up/Down, Ctrl+Shift+P, dll). Sebab: src/lib/keybindings.ts:236-239 mengganti chord pada baris perintah yang sama (satu chord per perintah) padahal paket membind satu perintah dua kali. Perbaiki aturan merge supaya multi-chord didukung TANPA menghapus pintasan bawaan. |
| 188 (—) | `zeph-bahasa-noop-puppet` | pending | DIGARAP | `uji-bahasa-live.mjs` | ZEPH-BAHASA-NOOP-PUPPET (temuan 2026-10-14 dari uji-bahasa-live.mjs): satu-satunya paket bahasa no-op = puppet (.pp sudah diklaim pascal yang dimuat lebih dulu). Putuskan: jangan tawarkan, atau beri label jelas. |
| 189 (—) | `zeph-label-sudah-didukung` | pending | BELUM | — | ZEPH-LABEL-SUDAH-DIDUKUNG (temuan 2026-10-14): perl, python, ruby, shell, xml hanya menambah ekstensi sisa (.t/.pod/.pyi/.erb/.gemspec/.fish/.xsd/.xsl/.xhtml) - bahasanya sudah native. UI wajib menulis 'sudah didukung bawaan', bukan seolah paket itu yang menambah bahasa. |
| 190 (—) | `zeph-ikon-ketinggalan-12` | pending | DIGARAP | `cek-katalog-jumlah.mjs`, `ext_lang_icons.rs` | ZEPH-IKON-KETINGGALAN-12 (temuan 2026-10-14 dari cek-katalog-jumlah.mjs): 12 id di LOGO_URI (src-tauri/src/ext_lang_icons.rs) tidak pernah cocok karena paketnya sudah dibuang - bersihkan supaya tidak jadi ikon mati. |
| 191 (—) | `zeph-perintah-tema-tersembunyi` | pending | DIGARAP | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-PERINTAH-TEMA-TERSEMBUNYI (temuan 2026-10-14): src/lib/commandRegistry.ts ~baris 1528 masih membuat perintah theme.github-dark & theme.min-light padahal 2 tema itu sudah disembunyikan dari pemilih - sembunyikan perintahnya juga (yang benar: 'perintah tema masih ada di palet'). |
| 192 (—) | `zeph-uji-t6-tema-mode` | pending | DIGARAP | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-UJI-T6-TEMA-MODE (temuan 2026-10-14): scripts/uji-t6-tema-mode.mjs baris 64 masih memanggil pilihKartu('min-light') -> akan merah setelah tema disembunyikan; ganti ke 'zephyr-light'. |
| 193 (—) | `zeph-bukti-live-app-tema` | pending | DIGARAP | `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md` | ZEPH-BUKTI-LIVE-APP-TEMA (belum terbukti 2026-10-14): bagian B uji-t5-tema.mjs (kartu DOM + bg_image_read) dan jalur end-to-end 'tema VS Code -> warna kode' baru terbukti lewat uji statis/harness; WAJIB dijalankan saat app hidup dengan CDP :9223 sebelum dianggap beres. |

## Lampiran — teks penuh item yang masih berjalan (pending / in_progress)

### `a9` — pending — verdikt BELUM

```
A9 batas: riwayat git 8 commit TIDAK dibersihkan (rewrite history ditolak)
```
Bukti tertunjuk: —

### `e2` — pending — verdikt BELUM

```
E2 worktree ~190 perubahan / 0 staged (jangan git add -A)
```
Bukti tertunjuk: —

### `lama-pane-uji` — pending — verdikt DIGARAP

```
LAMA-pane-uji: verifikasi 1 pane lewat run agen nyata (Google → exchangerates → API kurs) [list rev.1 — terakhir in_progress]
```
Bukti tertunjuk: `SPIKE-150-pane-browser.md`

### `lama-kurs` — pending — verdikt BELUM

```
LAMA-kurs: tugas kurs 1 USD→IDR 1998..2026 end-to-end, berkas kurs-dollar.md + tabel + sumber [list rev.1]
```
Bukti tertunjuk: —

### `lama-a1` — pending — verdikt DIGARAP

```
LAMA-a1: A(i) subset tool per tugas: kirim hanya tool relevan ke provider [list rev.1]
```
Bukti tertunjuk: `docs/ANAK-AGEN-PERILAKU.md`, `scripts/cek-subset-tugas.mjs`, `scripts/uji-anak-agen.mjs`

### `lama-a2` — pending — verdikt DIGARAP

```
LAMA-a2: A(ii) auto-compact/ringkas riwayat: jalur ulang-belum tuntas [list rev.1]
```
Bukti tertunjuk: `docs/ANAK-AGEN-PERILAKU.md`, `scripts/uji-anak-agen.mjs`

### `lama-a4` — pending — verdikt DIGARAP

```
LAMA-a4: A(iv) paksa todo_write di langkah pertama tugas berat [list rev.1]
```
Bukti tertunjuk: `docs/ANAK-AGEN-PERILAKU.md`, `scripts/uji-anak-agen.mjs`

### `lama-c` — pending — verdikt DIGARAP

```
LAMA-c: C kirim pesan/chat ke agen yang SEDANG kerja (sekarang harus nunggu run kelar) [list rev.1]
```
Bukti tertunjuk: `docs/ANTREAN-DAN-KONTEKS.md`

### `lama-d` — pending — verdikt DIGARAP

```
LAMA-d: D aplikasi kelola .zephyr-context.md otomatis [list rev.1]
```
Bukti tertunjuk: `.zephyr-context.md`, `docs/ANTREAN-DAN-KONTEKS.md`

### `lama-busy` — pending — verdikt DIGARAP

```
LAMA-busy: agentBusy telat reset (~5 menit setelah run kelar) → peluncuran uji berikutnya kebatal [root cause ditemukan & diperbaiki 2026-10-13: peta per-permukaan tak dibersihkan di jalur setState mentah — lihat h2-busy-permukaan; SISA: verifikasi ulang lewat run agen nyata, bukan cuma jalur chat]
```
Bukti tertunjuk: `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs`

### `lama-merah` — pending — verdikt DIGARAP

```
LAMA-merah: repro bersih error 'tool call X returned malformed JSON arguments' [list rev.1]
```
Bukti tertunjuk: `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs`

### `lama-besar` — pending — verdikt DIGARAP

```
LAMA-besar: uji tugas raksasa 40+ berkas (bukti kuat baru 6 & 8 berkas) [list rev.1]
```
Bukti tertunjuk: `docs/LAPORAN-KETAHANAN-AGEN.md`, `scripts/uji-ketahan-agen.mjs`

### `lama-kejam` — pending — verdikt DIGARAP

```
LAMA-kejam: tes bug 'versi kejam' (cuma gejala, tanpa tes otomatis) [list rev.1]
```
Bukti tertunjuk: `REPRO-BUG-KEJAM.md`, `docs/ANTREAN-DAN-KONTEKS.md`, `docs/REPRO-BUG-KEJAM.md`

### `ai-tahu-100-4` — pending — verdikt DIGARAP

```
AI-TAHU-100-4: bundel docs/*.md + CHANGELOG + indeks cari di dalam app, agar 'apa yang baru' / 'cara kerja X' dijawab dari dokumen yang dikirim bersama app (bukan dari folder user) — permintaan Khalid 2026-10-13
```
Bukti tertunjuk: `docs/BUNDEL-DOKUMEN.md`, `scripts/cek-bundel-docs.mjs`, `scripts/uji-zephyr-self.mjs`

### `ai-tahu-100-7` — pending — verdikt DIGARAP

```
AI-TAHU-100-7 (setuju Khalid + Zeph AI, 2026-10-13): DESAIN PENGETAHUAN DUA LAPIS untuk Zephyr AI, dengan ANGKA — (a) inti tetap selalu nyala ≤2.000 token (identitas, aturan, default+layout kunci, anti-ngarang); (b) sisanya dicari on-demand lewat tool internal + docs bundel: maks 4 potongan × 800 token, cache per sesi; (c) aturan eksplisit isi 'inti' vs 'yang dicari' ditulis di kode/generator (bukan terserah model) supaya prompt tak menggelembung; (d) pencarian LOKAL + deterministik (indeks di dalam app, nol jaringan) dan WAJIB jalan tanpa folder user; (e) keberhasilan diukur harness cakupan N/N + cap hash sumber & versi app (kalau basi, bilang basi). Catatan: todo Zeph AI (panel Todo Zephyr) ≠ list Hermes ini — item ini yang mengikat
```
Bukti tertunjuk: `scripts/cek-batas-inti.mjs`, `scripts/gen-fakta-zephyr.mjs`, `scripts/uji-blok-inti.mjs`

### `ai-tahu-100-8` — in_progress — verdikt DIGARAP

```
AI-TAHU-100-8 — peta kode 393 entri (berkas→simbol/ekspor) + 176 dokumen + 2662 label, `--check` sinkron, cakupan menolak berkas/simbol hantu; akar masalah 'seksi keluar dari Settings lenyap diam-diam' sudah diperbaiki di generator (throw bila seksi keluar tanpa rumah). SISA: (a) tool internal ai-tahu-100-3 untuk MEMBACA berkas kode itu tanpa folder user. (Uji negatif gate SUDAH dibuktikan — lihat ai-tahu-100-5.)
```
Bukti tertunjuk: —

### `i18n-final` — pending — verdikt DIGARAP

```
PROMPT7-I18N-FINAL [URUTAN: DIKERJAKAN TERAKHIR — tunggu SEMUA item lain kelar, baru ini]: seluruh bahasa harus SINKRON — kalau pakai Indonesia ya Indonesia, kalau English ya English, TANPA ada yang tertinggal (teks nyasar Inggris di kamus ID / sebaliknya / kunci tak diterjemahkan). Ruang lingkup: 10 kamus di src/lib/i18n-extra.ts (ID acuan + EN/JA/KO/ZH/ES/FR/DE/PT/AR) + src/lib/i18n.ts + src/lib/i18n-src.ts; gate = cek-kunci-i18n-extra.mjs (E1) + cek-kunci-i18n-10-kamus.mjs (E2) + verif-pointer.mjs + tsc 0. Perintah Ryu 2026-10-13: 'prompt 7 i18n, jdi smua bahasa hrs sinkron smua, klo pke indo hrs indo, klo english hrs english, tnpa ada yg tertinggal'. Keadaan sekarang: 2404 kunci identik antar kamus, EN 2321 (kurang 83, teks sumbernya memang Inggris), E1+E2 hijau, ganda 0, tsc 0. Hasil sapuan isi (alat gua scratch/i18n-kerja-list.mjs): 449 kunci perlu ditambal — 161 kunci belum diterjemahkan di SEMUA 9 bahasa non-EN, 436 kunci nilai ID masih Inggris, 277 kunci cuma 1 bahasa tertinggal; per bahasa: id 436, ja..ar ~170 masing-masing.
```
Bukti tertunjuk: `cek-kunci-i18n-10-kamus.mjs`, `cek-kunci-i18n-extra.mjs`, `i18n-extra.ts`

### `prompt8-bug-sisa` — pending — verdikt DIGARAP

```
PROMPT8-BUG-SISA [URUTAN: DIKERJAKAN TERAKHIR, sesudah prompt 7]: cari dan perbaiki bug SISA sebelum commit — pembersihan akhir sesi: jalankan gate/harness yang ada (verify:11 12/12, verify:09 11/11, cargo test --lib 432/0, tsc 0, E1/E2, uji-memori-sesi 94/94, cek-batas-inti, uji-tahu-zephyr 23/23, uji-panel-memori 8/8, uji-tool-ingat 14/14), perbaiki yang merah, JANGAN commit di item ini. Perintah Ryu 2026-10-13: 'prompt 8 cari dan perbaiki bug sisa sebelum commit'. STATUS 2026-10-13 malam (diperbarui lagi): M5 'blok memori tanpa penanda' SUDAH DIPERBAIKI (uji-memori-live 10/10). Gap `zephyr_self` SUDAH DIVERIFIKASI MANDIRI: uji-zephyr-self.mjs 43/43 EXIT=0 + uji-keadaan-prompt.mjs 21/21 EXIT=0 (dua harness hasil batch deleg_1b0bc315 yang tadinya BELUM pernah dijalankan) — 3 kegagalan yang muncul semuanya bug ACUAN di harness-nya sendiri (toolGate.aktif = Set, IPC Tauri dihitung jaringan, store.mcp warisan) dan sudah ditambal; lihat item uji-3bug-acuan + bug-store-mcp-basi. SISA yang masih perlu dipandang di prompt 8: gate cek-batas-inti (blok inti ~2.831 token vs target 2.000) + keputusan atas field warisan store.mcp.
```
Bukti tertunjuk: `uji-keadaan-prompt.mjs`, `uji-zephyr-self.mjs`

### `prompt9-commit` — pending — verdikt BELUM

```
PROMPT9-COMMIT [URUTAN: PALING TERAKHIR]: commit lokal SEMUA pekerjaan sesi ini dalam SATU commit (git add eksplisit per berkas/path — DILARANG `git add -A`/`git add .` mengikuti peringatan E2 & kecelakaan wildcard historis; jangan pakai wildcard di scripts/). Baru dijalankan SETELAH prompt 7 + prompt 8 beres dan Ryu memberi lampu hijau. Perintah Ryu 2026-10-13: 'prompt 9 commit local ... commit SEMUA pekerjaan sesi ini dalam satu commit'.
```
Bukti tertunjuk: teks tracker bertanda bukti: beres, hijau

### `ai-tahu-100-2-sisa` — pending — verdikt DIGARAP

```
AI-TAHU-100-2 SISA (2026-10-13, setelah potret keadaan hijau): (a) LOKALISASI teks blok keadaan — kepala blok masih Inggris ('# Zephyr runtime state - snapshot taken') dan belum ada kunci kamus (usulan: ai.state.snapshotHead / ai.state.snapshotNote) => masuk PROMPT 7 i18n; (b) perilaku LINTAS-RESTART MCP (hidup->mati->hidup) belum dibuktikan dengan pembanding independen; (c) ✅ SELESAI 2026-10-13: dulu F.mcpPort yang dibaca tepat sesudah reload = port DIMINTA (9224) bukan port terpakai (9225), dan field warisan store.mcp menyuntik angka palsu — keduanya sudah ditutup (field dibuang dari store; acuan kini mcp_status + useMcp.status; `uji-keadaan-prompt.mjs` 22/22 termasuk penjaga K11b).
```
Bukti tertunjuk: `uji-keadaan-prompt.mjs`

### `v4v12-izin-terminal-harness` — in_progress — verdikt DIGARAP

```
V4+V12 MERAH = CACAT HARNESS, bukan bug produk & bukan soal timing (selesai diperiksa 2026-10-14): verify11 memanggil terminal_write/terminal_key padahal izin opt-in `mcp.allow_terminal_control` (deny-by-default di src-tauri/src/mcp_server.rs:263-280 → `unwrap_or(false)`) tidak pernah dinyalakan oleh harness mana pun (grep scripts/: 0 sebutan). BUKTI app idle (scratch/probe-v4.mjs): izin MATI → dijawab 'permission denied: terminal control is disabled for MCP' (V4 gagal + screenshot V12 tak memuat marker); izin NYALA → terminal_write/terminal_key ok:true dan baris marker muncul di buffer xterm pada 564 ms (jendela tunggu harness 2200 ms). TINDAKAN: verify11.mjs kini menyalakan izin itu di persiapan V4 lewat jalur app yang sama dengan sakelar Settings (applySettings) dan MEMULIHKAN nilai semula di blok bersih-bersih. SISA: buktikan lewat run penuh (harus 12/12) — run latar UJI_LOG=uji-log-verify11e.txt.
```
Bukti tertunjuk: `mcp_server.rs`, `verify11.mjs`

### `zeph-ngawur-bahasa` — pending — verdikt DIGARAP

```
ZEPH-NGAWUR-BAHASA: Zeph AI masih menjawab ngawur dan tiba-tiba beralih ke INGGRIS walau ditanya bahasa Indonesia (laporan Ryu 2026-10-14: 'ditnya" msih ngawur tiba" pke inggris dll'). Wajib: jawab dalam bahasa yang dipakai user (ID→ID) termasuk ketika sumber jawabannya berbahasa Inggris — blok inti `src/lib/zephyrFakta.ts`, indeks `src/lib/zephyrIndeks.ts`, dan kepala blok keadaan '# Zephyr runtime state - snapshot taken' (`src/lib/aiZephyrState.ts`) semuanya berbahasa Inggris dan belum punya kunci kamus (usulan `ai.state.snapshotHead`/`ai.state.snapshotNote` → masuk PROMPT 7). Titik kode: `src/lib/systemPrompt.ts:146` + `:243` (aturan bahasa SUDAH ada tapi dilanggar → periksa urutan/penekanan blok), `bahasaPrompt()` `:308`, bagian `# Language` `:533`. Bukti wajib: contoh jawaban nyata sebelum/sesudah + harness.
```
Bukti tertunjuk: `aiZephyrState.ts`, `scripts/uji-bahasa-jawaban.mjs`, `systemPrompt.ts`

### `zeph-tahu-100p` — pending — verdikt DIGARAP

```
ZEPH-TAHU-100PERSEN: Zeph harus paham 100% SELURUH isi Zephyr — bukan cuma daftar setelan: semua TOMBOL/label antarmuka, menu, panel bawah & samping, tiap seksi Settings, pintasan, perintah palet, port, ekstensi bawaan, dokumen bundel (kata Ryu 2026-10-14: 'hrus lengkap smua ny 100% dia ngerti tntang zephyr dri tombol" ny dll nya, intinya smuanya yg ada di zephyr'). Keadaan sekarang: indeks `src/lib/zephyrIndeks.ts` (676KB) sudah punya kategori label/setelan/pintasan/perintah/tool/ekstensi/seksi/port/dokumen/kode/bridge (label ≈2662 entri), TAPI blok inti sudah dipotong ke 7.950 char (keputusan `ai-tahu-100-7a`) sehingga sisanya hanya terjangkau lewat tool `zephyr_self`. SISA: (a) sapu setiap permukaan UI nyata vs kategori `label` (tombol/label dari `src/components/**`, `src/lib/shortcuts.ts`, perintah palet) dan tambal generator `scripts/gen-fakta-zephyr.mjs` bila bolong; (b) buktikan jawaban soal tombol/label memakai nama asli aplikasi.
```
Bukti tertunjuk: `gen-fakta-zephyr.mjs`, `shortcuts.ts`, `zephyrIndeks.ts`

### `zeph-retrieval-otomatis` — pending — verdikt DIGARAP

```
ZEPH-RETRIEVAL-OTOMATIS (ini `ai-tahu-100-7b`, akar dari 'bego'): suntik potongan indeks secara OTOMATIS tiap giliran berdasarkan pesan user — maks 4 potongan × 800 token, cache per sesi, lokal + deterministik (nol jaringan, tetap jalan tanpa folder user) — supaya Zeph TIDAK bergantung pada model memanggil `zephyr_self` sendiri. Kalau model malas/tidak memanggil, blok inti 7.950 char tidak cukup untuk pertanyaan tombol/setelan → jawaban ngawur. Titik kode: `src/lib/zephyrCari.ts` (`cariFakta` :203), penyusun prompt `src/lib/systemPrompt.ts` (:446-570), `src/lib/zephyrTools/zephyrSelf.ts`, jalur kirim `src/lib/aiStore.ts`. Bukti: harness dua-lapis + hitungan potongan yang BENAR-BENAR masuk body request ke provider.
```
Bukti tertunjuk: `aiStore.ts`, `systemPrompt.ts`, `zephyrCari.ts`

### `harness-pengetahuan-2lapis` — pending — verdikt DIGARAP

```
HARNESS-PENGETAHUAN-DUA-LAPIS: `scripts/cek-pengetahuan-live.mjs` MUSTAHIL lulus dengan mock — `scripts/mock-ai.mjs` (499 baris) adalah boneka scripted: perilakunya hanya ditentukan penanda di prompt (BASHCMD/RMCMD/TEXTONLY/TOOLCALL:<nama>/ERR401/WRITEPATH), default balas tool call `todo_write` dulu + ringkasan kosong. Jadi B3/B4/B5 + C2/C3/C5 mengukur boneka, bukan aplikasi, dan C4 ('tidak pakai tool') mustahil karena mock selalu menjalankan `todo_write` lebih dulu. TINDAKAN: ubah bagian B/C jadi DUA LAPIS — (1) periksa body request yang benar-benar diterima provider: `agents.maxPanes` + nilai bawaannya, port MCP 9222, port CDP/debug 9223, kontrol sub-agent (maxParallel/allowWrite) di Chat Settings, Ctrl+J, settings.json harus ADA di blok inti ATAU dijawab lewat `zephyr_self`; (2) run nyata hanya dijalankan bila provider ber-key asli — kalau tidak, tandai SKIP dengan alasan jujur, bukan merah palsu (app sekarang ber-key placeholder `MOCK-KEY****` → 401). Jalur provider ke mock sudah ditambal 2026-10-14; sisanya lapis (1).
```
Bukti tertunjuk: `cek-pengetahuan-live.mjs`, `mock-ai.mjs`

### `pakai-subagent` — pending — verdikt BELUM

```
PAKAI-SUBAGENT (perintah Ryu 2026-10-14: 'pke subagents lu biar cpet kelar kerjaan ini'): pecah backlog jadi jalur paralel yang berkasnya TIDAK bertabrakan. Aturan wajib untuk tiap anak: (i) JANGAN menjalankan harness CDP selagi ada agen lain menyunting `src/**` (Vite HMR me-reload halaman dan mematikan jembatan/slot) dan jangan dua harness bareng, (ii) JANGAN `git add`/`git commit`, (iii) JANGAN pakai wildcard di `scripts/` (insiden `rm -f scripts/p-*.mjs` pernah menghapus 43 script), (iv) berkas hasil generator (`zephyrIndeks.ts`, `zephyrFakta.ts`) hanya boleh disunting SATU agen, sisanya regenerasi milik gua, (v) klaim anak ≠ bukti: hasil wajib diverifikasi gua dengan gate + harness.
```
Bukti tertunjuk: —

### `agen-1-mati-429` — in_progress — verdikt DIGARAP

```
AGEN-MATI-429 (SEMUA ANAK DELEGASI MATI, gua ambil alih): 2 dari 4 anak deleg_48bc31b8 MATI oleh `HTTP 429 batas kecepatan VIP Pass` — sa-0 (lane bahasa+retrieval, 1439 s) dan sa-1 (lane indeks/generator, 1455 s); 2 anak lain (harness dua-lapis + subset tool) SELESAI normal. Warisan yang sudah gua verifikasi: `namaDalamKueri()`/`kamusIndeks()`/`kataTakDikenal()` (zephyrCari.ts), `subsetAlat.ts` + `agentDorong.ts` (terpasang nyata di aiStore.ts:31-34 & :5637-5640, subsetAlat diekspos devBridge.ts:313), `cek-pengetahuan-2lapis.mjs` (27.235 B) + `uji-jawab-bahasa.mjs` (9.405 B), `cek-pengetahuan-live.mjs` UTUH (15.396 B, tidak ditimpa). DUA BUG WARISAN sudah gua tambal: deklarasi `KAMUS_INDEKS` hilang (ReferenceError senyap) + regresi anti-ngarang `kataTakDikenal`. SISA: bukti bahasa Indonesia lewat jawaban nyata + hasil 8 harness CDP — sedang berjalan = `gate-2026-10-14i.sh` (proc_0f2f2dad3617). TIDAK dispatch ulang karena batas 429 masih berisiko.
```
Bukti tertunjuk: `ANTREAN-PESAN-AGEN.md`, `LAPORAN-KETAHANAN-AGEN.md`, `PERAN-SUBAGEN-ZEPH.md`

### `zeph-format-tabel` — pending — verdikt DIGARAP

```
ZEPH-FORMAT-TABEL (baru 2026-10-14, dari obrolan Ryu): Zeph AI HARUS bisa mengeluarkan TABEL Markdown + list seperti jawaban agen luar. DUA SISI terpisah yang keduanya belum terverifikasi: (1) INSTRUKSI FORMAT di prompt — trik ini yang dipakai agen lain: tulis contoh sintaks persis di prompt (`| kolom | kolom |` + baris pemisah `|---|`) + 'pakai tabel kalau datanya punya baris+kolom, bullet kalau cuma daftar, numbered kalau urutan'; yang sudah gua lihat di blok inti Zephyr baru aturan bahasa + anti-ngarang + fakta UI, aturan format jawaban BELUM ada; (2) RENDERER di panel chat — kalau komponen pesan cuma teks biasa, tabel akan tampil sebagai deretan pipa mentah walau modelnya benar. Langkah: baca `src/lib/systemPrompt.ts` + `src/lib/zephyrFakta.ts` (aturan format ada/nggak) dan komponen renderer pesan chat panel AI (dukungan GFM tabel). Tambalan kalau bolong: ~5 baris contoh sintaks di blok inti + nyalakan plugin GFM di renderer. Bukti wajib: satu jawaban nyata yang memuat tabel DAN tampil rapi di panel (bukan teks mentah).
```
Bukti tertunjuk: `JAWABAN-TABEL-DAN-DAFTAR.md`, `scripts/uji-tabel-markdown.mjs`, `systemPrompt.ts`

### `zeph-browser-builtin` — pending — verdikt DIGARAP

```
ZEPH-BROWSER-BUILTIN (jurang terbesar vs TEDI, 2026-10-14): pane browser di dalam Zephyr + otomasi AI-nya (buka/klik/isi form/screenshot/cek console). DUA jalur yang sudah tergambar: (a) sambung server MCP Playwright lewat klien MCP Zephyr yang SUDAH jalan (port 9222) = jalur terpendek, nol editor-host baru; (b) child webview Tauri seperti TEDI (pane sendiri, Windows-only di versi TEDI). BATAS: konten web tidak boleh seenaknya dikasih ke model — perlu kebijakan (izinn opt-in + daftar host) dan batas ukuran output. Bukti wajib: screenshot pane + satu tugas nyata end-to-end (buka URL, isi form, baca hasil) DIJALANKAN, bukan rancangan.
```
Bukti tertunjuk: `SPIKE-150-pane-browser.md`

### `zeph-screenshot-tool` — pending — verdikt DIGARAP

```
ZEPH-SCREENSHOT-TOOL (baru 2026-10-14): tangkapan layar window Zephyr sebagai fitur (pintasan + simpan + clipboard) DAN sekaligus sebagai TOOL untuk Zeph AI — jadi 'mata' model (model multimodal bisa melihat UI Zephyr sendiri: panel, dialog, error yang muncul di layar). Ini pasangan alami dari indeks label/elemen: indeks bilang di mana tombol, screenshot membuktikan tampilannya. Murah, dampak besar. Bukti wajib: berkas PNG di disk + jalur kirim gambar ke provider terbaca di body request (bukan cuma klaim).
```
Bukti tertunjuk: `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `docs/RANCANGAN-TANGKAP-JENDELA.md`

### `zeph-ekstensi-jalur` — pending — verdikt DIGARAP

```
ZEPH-EKSTENSI-JALUR (baru 2026-10-14, jawaban atas pertanyaan Ryu 'bikin ekstensi sendiri + tarok di GitHub lalu sambungin?'): ekosistem ekstensi SENDIRI baru layak setelah jalurnya dibuka. DUA KELAS yang harus dibedakan — (A) DEKLARATIF (tema/snippet/icon theme/grammar/keymap): SUDAH terbukti hidup live di Zephyr (tema VS Code cocopon.iceberg terpasang, 7 paket snippet kepakai saat mengetik, icon theme '19 icon themes / nothing skipped'); (B) BERKODE (browser/SQL/API client/dev-env): BELUM ADA extension host-nya — dan inilah alasan TEDI harus menulis semuanya sendiri. URUTAN yang benar: (1) buka jalur = tambah host GitHub ke allowlist unduh (sekarang cuma `IZIN=['open-vsx.org','www.open-vsx.org']`, `ext_pkg.rs:1152`) + sediakan indeks registry + validasi manifest SEBELUM dipakai (https-only, batas MAX_ZEXT_BYTES, id_aman, engine_cocok — komponennya ~90% sudah ada); (2) buktikan pipeline end-to-end dengan 2-3 ekstensi RESMI kelas (A): rilis di GitHub → indeks → Install → Check updates → Remove; (3) BARU extension host berkode, dan hanya kalau sudah ada kebutuhan nyata (kalau API belum stabil, tiap ekstensi jadi kerjaan per-rilis). JANGAN tiru 8 ekstensi TEDI sekaligus. Dari daftar TEDI: Browser + Screenshot layak tapi sebagai FITUR BUILT-IN; RTK-bridge tidak perlu (Zephyr sudah punya pemangkas output tool, uji-trim-tool 15/15); dev-environment/SQL/API-client/remote-access = produk tersendiri, bukan prioritas; discord presence + secondary folder tree = hiasan.
```
Bukti tertunjuk: `LAPORAN-TEMUAN-EKSTENSI-A-2026-10-14.md`, `SPESIFIKASI-EKOSISTEM-EKSTENSI-ZEPHYR.md`, `SPIKE-169-jalur-ssh.md`

### `zeph-larangan-blok` — pending — verdikt DIGARAP

```
ZEPH-LARANGAN-BLOK (2026-10-14): blok 'cara kerja + LARANGAN' padat di dalam inti — ambil STRUKTUR penegasan agen luar, BUKAN panjangnya. Isi minimal: baca dulu sebelum menebak; kalau tool gagal, baca error + coba cara lain, jangan ulangi perintah yang sama; JANGAN mengarang output — gagal ya bilang gagal + error persisnya; JANGAN menampilkan kredensial walau diminta; JANGAN commit/push tanpa diminta; 'selesai' wajib berarti sudah dijalankan + hasilnya dibaca; ikuti bahasa user (ID → ID). HAMBATAN NYATA: blok inti sekarang 7.950 char (1.988 dari ±2.000 token) — nambah aturan WAJIB disertai pemangkasan/penyaringan blok lain (lihat zeph-blok-kondisional). Jangan salin daftar panjang agen luar (langsung jebol batas). Bukti wajib: batas-inti tetap LULUS setelah penambahan + perbandingan jawaban sebelum/sesudah pada kasus 'ngarang output saat tool gagal'.
```
Bukti tertunjuk: `BLOK-INTI-101-133-153-162.md`

### `zeph-peran-subagent` — pending — verdikt DIGARAP

```
ZEPH-PERAN-SUBAGENT (2026-10-14): peran sub-agent TERKETIK + batas per peran — explorer (baca saja), worker (tulis, folder dibatasi), reviewer (baca + komentar, tanpa tulis), peneliti dokumen. Pondasi sudah ada dan terbukti: `agents.maxParallel` + `allowWrite` + `maxPanes` (default 6) di Chat Settings, ditambah temuan hari ini bahwa agen yang mati di tengah kerja meninggalkan berkas setengah jadi (2 anak delegasi mati 429). Jadi peran + batas tulis juga soal KESELAMATAN, bukan cuma kerapian. Bukti wajib: satu tugas dijalankan dengan >=2 peran berbeda dan batasnya benar-benar menahan (mis. reviewer ditolak saat mencoba menulis).
```
Bukti tertunjuk: `PERAN-SUBAGEN-ZEPH.md`

### `zeph-tool-jendela` — pending — verdikt DIGARAP

```
ZEPH-TOOL-JENDELA (2026-10-14): ekspos kontrol jendela/editor sebagai TOOL RESMI (buka/tutup/split pane, ganti tab, rotate layout, buka Settings / Source Control / Command Palette, ganti tema/font/zoom) supaya model MEMANGGIL tool, bukan MENGARANG nama tombol — ini akar langsung dari keluhan 'ngawur'. Sekarang sebagian sudah ada lewat perintah internal + dev bridge, tapi belum jadi permukaan tool yang ketat dengan nama & skema jelas. Bukti wajib: harness yang menyuruh model melakukan 5 aksi UI dan memeriksa KEADAAN app sesudahnya (pane/tab/tema benar-benar berubah), bukan sekadar jawaban teks.
```
Bukti tertunjuk: `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `RANCANGAN-TANGKAP-JENDELA.md`

### `zeph-ukur-mutu-jawaban` — pending — verdikt DIGARAP

```
ZEPH-UKUR-MUTU-JAWABAN (2026-10-14, ini yang mengubah 'kayaknya paham' jadi ANGKA seperti permintaan Ryu '100% ngerti'): set pertanyaan acuan + jawaban resmi yang dinilai OTOMATIS. Sekarang harness menguji 'prompt memuat X' dan 'kata terlarang muncul', BUKAN 'jawabannya benar'. Harus ada: kumpulan soal uji (tombol/label antarmuka, setelan + nilai bawaannya, pintasan, port, perintah palet, lokasi berkas) + jawaban acuan dari indeks + penilai otomatis + laporan skor per kategori, dijalankan ke PROVIDER NYATA (bukan mock). Tanpa ini, tiap kali Ryu merasa 'masih bego', tidak ada cara membuktikan sudah beres atau belum.
```
Bukti tertunjuk: `JAWABAN-TABEL-DAN-DAFTAR.md`, `UKUR-MUTU-JAWABAN.md`, `uji-jawaban`

### `zeph-konteks-repo` — pending — verdikt DIGARAP

```
ZEPH-KONTEKS-REPO (2026-10-14): konteks repo USER (kode yang sedang dibuka) — simbol/ekspor/impor/berkas uji, dicari LOKAL + deterministik seperti indeks Zephyr sendiri. Keadaan sekarang: indeks 6.192 entri itu SEMUANYA tentang Zephyr (aplikasinya), jadi Zeph AI paham dirinya sendiri tapi tidak paham proyek yang sedang Ryu kerjakan — ini harga masuk untuk jadi pengganti VS Code + Copilot sehari-hari (Copilot menang justru di sini). Harus tetap jalan tanpa jaringan dan tanpa mengirim kode ke luar batas yang disetujui user.
```
Bukti tertunjuk: `KONTEKS-REPO.md`, `USULAN-SUNTIK-KONTEKS.md`, `USULAN-konteks-repo.md`

### `zeph-provider-fallback` — pending — verdikt DIGARAP

```
ZEPH-PROVIDER-FALLBACK (2026-10-14, kejadian nyata hari ini): penanganan provider gagal untuk Zeph AI — HTTP 429 (batas kecepatan) membunuh 2 dari 4 anak delegasi (1439 s & 1455 s, 104 & 102 panggilan) dan perilaku app saat itu tidak dirancang: tidak ada retry berjenjang, tidak ada fallback model, tidak ada pesan jujur ke user. Wajib: retry + backoff untuk 429, fallback antar-model/provider, batas waktu per giliran, dan pesan yang jelas ('provider menolak sementara, ini yang dicoba') — bukan diam-diam gagal. Ini juga menjelaskan kenapa 'kadang bego' terasa random: sebagian kegagalan sebenarnya kegagalan provider, bukan kegagalan pengetahuan.
```
Bukti tertunjuk: `PROVIDER-429.md`

### `zeph-baca-kode-sendiri` — pending — verdikt BELUM

```
ZEPH-BACA-KODE-SENDIRI (sisa ai-tahu-100-8a, 2026-10-14): tool internal untuk MEMBACA ISI berkas kode Zephyr (bukan cuma peta 393 entri berkas→simbol). Sekarang Zeph bisa menunjuk `ActivityBar.tsx:371` tapi tidak bisa membaca isinya untuk menjelaskan cara kerjanya — jadi jawaban 'cara kerja X' berhenti di tingkat daftar. Wajib: baca terbatas (baris/potongan), tanpa folder user, tetap lokal.
```
Bukti tertunjuk: —

### `zeph-versi-indeks-basi` — pending — verdikt BELUM

```
ZEPH-VERSI-INDEKS-BASI (2026-10-14): indeks/fakta harus memuat cap hash sumber + versi app, dan Zeph WAJIB bilang 'ini bisa basi' kalau cap tidak cocok. Sudah kejadian nyata: indeks digenerate sementara agen masih menulis `src/**` → gate 'indeks sinkron' merah dan sebentar app menjawab dari indeks basi. Sekarang generator dijalankan manual; tanpa cap, tidak ada yang tahu jawabannya sudah usang.
```
Bukti tertunjuk: —

### `zeph-klaim-nilai` — pending — verdikt BELUM

```
ZEPH-KLAIM-NILAI (2026-10-14): penjaga anti-ngarang tahap kedua — sekarang `kataTakDikenal()` menangkap ISTILAH yang tidak ada di Zephyr ('teleportasi' ketangkep), tapi NILAI/ANGKA salah tetap lolos: misalnya model menjawab 'bawaan maxPanes 8' padahal faktanya 6, atau menukar port MCP 9222 dengan CDP 9223. Perlu pemeriksa klaim-nilai (angka/port/default/pintasan) yang membandingkan jawaban dengan indeks setelah jawaban jadi + retry/perbaikan bila menyimpang.
```
Bukti tertunjuk: —

### `zeph-blok-kondisional` — pending — verdikt DIGARAP

```
ZEPH-BLOK-KONDISIONAL (2026-10-14): pemilihan blok inti KONDISIONAL supaya aturan baru (format tabel, larangan, dsb) bisa masuk TANPA menembus batas ±2.000 token yang sekarang sudah mepet (1.988/2.000). Contoh: kalau pertanyaannya jelas soal kode/repo, blok UI-timeout bisa dimatikan; kalau pertanyaan soal tombol/setelan, blok kode diringkas. Ini yang menjaga keputusan desain inti-kecil + indeks on-demand tetap hidup sambil menambah aturan.
```
Bukti tertunjuk: `BLOK-INTI-101-133-153-162.md`

### `zeph-verifikasi-sisa-2` — in_progress — verdikt DIGARAP

```
ZEPH-VERIFIKASI-SISA-2 (2026-10-14, kerjaan yang KEBURU KEBUNUH): (a) jalankan ulang `node scripts/cek-pengetahuan-2lapis.mjs` untuk membuktikan tambalan escape gua — sebelumnya A9 GAGAL karena regex di berkas harness kelebihan satu lapis backslash, sudah dirapikan + `node --check` EXIT=0, tapi BELUM dibuktikan hijau lewat run; (b) lanjutkan `verify11.mjs` dari V10 — run terakhir sampai V1-V9 LULUS (termasuk V4 setelah izin kendali terminal dinyalakan harness) lalu prosesnya dimatikan; sisa V10/V11/V12 belum ada hasilnya.
```
Bukti tertunjuk: `ALUR-VERIFIKASI-MANDIRI.md`, `cek-pengetahuan-2lapis.mjs`, `verify11.mjs`

### `zeph-munculin-ui` — pending — verdikt DIGARAP

```
ZEPH-MUNCULIN-UI (tambahan Ryu 2026-10-14, contoh dari agen lain: 'Settings sudah saya buka di perintah sebelumnya (lewat settings.open). Cek state:'): Zeph AI harus bisa LANGSUNG MEMUNCULKAN UI di Zephyr dan MEMBUKTIKANNYA, bukan cuma menjawab teks. Dua perilaku yang harus ada sekaligus: (1) AKSI UI NYATA — buka Settings (`settings.open`), panel samping/bawah, Command Palette, Source Control, berkas/folder di editor, terminal, tab baru, mode/zoom/tema — dieksekusi lewat tool resmi berjalan; (2) CEK KEADAAN SESUDAHNYA — model membaca kembali keadaan app (pane terbuka? tab aktif mana? tema apa? seksi mana yang tampil?) lalu melaporkannya apa adanya, mis. 'Settings sudah dibuka lewat settings.open. Cek state: seksi X aktif, nilai Y = Z'. Alasan ini penting: 'berkata sudah membuka padahal tidak' adalah kegagalan yang SAMA dengan mengarang output — jadi aksi UI wajib diikuti pembacaan keadaan, dan kalau gagal/tidak didukung ya bilang gagal + alasannya. PRASYARAT yang sudah ada di repo: perintah internal + dev bridge `window.__ZEPHYR__` (sebagian sudah membacakan keadaan) + indeks label/seksi (1.962 layar + 3.023 label) + blok keadaan `src/lib/aiZephyrState.ts`; yang KURANG = permukaan tool resmi dengan nama+skema ketat (lihat zeph-tool-jendela) DAN kemampuan menampilkan UI yang BELUM ada rumahnya (misal seksi baru/pane baru) — kalau tidak ada, jangan dipura-purakan. Bukti wajib: harness yang menyuruh model memunculkan UI lalu memeriksa KEADAAN app sesudahnya lewat dev bridge (pane/tab/seksi benar-benar berubah) + satu transkrip jawaban nyata yang memuat aksi + 'Cek state:' yang cocok dengan keadaan sebenarnya.
```
Bukti tertunjuk: `aiZephyrState.ts`

### `zeph-tool-berkas-audit` — pending — verdikt DIGARAP

```
ZEPH-TOOL-BERKAS-AUDIT (tambahan Ryu 2026-10-14, dari daftar kemampuan agen lain poin 3): AUDIT DULU lalu tambal yang bolong untuk operasi berkas di DALAM app (bukan cuma lewat shell): baca/tulis/edit/hapus/rename/copy/move berkas + glob (cari berkas) + grep (cari ISI kode di seluruh repo) + buka berkas di editor. Keadaan yang gua tahu: katalog tool internal Zephyr ada 62 entri (56 lolos penyaringan subset, terbukti uji-subset-alat 10/10 live), TAPI gua BELUM memeriksa satu per satu mana operasi yang sudah punya tool sendiri dan mana yang selama ini cuma mengandalkan terminal. Langkah: daftar isi `src/lib/zephyrTools/catalog.ts` lalu bandingkan dengan daftar operasi di atas, catat bolongnya, tambal HANYA yang bolong (jangan bikin tool kembar). Batas wajib: nol akses ke folder user di luar yang dibuka, hapus/rename/copy harus punya jalur konfirmasi + reversibilitas, dan hasil besar dipotong (rujuk pemangkas output tool). Bukti wajib: satu tugas nyata yang memakai operasi bolong itu, dijalankan, dengan keadaan berkas sesudahnya diperiksa dari disk.
```
Bukti tertunjuk: `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `catalog.ts`

### `zeph-replace-in-files` — pending — verdikt DIGARAP

```
ZEPH-REPLACE-IN-FILES (tambahan Ryu 2026-10-14, dari poin 3 agen lain: 'Refactor lintas file (replace_in_files)'): cari-dan-ganti yang SADAR KODE di banyak berkas sekaligus dalam satu panggilan — bukan memaksa model membuka-tulis satu per satu (lambat + rawan setengah jalan kalau run mati, sudah kejadian hari ini: 2 anak delegasi mati 429 dan meninggalkan berkas setengah jadi). Wajib: batas (daftar berkas/folder, pola berkas), laporan per-berkas (berapa penggantian, mana yang dilewati), dan JALUR BATAL (revert sekali perintah) karena ini operasi paling berbahaya untuk repo user. Wajib juga: pilihan pratinjau diff sebelum jalan untuk jumlah penggantian besar. Bukti wajib: satu refactor nyata >=5 berkas dengan hitungan penggantian + pemeriksaan `tsc`/test setelahnya + perintah batal diuji.
```
Bukti tertunjuk: `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`

### `zeph-alur-verifikasi-mandiri` — pending — verdikt DIGARAP

```
ZEPH-ALUR-VERIFIKASI-MANDIRI (tambahan Ryu 2026-10-14, dari poin 4 agen lain: 'Jalankan test/lint/typecheck buat verifikasi'): Zeph AI harus menjalankan pemeriksaan SENDIRI lalu MEMBACA kegagalannya dan memperbaiki — lingkar penuh: tulis perubahan → jalankan tsc/test/lint gate → baca keluaran → benerin → ulangi sampai hijau atau berhenti dengan alasan jujur. Sekarang pondasinya ada (gate proyek: verify:11 12/12, verify:09 11/11, cargo test --lib 441/0, tsc 0; plus pemangkas keluaran tool) tapi yang belum pasti adalah perilaku MODEL-nya: apakah ia benar-benar menjalankan lalu membaca, atau berhenti setelah 'sepertinya sudah benar' (persis kelas kegagalan yang kita larang di zeph-larangan-blok). Wajib: jalur perintah uji bisa ditentukan per proyek, keluaran dipotong supaya hemat konteks, dan bila lingkungan menghalangi pemeriksaan (dependensi hilang dsb) model WAJIB melaporkan 'belum diverifikasi' bukan mengklaim hijau. Bukti wajib: satu tugas nyata yang ditutup dengan bukti keluaran gate di layar (bukan klaim).
```
Bukti tertunjuk: `ALUR-VERIFIKASI-MANDIRI.md`, `SPIKE-169-jalur-ssh.md`, `docs/ALUR-VERIFIKASI-MANDIRI.md`

### `zeph-analis-gambar` — pending — verdikt DIGARAP

```
ZEPH-ANALIS-GAMBAR (tambahan Ryu 2026-10-14, dari poin 5 'analis gambar' + poin 7 'Analisis gambar/screenshot — baca grafik, diagram'): Zeph AI harus bisa MENERIMA dan MEMBACA gambar yang dikirim user (tangkapan layar error, diagram, grafik, desain, foto UI) dan mengirimnya ke model yang mendukung gambar. Sekalian jadi pasangan zeph-screenshot-tool: model bisa melihat UI/tangkapan layar Zephyr sendiri dan menilai tampilannya. Yang BELUM gua verifikasi dan tidak gua klaim: apakah panel chat Zephyr sudah punya lampiran gambar, apakah provider yang dipakai diberi isi gambar, dan berapa batas ukuran. Langkah: periksa jalur kirim pesan (`src/lib/aiStore.ts`) + komponen input chat; bila bolong, tambal (tempel gambar / seret berkas / dari clipboard) + perbesar/potong gambar sebelum kirim + beri tahu bila model tidak mendukung gambar (jangan diam-diam buang lampiran). Bukti wajib: satu pertanyaan nyata tentang isi gambar yang dijawab benar, dengan bukti isi gambar benar-benar ada di body request ke provider.
```
Bukti tertunjuk: `ANALIS-GAMBAR.md`, `USULAN-analis-gambar.md`, `aiStore.ts`

### `zeph-ssh-jalur` — pending — verdikt DIGARAP

```
ZEPH-SSH-JALUR (tambahan Ryu 2026-10-14, poin 6 agen lain: 'SSH: buka koneksi tersimpan & jalankan perintah di server'): dukungan SSH di Zephyr — daftar koneksi tersimpan (host/port/user/kunci), buka sesi di terminal pane, jalankan perintah di server, plus dipakai model (jalankan perintah remote, baca hasil). NOL sekarang (belum ada jalurnya). KESELAMATAN wajib lebih ketat daripada terminal lokal: izin opt-in terpisah (deny-by-default, seperti kendali terminal MCP sekarang yang dimatikan secara bawaan), kunci/kredensial disimpan lewat penyimpanan rahasia OS — TIDAK di berkas setelan biasa dan TIDAK pernah ditampilkan di jawaban model, dan perintah yang menghapus/berbahaya butuh konfirmasi. Bukti wajib: satu sesi nyata ke server uji dengan perintah sederhana yang hasilnya diperiksa, plus uji negatif: kunci TIDAK muncul di berkas setelan maupun di jawaban.
```
Bukti tertunjuk: `SPIKE-169-jalur-ssh.md`

### `zeph-git-worktree` — pending — verdikt DIGARAP

```
ZEPH-GIT-WORKTREE (tambahan Ryu 2026-10-14, poin 6 agen lain: 'Git worktree: bikin checkout paralel'): buat/daftar/hapus git worktree dari dalam Zephyr (UI + tool untuk model) supaya kerja paralel di beberapa cabang tidak saling menimpa — kebutuhan yang sudah terasa nyata di sesi ini (banyak perubahan sementara di worktree utama + butuh tempat bersih untuk menguji). Wajib: nama folder + cabang jelas, cek cabang sudah dipakai worktree lain, dan JANGAN menghapus worktree yang masih punya perubahan tanpa konfirmasi + peringatan eksplisit. TERKAIT: item lama E2 (larangan `git add -A`) dan riwayat insiden wildcard di scripts/ — jadi jalur ini juga harus menolak operasi destruktif massal. Bukti wajib: satu alur nyata bikin worktree → jalankan sesuatu di sana → hapus dengan aman, diperiksa dari terminal biasa.
```
Bukti tertunjuk: `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`

### `zeph-jadwal-command` — pending — verdikt DIGARAP

```
ZEPH-JADWAL-COMMAND (tambahan Ryu 2026-10-14, poin 7 agen lain: 'Jadwalkan perintah di masa depan (schedule_command)'): penjadwalan tugas di Zephyr — model (atau user) bisa menaruh perintah/pekerjaan berjalan di waktu tertentu (mis. 'jam 15.00 jalankan gate dan laporkan', 'setiap Senin periksa pembaruan') dan hasilnya masuk kembali ke panel chat/notifikasi. NOL sekarang. Yang sudah ada sebagai rujukan pola: sisi Hermes memakai cron terpisah, jadi di Zephyr ini harus mandiri (penyimpanan tugas + pemanggil waktu + antrean + jalan saat app hidup; kalau app mati, harus jelas apakah tugas dilewatkan atau dijalankan saat menyala — jangan diam-diam hilang). Wajib: batas jumlah tugas, daftar yang bisa dilihat/dibatalkan user, dan izin: tugas terjadwal TIDAK boleh memakai kendali terminal/kredensial tanpa persetujuan terpisah. Bukti wajib: satu tugas terjadwal nyata yang berjalan sendiri lalu hasilnya terbaca di panel.
```
Bukti tertunjuk: `BATAS-DAN-JADWAL.md`, `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`

### `zeph-audit-katalog-tool` — pending — verdikt DIGARAP

```
ZEPH-AUDIT-KATALOG-TOOL (2026-10-14, keputusan Ryu: MASUKIN hasil obrolan — ini langkah pertama yang disepakati untuk semua urusan tool): AUDIT READ-ONLY `src/lib/zephyrTools/catalog.ts` + penyaring subset (`src/lib/subsetAlat.ts`) TANPA menyentuh kode. Yang harus keluar dari audit: (a) daftar SEMUA nama tool apa adanya + jumlahnya (angka fakta, bukan perkiraan '70an'); (b) tandai yang KEMBAR/NYEREMpet (dua tool yang fungsinya tumpang tindih → penyebab 'ngawur' karena model milih yang salah); (c) tandai yang bisa DIGABUNG jadi satu tool berparameter (contoh: `panel.open{which:settings|sourceControl|palette}` bukan tiga tool; `file.op{op:rename|copy|delete}`); (d) hitung berapa tool yang BENAR-BENAR ditawarkan per giliran sekarang (angka inilah yang dijaga, bukan total katalog); (e) bandingkan dengan daftar kemampuan agen lain + daftar kebutuhan Ryu (unduh/fetch/git/package/browser/SSH) → daftar lubang yang nyata, bukan dugaan; (f) cek apakah tool dari server MCP luar ikut masuk ke katalog dan bagaimana namanya dijaga unik. ATURAN KEBIJAKAN yang mengikat hasil audit ini (keputusan 2026-10-14): (i) angka yang dijaga = yang ditawarkan per giliran, target ≤ ~20; total katalog boleh tumbuh; (ii) DEFAULT PARAMETER, BUKAN TOOL BARU; (iii) SATU KEMAMPUAN SATU RUMAH — dilarang ada versi internal + versi MCP untuk hal yang sama; (iv) tool baru hanya kalau ada tugas nyata yang GAGAL tanpanya, dan wajib ada uji sebelum/dicabut; (v) JANGAN rombak total — yang boleh dirombak hanya NAMA & SKEMA, PENGELOMPOKAN/penyaring, dan ANTI-DOBEL MCP (alasan: gate sekarang hijau verify:11 12/12, verify:09 11/11, cargo test --lib 441/0, tsc 0 → tulis ulang lapisan tool = mecahin semuanya tanpa hasil tambahan). RISIKO YANG SUDAH TERBUKTI dan wajib diperhatikan: penyaring yang kelewat ketat lebih berbahaya daripada tidak ada penyaring — `tugasRun` beku pernah membuat tool tulis TIDAK PERNAH ditawarkan di tengah tugas. Bukti wajib: laporan audit + daftar lubang + usul gabungan (dengan hitungan sebelum/sesudah) yang bisa Ryu putuskan sebelum satu baris kode pun disentuh.
```
Bukti tertunjuk: `AUDIT-KATALOG-TOOL.md`, `AUDIT-TOOL-BERKAS-2026-10-14.md`, `KEPUTUSAN-KATALOG-118-105.md`

### `zeph-fetch-web` — pending — verdikt DIGARAP

```
ZEPH-FETCH-WEB (2026-10-14, dari obrolan 'isi halaman/teks/JSON'): tool internal AMBIL-WEB yang benar, bukan sekadar menyuruh model memakai curl di shell. Alasan (bukan sekadar menambah tool): curl di shell rawan kutip → satu tanda kutip salah, perintah rusak dan model salah baca error; keluaran mentah bisa banjir (halaman 500 KB masuk konteks); efek samping bebas. Yang benar: URL divalidasi (https-only, host dibatasi izin seperti pola allowlist unduh `ext_pkg.rs:1152`, jangan izinkan localhost/internal tanpa izin), keluaran DIPOTONG, JSON bisa dibaca langsung (bukan teks mentah), nol shell, ada batas ukuran + waktu, dan hasilnya bisa langsung ditulis ke berkas. STATUS: apakah katalog Zephyr SUDAH punya tool fetch belum diperiksa (masuk audit); item ini tetap berlaku sebagai 'rumah yang benar' untuk kemampuan itu. TERKAIT: nomor 5 agen lain (aset dari halaman yang butuh login/JS) TIDAK bisa dicover fetch — itu tetap butuh pane browser (`zeph-browser-builtin`). Bukti wajib: ambil JSON + halaman HTML nyata, keluaran terbukti terpotong, dan uji negatif: host di luar izin DITOLAK.
```
Bukti tertunjuk: `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`

### `zeph-unduh-instal-teruji` — pending — verdikt DIGARAP

```
ZEPH-UNDUH-INSTAL-TERUJI (2026-10-14, dari obrolan: 'file apa pun dari URL', 'repo GitHub', 'package npm/pip/winget'): ketiganya SEKARANG bisa lewat terminal, tapi BELUM PERNAH DIBUKTIKAN dengan kasus nyata dan ada tiga titik yang bisa bikin kacau — jadi item ini soal MEMBUKTIKAN + MERAPIKAN, bukan membangun dari nol. (1) PEMANGKAS KELUARAN: curl mencetak bar progres dan npm install mencetak ratusan baris — pemangkas tool Zephyr sudah teruji (uji-trim-tool 15/15) tapi belum pernah diuji dengan keluaran unduhan/instalasi; (2) PERINTAH INTERAKTIF: npm menanya Y/n, winget menanya setuju, sudo meminta sandi → kalau model tidak bisa menjawab prompt, perintah menggantung dan model akan MENGARANG hasilnya (ini kelas kegagalan yang dilarang di zeph-larangan-blok); sandi WAJIB DITOLAK, bukan diketik; (3) IZIN: kendali terminal deny-by-default (`mcp_server.rs:263-280`) harus tetap begitu — yang perlu jelas siapa yang mengizinkan AI Zephyr memakai terminal dan apakah izinnya per-perintah atau sepanjang sesi. Bukti wajib (dijalankan, bukan dirancang): unduh satu berkas nyata (zip/pdf) lalu dipastikan ada di disk dengan ukuran benar; `git clone` satu repo kecil lalu `git log` terbaca; satu instalasi paket nyata; satu perintah yang meminta konfirmasi Y/n dan dijawab dengan benar; satu percobaan yang meminta sandi dan DITOLAK; semua keluaran mentah dibandingkan ukurannya dengan yang masuk konteks model.
```
Bukti tertunjuk: `UNDUH-INSTAL-TERUJI.md`, `docs/UNDUH-INSTAL-TERUJI.md`

### `zeph-autocomplete-inline` — pending — verdikt DIGARAP

```
ZEPH-AUTOCOMPLETE-INLINE (2026-10-14, poin penting obrolan 'kenapa Zephyr ada karena VS Code + Copilot'): HARGA MASUK untuk bisa dipakai sehari-hari sebagai pengganti VS Code + Copilot = saran kode sebaris (ghost text/inline completion) + saran lanjutan setelah edit (Next-Edit) + konteks repo user. Ini yang bikin Copilot sulit ditinggalkan, dan Zephyr sekarang menang di 'paham dirinya sendiri', bukan di melengkapi ketikan user. STATUS BELUM DIVERIFIKASI: gua belum memeriksa apakah Zephyr sudah punya mesin saran-sebaris sama sekali; jangan diklaim ada sebelum dibuktikan. Kalau bolong: harus deterministik-cepat (debounce + batal saat user mengetik), hemat biaya (jangan kirim seluruh berkas tiap ketikan), dan bisa DIMATIKAN. Bukti wajib: satu saran nyata muncul saat mengetik di berkas proyek user + satu uji negatif (saran dibatalkan saat user mengetik lewat).
```
Bukti tertunjuk: `SPIKE-175-autocomplete-inline.md`

### `zeph-review-diff-hunk` — pending — verdikt DIGARAP

```
ZEPH-REVIEW-DIFF-HUNK (2026-10-14, poin penting obrolan prioritas produk Zephyr): review perubahan PER BAGIAN (hunk) — terima/tolak tiap potongan diff, bukan per-berkas (sekarang menerima satu berkas berarti menerima semua perubahan di dalamnya, termasuk yang tidak diminta). Ini penopang kepercayaan: user harus bisa menerima satu tambalan sambil menolak tambalan lain dari giliran yang sama. Terkait: setiap perubahan dari AI sudah terlihat sebagai diff di editor, tapi tanpa tingkatan hunk, 'terima' jadi keputusan borongan. Bukti wajib: satu jawaban AI dengan >=3 potongan berbeda di SATU berkas, lalu terima 1 + tolak 2, dan diperiksa isi berkasnya benar-benar hanya memuat potongan yang diterima.
```
Bukti tertunjuk: `SPIKE-176-review-diff-per-hunk.md`

### `catatan-keputusan-sesi` — pending — verdikt DIGARAP

```
CATATAN-KEPUTUSAN-SESI (2026-10-14, jalan supaya hasil obrolan tidak hilang): tulis SATU dokumen ringkasan keputusan di repo (mis. `docs/CATATAN-KEPUTUSAN-2026-10-14.md`) yang memuat: (1) Zephyr dibikin karena VS Code + Copilot → jadi pembeda harus STRUKTURAL, bukan 'lebih lengkap' (3 titik menang: AI mengoperasikan editornya sendiri, kompatibel ekosistem VS Code, model bebas/BYOM; harga masuk: autocomplete sebaris + konteks repo user); (2) tabel perbandingan kemampuan Zephyr vs agen lain (terminal, browser, berkas/kode, coding+uji, sub-agent+peran, kontrol jendela, SSH/worktree, fetch/AI gambar/penjadwalan, notes/todo) — mana ADA / mana NOL / mana BELUM DIBUKTIKAN; (3) daftar lubang AI Zephyr yang sudah dipecah jadi item (buktikan-jangan-klaim, penegakan bahasa, format tabel, klaim nilai, indeks basi, provider gagal, baca kode sendiri, alat ukur mutu jawaban); (4) keputusan strategi ekstensi (buka jalur dulu: allowlist GitHub + indeks + validasi; uji dengan ekstensi deklaratif; extension host berkode ditunda; browser + screenshot jadi BUILT-IN bukan ekstensi); (5) aturan kebijakan jumlah tool (angka yang dijaga = yang ditawarkan per giliran ≤ ~20; parameter > tool baru; satu kemampuan satu rumah; JANGAN rombak total); (6) urutan kerja yang disepakati: audit tool → tambal lubang → bukti mutu jawaban; prompt 7 i18n, 8 bug sisa, 9 commit tetap PALING AKHIR. WAJIB: angka hanya ditulis kalau ada bukti, yang belum diperiksa ditandai 'BELUM DIVERIFIKASI' (dilarang menulis dugaan seolah fakta).
```
Bukti tertunjuk: `CATATAN-KEPUTUSAN-SESI-2026-10-14.md`, `KEPUTUSAN-MARKETPLACE-j5.md`, `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`

### `zeph-tema-cari-pratinjau-tanpa-dup` — pending — verdikt DIGARAP

```
ZEPH-TEMA-CARI-PRATINJAU-TANPA-DUP (dari obrolan 2026-10-14): halaman Theme Zephyr (19 tema, grid 4 kolom, thumbnail cuma STRIP WARNA) disamakan mutunya dengan halaman Themes agen luar yang Ryu kirim: kotak cari ('Search 58 palettes…') + PRATINJAU yang benar-benar berisi contoh KODE (termasuk baris diff `-`/`+`) supaya perbedaan antar tema kelihatan SEBELUM dipilih + badge 'Active' + asal tema (bawaan vs ekstensi). TAMBAHAN yang Ryu minta: tandai/hilangkan tema yang praktis SAMA (duplikat) dan kurangi tema putih — pelaksanaan pengurangan ada di item `zeph-tema-kurangi-bawaan`, item INI yang menyediakan ALAT BUKTINYA (ukur jarak token antar tema → daftar pasangan praktis kembar, jangan nilai pakai mata). JANGAN digabung dengan opsi B j5 (menyatukan tabel statis ke jalur ekstensi) — risiko regresi tinggi. Bukti wajib: pilih 3 tema yang berbeda jauh → UI + editor + terminal benar-benar berubah; daftar tema yang praktis identik keluar sebagai ANGKA; kotak cari menyaring tema. (pending)
```
Bukti tertunjuk: `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`

### `zeph-dekorasi-kode-ala-copilot` — pending — verdikt DIGARAP

```
ZEPH-DEKORASI-KODE-ALA-COPILOT (dari obrolan 2026-10-14, Ryu: 'di github copilot desktop dia ngubah warna code nya jg dll, gimna mnurut lu bisa gtu jga ga?'): dekorasi saran/perubahan di dalam editor — teks usulan diredupkan (ghost text), penambahan dan buangan diwarnai berbeda, baris yang akan diubah giliran berikutnya disorot, plus terima/tolak per potongan. INI BUKAN PEKERJAAN TEMA (tema hanya data warna deklaratif, tidak bisa menyentuh teks) — ini lapisan editor/app. LANGKAH WAJIB SEBELUM MENYENTUH APA PUN: periksa dulu Zephyr memakai mesin editor apa (Monaco? CodeMirror? buatan sendiri?) karena jalur dekorasinya beda total — BELUM gua periksa dan tidak gua klaim. SYARAT yang tidak boleh dilanggar: (a) warna dekorasi WAJIB ikut token tema, dilarang mematok hijau/merah keras (kalau dipatok, tema terang jadi tidak terbaca, dan Zephyr punya tema terang); (b) dekorasi TIDAK BOLEH menyentuh isi berkas (dekorasi hanya tampilan — kesalahan klasik kalau dibuat lewat edit teks); (c) bisa dimatikan user. TERKAIT: `zeph-autocomplete-inline` (ghost text) + `zeph-review-diff-hunk` (terima/tolak per potongan) + `zeph-tema-warna-sintaks` (warna sintaks memang tugas tema, beda hal). Bukti wajib: satu perubahan nyata yang menampilkan penambahan/buangan dengan warna berbeda DI DALAM teks, diuji pada satu tema gelap dan satu tema terang, dan isi berkas terbukti sama sebelum/sesudah saat dekorasi dimatikan. (pending)
```
Bukti tertunjuk: `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`, `docs/LAPORAN-TEMA-DAN-DEKORASI.md`

### `zeph-keymap-bukti-live` — in_progress — verdikt DIGARAP

```
ZEPH-KEYMAP-BUKTI-LIVE (tuntutan Ryu 2026-10-14: 'MISALKAN KEYMAPS ... ITU ADA PERUBAHAN JGA, GIMNA?'): keymap = satu-satunya jenis deklaratif yang jalur muatnya ada (muatKeymap di extLoader.ts) tapi BELUM pernah dibuktikan mengubah binding nyata. Katalog bundel punya 4 paket keymap. Wajib: (1) bukti live lewat resolver yang SAMA dipakai UI (bukan resolver kedua di uji); (2) tabel pemetaan ID workbench.action.* -> perintah Zephyr yang benar-benar ada (berkas ext_bundled.rs sudah pernah kena kasus ini: editor.copyLineDown / editor.moveLineUp / editor.moveLineDown / editor.splitRight BUKAN perintah Zephyr; yang benar editor.line.moveUp, editor.line.moveDown, pane.splitRight; Ctrl+Shift+D dibuang karena sudah dipakai debug.focus); (3) laporan cakupan ('dari N pintasan, M tak punya padanan'); (4) aturan bentrok: binding user/UI menang; (5) bukti 'sebelum vs sesudah' pasang paket keymap. [2026-10-14: scripts/uji-keymap-live.mjs jadi, 37/37 chord punya padanan; BELUM selesai - 11 chord ditolak & 18 pintasan bawaan hilang saat 4 paket dipasang bareng]
```
Bukti tertunjuk: `uji-keymap-live.mjs`

### `zeph-keymap-merge-satu-chord` — pending — verdikt DIGARAP

```
ZEPH-KEYMAP-MERGE-SATU-CHORD (temuan nyata 2026-10-14 dari scripts/uji-keymap-live.mjs): gabungan 4 paket keymap = 26/37 chord mendarat; 11 chord DITOLAK dan 18 pintasan bawaan HILANG (Ctrl+P, Ctrl+N, Ctrl+S, Ctrl+W, Ctrl+F, Ctrl+H, Alt+Up/Down, Ctrl+Shift+P, dll). Sebab: src/lib/keybindings.ts:236-239 mengganti chord pada baris perintah yang sama (satu chord per perintah) padahal paket membind satu perintah dua kali. Perbaiki aturan merge supaya multi-chord didukung TANPA menghapus pintasan bawaan.
```
Bukti tertunjuk: `keybindings.ts`, `uji-keymap-live.mjs`

### `zeph-bahasa-noop-puppet` — pending — verdikt DIGARAP

```
ZEPH-BAHASA-NOOP-PUPPET (temuan 2026-10-14 dari uji-bahasa-live.mjs): satu-satunya paket bahasa no-op = puppet (.pp sudah diklaim pascal yang dimuat lebih dulu). Putuskan: jangan tawarkan, atau beri label jelas.
```
Bukti tertunjuk: `uji-bahasa-live.mjs`

### `zeph-label-sudah-didukung` — pending — verdikt BELUM

```
ZEPH-LABEL-SUDAH-DIDUKUNG (temuan 2026-10-14): perl, python, ruby, shell, xml hanya menambah ekstensi sisa (.t/.pod/.pyi/.erb/.gemspec/.fish/.xsd/.xsl/.xhtml) - bahasanya sudah native. UI wajib menulis 'sudah didukung bawaan', bukan seolah paket itu yang menambah bahasa.
```
Bukti tertunjuk: —

### `zeph-ikon-ketinggalan-12` — pending — verdikt DIGARAP

```
ZEPH-IKON-KETINGGALAN-12 (temuan 2026-10-14 dari cek-katalog-jumlah.mjs): 12 id di LOGO_URI (src-tauri/src/ext_lang_icons.rs) tidak pernah cocok karena paketnya sudah dibuang - bersihkan supaya tidak jadi ikon mati.
```
Bukti tertunjuk: `cek-katalog-jumlah.mjs`, `ext_lang_icons.rs`

### `zeph-perintah-tema-tersembunyi` — pending — verdikt DIGARAP

```
ZEPH-PERINTAH-TEMA-TERSEMBUNYI (temuan 2026-10-14): src/lib/commandRegistry.ts ~baris 1528 masih membuat perintah theme.github-dark & theme.min-light padahal 2 tema itu sudah disembunyikan dari pemilih - sembunyikan perintahnya juga (yang benar: 'perintah tema masih ada di palet').
```
Bukti tertunjuk: `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`

### `zeph-uji-t6-tema-mode` — pending — verdikt DIGARAP

```
ZEPH-UJI-T6-TEMA-MODE (temuan 2026-10-14): scripts/uji-t6-tema-mode.mjs baris 64 masih memanggil pilihKartu('min-light') -> akan merah setelah tema disembunyikan; ganti ke 'zephyr-light'.
```
Bukti tertunjuk: `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`

### `zeph-bukti-live-app-tema` — pending — verdikt DIGARAP

```
ZEPH-BUKTI-LIVE-APP-TEMA (belum terbukti 2026-10-14): bagian B uji-t5-tema.mjs (kartu DOM + bg_image_read) dan jalur end-to-end 'tema VS Code -> warna kode' baru terbukti lewat uji statis/harness; WAJIB dijalankan saat app hidup dengan CDP :9223 sebelum dianggap beres.
```
Bukti tertunjuk: `KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`, `LAPORAN-TEMA-DAN-DEKORASI.md`, `USULAN-TEMA-DAN-DEKORASI.md`

