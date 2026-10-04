/**
 * verify-tools-runtime.mjs - seluruh tool katalog benar-benar terpasang.
 *
 *   node scripts/verify-tools-runtime.mjs 9223
 *
 * Kenapa lewat CDP, bukan Node langsung.
 *
 * Versi lama mem-bundle `agentTools.ts` di Node dan memeriksa `tools.length
 * === 51`. Dua hal salah sekaligus:
 *
 *   1. Angkanya dipatok. Setiap tool baru memaksa sunting berkas ini - dan
 *      berkas ini penjaga terakhir bahwa katalog dan handler tidak berbeda
 *      pendapat, jadi menyuntingnya setiap kali justru melemahkannya.
 *
 *   2. Rantai impornya tidak lagi muat di Node. `builtins.ts` menyentuh
 *      `terminalStore` (xterm), `commandRegistry` menyentuh CodeMirror -
 *      keduanya memanggil `self`, `document`, dan `import.meta.env` saat
 *      dimuat. Menambal Node satu per satu adalah perlombaan yang tidak
 *      selesai: setiap dependensi UI baru memindahkan tiang gawangnya.
 *      Terbukti: berkas ini sudah mati SEBELUM perubahan tool terakhir.
 *
 * Yang diperiksa tetap sama, tapi di tempat yang benar - aplikasi yang hidup,
 * yang memang memuat seluruh rantai itu:
 *
 *   R1  setiap nama di katalog terpasang
 *   R2  setiap tool terpasang ada di katalog (tidak ada nama asing)
 *   R3  tidak ada nama duplikat
 *   R4  11 tool web/browser lengkap
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');

const r = reporter('verify-tools-runtime');

console.log('\n== Tool terpasang di aplikasi hidup ==');

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const { AGENT_TOOLS } = await import('/src/lib/agentTools.ts');
  const { TOOL_CATALOG } = await import('/src/lib/zephyrTools/catalog.ts');
  const nama = AGENT_TOOLS.map((t) => t.spec.name);
  return {
    nama,
    katalog: TOOL_CATALOG.map((t) => t.name),
    web: TOOL_CATALOG.filter((t) => t.source === 'web').map((t) => t.name),
  };
})())`);

const nama = d.nama || [];
const katalog = d.katalog || [];
console.log(`  katalog ${katalog.length} | terpasang ${nama.length}`);

if (!katalog.length) {
  console.error('  FATAL: katalog kosong di aplikasi; tidak ada yang bisa dibandingkan.');
  process.exit(1);
}

const hilang = katalog.filter((n) => !nama.includes(n));
const asing = nama.filter((n) => !katalog.includes(n));
const duplikat = nama.filter((n, i) => nama.indexOf(n) !== i);

r.check('R1', hilang.length === 0, `setiap nama katalog terpasang (${katalog.length} nama)` + (hilang.length ? ' :: hilang=' + JSON.stringify(hilang) : ''));
r.check('R2', asing.length === 0, `tidak ada tool asing di luar katalog` + (asing.length ? ' :: asing=' + JSON.stringify(asing) : ''));
r.check('R3', duplikat.length === 0, `tidak ada nama duplikat` + (duplikat.length ? ' :: ' + JSON.stringify(duplikat) : ''));

const webWajib = [
  'web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_click',
  'browser_type', 'browser_nav', 'browser_list', 'browser_close',
  'browser_download_url', 'system_browser_open',
];
const webHilang = webWajib.filter((w) => !nama.includes(w));
r.check('R4', webHilang.length === 0, `11 tool web/browser lengkap` + (webHilang.length ? ' :: ' + JSON.stringify(webHilang) : ''));
r.check('R5', (d.web || []).length === 11, `jumlah web di katalog = ${(d.web || []).length}`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
