# AUDIT KATALOG TOOL ZEPHYR

Item: **ZEPH-AUDIT-KATALOG-TOOL (172)** · potret celah operasi berkas (**165**) · baca-kode-sendiri (**159**)
Tanggal: 2026-10-14 · Sifat: **READ-ONLY** (tidak ada berkas sumber yang diubah; hanya `scripts/audit-katalog-tool.mjs`, `scripts/grafik-tool-per-giliran.json`, dan dokumen ini).
Sumber angka: `node scripts/audit-katalog-tool.mjs` (output nyata ada di §1). Semua angka dihitung dari kode, bukan diketik ulang.

---

## 1. Output nyata skrip

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Isi §1 di bawah adalah
> keluaran `scripts/audit-katalog-tool.mjs` pada sapuan pertama; saat itu katalog **67**
> (builtin 42, mcp 14, web 11), inti (builtin+mcp) **56**, aktif-default **62**. Katalog sekarang
> **68** (builtin 43 / mcp 14 / web 11), inti **57**, aktif-default **63** — `zephyr_kode` sudah masuk
> katalog. `TOOL_DIKIRIM_SELALU` tetap **26**, jadi baris `DIKIRIM_SELALU : 26` di bawah sudah benar.
> Kutipan verbatim tidak diubah (itu bukti); untuk angka segar, jalankan ulang skripnya.

