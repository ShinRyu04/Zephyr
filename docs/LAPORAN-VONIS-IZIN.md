# LAPORAN VONIS IZIN — kenapa `uji-izin-semua` merah, dan apa yang diubah

Tanggal: 2026-10-14 · Lingkup: harness izin/sekat tool (`scripts/uji-*.mjs`, `scripts/verify-tool-*.mjs`)
Status akhir: **0 merah, 5 harness di-SKIP sebagai BUTUH APP, exit 2** (`SEBAGIAN TIDAK DIUJI`).
Exit 2 **bukan hijau palsu**: itu artinya lapisan izin yang bisa diuji tanpa app semuanya hijau, dan yang tersisa memang tidak bisa diukur selagi app Zephyr mati. Untuk exit 0, hidupkan app lalu ulangi — lihat `docs/USULAN-VONIS-IZIN.md`.

## 1. Vonis sebelum → sesudah

Sumber angka "sebelum" untuk runner: keluaran nyata `node scripts/uji-izin-semua.mjs` saat app mati (dilaporkan agen induk; 5 baris berlabel MERAH, ringkasan `harness wajib hijau yang merah : 3`, `BELUM LOLOS (exit 1)`). Sumber "sesudah": keluaran nyata di §4 laporan ini.

| Harness | Sebelum | Sesudah | Akar nyata | Bukti |
|---|---|---|---|---|
| `cek-izin-terminal` | HIJAU (exit 0) | HIJAU (exit 0) | — | `61/61 lulus, 0 gagal` |
| `uji-guard-listener` | HIJAU | HIJAU (exit 0) | — | `SEMUA LULUS` |
| `uji-aturan-tool` | HIJAU | HIJAU (exit 0) | — | `== 28/28 lulus ==` |
| `uji-ssh-aman` | HIJAU | HIJAU (exit 0) | — | `== 53/53 lulus ==` |
| `uji-ssh-rencana` | HIJAU | HIJAU (exit 0) | — | `== 26/26 lulus ==` |
| `uji-jadwal-rencana` | HIJAU | HIJAU (exit 0) | — | `== 25/25 lulus ==` |
| `cek-konteks-repo` | HIJAU | HIJAU (exit 0) | — | `43 lulus, 0 gagal` |
| `uji-konteks-repo-adv` | HIJAU | HIJAU (exit 0) | — | `0 celah dikenal dihitung GAGAL` |
| `uji-aturan-proyek` | HIJAU | HIJAU (exit 0) | — | `== 31/31 lulus ==` |
| `uji-fetch-web-rencana` | HIJAU | HIJAU (exit 0) | — | `aturan RANCANGAN LULUS (exit 0)` |
| `cek-subset-tugas` | HIJAU | HIJAU (exit 0) | — | `LULUS - semua kasus <= 20 tool` |
| `verify-tool-inti` | **MERAH exit=1**, dihitung sebagai merah | **BUTUH APP → SKIP** | BUTUH APP: skrip memanggil `Cdp.attach` (`verify-tool-inti.mjs:22`); app mati → `connect ECONNREFUSED 127.0.0.1:9223` (`lib-cdp.mjs:182` menarik `/json/list`). Bukan regresi. | SKIP dengan alasan di §4 |
| `uji-trim-tool` | **MERAH exit=1**, dihitung sebagai merah | **BUTUH APP → SKIP** | Sama: `Cdp.attach(PORT, [...])` (`uji-trim-tool.mjs:23`) → ECONNREFUSED. Bukan regresi. | SKIP dengan alasan di §4 |
| `cek-aturan-operasional` | **MERAH exit=2**, dihitung sebagai merah | **BUTUH APP → SKIP** | Skrip sendiri sudah tahu: `fetch http://127.0.0.1:9223/json/list` lalu `process.exit(2)` (`cek-aturan-operasional.mjs:22-25`), juga di `:29-30`, `:73-74`, `:80-82`. Runner lama memperlakukan exit≠0 sebagai MERAH. | SKIP dengan alasan di §4 |
| `verify-tool-gate` | **MERAH exit=1** (kategori "dikenal merah") | **BUTUH APP → SKIP** | Cacat harness **ganda**: (a) mati di baris pertama karena app mati; (b) membaca `m.TOOL_DEFAULT` — nama yang **tidak pernah ada** di `src/lib/toolGate.ts` (nama nyatanya `TOOL_AKTIF_AWAL`, `toolGate.ts:186`), sehingga G2b/G7 selalu `undefined.length`. Diperbaiki; sisa ketergantungan = app. | §3.2 |
| `uji-kesiapan-tool` | **MERAH exit=1** (kategori "dikenal merah") | **HIJAU exit=0** | Cacat harness **salah sasaran**: mengukur `subsetAlat.alatUntukTugas` (`subsetAlat.ts:181-204` — memang **tanpa cap**) lalu menuntut `<=20`; 4 "tembusan 23" adalah artefak basis ukur. Cap ≤20 ditegakkan `subsetTugas.pilihToolTugas` (`BATAS_TOOL_TUGAS` `subsetTugas.ts:61`, ditegakkan `:638`/`:668`), dipakai jalur kirim `aiStore.ts:5909`. **Cacat produk terpisah** (append, C1) dilaporkan apa adanya, bukan disembunyikan. | §4.3 |
| `uji-batas-tulis` | SKIP (sudah benar) | SKIP (exit 2) | BUTUH APP | — |

