# BUGLOG — Zephyr

Catatan bug yang ditemukan lewat audit fase demi fase: gejala yang terlihat
user, akar masalahnya, perbaikan yang dilakukan, dan cara membuktikannya.
Bug yang ditemukan tapi TIDAK diperbaiki juga dicatat, dengan alasannya.

---

## Fase 15 — Bugfix Vol 1 (audit fitur fase 02–14)

Status verifikasi: perbaikan sudah masuk kode, `npx tsc --noEmit` 0 error,
`cargo test --lib` lulus. **Harness `verify15.mjs` belum dibuat**, jadi kolom
Verifikasi di bawah menyebut cara membuktikannya, bukan klaim sudah terbukti.
Yang sudah terbukti otomatis ditandai eksplisit.

### 15.1 Editor

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 1 | File UTF-16 tampil sebagai teks berlubang `h.a.l.o.` | `decode_bytes` hanya mengenal BOM UTF-8; byte `FF FE` bukan UTF-8 valid sehingga jatuh ke fallback Windows-1252 | `fs_utils.rs`: cek BOM `FF FE`/`FE FF` **sebelum** UTF-8, decode lewat `encoding_rs::UTF_16LE/BE`; `Encoding` menambah `utf16le`/`utf16be` | Buat file UTF-16 dari luar → buka → isi terbaca utuh, status bar menampilkan encoding UTF-16 |
| 2 | JSON 5MB membekukan editor beberapa detik saat dibuka | Semua ekstensi CodeMirror yang bekerja per-dokumen aktif: `bracketMatching`, `autocompletion`, `highlightSelectionMatches`, `indentOnInput`, plus parser Lezer penuh | `ReadResult` membawa `readOnly/bytes/note` dari Rust (batas `BIG_FILE_BYTES = 4MB`); `CodeMirrorEditor` melepas ekstensi berat + parser dan memasang `EditorState.readOnly` saat `tab.readOnly` | Buka file >4MB → banner "mode baca-saja ringan" muncul, scroll mulus, `__ZEPHYR_BUG__.cmEditable().editable === false` |
| 3 | File tab dihapus dari luar (git checkout / hapus manual), Ctrl+S diam-diam membuat file baru — user tidak tahu file aslinya lenyap | `fs_write` tidak pernah membedakan "file baru" dari "file yang tadinya ada" | `fs_write` menerima `wasExisting`/`allowMissing`; tab yang dibaca dari disk membawa `existed:true`; Rust menolak `NotFound`, `saveTab` memunculkan dialog `SaveIssueDialog` "buat baru?" | Buka file → hapus dari luar → Ctrl+S → dialog muncul; pilih Batal → file tetap tidak ada |
| 4 | Find dengan regex `a+` / `a*` di file besar menggantung UI | `text.match(/…/g)` mengumpulkan **semua** match sekaligus; regex yang cocok dengan string kosong juga tidak memajukan `lastIndex` | `FindBar`: iterasi `re.exec` manual dengan batas 20.000 langkah + `lastIndex++` untuk match kosong; UI menampilkan "20.000+ hasil (dihentikan)" | Buka file besar, aktifkan regex, ketik `a*` → UI tetap responsif, label batas muncul |
| 5 | File diubah dari luar → tab reload, tapi undo history & posisi kursor hilang | `useEffect` mengganti seluruh dokumen tanpa `selection`, kursor jatuh ke awal file | Transaksi tetap satu `dispatch` (history CM6 utuh) + `selection` dipertahankan dan di-clamp ke panjang baru | Edit file dari luar saat tab terbuka & tidak dirty → kursor tetap, Ctrl+Z masih bekerja |
| 6 | Tab read-only bisa ditandai `unsaved` walau isinya tak bisa disimpan | `updateTabContent` tidak memeriksa `readOnly` | Guard `&& !t.readOnly` di `updateTabContent` | Buka file UTF-16 → coba ketik → tidak ada tanda dirty |

