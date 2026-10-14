# LAPORAN SUBSET-SAMBUNG (LAMA-a1 sisa: jembatan penguji)

Tanggal ukur: 2026-10-14 · cabang `feat/ai-panel-vscode-layout` · repo `D:/Zephyr`

Item: **ZEPH-SUBSET-SAMBUNG**. Latar: `src/lib/subsetTugas.ts` (lane lain) sudah
memangkas tool per tugas (`<= 20`, `BATAS_TOOL_TUGAS = 20`, 10 tool inti tak pernah
dipangkas, hanya kembar yang dipangkas, `tool_search` + `tool_call` selalu ikut) dan
sudah disambung di `aiStore.ts:5717` (`beratRun = tugasBerat(...) || wajibTodo(...)`,
`pilihToolTugas`). Sisa: **jembatan penguji** `src/lib/devBridge.ts` masih memakai
`alatUntukTugas`/`tugasBerat`, sehingga `__ZEPHYR_AI__.subsetAlat()` melaporkan 23 tool
untuk tugas yang jalur agennya benar-benar mengirim 20.

## 1. Berkas yang diubah

| berkas | perubahan |
| --- | --- |
| `src/lib/devBridge.ts` | `subsetAlat()` memakai `pilihToolTugas` (bukan `alatUntukTugas`); `berat` jadi `tugasBerat(t) \|\| wajibTodo(t)`; ekspos `alatKirimLama`, `dipangkas`, `batasTool` (dibaca dari `BATAS_TOOL_TUGAS`); ekspos `__ZEPHYR_AI__.subsetTugas = { batas, inti, bawaan, keluarga, keluargaDaftar, keluargaHilang, hitung }` |
| `scripts/cek-subset-tugas.mjs` | diperketat: `yatim` (dipangkas tanpa rumah keluarga) = GAGAL, `intiDipangkas` = GAGAL, kolom `nama_superset/pangkas/tambah`, dan **nama di-ROUTE prompt hilang saat kelas web = GAGAL** |
| `scripts/uji-subset-alat.mjs` | guard jembatan baru (bundel lama = exit 2), pembungkus eval `cdpAman` (halaman reload HMR = exit 3, bukan stack trace), S4 diperketat ke aturan routing katalog, blok S11–S17: cap `<= 20` di gerbang nyata + superset kemampuan pada basis acuan 26 |
| `docs/LAPORAN-SUBSET-SAMBUNG.md` | dokumen ini (baru) |
| `docs/USULAN-SUBSET-SAMBUNG.md` | usulan perbaikan temuan S4 untuk pemilik `src/lib/subsetTugas.ts` (baru) |

Tidak ada berkas lain yang disentuh; tidak ada `git add/commit`; tidak ada kredensial
(semua nilai sensitif, kalau ada, ditulis `[REDACTED]`).

## 2. Tambalan jembatan: sebelum vs sesudah

```ts
// SEBELUM (jembatan berbohong: 23 tool lapor, 20 kirim)
alatKirim: alatUntukTugas(teks, aktif, folder),
berat: tugasBerat(teks),

// SESUDAH (daftar yang SAMA dengan jalur agen)
const lama = alatUntukTugas(teks, aktif, folder);
const kirim = pilihToolTugas(teks, aktif, folder);
return {
  butuhWeb: tugasButuhWeb(teks),
  berat: tugasBerat(teks) || wajibTodo(teks),   // sama dengan beratRun di aiStore.ts
  alatKirim: kirim,
  alatKirimLama: lama,                          // pembanding superset
  dipangkas: lama.filter((t) => !kirim.includes(t)),
  batasTool: BATAS_TOOL_TUGAS,                  // dibaca dari modul, bukan angka salinan
  ...
};
```

**Beda dari `docs/USULAN-SUBSET-TUGAS.md` dan alasannya** (tiga tambahan di luar usulan):

