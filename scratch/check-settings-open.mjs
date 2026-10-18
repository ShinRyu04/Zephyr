import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const st0 = useStore.getState();',
    'out.adaSetActivity = typeof st0.setActivity;',
    'out.adaSetSettingsOpen = typeof st0.setSettingsOpen;',
    'out.adaToggleSidebar = typeof st0.toggleSidebar;',
    'out.adaSidebarVisible = st0.sidebarVisible;',
    '/* Call the three steps by hand and watch each one. */',
    'try { st0.setActivity("settings"); out.a1 = useStore.getState().activity; } catch (e) { out.a1 = "ERR " + e.message; }',
    'try { st0.setSettingsOpen(true); out.a2 = useStore.getState().settingsOpen; } catch (e) { out.a2 = "ERR " + e.message; }',
    'await wait(300);',
    'out.a3 = { act: useStore.getState().activity, open: useStore.getState().settingsOpen };',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