### 15.2 Terminal

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 7 | Paste teks 10KB ke terminal: karakter teracak / potongan akhir hilang | Satu `pty_write` 10KB melebihi buffer input ConPTY | `terminalClipboard.writeChunked()` memecah 4KB + jeda 8ms per potongan; `pasteInto` dan `aiStore.runInTerminal` memakainya | Paste 10KB → jumlah karakter di buffer terminal sama dengan yang dikirim |
| 8 | Pane agent selesai (opencode exit) → pane diam, user tidak tahu prosesnya sudah mati | `pty-exit` hanya mengirim `{id}`; exit code tidak pernah diambil | `pty.rs` memindahkan `child` ke thread emit lalu `child.wait()` → `pty-exit {id, code}`; App.tsx menulis `[process exited code N]` ke layar pane, `PaneMeta.exitCode` terisi | Jalankan `cmd /c exit 3` di pane → baris `[process exited code 3]` tampil |
| 9 | Menutup 6 pane cepat: toast error "sesi tidak ditemukan", xterm double-dispose | `closePane` bisa dipanggil dua kali untuk pane yang sama sebelum `pty_kill` pertama selesai | Guard `closing: Set<string>` di luar store, dibersihkan di akhir | Tutup 6 pane bertubi-tubi → 0 pane hantu, `pty_list` kosong, tidak ada toast error |
| 10 | Private terminal: perintah bash/WSL masih tercatat di history disk | `-HistorySaveStyle SaveNothing` hanya berlaku untuk PowerShell; shell POSIX membaca `HISTFILE`/`HISTSIZE` | `pty_spawn` menyetel `HISTFILE=""`, `HISTSIZE=0`, `HISTFILESIZE=0`, `HISTCONTROL=ignoreboth` untuk `kind == "private"` | Jalankan bash di pane private → `echo $HISTSIZE` = 0, `~/.bash_history` tidak bertambah |

### 15.3 Git

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 11 | Diff file PNG menampilkan baris `Binary files a/x.png and b/x.png differ` sebagai baris konteks biasa — terlihat seperti diff kosong | `git_diff` melempar output git apa adanya; `kindOf()` di viewer menandainya `ctx` | `git.rs::binary_diff_note()` mengganti output dengan blok berlabel + ukuran file; `DiffViewer` mengenali prefix `Binary file` sebagai `meta` dan menampilkan badge `binary file` | Ubah PNG di repo → buka diff → badge `binary file` + ukuran, tidak ada byte mentah di DOM |
| 12 | Push saat remote lebih baru: git menolak dengan pesan mentah non-fast-forward, user harus menebak | `push()` langsung memanggil `git push` tanpa melihat `status.behind` | `gitStore.push()` memeriksa `behind > 0`: dengan `pullBeforePush` → dialog `pull-first` ("Pull lalu push"), tanpa setting itu → pesan jelas "pull dulu" | Repo dengan `behind ≥ 1` → klik Push → dialog muncul, bukan error git |
| 13 | Validator nama branch meloloskan nama yang pasti ditolak git (`a^b`, `x:y`, `feat/`, `a.lock`) sehingga error datang dari git dengan bahasa asing | `valid_branch_name` hanya menolak prefix `-`, `..`, spasi, `~` | Tambah penolakan `^ : ? * [ \`, leading/trailing `/`, `//`, akhiran `.lock`, akhiran `.` — `/` di tengah **tetap** diizinkan | `git_create_branch("feat/ui")` berhasil; `("x:y")` → `InvalidInput` dari Zephyr |

Catatan audit yang **tidak** berubah karena sudah benar: branch dengan slash
(`feat/ui`) memang sudah bekerja di dropdown sejak fase 10 (parser hanya
memisah prefix `origin/`), dan commit dengan pesan kosong sudah diblokir dua
lapis — `canCommit` di UI dan `ZephyrError::InvalidInput` di `git_commit`.
Rename detection `porcelain=v2` record `2 ` juga sudah menghasilkan status `R`.

