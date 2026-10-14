# USULAN PATCH BLOK KONDISIONAL

Item: ZEPH-LARANGAN-BLOK + ZEPH-BLOK-KONDISIONAL (2026-10-14).
Status: USULAN - belum diterapkan ke kode produk. Semua angka di bawah keluaran NYATA
`node scripts/uji-blok-kondisional.mjs` (**69/69 lulus**, 0 GAGAL); laporan lengkap di
`docs/LAPORAN-BLOK-KONDISIONAL.md`.

Kode produk READ-ONLY: berkas ini hanya USULAN (berkas + baris + teks lama/baru).

## 1. Ringkas usulan

| # | Item | Berkas / baris | Inti usulan | Angka hasil ukur |
|---|---|---|---|---|
| P1 | ZEPH-LARANGAN-BLOK | `src/lib/systemPrompt.ts:825-843` | isi `LARANGAN_EN`/`LARANGAN_ID` diganti blok PADAT: 6 larangan lama + cara kerja (satu langkah satu tool, klaim bukan bukti, tool hanya kalau info baru) | blok padat 815 char (id) / 784 char (en); blok inti jadi **7.897 char / 1.975 tok** (id, sisa 103 char) & **7.871 char / 1.968 tok** (en, sisa 129 char) - tetap di bawah 8.000 char / 2.000 tok, **tanpa menyentuh ambang** |
| P2 | ZEPH-BLOK-KONDISIONAL | `src/lib/systemPrompt.ts:872-932` (tabel `KONDISIONAL`) | tambah 2 kelas: `klaimnilai` (angka/klaim nilai, 168 id / 154 en char) + `verifikasi` (prosedur verifikasi mandiri, 211 id / 196 en char) - hanya menempel saat pemicunya ada | 3/3 dan 4/4 probe kelas terpicu, 0 reaksi pada pesan luar topik |
| P3 | ZEPH-BLOK-KONDISIONAL | `src/lib/systemPrompt.ts:7` + `:942-948` | `blokKondisional()` diberi **pemotong prioritas**: kelas kondisional yang tidak muat dibuang, total suntikan <= `BATAS_KARAKTER_SUNTIK` | kombinasi terburuk **1.104 char** (audit) <= 1.200; hemat: tulis kode 213, ubah berkas 815, tanya biasa 0 |
| P4 | opsional | `src/lib/systemPrompt.ts:1071` | bagikan anggaran dengan potongan indeks lewat `suntikanIndeks(kueri, { batasKarakter })` | membuat dua pemakai anggaran 1.200 char itu eksplisit, bukan kebetulan |

Yang **tidak** diusulkan: mengubah `AMBANG_TOKEN_INTI` (tetap 2.000 di `:733`), menghapus aturan wajib,
atau memperbesar `BATAS_KARAKTER_SUNTIK` (tetap 1.200 di `src/lib/zephyrCari.ts:453`).

### Syarat yang mengikat usulan ini (jangan dilewati)

1. **Judul lama `# Batas keras` / `# Hard limits` WAJIB tetap ada** sebagai baris pertama blok padat:
   `scripts/uji-blok-inti.mjs` mencocokkannya di C.4 (`'Batas keras'`) dan C.8 (`'# Hard limits'`).
   Mengganti judul = gate 37/37 MERAH. (Diuji sebagai kasus A.8.)
2. **Tidak ada aturan wajib yang pindah ke kondisional**: 12 aturan wajib tetap di blok inti/caraKerja/aturan;
   kelas kondisional hanya menegaskan/menambah. (Diuji D.wajib tak cond.)
3. **Pemadatan tidak boleh menghilangkan larangan**: 6/6 larangan lama harus masih utuh teksnya. (Diuji A.7.)
4. Perubahan ini tidak menambah token ke blok inti lebih dari sisa anggaran: sisa setelah patch = 103 char (id).

## 2. Patch 1 - blok LARANGAN padat (cara kerja + LARANGAN)

