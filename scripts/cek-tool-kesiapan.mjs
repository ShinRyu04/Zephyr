/**
 * cek-tool-kesiapan.mjs - jawab: berapa tool yang BENAR-BENAR bisa dipakai, dan
 * apakah mengirim banyak schema per request masih membahayakan (gejala kemarin:
 * 50+ schema ~22KB -> gateway 502).
 *
 *   node scripts/cek-tool-kesiapan.mjs [port]
 *
 * Read-only. Mengukur dari app HIDUP lewat store yang sama dipakai loop agen.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const out = {};
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const at = await import('/src/lib/agentTools.ts');

  out.counts = cat.TOOL_COUNTS;
  out.totalKatalog = cat.TOOL_CATALOG.length;
  out.dikirimSelalu = cat.TOOL_DIKIRIM_SELALU.length;
  out.dikirimSelaluNama = cat.TOOL_DIKIRIM_SELALU;

  /* Setiap nama di katalog PUNYA handler? Itu artinya bisa benar-benar dipanggil. */
  const namaBridge = at.AGENT_TOOLS.map((t) => t.spec && t.spec.name).filter(Boolean);
  out.totalHandler = namaBridge.length;
  const diKatalog = new Set(cat.TOOL_CATALOG.map((t) => t.name));
  out.katalogTanpaHandler = [...diKatalog].filter((n) => !namaBridge.includes(n));
  out.handlerTanpaKatalog = namaBridge.filter((n) => !diKatalog.has(n));

  /* Ukuran schema yang dikirim SELALU - inilah angka yang dulu bikin 502. */
  const spec = (n) => at.AGENT_TOOLS.find((t) => t.spec && t.spec.name === n)?.spec;
  let bytesSelalu = 0;
  for (const n of cat.TOOL_DIKIRIM_SELALU) {
    const s = spec(n);
    if (s) bytesSelalu += JSON.stringify(s).length;
  }
  out.bytesDikirimSelalu = bytesSelalu;

  /* Kalau SEMUA schema dikirim sekaligus (skenario terburuk kemarin): */
  let bytesSemua = 0;
  for (const t of at.AGENT_TOOLS) if (t.spec) bytesSemua += JSON.stringify(t.spec).length;
  out.bytesKalauSemuaDikirim = bytesSemua;
  out.jumlahToolAgen = at.AGENT_TOOLS.length;

  /* Apakah jalur tool_search/tool_call memang ada (on-demand, bukan kirim semua)? */
  out.adaToolSearch = namaBridge.includes('tool_search');
  out.adaToolCall = namaBridge.includes('tool_call');

  /* Tool tanpa kelas efek samping tidak boleh jalan - hitung yang cacat. */
  out.cacat = (cat.periksaKatalog ? cat.periksaKatalog() : null);
  return out;
`);

const s = typeof r === 'string' ? JSON.parse(r) : r;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

console.log('=== JUMLAH TOOL ===');
console.log('katalog total       :', s.totalKatalog);
console.log('rincian per sumber  :', JSON.stringify(s.counts));
console.log('handler terpasang   :', s.totalHandler);
console.log('dikirim SELALU/req  :', s.dikirimSelalu);
console.log();
console.log('=== BISA DIPAKAI? (katalog tanpa handler = tool mati) ===');
console.log('katalog tanpa handler :', s.katalogTanpaHandler.length, s.katalogTanpaHandler.join(', ') || '-');
console.log('handler tanpa katalog :', s.handlerTanpaKatalog.length, s.handlerTanpaKatalog.join(', ') || '-');
console.log('cacat katalog         :', JSON.stringify(s.cacat));
console.log();
console.log('=== MASALAH "BANYAK TOOL" (dulu 50+ schema ~22KB -> 502) ===');
console.log('byte dikirim SELALU   :', kb(s.bytesDikirimSelalu));
console.log('byte kalau SEMUA      :', kb(s.bytesKalauSemuaDikirim), '(', s.jumlahToolAgen, 'tool )');
console.log('tool_search tersedia  :', s.adaToolSearch ? 'YA (on-demand)' : 'TIDAK');
console.log('tool_call tersedia    :', s.adaToolCall ? 'YA (on-demand)' : 'TIDAK');
await cdp.close();
