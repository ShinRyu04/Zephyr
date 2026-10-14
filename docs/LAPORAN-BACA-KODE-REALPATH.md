# LAPORAN — REALPATH SUNGGUHAN di jalur tool `zephyr_kode` (item `baca-kode-realpath-symlink`)

Tanggal: 2026-10-14 · Branch: `feat/ai-panel-vscode-layout` · Akar repo: `D:/Zephyr`
Penulis: lane item `baca-kode-realpath-symlink` (pemilik tunggal berkas yang disebut di bawah).

## 1. Vonis

| Klaim | Status |
|---|---|
| Perintah Rust `fs_realpath` ada: resolve symlink/junction ke jalur kanonik + TOLAK jalur keluar akar workspace | TERBUKTI tanpa app (`cargo test --lib`, 7 uji baru, tautan NYATA di disk tmp) |
| Perintah terdaftar di daftar `generate_handler!` | TERBUKTI tanpa app (baris + nama daftar, §3) |
| Pembungkus `fsRealpath` di `commands.ts` + penyambungan ke `bacaKode` | TERBUKTI tanpa app (harness: bundel esbuild dari `src/lib/**` asli, H1/H3) |
| Jalur tool memakai realpath SUNGGUHAN, bukan identitas | TERBUKTI tanpa app (harness H3: `invoke('fs_realpath')` benar-benar dipanggil; H4 bentuk kanonik) |
| Junction NYATA yang menunjuk KELUAR akar DITOLAK | TERBUKTI tanpa app (Rust: `tautan_yang_menunjuk_keluar_akar_ditolak`; harness: H5/H6/H7) |
| Junction NYATA yang masih DI DALAM akar DITERIMA, isinya = disk | TERBUKTI tanpa app (Rust: `tautan_yang_masih_di_dalam_akar_diterima_dan_dikanonikkan`; harness: H8) |
| FAIL-CLOSED bila perintah tidak tersedia / tidak menyelesaikan jalur / akar kosong | TERBUKTI tanpa app (harness H9/H10/H11; Rust: `akar_kosong_ditolak`) |
| Determinisme 2x pada jalur realpath | TERBUKTI tanpa app (harness H12) |
| Sisa 52 kasus lama harness tetap lulus SEMUA | TERBUKTI tanpa app (65/65, exit 0; grup C hijau kembali) |
| End-to-end lewat IPC Tauri hidup (app + WebView nyata) | **BUTUH APP** — belum dijalankan (§6) |

Angka akhir (semua dijalankan foreground, keluaran mentah disimpan ke berkas):

```
cd D:/Zephyr && node scripts/uji-baca-kode-sambung.mjs   -> == 65/65 lulus ==   EXIT=0   (sebelum: 52/52)
cd D:/Zephyr && node scripts/uji-baca-kode.mjs           -> EXIT=0
cd D:/Zephyr && node scripts/uji-jangkauan-tool.mjs      -> == RINGKASAN: 95/95 LULUS, 0 GAGAL ==   EXIT=0
cd D:/Zephyr && npx tsc -p tsconfig.json --noEmit        -> TSC_EXIT=0 galat=0
cd D:/Zephyr/src-tauri && cargo test --lib               -> test result: ok. 525 passed; 0 failed  EXIT=0   (baseline 518)
```

## 2. Masalah yang diperbaiki

`src/lib/agentTools.ts` menyuntikkan jembatan baca dengan `realpath: async (p) => p` — realpath **identitas**. Pagar
`diDalamAkar(berkasNyata, akarNyata)` di `bacaKode.ts` karena itu selalu lolos: symlink/junction di dalam repo yang
menunjuk keluar repo akan dibaca seolah-olah di dalam repo. Backend Rust tidak punya perintah realpath sama sekali
(sebelum perubahan ini).

## 3. Apa yang diubah (berkas + baris)

