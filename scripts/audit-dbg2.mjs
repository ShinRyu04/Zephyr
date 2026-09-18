// Debug kenapa tab kosong — mungkin atributnya bukan data-testid pada tombol nav
import WebSocket from 'ws';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.on('open', r));

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR: ' + r.result.exceptionDetails.text;
  return r.result?.result?.value;
}

console.log(await evalJs('document.querySelectorAll("[data-testid^=set-nav-]").length'));
console.log(await evalJs('document.querySelectorAll("[data-testid^=set-]").length'));
console.log(await evalJs('[...document.querySelectorAll("[data-testid^=set-]")].slice(0,5).map(e=>e.tagName + ":" + e.getAttribute("data-testid")).join(" | ")'));
process.exit(0);