Ringkasan runner: sebelum `harness wajib hijau yang merah : 3` + `BELUM LOLOS (exit 1)` → sesudah `harness wajib hijau yang merah : 0` + `butuh app tapi di-SKIP : 5` + `SEBAGIAN TIDAK DIUJI (exit 2)`.

## 2. Yang diubah (berkas, baris lama → baru)

| Berkas | Baris lama | Baris baru | Perubahan |
|---|---|---|---|
| `scripts/uji-izin-semua.mjs` | daftar `HARUS_HIJAU` (14 nama, memuat 3 harness ber-CDP) + `BUTUH_APP = ['uji-batas-tulis']` + `DIKENAL_MERAH` (2 entri) | `36-94` (3 daftar: `HARUS_HIJAU` 12 nama, `BUTUH_APP` 5 nama, `DIKENAL_MERAH = []`) | `verify-tool-inti`, `uji-trim-tool`, `cek-aturan-operasional` pindah dari HARUS_HIJAU ke BUTUH_APP; `uji-kesiapan-tool` pindah dari DIKENAL_MERAH ke HARUS_HIJAU; `verify-tool-gate` masuk BUTUH_APP |
| `scripts/uji-izin-semua.mjs` | — | `138` | `PENANDA_BUTUH_APP = /BUTUH APP\|ECONNREFUSED\|tidak bisa dihubungi\|127\.0\.0\.1:9223/i` |
| `scripts/uji-izin-semua.mjs` | — | `159-169` | Klasifikasi ulang otomatis: harness apa pun (termasuk yang belum terdaftar) yang exit≠0 **selagi app mati** dan keluarannya memuat penanda app → dipindah ke BUTUH_APP, `exit asli` dicetak |
| `scripts/uji-izin-semua.mjs` | `console.log('butuh app tapi di-SKIP : ${skip}')` | `215` | Ringkasan menyebut jumlah hasil klasifikasi otomatis |
| `scripts/verify-tool-gate.mjs` | 15 tempat `TOOL_DEFAULT` (baris 7, 26, 54, 56, 59, 67, 72, 75, 174, 184, 191, 196) | `7, 9, 45, 73, 77-78, 86, 91, 94, 100, 193, 202, 210, 215, 221` | Nama ekspor nyata `TOOL_AKTIF_AWAL`; **tanpa alias baru** (lihat §2.1) |
| `scripts/verify-tool-gate.mjs` | `const { cdp } = await Cdp.attach(PORT);` (baris 18) | `20-40` | Guard `try/catch` → cetak `BUTUH APP: …` dan `exit 2` kalau CDP tidak bisa dihubungi |
| `scripts/uji-kesiapan-tool.mjs` | bagian (a)+(b) baris **159-211** (ukuran = `alatUntukTugas` → tuntutan ≤20) | `164-262` | Ukuran = `pilihToolTugas` (jalur kirim nyata) pada 2 basis × 6 tugas nyata; `alatUntukTugas` tetap dicetak sebagai **DIAGNOSTIK-tanpa-cap** |
| `scripts/uji-kesiapan-tool.mjs` | `let subset;` / bundle (baris 124-128) | `125-134` | Tambah `tugasSubset = await bundel('src/lib/subsetTugas.ts')` |
| `scripts/uji-kesiapan-tool.mjs` | OPERASI_DASAR `append` (baris 221) | `269-291` | Operasi `tambah isi (append)` diberi `celahDiketahui: 'C1 (docs/AUDIT-TOOL-BERKAS-2026-10-14.md §5)'` |
| `scripts/uji-kesiapan-tool.mjs` | loop (c) baris **304-332** (`takTerjangkau.push`) | `309-367` | Dipisah: operasi wajib tanpa rumah **dan tanpa catatan celah** → `takTerjangkau` (fatal); operasi ber-`celahDiketahui` → `cacatProdukTerbuka` (dicetak apa adanya, dihitung, masuk `--json`, tidak fatal) |
| `scripts/uji-kesiapan-tool.mjs` | ringkasan+JSON+exit baris **405-434** | `405-456` | `gagal` = pelanggaran batas ∨ pelanggaran kebijakan ∨ `takTerjangkau`; baris baru `cacat produk terbuka`, `basis ukur`, `batasModul`, `jalurUkur` |

