# SPIKE 176 — Review diff per-hunk (terima/tolak per potongan)

Status: **rancangan (read-only)**. Klaim hasil baca berkas nyata; nomor baris disebutkan.
Klarifikasi klaim lama: konteks menyebut "review diff per-hunk **belum ada**". Setelah dibaca:
**logika per-hunk SUDAH ADA dan dipakai di panel AI**, tetapi **BELUM dipakai di panel SCM (DiffViewer)**.
Jadi fitur ini = **memindahkan pola yang sudah terbukti** dari chat AI ke viewer diff SCM, bukan mengarang dari nol.

> ⚠️ Pagar utama: **JANGAN COMMIT OTOMATIS.** Rancangan ini **hanya menyentuh working tree** (`fs_write`).
> Tidak ada satu pun jalur yang memanggil `git_stage`/`git_commit` setelah menerapkan hunk. Lihat §4.

---

## 1. Yang sudah ADA (bisa dipakai ulang)

Logika hunk (murni, teruji pakai) — `src/lib/simpleDiff.ts` (161 baris):
- `barisDiff(lama, baru) -> DiffRow[]` (14) — diff baris.
- `bagiHunk(rows) -> Hunk[]` (102) — **memecah jadi potongan (hunk)**.
- `terapkanHunk(rows, diterima: ReadonlySet<number>) -> string` (138) — **bangun isi baru dari hunk yang diterima**.
- `ringkasDiff`, `semuaHunk`, `DiffKind`, `DiffRow`, `Hunk` (ekspor lain).

Sudah dipakai di UI AI (bukti polanya jalan):
- `src/components/ai/ChatMessage.tsx` — impor `bagiHunk, barisDiff, ringkasDiff` (6); hitung total hunk (91).
- `src/components/ai/claudeCodeUi.tsx` — impor `bagiHunk, barisDiff, terapkanHunk` (2); `bagiHunk(rows)` (325);
  **`onPickHunks(terapkanHunk(rows, diterima), diterima.size)` (473)** = menerima subset hunk lalu menerapkan.

Panel SCM (tempat fitur ini akan dipasang) — `src/components/scm/DiffViewer.tsx` (117 baris):
- Menampilkan `diff.text` sebagai `<pre>` read-only (104-112) dengan pewarnaan per baris (`kindOf`, 6-25).
- Tombol `Stage`/`Unstage` (78), `Revert file` (80-92), `Close` (94) — **aksi utuh per-berkas, bukan per-hunk**.
- **Tidak** mengimpor `simpleDiff`.

Store — `src/lib/gitStore.ts`:
- `interface DiffView { path, staged, text, source?: 'git'|'history' }` (~25-31).
- `openDiff` (89), `stage` (80/226), `unstage` (81/236), `commit` (82/246); ada pengunci `busy` yang sengaja
  mencegah `commit` beradu dengan operasi indeks lain (komentar 123-158, 261-276).

Jembatan & tulis:
- `src/lib/commands.ts`: `gitStage` (838), `gitUnstage` (839), `gitDiff` (851), `gitDiffHead` (860),
  **`fsWrite` (406) → `invoke('fs_write', …)` (414)** (dengan penjaga `periksaAturanSebelumTulis`).
- Rust: `git_diff` (786), `git_stage` (492), `git_unstage` (501), `git_discard` (916),
  `git_conflict_read` (1138) (hunk konflik sudah dimodelkan di sisi Rust).

---

## 2. Yang KURANG (tepatnya)

1. **DiffViewer tidak punya UI per-hunk.** Hanya `<pre>` read-only (DiffViewer.tsx:102-113); tidak ada
   tombol terima/tolak per potongan.
2. **`simpleDiff` tidak tersambung ke SCM.** Logika hunk (simpleDiff.ts:102,138) hanya dipakai panel AI.
3. **Tidak ada penanda "berkas selesai".** Tidak ada field/Set untuk menandai berkas mana yang sudah ditinjau.
4. **`simpleDiff` bekerja pada pasangan (lama, baru), bukan pada teks unified-diff** (`diff.text` di gitStore
   adalah keluaran `git diff`). Perlu adaptor unified → `DiffRow` sebelum `bagiHunk`/`terapkanHunk` bisa dipakai.

---

## 3. Rancangan teknis minimal (React/TS)

Sasaran: viewer SCM bisa menerima/menolak **per hunk** dan menandai berkas selesai — tanpa menyentuh indeks git.

- **Berkas baru**: `src/lib/hunkUnified.ts` — adaptor murni:
  ```ts
  export function parseUnified(teksUnified: string): DiffRow[];         // header @@ -> ctx/add/del
  export function terapkanHunkKeIsi(isiLama: string, teksUnified: string, diterima: ReadonlySet<number>): string;
  ```
  `terapkanHunkKeIsi` = `parseUnified` → `bagiHunk` → `terapkanHunk` (reuse simpleDiff) → string isi berkas baru.
