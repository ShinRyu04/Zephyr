/**
 * cek-daftar-tool.mjs - daftar nama tool + apakah tiap-tiap punya handler.
 *   node scripts/cek-daftar-tool.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const at = await import('/src/lib/agentTools.ts');
  const punyaHandler = new Set(at.AGENT_TOOLS.map((t) => t.spec && t.spec.name).filter(Boolean));
  const selalu = new Set(cat.TOOL_DIKIRIM_SELALU);
  const per = {};
  for (const t of cat.TOOL_CATALOG) {
    per[t.source] = per[t.source] || [];
    per[t.source].push({ n: t.name, g: t.group, h: punyaHandler.has(t.name), s: selalu.has(t.name) });
  }
  return per;
`);
const per = typeof r === 'string' ? JSON.parse(r) : r;
for (const [src, arr] of Object.entries(per)) {
  console.log(`\n=== ${src.toUpperCase()} (${arr.length}) ===`);
  for (const t of arr) {
    const mark = t.h ? (t.s ? 'SELALU' : 'ondemand') : '*** TANPA HANDLER ***';
    console.log(`  ${t.n.padEnd(26)} ${String(t.g).padEnd(14)} ${mark}`);
  }
}
await cdp.close();
