/*
 * M1..M4 — the plugin marketplace browser.
 *
 * Reads the real catalog from the user's machine rather than a fixture: the
 * whole feature is "show me what is available", so a fixture would prove the
 * rendering while saying nothing about whether the catalog path and shape are
 * right, which is where it would actually break.
 *
 * Installing is NOT exercised. It clones a repository and changes the user's
 * plugin set; proving the button exists is enough here, and the CLI it delegates
 * to is the thing that would do the work.
 *
 * Run: node scripts/verify-plugin-browser.mjs
 */
import { WebSocket } from 'ws';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const pg = list.find((x) => x.type === 'page');
if (!pg) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(pg.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0;
const send = (m, p = {}) => new Promise((res) => {
  const i = ++id;
  const h = (raw) => { const j = JSON.parse(raw); if (j.id === i) { ws.off('message', h); res(j); } };
  ws.on('message', h);
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
  if (r.result?.exceptionDetails) return 'THREW: ' + (r.result.exceptionDetails.exception?.description || '');
  return r.result?.result?.value;
};
await send('Runtime.enable');

const out = [];
const check = (i, ok, d) => { out.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${i.padEnd(4)} ${d}`); };

const run = async (body) => {
  const slot = '__MB' + Math.random().toString(36).slice(2, 7);
  await ev(`window.${slot}=null;(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;window.${slot}={done:true,value:(await (async()=>{${body}})())};})().catch(e=>window.${slot}={done:true,error:String(e)});'go'`);
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) { if (st.error) throw new Error(st.error); return st.value; }
  }
  throw new Error('timeout');
};

// M1 — the catalog command answers and parses into rows with real content.
const raw = await run(`const c = await invoke('cc_plugins_catalog'); return JSON.stringify({n:c.length, first:c[0]||null});`);
const j1 = JSON.parse(raw);
check('M1', j1.n > 0, `${j1.n} plugins in catalog`);
check('M2', Boolean(j1.first && j1.first.id.includes('@') && j1.first.name),
  j1.first ? `first=${j1.first.id} installs=${j1.first.installs} cat=${j1.first.category}` : 'none');

// M3 — component counts are numbers, not undefined, since the panel prints them.
check('M3', Boolean(j1.first) && typeof j1.first.commands === 'number' && typeof j1.first.skills === 'number',
  j1.first ? `commands=${j1.first.commands} skills=${j1.first.skills} agents=${j1.first.agents}` : 'n/a');

// M4 — the marketplaces list reports a source, not a local path.
const mk = JSON.parse(await run(`const m = await invoke('cc_plugin_marketplaces'); return JSON.stringify(m);`));
const srcOk = Array.isArray(mk) && mk.length > 0 && mk.every((m) => !/[A-Za-z]:\\/.test(m.source));
check('M4', srcOk, mk.length ? `${mk.length} marketplace(s): ${mk.map((m) => m.name).join(', ')}` : 'none');

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
