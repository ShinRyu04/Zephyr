// inspeksi DOM release tanpa bridge — HAPUS setelah selesai.
import WebSocket from 'ws';
const port = process.argv[2] || '9224';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };

console.log('title:', await ev('document.title'));
console.log('app-root:', await ev("!!document.querySelector('.app-root')"));
console.log('activity-bar btns:', await ev("document.querySelectorAll('.ab-btn').length"));
console.log('bridges:', await ev("Object.keys(window).filter(k=>k.startsWith('__ZEPHYR')).length"));
console.log('body bg:', await ev("getComputedStyle(document.body).backgroundColor"));
console.log('theme attr:', await ev("document.documentElement.dataset.theme"));
console.log('console errs (window.onerror count):', await ev("(window.__errcount||0)"));
ws.close();
