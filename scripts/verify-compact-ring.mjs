/*
 * R1..R4 — the context ring, and the compacting indicator.
 *
 * Two things are being pinned, and the second is the one that was missing:
 *
 *   1. the ring renders in the CLI toolbar with a real percentage, and
 *   2. running /compact shows a VISIBLE busy state while it works.
 *
 * (2) matters because compaction replaces the transcript. Done with no sign,
 * the messages appear to vanish on their own and the reader concludes something
 * was lost rather than summarised. A state that exists for zero milliseconds is
 * a state nobody can see, so the check samples the flag while the command runs
 * rather than only inspecting the result.
 *
 * Run: node scripts/verify-compact-ring.mjs
 */
import { WebSocket } from 'ws';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const pg = list.find((x) => x.type === 'page');
if (!pg) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(pg.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0;
const pend = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
  if (r?.exceptionDetails) return null;
  return r?.result?.value;
};
await send('Runtime.enable');

const out = [];
const check = (i, ok, d) => { out.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${i.padEnd(4)} ${d}`); };

/* The ring lives on the CLI tab. */
await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 1100));

/* Seed a session with usage + several messages, so the ring has a number and
   compaction has something to cut. */
console.log('seed:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; if(!S) return 'no-store';
const st=S.getState(); const aid='claude'; const sid=st.activeId[aid];
const msgs=[]; for(let i=0;i<10;i++) msgs.push({id:'r'+i,role:i%2?'assistant':'user',content:'pesan '+i});
S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===sid?{...x,messages:msgs,
  usage:{input:45000,output:5000}}:x)}}));
window.__RSID=sid; return 'ok';})()
`));
await new Promise((r) => setTimeout(r, 900));

// R1 — the ring is on screen.
const ring = await ev(`document.querySelectorAll('[data-testid^="ai-clichat-ctx-"]').length`);
check('R1', ring > 0, `ring element present: ${ring}`);

// R2 — it shows a real percentage, not a placeholder.
const pct = await ev(`(()=>{const el=document.querySelector('[data-testid^="ai-clichat-ctx-"]');
 if(!el) return 'tidak ada'; return JSON.stringify({teks:el.textContent.trim(), busy:el.dataset.busy});})()`);
const p = JSON.parse(pct);
check('R2', p.busy === '0' && /%/.test(p.teks), `shows a percentage while idle: ${pct}`);

// R3 — the SVG arc is drawn (strokeDasharray non-empty), not an empty circle.
const arc = await ev(`(()=>{const s=document.querySelector('[data-testid="ctx-ring"]');
 if(!s) return 'no-ring'; const c=s.querySelectorAll('circle')[1];
 return c ? c.getAttribute('stroke-dasharray') : 'no-arc';})()`);
check('R3', typeof arc === 'string' && /\d/.test(arc) && arc !== 'no-arc', `arc drawn: ${arc}`);

/*
 * R4 — compaction shows its busy state WHILE it runs.
 *
 * Sampled on a timer rather than read once at the end: the flag is up for a
 * short window by design, so a single read after the await would always see
 * `false` and report the indicator missing on a working build.
 */
await ev(`window.__SAW=0; window.__T=setInterval(()=>{const el=document.querySelector('[data-testid^="ai-clichat-ctx-"]'); if(el && el.dataset.busy==='1') window.__SAW=1;},20); 1`);
await ev(`(()=>{const S=window.__ZEPHYR_CLICHAT__; void S.getState().compact('claude'); return 1;})()`);
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 50));
  const saw = await ev(`window.__SAW`);
  if (saw === 1) break;
}
const saw = await ev(`window.__SAW`);

/*
 * Wait for the flag to CLEAR rather than reading it once.
 *
 * The sampling loop above exits the moment it sees busy, which is before the
 * command has finished — so a single read there always catches the flag still
 * up and reports a stuck indicator on a working build. The state that matters
 * is that it goes back DOWN, so this waits for that and fails only if it never
 * happens.
 */
let sesudah = '1';
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 100));
  sesudah = await ev(`(()=>{const el=document.querySelector('[data-testid^="ai-clichat-ctx-"]');
    return el ? el.dataset.busy : 'hilang';})()`);
  if (sesudah === '0') break;
}
await ev(`clearInterval(window.__T); 1`);
check('R4', saw === 1 && sesudah === '0', `busy seen while compacting, cleared after: saw=${saw} after=${sesudah}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
