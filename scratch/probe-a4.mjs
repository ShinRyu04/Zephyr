// Bandingkan: apakah event ai-chunk nyampe ke MAIN window?
// Di main window kita TIDAK kirim dari situ - kita cuma pasang listener mentah,
// lalu kirim dari window Agents, dan lihat apakah main window mendengar.
import WebSocket from 'ws';
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();

async function conn(t) {
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
    if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.exception?.description?.slice(0,200) };
    return r.result?.result?.value;
  };
  return { ws, ev };
}

const main = targets.find((x) => x.url.endsWith('/') || x.url.endsWith('/index.html'));
const agents = targets.find((x) => x.url.includes('#agents'));
const M = await conn(main);
const A = await conn(agents);

// Listener MENTAH di kedua window (event Tauri langsung, bukan lewat store).
for (const [nama, c] of [['main', M], ['agents', A]]) {
  console.log(nama, 'hook:', await c.ev(`(() => {
    window.__RAW__ = 0;
    window.__ZEPHYR_AI__.store.getState().__rawHook = true;
    if (window.__TAURI__?.event?.listen) window.__TAURI__.event.listen('ai-chunk', () => { window.__RAW__++; });
    return typeof window.__TAURI__?.event?.listen;
  })()`));
}

// Kirim dari window AGENTS.
console.log('fire:', await A.ev(`(() => { window.__ZEPHYR_AI__.send('ping'); return 'ok'; })()`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const m = await M.ev('window.__RAW__');
  const a = await A.ev('window.__RAW__');
  console.log(`t+${i+1}s  main_raw=${m}  agents_raw=${a}`);
  if (a > 0) break;
}
M.ws.close(); A.ws.close();
