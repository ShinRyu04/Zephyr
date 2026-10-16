/**
 * cek-section-ekstensi.mjs - buktikan bagian EXTENSIONS + tool dari ekstensi.
 *   node scripts/cek-section-ekstensi.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const tg = await import('/src/lib/toolGate.ts');
  const out = {};
  out.sections = tg.SECTION_URUTAN.map((s) => s.id + ':' + s.label);
  out.adaEkstensi = tg.EKSTENSI_ADA;
  out.grupEkstensi = tg.grupEkstensi().map((g) => ({ id: g.id, label: g.label, tools: g.tools.length, section: g.section }));
  out.namaEkstensi = tg.namaToolEkstensi();
  out.totalSemuaTool = tg.SEMUA_TOOL.length;
  /* apakah tool ekstensi benar-benar ikut daftar yang dikenali sekat? */
  out.ekstensiMasukSemua = out.namaEkstensi.every((n) => tg.SEMUA_TOOL.includes(n));
  out.keluhanSekat = tg.periksaSekat();
  return out;
`);
const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('bagian di picker :', s.sections.join(' | '));
console.log('bagian ekstensi ada:', s.adaEkstensi);
console.log('kelompok ekstensi  :', s.grupEkstensi.length);
for (const g of s.grupEkstensi) console.log('   -', g.label, '->', g.tools, 'tool |', g.section);
console.log('nama tool ekstensi :', s.namaEkstensi.length);
console.log('SEMUA_TOOL total   :', s.totalSemuaTool);
console.log('tool ekstensi masuk SEMUA_TOOL:', s.ekstensiMasukSemua ? 'YA' : 'TIDAK');
console.log('keluhan periksaSekat:', s.keluhanSekat.length, s.keluhanSekat.slice(0, 3).join(' | ') || '-');
await cdp.close();