```
AUDIT KATALOG TOOL ZEPHR (read-only, dari sumber)
akar repo: D:\Zephyr

== A. JUMLAH KATALOG ==
builtin           : 42
mcp (JS)          : 14
web               : 11
inti (builtin+mcp): 56
TOTAL katalog     : 67
aktif default     : 62  (inti 56 + web-aktif 6)
DIKIRIM_SELALU    : 26  (39% katalog)

== B. DAFTAR SEMUA TOOL ==

-- BUILTIN (42) --
  [DIKIRIM] read_file                  Files            read     Baca berkas dari disk, atau buffer editor yang belum tersimpan
  [DIKIRIM] list_directory             Files            read     Daftar isi sebuah folder
  [DIKIRIM] write_file                 Files            fsWrite  Tulis berkas ke disk, atau buat berkas baru
  [DIKIRIM] create_directory           Files            fsWrite  Buat folder, termasuk folder induk yang belum ada
  [search ] move_file                  Files            fsWrite  Pindahkan atau ganti nama berkas/folder
  [search ] copy_file                  Files            fsWrite  Salin berkas atau folder
  [DIKIRIM] delete_file                Files            fsWrite  Hapus berkas atau folder
  [DIKIRIM] replace_in_files           Files            fsWrite  Ganti teks atau pola di banyak berkas sekaligus
  [DIKIRIM] edit                       Edit             fsWrite  Ubah sebagian isi berkas: cari teks lama, ganti teks baru
  [DIKIRIM] multi_edit                 Edit             fsWrite  Beberapa penggantian pada satu berkas dalam satu langkah
  [DIKIRIM] grep                       Search           read     Cari teks di seluruh workspace
  [DIKIRIM] glob                       Search           read     Cari berkas berdasarkan pola nama atau jalur
  [DIKIRIM] zephyr_self                Search           read     Periksa Zephyr sendiri dari sumber milik aplikasi: setelan aktif, log,
  [search ] ingat                      Memori           appWrite Simpan, cari, dan rapikan memori lintas sesi Zeph AI (berkas memori gl
  [DIKIRIM] bash_run                   Shell            exec     Jalankan perintah dan tunggu sampai selesai
  [DIKIRIM] bash_background            Shell            exec     Jalankan proses lama (server, watcher) di latar belakang
  [DIKIRIM] bash_logs                  Shell            read     Baca keluaran proses latar belakang
  [search ] bash_list                  Shell            read     Daftar proses latar belakang yang hidup
  [search ] bash_kill                  Shell            exec     Hentikan proses latar belakang
  [DIKIRIM] run_subagent               Sub-agents       exec     Jalankan satu subagent untuk tugas mandiri
  [DIKIRIM] run_subagents              Sub-agents       exec     Jalankan beberapa subagent paralel
  [DIKIRIM] todo_write                 Tasks & Notes    appWrite Ganti daftar tugas agen untuk tugas ini
  [search ] lsp_symbols                Code intelligence read     Daftar simbol di sebuah berkas, dengan jenis dan kedalaman
  [search ] lsp_references             Code intelligence read     Tempat-tempat yang memakai sebuah simbol, menurut language server
  [DIKIRIM] lsp_definition             Code intelligence read     Lokasi definisi sebuah simbol
  [search ] lsp_hover                  Code intelligence read     Tipe dan dokumentasi simbol pada satu posisi
  [search ] lsp_diagnostics            Code intelligence read     Galat dan peringatan language server untuk sebuah berkas
  [search ] lsp_call_hierarchy         Code intelligence read     Fungsi yang memanggil dan dipanggil oleh sebuah simbol, menurut langua
  [DIKIRIM] skill_view                 Skills           read     Baca isi skill yang terdaftar, atau daftar skillnya
  [search ] notes_read                 Tasks & Notes    read     Baca catatan dan todo milik user
  [search ] notes_write                Tasks & Notes    appWrite Ubah catatan atau todo milik user
  [search ] schedule_command           Schedules        appWrite Jadwalkan perintah untuk dijalankan nanti
  [search ] list_schedules             Schedules        read     Daftar perintah yang terjadwal
  [search ] cancel_schedule            Schedules        appWrite Batalkan perintah terjadwal
  [search ] suggest_command            Terminal         appWrite Sarankan satu perintah shell sebagai kartu - user yang menjalankannya
  [search ] get_terminal_output        Terminal         read     Baca potongan terakhir scrollback terminal aktif
  [search ] open_preview               Terminal         appWrite Buka pratinjau localhost di pane browser
  [DIKIRIM] think                      Penalaran        read     Catat penalaran selangkah sebelum bertindak
  [search ] calculator                 Penalaran        read     Hitung ekspresi aritmetika secara deterministik
  [DIKIRIM] ask_user                   Penalaran        read     Tanya user saat keputusan benar-benar ambigu, lalu tunggu jawabannya
  [DIKIRIM] tool_search                Penalaran        read     Cari tool yang tidak ada di daftar utama (web, browser, SSH, MCP, jadw
  [DIKIRIM] tool_call                  Penalaran        exec     Panggil tool yang ditemukan lewat tool_search

-- MCP (14) --
  [search ] mcp__zephyr__inspect       inspect          read     Periksa command, pane, tab, workspace, atau setelan yang tersedia
  [search ] mcp__zephyr__run_command   control          exec     Jalankan sebuah command aplikasi berdasarkan id-nya
  [search ] mcp__zephyr__open_file     control          appWrite Buka berkas di editor, bisa langsung ke baris tertentu
  [search ] mcp__zephyr__workspace     control          appWrite Lihat, buat, atau ganti workspace
  [search ] mcp__zephyr__set_setting   control          appWrite Ubah satu preferensi aplikasi
  [search ] mcp__zephyr__extension     control          appWrite Lihat, aktifkan, atau nonaktifkan ekstensi
  [search ] mcp__zephyr__ssh           control          exec     Buka atau pakai koneksi SSH tersimpan
  [search ] mcp__zephyr__state         inspect          read     Cuplikan keadaan jendela: tab, pane, fokus
  [search ] mcp__zephyr__read          inspect          read     Baca satu permukaan: terminal, buffer editor, atau DOM
  [search ] mcp__zephyr__sh            terminal         exec     Jalankan perintah di pane terminal milik user
  [search ] mcp__zephyr__wait_for_terminal terminal         read     Tunggu terminal selesai atau memunculkan teks tertentu
  [search ] mcp__zephyr__worktree      control          appWrite Kelola git worktree
  [search ] mcp__zephyr__focus_pane    terminal         appWrite Fokuskan sebuah pane tanpa mengklik
  [search ] mcp__zephyr__pane          terminal         appWrite Buka, bagi, tutup, atau susun pane

-- WEB (11) --
  [search ] web_search                 Web              net      Cari di internet
  [DIKIRIM] web_fetch                  Web              net      Ambil dan bersihkan satu halaman web
  [DIKIRIM] browser_open               Browser          net      Buka URL di pane browser yang terlihat
  [DIKIRIM] browser_read               Browser          read     Baca isi halaman di pane browser
  [search ] browser_click              Browser          netWrite Klik elemen di pane browser
  [search ] browser_type               Browser          netWrite Isi kolom di pane browser lalu tekan Enter
  [search ] browser_nav                Browser          net      Maju, mundur, muat ulang, atau pindah URL
  [search ] browser_list               Browser          read     Daftar pane browser yang terbuka
  [search ] browser_close              Browser          appWrite Tutup pane browser
  [search ] browser_download_url       Browser          netWrite Unduh URL langsung ke berkas di workspace
  [search ] system_browser_open        Browser          net      Buka URL di browser sistem

== C. BERAPA DITAWARKAN PER GILIRAN (target <= 20) ==
  26  LEWAT  Tugas WEB (buka/baca halaman), ada folder
  17  OK     Tugas WEB, tanpa folder
  23  LEWAT  Tulis berkas (berat) langkah >=2, tanpa web, ada folder
  14  OK     Tulis berkas, tanpa web, tanpa folder
  17  OK     Tanya/baca berkas, tanpa web, ada folder
  14  OK     Tanya/baca berkas, tanpa web, tanpa folder
   5  GERBANG Langkah-1 tugas berat, ada folder (todo_write, list_directory, glob, grep, read_file)
   2  GERBANG Langkah-1 tugas berat, tanpa folder

  MAKS per giliran : 26  (target 20) -> MELEWATI TARGET

== D. SINKRON KATALOG <-> HANDLER + IZIN ==
berkas handler         : builtins.ts, web.ts, mcp.ts, zephyrSelf.ts, zephyrIngat.ts
handler unik           : 67
katalog tanpa handler  : 0
handler tanpa katalog  : 0
nama katalog ganda     : 0
menulis tapi tanpa izin: 0

== E. DUPLIKASI KEMAMPUAN (internal vs MCP-Rust) ==
tool MCP-Rust (mcp_server.rs tools_schema): 20 -> editor_close, editor_insert, editor_open, editor_write, get_output, get_problems, get_setting, get_settings, get_window, list_editors, list_extensions, list_panes, list_terminals, pane_close, pane_new, run_command, screenshot_pane, set_setting, terminal_key, terminal_write
tool MCP-JS (katalog, blok MCP)          : 14

kemampuan yang punya RUMAH GANDA:
  - jalankan perintah shell
      A: bash_run (builtin)
      B: run_command (MCP-Rust)
  - jalankan perintah di terminal user
      A: mcp__zephyr__sh (MCP-JS)
      B: terminal_write / terminal_key (MCP-Rust)
  - baca keluaran terminal
      A: bash_logs (builtin) + mcp__zephyr__read{terminal} (MCP-JS)
      B: get_output (MCP-Rust)
  - baca masalah/diagnostik
      A: lsp_diagnostics (builtin)
      B: get_problems (MCP-Rust)
  - buka berkas di editor
      A: mcp__zephyr__open_file (MCP-JS)
      B: editor_open (MCP-Rust)
  - buka/tutup pane
      A: mcp__zephyr__pane (MCP-JS)
      B: pane_new / pane_close (MCP-Rust)
  - cuplikan keadaan jendela
      A: mcp__zephyr__state (MCP-JS)
      B: get_window / list_panes / list_terminals / list_editors (MCP-Rust)
  - baca setelan
      A: mcp__zephyr__inspect (MCP-JS)
      B: get_settings / get_setting (MCP-Rust)
  - ubah setelan
      A: mcp__zephyr__set_setting (MCP-JS)
      B: set_setting (MCP-Rust)
  - daftar ekstensi
      A: mcp__zephyr__extension (MCP-JS)
      B: list_extensions (MCP-Rust)
  - tulis isi berkas
      A: write_file / edit (builtin)
      B: editor_write / editor_insert (MCP-Rust)

  total kemampuan ber-rumah-ganda terdeteksi: 11

== F. JEBAKAN: di-ROUTE prompt tapi TIDAK ikut dikirim ==
aturan katalog: "apa pun yang di-route prompt WAJIB ikut dikirim" (catalog.ts:519-520).
tool ber-underscore di-route prompt tapi TIDAK di DIKIRIM_SELALU: 9
  - bash_kill              Hentikan proses latar belakang
  - bash_list              Daftar proses latar belakang yang hidup
  - copy_file              Salin berkas atau folder
  - lsp_diagnostics        Galat dan peringatan language server untuk sebuah berkas
  - lsp_hover              Tipe dan dokumentasi simbol pada satu posisi
  - lsp_references         Tempat-tempat yang memakai sebuah simbol, menurut language s
  - lsp_symbols            Daftar simbol di sebuah berkas, dengan jenis dan kedalaman
  - move_file              Pindahkan atau ganti nama berkas/folder
  - system_browser_open    Buka URL di browser sistem
tool MCP-JS di DIKIRIM_SELALU: 0 dari 14
  -> prompt me-route alias MCP (pane/sh/ssh/inspect/state/read) tapi NOL MCP dikirim

== G. OPERASI BERKAS: ada vs BOLONG ==

  ADA     baca isi berkas SENDIRI (hasil tulis / buffer belum tersimpan)
         rumah : read_file (builtin)
         usul  : cukup parameter - sudah tertutup
         alasan: read_file sudah membaca disk DAN buffer editor yang belum disimpan

  ADA     buat berkas baru
         rumah : write_file (builtin)
         usul  : cukup parameter - sudah tertutup
         alasan: -

  ADA     hapus berkas/folder
         rumah : delete_file (builtin)
         usul  : cukup parameter - sudah tertutup
         alasan: -

  ADA     ganti nama / pindah berkas
         rumah : move_file (builtin)
         usul  : cukup parameter - ADA, tapi TIDAK ikut dikirim tiap giliran (lihat bagian F)
         alasan: ganti nama = move dalam folder yang sama

  ADA     salin berkas/folder
         rumah : copy_file (builtin)
         usul  : cukup parameter - ADA, tapi TIDAK ikut dikirim (lihat bagian F)
         alasan: -

  BOLONG  cari-dan-ganti LINTAS BERKAS yang SADAR KODE (rename simbol / refactor)
         rumah : replace_in_files (builtin) - TAPI ini teks/pola, BUKAN sadar kode
         usul  : butuh TOOL BARU (lsp_rename / refactor simbol)
         alasan: replace_in_files mengganti teks apa adanya: bisa merusak kode (nama sama di komentar/string ikut terganti, simbol terlewat karena beda bentuk). Ganti nama simbol yang sadar-kode hanya bisa dari language server; katalog TIDAK punya lsp_rename (hanya symbols/references/definition/hover/diagnostics/call_hierarchy).

  total BOLONG: 1 -> cari-dan-ganti LINTAS BERKAS yang SADAR KODE (rename simbol / refactor)
  usul butuh TOOL BARU : 1
  usul cukup PARAMETER : 0

== RINGKASAN ==
masalah struktural : 1
  ! langit-langit per giliran 26 > target 20
peringatan         : 2
  ~ 9 tool di-route prompt tapi tak dikirim: bash_kill, bash_list, copy_file, lsp_diagnostics, lsp_hover, lsp_references, lsp_symbols, move_file, system_browser_open
  ~ komentar basi di builtins.ts: menulis "TOOL_DIKIRIM_SELALU (17)" padahal sekarang 26

== GAGAL == (exit 1)
```

