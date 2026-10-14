# USULAN — REALPATH SUNGGUHAN & PAGAR TAUTAN di jalur tool `zephyr_kode` (item `baca-kode-realpath-symlink`)

Tanggal: 2026-10-14 · Akar repo: `D:/Zephyr` · Status: **sudah diterapkan** untuk bagian 1-4; bagian 5 adalah usulan
lanjutan (belum dikerjakan, sebagian milik lane lain).

## 1. Masalah

1. `src/lib/agentTools.ts` memasang jembatan baca dengan `realpath: async (p) => p` (identitas) ⇒ pagar
   `diDalamAkar(berkasNyata, akarNyata)` di `src/lib/bacaKode.ts` selalu lolos.
2. Backend Rust tidak punya perintah realpath ⇒ tidak ada cara mengetahui jalur sebenarnya sesudah symlink/junction
   diselesaikan.
3. Akibatnya: junction/symlink di dalam repo yang menunjuk KELUAR repo (mis. `D:/Zephyr/bocor -> C:/Users/...`) akan
   dibaca seolah-olah berkas repo.

## 2. Opsi desain dan keputusan

### Opsi A — `bacaKode.ts` menimpa `cmd.realpath` dengan perintah Tauri sendiri — **DITOLAK**
Kendala keras: `scripts/uji-jangkauan-tool.mjs` (baris ~654-676) mewajibkan `bacaBerkasKode` MENGHORMATI `realpath` yang
disuntikkan jembatan: jembatan palsu yang mengembalikan jalur DI LUAR akar harus DITOLAK ("KELUAR akar"), dan jembatan
palsu `realpath: p => p` harus BERHASIL. Override tingkat-modul atas realpath yang disuntikkan akan memecahkan keduanya.

### Opsi B — `bacaKode.ts` mengimpor `commands.ts` (langsung memakai `fsRealpath`) — **DITOLAK**
Aturan lapisan: sumber `bacaKode.ts` tidak boleh menyentuh `@tauri-apps/api` (rule-F memindai SUMBER untuk literal
`invoke(`), dan `bacaKode.ts` selama ini hanya mengimpor `konteksRepo`/`types`. Mengimpor `commands.ts` menarik seluruh
impor Tauri ke dalam graf modul bacaKode — uji murni node jadi rapuh.

### Opsi C — **SEAM PROVIDER** (dipilih & diterapkan)
`bacaKode.ts` mengekspor seam:

```ts
let REALPATH_NYATA: ((path: string) => Promise<string>) | null = null;      // bacaKode.ts:737
export function pasangRealpathBacaKode(fn: ((path: string) => Promise<string>) | null): void  // :740
export function realpathBacaKode(): ((path: string) => Promise<string>) | null                // :745
```

`commands.ts` mengisi seam saat modul dimuat (rantai impor nyata `commands.ts -> bacaKode.ts`):

```ts
import { pasangRealpathBacaKode } from './bacaKode';                  // commands.ts:63
export const fsRealpath = (path: string) => invoke<string>('fs_realpath', { path });   // :289
pasangRealpathBacaKode((path) => fsRealpath(path));                   // :299 (sesudah definisi => tidak TDZ)
```

Sifat yang dipertahankan:
- `bacaKode.ts` tetap tidak tahu apa itu Tauri (tidak ada `invoke(`, tidak ada `@tauri-apps/api`).
- Jembatan yang disuntikkan tetap dihormati bila tidak ada provider (jangkauan baris 671-676 tetap lulus).
- `agentTools.ts` tidak perlu diubah (berkas bukan milik lane ini).

### Opsi D — menambah `realpath` di signature jembatan yang dipasang `agentTools.ts` — **TIDAK TERSEDIA**
`src/lib/agentTools.ts` bukan berkas milik lane ini. Usulan bersihnya ada di §5.1.

## 3. Kontrak perintah `fs_realpath` (Rust, `src-tauri/src/fs_utils.rs`)

```rust
pub fn realpath_dalam_akar(akar: &Path, p: &Path, label: &str) -> ZResult<String>   // :473  (dapat diuji tanpa State)
#[tauri::command(async)] pub fn fs_realpath(state: State<AppState>, path: String) -> ZResult<String>   // :513
```

