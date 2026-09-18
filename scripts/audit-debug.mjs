// Debug audit: cek state settings
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
  if (r.result?.exceptionDetails) {
    return 'ERR: ' + r.result.exceptionDetails.text + ' ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 200);
  }
  return r.result?.result?.value;
}

console.log('S ada?', await evalJs('typeof S'));
console.log('settingsOpen:', await evalJs('S ? S.getState().settingsOpen : "-"'));
await evalJs('S.getState().setSettingsOpen(true); 1');
await new Promise((r) => setTimeout(r, 1200));
console.log('settingsOpen setelah set:', await evalJs('S.getState().settingsOpen'));
console.log('jumlah [data-testid]:', await evalJs('document.querySelectorAll("[data-testid]").length'));
console.log('contoh testid:', await evalJs('[...document.querySelectorAll("[data-testid]")].slice(0, 40).map((e) => e.getAttribute("data-testid")).join(", ")'));
console.log('ada set-enabled?', await evalJs('!!document.querySelector("[data-testid=set-enabled]")'));
process.exit(0);
