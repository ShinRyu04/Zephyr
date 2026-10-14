# USULAN - Retrieval OTOMATIS untuk Zeph (fakta Zephyr + kode + dokumen)

Status: **USULAN SAJA — tidak diterapkan oleh lane ini.** Kode produk READ-ONLY untuk
lane ini; semua perubahan di bawah adalah teks lama/teks baru yang siap ditempel oleh
pemilik berkasnya. Nomor baris diambil dari isi berkas saat laporan ini ditulis (branch
`feat/ai-panel-vscode-layout`); cari teks lamanya, jangan percaya nomor barisnya saja.

Dasar usulan: angka nyata `scripts/uji-tahu-100p.mjs` (59/59) dan
`scripts/uji-retrieval-otomatis.mjs` (29/29) — lihat
`docs/LAPORAN-RETRIEVAL-DAN-TAHU-100P.md`.

| # | Berkas | Baris | Apa yang diusulkan | Kenapa (bukti angka) |
|---|---|---|---|---|
| U1 | `src/lib/systemPrompt.ts` | 7 + 1071 | panggil `suntikanDokumen(kueri)` per giliran, sejajar `suntikanIndeks(kueri)` | harness: `suntikanDokumen()` **0x dipanggil** di kode produk, padahal 20/20 kueri memberi keluaran nyata saat dipanggil langsung |
| U2 | `src/lib/zephyrCari.ts` | 569-579 | penutup ikut dihitung ke `BATAS_KARAKTER_SUNTIK` | blok nyata sampai **1.559 char** > `BATAS_KARAKTER_SUNTIK` **1.200** |
| U3 | `src/lib/zephyrCari.ts` | 524-526 | kueri yang SEMUA katanya asing dan hasilnya cuma `longgar` -> anggap tidak ada hasil | `zepyr car` -> 8 entri longgar (`hitungCocok`=0, kata `zepyr`+`car` asing) |
| U4 | `src/lib/zephyrDokumen.ts` | 55-56 | catat di komentar bahwa anggaran 1.500 char SUDAH termasuk kepala (kontras dengan U2) | mencegah orang "memperbaiki" yang sudah benar |

---

## U1 - Sambungkan lapis dokumen ke prompt (celah terbesar)

**Berkas:** `src/lib/systemPrompt.ts`

**Teks lama (baris 7, deretan import):**

```ts
import { suntikanIndeks } from './zephyrCari';
```

**Teks baru:**

```ts
import { suntikanIndeks } from './zephyrCari';
import { suntikanDokumen } from './zephyrDokumen';
```

**Teks lama (baris 1071, di dalam array `bagian` milik `systemPromptFor`):**

```ts
    suntikanIndeks(kueri),
```

**Teks baru:**

```ts
    suntikanIndeks(kueri),
    /*
     * Potongan BUNDEL DOKUMEN (`zephyrDokumenData.ts`, 41 berkas yang dipanen
     * saat build): prosa, tabel, dan kutipan berbaris - hal yang TIDAK ada di
     * indeks fakta karena indeks hanya menyimpan nama teknis.
     *
     * Bentuknya sengaja sama dengan `suntikanIndeks()` di atas, dan modulnya
     * sudah ada + teruji: harness membuktikan 20/20 kueri memberi keluaran
     * nyata saat dipanggil langsung. Yang belum ada cuma PEMANGGILNYA: 0x
     * dipanggil di kode produk, jadi isi dokumen sekarang hanya bisa dicapai
     * kalau model ingat memanggil tool `zephyr_self` - persis jalur yang
     * `suntikanIndeks()` dibikin untuk menghapusnya.
     *
     * Anggarannya sendiri sudah termasuk kepala: `BATAS_KARAKTER_SUNTIK`
     * 1.500 char (`formatHasilDokumen(hasil, BATAS_KARAKTER_SUNTIK - kepala.length)`)
     * dan `BATAS_HASIL_SUNTIK` 6 bagian, jadi blok ini tidak bisa membengkakkan
     * prompt (terukur: keluaran dokumen 69-1.260 char pada 20 kueri uji).
     */
    suntikanDokumen(kueri),
```

