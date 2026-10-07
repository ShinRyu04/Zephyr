/*
 * T1..T3 — reasoning is ON out of the box.
 *
 * The bug: `reasoningEffort` defaulted to null, so the provider was never asked
 * for reasoning on a fresh install. No thinking block could arrive, and nothing
 * in the transcript suggested the feature existed — the reader had to find the
 * effort menu and turn it on before they could see anything.
 *
 * So this checks the default is a real effort level AND that it persists, which
 * were two separate defects: the value was null, and nothing was written to
 * storage, so a deliberate choice also reset on every launch.
 *
 * Run: node scripts/verify-thinking-default.mjs
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

/* Save whatever the user had, so this check does not change their setting. */
const sebelum = await ev(`JSON.stringify({effort: window.__ZEPHYR_AI__.store.getState().reasoningEffort, ls: localStorage.getItem('zephyr.ai.effort')})`);
const s0 = JSON.parse(sebelum);

/*
 * T1 — a FRESH install asks the provider for reasoning.
 *
 * The current value cannot be used: an earlier run of another harness (or the
 * user) may have stored 'off', and reading that back would report the default
 * broken when the explicit choice is being honoured correctly. The default is
 * therefore observed by clearing the stored key and reloading, which is what a
 * new install actually does.
 */
await ev(`localStorage.removeItem('zephyr.ai.effort'); 1`);
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 5000));
const sesudahMuat = await ev(`window.__ZEPHYR_AI__ ? window.__ZEPHYR_AI__.store.getState().reasoningEffort : 'no-store'`);
check('T1', sesudahMuat !== null && sesudahMuat !== undefined && sesudahMuat !== 'no-store',
  `fresh install asks for reasoning: ${JSON.stringify(sesudahMuat)}`);

// T2 — changing it writes to storage, so it survives a restart.
await ev(`window.__ZEPHYR_AI__.store.getState().setReasoningEffort('high'); 1`);
const ls = await ev(`localStorage.getItem('zephyr.ai.effort')`);
check('T2', ls === 'high', `choice persisted: ${JSON.stringify(ls)}`);

// T3 — turning it OFF is stored explicitly, so "off on purpose" is not the
//      same as "never chosen" and does not get silently re-defaulted.
await ev(`window.__ZEPHYR_AI__.store.getState().setReasoningEffort(null); 1`);
const off = await ev(`localStorage.getItem('zephyr.ai.effort')`);
check('T3', off === 'off', `off is explicit: ${JSON.stringify(off)}`);

/* Restore. */
await ev(`window.__ZEPHYR_AI__.store.getState().setReasoningEffort(${JSON.stringify(s0.effort)});
  ${s0.ls === null ? `localStorage.removeItem('zephyr.ai.effort')` : `localStorage.setItem('zephyr.ai.effort', ${JSON.stringify(s0.ls)})`}; 1`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
