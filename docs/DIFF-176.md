# DIFF-176 — review diff per potongan (hunk): terima/tolak per hunk, status selesai per berkas

Lane item 176. Modul murni + harness tanpa aplikasi hidup + penyambungan ke satu
tampilan diff yang sudah ada. Rancangan awal ada di
`docs/SPIKE-176-review-diff-per-hunk.md`; dokumen ini adalah hasil nyatanya.

Aturan yang tidak boleh dilanggar dan diuji di harness: **tidak ada jalur yang
otomatis menjalankan aksi indeks (tahap/commit)**. Yang ditulis jalur ini hanya
berkas kerja.

---

## 1. Apa yang sudah ada sebelum lane ini

| Berkas | Baris | Isi |
| --- | --- | --- |
| `src/lib/simpleDiff.ts` | 1 / 3 | `DiffKind` = `same \| add \| del`, `DiffRow` (`a`, `b`, `kind`, `teks`) |
| `src/lib/simpleDiff.ts` | 12 | `AMBANG = 4000` — fast-path untuk teks besar |
| `src/lib/simpleDiff.ts` | 14 | `barisDiff(lama, baru) → DiffRow[]` |
| `src/lib/simpleDiff.ts` | 59 | `ringkasDiff(rows) → { tambah, hapus }` |
| `src/lib/simpleDiff.ts` | 86 / 102 | `Hunk`, `bagiHunk(rows) → Hunk[]` (hunk = kelompok baris berurutan) |
| `src/lib/simpleDiff.ts` | 138 / 159 | `terapkanHunk(rows, diterima)`, `semuaHunk(hunks)` |
| `src/components/scm/DiffViewer.tsx` | 1–117 (sebelum) | viewer **read-only**: `<pre data-testid="diff-pre">` berisi `.diff-line is-add/is-del/is-hunk/is-meta`, plus tombol Stage/Unstage/Revert/Close |
| `src/lib/gitStore.ts` | — | `openDiff`, `closeDiff`, `refreshAll`, dan `diff: { path, text, staged, source }` |
| `src/lib/commands.ts` | — | `fsRead(path) → ReadResult { content, detectedEncoding, lineEnding, readOnly, bytes, note }`, `fsWrite(path, isi, encoding, lineEnding, { wasExisting })` |
| `src-tauri/src/git.rs` | 786 | `git_diff(path, staged)` → `git diff --no-color -- <path>` (sisi lama = **indeks**, sisi baru = berkas kerja) atau `--cached` (HEAD → indeks) |

Jadi hunk sudah ada, tapi hanya sebagai pembagian baris: tidak ada keputusan
per potongan, tidak ada status selesai per berkas, tidak ada pembacaan teks
unified-diff, dan tidak ada gating keamanan.

## 2. Yang kurang sebelum lane ini

1. **Keputusan per potongan** — `bagiHunk` menghasilkan daftar hunk, tetapi tidak ada tempat menyimpan "hunk #2 diterima, hunk #3 ditolak".
2. **Status per berkas** — tidak ada yang bisa menjawab "berkas mana yang sudah selesai" untuk sekumpulan berkas.
3. **Applier dari teks unified** — panel SCM hanya punya `diff.text` (teks unified), bukan sepasang isi lama/baru, jadi tidak bisa memakai `terapkanHunk` yang berbasis kepemilikan baris.
4. **Fidelitas akhir baris** — `\ No newline at end of file` diabaikan; berkas hasil kehilangan/kelebihan newline terakhir.
5. **Pagar no-auto-commit** — tidak ada uji yang membaca berkas nyata untuk memastikan jalur terapkan tidak menyentuh indeks.
6. **Tampilan** — DiffViewer hanya menampilkan; tidak ada tombol terima/tolak per potongan.

## 3. Berkas lane ini

| Berkas | Status | Isi |
| --- | --- | --- |
| `src/lib/hunkUnified.ts` | BARU (683 baris) | modul murni: tanpa React, tanpa Tauri, tanpa store, tanpa I/O |
| `scripts/uji-hunk.mjs` | BARU (677 baris) | 21 kasus memakai modul asli + pemeriksaan pagar dari berkas nyata |
| `src/components/scm/DiffViewer.tsx` | +179 / −0 baris | penyambungan panel potongan (baris **1–7** impor, **41–57** hook, **78** gerbang `bolehTerap`, **83–132** daerah pagar, **198–296** panel) |
| `src/styles/scm.css` | +181 / −0 baris | kelas `.diff-hunks` (545), `.diff-hunk` (576), `.diff-hunk-line` (612) |
| `docs/DIFF-176.md` | BARU | dokumen ini |

