# Laporan: git worktree dari Zephyr (sisi Rust + tool model)

Item kanonik `zeph-git-worktree` — tambahan Ryu 2026-10-14 (poin 6 agen lain:
"Git worktree: bikin checkout paralel"): buat/daftar/hapus git worktree dari
dalam Zephyr supaya kerja paralel di beberapa cabang tidak saling mengganggu.

Lingkup pekerjaan ini: **sisi Rust + tool untuk model + harness + dokumen**.
UI **tidak** dikerjakan (komponen sedang dipakai lane lain) — usulannya ada di
`docs/USULAN-WORKTREE-UI.md`.

Cabang: `feat/ai-panel-vscode-layout`. Tanggal: 2026-10-14.

---

## 1. Berkas

| Berkas | Status | Isi |
| --- | --- | --- |
| `src-tauri/src/worktree.rs` | BARU | 3 command Tauri + inti yang bisa diuji + 14 unit test |
| `src-tauri/src/lib.rs` | DIUBAH (tambahan saja) | baris 72 `mod worktree;`; baris 423-425 tiga entri `generate_handler!` |
| `src/lib/zephyrTools/worktree.ts` | BARU | `TOOL_WORKTREE: AgentTool[]` — tiga tool model |
| `scripts/uji-worktree.mjs` | BARU | harness node-only, 14 kasus |
| `docs/LAPORAN-GIT-WORKTREE.md` | BARU | berkas ini |
| `docs/USULAN-WORKTREE-UI.md` | BARU | usulan UI (belum dikerjakan) |

Tidak ada berkas lain yang disentuh. `src-tauri/src/git.rs` **tidak** diubah:
`git_worktree_list/add/remove/prune` yang lama tetap apa adanya, dan versi baru
ini melengkapinya (root eksplisit, tidak melempar) — lihat §3.

---

## 2. API perintah

Ketiganya selalu mengembalikan `{berhasil: bool, pesan: string, data: object|null}`
dan **tidak pernah** `Err` untuk kesalahan pemakaian. Saat gagal `data` adalah
`null`, jadi "tidak ada data" tidak bisa salah dibaca sebagai "berhasil kosong".

### `worktree_list(root: string) -> Hasil`

`data`: `{ akar, jumlah, worktree: [{ path, branch, head, bare, detached, locked,
prunable, isMain }] }` (entri memakai `GitWorktree` dari `git.rs`, jadi bentuknya
sama dengan UI lama).

### `worktree_add(root, path, branch?, buatCabang?) -> Hasil`

`buatCabang=true` berarti `git worktree add -b <branch> <path> HEAD`; `false`
(atau tidak dikirim) berarti `git worktree add <path> <branch>` (branch harus
sudah ada). `data`: `{ akar, path, branch, buatCabang }`.

### `worktree_remove(root, path, paksa?) -> Hasil`

`data`: `{ akar, path, paksa, branch, masih_ada_di_disk }`.

Pemetaan nama argumen: `#[tauri::command]` menerjemahkan ke camelCase, jadi TS
mengirim `buatCabang` untuk `buat_cabang` — sama seperti `createBranch` pada
`git_worktree_add` lama.

---

## 3. Kenapa berkas baru, bukan menambah ke `git.rs`

Tiga command lama bekerja untuk **jendela**: menerima `State<AppState>` (workspace
yang sedang terbuka), mengembalikan `ZResult`, dan kesalahan pemakaian datang
sebagai `Err` yang ditampilkan UI sebagai toast.

Model tidak bisa memakai bentuk itu dengan aman: satu argumen salah membuat
panggilan tool GAGAL, dan model tidak bisa membedakan "git menolak karena
worktree kotor" dari "IPC putus". Versi baru karena itu:

1. menerima `root` **eksplisit** — bisa diuji tanpa menjalankan app, dan bisa
   dipakai untuk repo mana pun yang sudah diverifikasi;
2. selalu mengembalikan `{berhasil, pesan, data}` — penolakan sampai ke model
   sebagai **kalimat**, sehingga ia bisa memperbaiki argumennya sendiri;