1. `batasTool` dibaca dari `BATAS_TOOL_TUGAS`, bukan literal `20`: angka 20 yang disalin
   ke penguji akan basi begitu modulnya berubah (usulan baris 316-324 hanya menyebut
   `alatKirim`/`berat`).
2. `subsetTugas.hitung(teks, aktif, adaFolder)` + `subsetTugas.bawaan` ditambahkan karena
   kode nyata menuntut dua **basis** berbeda: gerbang nyata app = **63 tool aktif**
   (`TOOL_INTI` 57 + `_WEB_AKTIF` 6, `toolGate.ts:186`; saat laporan ini dibuat masih 62),
   sedangkan angka audit (17/23/20)
   diukur pada basis **26 tool** `TOOL_DIKIRIM_SELALU`. `hitung()` mengukur basis mana pun
   TANPA mengutak-atik gerbang milik pengguna (kalau jembatan mengubah gerbangnya lalu
   lupa mengembalikan, uji merusak keadaan app yang sedang dipakai).
3. `keluarga`/`keluargaDaftar`/`keluargaHilang`/`inti` dibuka karena superset kemampuan
   hanya bisa diuji kalau penguji tahu dua tool mana yang kembar; salinan tabel keluarga
   di dalam skrip uji cepat atau lambat berbeda dari modulnya, dan penguji lalu lulus atas
   tabelnya sendiri.

## 3. Basis angka: 26 (acuan/audit) vs 63 (gerbang nyata)

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Saat laporan ini dibuat,
> gerbang nyata app = **62** (`TOOL_INTI` 56 + `_WEB_AKTIF` 6) dan katalog **67**. Sekarang
> `TOOL_AKTIF_AWAL` (`toolGate.ts:186`) = `TOOL_INTI` **57** + `_WEB_AKTIF` **6** = **63** dan katalog
> **68** (`zephyr_kode` sudah masuk katalog). Angka 62/67 di keluaran verbatim §4–§5 dibiarkan apa adanya.

| basis | isi | `alatUntukTugas` | `pilihToolTugas` |
| --- | --- | --- | --- |
| acuan (audit) | `TOOL_DIKIRIM_SELALU` = **26** tool | 17-23 tool | 17-20 tool |
| gerbang nyata app | 63 tool aktif (inti + web) — dulu 62 | 45-62 tool | 17-20 tool |

Konsekuensi yang harus jujur dicatat: pada basis acuan, `<= 20` hanya memaksa membuang
**kembar** (kemampuan tidak hilang, 0 keluarga hilang). Pada gerbang nyata 62, `<= 20`
memaksa membuang **keluarga utuh** (S17 di bawah) - yang berlaku di sana adalah
*reachability* lewat `tool_search`/`tool_call`, bukan "tanpa pemangkasan".

## 4. Keluaran nyata + kode exit

```
$ npx tsc --noEmit ; echo EXIT_TSC=$?
EXIT_TSC=0
```
(Catatan apa adanya: percobaan pertama pada sesi ini exit 2 -
`src/components/extensions/ExtensionsView.tsx(352,10): error TS2304: Cannot find name 'CATATAN_BAHASA'`,
percobaan kedua `src/lib/unduhInstal.ts(552,38): error TS2304: Cannot find name 'detectLang'`
- keduanya berkas lane lain, ditulis saat pengukuran; pada percobaan ulang kedua galat itu
hilang dan `EXIT_TSC=0`. Tidak ada galat di `src/lib/devBridge.ts`.)

```
$ node scripts/uji-anak-agen.mjs ; echo EXIT_ANAK=$?
kasus: 29, lulus: 29, gagal: 0
HASIL: LULUS — subset <= 20 + inti lengkap, tugas belum selesai bertahan, todo dipaksa di tugas berat
EXIT_ANAK=0
```

