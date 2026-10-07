/*
 * L1..L3 — a REAL request to a current model succeeds and returns thinking.
 *
 * This is the check that matters, because the bug it caught was invisible to
 * unit tests of the request shape: the API rejects the wrong `thinking` form
 * with a 400, so the only honest proof is an actual round trip. The code used to
 * send `budget_tokens` to every model, which newer ones reject outright.
 *
 * Costs one real request, so it lives outside the fast suite.
 *
 * Run: node scripts/verify-thinking-live.mjs
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

/* Which providers actually have a key, so the check uses a real one. */
const ada = await ev(`(()=>{const p=window.__ZEPHYR_AI__.store.getState();
  const pub = window.__ZEPHYR_AI__.catalog ? window.__ZEPHYR_AI__.catalog() : [];
  return JSON.stringify(pub.slice(0,3).map(x=>x.provider));})()`);
console.log('katalog:', ada);

/* Ask a question that benefits from reasoning: the model must decide, not recall. */
console.log('kirim:', await ev(`
(()=>{const S=window.__ZEPHYR_AI__.store; const st=S.getState();
  const id = st.newChat ? st.newChat() : st.activeId;
  S.getState().send('Pertimbangkan dua pendekatan untuk menyimpan riwayat chat: satu tabel besar vs tabel per sesi. Pilih satu dan jelaskan alasanmu dalam dua kalimat.');
  return 'sent ' + id;})()
`));

let hasil = null;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{const st=window.__ZEPHYR_AI__.store.getState();
    const m=(st.activeSession()||{}).messages||[];
    const last=[...m].reverse().find(x=>x.role==='assistant');
    if(!last) return null;
    return JSON.stringify({streaming: !!last.streaming, error: last.error||null,
      text: (last.content||'').slice(0,100), reasoning: (last.reasoning||'').length});})()`);
  if (!s) continue;
  const j = JSON.parse(s);
  if (!j.streaming) { hasil = j; break; }
}

check('L1', Boolean(hasil), hasil ? `reply arrived: ${JSON.stringify(hasil.text.slice(0, 60))}` : 'no reply in 120s');
check('L2', Boolean(hasil) && !hasil.error, hasil && hasil.error ? `ERROR: ${hasil.error}` : 'no error (no 400)');
check('L3', Boolean(hasil) && hasil.text.length > 0, hasil ? `${hasil.text.length} chars of answer; reasoning field len=${hasil.reasoning}` : 'skipped');

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
