import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
console.log('JENDELA TERBUKA:');
for (const p of list) console.log(`  ${p.title || '(tanpa judul)'}  ->  ${p.url}`);

const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) { console.log('\ntarget app utama tidak ditemukan'); keluarBersih(1); }

const cdp = await Cdp.connect(t.webSocketDebuggerUrl);
const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 40; i++) {',
    '  if (typeof S !== "undefined" && S && S.getState && S.getState().settingsLoaded) break;',
    '  await wait(400);',
    '}',
    'out.siap = typeof S !== "undefined" && S ? !!S.getState().settingsLoaded : false;',
    'out.judul = document.title;',
    'out.adaActivityBar = !!document.querySelector(".activitybar, [class*=\\"activity\\"]");',
    'out.adaSidebar = !!document.querySelector(".sidebar");',
    'out.adaEditor = !!document.querySelector(".editor, [class*=\\"editor\\"]");',
    'out.workspace = (typeof S !== "undefined" && S) ? S.getState().workspace : null;',
    'out.activity = (typeof S !== "undefined" && S) ? S.getState().activity : null;',
    'out.sidebarWidth = (typeof S !== "undefined" && S) ? S.getState().sidebarWidth : null;',
    'return out;',
  ].join('\n'),
  120000,
);
console.log('\nKEADAAN APP:');
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
