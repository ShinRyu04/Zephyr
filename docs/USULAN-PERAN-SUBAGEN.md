# Usulan Patch: Sambungkan Aturan Peran ke Sumber Aturan yang Dikirim ke Model

STATUS: **DITERAPKAN** (2026-10-14). Ketiga hunk di bawah sudah masuk ke berkas nyata;
buktinya ada di `docs/LAPORAN-PERAN-SUBAGEN.md` (harness acuan 2/5 → 5/5).

## Ringkas

Aturan peran sub-agen sudah ditulis di `src/lib/subagentRoles.ts`, tetapi teks yang
benar-benar dikirim ke model dirakit dari tempat lain (`src/lib/systemPrompt.ts`), jadi
peta peran itu tidak pernah sampai. Tambalannya: `systemPrompt.ts` **memanggil**
`aturanSubagentPrompt()` sebagai ganti menyalin teksnya, per bahasa, di blok aturan yang
memang dikirim.

## Masalah

1. Tempat aturan dikirim: `src/lib/systemPrompt.ts` – `const EN` (baris 193) dan
   `const ID` (baris 293); elemen array `aturan: [` (EN baris 216, ID baris 316) disusun
   ke `b.aturan` di baris 1126 dan diserahkan lewat kembalian baris 1208.
2. `src/lib/subagentRoles.ts:320` sudah mengekspor `aturanSubagentPrompt()` (teks aturan
   peran + roster batas), tetapi **tidak ada pemanggil** – ekspor mati.
   ```
   $ git show HEAD:src/lib/systemPrompt.ts | grep -c "aturanSubagentPrompt"
   0
   ```
3. Akibatnya prompt rakitan hanya memuat dua baris lama, dan dua baris itu justru memakai
   pemicu **jumlah berkas** (`several files to research ... triggers run_subagents`) –
   tepat yang ditolak harness acuan. Hasil: `node scripts/uji-prompt-subagent2.mjs` 2/5.

## Tambalan

### Hunk 1 — `src/lib/systemPrompt.ts:3` (impor)

```diff
 import { fsRead, instructionRead } from './commands';
+import { aturanSubagentPrompt } from './subagentRoles';
 import { blokPersona, personaAktif } from './personaStore';
```

### Hunk 2 — `src/lib/systemPrompt.ts`, blok **EN**, di dalam `aturan: [` (baris 243–259)

Teks LAMA (dua baris ini yang dihapus):

```ts
    '- Subagents RESEARCH; they do not write files. They are read-only unless the user turned on subagent writes in Settings, which is off by default. Never hand file-writing to a subagent: one asked to write still reports that it finished, because from its side the task is done, and you will be left believing files exist that were never created. So decide by the KIND of work, not the number of files: several files to research (read three modules, compare two folders, look up two APIs) triggers run_subagents, one per area, all in a single round trip; several files to WRITE is not a trigger - you write those yourself. Give each subagent an area no other covers; two reading the same thing waste a call and two writing the same file overwrite each other. A step that needs the previous step\'s output stays in your own hands, in order.',
    '- Before you claim a build is finished, verify it from the disk with a read tool (glob, read_file, list_directory). A summary from a subagent - yours or another agent\'s - is a claim, not proof. If the files are not there, they do not exist.',
```

Teks BARU (yang menggantikannya):

```ts
    // Aturan subagent, satu sumber teks: `aturanSubagentPrompt` di subagentRoles.ts.
    // Teksnya hidup di berkas itu supaya batas peran dan kalimat yang dikirim ke
    // model tidak bisa berbeda; `scripts/uji-peran-subagen.mjs` membandingkan
    // keduanya, dan `scripts/uji-prompt-subagent2.mjs` membaca hasil rakitan ini.
    ...aturanSubagentPrompt('en').split('\n'),
```

### Hunk 3 — `src/lib/systemPrompt.ts`, blok **ID**, di dalam `aturan: [` (baris 333–339)

Teks LAMA (dua baris ini yang dihapus):

