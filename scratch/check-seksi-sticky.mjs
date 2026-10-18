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
    '/* Reset to a known state. */',
    'useStore.getState().setSettingsOpen(false);',
    'await wait(200);',
    'useSettingsUi.getState().setSection("general");',
    'useStore.getState().setActivity("settings");',
    'useStore.getState().setSettingsOpen(true);',
    'await wait(300);',
    'out.sebelum = useSettingsUi.getState().section;',
    '/* Now set theme and watch whether it STICKS. */',
    'useSettingsUi.getState().setSection("theme");',
    'out.langsung = useSettingsUi.getState().section;',
    'await wait(200);',
    'out.setelah200ms = useSettingsUi.getState().section;',
    'await wait(800);',
    'out.setelah1s = useSettingsUi.getState().section;',
    '/* Is the theme body actually rendered? */',
    'out.adaBodyTheme = !!document.querySelector("[data-testid*=\\"theme\\"]");',
    'out.judulHalaman = document.querySelector(".settings-title, .set-title, h1")?.textContent ?? null;',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