### 15.4 MCP

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 14 | `editor_write` dengan payload puluhan MB bisa menghabiskan memori proses render | Tidak ada batas ukuran sama sekali di jalur MCP | `MAX_EDITOR_WRITE = 1MB` untuk `editor_write` + `editor_insert`, ditolak di Rust sebelum menyentuh IPC | RPC `editor_write` 2MB → error `-32602` menyebut batas 1MB, app tetap hidup |
| 15 | `terminal_write` megabyte dalam satu panggilan membuat shell tersedak | Sama: tanpa batas | `MAX_TERMINAL_WRITE = 64KB` | RPC `terminal_write` 128KB → error terstruktur |
| 16 | Mematikan MCP saat ada permintaan berjalan → agent menggantung sampai `UI_TIMEOUT` 8 detik | `stop()` hanya menutup socket; `mcp_pending` dibiarkan menunggu jawaban UI yang tidak akan datang | `AppState::mcp_fail_pending()` menjawab semua penunggu dengan error terstruktur; dipanggil dari `mcp_server::stop()` + dicatat ke log | Panggil method lambat lalu matikan MCP → balasan JSON-RPC error, bukan hang |

Concurrency dua `terminal_write` bersamaan sudah aman sejak fase 11: setiap
permintaan JSON-RPC memegang `state.mcp_lock()` di `handle_one`, jadi byte dua
agent tidak bisa saling menyelip. Ini didokumentasikan sebagai komentar di
`dispatch` supaya tidak "dioptimasi" hilang. Token auth juga tidak pernah
masuk log: tidak ada satu pun `tracing::*` di `mcp_server.rs` yang menyentuh
header, dan `get_settings` me-mask `mcp.token`.

### 15.5 AI Panel

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 17 | Pesan >8KB dikirim utuh → provider membalas 400/limit, user tidak tahu kenapa | Tidak ada batas panjang pesan user | `MSG_LIMIT = 8KB` di `aiStore.send()`: pesan dipotong + catatan `[dipotong: … karakter]` di isi pesan dan toast | Kirim 20KB → toast "dipotong", pesan terkirim, jawaban datang |
| 18 | Blok kode panjang dari jawaban AI korup saat dikirim ke terminal | `runInTerminal` memakai `ptyWrite` sekali jalan | Lewat `writeChunked` (4KB) | "Jalankan di Terminal" untuk blok >4KB → perintah utuh di shell |

Sudah benar sejak fase 09 dan tidak diubah: cancel streaming tidak
meninggalkan "mengetik…" (flag `streaming:false` + `Set` id yang dibatalkan
menyaring chunk yang masih di jalan), error 401 muncul sebagai bubble error di
area chat (`friendly(status)` di `ai.rs` → `ai-error`), tombol copy code block
lewat `clipboard-manager`, dan lampiran file dipotong di 12KB dengan catatan.

### 15.6 Shell / UI

| # | Gejala | Akar | Fix | Verifikasi |
|---|--------|------|-----|------------|
| 19 | RAM di status bar menampilkan `--` beberapa detik setelah start; rentan `NaN` | Angka hanya datang dari event `ram-usage` yang emit-nya berkala | Baca `get_diagnostics()` sekali pada 300ms + guard `Number.isFinite` | Start app → dalam <1s status bar menampilkan angka MB, tidak pernah `NaN` |
| 20 | Jendela dikecilkan ke minimum 800×520: sidebar + editor + panel berebut ruang, muncul scrollbar horizontal | Tidak ada breakpoint apa pun di layout | `App.tsx` melipat sidebar otomatis di <1000px (dengan flag `autoCollapsed` supaya sidebar yang ditutup **user** tidak dibuka sendiri) + kelas `body.is-narrow` di `index.css` membatasi lebar sidebar/palette dan menyembunyikan item status bar paling tidak penting | Resize ke 800×520 → tidak ada scrollbar horizontal, editor tetap terbaca; lebarkan lagi → sidebar kembali |

Command palette dengan 5.000 item sudah ter-virtualisasi sejak fase 12
(`WINDOW = 40` baris + spacer), jadi hanya ~40 node yang benar-benar dirender.
Drag file dari Explorer dengan spasi di path juga sudah benar: path datang
sebagai array dari `onDragDropEvent`, tidak pernah lewat string shell.

---

### Sisa pekerjaan fase 15

1. `scripts/verify15.mjs` — harness CDP untuk membuktikan item di atas di app
   hidup (belum dibuat).
2. Smoke regresi fase 03 (open/save), 06 (agent pane), 10 (commit),
   11 (MCP health) setelah perubahan ini.
