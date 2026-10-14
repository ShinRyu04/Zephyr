# Zephyr — Catatan Rilis 2 Minggu

**Rentang:** 30 September 2026 16:27 → 14 Oktober 2026 14:10
**Versi aplikasi saat catatan ini dibuat:** 1.1.13 (`package.json`, `src-tauri/tauri.conf.json`)
**Jumlah commit:** 199 · **Berkas `src/` + `src-tauri/` berubah:** 577 · **Dokumen `docs/`:** 128 · **Berkas `scripts/`:** 1.024
**Commit terakhir:** `6068afd` — *Zephyr: sapu backlog — realpath + jembatan baca kode, indeks/versi, audit katalog, angka docs*

Catatan ini memuat **semua** pekerjaan yang masuk di jendela dua minggu tersebut. Bagian 1–7 adalah ringkasan per tema, Lampiran A berisi daftar seluruh 199 commit apa adanya, dan Lampiran B mencatat pekerjaan terakhir yang **belum** di-commit sekaligus apa yang belum selesai — supaya catatan ini tidak menyesatkan pembaca.

---

## Sorotan

- **Chat Settings jadi lengkap.** Dari popup kecil (30 setting, 8 section) tumbuh jadi halaman penuh ala VS Code dengan **105 setting**: tab User/Workspace, badge *Modified*, filter `@modified`, tombol Save dengan penanda perubahan, dan Reset per section yang benar-benar bekerja. Subagents dipindahkan ke dalamnya.
- **Skills, Instructions, Hooks, Agents akhirnya tersambung ke berkas.** Skills tidak lagi hidup di `localStorage`, ada pane Instructions + katalog 17 instruksi siap pakai, dan "Create with AI" (draft → review → simpan) untuk Skills, Agents, dan Hooks.
- **Penghapusan bersih: Voice & Mic.** Fitur suara dan mesin dikte dihapus sepenuhnya dari Zephyr; antrian pesan, agent state, dan slash command dipisahkan dari mesin itu.
- **Kerja agen jauh lebih tahan gangguan.** Agent yang macet dihentikan, loop tak terkendali diputus, retry transport 3× saat 502/503/429, dan agent menunggu provider pulih (15s → 30s → 60s) sebelum menyerah.
- **Tampilan ala Claude Code.** Thinking beranimasi, streaming token live, garis timeline, diff berdampingan (split view), checklist todo di timeline, dan kartu progres tugas.
- **Realpath + jembatan baca kode + indeks pengetahuan** (14 Okt): `fs_realpath` beserta 7 uji Rust, peta kode 6.253 entri, dan sapuan backlog dalam satu commit besar.

---

## 1. Panel AI dan alur agen

### Chat Settings
- Awalnya popup, lalu **halaman penuh ala VS Code**, lalu punya **dua rumah**: popup dan tab editor.
- Jumlah setting bertambah bertahap dan terukur: 30 → 53 → 74 → 82 → 101 → **105 setting** (start command per CLI, SSH, announcements, aturan guard, trust, MCP config, model per subagent, avatar, ekstensi).
- Tab **User / Workspace**, badge **Modified**, filter **`@modified`**, tombol **Save** dengan penanda perubahan, **Reset per section** (sebelumnya tombol reset tidak bekerja).
- Section **Advanced** dibersihkan; baris "Custom sub-agents … Manage…" dibuang; **Subagents** dipindah ke Chat Settings dengan tombol yang arahnya diperbaiki.

### Skills, Instructions, Agents, Hooks
- **`fix(ai)!`** Skills di UI akhirnya tersambung ke **berkas**, bukan `localStorage`.
- Tool **`skill_view`** + dukungan katalog **github/awesome-copilot**.
- Katalog skills + agents dari `awesome-copilot`, plus **browser katalog skills** di Agent Customizations.
- **"Create with AI"** untuk Skills (draft → review → simpan), untuk Agents, dan untuk Hooks — hook yang belum jalan ditandai jelas di UI.
- Pane **Instructions** + katalog **17 instruksi** pilihan; **Instructions per pola berkas**.
- Skill baru **langsung terbaca agent** (tidak menunggu 60 detik).
- Siklus impor `skillsStore`/`instructionsStore` → `aiStore` diputus.

### Tool agen
- **40 tool inti ala TEDI** → integrasi **44/51 tool** → penataan **sekat 30 tool default + 4 grup opsional mati**.
- Tool yang ditambahkan sepanjang periode: `clipboard`, `screenshot_ui`, `plan_mode`, `ask_user`, `todo_write`, `skill_view`, dan **5 tool LSP** (konteks kode, bukan pencarian teks).
- Tool yang sering dibutuhkan **keluar dari balik `tool_search`**; tool yang di-route prompt benar-benar dikirim; tool tanpa grup tidak lagi menyelinap di bagian Files.
- `file_read` mendapat **offset/limit** dan deskripsi yang menyebut angka batasnya.
- G9: batas pane, kebocoran PTY ditutup, operasi git berganda diamankan.