```ts
    '- Subagent itu PENELITI, bukan penulis berkas. Mereka read-only kecuali user menyalakan izin tulis subagent di Settings, dan itu mati secara bawaan. Jangan pernah menyerahkan penulisan berkas ke subagent: yang disuruh menulis tetap melapor selesai karena dari sisinya tugasnya memang selesai, dan kamu akan mengira berkasnya ada padahal tidak pernah dibuat. Jadi putuskan dari JENIS pekerjaannya, bukan jumlah berkas: beberapa berkas untuk DITELITI (baca tiga modul, banding dua folder, cari dua API) memicu run_subagents, satu per bagian, dalam satu putaran; beberapa berkas untuk DITULIS bukan pemicu - itu kamu kerjakan sendiri. Beri setiap subagent bagian yang tidak dicakup subagent lain; dua yang membaca hal yang sama membuang panggilan dan dua yang menulis berkas yang sama saling menimpa. Langkah yang butuh hasil langkah sebelumnya kerjakan sendiri, berurutan.',
    '- Sebelum mengaku pekerjaan selesai, buktikan dari disk dengan tool baca (glob, read_file, list_directory). Ringkasan dari subagent - milikmu atau agen lain - adalah klaim, bukan bukti. Kalau berkasnya tidak ada, berarti tidak ada.',
```

Teks BARU:

```ts
    // Aturan subagent, satu sumber teks: `aturanSubagentPrompt('id')` di subagentRoles.ts.
    ...aturanSubagentPrompt('id').split('\n'),
```

### Kenapa memanggil, bukan menyalin teksnya

Menyalin teks yang sama ke dua tempat adalah bentuk kerusakan yang baru saja terjadi
(aturan sudah benar di `subagentRoles.ts`, tetapi yang dikirim masih yang lama). Dengan
`spread` dari satu fungsi, satu-satunya cara mengubah aturan peran adalah mengubah berkas
yang juga memuat batas tool per peran – jadi tabel batas dan kalimatnya tidak bisa
berbeda lagi. Harness baru `scripts/uji-peran-subagen.mjs` mengunci hal itu di kasus
K1–K5 (impor + kedua `spread` + tidak ada salinan lama di `systemPrompt.ts`).

## Verifikasi

```
$ node scripts/util-muat-ulang.mjs 9223
     app siap: Zephyr — Code Editor (2s)

$ node scripts/uji-prompt-subagent2.mjs
panjang prompt: 23065 karakter
  LULUS  aturan baru: subagent meneliti, bukan menulis
  LULUS  aturan baru: jangan serahkan penulisan ke subagent
  LULUS  aturan baru: buktikan dari disk sebelum mengaku selesai
  LULUS  pemicu = jenis pekerjaan, bukan jumlah berkas
  LULUS  aturan LAMA yang salah sudah hilang
== 5/5 lulus ==                                        EXIT=0

$ node scripts/uji-peran-subagen.mjs
== 40 lulus / 0 gagal (total 40 kasus) ==              EXIT=0

$ node scripts/cek-subset-tugas.mjs                    LULUS   EXIT=0
$ node scripts/uji-anak-agen.mjs                       29/29   EXIT=0
$ npx tsc --noEmit                                             TSC_EXIT=0
```

Catatan: prompt dirakit ulang saat halaman hidup dimuat, jadi **muat ulang app wajib**
sesudah menyunting sumber aturan sebelum menjalankan harness acuan. Panjang prompt
bervariasi ±1 karakter antar-jalan karena blok keadaan memuat potret waktu (23065/23066).

## Sisa

- Blok yang dikirim mengikuti `uiLang || 'en'` (`systemPrompt.ts:1125`). Harness acuan
  memeriksa frasa versi INGGRIS; kalau `uiLang` diganti ke `id`, teks yang dikirim
  berbahasa Indonesia dan harness itu perlu pasangan pemeriksaan versi ID.
- Kunci i18n untuk teks peran (bila kelak perlu versi delapan bahasa) belum diusulkan.