```
$ node scripts/cek-subset-tugas.mjs --rinci ; echo EXIT_CEK=$?
katalog=67 tool, aktif-default=26, batas per giliran=20
kelas tugas               lama  kirim <=20  nama_superset pangkas tambah status
baca [baca]               17    17    ya    tidak (tambah)1       1      LULUS
perbaiki+uji [perbaiki+uji+shell]23    20    ya    ya            3       0      LULUS
tulis-banyak [tulis+tulis-banyak]23    20    ya    ya            3       0      LULUS
web [web]                 20    17    ya    tidak (tambah)4       1      GAGAL (nama di-route prompt dipangkas saat kelas web: browser_read)
repo-wide+hapus [uji+shell+hapus]23    18    ya    ya            5       0      LULUS
repo-wide+tulis [tulis+uji+repo-wide]23    20    ya    ya            3       0      LULUS
tanya(ambigu) [baca]      23    19    ya    ya            4       0      LULUS
uji+shell [uji+shell]     23    18    ya    ya            5       0      LULUS
git [panel+git]           17    17    ya    tidak (tambah)3       3      LULUS
jadwal [tulis+uji+jadwal] 23    20    ya    ya            3       0      LULUS
memori [shell+memori]     23    18    ya    ya            5       0      LULUS
panel [panel]             23    19    ya    tidak (tambah)6       2      LULUS

MAKS tool per giliran sesudah pemangkasan: 20 (target <= 20)
kemampuan hilang di semua kasus: 0
dipangkas TANPA rumah keluarga (semua kasus): 0 | tool inti dipangkas: 0
superset per NAMA (lama ⊇ kirim): 8/12 kasus; 4 kasus lain hanya MENAMBAH 7 tool yang jalur lama tidak kirim
nama di-ROUTE prompt (web_search/web_fetch/browser_open/browser_read) hilang saat kelas web: 1 <-- GAGAL
HASIL: GAGAL (1 masalah)
EXIT_CEK=1
```

```
$ node scripts/uji-subset-alat.mjs 9223 ; echo EXIT_APP=$?
     aktif: 62 tool, 5 di antaranya web (web_fetch, browser_open, browser_read…)
     tulis  : kirim=19 berat=true web=false buang-web=0
     ringan : kirim=19 berat=false web=false buang-web=0
     web    : kirim=17 berat=false web=true buang-web=3
     browser-murni: kirim=20 web=true
LULUS  S1   tugas 40+ berkas dinilai BERAT dan tidak butuh web (berat=true, web=false)
LULUS  S2   tugas tulis: semua tool web DIBUANG (0 sisa), katalog menyusut 62->19
LULUS  S3   tugas ringan tidak dipaksa merancang, tool web tetap dibuang (berat=false)
GAGAL  S4   tugas riset web: detektor menyalakan web & SEMUA tool baca yang di-route prompt ikut pada basis acuan (2/3: web_fetch, browser_open); di gerbang nyata 5 tool web tersaring jadi 3 - selisihnya dihitung S17
LULUS  S5   tugas murni-browser tidak pernah kehabisan tool (kirim=20)
LULUS  S8   tanpa folder, list_directory/glob/grep DIBUANG (0 sisa); dengan folder ketiganya ada (3/3)
LULUS  S9   tugas web tanpa folder tetap punya tool (kirim=17) dan tanpa tool folder
LULUS  S6   langkah-1 tugas berat (ber-folder) = rencana + baca saja
LULUS  S7   gerbang rencana siap menyala (todo_write ada di katalog aktif)
LULUS  S10  tanpa folder, gerbang rencana tetap jalan tanpa alat folder
LULUS  S11  jembatan mengirim <= 20 tool di 20 kasus gerbang nyata (maks 20; batas dilaporkan jembatan=20; menembus: -)
LULUS  S12  kemampuan hilang 0 di 20 kasus basis acuan: keluarga(lama) superset keluarga(kirim) (gagal: -)
LULUS  S13  tak ada tool dipangkas TANPA rumah keluarga di basis acuan (yatim: -); tool inti utuh di 20 kasus gerbang nyata (dipangkas: -)
LULUS  S14  tool_search + tool_call ikut di tiap kasus (nyata 20 + acuan 20) supaya yang dipangkas tetap terjangkau (gagal: -)
LULUS  S15  field dipangkas jembatan = (lama \ kirim) & tak ada tool di luar daftar aktif (gagal: -)
     S16 (laporan): pada gerbang nyata 62 aktif, 20 kasus dipangkas jadi <= 20 tool (maks 20); 709 tool/keluarga di luar jendela itu terjangkau lewat tool_search/tool_call
     S17 (laporan): basis acuan 26 aktif = 0 keluarga hilang; gerbang nyata 62 aktif = 168 keluarga hilang, 498 tool terjangkau HANYA lewat tool_search/tool_call
== 14/15 lulus ==
EXIT_APP=1
```

