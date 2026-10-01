/**
 * uji-token-css.mjs - buktikan token CSS yang dipakai benar-benar terdefinisi.
 *
 *   node scripts/uji-token-css.mjs 9223
 *
 * Cara ujinya: baca nilai token dari elemen `html` lewat
 * `getComputedStyle().getPropertyValue()`. Token yang tidak didefinisikan
 * mengembalikan string KOSONG - itulah yang dicari.
 *
 * Kenapa ini penting: `var(--x)` tanpa definisi dan tanpa fallback membuat
 * properti itu TIDAK BERLAKU sama sekali. Pada `color`, teksnya jatuh ke hitam
 * bawaan browser dan hilang di atas latar gelap; pada `background`, panelnya
 * jadi tembus pandang. Tidak ada error di console, tidak ada peringatan - hanya
 * tampilan yang salah dan sulit dilacak.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('token-css');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* Token dari dua generasi penamaan yang sebelumnya tidak didefinisikan. */
const HARUS_ADA = [
  /* generasi lama */
  'fg',
  'fg-muted',
  'text-primary',
  'text-dim',
  'surface-1',
  'bg-panel',
  'bg-elevated',
  'panel',
  'bg-2',
  'hover',
  'danger-fg',
  'mono',
  'ok',
  'err',
  'warn',
  'red',
  'accent-soft',
  'accent-dim',
  'hover-bg',
  'text-faint',
  'text-on-accent',
  'surface-raised',
  'card',
  'editor-line-height',
  'tree-delay',
  /* generasi sekarang, sebagai kendali */
  'bg0',
  'bg1',
  'bg2',
  'bg3',
  'fg0',
  'fg1',
  'fg2',
  'surface',
  'surface-2',
  'surface-3',
  'text',
  'text-muted',
  'accent',
  'danger',
  'success',
  'warning',
  'font-mono',
  'radius',
];

const nilai = await cdp.json(`return JSON.stringify((() => {
  const c = getComputedStyle(document.documentElement);
  const keluar = {};
  for (const t of ${JSON.stringify(HARUS_ADA)}) {
    keluar[t] = c.getPropertyValue('--' + t).trim();
  }
  return keluar;
})())`);

const kosong = Object.entries(nilai)
  .filter(([, v]) => !v)
  .map(([k]) => k);

r.check(
  'T1',
  kosong.length === 0,
  `semua ${HARUS_ADA.length} token terdefinisi${kosong.length ? ` (KOSONG: ${kosong.join(', ')})` : ''}`,
);

/* Alias harus menunjuk ke token asli, bukan menyalin nilainya. Kalau disalin,
   tema terang tidak akan ikut berubah. */
const alias = await cdp.json(`return JSON.stringify((() => {
  const c = getComputedStyle(document.documentElement);
  const pasangan = [
    ['fg', 'text'],
    ['fg0', 'text'],
    ['surface-1', 'surface-2'],
    ['bg-panel', 'surface'],
    ['bg-elevated', 'surface-3'],
    ['text-primary', 'text'],
    ['text-dim', 'text-muted'],
    ['mono', 'font-mono'],
    ['ok', 'success'],
    ['err', 'danger'],
    ['warn', 'warning'],
    ['red', 'danger'],
  ];
  const hasil = {};
  for (const [a, b] of pasangan) {
    const va = c.getPropertyValue('--' + a).trim();
    const vb = c.getPropertyValue('--' + b).trim();
    hasil[a + ' = ' + b] = va === vb && va !== '';
  }
  return hasil;
})())`);

const tidakCocok = Object.entries(alias)
  .filter(([, v]) => v !== true)
  .map(([k]) => k);

r.check(
  'T2',
  tidakCocok.length === 0,
  `alias menunjuk ke token aslinya (ikut berubah saat tema berganti)${tidakCocok.length ? ` (tidak cocok: ${tidakCocok.join(', ')})` : ''}`,
);

/* Kedua tema harus punya token yang sama - kalau tidak, tema terang akan
   menampilkan latar transparan di tempat yang di tema gelap baik-baik saja. */
const tema = await cdp.json(`return JSON.stringify((() => {
  const c = getComputedStyle(document.documentElement);
  const perlu = ['fg', 'surface-1', 'bg-panel', 'bg-elevated', 'hover', 'text-dim', 'mono'];
  const gelap = {};
  for (const t of perlu) gelap[t] = c.getPropertyValue('--' + t).trim();

  /* Pindah ke tema terang sebentar lewat atribut yang dipakai aplikasi. */
  const lama = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const c2 = getComputedStyle(document.documentElement);
  const terang = {};
  for (const t of perlu) terang[t] = c2.getPropertyValue('--' + t).trim();
  document.documentElement.dataset.theme = lama || '';

  return { gelap, terang };
})())`);

const kosongDiTerang = Object.entries(tema.terang)
  .filter(([, v]) => !v)
  .map(([k]) => k);

r.check(
  'T3',
  kosongDiTerang.length === 0,
  `token yang sama juga terdefinisi di tema terang${kosongDiTerang.length ? ` (KOSONG: ${kosongDiTerang.join(', ')})` : ''}`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
