// Uji terfokus: lsp-enabled klik → tunggu 1.5s → cek checked & settings.json
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
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-lsp"]'); if (b) b.click(); return 1; })()`);
await sleep(600);

const sebelum = await evalJs(`(() => { const e = document.querySelector('[data-testid="lsp-enabled"]'); return e.checked; })()`);
console.log('checked sebelum:', sebelum);
// Klik via MouseEvent lengkap
await evalJs(`
  (() => {
    const e = document.querySelector('[data-testid="lsp-enabled"]');
    e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return e.checked;
  })()
`);
console.log('checked sesaat setelah klik:', await evalJs(`(() => { const e = document.querySelector('[data-testid="lsp-enabled"]'); return e.checked; })()`));
await sleep(300);
console.log('checked 1.5s kemudian:', await evalJs(`(() => { const e = document.querySelector('[data-testid="lsp-enabled"]'); return e.checked; })()`));
// Baca state React via __ZEPHYR debug? Cek settings file via invoke command getSettings
const settings = await evalJs(`
  (async () => {
    // cari invoke via import tauri dari module? gunakan __TAURI_INTERNALS__
    const inv = window.__TAURI_INTERNALS__.invoke;
    return JSON.stringify(await inv('get_settings'));
  })()
`, true);
try {
  const obj = JSON.parse(settings);
  console.log('settings.lsp.enabled (dari Rust):', obj.lsp?.enabled);
  console.log('settings.lsp.servers.go:', JSON.stringify(obj.lsp?.servers?.go ?? null));
} catch (e) {
  console.log('settings parse:', String(settings).slice(0, 200));
}
process.exit(0);
