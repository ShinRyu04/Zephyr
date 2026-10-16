// Kirim dari window Agents lalu pantau bubble-nya (polling, tanpa await panjang).
import WebSocket from 'ws';
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const t = targets.find((x) => x.url.includes('#agents'));
const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); } });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = ++id;
  const tmo = setTimeout(() => { pending.delete(myId); reject(new Error('timeout')); }, 10000);
  pending.set(myId, { resolve, t: tmo });
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.exception?.description?.slice(0, 300) };
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pasang pengintai, fire-and-forget.
console.log('hook:', await ev(`(() => {
  window.__P2__ = { n: 0 };
  const cb = window.__ZEPHYR_AI_CALLBACK__;
  window.__ZEPHYR_AI_CALLBACK__ = (c) => { window.__P2__.n++; window.__P2__.last = JSON.stringify(c).slice(0,200); try { return cb(c); } catch(e){} };
  window.__ZEPHYR_AI__.send('Balas: OK').then(v => { window.__P2__.ok = v; }).catch(e => { window.__P2__.err = String(e); });
  return 'fired';
})()`));

for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const s = await ev(`JSON.stringify({
    chunks: window.__P2__.n, sendOk: window.__P2__.ok ?? null, sendErr: window.__P2__.err ?? null,
    msgs: window.__ZEPHYR_AI__.messages().slice(-2).map(m => ({r:m.role, s:m.streaming, e:m.error, t:(m.content||'').slice(0,120)}))
  })`);
  console.log(`t+${i+1}s`, s);
  const p = JSON.parse(s);
  const last = p.msgs?.[p.msgs.length - 1];
  if (last && last.r === 'assistant' && !last.s) break;
}
ws.close();
