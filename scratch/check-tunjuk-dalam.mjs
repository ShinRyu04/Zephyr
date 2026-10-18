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
    'const { runCommand } = await import("/src/lib/commandRegistry.ts");',
    '/* Baseline */',
    'out.awal = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    '/* Direct: the command the tool uses for theme. */',
    'const ok = await runCommand("settings.theme");',
    'await wait(400);',
    'out.setelahPerintah = { ok, seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    '/* Now the tool. */',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    'await wait(400);',
    'out.setelahTool = { seksi: useSettingsUi.getState().section, open: useStore.getState().settingsOpen, act: useStore.getState().activity };',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