3. memeriksa sendiri syarat yang tidak boleh diserahkan ke git (jalur relatif,
   `..`, root bukan akar repo, worktree kotor).

---

## 4. Batas keamanan dan alasannya

| Batas | Alasan |
| --- | --- |
| **Tanpa shell** — `git` dijalankan lewat `crate::proc::cmd("git")` dengan **array argumen**, bukan string | Nama branch/jalur yang memuat spasi, `;`, `&&`, kutip, atau `$` tidak ditafsirkan siapa pun. Tidak ada `sh -c` di jalur ini. |
| **Root harus akar repo nyata** — `git rev-parse --show-toplevel` dijalankan di dalam root, hasilnya harus **sama** dengan root itu | Menyebut folder biasa atau **subfolder** repo ditolak dengan pesan yang menyebut akar yang benar, sehingga model dikoreksi alih-alih operasi menyerempet repo induk. |
| **Jalur worktree harus absolut** | Jalur relatif artinya bergantung cwd **proses Zephyr**, bukan root — dua makna berbeda untuk satu teks. |
| **Jalur tidak boleh memuat `..`** (dan tidak boleh memuat byte NUL) | Menutup jalan keluar dari folder yang dimaksud tanpa perlu menebak-nebak kanonikalisasi. |
| **Worktree baru harus di luar repo** (`is_inside` dari `paths.rs`) | Checkout di dalam working tree bikin repo kotor; git sendiri menolaknya, tapi pesannya tidak menjelaskan apa yang salah. |
| **Folder target tidak boleh sudah ada** | `worktree add` tidak menimpa; lebih baik ditolak di depan daripada meninggalkan sisa. |
| **Nama branch divalidasi git** (`check-ref-format --branch`) | Aturan nama ref milik git, bukan daftar karakter karangan sendiri. |
| **Hapus: hanya worktree yang terdaftar pada root itu** | Daftar itu sekaligus menjadi batas "di luar root": repo lain yang kebetulan ada di sebelahnya tidak punya jalan masuk. |
| **Hapus: worktree UTAMA ditolak** | Checkout utama tidak pernah dihapus. |
| **Hapus: worktree kotor ditolak** (`git status --porcelain --untracked-files=all`) | Termasuk berkas **BARU** yang belum pernah di-commit. Perubahan itu milik orang, bukan milik tool. |
| **Hapus: status tidak terbaca = penghapusan DIBATALKAN** (gagal-tertutup) | Menghapus karena "tidak bisa memeriksa" = menghapus pekerjaan orang. Pesannya menyebut `paksa=true` sebagai jalan sadar. |
| **`paksa=true` diteruskan ke `git worktree remove --force`** | Satu-satunya jalan melewati pemeriksaan kotor — eksplisit, bukan bawaan. |
| **Batas waktu 60 detik + proses dimatikan** (`taskkill /T /F` di Windows) | `worktree add` pada repo besar bisa lama; panggilan yang menggantung tak berujung lebih buruk. |
| **Env git dipaku**: `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, `LC_ALL=C`, stdin `null` | Tidak ada prompt kredensial yang menggantung, tidak ada pager yang menunggu tombol, keluaran stabil untuk diparse. |
| **Pesan git dipadatkan** (maks 6 baris / 400 karakter, pemotongan dikatakan) | Penolakan tetap terbaca model, bukan tembok teks. |
| **Sisi TS tidak memeriksa jalur dan tidak menyentuh berkas** | Berkas TS bisa dilewati model lewat prompt; command Rust tidak. Seluruh penjagaan ada di Rust. |

---

## 5. Uji

### 5.1 Rust — `cargo test --lib worktree::` → **14 lulus / 0 gagal**

Kasus (semua di `src-tauri/src/worktree.rs`, modul `tests`):

1. `tolak_root_bukan_repo` — folder biasa bukan repo.
2. `tolak_root_kosong_relatif_dan_titik_titik` — root kosong, relatif, `..`.
3. `tolak_root_subfolder_repo` — subfolder ditolak, pesan menyebut akar benar.
4. `tolak_jalur_relatif_dan_titik_titik` — jalur relatif dan `..`.
5. `tolak_jalur_di_dalam_repo` — checkout di dalam repo, dan tidak ada folder sisa.
6. `tolak_branch_kosong_dan_tidak_sah` — branch kosong dan nama tak sah.
7. `tolak_folder_target_sudah_ada` — tidak menimpa folder.
8. `gagal_tidak_mengaku_berhasil` — bentuk gagal: `berhasil=false`, `pesan` terisi, `data=null`, dan dua penolakan **berbeda** pesannya.
9. `tolak_hapus_bukan_worktree_terdaftar_dan_worktree_utama` — hapus repo lain tidak menyentuh repo itu.
10. `nyata_daftar_repo_mini_menyebut_worktree_utama` — repo mini `git init` di folder sementara.
11. `nyata_buat_daftar_hapus_bersih` — siklus buat → daftar → hapus bersih.
12. `nyata_tolak_hapus_dengan_perubahan_tanpa_paksa` — perubahan + berkas baru tetap utuh.
13. `nyata_paksa_menghapus_perubahan` — `paksa=true` menghapus, dan `data.paksa == true`.
14. `contoh_keluaran_nyata_tiga_perintah` — mencetak pesan asli tiga perintah (lihat §6).

Uji nyata memakai **repo git mini buatan sendiri** di folder sementara
(`git init` + satu commit, identitas diisi via `-c user.name/user.email`,
`commit.gpgsign=false`), bukan repo Zephyr; folder dibersihkan oleh guard `Drop`
(termasuk saat panic).

### 5.2 Harness node-only — `node scripts/uji-worktree.mjs` → **14 lulus / 0 gagal (exit 0)**

`worktree.ts` dibundel dengan esbuild; `@tauri-apps/api/core` dan `../store`
diganti stub, sehingga **argumen yang benar-benar dikirim ke `invoke` direkam**.

1. tiga tool terdaftar, nama unik, urut daftar/buat/hapus;
2. nama tidak bentrok dengan tool lain di folder itu;
3. skema argumen benar (wajib, tipe, tanpa parameter jaringan);
4. `daftar` mengirim **persis** `{root}`;
5. `daftar` — keluaran memuat pesan Rust + jalur + cabang tiap worktree;
6. `daftar` tanpa `root` memakai folder proyek terbuka; tanpa folder → ditolak, invoke tidak dipanggil;
7. `buat` tanpa cabang mengirim `buatCabang=false`, tanpa field asing;
8. `buat` dengan cabang mengirim `buatCabang=true`; nilai ambigu (`'ya'`) jadi `false`;
9. `hapus` — `paksa` tersampaikan; bawaan `paksa=false`;
10. galat Rust `{berhasil:false, pesan}` muncul **apa adanya** di ketiga tool;
11. balasan tak dikenal ditolak, tidak dianggap berhasil;
12. argumen wajib hilang ditolak **sebelum** invoke;
13. jumlah nama tool di berkas lain tetap seperti baseline (`builtins 41`, `mcp 14`, `web 11`, `zephyrSelf 1`, `zephyrIngat 1` = 68);
14. total tool: tool lain tidak berubah, `worktree.ts` menambah 3.

---

## 6. Keluaran nyata tiap perintah + exit

Semua keluaran di bawah adalah keluaran yang **benar-benar dijalankan**.

### `cd src-tauri && cargo test --lib worktree::` → exit 0

```
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 490 filtered out; finished in 10.64s
```

### `cd src-tauri && cargo test --lib` → exit 0 (baseline tidak turun)

```
test result: ok. 504 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.19s
```

490 sebelum + 14 uji baru = 504. Tidak ada uji lama yang hilang atau gagal.

### `cd src-tauri && cargo test --lib worktree::tests::contoh_keluaran_nyata_tiga_perintah -- --nocapture` → exit 0

(Ini lari nyata di repo git mini di folder sementara; jalur dipenggal supaya
terbaca.)

```
worktree_list(root=...\zephyr-uji-wt-59720-contoh) -> {berhasil:true, pesan:"1 worktree terdaftar untuk ...\zephyr-uji-wt-59720-contoh"}
worktree_add(path=...\zephyr-uji-wt-59720-contoh-wt-contoh) -> {berhasil:true, pesan:"worktree dibuat: ...\zephyr-uji-wt-59720-contoh-wt-contoh (branch contoh-cabang)"}
worktree_remove(path=...\zephyr-uji-wt-59720-contoh-wt-contoh) -> {berhasil:true, pesan:"worktree dihapus: ...\zephyr-uji-wt-59720-contoh-wt-contoh"}
worktree_remove(kotor) -> {berhasil:false, pesan:"worktree masih punya perubahan/BERKAS BARU yang belum di-commit: ...\zephyr-uji-wt-59720-contoh-kotor-wt-contoh-kotor - commit atau buang dulu, atau kirim paksa=true kalau memang mau dihapus"}
```

Perhatikan dua hal: `worktree_remove` bersih **berhasil tanpa paksa**, sedangkan
worktree kotor gagal dengan kalimat yang menyebut langkah berikutnya — bukan
"gagal".

### `node scripts/uji-worktree.mjs` → exit 0

```
== uji-worktree: D:\Zephyr\src\lib\zephyrTools\worktree.ts ==

  LULUS  01. tiga tool terdaftar, nama unik, urut daftar/buat/hapus
  LULUS  02. nama tool tidak bentrok dengan tool lain di folder itu
  LULUS  03. skema argumen benar: wajib, tipe, tanpa parameter jaringan
  LULUS  04. daftar: invoke menerima perintah + argumen {root} SAJA
  LULUS  05. daftar: keluaran memuat pesan Rust + jalur + cabang tiap worktree
  LULUS  06. daftar tanpa root: memakai folder proyek terbuka; tanpa folder ditolak
  LULUS  07. buat tanpa cabang: mengirim buatCabang=false, tanpa field asing
  LULUS  08. buat dengan cabang: buatCabang=true; nilai ambigu jadi false
  LULUS  09. hapus: paksa tersampaikan; bawaan paksa=false
  LULUS  10. galat Rust {berhasil:false,pesan} muncul APA ADANYA di ketiga tool
  LULUS  11. balasan Rust tak dikenal ditolak, tidak dianggap berhasil
  LULUS  12. argumen wajib hilang ditolak SEBELUM invoke
  LULUS  13. jumlah nama tool di berkas lain tetap seperti baseline
         tool lain: 68 sebelum, 68 sesudah (sama); +3 dari worktree.ts = 71 total
  LULUS  14. total tool: tool lain tidak berubah, worktree.ts menambah 3