Tidak ada berkas milik lane lain yang disentuh, dan **tidak ada usulan tambalan
ke lane lain** — penyambungan cukup di satu berkas tampilan diff.

## 4. Bentuk data hunk

```ts
export type JenisBaris = 'konteks' | 'tambah' | 'hapus';
export type StatusHunk = 'belum' | 'terima' | 'tolak';
export type Sisi = 'lama' | 'baru';

/** keputusan per hunk, dikunci HunkReview.id; hunk yang tidak ada di peta = 'belum' */
export type PetaStatus = Readonly<Record<number, StatusHunk>>;

export interface BarisHunk {
  jenis: JenisBaris;
  teks: string;
  nomorLama: number | null; // null = baris ini tidak ada di sisi lama
  nomorBaru: number | null;
}

export interface HunkReview {
  id: number;
  mulaiLama: number | null;   // null bila hunk murni penambahan
  jumlahLama: number;
  mulaiBaru: number | null;
  jumlahBaru: number;
  tambah: number;
  hapus: number;
  status: StatusHunk;
  baris: BarisHunk[];
}
```

**Dua jalan masuk, satu arti** (baris ekspor di `src/lib/hunkUnified.ts`):

| Fungsi | Baris | Kapan dipakai |
| --- | --- | --- |
| `hunkDariDuaTeks(lama, baru, status?)` | 403 | pemanggil punya kedua isi (memakai ulang `barisDiff`/`bagiHunk` dari `simpleDiff.ts`) |
| `hunkUnified(teksUnified, status?)` | 373 | pemanggil hanya punya teks unified-diff — inilah `useGit.diff.text` di panel SCM |
| `uraiUnified(teksUnified)` | 243 | bahan mentah: `{ baris, blok, galat, biner, berkasGanda, tanpaNewlineAkhir }` |
| `parseUnified(teksUnified)` | 366 | hanya baris isi (`DiffRow[]`), untuk tampilan |
| `diterimaDari(status?)` | 424 | `PetaStatus` → `Set<number>` hunk yang diterima |
| `terapkanUnifiedKeIsi(isi, teksUnified, diterima, { sisi })` | 470 | **applier utama**: satu isi + teks unified → teks hasil |
| `terapkanHunkDuaTeks` / `terapkanStatusDuaTeks` | 434 / 443 | applier jalur dua-teks |
| `terapkanStatusUnified` | 586 | gabungan jalur unified |
| `statusBerkas(b)` / `statusSemuaBerkas(daftar)` | 605 / 636 | status selesai per berkas |
| `berkasSelesai(daftar)` / `semuaBerkasSelesai(daftar)` | 641 / 647 | daftar berkas selesai / apakah semua selesai |
| `terapkanBerkas(b)` / `hasilPerBerkas(daftar)` | 652 / 675 | terapkan satu / banyak berkas (`BerkasReview`) |

Aturan applier (`terapkanUnifiedKeIsi`, sisi `'baru'`): baris **konteks** selalu
keluar, baris **tambah** keluar bila hunknya diterima, baris **hapus** keluar bila
hunknya ditolak. Baris di luar hunk disalin apa adanya, jadi hasilnya berkas utuh.
Akhir baris mengikuti `isi`; berkas CRLF tetap CRLF; khusus hunk yang habis tepat
di akhir berkas, akhir baris mengikuti `tanpaNewlineAkhir` sisi yang dipakai.

## 5. Cara pakai di tampilan (yang sudah disambung)

`src/components/scm/DiffViewer.tsx`:

1. **Baris 1–7** — impor `hunkUnified`, `terapkanUnifiedKeIsi`, `PetaStatus`,
   `StatusHunk`, `cmd` (commands), `useStore` (store editor).
2. **Baris 41–57** — hook berdiri di **atas** `if (!diff) return null`, supaya
   jumlah hook sama di setiap render. Daftar potongan dihitung dengan `useMemo`
   dari `diff.text`; teks diff yang tidak bisa diurai menghasilkan daftar kosong
   (bukan panel yang mati).
3. **Baris 78** — gerbang keamanan:
   ```ts
   const bolehTerap = diff.source !== 'history' && !diff.staged && !isBinary;
   ```
   alasannya konkret: pada diff riwayat `path` hanya nama tampilan (bukan berkas
   nyata), dan pada diff staged sisi yang ditampilkan adalah isi **indeks**;
   keduanya tidak boleh ditulis ke berkas kerja. Berkas biner tidak punya potongan.
