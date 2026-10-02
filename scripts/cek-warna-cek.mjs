/**
 * cek-warna-cek.mjs - buktikan kotak centang terisi dengan aksen, bukan putih.
 *
 *   node scripts/cek-warna-cek.mjs [port]
 *
 * Yang diperiksa warna TERHITUNG, bukan nilai CSS yang tertulis: satu aturan
 * bisa ada di berkas dan tetap tidak berlaku karena kalah prioritas, dan itu
 * persis jenis kesalahan yang sedang dicari.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const h = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Buka picker kalau belum terbuka. */
  if (!document.querySelector('[data-testid="toolgate"]')) {
    document.querySelector('[data-testid="ai-toolgate"]').click();
    await tidur(300);
  }
  /* Pastikan ada yang tercentang supaya kotak terisinya bisa diperiksa. */
  const ada = document.querySelector('.tg-row.is-on');
  if (!ada) {
    document.querySelector('[data-testid="toolgate-all-on"]').click();
    await tidur(250);
  }

  const kotak = document.querySelector('.tg-row.is-on .tg-kotak');
  if (!kotak) return { adaKotak: false };

  const cs = getComputedStyle(kotak);
  const svg = kotak.querySelector('svg');
  const akar = getComputedStyle(document.documentElement);

  return {
    adaKotak: true,
    latarKotak: cs.backgroundColor,
    borderKotak: cs.borderColor,
    warnaCentang: svg ? getComputedStyle(svg).color : '(tidak ada svg)',
    varCekBiru: akar.getPropertyValue('--cek-biru').trim(),
    varAksen: akar.getPropertyValue('--accent').trim(),
  };
})())`);

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
};

/* Ambil tiga komponen rgb dari string computed style. */
const rgb = (s) => (s.match(/\d+/g) || []).map(Number);

if (!h.adaKotak) {
  console.log('  GAGAL  kotak tercentang tidak ditemukan');
  console.log('\n== 0/1 lulus ==');
  await cdp.close();
  process.exit(1);
}

const latar = rgb(h.latarKotak);
const centang = rgb(h.warnaCentang);

console.log('\n== Warna kotak centang terisi ==');
console.log('  latar kotak   : ' + h.latarKotak);
console.log('  warna centang : ' + h.warnaCentang);

/* Putih = ketiga kanal sama dan terang. Kalau itu yang terjadi, berarti warnanya
   gagal berlaku dan jatuh ke bawaan - persis keluhan yang dilaporkan. */
const putih = latar.length >= 3 && latar[0] > 240 && latar[1] > 240 && latar[2] > 240;
cek('latar kotak BUKAN putih', !putih, { latar: h.latarKotak });

/* Harus berwarna: jarak antar kanal cukup jauh. */
const jarak = Math.max(...latar.slice(0, 3)) - Math.min(...latar.slice(0, 3));
cek('latar kotak berwarna (bukan abu)', jarak > 30, { jarak, latar: h.latarKotak });

/* Centang putih itu benar - ia duduk di atas kotak pekat. */
const centangPutih = centang.length >= 3 && centang[0] > 230 && centang[1] > 230 && centang[2] > 230;
cek('centang putih (kontras di atas kotak)', centangPutih, { centang: h.warnaCentang });

/* Variabel harus terdefinisi, bukan kosong. */
cek('--cek-biru terdefinisi', h.varCekBiru.length > 0, { nilai: h.varCekBiru });

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