Percobaan pengujian app (karena banyak lane menulis berkas → Vite HMR bisa me-reload
halaman di tengah uji): **3 percobaan, semuanya selesai penuh (72 baris keluaran),
percobaan 1/2/3 exit = 1/1/1, tidak ada `BERHENTI`/reload di tengah uji**. Pada satu
percobaan sebelumnya halaman memang mati di tengah HMR
(`TypeError: Cannot read properties of undefined (reading 'getState')` di guard);
itu sebabnya penguji sekarang membungkus tiap eval dengan `cdpAman` → pesan jelas
+ exit 3, bukan stack trace. CDP port 9223 hidup (`curl http://127.0.0.1:9223/json/version`).

## 5. Tabel sebelum/sesudah per kasus (keluaran nyata `uji-subset-alat.mjs 9223`)

Gerbang nyata 62 aktif (`lama` = `alatUntukTugas`, `kirim` = `pilihToolTugas`):

| kasus | folder | lama | kirim | <=20 | nama_superset | pangkas | tambah |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baca | true | 48 | 19 | ya | tidak | 29 | 1 |
| perbaiki+uji | true | 56 | 20 | ya | ya | 36 | 0 |
| tulis-banyak | true | 56 | 20 | ya | ya | 36 | 0 |
| web | true | 54 | 19 | ya | tidak | 35 | 1 |
| repo-wide+hapus | true | 56 | 20 | ya | ya | 36 | 0 |
| repo-wide+tulis | true | 56 | 20 | ya | ya | 36 | 0 |
| tanya(ambigu) | true | 56 | 20 | ya | ya | 36 | 0 |
| uji+shell | true | 56 | 20 | ya | ya | 36 | 0 |
| git | true | 48 | 20 | ya | tidak | 28 | 5 |
| jadwal | true | 56 | 20 | ya | ya | 36 | 0 |
| memori | true | 56 | 20 | ya | ya | 36 | 0 |
| panel | true | 56 | 20 | ya | tidak | 36 | 3 |
| teks kosong | true | 56 | 20 | ya | ya | 36 | 0 |
| APP tulis 40 | true | 56 | 20 | ya | ya | 36 | 0 |
| APP ringan | true | 56 | 20 | ya | ya | 36 | 0 |
| APP web | true | 54 | 19 | ya | tidak | 35 | 1 |
| APP web-murni | true | 62 | 20 | ya | ya | 42 | 0 |
| APP ringan tanpa folder | false | 45 | 19 | ya | tidak | 26 | 4 |
| APP web tanpa folder | false | 51 | 17 | ya | tidak | 34 | 1 |
| APP tulis 40 tanpa folder | false | 45 | 19 | ya | tidak | 26 | 6 |

Basis acuan 26 tool `TOOL_DIKIRIM_SELALU` (basis angka audit 17/23/20):

