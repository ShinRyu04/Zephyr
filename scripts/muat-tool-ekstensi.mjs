/**
 * muat-tool-ekstensi.mjs - panggil muatSemuaEkstensi() lalu laporkan tool yang masuk.
 *   node scripts/muat-tool-ekstensi.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const el = await import('/src/lib/extLoader.ts');
  const tg = await import('/src/lib/toolGate.ts');
  await el.muatSemuaEkstensi();
  const out = {};
  out.ringkasan = el.ringkasanLoader();
  out.grupEkstensi = tg.grupEkstensi().map((g) => ({ label: g.label, n: g.tools.length, contoh: g.tools.slice(0, 3) }));
  out.namaEkstensi = tg.namaToolEkstensi();
  out.totalSemuaTool = tg.SEMUA_TOOL.length;
  out.masukSemua = out.namaEkstensi.every((n) => tg.SEMUA_TOOL.includes(n));
  out.keluhan = tg.periksaSekat();
  return out;
`);
const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('ringkasan loader  :', JSON.stringify(s.ringkasan));
console.log('kelompok ekstensi :', s.grupEkstensi.length);
for (const g of s.grupEkstensi) console.log('   -', g.label, '->', g.n, 'tool |', g.contoh.join(', '));
console.log('nama tool ekstensi:', s.namaEkstensi.length);
console.log('SEMUA_TOOL total  :', s.totalSemuaTool);
console.log('masuk SEMUA_TOOL  :', s.masukSemua ? 'YA' : 'TIDAK');
console.log('keluhan sekat     :', s.keluhan.length);
await cdp.close();
