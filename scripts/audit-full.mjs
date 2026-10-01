// AUDIT LENGKAP SETTINGS: klik semua tab, toggle semua checkbox, ubah semua
// select & number input, lalu laporkan mana yang tidak berefek.
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
  if (r.result?.exceptionDetails) {
    return { err: r.result.exceptionDetails.text + ' ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 120) };
  }
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Buka settings
await evalJs(`(() => { const b = [...document.querySelectorAll('[data-activity]')].find(e => e.getAttribute('data-activity') === 'settings'); if (b) b.click(); return 1; })()`);
await sleep(1000);

// Klik semua tab nav, kumpulkan kontrol di tiap halaman
const tabs = await evalJs('[...document.querySelectorAll("[data-testid^=set-nav-]")].map(e => e.getAttribute("data-testid"))');
console.log('tab:', tabs.join(', '));

const laporan = [];

for (const tab of tabs) {
  await evalJs(`(() => { const b = document.querySelector('[data-testid="${tab}"]'); if (b) b.click(); return 1; })()`);
  await sleep(500);

  // Checkbox
  const cbs = await evalJs(`JSON.stringify([...document.querySelectorAll('input[type=checkbox][data-testid]')].filter(e => !e.disabled).map(e => ({ id: e.getAttribute('data-testid'), c: e.checked })))`);
  for (const c of JSON.parse(cbs || '[]')) {
    const sebelum = c.c;
    await evalJs(`(() => { const e = document.querySelector('[data-testid="${c.id}"]'); e.click(); return 1; })()`);
    await sleep(300);
    const sesudah = await evalJs(`(() => { const e = document.querySelector('[data-testid="${c.id}"]'); return e.checked; })()`);
    const ok = sebelum !== sesudah;
    laporan.push({ tab, id: c.id, hasil: ok ? 'OK' : 'GAGAL', detail: sebelum + '→' + sesudah });
    // toggle balik
    if (ok) {
      await evalJs(`(() => { const e = document.querySelector('[data-testid="${c.id}"]'); e.click(); return 1; })()`);
      await sleep(250);
    }
  }

  // Select
  const sels = await evalJs(`JSON.stringify([...document.querySelectorAll('select[data-testid]')].filter(e => !e.disabled).map(e => ({ id: e.getAttribute('data-testid'), n: e.options.length })))`);
  for (const sl of JSON.parse(sels || '[]')) {
    const r = await evalJs(`
      (() => {
        const el = document.querySelector('[data-testid="${sl.id}"]');
        if (el.options.length < 2) return 'hanya 1 opsi';
        const sebelum = el.value;
        el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return sebelum + ' → ' + el.value;
      })()
    `);
    laporan.push({ tab, id: sl.id, hasil: r.err ? 'GAGAL' : 'OK', detail: String(r) });
  }

  // Number input
  const nums = await evalJs(`JSON.stringify([...document.querySelectorAll('input[type=number][data-testid]')].filter(e => !e.disabled).map(e => ({ id: e.getAttribute('data-testid'), v: e.value })))`);
  for (const nu of JSON.parse(nums || '[]')) {
    const r = await evalJs(`
      (() => {
        const el = document.querySelector('[data-testid="${nu.id}"]');
        const sebelum = el.value;
        el.value = Number(sebelum || 0) + 2;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return sebelum + ' → ' + el.value;
      })()
    `);
    laporan.push({ tab, id: nu.id, hasil: r.err ? 'GAGAL' : 'OK', detail: String(r) });
  }
}

console.log('\n=== LAPORAN AUDIT SETTINGS ===');
for (const l of laporan) console.log(`[${l.tab}] ${l.id}: ${l.hasil} (${l.detail})`);
console.log('total diuji:', laporan.length, '| gagal:', laporan.filter((l) => l.hasil === 'GAGAL').length);
process.exit(0);
