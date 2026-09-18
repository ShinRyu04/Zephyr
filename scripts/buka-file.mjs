// buka-file.mjs — buka file di editor, lalu cek mode bahasa CodeMirror aktif.
import WebSocket from 'ws';

const u = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json());
const ws = new WebSocket(u[0].webSocketDebuggerUrl);
let i = 1;
const p = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
const send = (m2, params = {}) =>
  new Promise((r) => { const x = i++; p.set(x, r); ws.send(JSON.stringify({ id: x, method: m2, params })); });

await send('Runtime.enable');
await send('Runtime.evaluate', {
  expression: `window.__Z__=null; window.__ZEPHYR_WS__.bukaFile('D:/zephyr-demo/main.rs')
    .then(()=>{window.__Z__='buka'}).catch(e=>{window.__Z__='E '+String(e)})`,
  awaitPromise: true,
});
await new Promise((r) => setTimeout(r, 3500));
const r0 = await send('Runtime.evaluate', { expression: 'window.__Z__', awaitPromise: true });
console.log('bukaFile =', r0.result?.result?.value);

const r1 = await send('Runtime.evaluate', {
  expression: `(() => {
    const v = window.__ZEPHYR_CM__();
    if (!v) return 'tidak ada view editor';
    return JSON.stringify({ doc: v.state.doc.toString().slice(0, 50) });
  })()`,
  awaitPromise: true,
});
console.log('editor =', r1.result?.result?.value);

// statusbar bahasa + jumlah token highlight (span berwarna = highlighting aktif)
const r2 = await send('Runtime.evaluate', {
  expression: `(() => {
    const el = document.querySelector('.status-lang, [data-testid="status-lang"]');
    const toks = document.querySelectorAll('.cm-content .cm-line span').length;
    return JSON.stringify({ statusbar: el ? el.textContent : 'tidak ada', tokenSpan: toks });
  })()`,
  awaitPromise: true,
});
console.log('highlight =', r2.result?.result?.value);
ws.close();