### Perilaku agent dan ketahanan
- Commit `fix(ai): cegah agent macet dan payload tool tidak valid`.
- Loop agent dihentikan; berkas yang belum ada tidak lagi mematikan loop; jawaban bisu, diff hilang, dan tool call yang bocor sebagai teks `<function=name>` diperbaiki; marker DSML tidak lagi bocor ke layar; guard muter browser berhenti di halaman yang sama.
- **Reasoning lintas-provider**: tidak dobel untuk provider yang mengirim kumulatif; bentuk *thinking* disesuaikan per model (model baru selalu kena 400 sebelum diperbaiki); reasoning dibawa ke giliran berikutnya; `usage` dari CLI; reasoning hidup secara default.
- **Retry transport 3×** saat 502/503/429 (bukan langsung menyerah), lalu chat mode ikut retry saat provider gagal; agent tunggu provider pulih **15s + 30s + 60s** sebelum mati saat 502; batas total tangga ulang dibuat Rust selalu melapor sebelum watchdog frontend.
- **Prompt sistem dipangkas 18.847 → 11.828 karakter (−37%)**; hasil tool yang besar diarsipkan, tidak dikirim ke riwayat; ring *context habis* menampilkan angka nyata, bukan tebakan.
- `todo_write` bisa menandai tugas selesai **dengan id saja**; todo berstatus `completed` tidak lagi dibuang jadi `pending`; daftar tugas yang menyusut diperbaiki.

### Tampilan percakapan dan agen
- Streaming token live + animasi **Thinking ala Claude Code**, jam realtime, jarak chat.
- **Garis timeline + diff berdampingan (split view)**; checklist todo dirender di timeline; panel todo/task untuk tab Claude Code; **kartu progres tugas agent + riwayat prompt**.
- Kartu tool: pill tiga warna, animasi, kotak hitam ala TEDI, label langkah kerja yang bermakna (bukan angka internal), kunci lebar kartu.
- **Rencana agen mengambang** di atas kotak chat; **bookmark dan rewind** percakapan; panel **Status dan Sandbox** bisa ditindaklanjuti; StatusArea memakai data subagent nyata.
- Panel **Hooks, Plugins, dan MCP** bisa diubah (bukan cuma dibaca); MCP bisa tambah/hapus server.
- **Lanjutkan sesi CLI dengan `--resume`**; **impor skill dari repo GitHub luar**; tombol scroll bulat 30×30; label INPUT/OUTPUT ala terax.
- Foto di chat bisa dibuka & di-zoom (**lightbox**); avatar chat 22 → 28px + toggle tampil/tidak.
- Popover menu yang tidak muncul saat ref trigger `null` diperbaiki; menu tidak ikut bisa digeser didokumentasikan; bug ActivityBar, badge nempel, dan menu subagent diperbaiki.

### Slash command
- Slash command dibuat **lengkap dan benar-benar berfungsi** (sebelumnya banyak yang hanya membuka panel atau diam): palette `/` memuat slash command dan tidak lagi lari ke atas, tetap tinggal di composer dengan argumen yang bisa diketik, keybindings dan `/compact` hidup.

### Persona dan prompt
- **Satu persona Zeph** + katalog tool; section **Prompt AI dihapus** (persona jadi satu-satunya sumber prompt); prompt Settings tetap berlaku **berlapis** (bukan memilih pemenang); persona tidak lagi menghapus aturan operasional; tool *Run* memakai **cwd workspace**.
- Persona baru + salin + ubah dipulihkan, dengan ikon naga Zeph dan i18n 10 bahasa.

### Update
- **Badge update ala VS Code** (logo Zephyr, muncul bertahap, tanpa bell).
- **Release Notes benar-benar terbuka di editor** (sebelumnya gagal dibuka).

---

## 2. Penyunting, panel, dan antarmuka

- **Chat AI jadi tab editor sungguhan**, dengan composer yang dirapikan.
- **Semua popup modal bisa digeser**, termasuk dialog **"Delete all chats"**.
- **Tampilan premium untuk semua dialog, popup, dan panel sesi**; tata letak MCP, Chat Settings, dan tombol maximize diperbaiki.
- State runtime **dipisahkan per permukaan** (kolom kanan vs tab editor); percakapan kolom kanan dan tab editor tidak lagi saling nyambung; jarak composer disamakan di ketiga home chat.
- Kolom **Sessions bisa dibuka lagi saat maximize**; hapus chat **benar-benar mengurangi** (sebelumnya tidak).
- **Wallpaper tembus pada 9 permukaan chrome**; `ai-trace.css` dipakai jejak tool sehingga teks tidak menempel.
- WebView2: `--single-process` dan `--renderer-process-limit=1` dibuang; dev server tidak lagi memantau `src-tauri/target` supaya tidak mati saat `cargo build`.
- Perbaikan tata letak dua tingkat (Zephyr/MCP) ala TEDI yang benar-benar berlaku; judul tumpukan status mengambil cetakan visual Hermes; scroll bersarang di tumpukan status dihentikan.
- **Discord Rich Presence** masuk (1.1.13): Zephyr menerbitkan workspace aktif dan durasi sesi ke klien Discord lokal, lalu membersihkannya saat keluar.
- Customize Layout tidak lagi menutup jendela saat panelnya dimuat pertama kali (1.1.13).

---

## 3. Suara, mic, dan penghapusannya

