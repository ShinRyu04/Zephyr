import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { useSettingsUi } = await import("/src/lib/settingsStore.ts");',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    '/* Start CLOSED, on a different section - the honest starting point for',
    '   "user does not know where it is". */',
    'useStore.getState().setSettingsOpen(false);',
    'useSettingsUi.getState().setSection("general");',
    'useStore.getState().setActivity("explorer");',
    'await wait(300);',
    'out.awal = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    '',
    '/* 1. Theme */',
    'out.temaBalas = await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    'await wait(400);',
    'out.setelahTema = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    '',
    '/* 2. Token thrift -> agents */',
    'useStore.getState().setSettingsOpen(false);',
    'await wait(200);',
    'out.agenBalas = await jalankanAgentTool("tunjuk", { niat: "biar AI nggak boros token" });',
    'await wait(400);',
    'out.setelahAgen = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen };',
    '',
    '/* 3. Unknown -> nothing opens */',
    'useStore.getState().setSettingsOpen(false);',
    'useSettingsUi.getState().setSection("general");',
    'await wait(200);',
    'out.asingBalas = await jalankanAgentTool("tunjuk", { niat: "harga bitcoin hari ini" });',
    'await wait(400);',
    'out.setelahAsing = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen };',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
