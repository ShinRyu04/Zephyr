/*
 * W1..W3 — the diff view follows the PANEL's width.
 *
 * The user's correction: a docked panel should show one column, and a
 * maximised panel should show two. The failure this guards against is subtle —
 * the view looks right at whichever width it was tested at, and wrong at the
 * other, so a single screenshot cannot catch it. These checks resize the
 * element and read the mode back at both widths.
 *
 * Run: node scripts/verify-diff-auto.mjs
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

/* Render a diff into a plain container so the width can be set directly,
   instead of fighting the panel's own layout. */
console.log('mount:', await ev(`
window.__W = { mount: (px) => {
  let host = document.getElementById('__wtest');
  if (!host) { host = document.createElement('div'); host.id = '__wtest';
    host.style.cssText = 'position:fixed;left:-9999px;top:0;background:#111;';
    document.body.appendChild(host); }
  host.style.width = px + 'px';
  return JSON.stringify({ w: host.getBoundingClientRect().width });
}}; 'ok'`));

const ready = await ev(`window.__W ? 'ok' : 'no'`);
check('W0', ready === 'ok', 'harness mounted');

/* The kit must already be loaded by the running app; reach it through an
   existing diff if one is on screen, otherwise report that honestly. */
/*
 * Render the diff this harness needs, instead of hoping one is on screen.
 *
 * Harnesses share one app instance, so a check that depends on leftover DOM
 * passes or fails according to which harness ran before it — here, a todo
 * harness overwrote the session and this one found no diff to resize.
 */
console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 800));
/* The payload is embedded via JSON.stringify so the newlines inside the diff
   halves survive the trip into the page; hand-escaped 
 silently collapses
   the diff to one line and the resize test then proves nothing. */
const seedParts = [{"type": "tool", "callId": "wauto", "name": "Edit", "title": "src/a.ts", "status": "ok", "diffOld": "const a = 1;\nconst b = 2;\nconst c = 3;", "diffNew": "const a = 1;\nconst B = 22;\nconst c = 3;"}];
console.log('seed:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState(); const aid='claude';
const sid=st.activeId[aid]||(st.sessions[aid][0]&&st.sessions[aid][0].id);
const parts=${JSON.stringify(seedParts)};
S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===sid?{...x,messages:[{id:'wauto',role:'assistant',content:'ok',parts}]}:x)}}));
return 'seeded';})()
`));
await new Promise((r) => setTimeout(r, 1100));

const has = await ev(`document.querySelectorAll('.cli-diff').length`);
check('W1', typeof has === 'number', `existing diffs on screen = ${has}`);

/* Drive the real element if present: shrink its container and confirm the mode
   flips, then widen it and confirm it flips back. */
/*
 * `Runtime.evaluate` does not await a returned promise (and `awaitPromise` is
 * unreliable in WebView2), so an async IIFE comes back as an empty object. The
 * established pattern in this repo is a result slot on `window` that the poll
 * below reads until it is filled.
 */
await ev(`
window.__FLIP = { done: false };
(async () => {
  const d = document.querySelector('.cli-diff');
  if (!d) { window.__FLIP = { done: true, value: 'no-diff-on-screen' }; return; }
  /* The direct parent is sized by the timeline, so resizing IT does nothing.
     The column that actually decides the diff's width is the assistant
     wrapper, several levels up. */
  const wrap = d.closest('.cli-native-assistant') || d.parentElement;
  const wait = () => new Promise((r) => setTimeout(r, 450));
  const before = d.dataset.mode;
  const beforeAuto = d.dataset.auto;
  const measurement = () => Math.round(d.getBoundingClientRect().width);

  const oldW = wrap.style.width;
  wrap.style.width = '360px';
  await wait();
  const narrowW = measurement();
  const narrow = d.dataset.mode;

  wrap.style.width = '900px';
  await wait();
  const wideW = measurement();
  const wideMode = d.dataset.mode;

  wrap.style.width = oldW;
  await wait();
  window.__FLIP = { done: true, value: JSON.stringify({ before, beforeAuto, narrowW, wideW, narrow, wideMode, restored: d.dataset.mode, finalAuto: d.dataset.auto }) };
})().catch((e) => { window.__FLIP = { done: true, value: 'ERR ' + e }; });
'go'
`);

let flip = null;
for (let i = 0; i < 60; i++) {
  const slot = await ev(`window.__FLIP && window.__FLIP.done ? window.__FLIP.value : null`);
  if (slot) { flip = slot; break; }
  await new Promise((r) => setTimeout(r, 200));
}
const flipRaw = flip && typeof flip === 'object' && 'value' in flip ? flip.value : flip;
const f = typeof flipRaw === 'string' && flipRaw.startsWith('{') ? JSON.parse(flipRaw) : (flipRaw && typeof flipRaw === 'object' ? flipRaw : null);
check('W2', Boolean(f) && f.narrow === 'unified' && f.wideMode === 'split',
  f ? `narrow=${f.narrow} wide=${f.wideMode} auto=${f.finalAuto}` : String(flip));
check('W3', Boolean(f) && f.finalAuto === '1',
  f ? `auto flag=${f.finalAuto}` : 'n/a');

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
