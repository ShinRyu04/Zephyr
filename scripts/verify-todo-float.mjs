/*
 * F1..F4 — the plan is pinned ABOVE the composer, not inside the transcript.
 *
 * The position is the whole point of the feature: a checklist that scrolls away
 * with the messages is the version that already existed. So the checks measure
 * real geometry — the float's bottom edge must sit at or above the composer's
 * top edge — rather than merely asserting the element exists.
 *
 * Run: node scripts/verify-todo-float.mjs
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

/* The agent is asked to create real files, so it works in a throwaway dir. */
/* Forward slashes only: the path is embedded into JS source that runs in the
   page, where a Windows backslash would be read as an escape. */
const sandbox = `${tmpdir()}/zephyr-float-${process.pid}`.replaceAll('\\', '/');
mkdirSync(sandbox, { recursive: true });

console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 800));

/*
 * Start a session and remember which one it is.
 *
 * `newSession` changes `activeId`, and `send` then targets whatever is active —
 * so a harness that assumes the id it saw BEFORE the call is watching the wrong
 * session, finds no todos in it, and reports the feature missing. The id is
 * captured AFTER the send, from the store itself.
 */
console.log('send:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState();
  if (st.newSession) { try { st.newSession('claude'); } catch(e){} }
  const st2=S.getState();
  st2.send('claude', 'Buat empat berkas terpisah di folder ini: s1.txt, s2.txt, s3.txt, s4.txt — masing-masing berisi namanya. Lacak kemajuan dengan todo list.', { cwd: ${JSON.stringify(sandbox)} });
  window.__WATCH = S.getState().activeId.claude;
  return 'sent to ' + window.__WATCH;})()
`));

/* Wait for the float to appear. */
let geo = null;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{
    /* Also report the watched session's todo parts, so a failure says whether
       the data never arrived or the render dropped it — two very different
       bugs that otherwise both read as "no float". */
    const S=window.__ZEPHYR_CLICHAT__; const st=S.getState();
    const sess=(st.sessions.claude||[]).find(x=>x.id===window.__WATCH);
    const parts=(sess?.messages||[]).reduce((a,m)=>a+(m.parts||[]).filter(p=>p.type==='todo').length,0);
    const f=document.querySelector('[data-testid="cli-todo-float"]');
    if(!f) return parts>0 ? JSON.stringify({todoPartsInStore:parts, rendered:false}) : null;
    const c=document.querySelector('.cli-native-composer');
    if(!c) return JSON.stringify({float:true, composer:false});
    const fr=f.getBoundingClientRect(), cr=c.getBoundingClientRect();
    return JSON.stringify({
      floatBottom: Math.round(fr.bottom), composerTop: Math.round(cr.top),
      above: fr.bottom <= cr.top + 1,
      items: f.querySelectorAll('.cli-todo-float-item').length,
      count: (f.querySelector('[data-testid="cli-todo-float-count"]')||{}).textContent||'',
      running: f.dataset.running,
      todoPartsInStore: parts,
    });})()`);
  if (s) { geo = s; break; }
}
check('F1', Boolean(geo), geo ? `float rendered: ${geo}` : 'no float after 150s');

if (geo) {
  const g = JSON.parse(geo);
  check('F2', g.above === true, `float bottom ${g.floatBottom} <= composer top ${g.composerTop}`);
  check('F3', g.items >= 2, `${g.items} steps shown`);
  check('F4', /\/\d+/.test(g.count), `progress header: ${JSON.stringify(g.count)}`);
} else {
  check('F2', false, 'skipped');
  check('F3', false, 'skipped');
  check('F4', false, 'skipped');
}

/*
 * Cleanup must not decide the verdict.
 *
 * The agent may still hold a handle on the sandbox when the run ends, and
 * rmSync then throws EPERM — which crashed the harness BEFORE it printed any
 * result, so a passing run reported "0/4 lulus". A failed cleanup is noise to
 * report, not a reason to discard the checks that already ran.
 */
try {
  rmSync(sandbox, { recursive: true, force: true });
} catch (e) {
  console.log(`(catatan: folder sementara belum bisa dihapus: ${e.code ?? e})`);
}
ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
