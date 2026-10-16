// Langkah 1: pasang pengintai di window Agents (tanpa await panjang).
import WebSocket from 'ws';
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const t = targets.find((x) => x.url.includes('#agents'));
const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); } });
function send(method, params = {}) {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const tmo = setTimeout(() => { pending.delete(myId); reject(new Error('timeout ' + method)); }, 8000);
    pending.set(myId, { resolve, t: tmo });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
async function ev(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
}
const hook = await ev(`(() => {
  if (window.__PROBE__) return 'sudah';
  window.__PROBE__ = { chunks: 0, raw: 0, first: null, last: null, err: null };
  const cb = window.__ZEPHYR_AI_CALLBACK__;
  window.__ZEPHYR_AI_CALLBACK__ = (c) => {
    window.__PROBE__.chunks++;
    if (!window.__PROBE__.first) window.__PROBE__.first = JSON.stringify(c).slice(0,300);
    window.__PROBE__.last = JSON.stringify(c).slice(0,300);
    try { return cb ? cb(c) : null; } catch (e) { window.__PROBE__.err = String(e); }
  };
  if (window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen('ai-chunk', () => { window.__PROBE__.raw++; });
  }
  return 'terpasang';
})()`);
console.log('hook:', JSON.stringify(hook));

// Kirim TANPA menunggu promise (send() resolve saat streaming selesai).
const kirim = await ev(`(() => {
  window.__PROBE__.sendErr = null;
  Promise.resolve(window.__ZEPHYR_AI__.send('Balas satu kata saja: OK'))
    .then(v => { window.__PROBE__.sendOk = v; })
    .catch(e => { window.__PROBE__.sendErr = String(e); });
  return 'dikirim';
})()`);
console.log('kirim:', JSON.stringify(kirim));
ws.close();
