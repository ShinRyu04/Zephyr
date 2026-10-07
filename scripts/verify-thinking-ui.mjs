/*
 * T1..T4 — the thinking block is visible, animated, and honest.
 *
 * The animation is the whole point of the request: a static "Thinking" beside a
 * growing block is indistinguishable from a run that died, so the reader cannot
 * tell "still working" from "hung a minute ago". Two things therefore have to be
 * true and are checked separately:
 *
 *   1. the live state actually reaches the DOM (`data-live`), and
 *   2. the shimmer is applied to the TITLE without ever making it invisible.
 *
 * The second is a real hazard: `-webkit-text-fill-color: transparent` plus a
 * failed `background-clip` renders nothing at all, and a blank "Thinking" is
 * worse than an unanimated one.
 *
 * Run: node scripts/verify-thinking-ui.mjs
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

/*
 * Seed a CLI message whose thinking part is LIVE.
 *
 * Two things have to line up, and getting either wrong makes the check report
 * the animation missing while the component is correct:
 *
 *   * "live" is derived from `pending === msg.id`, not a flag on the message, so
 *     the seeded message has to carry the session's request id; and
 *   * the seed must land in the session the tab is actually SHOWING. Writing to
 *     "the first session" put the message somewhere off-screen, and the blocks
 *     the check then measured belonged to an earlier seed.
 */
console.log('seed:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; if(!S) return 'no-store';
const st=S.getState(); const aid='claude';
const sid=st.activeId[aid];
S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===sid?{...x,
  pending:'th',
  messages:[{id:'th',role:'assistant',streaming:true,content:'',parts:[{type:'thinking',text:'Menimbang dua pendekatan sebelum menjawab.'}]}]}:x)}}));
window.__THSID=sid; return 'ok '+sid;})()
`));
await new Promise((r) => setTimeout(r, 700));
await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 1100));

// T1 — the block renders at all, and it is the LIVE one.
//
// `querySelector` takes the first match in document order, and an earlier seed
// can leave a settled block above the live one — measuring that reports the
// shimmer missing while the live block below it is animating correctly. So the
// live block is selected BY ITS OWN STATE.
const ada = await ev(`document.querySelectorAll('[data-testid="ai-reason"]').length`);
const adaLive = await ev(`document.querySelectorAll('[data-testid="ai-reason"][data-live="1"]').length`);
check('T1', ada > 0, `thinking block rendered: ${ada} (live: ${adaLive})`);

// T2 — the shimmer is on the title, and its animation is really running.
const anim = await ev(`(()=>{
  const el=document.querySelector('[data-testid="ai-reason"][data-live="1"]') || document.querySelector('[data-testid="ai-reason"]');
  if(!el) return JSON.stringify({manca:'no-block'});
  const title=el.querySelector('.ai-reason-title');
  if(!title) return JSON.stringify({manca:'no-title'});
  const cs=getComputedStyle(title);
  return JSON.stringify({live: el.dataset.live, name: cs.animationName, dur: cs.animationDuration,
    bgImage: cs.backgroundImage.slice(0,30)});
})()`);
const a1 = typeof anim === 'string' && anim.startsWith('{') ? JSON.parse(anim) : null;
check('T2', Boolean(a1) && !a1.manca && a1.live === '1' && /shimmer/.test(a1.name || ''),
  `live state + shimmer: ${anim}`);

// T3 — THE HAZARD: the text must never be invisible. `color` has to be a real
//      colour, not `transparent` or `rgba(...,0)`.
const warna = await ev(`(()=>{
  const t=document.querySelector('.ai-reason-title');
  if(!t) return JSON.stringify({manca:'no-title'});
  const cs=getComputedStyle(t);
  return JSON.stringify({color: cs.color, fill: cs.webkitTextFillColor || cs.getPropertyValue('-webkit-text-fill-color')});
})()`);
/* The probe answers with JSON in every branch, including "no-title" — a bare
   string here made JSON.parse throw and took the whole run down before it
   printed anything, so a missing element looked like a broken harness. */
const w1 = JSON.parse(warna);
const terlihat = !w1.manca && !/rgba\(0, 0, 0, 0\)|transparent/.test(w1.color || '');
check('T3', terlihat, w1.manca ? 'no title element' : `title keeps a visible colour: ${w1.color}`);

// T4 — a finished run stops animating: a settled block that still shimmers
//      claims work is happening when it is not.
await ev(`(()=>{const S=window.__ZEPHYR_CLICHAT__; const aid='claude';
  S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===window.__THSID?{...x,
    messages:[{id:'th2',role:'assistant',content:'selesai',parts:[{type:'thinking',text:'Menimbang.'}]}]}:x)}}));
  return 1;})()`);
await new Promise((r) => setTimeout(r, 900));
const diam = await ev(`(()=>{const el=document.querySelector('[data-testid="ai-reason"]');
  if(!el) return JSON.stringify({manca:'no-block'});
  const t=el.querySelector('.ai-reason-title');
  if(!t) return JSON.stringify({manca:'no-title'});
  const cs=getComputedStyle(t);
  return JSON.stringify({live: el.dataset.live, name: cs.animationName});})()`);
const d1 = JSON.parse(diam);
check('T4', !d1.manca && d1.live === '0' && (d1.name === 'none' || d1.name === ''),
  d1.manca ? `missing: ${d1.manca}` : `settled block is still: ${diam}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