- **Ubah `src/components/scm/DiffViewer.tsx`**: render `bagiHunk(parseUnified(diff.text))` sebagai blok;
  tiap hunk dapat `Terima` / `Tolak`; tombol `Terapkan` memanggil `terapkanHunkKeIsi(isiLama, diff.text, diterima)`
  lalu **`cmd.fsWrite(diff.path, hasil)`** (menulis working tree saja).
- **Ubah `src/lib/gitStore.ts`**: tambah `diffDiterima: Set<number>` (pilihan hunk untuk `diff.path`) dan
  `berkasSelesai: Set<string>` (penanda "sudah ditinjau"), plus aksi `tandaiSelesai(path)` / `resetPilihan()`.
  **Tidak** menambah aksi commit apa pun.
- **Alur**: terapkan hunk yang diterima → refresh `openDiff(diff.path)` (muat ulang diff dari working tree) →
  user menandai berkas selesai. `Stage`/`Commit` tetap **aksi manual** yang sudah ada (DiffViewer.tsx:72-79).
- **Bentuk data** (usul): `{ path: string; hunkDiterima: Set<number>; selesai: boolean }`.
- **Perintah Rust baru**: tidak ada. **Izin baru**: tidak ada (memakai `fs_write` yang sudah ada).

---

## 4. Risiko + hal yang butuh webview/izin baru

- **PAGAR COMMIT OTOMATIS (paling penting).** Menerapkan hunk **TIDAK** boleh menyentuh indeks. Mitigasi keras:
  modul penerap (`hunkUnified.ts` + handler tombol) **dilarang** mengimpor `gitStage`/`gitUnstage`/`gitCommit`
  dari `commands.ts`. Ini **bisa diperiksa otomatis** (§6, Uji C). Karena diff bisa `staged: true` (gitStore),
  terapkan pada diff staged harus ditolak/dinonaktifkan, kalau tidak maknanya ambigu.
- **`git diff` bukan pasangan (lama, baru).** Untuk berkas BARU (`+++ /dev/null`) atau yang dihapus, "isi lama"
  tidak ada di diff. Mitigasi: baca isi lama via reader yang ada (baca berkas) sebelum menerapkan; tolak hunk
  untuk berkas biner (`Binary file`, DiffViewer.tsx:42).
- **Rendering diff parsial.** DiffViewer.tsx:102-113 merender per baris; menambah tombol per-hunk berarti
  merombak struktur `<pre>` menjadi blok. Jaga kontras/tema yang sudah ada (`is-add`/`is-del`/`is-hunk`).
- **Aksi beradu.** `busy` (gitStore) sudah mencegah commit beradu; penerapan hunk juga harus menghormati `busy`
  dan menonaktifkan tombol saat sibuk.
- **Tidak ada izin/webview baru.** Ini sepenuhnya UI + tulis berkas.

---

## 5. Langkah pertama yang paling kecil & bisa dibuktikan (<= 1 berkas)

**1 berkas baru: `src/lib/hunkUnified.ts`** berisi `parseUnified(teksUnified) -> DiffRow[]` (murni, tanpa impor
Tauri/React). Langsung bisa diuji lewat harness Node (§6) tanpa menyentuh UI. `terapkanHunkKeIsi` menyusul
sebagai fungsi ke-2 di berkas yang sama (masih 1 berkas).

## 6. Ukuran "jadi" yang bisa diuji (tanpa model, tanpa git nyata)

Harness Node (`.mjs`) mentranspilasi modul murni via `node_modules/.bin/esbuild` (esbuild = bawaan vite),
lalu:

- **Uji A (parse):** diberi teks unified 2 hunk, `parseUnified` mengembalikan `DiffRow[]` dengan jumlah
  `add`/`del` tepat dan posisi `@@` benar.
- **Uji B (terapkan sebagian):** terima hunk-1, tolak hunk-2 → `terapkanHunkKeIsi` menghasilkan isi berkas
  yang **sama persis** dengan hasil yang diharapkan (perbandingan string).
- **Uji C (PAGAR COMMIT):** harness membaca teks `src/components/scm/DiffViewer.tsx` + `src/lib/hunkUnified.ts`
  dan **GAGAL** bila ada referensi `gitStage|gitUnstage|gitCommit|gitCommitWithAi` di jalur penerapan hunk.
  Ini mengunci pagar "jangan commit otomatis" jadi bisa diuji, bukan sekadar janji.
- **Uji D (penanda selesai):** menandai `path` di `berkasSelesai` membuat `openDiff` lain tetap membuka diff-nya
  (penanda tidak menyembunyikan diff) — invarian state.
- `npx tsc --noEmit` dari `D:/Zephyr` tetap **0 error**.
  Catatan (diukur 2026-10-14): repo **belum** 0 error — 3 error sudah ada di
  `src/lib/zephyrTools/kendaliJendela.ts` (di luar lane ini). Perbaiki dulu.
