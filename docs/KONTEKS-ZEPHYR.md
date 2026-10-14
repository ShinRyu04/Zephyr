# KONTEKS ZEPHYR — `.zephyr-context.md` dan aturan penyaringannya

Catatan ini ditulis dari **isi kode nyata**, bukan dari niat: tiap aturan di bawah
punya rujukan `berkas:baris`. Angka hasil uji diambil dari menjalankan harness,
bukan dari menghitung di kepala.

| Berkas | Peran |
| --- | --- |
| `src/lib/konteksZephyr.ts` (**495 baris**) | aturan konteks workspace: nama berkas, batas ukuran, daftar blokir, penyaring rahasia, jalur tulis |
| `src/lib/suntikKonteks.ts` (BARU, 489 baris) | memakai isi berkas itu sebagai blok konteks di dalam SATU giliran agen (lihat `docs/USULAN-SUNTIK-KONTEKS.md` untuk cara menyambungkannya) |
| `scripts/uji-konteks-zephyr.mjs` | harness modul konteks — **11/11 lulus** |
| `scripts/uji-suntik-konteks.mjs` (BARU) | harness penyusunan giliran — **17/17 lulus** |

---

## 1. Apa yang dijaga berkas `.zephyr-context.md`

Aplikasi mengelola satu berkas di akar workspace supaya konteks pekerjaan **tidak
hilang antar sesi**: tugas terakhir, rencana, berkas yang dibuat, dan hasil run.
Kontrak dasarnya dinyatakan langsung di kode:

| Aturan | Rujukan | Nilai nyata |
| --- | --- | --- |
| Nama berkas | `src/lib/konteksZephyr.ts:27` | `.zephyr-context.md` |
| Batas ukuran | `src/lib/konteksZephyr.ts:30` | `16 * 1024` = **16384 byte** |
| Judul bagian aplikasi | `src/lib/konteksZephyr.ts:33` | `## Konteks aplikasi (dikelola Zephyr)` |
| Judul bagian agen | `src/lib/konteksZephyr.ts:36` | `## Catatan agen` |
| Penanda potongan | `src/lib/konteksZephyr.ts:39` | `> [!catatan] Isi dipotong aplikasi:` |

Fungsi yang menjaga aturan itu: `pecahBagian` (`:291`) memisahkan bagian aplikasi
dari bagian agen, `bagianAplikasi` (`:313`) membuat isi bagian aplikasi, dan
`batasiUkuran(teks, batas = BATAS_BYTE)` (`:477`) memotong pada batas 16 KB.
Karena bagian agen dipisah, **update aplikasi tidak menghapus catatan yang ditulis
model** — bagiannya diganti sendiri-sendiri, bukan ditimpa borongan.

## 2. Batas: tidak boleh kemana-mana

| Aturan | Rujukan | Nilai nyata |
| --- | --- | --- |
| Berkas yang ditolak | `src/lib/konteksZephyr.ts:82` | `BERKAS_DIBLOKIR` — **21 entri** |
| Pemeriksa nama berkas | `src/lib/konteksZephyr.ts:201` | `berkasDiblokir(namaBerkas)` |
| Tolak jalur keluar akar | `src/lib/konteksZephyr.ts:242` | `diDalamAkar(akar, jalur)` |
| Jalur tulis | `src/lib/konteksZephyr.ts:258` | `jalurKonteks(akar, nama = NAMA_KONTEKS)` |
| Rencana tulis | `src/lib/konteksZephyr.ts:379` | `rencanaTulis(...)` |

Jumlah 21 entri itu **hasil hitung saat modul dimuat** (`BERKAS_DIBLOKIR.length`),
bukan angka dari dokumen lama. Artinya daftar boleh bertambah tanpa membuat
dokumen ini berbohong — kalau angkanya berubah, uji yang akan menunjukkannya.

## 3. Rahasia: satu penyaring, tidak ada jalur tunda

| Aturan | Rujukan | Nilai nyata |
| --- | --- | --- |
| Aturan rahasia | `src/lib/konteksZephyr.ts:117` | `ATURAN_RAHASIA` — **15 aturan** |
| Cari temuan | `src/lib/konteksZephyr.ts:155` | `cariRahasia(teks)` |
| Ganti nilai | `src/lib/konteksZephyr.ts:168` | `redaksi(teks)` |
| Saring + laporan | `src/lib/konteksZephyr.ts:195` | `saring(teks)` → `{ teks, temuan }` |

15 aturan yang benar-benar aktif (dibaca dari `ATURAN_RAHASIA.map(a => a.nama)`):

```
kunci-anthropic, kunci-openai, kunci-github, token-github-pat, kunci-aws,
kunci-google, token-slack, jwt, kunci-privat-ssh, kunci-privat-pg,
penugasan-kunci, berkas-env, berkas-kunci, berkas-kredensial, ssh-privat
```

Sifatnya dibuktikan langsung, bukan diklaim:

```
$ node --input-type=module -e "... saring('token=ghp_' + 'z'.repeat(24)).teks"
token=«disensor»
```

