// Select = native select + onChange React. Dispatch 'change' biasa TIDAK
// memicu React (React pakai event delegation di root & nilai controlled).
// Untuk React 18: set .value via native setter lalu dispatch 'change' dengan
// bubbles — React menangkapnya. Audit saya TIDAK pakai native setter → gagal.
// KESIMPULAN: 5 'GAGAL' models itu PALSU (artefak harness), bukan bug app.
// Buktikan dengan native setter:
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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return { err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await evalJs(`(() => { const b = [...document.querySelectorAll('[data-activity]')].find(e => e.getAttribute('data-activity') === 'settings'); if (b) b.click(); return 1; })()`);
await sleep(1000);
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-models"]'); if (b) b.click(); return 1; })()`);
await sleep(600);

const sebelum = await evalJs(`(() => { const e = document.querySelector('[data-testid="models-answerlang"]'); return e.value; })()`);
console.log('answerlang sebelum:', sebelum);
const r = await evalJs(`
  (() => {
    const el = document.querySelector('[data-testid="models-answerlang"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    const target = el.selectedIndex === el.options.length - 1 ? 0 : el.selectedIndex + 1;
    setter.call(el, el.options[target].value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()
`);
console.log('dengan native setter →', r);
await sleep(1200);
const sesudah = await evalJs(`(() => { const e = document.querySelector('[data-testid="models-answerlang"]'); return e.value; })()`);
console.log('setelah 1.2s:', sesudah, sebelum !== sesudah ? '= OK ✓ (bug palsu)' : '= GAGAL beneran ✗');

// kembalikan
if (sebelum !== sesudah) {
  await evalJs(`
    (() => {
      const el = document.querySelector('[data-testid="models-answerlang"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(sebelum)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    })()
  `);
  console.log('dikembalikan ke:', sebelum);
}
process.exit(0);
