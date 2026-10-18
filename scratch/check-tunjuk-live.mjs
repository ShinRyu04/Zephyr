import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* Drive the REAL tool through the agent tool table, not a store copy. */',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'out.hasTunjuk = typeof jalankanAgentTool === "function";',
    '/* 1. A real complaint. */',
    'try {',
    '  out.tema = await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    '} catch (e) { out.tema = "ERROR: " + e.message; }',
    'const { useSettingsUi } = await import("/src/lib/settingsStore.ts");',
    'const { useStore } = await import("/src/lib/store.ts");',
    'out.seksiTerbuka = useSettingsUi.getState().section;',
    'out.settingsOpen = useStore.getState().settingsOpen;',
    'out.activity = useStore.getState().activity;',
    '/* 2. A complaint it must NOT understand. */',
    'try {',
    '  out.tidakKetemu = await jalankanAgentTool("tunjuk", { niat: "harga bitcoin hari ini" });',
    '} catch (e) { out.tidakKetemu = "ERROR: " + e.message; }',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