- Fase pemasangan: provider suara neural **berbeda per provider**, daftar provider mic disamakan dengan suara, kolom **URL server sendiri** (lokal tanpa key, termasuk ollama), **mic benar-benar men-transkrip rekaman**, tombol mic tidak ikut mati saat Suara dimatikan, dokumen suara neural + mic ditulis (engine, hasil uji, jebakan pemasangan).
- Fase penghapusan: Voice & Mic **dipindahkan ke Chat Settings**, lalu **dihapus sepenuhnya** dari Zephyr, termasuk **mesin dikte**; antrian pesan, agent state, dan slash command dipisahkan agar tidak ikut terbawa.
- Perbaikan pendukung: AI gagap, foto avatar raksasa, dan voice input.

---

## 4. Keamanan, penyimpanan, dan build

- **Token MCP yang tidak bisa diputar (401 permanen)** diperbaiki + harness rilis MCP untuk membuktikannya.
- **Penulisan berkas state jadi atomik**; `replace` tidak lagi merusak encoding berkas; MCP tidak boleh membuang buffer; nama yang menyesatkan di audit diperbaiki; token CSS, listener StrictMode, dan identitas tugas dirapikan.
- Dua bug serius dari audit menyeluruh ditutup (gelombang 9), termasuk kebocoran PTY, batas pane, dan operasi git berganda.
- Parser `mcp__tedi__` → **`mcp__zephyr__`**, folder `tediTools` → `zephyrTools`.
- Build rilis: **1.1.13 Windows + Linux, ditandatangani dan diverifikasi**, plus verifikator tanda tangan dan `target`-nya di-ignore; `gitignore` menutup `mcp.json`, `settings.json`, dan `.env`.
- Chunk CodeMirror/Lezer digabung dan `manualChunks` `codemirror-vendor` dihapus karena membuat boot rilis macet; chunk melingkar itu sebelumnya bikin boot beku.

---

## 5. Tema, ikon, dan bahasa

- **10 bahasa disinkronkan** berulang kali sepanjang periode; **deskripsi tool lengkap 10 bahasa** (tidak ada lagi yang jatuh ke Inggris); 39 string antarmuka yang hilang ditambahkan; satu baris prompt bawaan yang tercampur dua bahasa diperbaiki.
- Kontrol LSP mati saat IntelliSense dimatikan; tampilan ala Terax; bahasa sinkron dengan persona ber-ikon.
- Tema & warna sintaks memakai token CSS `--syn-*` (11 token) dan pemetaan tema VS Code (`petakanTemaVscode`).

---

## 6. Perkakas uji dan dokumen (2 minggu)

- **1.024 berkas** di `scripts/` dan **128 dokumen** di `docs/` disentuh dalam jendela ini.
- Harness yang lahir atau diperbarui: harness rilis MCP, verifikasi token berputar, `BUILD_REPORT.md` dengan bukti, harness uji terminal untuk exe rilis, tes penjaga dua bug fatal (gelombang 6), harness todo di folder sementara, alat diagnosa & pemantau sesi perbaikan, plus rangkaian `uji-*`/`cek-*` untuk jangkauan tool, pengetahuan dua lapis, izin terminal, anggaran pesan, fallback jalur kirim, malformed args, versi indeks, indeks sinkron, batas inti, pane & kurs, dan **`uji-css-selector-gantung.mjs`** (penjaga selector CSS gantung, ditulis 14 Okt).
- Catatan/memori proyek yang ditulis: persona menghapus aturan operasional + 502 mengunci UI, sesi performa AI (freeze, 42k → 21k, transkrip), prompt untuk Claude Code + alat diagnosa provider, catatan jebakan harness terminal, dan dokumen jebakan pemasangan suara.
- Pembersihan repo berulang: berkas uji sementara, berkas pesan commit, folder `.revtmp`, dan artefak verifikasi sementara dibuang dari repo publik; `scripts/zz-*` lokal di-ignore.

---

## 7. Pekerjaan 14 Oktober (sapuan backlog)

Masuk lewat commit `6068afd` (1.039 berkas, **2.140.747 baris masuk**, 4.016 baris keluar):

- **Realpath**: `fs_realpath` + `realpath_dalam_akar` di `src-tauri/src/fs_utils.rs`, dengan **7 uji Rust** baru (`mod uji_realpath`); total `cargo test --lib` saat diukur: **525 lulus / 0 gagal**.
- **Jembatan baca kode**: modul `src/lib/bacaKode.ts` untuk membaca isi berkas kode Zephyr (bukan hanya peta simbol).
- **Indeks & versi**: `zephyrIndeks.ts` **6.253 entri / 1.060.231 byte**, `zephyrFakta.ts` 9.843 byte, `cek-indeks-sinkron` **SINKRON**, `uji-versi-indeks` **18/18**, `cek-batas-inti` **1.988/2.000** token.
- **Audit katalog tool**: 67 tool, 62 aktif default, **26 tool selalu dikirim vs target 20** (temuan struktural, keputusan pemilik masih tertunda).
- **Angka di dokumentasi**: dokumen-dokumen `docs/LAPORAN-*` dan `docs/USULAN-*` diisi angka nyata hasil harness, bukan klaim.
- **Perbaikan UI**: satu baris sampah `.btn.btn.btn` di `src/index.css` yang membuat `.modal-backdrop` mati (modal kehilangan `position:fixed/inset:0/z-index:1000`) **dibuang**; diverifikasi penjaga `scripts/uji-css-selector-gantung.mjs` (sebelum: 3 temuan/exit 1 → sesudah: 47 berkas, 4.581 selector, **0 temuan/exit 0**) dan dipastikan hidup di app lewat HMR 14:21:20.

