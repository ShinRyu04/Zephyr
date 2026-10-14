import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR, FAKTA_ZEPHYR_SUMBER } from '../../src/lib/zephyrFakta';
import { AMBANG_TOKEN_INTI, blokLarangan, faktaInti, kepalaPotret } from '../../src/lib/systemPrompt';
import * as C from '../../src/lib/zephyrCari';
import * as D from '../../src/lib/zephyrDokumen';

const daftar: string[] = JSON.parse(process.env.TAHU_UJI ?? '[]');
const keluar = process.env.TAHU_KELUAR ?? '';
const data = {
  ambang: AMBANG_TOKEN_INTI,
  sumberFakta: [...FAKTA_ZEPHYR_SUMBER],
  faktaGenerated: FAKTA_ZEPHYR,
  inti: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  jumlahEntri: C.jumlahEntri(),
  peta: C.petaIndeks(),
  kategori: C.kategoriTersedia(),
  batas: {
    hasilBawaan: C.BATAS_HASIL_BAWAAN,
    hasilMaks: C.BATAS_HASIL_MAKS,
    karakterHasil: C.BATAS_KARAKTER_HASIL,
    hasilSuntik: C.BATAS_HASIL_SUNTIK,
    karakterSuntik: C.BATAS_KARAKTER_SUNTIK,
  },
  kasus: daftar.map((q) => ({
    q,
    suntikan: C.suntikanIndeks(q),
    cocok: C.hitungCocok(q),
    asing: C.kataTakDikenal(q),
    entri: C.cariFakta(q, { batas: 5 }).map((h) => ({ kategori: h.kategori, kunci: h.kunci, skor: h.skor, cara: h.cara ?? 'ketat', teks: h.teks })),
    entriLuas: C.cariFakta(q, { batas: C.BATAS_HASIL_MAKS }).map((h) => ({ kategori: h.kategori, kunci: h.kunci })),
    dok: D.cariDokumen(q).map((h) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
    dokSuntik: D.suntikanDokumen(q),
  })),
};
writeFileSync(keluar, JSON.stringify(data));
