/*
 * T1..T3 — the todo checklist reaches the panel, driven by the REAL CLI.
 *
 * The unit tests prove the parser turns TodoWrite into a `todo` event. This
 * proves the whole path: the env var reaches the subprocess, the CLI emits the
 * tool call because of it, the store turns it into a part, and the timeline
 * paints `.cli-todo`. Any one of those four links can be the broken one and the
 * others still pass, which is why this runs the real agent rather than a
 * fixture.
 *
 * A live agent run is slow (~60-120s) and costs quota, so this is a separate
 * harness rather than part of the fast suite.
 *
 * Run: node scripts/verify-cli-todo.mjs
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

// Focus the Claude Code tab and start a task that needs several steps.
console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t){t.click(); return 'ok';} return 'no-tab';})()`));
await new Promise((r) => setTimeout(r, 800));

console.log('send:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState();
  if (st.newSession) { try { st.newSession('claude'); } catch(e){} }
  st.send('claude', 'Buat tiga berkas kecil terpisah di folder kerja: satu.txt, dua.txt, tiga.txt — masing-masing berisi namanya. Lacak kemajuan dengan todo list.');
  return 'sent';})()
`));

/* Poll for the checklist to appear on screen. The agent has to start, decide to
   plan, and emit TodoWrite before anything renders. */
let found = null;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{const el=document.querySelector('[data-testid="cli-todo"]');
    if(!el) return null;
    return JSON.stringify({items: el.querySelectorAll('.cli-todo-item').length,
      head: (el.querySelector('.cli-todo-head')||{}).textContent||'',
      now: el.querySelectorAll('.cli-todo-item.is-now').length,
      done: el.querySelectorAll('.cli-todo-item.is-done').length});})()`);
  if (s) { found = s; break; }
}
check('T1', Boolean(found), found ? `checklist rendered: ${found}` : 'no .cli-todo after 150s');

if (found) {
  const f = JSON.parse(found);
  check('T2', f.items >= 2, `${f.items} langkah terlihat`);
  check('T3', /\/\d+/.test(f.head), `header menunjukkan progres: ${JSON.stringify(f.head)}`);
} else {
  check('T2', false, 'skipped');
  check('T3', false, 'skipped');
}

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