Exit **1** disengaja: satu-satunya pemicunya adalah "maks per giliran 26 > target 20". Tidak ada masalah struktural lain (katalog↔handler 100% sinkron, 0 lupa izin, 0 nama ganda). Ini **bukan** katalog yang rusak — ini cermin dari keputusan (i): angka yang dijaga (tool per giliran) memang belum ≤ 20.

**Catatan metode `DIKIRIM_SELALU` vs `TOOL_AKTIF_AWAL`.** `aktif default = 62` (semua yang boleh dipanggil). `DIKIRIM_SELALU = 26` = yang **selalu dikirim** ke model tiap permintaan (`catalog.ts:522`); sisanya dijangkau lewat `tool_search`/`tool_call`. Untuk profil baru, `aktif == bawaan`, sehingga `agentToolSpecs` (`agentTools.ts:129-131`) menyaring ke `DIKIRIM_SELALU` saja. Kalau user menyalakan tool di luar bawaan, tool itu ikut dikirim (mereka yang minta) — jadi 26 adalah **langit-langit bawaan**, bukan batas mutlak.

**Bukan `TOOL_AKTIF_AWAL` yang jadi ukuran.** Angka 62 itu "berapa yang boleh dipanggil", bukan "berapa yang ditawarkan per giliran". Ukuran yang dijaga keputusan (i) adalah yang kedua: **26**.

