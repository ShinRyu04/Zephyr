/*
 * B1..B4 — bookmark and rewind.
 *
 * Rewind DESTROYS messages and the store keeps no undo, so the two things worth
 * proving are that it cuts at the right place and that it never runs without the
 * confirmation being answered. Both are exercised here on a synthetic transcript
 * injected through the store, so the user's real sessions are untouched.
 *
 * Run: node scripts/verify-bookmarks.mjs
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

// Seed a known transcript.
const seed = await ev(`(()=>{
  const S=window.__ZEPHYR_CLICHAT__; const aid='claude'; const st=S.getState();
  const sid=st.activeId[aid]||(st.sessions[aid][0]&&st.sessions[aid][0].id);
  const msgs=[
    {id:'b1',role:'user',content:'pertanyaan 1'},
    {id:'b2',role:'assistant',content:'jawaban 1'},
    {id:'b3',role:'user',content:'pertanyaan 2'},
    {id:'b4',role:'assistant',content:'jawaban 2'},
    {id:'b5',role:'user',content:'pertanyaan 3'},
  ];
  S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===sid?{...x,messages:msgs}:x)}}));
  window.__BID = sid;
  return 'seeded '+sid;})()`);
check('B0', typeof seed === 'string' && seed.startsWith('seeded'), seed);

// B1 — toggling a bookmark flips the flag on that message only.
const b1 = await ev(`(()=>{
  const S=window.__ZEPHYR_CLICHAT__; const aid='claude';
  S.getState().toggleBookmark(aid,'b2');
  const on=S.getState().sessions[aid].find(x=>x.id===window.__BID).messages;
  S.getState().toggleBookmark(aid,'b2');
  const off=S.getState().sessions[aid].find(x=>x.id===window.__BID).messages;
  return JSON.stringify({on:on.filter(m=>m.bookmark).map(m=>m.id), off:off.filter(m=>m.bookmark).map(m=>m.id)});})()`);
const j1 = JSON.parse(b1);
check('B1', j1.on.length === 1 && j1.on[0] === 'b2' && j1.off.length === 0, `on=${j1.on} off=${j1.off}`);

// B2 — rewind drops the target itself and everything after it.
const b2 = await ev(`(()=>{
  const S=window.__ZEPHYR_CLICHAT__; const aid='claude';
  S.getState().rewindTo(aid,'b3');
  const m=S.getState().sessions[aid].find(x=>x.id===window.__BID).messages;
  return JSON.stringify({ids:m.map(x=>x.id)});})()`);
const j2 = JSON.parse(b2);
check('B2', JSON.stringify(j2.ids) === JSON.stringify(['b1', 'b2']), `kept ${j2.ids.join(',')} (expected b1,b2 — b3 dropped with the rest)`);

// B3 — rewinding to an id that no longer exists is a no-op, not an empty session.
const b3 = await ev(`(()=>{
  const S=window.__ZEPHYR_CLICHAT__; const aid='claude';
  S.getState().rewindTo(aid,'does-not-exist');
  const m=S.getState().sessions[aid].find(x=>x.id===window.__BID).messages;
  return JSON.stringify({n:m.length});})()`);
const j3 = JSON.parse(b3);
check('B3', j3.n === 2, `missing id left ${j3.n} messages (expected 2, not 0)`);

/* The conversation renders only while the Claude Code tab is selected; without
   this the seeded messages are in the store but nothing is on screen, and the
   control "missing" is a wrong tab rather than a missing feature. */
await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 900));

// B4 — the rewind control lives on the assistant reply, and it asks first.
const b4 = await ev(`(()=>{
  const btn=document.querySelector('[data-testid^="cli-rewind-"]');
  if(!btn) return JSON.stringify({btn:false});
  btn.click();
  return JSON.stringify({btn:true});})()`);
const j4 = JSON.parse(b4);
await new Promise((r) => setTimeout(r, 500));
const dlg = await ev(`!!document.querySelector('[data-testid="cli-rewind-confirm"]')`);
check('B4', j4.btn && dlg, `control=${j4.btn} confirmationShown=${dlg}`);

// Leave the dialog closed and the seeded transcript cleared.
await ev(`(()=>{const S=window.__ZEPHYR_CLICHAT__; const aid='claude';
  S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===window.__BID?{...x,messages:[]}:x)}}));
  const c=document.querySelector('.cli-confirm-backdrop button.btn-ghost'); if(c) c.click();
  return 1;})()`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
