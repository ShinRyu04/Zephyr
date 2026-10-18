import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* What does the APP actually see? Read the live DOM, not a store copy. */',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const { useSettingsUi } = await import("/src/lib/settingsStore.ts");',
    'useStore.getState().setSettingsOpen(false);',
    'useSettingsUi.getState().setSection("general");',
    'await wait(300);',
    'out.domSebelum = {',
    '  settingsTerlihat: !!document.querySelector("[data-testid=\\"settings-page\\"], .settings-page, .settings"),',
    '};',
    '/* Drive through the REAL UI: click the gear/activity bar button. */',
    'const tombolSettings = document.querySelector("[data-testid*=\\"settings\\"]") ||',
    '  Array.from(document.querySelectorAll("button")).find((b) => /setting/i.test(b.getAttribute("aria-label") || ""));',
    'out.adaTombolSettings = !!tombolSettings;',
    'if (tombolSettings) tombolSettings.click();',
    'await wait(600);',
    'out.domSetelahKlik = {',
    '  settingsTerlihat: !!document.querySelector("[data-testid=\\"settings-page\\"], .settings-page, .settings"),',
    '  storeOpen: useStore.getState().settingsOpen,',
    '  storeAct: useStore.getState().activity,',
    '};',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
