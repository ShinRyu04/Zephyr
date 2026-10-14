# USULAN BACA KODE SENDIRI — registrasi tool (`ZEPH-BACA-KODE-SENDIRI`)

Status: **modul produk + harness SUDAH ada dan lulus** (`src/lib/bacaKode.ts`, `scripts/uji-baca-kode.mjs`, 49/49 LULUS).
Berkas ini hanya memuat **apa yang belum dikerjakan**: penyambungan ke aplikasi. Semua suntingan di bawah
menyentuh berkas bersama, jadi **tidak dieksekusi** di lane ini (aturan: jangan sunting berkas bersama kecuali
nol risiko; jangan `git add`/`commit`). Semua baris di bawah adalah nomor baris **versi sekarang** di `D:\Zephyr`.

## 0. Yang sudah jadi (tidak perlu izin)

`src/lib/bacaKode.ts` (746 baris) — ekspor kunci yang sudah siap dipakai:

| Simbol | Baris |
|---|---|
| `BACA_KODE_VERSI` / `BATAS_BARIS_POTONGAN` / `BATAS_BYTE_BERKAS` / `BATAS_KARAKTER_BARIS` / `BATAS_CHAR_POTONGAN` / `BATAS_BACAAN_SESI` / `BATAS_BERKAS_PER_PANGGILAN` | 74 / 76 / 82 / 84 / 86 / 88 / 91 |
| `EKSTENSI_TEKS` (23) / `NAMA_TEKS` (4) / `berekstensiTeks` | 105 / 132 / 135 |
| `bolehDibacaKode(rel, akar)` / `apakahBiner` / `bacaPotongan` / `rakitPotongan` / `cariDefinisiBaris` | 160 / 248 / 349 / 460 / 315 |
| `bacaBerkasKode(permintaan, jembatan)` (inti async) | 592 |
| `SPEC_BACA_KODE` (skema tool, `name: 'zephyr_kode'`) | 679 (name di 680) |
| `pasangJembatanBacaKode` / `resetAnggaranBaca` / `jembatanBacaKode` / `jalankanBacaKode` / `TOOL_BACA_KODE` | 713 / 718 / 722 / 726 / 740 |

Skema tool: `berkas` (string, wajib) + `dari` / `sampai` / `simbol` (opsional). Deskripsinya sudah menyebut
angka batas (120 baris, 512 KiB, 1 berkas/panggilan, 12/sesi).

## 1. `src/lib/zephyrTools/catalog.ts` — masukkan ke BUILTIN

Baris **93**, sesudah entri `zephyr_self`:

teks lama:
```ts
  ['zephyr_self', 'Search', 'read', false, 'Periksa Zephyr sendiri dari sumber milik aplikasi: setelan aktif, log, ekstensi, dokumen bundel, versi, dan indeks fakta'],
```
teks baru (tambahan satu tuple, komentar alasannya menyusul):
```ts
  ['zephyr_self', 'Search', 'read', false, 'Periksa Zephyr sendiri dari sumber milik aplikasi: setelan aktif, log, ekstensi, dokumen bundel, versi, dan indeks fakta'],

  /* Baca ISI kode sebagai potongan baris (`bacaKode.ts`).

     `zephyr_self` dan `zephyr_cari` hanya bisa MENUNJUK (nama berkas + baris);
     jawaban "cara kerja X" karena itu berhenti di tingkat daftar. Entri ini
     yang menutup jaraknya: potongan baris nyata, dengan batas yang disebut.
     Read-only (efek `read`, tanpa izin), tetap butuh akar repo yang sah. */
  ['zephyr_kode', 'Search', 'read', false, 'Baca isi berkas kode sebagai potongan baris: rentang baris atau sekitar sebuah simbol'],
```
Alasan bentuknya sama dengan `zephyr_self`: `effect: 'read'` + `needsApproval: false` — aturan `periksaKatalog()`
(`catalog.ts:376`) hanya mewajibkan izin untuk efek `fsWrite`/`exec`, dan tool ini memang tidak pernah menulis.

## 2. `src/lib/zephyrTools/catalog.ts` — kirim setiap permintaan

Baris **581**, di dalam `TOOL_DIKIRIM_SELALU` (`catalog.ts:522`):

teks lama:
```ts
  'zephyr_self',
  'skill_view',
```
teks baru:
```ts
  'zephyr_self',
  /* Pintu ke isi kode. Sama alasannya dengan `zephyr_self`: blok fakta inti
     menyebut peta kode NAMANYA, dan aturan prompt berbunyi "cari dulu sebelum
     menyebut berkas". Kalau tool-nya tidak ikut dikirim, model membaca pintunya
     di prompt lalu tidak bisa memanggilnya tanpa `tool_search` - dan pertanyaan
     "cara kerja X" berhenti persis di titik yang item ini mau tutup. */
  'zephyr_kode',
  'skill_view',
```