### 2.1 Kenapa `TOOL_AKTIF_AWAL`, bukan menambah ekspor `TOOL_DEFAULT`

Pilihan: **mengarahkan harness ke ekspor produksi** (bukan menambah alias di `src/lib/toolGate.ts`). Alasan:
1. Produksi memakai `TOOL_AKTIF_AWAL` di tiga tempat yang menentukan perilaku — `toolGate.ts:279` (nilai awal `aktif`), `toolGate.ts:370` (reset), `agentTools.ts:128` (`bawaan`). Nama itu **adalah** definisi "default" hari ini.
2. Menambah `export const TOOL_DEFAULT = TOOL_AKTIF_AWAL` membuat **dua sumber kebenaran** untuk satu hal; kalau kelak salah satu diubah, harness bisa mengukur yang lain tanpa ada yang gagal — persis jenis kebohongan yang laporan ini ada untuk menutup.
3. `src/lib/toolGate.ts` sedang disentuh lane lain; perubahan nol di berkasnya menghindari konflik yang tidak perlu. **Berkas `src/lib/toolGate.ts` tidak diubah sama sekali oleh lane ini.**

Semua nama lain yang dibaca `verify-tool-gate.mjs` sudah diverifikasi ada di produksi: `TOOL_GROUPS:81`, `SEMUA_TOOL:90`, `TOOL_WAJIB:145`, `GRUP_MATI_AWAL:201`, `useToolGate:273` (aksi `balik:249/304`, `setGrup:251/314`). Jadi setelah perbaikan ini **tidak ada lagi nama fiktif** di harness itu.

### 2.2 Kenapa `append` menjadi "cacat produk terbuka", bukan GAGAL

`uji-kesiapan-tool.mjs` (c) menuntut operasi "tambah isi (append)" punya rumah di katalog. Ia **tidak punya**: `append_file`/`write_file_append`/`edit_append` tidak ada di katalog, `write_file` selalu menimpa. Ini celah produk yang **sudah tercatat audit** — C1, `docs/AUDIT-TOOL-BERKAS-2026-10-14.md` §5 (`grep -rn append src/lib/zephyrTools/*.ts src-tauri/src/fs_utils.rs` = 0 hasil).

