/* Alat ukur (scratch, bukan bagian aplikasi): seksi & bullet blok fakta Zephyr
   pada nilai RUNTIME-nya (setelah template literal dievaluasi), untuk memilih
   bagian mana yang layak pindah ke blok kondisional. */
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';

const tok = (n: number) => Math.ceil(n / 4);
console.log(`TOTAL runtime: ${FAKTA_ZEPHYR.length} char ~ ${tok(FAKTA_ZEPHYR.length)} token\n`);

console.log('=== JUDUL SEKSI (baris mulai #) ===');
for (const b of FAKTA_ZEPHYR.split('\n')) {
  if (b.startsWith('#')) console.log(`${String(b.length).padStart(5)} char  ${String(tok(b.length)).padStart(4)} tok  ${b.slice(0, 80)}`);
}

console.log('\n=== BULLET TOP-LEVEL (baris mulai "- ") ===');
for (const b of FAKTA_ZEPHYR.split('\n')) {
  if (b.startsWith('- ')) console.log(`${String(b.length).padStart(5)} char  ${String(tok(b.length)).padStart(4)} tok  ${b.slice(0, 70)}`);
}

const i = FAKTA_ZEPHYR.indexOf('- "AI Models" (Settings group');
const akhir = i < 0 ? -1 : FAKTA_ZEPHYR.indexOf('\n- ', i + 3);
const mulai = i < 0 ? -1 : FAKTA_ZEPHYR.lastIndexOf('\n- ', i);
console.log(`\nAI Models: mulai=${mulai} idx=${i} akhir=${akhir} panjang=${i < 0 ? 0 : akhir - mulai - 1}`);
if (i >= 0) console.log(`tanpa bullet itu: ${FAKTA_ZEPHYR.length - (akhir - mulai - 1)} char ~ ${tok(FAKTA_ZEPHYR.length - (akhir - mulai - 1))} token`);