- Masukan `{ path: string }`; keluaran: jalur KANONIK ABSOLUT (`\\\\?\\` dibuang lewat `paths::strip_unc`).
- `state.workspace_path()` = None → `ZephyrError::WorkspaceOutside` ("tidak ada folder workspace terbuka …") — fail-closed.
- `state.resolve_ws(&path)` → jalur absolut; `std::fs::canonicalize` **wajib** sukses (jalur tidak ada → `NotFound`;
  TIDAK boleh dikarang dari jalur induk — kalau dikarang, berkas hantu akan tampak ada).
- `paths::is_inside(akar_nyata, nyata)` gagal → `WorkspaceOutside("tautan menunjuk keluar akar workspace: {label} -> {nyata}")`.
- Akar kosong → `WorkspaceOutside("akar workspace kosong: tidak ada batas yang bisa dipakai untuk memeriksa")`.
  Sebab: `paths::is_inside("", apa pun)` selalu benar, jadi akar kosong akan meloloskan segalanya.
- **Tidak ada jalur tulis**; hanya membaca metadata. `state.bump("fs_realpath")` sebagai penghitung panggilan.
- Pesan galat memakai `label` (nama relatif) supaya jalur absolut tidak bocor ke UI/model.
- Gaya/kontrak mengikuti fungsi yang sudah ada (`fs_stat`) — tidak ada perintah kembar.

Registrasi: `src-tauri/src/lib.rs:283` → `fs_utils::fs_realpath,` di dalam daftar `tauri::generate_handler![` (dibuka
baris 251), tepat sesudah `fs_utils::fs_stat,`.

## 4. Aturan pemakaian di jalur tool

`bacaBerkasKode` memakai jembatan EFEKTIF dari `jembatanEfektifBacaKode()` (`bacaKode.ts` ~800-835):

1. Jembatan tak lengkap (`fsRead`/`fsStat`/`realpath`) → ditolak seperti semula ("jembatan berkas belum lengkap").
2. `REALPATH_NYATA` terpasang → **probe**: panggil dengan `<akar>/.`; kalau keluarannya sama dengan masukannya
   (atau melempar), provider DIANGGAP TIDAK NYATA → `null` (jalur tool MENOLAK, bukan meloloskan).
   Ini yang mematikan realpath identitas, termasuk suntikan `agentTools.ts` (`realpath: p => p`).
3. Tanpa provider → `cmd.realpath` yang disuntikkan diuji dengan probe yang sama; lolos → dipakai (jembatan uji lain
   tetap lulus), gagal → `null`.
4. `null` → jawaban `ditolak: realpath sungguhan belum tersedia (perintah `fs_realpath` tidak terpasang), jadi …`
   tanpa SATU pun pembacaan disk (`fsRead` tidak pernah dipanggil).
5. Sesudah itu guard lama tetap berlaku: `diDalamAkar(realpath(berkas), realpath(akar))` → "berkas menunjuk KELUAR akar repo".

Harga probe: satu panggilan `fs_realpath` tambahan per pembacaan tool (tanpa jaringan, hanya syscall). Dapat diterima
karena pembacaan berkas dibatasi anggaran sesi.

## 5. Usulan lanjutan (belum dikerjakan)

### 5.1 `agentTools.ts` berhenti memasang `realpath` identitas — lane pemilik `agentTools.ts`
Setelah seam ini, suntikan identitas **tidak lagi berbahaya** (probe menolaknya), tetapi sebaiknya dihapus/dinormalkan
supaya tidak ada dua sumber kebenaran, mis. jembatan cukup `{ akar, cmd: { fsRead, fsStat } }` dan realpath datang dari
provider. Bila itu dilakukan, `bacaKode.ts` tetap fail-closed (tanpa provider → menolak).

