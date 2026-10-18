import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const k = await import("/src/lib/zephyrTools/kendaliJendela.ts");',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const { useSettingsUi } = await import("/src/lib/settingsStore.ts");',
    'useStore.getState().setSettingsOpen(false);',
    'useSettingsUi.getState().setSection("general");',
    'await wait(200);',
    '/* Call bukaSetelan DIRECTLY - the function the tool uses. */',
    'try { out.balasan = await k.bukaSetelan("theme"); } catch (e) { out.balasan = "ERR " + e.message; }',
    'await wait(500);',
    'out.state = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