Berkas: `src/lib/systemPrompt.ts`, baris **825-843** (dua konstanta; `blokLarangan()` di `:846-848` tidak perlu diubah).

Teks lama (verbatim):

```
const LARANGAN_EN = [
  '# Hard limits',
  '1. Never invent a value, file, setting, port or doc. Not in the facts above and not read this turn = say so, or look it up.',
  '2. Answer in the active language of the app. The English material above is SOURCE, not the language of your answer.',
  '3. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.',
  '4. Never print secrets (API key, token, SSH key, .env): say where the user can see them.',
  '5. Never run a destructive tool (delete, move, overwrite, force push, kill a process) unless the user asked for it.',
  '6. Never answer a Zephyr question from memory: the facts above + `zephyr_self`; nothing found = the feature does not exist.',
].join('\n');

const LARANGAN_ID = [
  '# Batas keras',
  '1. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas dan tidak dibaca giliran ini = bilang apa adanya, atau cari dulu.',
  '2. Jawab dalam bahasa aktif aplikasi: teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.',
  '3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.',
  '4. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env): sebut di mana user bisa melihatnya.',
  '5. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) tanpa diminta user.',
  '6. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`; tidak ketemu = fiturnya tidak ada.',
].join('\n');
```

Teks baru (siap tempel, 8 poin; ukuran terukur 815 char id / 784 char en):

```
const LARANGAN_EN = [
  '# Hard limits',
  '1. Never invent a value, file, setting, port or doc: not in the facts above = say so, or look it up.',
  '2. Answer in the active language of the app; the English above is SOURCE, not your answer language.',
  '3. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.',
  '4. Never print secrets (API key, token, SSH key, .env); say where the user can see them.',
  '5. Never run a destructive tool (delete, move, overwrite, force push, kill a process) unless the user asked for it.',
  '6. Never answer a Zephyr question from memory: the facts above + `zephyr_self`.',
  '7. One step, one tool; independent reads may go together.',
  '8. Spend a tool call only when it brings something new: answered by the context block = answer from there.',
].join('\n');

const LARANGAN_ID = [
  '# Batas keras',
  '1. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas = bilang apa adanya, atau cari dulu.',
  '2. Jawab dalam bahasa aktif aplikasi; teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.',
  '3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.',
  '4. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env); sebut di mana user bisa melihatnya.',
  '5. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) tanpa diminta user.',
  '6. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`.',
  '7. Satu langkah, satu tool; baca independen boleh digabung.',
  '8. Pakai tool hanya kalau memberi info baru: sudah dijawab blok konteks = jawab dari situ.',
].join('\n');
```

Yang dipangkas (hemat 76 char id / 71 char en) hanya ekor penjelas yang sudah ada di blok `caraKerja`/`aturan`
("dan tidak dibaca giliran ini", "tidak ketemu = fiturnya tidak ada", "Never ... : say where ...", dll);
tiap larangan tetap punya kalimat lengkapnya sendiri (A.7: 6/6 utuh). Baris 3 sudah memuat
"klaim bukan bukti" sekaligus menggantikan aturan verifikasi yang mahal.

Opsional (P1b): perbarui judul komentar dokumen di `:810-824` ("Blok LARANGAN PADAT - item 153" ->
"Blok batas keras + cara kerja (padat)") supaya isinya tidak menyesatkan. Tidak wajib untuk perilaku.

## 3. Patch 2 - dua kelas kondisional baru

Berkas: `src/lib/systemPrompt.ts`, sisipkan **setelah objek kelas `subagent` berakhir di baris 931, sebelum `];` di baris 932**.
Bentuknya mengikuti `interface AturanKondisional` (`:863-870`): `kelas`, `cocok` (regex tanpa `/g`), `teks(bahasa)`.

```
  {
    kelas: 'klaimnilai',
    cocok:
      /\b(berapa|hitung|jumlah|total|nilai|angka|versi|persen|ukuran|token|port|biaya|harga|count|how many|how much|version|price|cost|size)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Aturan tambahan: angka & klaim nilai\n- Setiap angka yang kamu sebut harus datang dari bahan yang kamu baca GILIRAN INI (fakta di atas, isi berkas, keluaran perintah).'
        : '# Extra rule: numbers & value claims\n- Every number you state must come from material you read THIS turn (the facts above, file contents, command output).',
  },
  {
    kelas: 'verifikasi',
    cocok:
      /\b(perbaiki|ubah|ganti|refactor|implementasikan|jalankan|audit|periksa|tinjau|review|verify|fix|change|edit|implement|run)\b|\b(tulis|buat|tambah|susun|write|build|add|create)\b[^.!?]{0,40}\b(kode|fungsi|komponen|modul|berkas|file|test|skrip|script|halaman|helper)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Prosedur tambahan: verifikasi mandiri\n- Sebelum bilang selesai: jalankan pemeriksaan TERKECIL yang membuktikan klaimmu (test/typecheck/build/read_file) lewat tool, lalu baca keluarannya. Ringkasan bukan bukti.'
        : '# Extra procedure: self-verification\n- Before saying done: run the SMALLEST check that proves your claim (test/typecheck/build/read_file) with a tool, then read its output. A summary is not proof.',
  },