---

## Lampiran B — Yang BELUM selesai (jujur, jangan dianggap beres)

Ditulis apa adanya supaya catatan rilis ini tidak menyesatkan:

- **i18n final belum dikerjakan.** Sisa kerja: 449 kunci perlu ditambal, **436 nilai bahasa Indonesia masih teks Inggris**, 161 kunci kosong di semua 9 bahasa non-EN, 277 kunci hanya ketinggalan 1 bahasa. `src/lib/i18n-extra.ts` belum ditulis; bahan mentahnya ada (`i18n-kerja-list.json`, 449 kerja + 449 kamus).
- **Marketplace: dua cacat pemeriksa membuat paket bawaan ditolak** — (a) `src-tauri/src/ext_pkg.rs:692` hanya membaca bentuk `{"keybindings":[…]}` sehingga paket keymap yang menulis **array langsung** (`keymaps/vim.json`) dianggap 0 binding → Vim, Emacs, JetBrains, Sublime ditolak; pemuat asli `src/lib/extLoader.ts:198` menerima **dua** bentuk. (b) ikon theme: 4 paket ikon bawaan memakai bentuk `{"icons":{…}}` sedangkan pemeriksa hanya menghitung `iconDefinitions` → "0 icon definitions".
- **Harness yang masih merah:** `uji-baca-kode-sambung.mjs` **47/52 exit 1** (5 merah grup C); `uji-pengetahuan-angka.mjs` **38/43** (5 merah: blok total 1.576 char melewati batas 1.200, cap hash tidak ditegakkan di runtime, indeks basi); `audit-katalog-tool.mjs` exit 1; `uji-fallback-jalur-kirim.mjs` 20/20 tapi plafon 60/70 belum ada kodenya dan `providerTahan.ts` masih modul mati; izin L2 belum mengenal `iex`/here-string.
- **4 gate BUTUH APP** (CDP `:9223`) belum dijalankan pada app hidup.
- **Lampiran B pada commit:** 5 berkas perubahan belum di-commit (`src/index.css`, `src/lib/aiStore.ts`, `i18n.ts`, `i18n-src.ts`, `i18n-extra.ts`) + 4 berkas baru (`src/lib/providerTahan.ts`, `scripts/cek-izin-terminal.mjs`, `scripts/uji-css-selector-gantung.mjs`, `scripts/uji-fallback-jalur-kirim.mjs`).

---
## Lampiran A — Daftar seluruh 199 commit (30 Sep → 14 Okt 2026)
Diurutkan dari yang paling lama ke yang paling baru. Ini daftar mentah dari git, supaya tidak ada pekerjaan yang hilang dari ringkasan di atas.

### 30 Sep — 2 commit
- `9ea3da9` 16:27 — fix: 1.1.13 - custom layout crash, terminal font, palette, queue chips
- `fbec3d9` 17:10 — fix: popover menus never appeared when the trigger ref was null

### 01 Oct — 16 commit
- `23218e6` 16:11 — chore: snapshot sebelum perbaikan bug - semua fitur 1.1.13 tersimpan di git lokal
- `3e78c85` 16:32 — chore(repo): buang 9 berkas sampah uji dari repo publik
- `79d884d` 17:04 — chore(gitignore): abaikan semua skrip lokal scripts/zz-*
- `2e36ff8` 17:07 — fix(webview2): buang --single-process & --renderer-process-limit=1
- `9e4847c` 17:10 — fix(ai): todo berstatus 'completed' tidak lagi dibuang jadi 'pending'
- `e56e5ac` 17:38 — fix(ai-panel): jejak tool pakai ai-trace.css, akhiri teks yang menempel
- `8ac0608` 18:49 — zephyr: gelombang 3-5 - status panel AI bersih, kartu tool, wallpaper chrome
- `ba93125` 18:52 — zephyr: gelombang 4 sisa - StatusArea pakai data subagent nyata
- `a457cde` 18:55 — zephyr: tool gate - tool tanpa grup tidak lagi nyelip di Files
- `2615f46` 19:41 — zephyr: harness uji terminal untuk exe rilis + catatan jebakannya
- `63cb7e2` 20:08 — zephyr: G9 file_read offset/limit + sebut angka batas di deskripsi tool
- `fe91ada` 21:02 — zephyr: satu persona Zeph + katalog tool + optimasi kecepatan AI
- `ccdbd42` 21:06 — zephyr: prompt Settings berlaku walau persona aktif (lapisan, bukan pilih pemenang)
- `65dde5f` 21:22 — zephyr: hapus section Prompt AI - persona jadi satu-satunya sumber prompt
- `339e451` 21:34 — zephyr: gelombang 6 - perbaiki status stack AI + tes penjaga 2 bug fatal
- `7a77fde` 23:42 — ﻿zephyr: kartu progres tugas agent + riwayat prompt