---

## 2. Tabel tool ↔ frekuensi tawaran

Legenda tawaran: **selalu** = ikut tiap permintaan (`TOOL_DIKIRIM_SELALU`); **cari** = perlu `tool_search`/`tool_call`. Efek: read/net (baca) · netWrite/fsWrite/exec/appWrite (bertindak).

### BUILTIN (42)

| tool | efek | tawaran |
|---|---|---|
| read_file | read | selalu |
| list_directory | read | selalu |
| write_file | fsWrite | selalu |
| create_directory | fsWrite | selalu |
| delete_file | fsWrite | selalu |
| replace_in_files | fsWrite | selalu |
| edit | fsWrite | selalu |
| multi_edit | fsWrite | selalu |
| grep | read | selalu |
| glob | read | selalu |
| zephyr_self | read | selalu |
| bash_run | exec | selalu |
| bash_background | exec | selalu |
| bash_logs | read | selalu |
| run_subagent | exec | selalu |
| run_subagents | exec | selalu |
| todo_write | appWrite | selalu |
| lsp_definition | read | selalu |
| skill_view | read | selalu |
| think | read | selalu |
| ask_user | read | selalu |
| tool_search | read | selalu |
| tool_call | exec | selalu |
| move_file | fsWrite | cari |
| copy_file | fsWrite | cari |
| ingat | appWrite | cari |
| bash_list | read | cari |
| bash_kill | exec | cari |
| lsp_symbols | read | cari |
| lsp_references | read | cari |
| lsp_hover | read | cari |
| lsp_diagnostics | read | cari |
| lsp_call_hierarchy | read | cari |
| notes_read | read | cari |
| notes_write | appWrite | cari |
| schedule_command | appWrite | cari |
| list_schedules | read | cari |
| cancel_schedule | appWrite | cari |
| suggest_command | appWrite | cari |
| get_terminal_output | read | cari |
| open_preview | appWrite | cari |
| calculator | read | cari |