```

Ukuran terukur: `klaimnilai` 168 char (id) / 154 char (en); `verifikasi` 211 char (id) / 196 char (en).
Bukti pemicu: `klaimnilai` 3/3 probe (berapa kunci setelan + pintasan; berapa port debug WebView2 + port MCP;
jumlah tool Zephyr), `verifikasi` 4/4 probe (perbaiki error di `src/lib/waktu.ts`; ubah tata letak panel AI;
tulis fungsi parse + jalankan test; audit berkas `src/lib`) - dan **0** dari 4 pesan luar topik.

Catatan: kelas `tabel` (`:891-897`) SUDAH memuat aturan bentuk tabel markdown, jadi "format tabel" tidak
diusulkan ulang di sini. Yang ditambahkan hanya dua kelas di atas.

## 4. Patch 3 - pemotong prioritas di `blokKondisional()`

Teks lama (`src/lib/systemPrompt.ts:942-948`, diikuti `kelasKondisional()` `:935-939` yang tidak perlu diubah):

```
/** Blok kondisional siap sisip: `''` kalau tidak ada kelas yang cocok. */
export function blokKondisional(kueri: string): string {
  const kode = kodeBahasaPrompt();
  return KONDISIONAL.filter((a) => a.cocok.test(kueri || ''))
    .map((a) => a.teks(kode).trim())
    .filter(Boolean)
    .join('\n\n');
}
```

Teks baru:

```
/**
 * Blok kondisional siap sisip: `''` kalau tidak ada kelas yang cocok.
 *
 * Anggarannya dibagi dengan potongan indeks (`BATAS_KARAKTER_SUNTIK`), jadi
 * blok di sini TIDAK boleh menembus batas itu saat beberapa kelas terpicu
 * sekaligus (mis. `model` + `keamanan` = 1.358 char kalau digabung apa adanya).
 * Kelas yang tidak muat DIBUANG UTUH - tidak dipotong di tengah: aturan
 * kondisional memang boleh tidak ikut giliran ini, sedangkan potongan setengah
 * kalimat justru menyesatkan. Urutan `KONDISIONAL` = urutan prioritas; yang
 * paling awal paling dulu dibuang.
 */
