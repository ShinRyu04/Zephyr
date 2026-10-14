import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import { FAKTA_INDEKS, FAKTA_KATEGORI, FAKTA_VERSI } from '../../src/lib/zephyrIndeks';
import { AMBANG_TOKEN_INTI, blokLarangan, faktaInti, kepalaPotret } from '../../src/lib/systemPrompt';
import { BATAS_HASIL_SUNTIK, BATAS_KARAKTER_HASIL, BATAS_KARAKTER_SUNTIK, jumlahEntri, kategoriTersedia, kepalaSuntikanIndeks, suntikanIndeks, versiFakta } from '../../src/lib/zephyrCari';

const keluar = process.env.ANGKA_KELUAR || '';
const off: string[] = JSON.parse(process.env.ANGKA_OFF || '[]');
const kandidat = FAKTA_INDEKS.map((e) => e[1]).filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k)).slice(0, 60);
const data = {
  ambang: AMBANG_TOKEN_INTI,
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  intiUlang: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  batasKarakterSuntik: BATAS_KARAKTER_SUNTIK,
  batasKarakterHasil: BATAS_KARAKTER_HASIL,
  batasHasilSuntik: BATAS_HASIL_SUNTIK,
  kepalaSuntik: kepalaSuntikanIndeks(),
  jumlahEntri: jumlahEntri(),
  versi: FAKTA_VERSI,
  versiFakta: versiFakta(),
  kategoriAngka: kategoriTersedia(),
  kategoriDaftar: FAKTA_KATEGORI,
  indeksJumlah: FAKTA_INDEKS.length,
  kandidat: kandidat.map((k) => [k, suntikanIndeks(k)]),
  kandidatUlang: kandidat.slice(0, 8).map((k) => [k, suntikanIndeks(k)]),
  /* AI-TAHU-100-2: bentuk PENUH tiap kueri (anggaran dilepas ke langit-langit
   * BATAS_KARAKTER_HASIL) = bahan kontrol POSITIF/NEGATIF untuk membuktikan batas
   * TOTAL benar-benar memangkas, dan TIDAK memangkas kueri yang sudah muat. */
  kandidatBesar: kandidat.map((k) => [k, suntikanIndeks(k, { batasKarakter: 100000 })]),
  sempit: kandidat.slice(0, 3).map((k) => [k, suntikanIndeks(k, { batasKarakter: 300 })]),
  batas1: [kandidat[0], suntikanIndeks(kandidat[0], { batas: 1 })],
  batas5: [kandidat[0], suntikanIndeks(kandidat[0], { batas: 5 })],
  off: off.map((q) => [q, suntikanIndeks(q)]),
  kosong: suntikanIndeks(''),
};
writeFileSync(keluar, JSON.stringify(data));