### MCP-JS (14) — semua lewat pencarian

| tool | efek | tawaran |
|---|---|---|
| mcp__zephyr__inspect | read | cari |
| mcp__zephyr__state | read | cari |
| mcp__zephyr__read | read | cari |
| mcp__zephyr__run_command | exec | cari |
| mcp__zephyr__open_file | appWrite | cari |
| mcp__zephyr__workspace | appWrite | cari |
| mcp__zephyr__set_setting | appWrite | cari |
| mcp__zephyr__extension | appWrite | cari |
| mcp__zephyr__ssh | exec | cari |
| mcp__zephyr__sh | exec | cari |
| mcp__zephyr__wait_for_terminal | read | cari |
| mcp__zephyr__worktree | appWrite | cari |
| mcp__zephyr__focus_pane | appWrite | cari |
| mcp__zephyr__pane | appWrite | cari |

### WEB (11)

| tool | efek | tawaran | default |
|---|---|---|---|
| web_fetch | net | selalu | nyala |
| browser_open | net | selalu | nyala |
| browser_read | read | selalu | nyala |
| web_search | net | cari | **nyala tapi tak selalu dikirim** |
| browser_nav | net | cari | nyala |
| browser_list | read | cari | nyala |
| browser_click | netWrite | cari | mati |
| browser_type | netWrite | cari | mati |
| browser_download_url | netWrite | cari | mati |
| browser_close | appWrite | cari | mati |
| system_browser_open | net | cari | mati |

> `web_search` menyala di sekat tapi **tidak** selalu dikirim, padahal `tool_search` sendiri selalu dikirim. Konsekuensinya: untuk "cari di internet" model harus tahu dulu bahwa itu ada di balik `tool_search`. Bukan bug, tapi perlu dicatat karena `web_search` adalah pintu web paling dasar.

**Sinkron katalog ↔ handler: 67/67.** Handler hidup di 5 berkas (termasuk `zephyrSelf.ts` & `zephyrIngat.ts`). `0` nama katalog tanpa handler, `0` handler tanpa entri katalog, `0` nama ganda, `0` tool menulis tanpa izin.