**Biaya nyata:** blok dokumen terukur **69-1.260 char** pada 20 kueri uji (selalu ada
keluaran, minimal baris pengakuan "tidak memuat kata: …"), semuanya <= 1.500 char. Saat
tidak ada yang cocok, modul tetap mengembalikan satu baris pengakuan - sama seperti jalur
indeks. Itu memang tujuannya: model tahu lapis ini ada dan tahu bedanya "tidak ditemukan"
vs "tidak ada".
**Risiko:** urutan blok menentukan siapa "kata terakhir"; usulan ini menaruh dokumen
SEBELUM `blokKondisional()` dan `blokKeadaanPrompt()` supaya keadaan live tetap paling
akhir, dan aturan larangan tetap paling akhir di blok inti.
**Cara menguji:** jalankan `node scripts/uji-retrieval-otomatis.mjs` — cek F3/F-nya
berubah dari "0x dipanggil" menjadi "1x dipanggil" (harness sudah menghitung titik
panggil nyata, baris komentar tidak dihitung).

---

## U2 - Penutup ikut dihitung ke anggaran suntikan

**Berkas:** `src/lib/zephyrCari.ts` (fungsi `suntikanIndeks`, baris 569-579)

**Teks lama:**

```ts
  const baris: string[] = [];
  let panjang = kepala.length + meta.length + 2;
  const jatah = batasKarakter - 4;
```

**Teks baru:**

```ts
  const baris: string[] = [];
  let panjang = kepala.length + meta.length + 2;
  /* Penutup ikut dihitung. Tanpa ini blok nyata melewati BATAS_KARAKTER_SUNTIK
   * (terukur 1.539-1.559 char > 1.200) karena penutup ditambahkan SETELAH
   * anggaran dihabiskan entri. `Math.max(0, …)` menjaga kasus batasKarakter
   * kecil (batas bawah 300) tidak berubah jadi jatah negatif. */
  const jatah = Math.max(0, batasKarakter - 4 - penutup.length - 1);
```

**Kasus tanpa entri (baris 578)** sudah aman: `[kepala, meta, penutup]` ≈ 300 + ~500 =
~800 char < 1.200. Kalau pemanggil memberi `batasKarakter` kecil (300), penutup saja bisa
melewatinya — kalau itu dianggap masalah, alternatifnya: potong penutup dengan
`penutup.slice(0, batasKarakter)` di jalur tanpa entri.
**Cara menguji:** `node scripts/uji-retrieval-otomatis.mjs` — kolom "info: blok suntikan
TERPANJANG" harus turun dari ~1.539 char menjadi <= 1.200.

---

## U3 - Jangan suntik entri yang cuma "nyerempet" saat semua kata kueri asing

**Berkas:** `src/lib/zephyrCari.ts` (fungsi `suntikanIndeks`, baris 524-526)

**Teks lama:**

```ts
  const tokens = pecahKueri(kueri);
  const hasil = tokens.length ? cariFakta(kueri, { batas }) : [];
  const takDikenal = kataTakDikenal(kueri);
```

**Teks baru:**

```ts
  const tokens = pecahKueri(kueri);
  const takDikenal = kataTakDikenal(kueri);
  /*
   * Semua kata kueri TIDAK ada di indeks DAN hasilnya cuma cocok 'longgar':
   * entri itu bukan jawaban, cuma nyerempet (terukur: "zepyr car" -> 8 entri
   * longgar "Cara kerja/Cara Update", hitungCocok=0, kata `zepyr` dan `car`
   * dua-duanya dilaporkan asing). Menyuntik 8 baris seperti itu lebih mahal
   * daripada mengaku tidak ada: model cenderung mengutipnya sebagai bukti.
   * Jalur "tidak ada hasil" sudah punya penutup jujur + daftar kata asing.
   */
  const mentah = tokens.length ? cariFakta(kueri, { batas }) : [];
  const semuaAsing = tokens.length > 0 && takDikenal.length === tokens.length;
  const hasil = semuaAsing && mentah.length > 0 && mentah.every((h) => h.cara === 'longgar') ? [] : mentah;
```