## 3. `src/lib/agentTools.ts` — daftarkan handler

Baris **15** (impor) dan **58** (daftar `AGENT_TOOLS`):

teks lama:
```ts
import { TOOL_ZEPHYR_SELF } from './zephyrTools/zephyrSelf';
```
teks baru:
```ts
import { TOOL_ZEPHYR_SELF } from './zephyrTools/zephyrSelf';
import { TOOL_BACA_KODE } from './bacaKode';
```

teks lama:
```ts
  TOOL_ZEPHYR_SELF,
```
teks baru:
```ts
  TOOL_ZEPHYR_SELF,
  TOOL_BACA_KODE,
```

Ikut berubah: komentar kepala berkas `agentTools.ts:6` (`tepat 65 tools` → `tepat 66 tools`, `40 Built-in` → `41`).
Angka di `TOOL_COUNTS` (`catalog.ts:278`) diturunkan (`BUILTIN.length`), jadi tidak ada literal yang perlu disunting.

## 4. `src/lib/zephyrTools/deskripsiTool.ts` — 10 peta wajib menyusul

Sepuluh peta di baris **40, 113, 183, 253, 323, 393, 463, 533, 603, 673**. Setiap peta perlu satu baris kunci
`zephyr_kode` (kunci harus sama persis dengan nama di katalog — itu aturan panel Tools). Contoh untuk `id` (baris 40):

teks lama:
```ts
export const DESKRIPSI_TOOL_ID: Record<string, string> = {
```
teks baru:
```ts
export const DESKRIPSI_TOOL_ID: Record<string, string> = {
  zephyr_kode: 'Baca isi berkas kode sebagai potongan baris, dengan nomor baris nyata',
```
Untuk 9 peta bahasa lain (en/ja/ko/zh/es/fr/de/pt/ar) satu baris serupa dengan teks bahasa masing-masing.

**Konsekuensi kalau dilewat:** `scripts/cek-panel-tools-bahasa.mjs` membaca `TOOL_CATALOG` lalu menghitung
`nama.filter((n) => !en[n])` — tool tanpa entri di peta akan muncul sebagai deskripsi KOSONG, dan itu keluhan
nyata yang harness itu jaga. Harness itu memakai CDP (`:9223`) sehingga **tidak** dijalankan di lane ini.

## 5. `src/lib/toolGate.ts` — nyalakan (bukan sekadar terpasang)

`cek-kontrak-40.mjs:94` menuntut **setiap tool inti AKTIF** (`hasil.intiKurang.length === 0`), jadi entri BUILTIN
tanpa keanggotaan di `TOOL_AKTIF_AWAL` akan terlihat sebagai "inti yang tidak menyala".

Baris **186**, `TOOL_AKTIF_AWAL`:

teks lama:
```ts
export const TOOL_AKTIF_AWAL: readonly string[] = [
```
teks baru:
```ts
export const TOOL_AKTIF_AWAL: readonly string[] = [
  'zephyr_kode',
```

**Jangan** menambahkan `'zephyr_kode'` ke `TOOL_TULIS` (`:97`) atau `TOOL_DISK_TULIS` (`:118`): modul ini tidak
punya satu jalur pun yang menulis (dibuktikan `D3`: objek jembatan hanya menyentuh `realpath`/`fsStat`/`fsRead`).

## 6. Jembatan runtime — bagian yang PALING belum ada

Tanpa ini tool-nya menjawab jujur: `baca_kode belum tersambung: jembatan berkas belum dipasang. Tidak ada berkas yang dibaca.`
(`bacaKode.ts:733`, diuji sebagai kasus `E2`). Rancangan yang diusulkan:

Berkas baru `src/lib/zephyrTools/bacaKodeJembatan.ts`:

```ts
/* Akar repo + jembatan berkas untuk `bacaKode.ts`. Dipanggil sekali saat app
   siap dan setiap kali workspace berganti. Kalau akar tidak lolos validasi,
   jembatan TIDAK dipasang - tool mati dengan pesan jujur, bukan menebak. */
export function pasangJembatanKode(opts: { exeDir?: string; workspace?: string | null }): boolean
```

1. **Akar repo**: kalau ada workspace terbuka dan isinya repo Zephyr → pakai itu; kalau tidak, turun dari
   `exeDir` (`AppInfo.exeDir`, `src/lib/types.ts:33`; dibaca lewat `getAppInfo()`, `src/lib/commands.ts:110`)
   naik **3 level** dari `src-tauri/target/debug` (dev) → `D:\Zephyr`.
2. **Validasi berkas kunci** sebelum dipakai: `package.json` + folder `src/` + `tsconfig.json` semuanya ada.
   Gagal satu → jangan pasang jembatan.