| kasus | lama | kirim | <=20 | keluargaHilang | yatim |
| --- | --- | --- | --- | --- | --- |
| baca | 17 | 17 | ya | 0 | 0 |
| perbaiki+uji | 23 | 20 | ya | 0 | 0 |
| tulis-banyak | 23 | 20 | ya | 0 | 0 |
| web | 20 | 17 | ya | 0 | 0 |
| repo-wide+hapus | 23 | 18 | ya | 0 | 0 |
| repo-wide+tulis | 23 | 20 | ya | 0 | 0 |
| tanya(ambigu) | 23 | 19 | ya | 0 | 0 |
| uji+shell | 23 | 18 | ya | 0 | 0 |
| git | 17 | 17 | ya | 0 | 0 |
| jadwal | 23 | 20 | ya | 0 | 0 |
| memori | 23 | 18 | ya | 0 | 0 |
| panel | 23 | 19 | ya | 0 | 0 |
| teks kosong | 23 | 19 | ya | 0 | 0 |
| APP tulis 40 | 23 | 20 | ya | 0 | 0 |
| APP ringan | 23 | 20 | ya | 0 | 0 |
| APP web | 20 | 17 | ya | 0 | 0 |
| APP web-murni | 26 | 20 | ya | 0 | 0 |
| APP ringan tanpa folder | 23 | 20 | ya | 0 | 0 |
| APP web tanpa folder | 20 | 17 | ya | 0 | 0 |
| APP tulis 40 tanpa folder | 23 | 20 | ya | 0 | 0 |

Ringkas: **maks 20 tool/giliran di 20 kasus**, **kemampuan hilang 0** (keluarga) dan
**yatim 0** pada basis acuan; superset **per nama** hanya 12/20 kasus gerbang nyata
(8/12 pada harness Node) - sisanya bukan kehilangan melainkan **penambahan** tool yang
jalur lama tidak kirim (22 tool pada gerbang nyata, 7 pada harness Node). `tool_search`
+ `tool_call` ikut di **semua** kasus (S14), jadi yang dipangkas tetap terjangkau.

## 6. TEMUAN yang membuat penguji TIDAK hijau (jujur, bukan dilonggarkan)

**S4 + kasus `web` harness Node GAGAL: `browser_read` dipangkas untuk tugas web.**

- `browser_read` ada di `TOOL_DIKIRIM_SELALU` (`src/lib/zephyrTools/catalog.ts:619`) dan
  prompt me-route nama itu (`catalog.ts:516`: "baca halaman -> `browser_read`/`web_fetch`";
  aturannya "apa pun yang di-route prompt WAJIB ikut dikirim").
- Bukti keluaran nyata (basis acuan 26, tugas `web`): `lama` = 20 tool memuat
  `browser_open, browser_read, web_fetch`; `kirim` = 17 tool memuat `web_fetch, browser_open`
  tapi **bukan** `browser_read`. Di gerbang nyata 62: 5 tool web tersaring jadi 3
  (tidak ada `web_fetch`/`browser_read`), artinya pada tugas riset web model harus
  `tool_search` dulu untuk membaca sebuah halaman.
- Pemilik perbaikan: **`src/lib/subsetTugas.ts`** (lane lain), bukan `devBridge.ts` -
  jembatan hanya memanggil `pilihToolTugas`. Ini beda pendapat antar-lane: `subsetTugas`
  menganggap `browser_read` kembar `web_fetch` (keluarga `web-cari` punya rumah lain,
  jadi keluarga = 0 hilang), sedangkan aturan routing katalog menuntut **nama** yang
  di-route tetap ikut. Usulan perbaikan konkret: `docs/USULAN-SUBSET-SAMBUNG.md`.
- Karena itu: `cek-subset-tugas.mjs` exit **1**, `uji-subset-alat.mjs 9223` exit **1**
  (`== 14/15 lulus ==`). Angka "kemampuan hilang 0" tetap benar pada level keluarga.

