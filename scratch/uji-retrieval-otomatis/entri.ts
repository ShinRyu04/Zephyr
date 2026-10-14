import { writeFileSync } from 'node:fs';
import * as C from '../../src/lib/zephyrCari';
import * as D from '../../src/lib/zephyrDokumen';

const daftar: string[] = JSON.parse(process.env.RET_UJI ?? '[]');
const keluar = process.env.RET_KELUAR ?? '';
const ringkas = (h: any) => ({
  kategori: h.kategori,
  kunci: h.kunci,
  skor: h.skor,
  cara: h.cara ?? 'ketat',
  teks: h.teks,
});
const data = {
  batas: {
    cariHasilBawaan: C.BATAS_HASIL_BAWAAN,
    cariHasilMaks: C.BATAS_HASIL_MAKS,
    cariKarakter: C.BATAS_KARAKTER_HASIL,
    suntikHasil: C.BATAS_HASIL_SUNTIK,
    suntikKarakter: C.BATAS_KARAKTER_SUNTIK,
    dokHasilBawaan: D.BATAS_HASIL_BAWAAN,
    dokHasilMaks: D.BATAS_HASIL_MAKS,
    dokKarakter: D.BATAS_KARAKTER_HASIL,
    dokPotongan: D.BATAS_POTONGAN,
    dokSuntikHasil: D.BATAS_HASIL_SUNTIK,
    dokSuntikKarakter: D.BATAS_KARAKTER_SUNTIK,
  },
  jumlahEntri: C.jumlahEntri(),
  versi: C.versiFakta(),
  kasus: daftar.map((q) => {
    const bawaan = C.cariFakta(q);
    const luas = C.cariFakta(q, { batas: 9999 });
    const dok = D.cariDokumen(q);
    const dokLuas = D.cariDokumen(q, { batas: 9999 });
    return {
      q,
      entri: bawaan.map(ringkas),
      entriLuas: luas.map(ringkas),
      cocok: C.hitungCocok(q),
      asing: C.kataTakDikenal(q),
      pecah: C.pecahKueri(q),
      suntikan: C.suntikanIndeks(q),
      format: C.formatHasil(luas),
      formatBawaan: C.formatHasil(bawaan),
      dok: dok.map((h: any) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
      dokLuas: dokLuas.map((h: any) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
      dokSuntik: D.suntikanDokumen(q),
      dokFormat: D.formatHasilDokumen(dokLuas),
    };
  }),
};
writeFileSync(keluar, JSON.stringify(data));