---

## 3. Duplikasi kemampuan (satu kemampuan, dua rumah)

`mcp_server.rs` **bukan** di baris 263-280 (di sana ada helper `terminal_control_setting_enabled` / `terminal_control_allowed` / `health`). Daftar alat MCP-Rust yang sebenarnya ada di **`tools_schema`, baris 514-547** — **20 tool**. Bandingkan dengan 14 tool MCP-JS di katalog. Hasilnya: **11 kemampuan punya rumah ganda**.

| kemampuan | rumah A (internal) | rumah B (MCP-Rust) |
|---|---|---|
| jalankan perintah shell | `bash_run` | `run_command` |
| perintah di terminal user | `mcp__zephyr__sh` (JS) | `terminal_write` / `terminal_key` |
| baca keluaran terminal | `bash_logs` + `mcp__zephyr__read{terminal}` | `get_output` |
| masalah/diagnostik | `lsp_diagnostics` | `get_problems` |
| buka berkas di editor | `mcp__zephyr__open_file` (JS) | `editor_open` |
| buka/tutup pane | `mcp__zephyr__pane` (JS) | `pane_new` / `pane_close` |
| cuplikan keadaan jendela | `mcp__zephyr__state` (JS) | `get_window` / `list_panes` / `list_terminals` / `list_editors` |
| baca setelan | `mcp__zephyr__inspect` (JS) | `get_settings` / `get_setting` |
| ubah setelan | `mcp__zephyr__set_setting` (JS) | `set_setting` |
| daftar ekstensi | `mcp__zephyr__extension` (JS) | `list_extensions` |
| tulis isi buffer editor | `write_file` / `edit` | `editor_write` / `editor_insert` |

**Usul penggabungan (jangan dikerjakan sekarang — butuh keputusan manusia):**
- **Satu kemampuan satu rumah** (keputusan iv). Untuk tiap baris, pilih satu; yang lain jadi alias tipis atau dimatikan.
- Kandidat termudah & paling jelas: `set_setting` (JS) vs `set_setting` (Rust) — **nama identik, dua implementasi** di dua bahasa. Ini duplikasi paling tajam; jadikan Rust satu-satunya atau JS memanggil Rust.
- `get_problems` (Rust, kelola panel Problems) vs `lsp_diagnostics` (JS, per berkas) — perlu dicek apakah benar-benar sama; kalau beda cakupan, bedakan namanya agar tidak terlihat duplikat.
- `editor_write`/`editor_insert` (buffer, tidak menulis disk) vs `write_file`/`edit` **bukan** duplikat sejati — beda sasaran (buffer vs disk). Biarkan, tapi dokumentasikan bedanya.

---

## 4. Celah operasi berkas (item 165)

Tidak ada tool bernama `file.op`/`panel.open` di repo; operasi berkas dijalankan oleh tool bawaan tersendiri. Potret yang sebenarnya:

| operasi | ada? | rumah | usul |
|---|---|---|---|
| baca isi berkas **sendiri** (buffer belum tersimpan) | ✅ | `read_file` | cukup parameter — sudah tertutup |
| buat berkas | ✅ | `write_file` | cukup parameter — sudah tertutup |
| hapus berkas/folder | ✅ | `delete_file` | cukup parameter — sudah tertutup |
| ganti nama / pindah | ✅ | `move_file` | cukup parameter — **tapi tak dikirim tiap giliran** |
| salin | ✅ | `copy_file` | cukup parameter — **tapi tak dikirim tiap giliran** |
| cari-dan-ganti lintas berkas **sadar KODE** (rename simbol) | ❌ | — | **butuh tool baru** penuh/param; lihat di bawah |

**Bolong tunggal + usulnya.** Kebijakan (iii) berkata default = parameter pada tool yang ada.Untuk rename simbol, parameter saja **tidak cukup**: `replace_in_files` mengganti teks apa adanya (nama sama di komentar/string ikut terganti, atau simbol terlewat karena beda bentuk). Perlu jawaban dari language server. Katalog punya `lsp_symbols/references/definition/hover/diagnostics/call_hierarchy` tapi **bukan `lsp_rename`**.

