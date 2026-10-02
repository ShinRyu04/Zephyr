/**
 * verify-tool-inti.mjs - uji himpunan 40 tool inti.
 *
 *   node scripts/verify-tool-inti.mjs 9223
 *
 * Klaim yang diperiksa: 76 tool terlalu banyak untuk dibaca sekaligus, dan
 * yang paling sering dipakai harus diangkat. Yang diuji bukan "ada 40 nama di
 * sebuah daftar" - itu tidak membuktikan apa pun - melainkan bahwa daftarnya
 * KONSISTEN dan BENAR-BENAR bagian dari tool yang terdaftar.
 *
 *   I1  jumlahnya 40 (sesuai maksud, bukan kebetulan)
 *   I2  setiap nama di daftar inti MEMANG terdaftar di AGENT_TOOLS
 *   I3  tidak ada nama kembar
 *   I4  setiap tool inti punya grup (supaya tidak ada yang tak terjangkau)
 *   I5  seluruh grup inti bisa dijangkau dari daftar inti
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('tool-inti');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const gate = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'toolGate.ts');
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');

  const terdaftar = (tools.AGENT_TOOLS || []).map((t) => t.spec.name);
  const inti = gate.TOOL_INTI || [];

  /* Nama di daftar inti yang TIDAK terdaftar sebagai tool - ini yang paling
     berbahaya: ia akan tampil di daftar tapi gagal saat dipanggil. */
  const hantu = inti.filter((n) => !terdaftar.includes(n));

  /* Nama kembar. */
  const kembar = inti.filter((n, i) => inti.indexOf(n) !== i);

  const peta = {};
  for (const g of gate.TOOL_GROUPS || []) for (const t of g.tools || []) peta[t] = g.id;
  const tanpaGrup = inti.filter((n) => !peta[n]);

  const grupInti = [...new Set(inti.map((n) => peta[n]).filter(Boolean))].sort();

  return {
    jumlahInti: inti.length,
    jumlahSemua: terdaftar.length,
    hantu,
    kembar,
    tanpaGrup,
    grupInti,
    inti,
  };
})())`);

r.check('I1', d.jumlahInti === 40, `daftar inti berisi ${d.jumlahInti} tool (dari ${d.jumlahSemua} terdaftar)`);

r.check(
  'I2',
  d.hantu.length === 0,
  `setiap nama di daftar inti MEMANG tool yang terdaftar${d.hantu.length ? ` - HANTU: ${d.hantu.join(', ')}` : ''}`,
);

r.check('I3', d.kembar.length === 0, `tidak ada nama kembar${d.kembar.length ? `: ${d.kembar.join(', ')}` : ''}`);

r.check(
  'I4',
  d.tanpaGrup.length === 0,
  `setiap tool inti punya grup${d.tanpaGrup.length ? ` - TANPA GRUP: ${d.tanpaGrup.join(', ')}` : ''}`,
);

r.check(
  'I5',
  d.grupInti.length >= 6,
  `tool inti mencakup ${d.grupInti.length} grup berbeda: ${d.grupInti.join(', ')}`,
);

r.check(
  'I6',
  d.jumlahInti < d.jumlahSemua,
  `daftar inti lebih pendek dari seluruh tool (${d.jumlahInti} < ${d.jumlahSemua}) - memang menyaring, bukan menyalin`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