### 02 Oct — 22 commit
- `a7716e7` 00:15 — ﻿zephyr: gelombang 7 - bug ActivityBar, badge nempel, menu subagent
- `d6621f8` 00:21 — ﻿zephyr: gelombang 7 - wallpaper tembus pada 9 permukaan chrome
- `ce1b414` 00:30 — ﻿zephyr: gelombang 7 - tool ask_user + jalur uji tool nyata
- `b446dff` 00:38 — ﻿zephyr: gelombang 7 - tool clipboard, screenshot_ui, dan plan_mode
- `7510a6f` 00:55 — ﻿zephyr: gelombang 7 - sekat tool 30 default + 4 grup opsional mati
- `50edc56` 01:01 — ﻿zephyr: gelombang 7 - pill keadaan tiga warna + kunci lebar kartu tool
- `f1447b4` 01:11 — ﻿zephyr: gelombang 7 - label langkah kerja yang bermakna, bukan angka internal
- `7af849d` 01:41 — ﻿zephyr: gelombang 9 - dua bug serius dari audit menyeluruh
- `70e7136` 02:01 — ﻿zephyr: gelombang 9 - tutup kebocoran PTY, batas pane, dan operasi git berganda
- `bcf9305` 05:59 — ﻿zephyr: gelombang 9 - token CSS, listener StrictMode, mcp, dan identitas tugas
- `3417ad6` 06:08 — ﻿zephyr: gelombang 9 audit-2 - replace tidak lagi merusak encoding berkas
- `b4afdd9` 06:12 — ﻿zephyr: gelombang 9 audit-2 - penulisan berkas state jadi atomik
- `1d0f04a` 06:16 — ﻿zephyr: gelombang 9 audit-2 - MCP tidak boleh membuang buffer, dan nama yang bohong
- `b76ae3e` 07:09 — ﻿zephyr: gelombang 9 - perbaiki token MCP yang tidak bisa diputar (401 permanen)
- `a4bd979` 07:23 — ﻿zephyr: gelombang 9 - harness rilis MCP, dan verifikasi token berputar
- `99aeb99` 07:26 — ﻿zephyr: gelombang 9 - BUILD_REPORT.md dengan bukti
- `d5b2ddd` 08:08 — ﻿zephyr: panel AI - hentikan scroll bersarang di tumpukan status
- `21fcbc1` 08:11 — ﻿zephyr: panel AI - simpan tangkapan layar untuk verifikasi visual tumpukan
- `a1ab1e6` 08:19 — ﻿zephyr: panel AI - ambil cetakan visual Hermes untuk judul tumpukan status
- `22eba17` 08:54 — ﻿zephyr: tool - two-level sections (Zephyr/MCP) ala TEDI, dan perbaikan tata letak yang benar-benar berlaku
- `8b20554` 09:05 — ﻿zephyr: tool - 40 tool inti ala TEDI, dan bukti bahwa 8 klaim "belum punya" itu salah
- `3652fb5` 21:39 — zephyr: pulihkan pekerjaan bisect (katalog 40/51 tool + riwayat) & perbaiki build

### 03 Oct — 15 commit
- `8fc229d` 00:30 — zephyr: integrasi 44/51 tool, perbaikan browser pane, dan listener streaming
- `05fdd7c` 01:44 — zephyr: UI panel AI — queue baris, tool card kotak hitam + animasi, tombol scroll
- `84cc6e3` 02:00 — zephyr: perbaiki tombol scroll (30x30 bulat) + label INPUT/OUTPUT ala terax
- `86ecb7f` 02:23 — zephyr: foto di chat bisa dibuka & di-zoom (lightbox)
- `2e91d7a` 06:22 — zephyr: hentikan loop agent + suggest_command + i18n 10 bahasa
- `e0587a9` 06:44 — zephyr: sinkronkan catatan rilis 1.1.13 + bersihkan skrip debug
- `575e3f3` 14:24 — zephyr: perbaikan bug, language server UI, dan sinkronisasi 10 bahasa
- `989cd07` 16:31 — zephyr: kontrol LSP mati saat IntelliSense off + tampilan ala Terax + persona ber-ikon + bahasa sinkron
- `86975c3` 16:59 — zephyr: avatar chat + toggle tampil/tidak + kunci kamus
- `6023713` 21:17 — zephyr: perbaiki AI gagap, foto avatar raksasa, dan voice input
- `1f7f1c1` 21:20 — zephyr: perbesar avatar chat 22 -> 28px
- `fa3f651` 21:26 — zephyr: perbaiki agent looping setelah tugas selesai
- `6fcf5d5` 21:30 — zephyr: chat mode ikut retry saat provider gagal (502/503/timeout)
- `5b3e997` 21:54 — zephyr: slash command tetap di composer, argumen bisa diketik (ala Hermes)
- `f8a65b8` 22:49 — zephyr: retry transport provider 3x saat 502/503/429 (bukan langsung menyerah)

