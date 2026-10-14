# Laporan Peran Sub-Agen

STATUS: **SELESAI** (2026-10-14). Harness acuan `scripts/uji-prompt-subagent2.mjs` naik
**2/5 → 5/5** karena aturan peran sekarang dirakit dari berkas yang dikirim ke model.
Harness acuan **tidak disentuh**.

## 1. Ringkas

- Aturan peran sub-agen hidup di `src/lib/subagentRoles.ts` (`ROSTER_SINGKAT`,
  `batasTool`, `dilarang`, `kasusTepi`, dan teks aturan via `aturanSubagentPrompt()`).
- Sebelumnya ekspor `aturanSubagentPrompt()` **mati** – tidak ada pemanggil – sehingga
  prompt yang dikirim ke model tetap memakai teks lama. Itulah sebab 2/5.
- Sekarang `src/lib/systemPrompt.ts` (blok aturan EN dan ID) memanggilnya; prompt
  rakitan memuat keempat gagasan yang dituntut harness, dan frasa lama tetap hilang.
- Bukti prompt rakitan dibaca apa adanya lewat halaman hidup (CDP), jadi sesudah
  menyunting sumber, app **harus dimuat ulang**: `node scripts/util-muat-ulang.mjs 9223`.

## 2. Siapa yang membangun prompt anak agen (hasil telusur nyata)

| Berkas:baris | Peran |
| --- | --- |
| `src/lib/systemPrompt.ts:962` | `export function systemPromptFor(...)` – titik rakit prompt sistem yang dikirim ke model |
| `src/lib/systemPrompt.ts:193` | `const EN: BlokPrompt` – blok bahasa Inggris |
| `src/lib/systemPrompt.ts:216` | `aturan: [` milik **EN** – tempat aturan teks dikirim |
| `src/lib/systemPrompt.ts:293` | `const ID: BlokPrompt` – blok bahasa Indonesia |
| `src/lib/systemPrompt.ts:316` | `aturan: [` milik **ID** |
| `src/lib/systemPrompt.ts:1123-1128` | perakitan final: `b.caraKerja`, `lapisan(...)`, `aturanRute(uiLang \|\| 'en')` (1125), **`b.aturan` (1126)** |
| `src/lib/systemPrompt.ts:1208` | `return { identitas, caraKerja: ..., aturan: b.aturan }` – blok aturan diserahkan ke pemanggil |
| `src/lib/subagentRoles.ts:320` | `export function aturanSubagentPrompt(bahasa)` – **satu-satunya sumber teks aturan peran** |

Kesimpulan: aturan yang benar-benar sampai ke model adalah elemen array
`EN.aturan` / `ID.aturan`, dipilih menurut `settings.general.uiLang || 'en'`
(`systemPrompt.ts:1125`). Tidak ada jalur lain yang menambahkan aturan sub-agen.

## 3. Akar masalah: kenapa dulu 2/5

Harness acuan memeriksa 5 kondisi pada prompt rakitan: 4 frasa wajib + 1 frasa lama
harus hilang.

- `src/lib/subagentRoles.ts` sudah memuat teks yang benar, tetapi ekspornya tidak
  dipanggil siapa pun. Bukti keadaan SEBELUM (versi ter-commit):
  ```
  $ git show HEAD:src/lib/systemPrompt.ts | grep -c "aturanSubagentPrompt"
  0
  ```
- Karena itu prompt rakitan hanya memuat 2 baris lama, sehingga hanya 2 dari 5 kondisi
  lulus: "buktikan dari disk" (frasa itu memang sudah ada di baris lama) dan "aturan
  LAMA yang salah sudah hilang" (frasa lama memang sudah tidak ada di `src/` sebelum
  lane ini).

## 4. Titik sambung (berkas + baris) – yang dipakai sekarang

| Berkas:baris | Isi |
| --- | --- |
| `src/lib/systemPrompt.ts:3` | `import { aturanSubagentPrompt } from './subagentRoles';` |
| `src/lib/systemPrompt.ts:255-259` | blok **EN**: 2 baris aturan lama diganti komentar + `...aturanSubagentPrompt('en').split('\n'),` |
| `src/lib/systemPrompt.ts:338-339` | blok **ID**: 2 baris aturan lama diganti komentar + `...aturanSubagentPrompt('id').split('\n'),` |

Isi teks yang kini dikirim (delapan baris, dari `src/lib/subagentRoles.ts:322-331`):
subagent **meneliti, bukan menulis**; **jangan serahkan penulisan berkas** ke subagent;
pemicunya **jenis pekerjaan, bukan jumlah berkas**; peran baca-saja tidak boleh
menulis; **buktikan dari disk** sebelum mengaku selesai; plus satu tabel roster
peran → batas.

Titik panggil terbukti hanya dua (per bahasa), tidak ada salinan teks yang tertinggal:

```
$ grep -rn "aturanSubagentPrompt" src/
src/lib/subagentRoles.ts:320:export function aturanSubagentPrompt(bahasa: string): string {
src/lib/systemPrompt.ts:3:import { aturanSubagentPrompt } from './subagentRoles';
src/lib/systemPrompt.ts:255:    // Aturan subagent, satu sumber teks: `aturanSubagentPrompt` di subagentRoles.ts.
src/lib/systemPrompt.ts:259:    ...aturanSubagentPrompt('en').split('\n'),
src/lib/systemPrompt.ts:338:    // Aturan subagent, satu sumber teks: `aturanSubagentPrompt('id')` di subagentRoles.ts.
src/lib/systemPrompt.ts:339:    ...aturanSubagentPrompt('id').split('\n'),
```