14 lulus / 0 gagal dari 14 kasus
```

### `npx tsc --noEmit` (tsc 5.9.3) → exit 0

```
EXIT_TSC=0
--- baris keluaran: 0 ---
```

0 baris keluaran = 0 galat.

---

## 7. Yang BELUM

- **UI**: belum ada. Komponen sedang dipakai lane lain, jadi hanya usulan:
  `docs/USULAN-WORKTREE-UI.md`.
- **Pemanggilan dari palet perintah**: belum. `worktree.ts` diekspor sebagai
  `TOOL_WORKTREE: AgentTool[]` mengikuti pola `TOOL_BAWAAN`/`TOOL_SELF`/
  `TOOL_INGAT`, tetapi wiring ke katalog tool (`catalog.ts`/`mcp.ts`) belum
  dilakukan — berkas itu di luar kepemilikan lane ini dan sedang disentuh lane
  lain. Harness membundel modul ini **sendiri**, jadi pengujian sisi model tidak
  menunggu wiring itu.
- **e2e di app hidup** (`invoke` sungguhan dari UI/model ke command Rust):
  **BUTUH APP**. Yang sudah diuji adalah inti Rust (unit + lari nyata di repo
  mini) dan pemetaan sisi TS (harness dengan stub `invoke`). Sambungan ketiganya
  — jendela Tauri memanggil `worktree_list` sungguhan — belum dijalankan.
- **`mcp__zephyr__worktree`** masih ada sebagai stub lama di
  `src/lib/zephyrTools/mcp.ts:511-531`. Tidak dihapus: berkas itu bukan milik
  lane ini. Tool baru sengaja memakai nama tanpa awalan `mcp__zephyr__` supaya
  tidak bentrok.