### 04 Oct — 17 commit
- `a2a076e` 08:25 — zephyr: paket suara neural+mic, loop/goal banner, rules guard, subagent guard+ikon
- `95c41b3` 10:05 — zephyr: gabung chunk codemirror+lezer jadi satu (perbaiki boot release macet)
- `92331d8` 10:23 — zephyr: hapus manualChunks (circular chunk codemirror-vendor bikin boot release macet)
- `b2ba2da` 10:50 — zephyr: agent tunggu provider pulih (15s+30s+60s) sebelum mati saat 502
- `513eed7` 11:29 — zephyr: balikin persona baru+salin+ubah, ikon naga Zeph, i18n 10 bahasa
- `10dff43` 16:23 — zephyr: kolom URL server suara sendiri (lokal tanpa key) + i18n
- `ee0d60c` 16:36 — zephyr: provider suara ollama lokal tanpa key + URL server sendiri
- `333a133` 19:26 — zephyr: daftar suara neural beda per provider + suara ikut bahasa jawaban
- `5c7243a` 19:40 — zephyr: samakan daftar provider mic dengan suara + label Mic server URL
- `ba31c7f` 19:44 — zephyr: dokumen suara neural + mic (engine, hasil uji, jebakan pemasangan)
- `af583ba` 19:51 — zephyr: tombol mic tidak lagi ikut mati saat Suara dimatikan
- `2ef0a61` 19:54 — zephyr: kolom 'Mic model' (dulu meminjam nama 'Voice model')
- `03e618f` 20:13 — zephyr: mic akhirnya benar-benar men-transkrip rekaman
- `69f8d27` 21:57 — fix(ai): tool Run memakai cwd workspace, persona tak lagi menghapus aturan operasional
- `f102b11` 21:58 — docs(memory): persona menghapus aturan operasional + 502 mengunci UI
- `babee90` 23:00 — refactor(tools): awalan mcp__tedi__ menjadi mcp__zephyr__, folder tediTools menjadi zephyrTools
- `7080225` 23:52 — fix(agent): marker DSML bocor ke layar, dan siklus buka-tutup halaman tidak lagi berjalan tanpa henti

### 05 Oct — 19 commit
- `b6b20ad` 00:18 — fix(ai): reasoning tidak dobel untuk provider yang mengirim kumulatif, dan guard muter browser berhenti di halaman yang sama
- `010430a` 01:00 — fix(harness): T5 panel Tools gagal karena harness, bukan produknya
- `070f726` 01:14 — fix(ai): batas total tangga ulang - Rust selalu melapor sebelum watchdog frontend
- `0e6b17b` 02:10 — feat(i18n): deskripsi tool lengkap 10 bahasa, tidak ada lagi yang jatuh ke Inggris
- `5eb9f36` 02:50 — fix(mock): penanda perintah dicari di SELURUH riwayat, bukan hanya pesan terakhir
- `7c461cc` 04:11 — fix(ai): tombol Lanjut muncul saat timeout di langkah pertama, dan alasan tidak lagi tercetak dua kali
- `fcdf5de` 05:23 — fix(ai): teks dan tool call yang sudah datang tidak lagi dibuang saat err ikut terkirim
- `c7c80ca` 05:55 — fix(harness): verify06 memakai bentuk bridge tool yang sudah usang
- `fce79f4` 07:04 — build(release): 1.1.13 Windows + Linux, ditandatangani dan diverifikasi
- `f2bbf25` 07:06 — build(release): verifikator tanda tangan + ignore target-nya
- `340a067` 12:34 — docs: prompt untuk Claude Code + alat diagnosa model provider
- `d895c63` 13:16 — fix(ai): tampilkan diff perubahan berkas + pemicu subagent yang tegas
- `b8b9c4f` 13:35 — fix(ai): todo_write bisa menandai tugas selesai dengan id saja
- `ac1704a` 13:42 — fix(ai): custom endpoint, penanganan error agent, dan pencegahan placeholder model
- `947a426` 14:39 — fix(ai): workspace kosong, todo_write id saja, dan daftar tugas yang menyusut
- `53c6e93` 14:47 — fix(ai): berkas yang belum ada tidak lagi mematikan loop agent
- `ff8a369` 15:02 — chore: gitignore mcp.json, settings.json, dan .env
- `1d9eda5` 15:50 — fix(mcp): editor_open gagal membalas karena path dibandingkan dengan '==='
- `1b29e1c` 15:52 — chore(scripts): alat diagnosa dan pemantau dari sesi perbaikan

### 06 Oct — 7 commit
- `2e60953` 10:24 — fix(ai): hilangkan freeze panel, benahi loop agent, tool, dan prompt
- `4f3724d` 10:24 — fix(dev): jangan pantau src-tauri/target agar dev server tak mati saat cargo build
- `96e78c4` 14:33 — feat(ai): ungkap tool bertahap + rapikan transkrip chat
- `d4517aa` 14:33 — perf(ai): pangkas prompt sistem 18.847 -> 11.828 karakter (-37%)
- `c2af1d6` 15:17 — docs(buglog): catat sesi perf AI (freeze, kelambatan 42k->21k, transkrip)
- `50ec0de` 16:31 — fix(ai): kirim tool browser/web-baca yang di-route prompt
- `8bd8b69` 21:55 — zephyr: panel AI bergaya Copilot + tab Chat/Claude Code/Codex

