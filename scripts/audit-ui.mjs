// Audit v2: buka Settings via UI klik (activity bar gear) karena global S
// tidak terekspos (build mungkin tanpa devBridge atau nama beda).
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
    return 'ERR: ' + r.result.exceptionDetails.text + ' ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 150);
  }
  return r.result?.result?.value;
}

// Cari tombol settings/activity bar
console.log('tombol activity:', await evalJs('[...document.querySelectorAll("[data-activity]")].map(e => e.getAttribute("data-activity")).join(", ")'));
// Klik settings via menubar? cari teks 'Settings'
const klik = await evalJs(`
  (() => {
    const kandidat = [...document.querySelectorAll('button, [role=menuitem], [data-activity]')].filter(e =>
      /settings/i.test(e.getAttribute('data-activity') || '') || /settings/i.test((e.textContent || '').slice(0, 40)));
    if (kandidat.length === 0) return 'tidak ada tombol settings';
    kandidat[0].click();
    return 'klik: ' + (kandidat[0].getAttribute('data-activity') || kandidat[0].textContent.slice(0, 30));
  })()
`);
console.log(klik);
await new Promise((r) => setTimeout(r, 1200));
console.log('jumlah [data-testid] sekarang:', await evalJs('document.querySelectorAll("[data-testid]").length'));
console.log('contoh testid:', await evalJs('[...document.querySelectorAll("[data-testid]")].slice(0, 50).map((e) => e.getAttribute("data-testid")).join(", ")'));
process.exit(0);