**Alternatif yang lebih konservatif** (kalau pemilik lane tidak mau mengubah perilaku):
biarkan hasilnya, tapi tambahkan satu baris di penutup saat `semuaAsing`:
`'None of the words of this message appear in the index; the entries below matched on partial words only.'`
**Risiko:** kueri sah yang cuma beda ejaan (`zepyr` → `zephyr`) kehilangan petunjuk. Itu
memang pilihan sadar: salah tulis lebih baik ditanyakan balik daripada dijawab dari
entri yang tidak nyambung.
**Cara menguji:** `node scripts/uji-retrieval-otomatis.mjs` — kueri `zepyr car` harus
turun ke **0 entri** (harus `'ada'` -> `'kosong'` di daftar `KASUS` harness; itu perubahan
di berkas harness milik lane ini, bukan kode produk).

---

## U4 - Cuma komentar: tandai bedanya dua anggaran suntikan

**Berkas:** `src/lib/zephyrDokumen.ts` (baris 55-56, blok komentar konstanta)

**Teks lama:**

```ts
/** Anggaran karakter suntikan otomatis ke prompt. */
export const BATAS_KARAKTER_SUNTIK = 1500;
```

**Teks baru:**

```ts
/**
 * Anggaran karakter suntikan otomatis - TERMASUK kepala
 * (`suntikanDokumen()` mengurangi `kepala.length` dari anggaran ini).
 *
 * Ini BEDA dari `BATAS_KARAKTER_SUNTIK` di `zephyrCari.ts`, yang hanya
 * mengikat kepala + meta + entri dan menambahkan penutup di luar anggaran
 * (blok nyatanya terukur 1.539-1.559 char). Jangan "menyamakan" keduanya
 * tanpa membaca usulan U2 di `docs/USULAN-RETRIEVAL-OTOMATIS.md`.
 */
export const BATAS_KARAKTER_SUNTIK = 1500;
```

---

## U5 - Uji penjaga (usulan, tanpa teks patch)

Supaya celah "modul ada tapi tidak dipanggil" tidak terulang tanpa terdeteksi:

1. Tambahkan ke harness mana pun yang sudah jalan di CI/build (mis.
   `scripts/cek-bundel-docs.mjs`): satu pemeriksaan **"`suntikanDokumen(` dipanggil dari
   `src/lib/systemPrompt.ts`"** — pola hitung titik panggil yang sudah dipakai
   `scripts/uji-retrieval-otomatis.mjs` bagian (F) (buang dulu baris yang dimulai `*`,
   `//`, `/*`). Tanpa pemeriksaan ini, U1 bisa dicabut orang lain diam-diam dan tidak ada
   yang merah.
2. Idealnya hal yang sama untuk `suntikanIndeks(`: sekarang **1x** (`systemPrompt.ts:1071`).
   Angka itu layak dikunci sebagai ekspektasi minimum.

Patch teks untuk (1)/(2) belum ditulis karena kedua berkas itu milik lane lain dan lane
ini belum membacanya sampai baris demi baris; yang bisa dijamin dari sini: polanya sudah
terbukti jalan di harness milik lane ini.

---

## Yang TIDAK diusulkan (dan alasannya)

- **Menaikkan `AMBANG_TOKEN_INTI`** di atas 2.000 token: melanggar item. Blok inti sudah
  1.953/2.000 token; fakta baru harus lewat kelas kondisional, bukan menambah blok inti.
- **Memperbesar `BATAS_HASIL_MAKS` / `BATAS_KARAKTER_HASIL`**: batas itu sudah terbukti
  dipatuhi (20/20 kueri), dan melebarkannya hanya mengembalikan risiko prompt bengkak
  yang sengaja ditutup.
- **Stemming/sinonim** di `pecahKueri`: `docs/BUNDEL-DOKUMEN.md` §8 menyebut pencarian
  tanpa sinonim sebagai pilihan sadar ("pencarian yang mengarang kecocokan lebih mahal
  daripada hasil nol yang jujur"). Kalau nanti mau, jalankan dulu U3 supaya entri
  nyerempet tidak makin banyak.
- **Regenerate indeks/fakta/bundel dokumen**: di luar wewenang lane ini (aturan item).