export function blokKondisional(kueri: string): string {
  const kode = kodeBahasaPrompt();
  const bagian = KONDISIONAL.filter((a) => a.cocok.test(kueri || ''))
    .map((a) => a.teks(kode).trim())
    .filter(Boolean);
  const muat: string[] = [];
  let total = 0;
  for (const teks of bagian) {
    const tambah = (muat.length ? 2 : 0) + teks.length; // 2 = pemisah '\n\n'
    if (total + tambah > BATAS_KARAKTER_SUNTIK) continue;
    muat.push(teks);
    total += tambah;
  }
  return muat.join('\n\n');
}
```

Dan di baris **7** (impor dari `./zephyrCari`):

```
- import { suntikanIndeks } from './zephyrCari';
+ import { BATAS_KARAKTER_SUNTIK, suntikanIndeks } from './zephyrCari';
```

Hasil ukur dengan pemotong (lapis F harness, satu anggaran bersama untuk blok kondisional):

| Jenis tugas | Total produk+usulan (terburuk) | <= 1.200 char? |
|---|---|---|
| tanya biasa | 0 char / 0 tok | ya |
| tulis kode | 213 char / 54 tok | ya |
| ubah berkas | 815 char / 204 tok (jendela 425 + usulan 213; galat 602 + usulan 213) | ya |
| audit | 1.104 char / 276 tok (tabel+galat 891 + usulan 213) | ya |

Pemotong hanya membuang kalau benar-benar lewat (F.5: 0 pembuangan sia-sia) dan tidak menarik kelas apa pun
di luar topik (F.6: 0 bocor). Catatan kejujuran: pemotong ini baru menurunkan kombinasi terburuk dari
**1.358 char** (model+keamanan, keadaan HARI INI tanpa pemotong) ke <= 1.200 char; ia belum dibuktikan
mengubah perilaku model (butuh uji app - lihat bagian 6).

## 5. Patch 4 (opsional) - anggaran indeks dibuat eksplisit

`src/lib/systemPrompt.ts:1071` memanggil `suntikanIndeks(kueri)` dengan anggaran bawaan 1.200 char
(`src/lib/zephyrCari.ts:453`, dipakai di `:513-517`). Kalau blok kondisional juga dibebankan ke anggaran
yang sama, kirim sisanya:

```
- const indeks = suntikanIndeks(kueri);
+ const kondisional = blokKondisional(kueri);
+ const indeks = suntikanIndeks(kueri, { batasKarakter: Math.max(0, BATAS_KARAKTER_SUNTIK - kondisional.length) });
```

Ini pilihan desain, bukan keharusan: kalau indeks dan kondisional memang punya anggaran terpisah, P4 boleh
dilewati. Harness baru belum mengukur jalur ini (blok indeks di-stub), jadi angkanya tidak diklaim di sini.

## 6. Setelah patch diterapkan (cara membuktikan)

```
npx tsc --noEmit                          # wajib 0 galat
node scripts/uji-blok-inti.mjs            # wajib tetap 37/37 (C.4/C.8 mencocokkan judul lama)
node scripts/cek-batas-inti.mjs           # blok inti wajib tetap <= 8.000 char
node scripts/uji-blok-kondisional.mjs     # harness ini: pindahkan kelas usulan (lapis F) jadi kode
node scripts/ukur-mutu-jawaban.mjs --uji-alat && ... --uji-klaim-nilai && ... --uji-tabel-perender && ... --acuan
```

`docs/LAPORAN-BLOK-KONDISIONAL.md` sudah mencatat angka sebelum patch; sesudah patch, angka A.1-A.4 harus
diperbarui dari keluaran baru (harness membaca dari kode, jadi angkanya ikut berubah sendiri).

## 7. Risiko & batas

- Perubahan ini **belum** dibuktikan mengubah mutu jawaban model: semua angka di atas deterministik dan
  tanpa panggilan model. Uji perilaku nyata masih BUTUH APP (satu sesi chat dengan topik tabel/angka/ubah
  berkas, lalu bandingkan kepatuhan klaim-nilai & verifikasi).
- Pemotongan kelas bersifat **urutan deklarasi** (kelas paling awal paling dulu dibuang). Kalau nanti ada
  kelas yang lebih penting daripada `model`, urutannya harus disengaja diubah - bukan ditambahkan di akhir.
- Angka token memakai perkiraan `ceil(char/4)` yang sama dengan gate lama, bukan tokenizer sungguhan.

