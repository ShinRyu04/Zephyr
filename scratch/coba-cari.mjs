import { cari, BATAS_HASIL_BAWAAN } from '../src/lib/zephyrCari.ts';
const h = cari('panel bawah AI');
console.log('BATAS', BATAS_HASIL_BAWAAN, 'hasil', h.length);
console.log(JSON.stringify(h.slice(0, 3), null, 1).slice(0, 600));