Perlakuannya sekarang:
- **tetap dicetak apa adanya** di bagian (c): `CACAT PRODUK (terbuka, sudah tercatat): C1 …`;
- **dihitung** di ringkasan (`cacat produk terbuka : tambah isi (append) - celah C1 …`) dan masuk `--json` (`cacatProdukTerbuka`);
- **tidak** membuat `exit 1`, karena keputusan audit (2) — "jangan tambah tool baru kecuali ada tugas nyata yang gagal" — adalah keputusan pemilik, dan harness tidak boleh melaporkan keputusan pemilik sebagai regresi;
- setiap operasi wajib **lain** (baca/tulis/edit/hapus/pindah/salin/grep/daftar/buat/web_fetch/jadwal) tetap **fatal** kalau rumahnya hilang: itulah regresi yang harus menghentikan orang.

Celah ini **belum ditutup** dan tidak diklaim tertutup. Usul penutupannya ada di `docs/USULAN-VONIS-IZIN.md` §2.

## 3. Akar per-harness (bukti, bukan klaim)

### 3.1 Empat harness "merah" karena app mati

- `verify-tool-inti.mjs:22` → `Cdp.attach(PORT)`; `uji-trim-tool.mjs:23` → `Cdp.attach(PORT, ['Zephyr — Code Editor', 'localhost:5173'])`. `lib-cdp.mjs:182` menarik `http://127.0.0.1:<port>/json/list`; app mati → `ECONNREFUSED`.
- `cek-aturan-operasional.mjs:22-25` sudah menangani hal ini sendiri (`exit 2`, "TIDAK BERLAKU"), tetapi runner lama hanya mengenal "exit 0 = OK, selain itu MERAH".
- Kesimpulan: **cacat runner** (klasifikasi), bukan regresi produk. Perbaikan = daftar `BUTUH_APP` + klasifikasi otomatis berbasis penanda di keluaran (§2).

### 3.2 `verify-tool-gate` — cacat harness ganda

1. Baris pertama sudah mati karena app mati (sama seperti §3.1).
2. `m.TOOL_DEFAULT` (dulu baris 26, 67, 72, 75, 191, 196) **tidak pernah diekspor** `src/lib/toolGate.ts` → `undefined.length` → G2b/G7 mustahil lulus, bahkan dengan app hidup. Diperbaiki ke `TOOL_AKTIF_AWAL`.
3. Bisa diverifikasi statis sekarang (nama ada semua, §2.1), **tetapi jalur G1–G7 belum bisa dijalankan live** karena app mati → statusnya `BUTUH APP`, **bukan** "sudah hijau". Itu dinyatakan apa adanya.

Uji guard-nya (dilakukan pada port tanpa pendengar `:9299`, jadi tidak menyentuh CDP `:9223` yang dilarang):

```
$ node scripts/verify-tool-gate.mjs 9299
BUTUH APP: aplikasi Zephyr tidak bisa dihubungi di 127.0.0.1:9299 (fetch failed) — sekat tool hanya bisa diukur dengan app hidup.
EXIT_GATE=2
```

### 3.3 `uji-kesiapan-tool` — salah sasaran (dan apa yang benar)

Jalur yang benar:

```
TOOL_AKTIF_AWAL (gate.aktif)
  → subsetTugas.pilihToolTugas(tugas, aktif, adaFolder)     src/lib/aiStore.ts:5909  (variabel `alatKirim`)
  → agentToolSpecs({ alat: alatKirim })                     src/lib/agentTools.ts:95 (fungsi) / :130 (filter)
```