Frasa lama kini hanya hidup sebagai catatan di `subagentRoles.ts` (dan di dalam
harness), bukan di teks yang dibangun:

```
$ grep -rln "More than one file means more than one subagent" src/ scripts/
src/lib/subagentRoles.ts        <- komentar penjelas, bukan teks yang dibangun
scripts/uji-peran-subagen.mjs
scripts/uji-prompt-subagent.mjs
scripts/uji-prompt-subagent2.mjs
```

## 5. Angka nyata sebelum/sesudah (apa adanya)

**SEBELUM**

```
$ node scripts/uji-prompt-subagent2.mjs
panjang prompt: 22893 karakter

  GAGAL  aturan baru: subagent meneliti, bukan menulis
  GAGAL  aturan baru: jangan serahkan penulisan ke subagent
  LULUS  aturan baru: buktikan dari disk sebelum mengaku selesai
  GAGAL  pemicu = jenis pekerjaan, bukan jumlah berkas
  LULUS  aturan LAMA yang salah sudah hilang

== 2/5 lulus ==
EXIT=1
```

**SESUDAH** (diawali `node scripts/util-muat-ulang.mjs 9223` → `app siap: Zephyr — Code Editor (2s)`)

```
$ node scripts/uji-prompt-subagent2.mjs
panjang prompt: 23065 karakter

  LULUS  aturan baru: subagent meneliti, bukan menulis
  LULUS  aturan baru: jangan serahkan penulisan ke subagent
  LULUS  aturan baru: buktikan dari disk sebelum mengaku selesai
  LULUS  pemicu = jenis pekerjaan, bukan jumlah berkas
  LULUS  aturan LAMA yang salah sudah hilang

== 5/5 lulus ==
EXIT=0
```

Panjang prompt +173 karakter (±1: blok keadaan memuat potret waktu) = delapan baris
teks aturan baru dari `subagentRoles.ts`.

**Harness lain (sesudah, apa adanya)**

```
$ node scripts/uji-peran-subagen.mjs
== 40 lulus / 0 gagal (total 40 kasus) ==        EXIT=0

$ node scripts/cek-subset-tugas.mjs              LULUS   EXIT=0
$ node scripts/uji-anak-agen.mjs                 29/29   EXIT=0
$ npx tsc --noEmit                                       TSC_EXIT=0
```

Catatan tsc (apa adanya): semasa lane ini memverifikasi (07:37 dan 07:49, waktu mesin),
`npx tsc --noEmit` **0 error** (TSC_EXIT=0) — direkam dua kali. Pada pukul 07:49:47
muncul berkas **UNTRACKED** `src/lib/bacaKode.ts` dari lane lain (6 detik sesudah
suntingan terakhir lane ini) yang merujuk nama tak terdefinisi
`BATAS_BERKAS_PER_PANGGILAN` (`src/lib/bacaKode.ts:154`), sehingga tsc sesudahnya
menjadi `TSC_EXIT=2` dengan satu error itu. Berkas tersebut bukan milik lane ini dan
tidak disentuh lane ini (`git status` → `?? src/lib/bacaKode.ts`).

Catatan penting: kenaikan 5/5 ini **bukan** karena harness dilunakkan – berkas
`scripts/uji-prompt-subagent2.mjs` tidak pernah ditulis di lane ini dan ceknya masih
menuntut frasa yang sama persis. Yang berubah adalah sumber yang dikirim ke model.
Simulasi patch di `scripts/uji-peran-subagen.mjs` (kasus K1–K5) diganti menjadi
pemeriksaan sambungan nyata: impor + kedua `spread` + hilangnya salinan lama.

## 6. Sisa yang belum

1. **Harness acuan menguji frasa versi INGGRIS.** Blok yang dikirim dipilih menurut
   `uiLang || 'en'` (`systemPrompt.ts:1125`). Kalau `uiLang` diganti ke `id`, teks yang
   dikirim berbahasa Indonesia (perilaku yang benar) sehingga harness itu akan membaca
   teks ID dan merah – perlu pasangan pemeriksaan versi ID bila harus hijau di dua
   bahasa. Keadaan hari ini `uiLang=en` (prompt rakitan berisi teks Inggris).
2. **Verifikasi LIVE end-to-end** bahwa anak agen benar-benar DITOLAK saat mencoba
   menulis (`scripts/uji-subagent-tulis.mjs` / `scripts/uji-batas-tulis.mjs`) belum
   dijalankan di lane ini. Yang dibuktikan di sini: sumber teks + peta batas peran +
   prompt rakitan.
3. `scripts/uji-prompt-subagent.mjs` (versi 1) masih menuntut frasa LAMA **ada**
   (`1/3`). Harness itu usang dan sudah begitu SEBELUM lane ini
   (`git show HEAD:src/lib/systemPrompt.ts | grep -c "More than one file means..."` = 0).
   Bukan regresi; kandidat diarsipkan, bukan dihapus.
4. Kunci i18n untuk teks peran (bila kelak perlu versi delapan bahasa) belum diusulkan.
5. Sisa warisan yang tidak disentuh lane ini: `devBridge.ts:41-47` (impor `subsetAlat`)
   dan `devBridge.ts:316-324` (`t`/bridge). Bukan bagian peran sub-agen.
6. `npx tsc --noEmit` saat ini (07:52) `TSC_EXIT=2`: satu error dari berkas **lane lain**
   yang masih UNTRACKED, `src/lib/bacaKode.ts:154` (`BATAS_BERKAS_PER_PANGGILAN` tak
   terdefinisi). Lane ini mencatat tsc 0 dua kali sebelum berkas itu muncul; perbaikan
   berkas tersebut bukan wewenang lane ini.
