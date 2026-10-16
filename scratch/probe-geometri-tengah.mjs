// Ukur posisi tiap anak .ag-tb-center supaya perbaikan flex-start bisa
// mempertahankan posisi search box yang sekarang.
import WebSocket from 'ws';
const CDP = 'http://127.0.0.1:9223/json/list';

async function attach(pred) {
  const ts = await (await fetch(CDP)).json();
  const t = ts.find(pred);
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0; const P = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = P.get(m.id); if (p) { P.delete(m.id); clearTimeout(p.t); p.resolve(m); } });
  const send = (method, params = {}) => { const i = ++id; return new Promise((res, rej) => { const to = setTimeout(() => { P.delete(i); rej(new Error('timeout')); }, 15000); P.set(i, { resolve: res, t: to }); ws.send(JSON.stringify({ id: i, method, params })); }); };
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description }; return r.result?.result?.value; };
  return { ev, send, close: () => ws.close() };
}

const PROBE = `(() => {
  const g = document.querySelector('.ag-tb-center');
  const gr = g.getBoundingClientRect();
  const cs = getComputedStyle(g);
  const kids = [...g.children].map((e) => {
    const r = e.getBoundingClientRect();
    return { cls: (typeof e.className === 'string' ? e.className : '(svg)'), x: +r.x.toFixed(2), w: +r.width.toFixed(2) };
  });
  const win = window.innerWidth;
  const first = kids[0];
  return {
    grup: { x: +gr.x.toFixed(2), w: +gr.width.toFixed(2) },
    window: win,
    justify: cs.justifyContent,
    paddingLeft: cs.paddingLeft,
    transform: cs.transform,
    anak: kids,
    // padding yang dibutuhkan agar dengan flex-start anak pertama mendarat di x yang sama
    paddingPerlu: +(first.x - gr.x).toFixed(2),
    paddingPerluPersen: +(((first.x - gr.x) / gr.width) * 100).toFixed(3),
  };
})()`;

const a = await attach((t) => t.type === 'page' && t.url.includes('#agents'));
if (a) {
  console.log(JSON.stringify(await a.ev(PROBE), null, 2));
  a.close();
} else console.log('window Agents tidak terbuka');