`BATAS_TOOL_TUGAS = 20` (`subsetTugas.ts:61`) ditegakkan di `subsetTugas.ts:638` (keluarga wajib ditahan saat jatah penuh) dan `:668` (tambahan kelas berhenti), dengan jaring terakhir `:680` (`while (dikirim.length > BATAS_TOOL_TUGAS)`). `alatUntukTugas` (`subsetAlat.ts:181-204`) hanya menyaring kemampuan dan mengembalikan himpunan `aktif` penuh — **memang tidak pernah** dijaga ≤20, jadi menuntutnya ≤20 salah alamat sejak awal.

Harness sekarang mengukur **dua basis** (aktif-default **63** tool, dan katalog penuh **68** tool = keadaan terburuk yang bisa dicapai user; saat ukuran di §4 diambil angkanya masih 62 dan 67) × 6 tugas nyata = 12 ukuran, dan tetap mencetak angka lama sebagai `DIAGNOSTIK-tanpa-cap` supaya 17/23/20 di dokumen audit tetap bisa ditelusuri.

## 4. Bukti keluaran nyata (apa adanya)

### 4.1 `node scripts/uji-izin-semua.mjs` → exit 2

```
== uji-izin-semua ==
akar repo     : D:\Zephyr
aplikasi (9223): MATI
harness        : 12 wajib hijau + 5 butuh app + 0 dikenal merah

  OK    cek-izin-terminal       exit=0  HASIL: LULUS (exit 0)
  OK    uji-guard-listener      exit=0  SEMUA LULUS
  OK    uji-aturan-tool         exit=0  == 28/28 lulus ==
  OK    uji-ssh-aman            exit=0  == 53/53 lulus ==
  OK    uji-ssh-rencana         exit=0  == 26/26 lulus ==
  OK    uji-jadwal-rencana      exit=0  == 25/25 lulus ==
  OK    cek-konteks-repo        exit=0  HASIL: 43 lulus, 0 gagal
  OK    uji-konteks-repo-adv    exit=0  mode ketat: 0 celah dikenal dihitung GAGAL - tambal modulnya
  OK    uji-aturan-proyek       exit=0  == 31/31 lulus ==
  OK    uji-fetch-web-rencana   exit=0  HASIL: aturan RANCANGAN LULUS (exit 0).
  OK    cek-subset-tugas        exit=0  HASIL: LULUS - semua kasus <= 20 tool dan superset kemampuan
  OK    uji-kesiapan-tool       exit=0  HASIL: LOLOS (exit 0) - cap <= 20 dipegang jalur kirim nyata. Cacat produk yang masih terbuka (1
  SKIP  uji-batas-tulis         exit=-  SKIP: aplikasi tidak hidup di 127.0.0.1:9223
  SKIP  verify-tool-inti        exit=-  SKIP: aplikasi tidak hidup di 127.0.0.1:9223
  SKIP  uji-trim-tool           exit=-  SKIP: aplikasi tidak hidup di 127.0.0.1:9223
  SKIP  cek-aturan-operasional  exit=-  SKIP: aplikasi tidak hidup di 127.0.0.1:9223
  SKIP  verify-tool-gate        exit=-  SKIP: aplikasi tidak hidup di 127.0.0.1:9223

== Ringkasan ==
harness wajib hijau yang merah : 0
butuh app tapi di-SKIP         : 5
dikenal-merah yang jadi hijau  : 0
total harness dijalankan       : 17
HASIL: SEBAGIAN TIDAK DIUJI (exit 2) — aplikasi Zephyr mati, jadi harness CDP di-SKIP. Hidupkan aplikasi lalu ulangi.
EXIT_IZIN_SEMUA=2
```

### 4.2 `node scripts/cek-izin-terminal.mjs` → exit 0 (tetap 61/61)

```
subproses dijalankan : 0x (dibekukan)
periksa              : 61/61 lulus, 0 gagal
HASIL: LULUS (exit 0)
```

### 4.3 `node scripts/uji-kesiapan-tool.mjs` → exit 0 (sebelum: exit 1)

Ringkasan sesudah:

