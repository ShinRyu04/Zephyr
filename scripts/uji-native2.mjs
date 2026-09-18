// Uji native-setter v2: detail error & cek elemen
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

async function evalJs(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  const rd = JSON.stringify({
    err: r.result?.exceptionDetails
      ? r.result.exceptionDetails.text + ' :: ' + String(r.result.exceptionDetails.exception?.details || r.result.exceptionDetails.exception?.description || '').slice(0, 300)
      : null,
  });
  if (r.result?.exceptionDetails) return { err: rd };
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await evalJs(`(() => { const b = [...document.querySelectorAll('[data-activity]')].find(e => e.getAttribute('data-activity') === 'settings'); if (b) b.click(); return 1; })()`);
await sleep(1000);
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-models"]'); if (b) b.click(); return 1; })()`);
await sleep(700);
console.log('elemen answerlang ada?', await evalJs(`!!document.querySelector('[data-testid="models-answerlang"]')`));
console.log('nav model aktif?', await evalJs(`!!document.querySelector('[data-testid="set-nav-models"][aria-selected=true]') || !!document.querySelector('.set-nav .is-active')`));
const r = await evalJs(`
  (() => {
    try {
      const el = document.querySelector('[data-testid="models-answerlang"]');
      if (!el) return 'ELEMEN TIDAK ADA';
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      const target = el.selectedIndex === el.options.length - 1 ? 0 : el.selectedIndex + 1;
      setter.call(el, el.options[target].value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'OK: ' + el.value;
    } catch (e) {
      return 'CATCH: ' + e.message;
    }
  })()
`);
console.log('hasil:', r);
await sleep(1200);
console.log('nilai sekarang:', await evalJs(`(() => { const el = document.querySelector('[data-testid="models-answerlang"]'); return el ? el.value : 'hilang'; })()`));
process.exit(0);
