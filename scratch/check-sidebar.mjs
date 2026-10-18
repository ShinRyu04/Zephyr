import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* Switch the left sidebar to the Terminal view via the real UI action. */',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const st = useStore.getState();',
    'out.actions = Object.keys(st).filter((k) => /activity|sidebar|view/i.test(k));',
    'out.activity = st.activity;',
    'st.setActivity?.("terminal");',
    'if (!useStore.getState().sidebarVisible) st.setSidebarVisible?.(true);',
    'await wait(1500);',
    'out.view = useStore.getState().activity;',
    'out.names = Array.from(document.querySelectorAll(".tp-agent-name")).map((e) => e.textContent.trim());',
    'out.title = document.querySelector(".tp-subtitle")?.textContent?.trim() ?? null;',
    'return out;',
  ].join('\n'),
  60000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