## 7. Yang BELUM terbukti (apa adanya)

1. **Run agen nyata end-to-end = BUTUH APP.** Tidak ada satu pun pengukuran di atas yang
   memutar satu giliran provider sungguhan (model → tool_call → hasil) pada app hidup;
   yang diuji adalah daftar tool yang dibangun jalur kirim + jembatannya. Bukti bahwa
   provider benar-benar menerima <= 20 tool tetap dari `alatTerakhir()` pada run nyata.
2. **Angka run nyata hanya sampai 3 percobaan app** (semuanya exit 1 karena temuan S4);
   tidak ada percobaan pada halaman yang baru di-reload penuh (bundel lama) - guard-nya
   ada (exit 2) tapi belum pernah kelihatan menembak pada sesi ini.
3. **Gerbang lebar 62 tidak "tanpa pemangkasan"**: 168 keluarga-kasus / 498 tool-kasus
   hanya terjangkau lewat `tool_search`/`tool_call`; itu perilaku `subsetTugas.ts` yang
   belum diputuskan benar/salahnya oleh lane mana pun.
4. `src/components/extensions/ExtensionsView.tsx` dan `src/lib/unduhInstal.ts` sedang
   merah di `tsc` saat pengukuran pertama/kedua (galat lane lain, sudah hijau pada
   percobaan ketiga); bukan berkas lane ini.

## 8. Verifikasi ulang (perintah dijalankan lagi dari nol, sesi yang sama)

Perintah di §4 dijalankan ULANG pada keadaan repo yang sama; hasil yang keluar:

```
$ node scripts/cek-subset-tugas.mjs --rinci | tail ; echo EXIT_CEK=$?
MAKS tool per giliran sesudah pemangkasan: 20 (target <= 20)
kemampuan hilang di semua kasus: 0
dipangkas TANPA rumah keluarga (semua kasus): 0 | tool inti dipangkas: 0
superset per NAMA (lama ⊇ kirim): 8/12 kasus; 4 kasus lain hanya MENAMBAH 7 tool ...
nama di-ROUTE prompt (...) hilang saat kelas web: 1 <-- GAGAL
HASIL: GAGAL (1 masalah)
EXIT_CEK=1

$ node scripts/uji-anak-agen.mjs | tail -3 ; echo EXIT_ANAK=$?
kasus: 29, lulus: 29, gagal: 0
HASIL: LULUS — subset <= 20 + inti lengkap, tugas belum selesai bertahan, todo dipaksa di tugas berat
EXIT_ANAK=0

$ npx tsc --noEmit ; echo EXIT_TSC=$?
(no output)
EXIT_TSC=0

$ curl -s -m 3 http://127.0.0.1:9223/json/version
{"Browser":"Edg/154.0.4258.62", ... }        (CDP 9223 hidup)

$ node scripts/uji-subset-alat.mjs 9223 | tail ; echo EXIT_APP=$?
LULUS  S11 ... LULUS  S12 ... LULUS  S13 ... LULUS  S14 ... LULUS  S15 ...
     S16 (laporan...): maks 20
     S17 (laporan...): acuan 26 = 0 keluarga hilang; gerbang 62 = 168 keluarga / 498 tool
== 14/15 lulus ==
EXIT_APP=1
```

Angka identik dengan §4: maks 20 tool/giliran, kemampuan hilang **0**, dan yang merah
tetap **hanya** temuan routing `browser_read` (§6) - bukan regresi baru. Percobaan app
ulangan ini juga **selesai penuh tanpa reload di tengah uji**.

## 9. Cara jalan ulang

```bash
cd /d/Zephyr
node scripts/cek-subset-tugas.mjs --rinci        # harness Node, tanpa app
npx tsc --noEmit
node scripts/uji-anak-agen.mjs                   # lane lain, jangan diubah
node scripts/uji-subset-alat.mjs 9223            # butuh app hidup + CDP 9223
```
