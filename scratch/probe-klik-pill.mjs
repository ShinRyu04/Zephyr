// 1) Klik NYATA pada tombol toggle kanan lewat CDP, lalu buktikan kolom kanan
//    benar-benar hilang/muncul (data-testid="agents-right").
// 2) Ukur animasi pill: bandingkan pergeseran ikon Z antara window Agents
//    (.ag-open-editor) dan main window (.mb-aipill) saat body dibuka.
import WebSocket from 'ws';

const CDP = 'http://127.0.0.1:9223/json/list';

async function attach(pred, label) {
  const ts = await (await fetch(CDP)).json();
  const t = ts.find(pred);
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const P = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const p = P.get(m.id);
    if (p) { P.delete(m.id); clearTimeout(p.t); p.resolve(m); }
  });
  const send = (method, params = {}) => {
    const i = ++id;
    return new Promise((res, rej) => {
      const to = setTimeout(() => { P.delete(i); rej(new Error('timeout ' + method)); }, 15000);
      P.set(i, { resolve: res, t: to });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description };
    return r.result?.result?.value;
  };
  return { label, ev, send, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RECT = (sel) => `(() => {
  const b = document.querySelector(${JSON.stringify(sel)});
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`;

const AG = await attach((t) => t.type === 'page' && t.url.includes('#agents'), 'AGENTS');
const MAIN = await attach((t) => t.type === 'page' && !t.url.includes('#agents'), 'MAIN');

// ── 1) klik nyata pada toggle kanan ──────────────────────────────────────────
console.log('=== KLIK NYATA: toggle kolom kanan (window Agents) ===');
const pos = await AG.ev(RECT('[data-testid="ag-toggle-right"]'));
console.log('  titik tombol:', JSON.stringify(pos));

const adaSebelum = await AG.ev(`!!document.querySelector('[data-testid="agents-right"]')`);
console.log('  kolom kanan ada sebelum klik:', adaSebelum);

for (const type of ['mousePressed', 'mouseReleased']) {
  await AG.send('Input.dispatchMouseEvent', {
    type, x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1,
  });
}
await sleep(400);

const adaSesudah = await AG.ev(`!!document.querySelector('[data-testid="agents-right"]')`);
console.log('  kolom kanan ada sesudah klik:', adaSesudah);
console.log('  HASIL:', adaSebelum !== adaSesudah ? 'KLIK BEKERJA (kolom berubah)' : '*** KLIK TIDAK BEKERJA ***');

// klik sekali lagi untuk mengembalikan keadaan
for (const type of ['mousePressed', 'mouseReleased']) {
  await AG.send('Input.dispatchMouseEvent', {
    type, x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1,
  });
}
await sleep(400);
const kembali = await AG.ev(`!!document.querySelector('[data-testid="agents-right"]')`);
console.log('  kembali seperti semula:', kembali === adaSebelum ? 'YA' : 'TIDAK');

// ── 2) geometri pill: ikon harus DIAM, tombol melebar ────────────────────────
const SNAP = (sel) => `(() => {
  const btn = document.querySelector(${JSON.stringify(sel)});
  if (!btn) return { error: 'tidak ada' };
  const ic = btn.querySelector('.mb-aipill-ic');
  const body = btn.querySelector('.mb-aipill-body');
  const rr = (e) => { const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(2), w: +r.width.toFixed(2) }; };
  return { btn: rr(btn), ic: rr(ic), body: rr(body) };
})()`;

async function ukurPill(conn, sel, nama) {
  // pastikan tidak hover
  await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 500, buttons: 0 });
  await sleep(600);
  const tertutup = await conn.ev(SNAP(sel));
  if (tertutup?.error) { console.log(`  ${nama}: ${tertutup.error}`); return null; }

  const p = await conn.ev(RECT(sel));
  await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await sleep(700);
  const terbuka = await conn.ev(SNAP(sel));
  await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 500, buttons: 0 });
  await sleep(500);

  const d = {
    btnW: +(terbuka.btn.w - tertutup.btn.w).toFixed(2),
    icX: +(terbuka.ic.x - tertutup.ic.x).toFixed(2),
    bodyW: +(terbuka.body.w - tertutup.body.w).toFixed(2),
  };
  console.log(`  ${nama.padEnd(8)} btn +${d.btnW}px | ikon X ${d.icX >= 0 ? '+' : ''}${d.icX}px | body +${d.bodyW}px`);
  return d;
}

console.log('\n=== ANIMASI PILL: ikon harus DIAM (0.00px) ===');
const a = MAIN ? await ukurPill(MAIN, '.mb-aipill', 'MAIN') : null;
const b = AG ? await ukurPill(AG, '.ag-open-editor', 'AGENTS') : null;

if (a && b) {
  const ok = (k, x, y) => console.log(`  ${k.padEnd(14)} main=${String(x).padStart(7)} agents=${String(y).padStart(7)}  ${String(x) === String(y) ? 'SAMA' : '*** BEDA ***'}`);
  console.log('\n=== PERBANDINGAN ===');
  ok('tombol melebar', a.btnW, b.btnW);
  ok('ikon bergeser', a.icX, b.icX);
  ok('body terbuka', a.bodyW, b.bodyW);
  const diam = Math.abs(b.icX) < 0.5;
  console.log(`\n  IKON DIAM DI AGENTS: ${diam ? 'YA (+' + b.icX + 'px) <-- BENAR' : 'TIDAK (' + b.icX + 'px) <-- MASIH SALAH'}`);
}

AG?.close();
MAIN?.close();