| Berkas | Perubahan |
|---|---|
| `src-tauri/src/fs_utils.rs` | **+** `pub fn realpath_dalam_akar(akar: &Path, p: &Path, label: &str) -> ZResult<String>` (baris 473): akar kosong → `WorkspaceOutside` (fail-closed, sebab `paths::is_inside("", ..)` selalu benar); `std::fs::canonicalize` jalur target (jalur tidak ada HARUS gagal — bukan dikarang dari induk); `paths::strip_unc`; `paths::is_inside` gagal → `ZephyrError::WorkspaceOutside("tautan menunjuk keluar akar workspace: {label} -> {nyata}")`. **+** `#[tauri::command(async)] pub fn fs_realpath(state: State<AppState>, path: String) -> ZResult<String>` (baris 513): `workspace_path()` = None → `WorkspaceOutside`; `resolve_ws`; `realpath_dalam_akar`; `state.bump("fs_realpath")`. **+** `#[cfg(test)] mod uji_realpath` (baris 816): 7 kasus, termasuk tautan folder NYATA dibuat di tmp. |
| `src-tauri/src/lib.rs` | **+** `fs_utils::fs_realpath,` pada **baris 283**, di daftar `tauri::generate_handler![` (yang dibuka di **baris 251**), tepat sesudah `fs_utils::fs_stat,` (baris 282). ⇒ titik registrasi yang benar = `src-tauri/src/lib.rs` (bukan `main.rs`). |
| `src/lib/commands.ts` | **+** `import { pasangRealpathBacaKode } from './bacaKode';` (baris 63); **+** `export const fsRealpath = (path: string) => invoke<string>('fs_realpath', { path });` (baris 289); **+** penyambungan seam `pasangRealpathBacaKode((path) => fsRealpath(path));` (baris 299, sesudah definisi `fsRealpath` supaya tidak TDZ). |
| `src/lib/bacaKode.ts` | **+** seam provider: `let REALPATH_NYATA` (737), `export function pasangRealpathBacaKode` (740), `export function realpathBacaKode` (745); **+** `async function realpathMenyelesaikanJalur` (773); **+** pemakaian di jembatan efektif (808-813): provider dipakai HANYA kalau ia benar-benar menyelesaikan jalur, kalau tidak → `null`; **+** pesan fail-closed (831) `ditolak: realpath sungguhan belum tersedia (perintah `fs_realpath` tidak terpasang), …`; doc-comment kepala diperbarui. Sumber `bacaKode.ts` tetap TIDAK mengimpor `@tauri-apps/api` (tidak ada literal `invoke(`) — aturan lapisan rule-F tetap lulus. |
| `scripts/uji-baca-kode-sambung.mjs` | **+** stub `invoke('fs_realpath')` yang MENIRU perintah Rust (selesaikan junction, pagar akar, tolak tanpa akar workspace; akar dititipkan `globalThis.__ujiWorkspace` = state Tauri); **+** grup **H** (13 kasus baru); **+** bullet (g) di kepala berkas. Nol kasus lama diubah/dilunakkan. |
| `docs/LAPORAN-BACA-KODE-REALPATH.md` (baru) | dokumen ini |
| `docs/USULAN-BACA-KODE-REALPATH.md` (baru) | usulan + sisa pekerjaan |

Tidak ada berkas lain yang disentuh. `src/lib/agentTools.ts` masih (dan tetap) menyuntikkan `realpath` identitas — berkas itu
BUKAN milik lane ini.

## 4. Alur yang sekarang berlaku

```
model -> zephyr_kode -> agentTools.pasangJembatanBacaKodeDariWorkspace
                        (jembatan: {akar, cmd:{fsRead, fsStat, realpath: p=>p}})   <-- masih identitas
      -> bacaKode.bacaBerkasKode
         1. saring jalur mentah (traversal/absolut/UNC/rahasia/ekstensi)
         2. jembatanEfektifBacaKode(): kalau REALPATH_NYATA terpasang ->
              probe: REALPATH_NYATA("<akar>/.") harus != masukan (bukan identitas)
              lolos -> cmd.realpath = REALPATH_NYATA  (identitas suntikan DIABAIKAN)
              gagal/melempar -> null -> "ditolak: realpath sungguhan belum tersedia …"
         3. realpath(akar) dan realpath(berkas) -> diDalamAkar(berkasNyata, akarNyata)
              di luar -> "ditolak: berkas menunjuk KELUAR akar repo (tautan keluar repo): <rel>"
         4. fsStat + fsRead lewat jembatan aplikasi
REALPATH_NYATA diisi `commands.ts` saat modul dimuat: (path) => invoke('fs_realpath', {path})
```

## 5. Bukti mentah

### 5.1 Harness node (tanpa app, tanpa CDP) — 65/65, exit 0