4. **Baris 83–132** — jalur terapkan (di dalam pagar, lihat §6): `putus(id, status)`,
   `putusSemua(status)`, dan `terapkan()`. Urutan `terapkan()`:
   `fsRead(diff.path)` → `terapkanUnifiedKeIsi(baca.content, diff.text, diterima, { sisi: 'baru' })`
   → `fsWrite(diff.path, hasil, baca.detectedEncoding, baca.lineEnding, { wasExisting: true })`
   → `reloadTabFromDisk(diff.path)` (agar tab editor tidak basi) → `refreshAll()`.
   Sisi `'baru'` benar karena `git_diff` yang tidak staged membandingkan indeks →
   berkas kerja, jadi isi berkas kerja **adalah** sisi `+`. Itu tidak diasumsikan:
   kasus 21 harness mengambil teks diff **asli dari git** dan memanggil applier
   persis seperti panel (terima semua → berkas kerja utuh, tolak semua → isi sisi
   indeks, terima hunk #0 saja → hanya perubahan pertama yang masuk).
   Penulisan ditolak dengan alasan bila tab editor berkas itu masih punya
   perubahan belum disimpan (akan menimpa hasil ini saat disimpan).
5. **Baris 198–296** — panel `[data-testid="diff-hunks"]`: ringkasan
   (`diff-hunks-ringkas`), tombol `diff-hunks-terima-semua`,
   `diff-hunks-tolak-semua`, `diff-hunks-terapkan`, catatan alasan saat gerbang
   mati (`diff-hunks-catatan`), daftar `diff-hunk-<id>` (`data-status` =
   `belum|terima|tolak`) dengan tombol `diff-hunk-<id>-terima` / `-tolak`, dan
   pesan hasil `diff-hunks-pesan`.

**Yang sengaja TIDAK diubah** (uji lama bergantung padanya):

- `<pre data-testid="diff-pre">` beserta `.diff-line is-add/is-del/is-hunk/is-meta`
  dan atribut `data-kind`-nya tetap apa adanya.
- Panel baru memakai kelas sendiri, `.diff-hunk-line is-tambah/is-hapus/is-konteks`
  (bukan `.diff-line`) dan atribut `data-jenis` (bukan `data-kind`), karena
  `scripts/v28/bagian2.mjs:29` menghitung `.diff-line.is-add` secara **global**.
- Tombol Stage/Unstage lama tetap satu-satunya aksi indeks di berkas ini.

Karena itu kelas `diff-hunk*` ditulis lengkap di `src/styles/scm.css` (baris
540–630) agar panel tidak bergantung pada gaya lain.

## 6. Pagar no-auto-commit

**Aturan.** Jalur terapkan hanya menulis berkas kerja. Aksi indeks hanya boleh
datang dari tombol manual yang sudah ada (Stage/Unstage di kepala panel), tidak
pernah dari alur terima/tolak potongan.

**Cara diuji** (`scripts/uji-hunk.mjs`, kasus 12 — membaca **berkas nyata** di
disk dengan `fs.readFileSync`, bukan asumsi):

- 12 pola terlarang dipindai di `src/lib/hunkUnified.ts`: `gitStage`, `gitUnstage`,
  `gitCommit`, `gitCommitWithAi`, `git_stage`, `git_unstage`, `git_commit`,
  `git add`, `git commit`, `stage(`, `unstage(`, `commit(`.
- Modul juga harus tetap murni: tanpa `@tauri-apps`, tanpa `./commands`, tanpa `react`.
- Di `DiffViewer.tsx`, daerah antara penanda `>>> PAGAR-176-APPLY` (baris 83) dan
  `<<< PAGAR-176-APPLY` (baris 132) dipindai dengan 12 pola yang sama, dan wajib
  memuat `terapkanUnifiedKeIsi` serta `fsWrite` — jadi berkas dianggap "punya
  jalur terapkan" hanya kalau jalurnya benar-benar ada dan bersih.
- **Di luar** pagar, jumlah `stage(` dan `unstage(` dihitung: harus tepat 1 dan 1
  (kedua tombol manual lama). Hitungan yang berubah = ada aksi indeks baru yang
  menyelinap masuk, dan harness GAGAL.

**Hasil nyata:**

```
info   pagar: hunkUnified.ts bersih dari 12 pola terlarang; daerah pagar DiffViewer 50 baris bersih; stage(/unstage( di luar pagar = 1/1 (tombol manual)
```

## 7. Batas yang jujur (belum dikerjakan)

- **BUTUH APP**: uji di aplikasi hidup (DOM/e2e: klik Terima → berkas di disk
  benar-benar berubah, `[data-testid="diff-pre"] .diff-line.is-add` tetap utuh)
  belum dijalankan. Harness ini murni dan tidak butuh app; uji lama
  (`scripts/verify10.mjs`, `scripts/uji-diff-hijau.mjs`, `scripts/v28/bagian2.mjs`)
  butuh Zephyr hidup di CDP 9223 dan tidak dijalankan di lane ini. Yang sudah
  dijalankan: `node scripts/uji-hunk.mjs` (21/21, exit 0), `npx tsc --noEmit`
  (0 galat), dan bundling `esbuild` atas DiffViewer.tsx (seluruh rantai impor baru
  resolve, exit 0).
- Belum ada navigasi antar-potongan atau pintasan papan tombol; belum ada
  penggabungan halus bila tab editor punya perubahan belum disimpan (hanya
  ditolak).
- Diff **staged** sengaja tidak bisa diterapkan per potongan — itu butuh dukungan
  unstage sebagian dari git, bukan sekadar penulisan berkas.
- Teks multi-berkas diurai hanya sampai berkas pertama (`berkasGanda` dilaporkan,
  sisanya diabaikan).
- Tombol tidak dinonaktifkan hanya karena `busy` global; status penulisan lokal
  dipakai (`proses`).

## 8. Cara menjalankan

```bash
node scripts/uji-hunk.mjs     # 21 kasus, cetak LULUS/GAGAL + "== 21/21 lulus ==", exit 0
npx tsc --noEmit              # 0 galat
```

`package.json` tidak diubah, jadi tidak ada konflik skrip dengan lane lain.

## 9. Bukti keluaran nyata

```
LULUS  1. satu hunk diterima → teks jadi isi baru
LULUS  2. satu hunk ditolak → teks tidak berubah
LULUS  3. campur terima #0 / tolak #1 → hasil benar (dua teks dan unified)
LULUS  4. hunk di AWAL berkas: terima/tolak + nomor baris mulai
LULUS  5. hunk di AKHIR berkas: terima/tolak + newline akhir tetap
LULUS  6. berkas kosong: berkas baru diterima, ditolak tetap kosong
LULUS  7. hanya spasi/tab berubah (jalur dua teks)
LULUS  8. baris ditambahkan di tengah: terima menambah 1 baris, tolak tidak
LULUS  9. banyak berkas: status "selesai" per berkas benar
LULUS  10. terapkan dua kali idempoten (dua teks + unified, dua sisi)
LULUS  11. hunk tumpang tindih ditolak dengan pesan jelas
LULUS  12. PAGAR: jalur terapkan tidak menyentuh indeks (baca berkas nyata)
LULUS  13. teks 5.000 baris selesai < 1 detik
LULUS  14. parse unified: jenis, nomor baris, dan rentang hunk benar
LULUS  15. baris meta (diff --git/index/---/+++) tidak jadi baris hunk
LULUS  16. isi tidak cocok (berkas berubah) → melempar dengan nomor baris
LULUS  17. diff biner: tanpa hunk, terapkan ditolak; diff kosong aman
LULUS  18. berkas ber-CRLF: hasil tetap CRLF, diff LF
LULUS  19. tidak ada hunk diterima → tidak ada berkas yang perlu ditulis
LULUS  20. diff rusak → statusBerkas melaporkan galat, terapkanBerkas mengembalikannya
LULUS  21. diff asli git + sisi 'baru' = tingkah panel SCM yang sebenarnya

info   pagar: hunkUnified.ts bersih dari 12 pola terlarang; daerah pagar DiffViewer 50 baris bersih; stage(/unstage( di luar pagar = 1/1 (tombol manual)
info   perf: 5.000 baris / 500 hunk → 26 ms (26–124 ms antar-jalankan; ambang uji < 1 detik)
== 21/21 lulus ==
```

`npx tsc --noEmit` → keluar dengan kode 0, tanpa keluaran.
`npx esbuild src/components/scm/DiffViewer.tsx --bundle …` → keluar dengan kode 0
(6 peringatan `import.meta` yang sudah ada sebelumnya, akibat format CJS — bukan
dari perubahan lane ini).