### 07 Oct — 21 commit
- `5eb3e0e` 20:24 — zephyr: tab Claude Code bergaya CLI asli + kit render bersama
- `f49bf90` 20:42 — chore(ai): buang kode mati + hentikan verifikasi menyentuh config asli
- `bec9693` 20:56 — fix(ai): parse tool_call bergaya <function=name> yang bocor sebagai teks
- `751d418` 20:56 — chore: jangan lacak artefak verifikasi sementara
- `5d2bc1c` 21:08 — feat(ai): garis timeline + diff berdampingan (split view)
- `c18f635` 21:22 — feat(ai): todo/task panel untuk tab Claude Code + diff ikut lebar panel
- `5cd901a` 21:30 — feat(ai): render checklist todo di timeline Claude Code
- `f930d5f` 21:30 — chore: buang berkas uji yang ikut ter-commit
- `15a4460` 21:32 — chore(verify): harness todo bekerja di folder sementara
- `b9c3696` 21:43 — fix(ai): slash command melakukan sesuatu, bukan sekadar buka panel
- `c318269` 21:53 — feat(ai): panel Hooks dan Plugins bisa diubah, bukan cuma dibaca
- `6bc58c6` 21:55 — feat(ai): panel MCP bisa tambah/hapus server
- `bb4f2fd` 22:02 — feat(ai): bookmark dan rewind percakapan
- `e887e7c` 22:19 — feat(ai): rencana agen mengambang di atas kotak chat
- `db7fb3f` 22:21 — fix(ai): send() menerima cwd, dan jangan lacak berkas uji
- `316abd4` 23:02 — feat(ai): todo bergaya CLI asli + perbaiki baris sampah tool_result
- `efd4974` 23:17 — feat(ai): lanjutkan sesi CLI dengan --resume
- `9c1f737` 23:35 — feat(ai): impor skill dari repo GitHub luar
- `6fc69d5` 23:40 — feat(ai): panel Status dan Sandbox bisa ditindaklanjuti
- `e49c378` 23:49 — perf(ai): tool yang sering dibutuhkan keluar dari balik tool_search
- `94afd00` 23:54 — fix(ai): jangan tinggalkan entri delta pada permintaan yang dibatalkan

### 08 Oct — 17 commit
- `3d89bc8` 00:07 — fix(ai): hentikan streaming yang macet + samakan rail di dua transkrip
- `860bc14` 00:25 — fix(ai): bawa penalaran model ke giliran berikutnya
- `90fd0eb` 01:07 — fix(ai): usage dari CLI + reasoning hidup secara default
- `3cfe33c` 01:25 — feat(ai): palette slash memuat slash command, dan tidak lagi lari ke atas
- `7dcaab9` 01:37 — fix(ai): bentuk thinking sesuai model — model baru selalu kena 400
- `cfabd28` 01:57 — perf(ai): arsipkan hasil tool yang besar, jangan kirim ke riwayat
- `4396090` 03:05 — feat(ai): thinking dengan animasi ala Claude Code + bentuk request per generasi
- `9c9821f` 03:06 — chore: buang skrip sementara yang ikut ter-commit
- `3a64142` 03:52 — fix(ai): jawaban bisu, loop tak terkendali, dan diff hilang
- `5a8f65c` 08:21 — feat(cli): slash command lengkap, dan semuanya benar-benar berfungsi
- `114ff07` 11:02 — fix(ai): slash command yang diam, ring compact, dan editor keybindings
- `d0d2ca9` 11:10 — fix(ai): tombol / membuka palette, keybindings, dan compact yang diam
- `3d41192` 11:35 — fix(ai): semua slash command benar-benar beraksi
- `c8a1b24` 11:35 — chore: buang folder sementara .revtmp dari repo
- `4ce0c52` 11:46 — fix(ai): ring context habis compact, bukan angka tebakan
- `96f715c` 16:19 — feat(ai): streaming token live + animasi Thinking ala Claude Code
- `0cb6fc4` 21:14 — feat(ai): thinking ala Claude Code, jarak chat, jam realtime

### 09 Oct — 1 commit
- `b7ca9fd` 03:50 — fix(ai): gap antar-pesan, tempel gambar CLI, pemisah tanggal