```
== SAMBUNGAN BACA-KODE (node murni, offline, tanpa app) ==
katalog: 68 tool | AGENT_TOOLS: 68 | BATAS_TOOL_TUGAS=20
...
-- C. JEMBATAN: terpasang + terpanggil + membaca DISK NYATA
  ✓ sebelum ada pemanggilan: jembatan BELUM terpasang (bukan dipasang diam-diam saat impor)
  ✓ tanpa workspace: tidak ada folder terbuka => jembatan TIDAK dipasang (tidak menebak akar)
  ✓ RANTAI NYATA: jalankanAgentTool(zephyr_kode) MEMASANG jembatan (sebelum: null, sesudah: terpasang)
  ✓ jawaban menjawab dari DISK nyata: memuat BERKAS + RENTANG BARIS (bukan "belum tersambung")
  ✓ tiap baris jawaban bernomor + isinya IDENTIK dengan berkas di disk
  ✓ disk benar-benar dibaca lewat jembatan aplikasi (fs_read nyata dipanggil)
  ✓ mode `simbol` juga jalan di jalur nyata: menyebut nama simbol + baris definisinya
  ✓ SETIAP jawaban menyebut berkas + baris (kepala [baca_kode] + baris bernomor)
  ✓ tanpa folder terbuka (workspace null): jawaban jujur "belum tersambung", nol bacaan disk

-- D. UJI NEGATIF BACA (gerbang `bolehDibacaKode` + jalur nyata)
  ...
  ✓ TOLAK berkas yang realpath-nya KELUAR akar repo (pagar symlink)
  ...
-- H. REALPATH SUNGGUHAN (perintah `fs_realpath` + tautan NYATA di disk)
  ✓ H1 realpath SUNGGUHAN terpasang lewat rantai impor (commands.ts -> pasangRealpathBacaKode -> fsRealpath)
  ✓ H2 tautan uji NYATA dibuat di disk (junction keluar akar + junction ke src/lib)
  ✓ H3 jalur TOOL memakai perintah `fs_realpath` NYATA (invoke dipanggil) + isi disk nyata
  ✓ H4 jalur KANONIK yang dipakai pagar/laporan (masukan ../. diselesaikan, bukan diteruskan apa adanya)
  ✓ H5 perintah `fs_realpath` MENOLAK tautan nyata yang menunjuk KELUAR akar (junction sungguhan di disk)
  ✓ H6 jalur TOOL menolak tautan keluar akar: diawali "ditolak:", isi LUAR tidak bocor ke jawaban
  ✓ H7 pagar bacaKode menolak kalau realpath MENGEMBALIKAN jalur luar (bukan melempar)
  ✓ H8 tautan nyata yang masih DI DALAM akar DITERIMA: tiap baris = berkas asli di disk
  ✓ H9 FAIL-CLOSED: perintah `fs_realpath` tidak ada di backend => jalur tool MENOLAK, nol bacaan berkas
  ✓ H10 FAIL-CLOSED: realpath identitas (bentuk lama agenTools) TIDAK dipakai - jalur tool menolak
  ✓ H11 tanpa akar workspace perintah menolak (fail-closed) => jalur tool menolak, nol bacaan
  ✓ H12 determinisme jalur realpath: jawaban diterima + penolakan tautan identik 2x (byte-for-byte)
  ✓ H13 artefak uji dibersihkan (tautan + folder luar akar hilang dari disk)

== 65/65 lulus ==
SEMUA LULUS.
```

Tangkapan layar angka: `== 65/65 lulus ==`, `EXIT=0`. Total = 52 kasus lama (semuanya utuh) + 13 kasus grup H.

Bentuk tautan nyata yang dipakai grup H (dibuat dan dihapus harness, di luar `src/`):

```
D:/Zephyr/node_modules/.cache/zephyr-realpath-uji/keluar -> <os.tmpdir()>/zephyr-luar-akar-XXXX   (junction, KELUAR akar)
D:/Zephyr/node_modules/.cache/zephyr-realpath-uji/dalam  -> D:/Zephyr/src/lib                    (junction, DI DALAM akar)
```

Berkas yang diminta lewat `zephyr_kode`: `node_modules/.cache/zephyr-realpath-uji/keluar/bocor.ts`
(isi luar memuat penanda `PENANDA_BOCOR_DI_LUAR_AKAR_REPO` yang TIDAK boleh muncul di jawaban) dan
`…/dalam/konteksRepo.ts` (isi harus identik berkas asli baris demi baris).

### 5.2 Uji Rust — 525 passed / 0 failed (baseline 518), tautan NYATA, tidak ada kasus dilewati

