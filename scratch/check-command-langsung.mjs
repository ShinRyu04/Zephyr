import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const reg = await import("/src/lib/commandRegistry.ts");',
    'out.adaFind = typeof reg.findCommand;',
    'out.adaRun = typeof reg.runCommand;',
    'const c = reg.findCommand("settings.theme");',
    'out.ketemu = !!c;',
    'out.judul = c ? c.title : null;',
    '/* Call the command body DIRECTLY, bypassing runCommand. */',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const { useSettingsUi } = await import("/src/lib/settingsStore.ts");',
    'if (c) { try { await c.run(); } catch (e) { out.errRun = e.message; } }',
    'await wait(400);',
    'out.setelahRunLangsung = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
