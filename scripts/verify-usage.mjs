/*
 * U1..U3 — token usage reaches the conversation.
 *
 * The audit found `usage` declared as an optional field that Rust never filled:
 * every token counter and cost figure in the app was fed `undefined`, so the
 * whole accounting was dead code that LOOKED alive (the types were right, the
 * UI rendered, the numbers were just always zero).
 *
 * So this drives a real agent turn and checks the numbers are non-zero and
 * plausible, rather than checking a field exists.
 *
 * Run: node scripts/verify-usage.mjs
 */
import { WebSocket } from 'ws';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

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

/* Forward slashes only: embedded into JS source that runs in the page. */
const sandbox = `${tmpdir()}/zephyr-usage-${process.pid}`.replaceAll('\\', '/');
mkdirSync(sandbox, { recursive: true });

console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 800));

/* Ask for real work so the provider reports a substantial token count. */
console.log('send:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState();
  if (st.newSession) { try { st.newSession('claude'); } catch(e){} }
  S.getState().send('claude', 'Baca berkas package.json di folder ini lalu sebutkan nama paketnya.', { cwd: ${JSON.stringify(sandbox)} });
  window.__USID = S.getState().activeId.claude;
  return 'sent';})()
`));

let usage = null;
for (let i = 0; i < 140; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{const st=window.__ZEPHYR_CLICHAT__.getState();
    const sess=(st.sessions.claude||[]).find(x=>x.id===window.__USID);
    if(!sess) return null;
    return JSON.stringify({pending: sess.pending, usage: sess.usage || null});})()`);
  if (!s) continue;
  const j = JSON.parse(s);
  if (j.usage) usage = j.usage;
  if (!j.pending) break;
}

check('U1', Boolean(usage), usage ? `session usage recorded: ${JSON.stringify(usage)}` : 'no usage after the turn');
if (usage) {
  const masuk = usage.input ?? usage.in ?? 0;
  const keluar = usage.output ?? usage.out ?? 0;
  check('U2', masuk > 0, `input tokens non-zero: ${masuk}`);
  check('U3', keluar > 0, `output tokens non-zero: ${keluar}`);
} else {
  check('U2', false, 'skipped');
  check('U3', false, 'skipped');
}

try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* locked by the agent */ }
ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