```
test fs_utils::uji_realpath::akar_kosong_ditolak ... ok
test fs_utils::uji_realpath::berkas_tidak_ada_ditolak_bukan_dikarang ... ok
test fs_utils::uji_realpath::jalur_biasa_di_dalam_akar_mengembalikan_bentuk_kanonik ... ok
test fs_utils::uji_realpath::jalur_di_luar_akar_ditolak ... ok
test fs_utils::uji_realpath::akar_yang_sendiri_tautan_tetap_dinormalkan ... ok
test fs_utils::uji_realpath::tautan_yang_menunjuk_keluar_akar_ditolak ... ok
test fs_utils::uji_realpath::tautan_yang_masih_di_dalam_akar_diterima_dan_dikanonikkan ... ok
test result: ok. 525 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 9.03s
```

Grep `CATATAN` pada keluaran cargo = 0 ⇒ kasus tautan benar-benar dijalankan (bukan dilewati karena mesin menolak
membuat tautan).

### 5.3 Harness lain (regresi)

```
node scripts/uji-baca-kode.mjs      -> EXIT=0
node scripts/uji-jangkauan-tool.mjs -> == RINGKASAN: 95/95 LULUS, 0 GAGAL ==   EXIT=0
```

`uji-jangkauan-tool.mjs` (bukan berkas milik lane ini) menuntut dua sifat yang tetap dihormati: jembatan yang
`realpath`-nya mengembalikan jalur DI LUAR akar harus DITOLAK ("KELUAR akar"), dan jembatan `realpath: p => p` harus
BERHASIL. Sejak perbaikan, `REALPATH_NYATA` dari `commands.ts` selalu ada di bundel apa pun yang memuat `commands.ts`,
sehingga jembatan suntikan dipakai hanya bila providernya boleh dipakai — dan 95/95 tetap lulus.

## 6. Yang BELUM dibuktikan (BUTUH APP)

1. **End-to-end lewat IPC Tauri hidup.** Harness mengganti `invoke` dengan stub yang MENIRU kontrak perintah
   (`$TMPDIR/…` → resolve + pagar akar). Rantai `WebView → invoke('fs_realpath') → perintah Rust` belum dijalankan di
   app nyata: app sedang MATI (CDP `:9223` refused) dan lane lain sedang menyunting `src/lib/**`, jadi build/hot-reload
   tidak boleh dinyalakan dari lane ini. Yang sudah terbukti tanpa app: perintah Rust berperilaku benar di filesystem
   nyata (`cargo test --lib`), dan sisi TS memanggil perintah itu dengan nama & argumen yang benar (harness).
2. **Bukti bahwa app yang berjalan memanggil `fs_realpath`** (log/`bump` counter di app nyata) — perlu sesi app hidup:
   jalankan tool `zephyr_kode` di app, lihat `bump("fs_realpath")` bertambah.
3. **Perilaku WebView2 spesifik** (mis. `\\\\?\\` verbatim dari `canonicalize` lintas API) hanya teruji di sisi Rust;
   `rapikanJalurNyata` di `bacaKode.ts` sudah menanggalkan prefiks itu, tapi jalur IPC-nya belum diuji hidup.

## 7. Catatan risiko (jujur, belum ditutup)

1. `src/lib/agentTools.ts` MASIH memasang `realpath: p => p`. Sekarang tidak berbahaya (probe menolak realpath yang
   tidak menyelesaikan jalur — lihat harness H10, dan tanpa provider jalur tool menolak, H9), tetapi suntikan identitas
   itu sebaiknya dihapus oleh lane pemiliknya supaya tidak ada dua sumber kebenaran.
2. Bila perintah menolak (mis. tautan keluar akar), jawaban tool berbunyi `ditolak: berkas tidak ada: <rel>` karena
   `bacaKode.ts` memetakan SEMUA kegagalan realpath ke "berkas tidak ada". Aman (fail-closed, tidak ada isi yang bocor),
   tapi alasannya tidak dibedakan; usulan perbaikan ada di `USULAN-BACA-KODE-REALPATH.md`.
3. Junction Windows terdeteksi sebagai direktori oleh `lstat().isSymbolicLink()` (reparse point). Karena itu penghapusan
   tautan di harness memakai `rmdir`/`unlink` (TIDAK rekursif) — `rm -r` pada junction berisiko menghapus isi sasaran.
4. `fs_realpath` mengembalikan jalur KANONIK ABSOLUT; jangan pernah menyalinnya ke jawaban model (aturan keluaran
   "tanpa jalur absolut"). Jembatan tetap mengirim jalur relatif; hanya pagar/`jejak` yang memakai bentuk kanonik.