```
== Ringkasan ==
basis ukur            : aktif-default (TOOL_AKTIF_AWAL) + katalog penuh (semua tool hidup)
tool per giliran      : maks 20 dari 12 ukuran (batas 20)
pelanggaran batas     : 0
pelanggaran kebijakan : tidak ada
operasi tak terjangkau: tidak ada
cacat produk terbuka  : tambah isi (append) - celah C1 (docs/AUDIT-TOOL-BERKAS-2026-10-14.md §5)
celah tercatat        : 11
HASIL: LOLOS (exit 0) - cap <= 20 dipegang jalur kirim nyata. Cacat produk yang masih terbuka (1) dicetak apa adanya di atas, tidak disembunyikan.
```

Ukuran per tugas (basis aktif-default, 63 tool — saat diukur 62) — kolom `DIAGNOSTIK-tanpa-cap` adalah angka lama yang dulu dihukum:

```
19 tool          | kirim-langsung=17 | DIAGNOSTIK-tanpa-cap=17 | web=tidak berat=tidak | baca berkas
20 tool          | kirim-langsung=20 | DIAGNOSTIK-tanpa-cap=23 | web=tidak berat=tidak | perbaiki kode + uji
20 tool          | kirim-langsung=20 | DIAGNOSTIK-tanpa-cap=23 | web=tidak berat=ya    | tulis banyak berkas
20 tool          | kirim-langsung=18 | DIAGNOSTIK-tanpa-cap=20 | web=ya    berat=tidak | tugas web + berkas
20 tool          | kirim-langsung=18 | DIAGNOSTIK-tanpa-cap=23 | web=tidak berat=tidak | berat: shell + hapus
20 tool          | kirim-langsung=20 | DIAGNOSTIK-tanpa-cap=23 | web=tidak berat=tidak | berat: repo-wide + tulis
```

Basis katalog penuh (68 tool — saat diukur 67) memberi hasil yang sama: **maks 20**. Cap ≤20 dipegang di tepi — margin tersisa 0 pada tugas berat. Itu fakta, bukan pujian.

Sebelum (keluaran lama, untuk pembanding — `alatUntukTugas`, tanpa cap):

```
tool per giliran      : maks 23 dari 6 tugas nyata (batas 20)
pelanggaran batas     : 4
operasi tak terjangkau: tambah isi (append)
HASIL: BELUM LOLOS (exit 1)
```

### 4.4 Verifikasi pendukung → semua exit 0

```
$ node scripts/cek-subset-tugas.mjs
MAKS tool per giliran sesudah pemangkasan: 20 (target <= 20)
kemampuan hilang di semua kasus: 0
dipangkas TANPA rumah keluarga (semua kasus): 0 | tool inti dipangkas: 0
nama di-ROUTE prompt (web_search/web_fetch/browser_open/browser_read) hilang saat kelas web: 0
HASIL: LULUS - semua kasus <= 20 tool dan superset kemampuan

$ node scripts/cek-cap-payload.mjs
== 18/18 lulus ==

$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
EXIT_TSC=0        (0 galat)
```

## 5. Yang TIDAK bisa diverifikasi sekarang (batas kejujuran)

1. **5 harness tidak dijalankan** karena app Zephyr mati: `uji-batas-tulis`, `verify-tool-inti`, `uji-trim-tool`, `cek-aturan-operasional`, `verify-tool-gate`. Runner **tidak** mengklaim mereka hijau — ia mengatakannya `SKIP` + exit 2.
2. `verify-tool-gate` diperbaiki pada dua cacat yang bisa dipastikan tanpa app (nama ekspor + klasifikasi app mati). Lulus-tidaknya G1–G7 **belum** terbukti sampai app hidup.
3. Angka "sebelum" runner diambil dari keluaran agen induk (dilaporkan apa adanya), bukan dari jalan ulang state lama (berkas sudah berubah; menjalankan ulang state lama tidak mungkin tanpa mengembalikan perbaikan).
4. Cacat produk `append` (C1) **masih terbuka** — dilaporkan, bukan ditutup, dan tidak diklaim tertutup.