- Usul murah: tambah **parameter** (mis. `rename: true` + `newName`) pada tool LSP yang sudah ada (`lsp_references`) sebagai langkah pertama.
- Usul benar: **tool baru `lsp_rename`**.
- Tapi **kebijakan (ii)**: jangan tambah tool baru sebelum ada tugas nyata yang gagal karena tool itu tidak ada. → **Rekomendasi: tunda; catat sebagai kandidat, jangan kerjakan sekarang.**

**Temuan sisi lain yang lebih mendesak dari bolong baru:** `move_file` dan `copy_file` **ada** tapi tidak selalu dikirim — jadi agen yang baru "berpikir jangan-jangan saya harus mengganti nama berkas" tidak bisa memanggilnya tanpa lebih dulu `tool_search`. Ini lebih murah dibereskan daripada menambah tool.

---

## 5. Rekomendasi angka akhir: "maksimal N tool per giliran"

**Rekomendasi: pertahankan target `N = 20`,** karena itu keputusan yang sudah diputuskan (i) dan kelas tugas normal (baca/tulis non-web) sudah cukup nyaman di 14-23. Masalahnya hanya kelas **WEB+ada folder** (26) dan **Tulis+ada folder** (23).

Untuk menutup selisih **6** pada kasus terburuk (26 → 20), usul *defer* 6 tool dari `DIKIRIM_SELALU` ke `tool_search` (semuanya tetap terjangkau; ini **usul**, bukan dikerjakan):

1. `calculator` — jarang jadi langkah pertama.
2. `notes_read` — bukan bagian loop inti; `notes_write` pun sudah via cari.
3. `lsp_definition` — keluarganya (`lsp_symbols/references/hover/diagnostics`) sudah via cari; jadikan konsisten.
4. `skill_view` — dipakai sesekali.
5. `run_subagents` — pertahankan `run_subagent`, cukup satu pintu.
6. `bash_background` — agen bisa naik ke `bash_run` dulu; background lewat cari.

Hasil: 26 → 20 untuk kelas web, 23 → 17 untuk kelas tulis. Tool yang **harus tetap dikirim** karena itu loop inti: `read_file, write_file, edit, multi_edit, list_directory, grep, glob, bash_run, todo_write, ask_user, think, tool_search, tool_call` + 3 web (`web_fetch, browser_open, browser_read`).

Alternatif kalau Ryu memilih tidak memangkas: **naikkan target ke 24** dan hentikan pemicu exit 1 pada 26→24 (masih menyisakan 2 lebih). Tapi ini menabrak keputusan (i) yang menyebut 20, jadi **butuh keputusan manusia**.

---

## 6. Lima temuan teratas + rekomendasi

1. **Langit-langit per giliran 26 > target 20 (selisih 6).**
   *Rekomendasi:* defer 6 tool di §5 (calculator, notes_read, lsp_definition, skill_view, run_subagents, bash_background). Verifikasi ulang dengan skrip ini; harus berubah jadi `MAKS per giliran : 20 -> LULUS` (exit 0).

2. **9 tool di-route prompt tapi tidak selalu dikirim** — termasuk **`move_file` & `copy_file`** yang merupakan operasi berkas inti. Aturan `catalog.ts:520` menyebut "apa pun yang di-route prompt WAJIB ikut dikirim".
   *Rekomendasi:* untuk operasi berkas, angkat `move_file`/`copy_file` kembali ke `DIKIRIM_SELALU` (menggantikan salah satu dari daftar defer); untuk sisanya (`bash_kill`, `bash_list`, `lsp_*`, `system_browser_open`) perbarui aturan/komen agar jujur, atau keluarkan dari prompt.

3. **11 kemampuan punya rumah ganda (internal vs MCP-Rust).** Duplikasi paling tajam: `set_setting` JS vs `set_setting` Rust (nama identik).
   *Rekomendasi:* terapkan "satu kemampuan satu rumah" (keputusan iv) per baris §3; mulai dari `set_setting`.

4. **Bolong: rename simbol sadar-kode** (`replace_in_files` teks-saja; tak ada `lsp_rename`).
   *Rekomendasi:* catat sebagai kandidat; tunda sesuai kebijakan (ii). Kalau dipaksa, parameter `rename` pada tool LSP lebih murah daripada tool baru, tapi tetap belum ada tugas nyata yang gagal → **jangan kerjakan**.

