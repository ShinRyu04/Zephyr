// Audit kontrol Settings via CDP (buka Settings, daftar kontrol, toggle semua,
// bandingkan state sebelum/sesudah → deteksi yang tidak berefek).
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
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '').slice(0, 150) };
  return r.result?.result?.value;
}

// Buka Settings
await evalJs('S.getState().setSettingsOpen(true); 1');
await new Promise((r) => setTimeout(r, 900));

// Daftar kontrol
const daftarJson = await evalJs(`
  (() => {
    const ctrls = [...document.querySelectorAll('[data-testid]')].filter(el => {
      const id = el.getAttribute('data-testid') || '';
      return (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'BUTTON') &&
             /set-|lsp-|scm-|ssh-|theme/i.test(id);
    });
    return JSON.stringify(ctrls.map(el => ({
      id: el.getAttribute('data-testid'),
      tag: el.tagName,
      type: el.type || '',
      disabled: !!el.disabled,
      checked: el.checked === undefined ? null : el.checked,
    })));
  })()
`);
const daftar = JSON.parse(daftarJson);
console.log('KONTROL TERDETEKSI:', daftar.length);
for (const c of daftar) console.log(`  [${c.tag}:${c.type}] ${c.id} disabled=${c.disabled} checked=${c.checked}`);

// Toggle semua checkbox yang tidak disabled → cek apakah state berubah
console.log('\n=== UJI TOGGLE ===');
for (const c of daftar.filter((x) => x.tag === 'INPUT' && x.type === 'checkbox' && !x.disabled)) {
  const sebelum = await evalJs(`(() => { const el = document.querySelector('[data-testid="${c.id}"]'); return el.checked; })()`);
  await evalJs(`(() => { const el = document.querySelector('[data-testid="${c.id}"]'); el.click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 350));
  const sesudah = await evalJs(`(() => { const el = document.querySelector('[data-testid="${c.id}"]'); return el.checked; })()`);
  const ok = sebelum !== sesudah;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${c.id}: ${sebelum} → ${sesudah}`);
  if (!ok) {
    // klik balik biar state tidak tertinggal
    await evalJs(`(() => { const el = document.querySelector('[data-testid="${c.id}"]'); el.click(); return 1; })()`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

console.log('\n=== UJI SELECT ===');
for (const c of daftar.filter((x) => x.tag === 'SELECT' && !x.disabled)) {
  const r = await evalJs(`
    (() => {
      const el = document.querySelector('[data-testid="${c.id}"]');
      if (el.options.length < 2) return 'kosong';
      const sebelum = el.selectedIndex;
      el.selectedIndex = (sebelum + 1) % el.options.length;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return sebelum + ' → ' + el.selectedIndex;
    })()
  `);
  console.log(`  ${c.id}: ${r}`);
}

console.log('\nSelesai audit otomatis.');
process.exit(0);