`saring()` mengembalikan **dua hal**: teks yang sudah diganti dan daftar `temuan`
(nama aturan + cuplikan yang sudah disensor). Jadi pemanggil tidak perlu menebak
apakah ada yang tersensor — ada atau tidaknya tertulis di hasilnya.

## 4. Bagaimana `suntikKonteks.ts` memakai semua ini

`src/lib/suntikKonteks.ts` menerima **isi** berkas konteks sebagai argumen
(`BahanGiliran.konteks`) — bukan membacanya sendiri, karena modul itu murni (tanpa
IO). Aturannya:

0. anggaran total satu giliran = `BATAS_BYTE_GILIRAN`
   (`src/lib/suntikKonteks.ts:59`) = `64 * 1024`; yang boleh diringkas:
   `RINGKAS_RIWAYAT_BYTE` (`:62`) 800 byte, `RINGKAS_KONTEKS_BYTE` (`:65`) 4 KB;
   `KEPALA_KONTEKS` (`:71`) menandai blok konteks;
1. isi berkas → **selalu** lewat penyaring sebelum masuk daftar pesan:
   `const sensor = (teks: string): string => {` (`src/lib/suntikKonteks.ts:265`)
   dipanggil untuk konteks (`:291`), riwayat (`:311`), antrean (`:332`), tugas
   (`:357`), permintaan (`:369`). Tidak ada cabang yang menaruh teks ke daftar
   pesan tanpa lewat `sensor` — dan itu memang yang diperiksa uji S4/S5, karena
   itulah cara nilai `.env` pernah ikut terkirim;
2. blok konteks ditaruh **paling depan**, sebagai `system`, dengan kepala
   `KEPALA_KONTEKS` (`src/lib/suntikKonteks.ts:71`, dipasang di `:291`);
3. konteks adalah satu-satunya blok yang **boleh diringkas lalu dibuang** saat
   anggaran tidak cukup (`RINGKAS_KONTEKS_BYTE`, `src/lib/suntikKonteks.ts:65`;
   pemotongan di `:414`); permintaan, antrean, dan tugas **tidak pernah** dibuang —
   dasarnya bendera `wajib` (`src/lib/suntikKonteks.ts:128`, dipakai di `:228`);
4. berkas belum ada (`konteks: null`) **bukan error**: giliran tetap jalan dan
   alasannya masuk `laporan.peringatan` — dibuktikan uji S6.

## 5. Angka uji (dijalankan 14 Okt 2026)

```
$ node scripts/uji-konteks-zephyr.mjs | tail -2
== 11/11 lulus ==

$ node scripts/uji-suntik-konteks.mjs | tail -2
== 17/17 lulus ==
```

Kasus yang menyangkut konteks di harness penyusunan giliran:

| Kasus | Yang dibuktikan |
| --- | --- |
| S4 | konteks berisi 3 rahasia → tidak satu pun nilai aslinya muncul di keluaran |
| S5 | rahasia di riwayat & permintaan juga tersensor (bukan cuma jalur konteks) |
| S6 | konteks belum ada → jalan tanpa error, alasannya dilaporkan |
| S12 | konteks 9 KB diringkas ke ≤4 KB, lalu **dibuang** kalau anggaran tetap tidak muat |
| S16 | riwayat pendek tidak dipotong sama sekali (anggaran tidak agresif) |

## 6. Yang BELUM tersambung (jangan diklaim sudah)

- `src/lib/aiStore.ts:1300-1408` menulis **berkas yang sama** lewat jalur
  sendiri (`NAMA_KONTEKS_KERJA` di `:1300`, `siapkanKonteksKerja` di `:1327`,
  `catatHasilKonteks` di `:1361`) — **duplikat** dari `konteksZephyr.ts`, bukan
  pemakaian ulang, dan belum menulis lewat `rencanaTulis`/`batasiUkuran`.
- Berkas itu **sudah dibaca** ke system prompt lewat `konteksMemoriProyek()`
  (`src/lib/aiStore.ts:211` diimpor, dipanggil di `:5062`, digabung di `:5068`),
  tapi apakah jalur itu melewati `saring()` **tidak diperiksa dari lane ini** —
  jadi jangan dianggap sudah aman.
- Penyambungan `suntikKonteks.ts` ke giliran agen **belum dikerjakan** (berkas
  `src/lib/aiStore.ts` milik lane lain). Usulan tambalannya, lengkap dengan
  baris dan diff, ada di `docs/USULAN-SUNTIK-KONTEKS.md`.
- Status `npx tsc --noEmit` terakhir (14 Okt 2026): **2 galat**, keduanya di
  `src/lib/subsetTugas.ts:53-54` (TS6133 `'bentukTugas'`/`'tugasButuhWeb'` tidak
  terpakai) — milik lane lain; `src/lib/suntikKonteks.ts` tidak muncul satupun.
  Angka galat total berubah-ubah antar lane, jadi ukur ulang sebelum mengutip.