5. **Angka basi yang diketik ulang di komentar** — bug kelas yang sama yang sudah ditulis di `toolGate.ts:156-161` tapi belum dibersihkan di dua tempat: `builtins.ts:323` menulis "TOOL_DIKIRIM_SELALU (17)" (sekarang 26), dan `toolGate.ts:178` menulis "40 inti + 4 web baca-saja = 44" (sekarang 56 + 6 = 62).
   *Rekomendasi:* hapus angkanya dari komentar (arahkan ke sumber turunan), seperti yang sudah dilakukan di `toolGate.ts:158-161`. Perbaikan sepele & aman — **usul saja, jangan dikerjakan**.

**Temuan sampingan (bukan 5 teratas):**
- Skrip lama (`s/d 4 Okt`) melaporkan **2 masalah palsu** pada `ingat`: (a) "tanpa handler" karena hanya membaca `builtins/web/mcp`, bukan `zephyrSelf.ts`/`zephyrIngat.ts`; (b) "bertindak tapi tidak minta izin" karena menambahkan `appWrite` ke aturan izin, sedangkan aturan katalog sendiri (`catalog.ts:407`) hanya mewajibkan `fsWrite`+`exec` (dan web `netWrite`). `ingat` sengaja `appWrite` tanpa izin (`catalog.ts:95-104`). Versi baru sudah dibetulkan; kini `0` masalah struktural.

---

## 7. Butuh keputusan manusia

1. **Target 20 vs 24.** Pertahankan 20 (pangkas 6 tool) atau naikkan? Menyentuh keputusan (i).
2. **Daftar 6 tool yang di-defer** (§5) — apakah `run_subagents`/`bash_background` boleh jadi "cari"? Ini mengubah perilaku.
3. **`move_file`/`copy_file`**: sengaja di balik pencarian, atau kelalaian? Kalau operasi berkas inti, ia harus selalu dikirim → tukar keluar dari daftar defer.
4. **Rumah tunggal untuk 11 kemampuan ganda** (§3): pilih A atau B per baris. Khususnya `set_setting` (JS vs Rust) yang namanya identik.
5. **MCP-JS 0 tool selalu dikirim** padahal prompt me-route alias-nya (`pane/sh/ssh/inspect/state/read`). Apakah dilayani `tool_search` (aman), atau aturan `catalog.ts:520` harus mengikat MCP juga?
6. **`web_search`** menyala tapi lewat pencarian — sengaja?
7. **`lsp_rename`**: tambah sekarang atau tunggu tugas nyata gagal (kebijakan ii)?

---

## 8. Lampiran: bukti & catatan metode

- **Skrip:** `scripts/audit-katalog-tool.mjs` (node ESM, stdlib saja, exit 0/1). Data angka: `scripts/grafik-tool-per-giliran.json`.
- **Region `mcp_server.rs` 263-280 = fungsi settings**, bukan daftar tool. Lokasi daftar sebenarnya: `tools_schema` **baris 514-547** (20 `tool("nama", ...)`). Diverifikasi dengan `grep -n 'tool("' src-tauri/src/mcp_server.rs`.
- **`panel.open`/`file.op` tidak ada** sebagai nama tool literal di `src/**` maupun `src-tauri/src/**`. Operasi berkas ditangani tool bawaan `read_file/write_file/edit/multi_edit/delete_file/move_file/copy_file/replace_in_files/create_directory`.
- **Harness subset TIDAK bisa dijalankan.** `node scripts/uji-subset-alat.mjs` gagal prasyarat port CDP:
  ```
  [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:9223 ... }
  ```
  Port 9223 tidak ada (`netstat` kosong). Zephyr harus jalan di mode dev dulu; sesi ini **tidak boleh** memulai app. Karena itu "bukti subset masih hijau" dari harness **belum ada** — yang ada adalah bukti prasyarat gagal, bukan kegagalan kode. Jalankan nanti saat app hidup:
  `node scripts/uji-subset-alat.mjs` (harapkan S1-S10 hijau).
- **Item 159 (baca-kode-sendiri):** `zephyr_self` ada (efek `read`, **selalu dikirim**) — agen bisa memeriksa Zephyr sendiri (setelan/log) dari sumber milik aplikasi; ditambah `tool_search`/`tool_call` untuk sisanya. **Tidak ada celah** di sini.
