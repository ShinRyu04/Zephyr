import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';
import { mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '9223';
const A = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiA';
const B = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiB';
const C = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiC';
for (const d of [A, B, C]) mkdirSync(d, { recursive: true });

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const wsAwal = S.getState().workspace;',
    'const DIRA = ' + JSON.stringify(A) + ';',
    'const DIRB = ' + JSON.stringify(B) + ';',
    'await S.getState().openWorkspace(DIRA);',
    'await wait(2500);',
    'const idA = X.store.getState().activeId;',
    'const sesiA = () => X.store.getState().sessions.find((s) => s.id === idA) || {};',
    'out.A = { ws: S.getState().workspace, aktif: idA, sesiWs: sesiA().workspace };',
    'await S.getState().openWorkspace(DIRB);',
    'await wait(2500);',
    'const idB = X.store.getState().activeId;',
    'const sesiB = () => X.store.getState().sessions.find((s) => s.id === idB) || {};',
    'out.B = { ws: S.getState().workspace, aktif: idB, sesiWs: sesiB().workspace };',
    'out.BbedaDariA = idB !== idA;',
    'out.sesiATetapA = sesiA().workspace;',
    'out.semua = X.store.getState().sessions.map((s) => ({ id: s.id.slice(-8), ws: s.workspace }));',
    'if (wsAwal) await S.getState().openWorkspace(wsAwal);',
    'await wait(1200);',
    'return out;',
  ].join('\n'),
  200000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