### 10 Oct — 60 commit
- `a6cfa1c` 00:40 — feat(ai): tata letak panel ala VSCode + reasoning lintas-provider
- `f834b15` 02:09 — feat(update): badge ala VSCode — logo Zephyr, muncul bertahap, tanpa bell
- `ce878b7` 04:13 — fix(update): Release Notes benar-benar terbuka di editor
- `987e500` 04:18 — feat(ai): Chat Settings jadi popup, bukan halaman Settings penuh
- `93906a8` 05:15 — feat(ai): Chat Settings jadi halaman penuh ala VS Code
- `006f804` 05:59 — feat(ai): dialog "Delete all chats" bisa digeser
- `a750c22` 06:06 — fix(ai): kolom Sessions bisa dibuka lagi saat maximize + hapus chat benar-benar mengurangi
- `45c36d2` 06:12 — feat(ai): Chat Settings punya dua rumah — popup dan tab editor
- `9868cdb` 06:14 — feat(ai): tab User / Workspace di Chat Settings
- `d12ab7a` 06:21 — feat(ai): Chat Settings lengkap — 8 section, 30 setting, popup diperbesar
- `23a2770` 06:43 — feat(ai): Chat Settings — setting suara detail, badge Modified, filter @modified
- `0687286` 06:58 — feat(ai): Chat Settings lengkap — 53 setting di 8 section
- `6e71668` 07:06 — feat(ai): Chat Settings — section Models, Persona, dan Session
- `efa99f7` 07:12 — feat(ai): Chat Settings — 74 setting (tambah tampilan & pintu panel)
- `d01882c` 07:15 — feat(ai): Chat Settings — 82 setting (sub-agent model, MCP, avatar, extensi)
- `15e1d35` 07:21 — feat(ai): Chat Settings — 101 setting (aturan guard, trust, MCP config)
- `5938b9d` 07:27 — feat(ai): Chat Settings — 105 setting (start command per CLI, SSH, announcements)
- `e9ae438` 07:33 — fix(ai): tombol Reset per section akhirnya bekerja
- `84097f1` 07:42 — feat(ai): pindahkan Voice & Mic ke Chat Settings, hapus dari nav Settings
- `29c7852` 07:50 — refactor(ai): bersihkan section Advanced di Chat Settings
- `aeedff5` 07:58 — feat(ai): pindahkan Subagents ke Chat Settings, perbaiki tombol yang salah arah
- `12ff4ac` 08:01 — fix(ai): buang baris "Custom sub-agents … Manage…" dari Chat Settings
- `9b8dda1` 08:22 — feat(ai)!: hapus Voice & Mic dari Zephyr, rapikan Chat Settings
- `feba056` 08:39 — feat(ui): semua popup modal bisa digeser
- `b33422d` 08:52 — feat(ai): Chat AI jadi tab editor sungguhan, rapikan composer
- `0c4f274` 08:54 — fix(ai): samakan jarak composer di ketiga home chat
- `5647bd3` 09:16 — fix(ai): composer kanan dan editor tidak lagi saling nyambung
- `a16d296` 09:32 — fix(ai): pisahkan percakapan kolom kanan dan tab editor
- `1fb5e4e` 09:50 — fix(ai): pisahkan state runtime per permukaan + perbaiki tombol Chat Settings
- `9aa8d08` 09:58 — feat(ai): tombol Save di Chat Settings dengan penanda perubahan
- `65c486b` 10:37 — feat(ai)!: hapus mesin dikte + pisahkan antrian, agent state, dan slash command
- `c739e69` 10:49 — feat(ai)!: hapus Voice & Mic sepenuhnya dari Zephyr
- `8648a00` 10:49 — chore: buang berkas pesan commit sementara dari repo
- `7445dfb` 11:29 — feat(ai): tool skill_view + dukungan katalog awesome-copilot
- `ca0a09c` 11:29 — chore: buang berkas pesan commit sementara
- `aea4c49` 11:44 — fix(ai)!: Skills di UI akhirnya tersambung ke file, bukan localStorage
- `c14c8ce` 11:44 — chore: buang berkas pesan commit sementara
- `5d5c17c` 12:06 — feat(ai): "Create with AI" untuk Skills, draft -> review -> simpan
- `e9934ec` 12:06 — chore: buang berkas pesan commit sementara
- `dbcf33a` 12:19 — feat(ai): "Create with AI" untuk Agents dan Hooks + tandai hook belum jalan
- `541303c` 12:19 — chore: buang berkas pesan commit sementara
- `bc34947` 12:24 — feat(ai): katalog skills+agents dari github/awesome-copilot
- `dc4bd47` 12:25 — chore: buang berkas pesan commit sementara
- `953aebb` 12:30 — feat(ai): browser katalog skills di Agent Customizations
- `80530c6` 12:30 — chore: buang berkas pesan commit sementara
- `3c58302` 12:34 — fix(ai): skill baru langsung terbaca agent, tidak tunggu 60 detik
- `2d54276` 12:53 — feat(ai): Instructions per pola berkas
- `90b740a` 12:53 — chore: buang berkas pesan commit sementara
- `8c7788d` 12:58 — docs(ui): catat kenapa menu tidak ikut bisa digeser
- `2ba81e6` 13:01 — fix(ai): putus siklus impor skillsStore/instructionsStore ke aiStore
- `16f6f17` 13:12 — feat(ai): lima tool LSP untuk agent - konteks kode, bukan pencarian teks
- `834e331` 13:12 — chore: buang berkas pesan commit sementara
- `735d795` 13:36 — feat(ai): pane Instructions + katalog 17 instruksi pilihan
- `30a99a0` 13:36 — chore: buang berkas pesan commit sementara
- `e7ea2d7` 14:01 — fix(ui): perbaiki tata letak MCP, Chat Settings, dan tombol maximize
- `aafd2cc` 14:01 — chore: buang berkas pesan commit sementara
- `5b895fd` 14:16 — feat(ui): tampilan premium untuk semua dialog, popup dan panel sesi
- `9e6a7e4` 14:16 — chore: buang berkas pesan commit sementara
- `d17e1b9` 14:37 — feat(ai): executor hook dengan timeout, batas output, dan cwd tervalidasi
- `f7c53e2` 14:37 — chore: buang berkas pesan commit sementara

### 11 Oct — 1 commit
- `7a39756` 01:28 — fix(ai): cegah agent macet dan payload tool tidak valid

### 14 Oct — 1 commit
- `6068afd` 14:10 — Zephyr: sapu backlog - realpath+jembatan baca kode, indeks/versi, audit katalog, angka docs

**Total: 199 commit.**
