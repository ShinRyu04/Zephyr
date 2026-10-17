/*
 * verify-tunjuk-live.mjs — `tunjuk` benar-benar MEMBUKA halaman di app hidup.
 *
 * Pakai:  node scripts/verify-tunjuk-live.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * ## Kenapa DOM, bukan store
 *
 * Percobaan pertama memeriksa `useStore.getState().settingsOpen` setelah
 * mengimpor `store.ts` lewat CDP. Itu SALAH dan sempat membuat laporan yang
 * keliru: `import()` dari CDP membuat INSTANCE MODUL KEDUA dengan state zustand
 * sendiri. Menulis ke salinan itu tidak menggerakkan UI, dan membacanya tidak
 * mencerminkan UI - terukur: salinan melaporkan `settingsOpen: false` padahal
 * panelnya terbuka di layar.
 *
 * Jadi bukti satu-satunya yang dipercaya di sini adalah DOM: apakah
 * `[data-testid="settings-page"]` ada. Itu yang dilihat pembaca.
 *
 * ## Yang diuji
 *
 *   T1  kontrol pembuka/penutup bekerja (kalau tidak, uji lain tak bermakna)
 *   T2  niat nyata -> Settings TERBUKA
 *   T3  niat tak dikenal -> Settings TETAP TERTUTUP (tidak mengarang)
 *   T4  niat panel ("terminal") -> panel terbuka, Settings tidak dipaksa
 */
import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('tunjuk-live');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) {
  R.check('T0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const tampak = () => !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    'const gear = document.querySelector("[data-testid=\\"ab-settings\\"]");',
    'out.adaGear = !!gear;',
    'if (!gear) return out;',
    '',
    '/* T1: the control itself must toggle, or nothing below means anything. */',
    'const awal = tampak();',
    'gear.click();',
    'await wait(800);',
    'const setelah1 = tampak();',
    'gear.click();',
    'await wait(800);',
    'const setelah2 = tampak();',
    'out.toggle = { awal, setelah1, setelah2 };',
    '',
    '/* Make sure we start CLOSED - the honest state for "I cannot find it". */',
    'if (tampak()) { gear.click(); await wait(800); }',
    'out.sebelumTema = tampak();',
    '',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'out.adaTool = typeof jalankanAgentTool === "function";',
    '',
    '/* T2: a real complaint opens Settings. */',
    'out.balasTema = await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    'await wait(1000);',
    'out.setelahTema = tampak();',
    '',
    '/* T3: an unknown complaint must NOT open anything. */',
    'if (tampak()) { gear.click(); await wait(800); }',
    'out.sebelumAsing = tampak();',
    'out.balasAsing = await jalankanAgentTool("tunjuk", { niat: "harga bitcoin hari ini" });',
    'await wait(1000);',
    'out.setelahAsing = tampak();',
    '',
    '/* T4: a panel complaint opens the panel, and does not force Settings. */',
    'if (tampak()) { gear.click(); await wait(800); }',
    'out.balasPanel = await jalankanAgentTool("tunjuk", { niat: "buka terminal" });',
    'await wait(1000);',
    'out.setelahPanel = tampak();',
    'return out;',
  ].join('\n'),
  240000,
);

R.check('T0', out.adaGear === true, 'kontrol Settings (ab-settings) ada di DOM');
/*
 * T1 asserts the toggle CHANGES state on each click, not that it starts open.
 * An earlier version demanded `awal === true`, which failed purely because the
 * app happened to be closed when the harness ran - the toggle itself worked
 * (`false -> true -> false`). A check that depends on the starting state is
 * checking the environment, not the code.
 */
R.check(
  'T1',
  out.toggle?.setelah1 !== out.toggle?.awal && out.toggle?.setelah2 !== out.toggle?.setelah1,
  `kontrol toggle mengubah keadaan tiap klik: ${JSON.stringify(out.toggle)}`,
);
R.check('T2', out.sebelumTema === false && out.setelahTema === true, `niat "cara ganti tema" -> Settings terbuka (sebelum=${out.sebelumTema}, sesudah=${out.setelahTema})`);
R.check(
  'T3',
  out.sebelumAsing === false && out.setelahAsing === false,
  `niat tak dikenal TIDAK membuka apa pun (sebelum=${out.sebelumAsing}, sesudah=${out.setelahAsing})`,
);
R.check(
  'T4',
  out.setelahPanel === false && /terminal/i.test(String(out.balasPanel ?? '')),
  `niat "buka terminal" -> panel, bukan Settings (Settings=${out.setelahPanel})`,
);

if (out.balasTema) console.log(`\n  balasan T2: ${String(out.balasTema).split('\n')[0]}`);
if (out.balasAsing) console.log(`  balasan T3: ${String(out.balasAsing).split('\n')[0]}`);
if (out.balasPanel) console.log(`  balasan T4: ${String(out.balasPanel).split('\n')[0]}`);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