3. **cmd** (persis tiga kemampuan yang dipakai modul):
   - `realpath: (p) => fsRealpath(p)` (lihat bagian 7),
   - `fsStat: (p) => fsStat(p)` (`src/lib/commands.ts:468` → `fs_stat`),
   - `fsRead: (p) => fsRead(p, 'utf8')` (`src/lib/commands.ts:277` → `fs_read`).
4. Panggil `pasangJembatanBacaKode({ cmd, akar })` (`bacaKode.ts:713`).

Catatan keamanan: `fs_read` sudah punya guard sendiri di Rust (komentar `commands.ts:233`) dan `fs_stat` memanggil
`state.periksa_path_baca` (`fs_utils.rs:446`), jadi penolakan terjadi **dua kali** — di modul dan di Rust.

## 7. Command Rust `fs_realpath` (satu-satunya tambahan backend)

Modul butuh `realpath` untuk menolak symlink/junction yang keluar repo (kasus `C3`/`C3b`). Belum ada command itu:
`fs_stat` mengembalikan `{size,isDir,mtime}` saja (`src/lib/types.ts:106`) tanpa jalur kanonik.

`src-tauri/src/fs_utils.rs`, sesudah `fs_stat` (baris **446-455**):

```rust
#[tauri::command(async)]
pub fn fs_realpath(state: State<AppState>, path: String) -> ZResult<String> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    state.periksa_path_baca(&p)?;
    let kanon = p.canonicalize().map_err(|e| map_fs_err(e, &path))?;
    Ok(crate::paths::strip_unc(&kanon).to_string_lossy().to_string())
}
```
`paths.rs:47 strip_unc` sudah ada justru untuk membatalkan prefix verbatim `\\?\` (dan bentuk `\\?\UNC\`) yang
dihasilkan `canonicalize` — dipakai apa adanya supaya jalur kanonik tidak dikembalikan sebagai jalur relatif
yang salah (lihat penjelasan di `paths.rs:39-59`).

Daftarkan di `src-tauri/src/lib.rs:251` (`tauri::generate_handler!`), sesudah `fs_utils::fs_stat` (baris **282**):
```rust
            fs_utils::fs_stat,
            fs_utils::fs_realpath,
```
TS: `src/lib/commands.ts:468`, sesudah `fsStat`:
```ts
export const fsRealpath = (path: string) => invoke<string>('fs_realpath', { path });
```

**Alternatif tanpa command baru** (kalau menambah permukaan IPC ditolak): buat `realpath` di jembatan memakai
`fsStat` + normalisasi jalur di TS. Konsekuensinya nyata dan harus disebut: symlink/junction yang keluar repo
hanya bisa dideteksi lewat pemeriksaan teks, bukan lewat filesystem → jaminan `C3` melemah. Karena itu usulan
utama tetap command di atas.

## 8. Konsekuensi ke harness lain (jujur, belum diverifikasi di lane ini)

| Harness | Dampak | Bisa dijalankan di lane ini? |
|---|---|---|
| `scripts/uji-baca-kode.mjs` | tetap LULUS (menguji modul, bukan katalog) — sudah dijalankan 49/49 | ya (sudah) |
| `scripts/uji-peta-kode.mjs`, `scripts/uji-tahu-100p.mjs` | tetap LULUS (tidak menyentuh katalog tool) | ya (sudah) |
| `scripts/cek-kontrak-40.mjs` | angka diturunkan, tapi tool inti wajib AKTIF (bagian 5) | tidak (butuh app hidup) |
| `scripts/audit-katalog-tool.mjs`, `inventaris-tool.mjs`, `deteksi-duplikat-tool.mjs` | daftar tool berubah +1; laporan lama jadi basi | tidak (sebagian) |
| `scripts/cek-panel-tools-bahasa.mjs` | butuh kunci di 10 peta (bagian 4) | tidak — CDP `:9223`, **dilarang** di lane ini |
| `scripts/cek-nama-alat-hidup.mjs` | memeriksa nama alat di app hidup | tidak (CDP) |

Karena itu registrasi (bagian 1-5) sebaiknya dikerjakan lane yang boleh menjalankan harness CDP, supaya
"terpasang" dan "menyala" dibuktikan bersama-sama, bukan diklaim.

## 9. Urutan pengerjaan yang disarankan

1. Bagian 7 (command Rust + wrapper TS) → `cargo check` + `tsc --noEmit`.
2. Bagian 6 (jembatan) → `tsc --noEmit` + panggil `pasangJembatanKode()` saat app siap.
3. Bagian 1-5 (katalog, agentTools, 10 peta, gate) → `node scripts/inventaris-tool.mjs`, lalu harness CDP.
4. Setelah menyala: jalankan ulang `node scripts/uji-baca-kode.mjs` (tidak boleh turun dari 49/49).