### 5.2 Bedakan ALASAN penolakan realpath (`bacaKode.ts` ~638) — lane ini (siap, belum diterapkan)
Sekarang semua kegagalan realpath dipetakan ke `ditolak: berkas tidak ada: <rel>`. Karena perintah Rust mengirim pesan
`WorkspaceOutside: tautan menunjuk keluar akar workspace …`, pesan itu bisa dibaca di `catch` dan diterjemahkan ke
`tolak('berkas menunjuk KELUAR akar repo (tautan keluar repo): <rel>')`. **Belum diterapkan** karena harness lain
(`uji-jangkauan-tool.mjs`) memiliki kasus yang menuntut pesan tertentu pada jalur ini; perubahan pesan sebaiknya
dikoordinasikan dulu supaya tidak memerahkan lane lain.

### 5.3 Pagar realpath di sisi Rust untuk `fs_read`/`fs_stat` (defense-in-depth) — pemilik `fs_utils.rs`
Sekarang pagar tautan ada di sisi TS (guard `diDalamAkar`) + perintah realpath. Klien yang tidak memakai guard (mis.
pemanggil `invoke('fs_read')` lain di masa depan) tetap bisa membaca lewat junction. Usul: `fs_read`/`fs_stat`
menjalankan `realpath_dalam_akar` pada jalur target sebelum membaca (satu syscall tambahan, bisa di-cache per panggilan),
sehingga penolakan tautan keluar akar terjadi di backend, bukan hanya di klien.

### 5.4 Bukti end-to-end di app hidup — BUTUH APP
Belum dijalankan dari lane ini (app mati, CDP `:9223` refused, lane lain menyunting `src/lib/**`). Rencana uji sesi app:
1. buka workspace `D:/Zephyr` di app; buat junction `D:/Zephyr/uji-tautan-keluar -> C:/Users/Zyrex/AppData/Local/Temp`;
2. minta tool `zephyr_kode` membaca `uji-tautan-keluar/<berkas>.ts` → harapan: `ditolak: … KELUAR akar repo …`
   (atau `ditolak: berkas tidak ada …`) dan isi luar TIDAK muncul;
3. periksa penghitung `fs_realpath` bertambah (log/`bump`), lalu hapus junction memakai `rmdir` (JANGAN `rm -r`:
   junction Windows = reparse point, penghapusan rekursif berisiko menghapus isi sasaran);
4. catat di `docs/LAPORAN-BACA-KODE-REALPATH.md` §6 sebagai bukti hidup.

### 5.5 Audit berkala tautan keluar akar — usul item baru
Skrip kecil (mis. `scripts/audit-tautan-keluar.mjs`) yang menyisir akar repo, membuat daftar symlink/junction
(`lstat`), menyelesaikan tiap tautan dengan `realpath`, dan melaporkan yang resolve di luar akar. Bermanfaat karena
`fs.realpathSync.native` menyelesaikan junction tanpa hak istimewa, dan junction Windows TIDAK terlihat sebagai symlink
oleh `lstat().isSymbolicLink()` (harus diperiksa lewat atribut reparse).

## 6. Uji (semua dijalankan tanpa app, node murni + cargo)

| Uji | Hasil |
|---|---|
| `cd D:/Zephyr/src-tauri && cargo test --lib` | 525 passed / 0 failed (baseline 518 + 7 kasus `fs_utils::uji_realpath`), tautan folder NYATA, `CATATAN` (lewati) = 0 |
| `cd D:/Zephyr && node scripts/uji-baca-kode-sambung.mjs` | 65/65 lulus, exit 0 (52 kasus lama utuh + grup H: 13 kasus baru) |
| `cd D:/Zephyr && node scripts/uji-jangkauan-tool.mjs` | 95/95 lulus, exit 0 |
| `cd D:/Zephyr && node scripts/uji-baca-kode.mjs` | exit 0 |
| `cd D:/Zephyr && npx tsc -p tsconfig.json --noEmit` | 0 galat |

Isi grup H harness (mewakili enam tuntutan tugas): realpath nyata dipakai (H3/H4), bentuk kanonik (H4), junction nyata
keluar akar DITOLAK (H5/H6/H7), junction di dalam akar DITERIMA (H8), fail-closed saat perintah tidak ada / identitas /
tanpa akar (H9/H10/H11), determinisme 2x (H12), plus pembuatan & pembersihan tautan nyata yang diaudit (H2/H13).
