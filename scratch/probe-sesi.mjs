import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';
import { mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '9223';
const A = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiA';
mkdirSync(A, { recursive: true });

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'await S.getState().openWorkspace(' + JSON.stringify(A) + ');',
    'await wait(2500);',
    'const st = X.store.getState();',
    'out.ws = S.getState().workspace;',
    'out.activeId = st.activeId;',
    'out.activeIds = st.activeIds;',
    'out.jumlahSesi = st.sessions.length;',
    'out.sesi = st.sessions.map((s) => ({ id: s.id.slice(-8), ws: s.workspace, judul: s.title }));',
    'out.sesiAktif = (st.sessions.find((s) => s.id === st.activeId) || {}).workspace;',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
