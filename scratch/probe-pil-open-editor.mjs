// Probe: apakah pil "Open in Editor" di window Agents identik dengan pil
// "Open in Agents" di main window — markup, metrik, dan yang terpenting
// APAKAH IKONNYA BERGERAK saat label dibuka.
//
// Yang diukur bukan tebakan: getBoundingClientRect() ikon dan tombol pada
// keadaan tertutup vs terbuka (class .mb-aipill-body di-override lebarnya),
// lalu delta-nya dibandingkan antara kedua jendela.
import WebSocket from 'ws';

const CDP = 'http://127.0.0.1:9223/json/list';

async function attach(pred, label) {
  const targets = await (await fetch(CDP)).json();
  const t = targets.find(pred);
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); }
  });
  const send = (method, params = {}) => {
    const myId = ++id;
    return new Promise((resolve, reject) => {
      const tmo = setTimeout(() => { pending.delete(myId); reject(new Error(`timeout ${method}`)); }, 15000);
      pending.set(myId, { resolve, t: tmo });
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  };
  const evaljs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result?.exceptionDetails) {
      return { error: r.result.exceptionDetails.exception?.description ?? 'exception' };
    }
    return r.result?.result?.value;
  };
  return { label, evaljs, close: () => ws.close() };
}

/**
 * Ukur pil di dalam satu dokumen.
 *
 * Cara mengukur "terbuka" tanpa hover sungguhan: set inline style pada
 * .mb-aipill-body meniru aturan :hover di index.css (max-width 180px,
 * opacity 1, margin-left 6px). Itu persis nilai yang dipakai CSS, jadi
 * geometri yang dihasilkan sama dengan keadaan hover.
 */
const UKUR = (selBtn, selIkon, selBody) => `(() => {
  const btn = document.querySelector(${JSON.stringify(selBtn)});
  if (!btn) return { error: 'tombol tidak ditemukan' };
  const ikon = btn.querySelector(${JSON.stringify(selIkon)});
  const body = btn.querySelector(${JSON.stringify(selBody)});
  const cs = getComputedStyle(btn);
  const csIkon = ikon ? getComputedStyle(ikon) : null;

  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), w: +r.width.toFixed(2) }; };
  const styleOf = (el) => el ? { width: el.style.width, maxWidth: el.style.maxWidth, flex: el.style.flex, display: el.style.display } : null;

  // Kalau ada override inline yang mengunci geometri, ukurannya tidak akan
  // berubah walau CSS diubah — jadi catat dulu sebelum apa pun disentuh.
  if (btn.style.width) btn.style.removeProperty('width');
  if (btn.style.maxWidth) btn.style.removeProperty('max-width');
  if (btn.style.flex) btn.style.removeProperty('flex');
  void btn.offsetWidth;
  const inlineDihapus = { btn: true };
  const inline = { btn: styleOf(btn), body: styleOf(body) };

  const tertutup = { btn: rect(btn), ikon: rect(ikon) };
  const ikonWarnaTertutup = csIkon ? csIkon.color : null;

  // Paksa keadaan "hover" lewat inline style, sama nilainya dengan :hover CSS.
  const simpan = { maxWidth: body.style.maxWidth, opacity: body.style.opacity, marginLeft: body.style.marginLeft };
  body.style.maxWidth = '180px';
  body.style.opacity = '1';
  body.style.marginLeft = '6px';
  void body.offsetWidth;
  const terbuka = { btn: rect(btn), ikon: rect(ikon) };
  const bodyTerbukaW = rect(body).w;
  body.style.maxWidth = simpan.maxWidth;
  body.style.opacity = simpan.opacity;
  body.style.marginLeft = simpan.marginLeft;

  return {
    inline,
    inlineDihapus,
    markup: {
      tombolKelas: btn.className,
      ikonKelas: ikon ? ikon.className : null,
      ikonViewBox: ikon ? ikon.getAttribute('viewBox') : null,
      bodyKelas: body ? body.className : null,
      labelKelas: body?.firstElementChild ? body.firstElementChild.className : null,
      labelTeks: body?.textContent ?? null,
    },
    metrik: {
      margin: cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft,
      padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      height: cs.height,
      borderRadius: cs.borderRadius,
      gap: cs.gap,
      display: cs.display,
      justify: getComputedStyle(btn).justifyContent,
    },
    warna: {
      tombolTertutup: cs.color,
      ikonTertutup: ikonWarnaTertutup,
      bodyTransition: body ? getComputedStyle(body).transition : null,
    },
    // INI inti ujinya: kalau ikon bergerak, deltaX != 0.
    gerak: {
      btnDeltaW: +(terbuka.btn.w - tertutup.btn.w).toFixed(2),
      ikonDeltaX: +(terbuka.ikon.x - tertutup.ikon.x).toFixed(2),
      ikonDeltaW: +(terbuka.ikon.w - tertutup.ikon.w).toFixed(2),
      bodyTerbukaW,
    },
  };
})()`;

const main = await attach((t) => t.type === 'page' && !t.url.includes('#agents'), 'MAIN WINDOW');
if (!main) { console.log('FATAL: target main window tidak ada'); process.exit(1); }

let agents = await attach((t) => t.url.includes('#agents'), 'AGENTS WINDOW');

if (!agents) {
  console.log('window Agents belum terbuka -> membukanya lewat Ctrl+Shift+A ...');
  await main.evaljs(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, shiftKey: true, bubbles: true }));
    return true;
  })()`);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 700));
    agents = await attach((t) => t.url.includes('#agents'), 'AGENTS WINDOW');
    if (agents) break;
  }
}

if (!agents) { console.log('FATAL: window Agents tidak kunjung terbuka'); process.exit(1); }

// Tunggu bar-nya ter-render.
await new Promise((r) => setTimeout(r, 1200));

console.log('\n=== MAIN WINDOW: .mb-aipill (Open in Agents) ===');
const a = await main.evaljs(UKUR('.mb-aipill', '.mb-aipill-ic', '.mb-aipill-body'));
console.log(JSON.stringify(a, null, 2));

console.log('\n=== AGENTS WINDOW: .ag-open-editor (Open in Editor) ===');
const b = await agents.evaljs(UKUR('.ag-open-editor', '.mb-aipill-ic', '.mb-aipill-body'));
console.log(JSON.stringify(b, null, 2));

// Tooltip chord
const tip = await agents.evaljs(`(() => {
  const t = document.querySelector('[data-testid="tip"]');
  return t ? t.textContent : 'tooltip tidak tampil (butuh hover 420ms)';
})()`);
console.log('\ntooltip saat ini:', tip);

if (a && b && !a.error && !b.error) {
  console.log('\n=== SELISIH ===');
  const cmp = (k, x, y) => console.log(`${k.padEnd(22)} main=${JSON.stringify(x)}  agents=${JSON.stringify(y)}  ${JSON.stringify(x) === JSON.stringify(y) ? 'SAMA' : '*** BEDA ***'}`);
  cmp('margin', a.metrik.margin, b.metrik.margin);
  cmp('padding', a.metrik.padding, b.metrik.padding);
  cmp('height', a.metrik.height, b.metrik.height);
  cmp('borderRadius', a.metrik.borderRadius, b.metrik.borderRadius);
  cmp('gap', a.metrik.gap, b.metrik.gap);
  cmp('ikonViewBox', a.markup.ikonViewBox, b.markup.ikonViewBox);
  cmp('ikonKelas', a.markup.ikonKelas, b.markup.ikonKelas);
  cmp('bodyKelas', a.markup.bodyKelas, b.markup.bodyKelas);
  cmp('ikonWarnaTertutup', a.warna.ikonTertutup, b.warna.ikonTertutup);
  cmp('gerak.btnDeltaW', a.gerak.btnDeltaW, b.gerak.btnDeltaW);
  cmp('gerak.ikonDeltaX', a.gerak.ikonDeltaX, b.gerak.ikonDeltaX);

  const gerak = b.gerak.ikonDeltaX !== 0;
  console.log('\nHASIL IKON BERGERAK DI AGENTS:', gerak ? `YA (deltaX=${b.gerak.ikonDeltaX}px)` : `TIDAK (deltaX=0) <-- animasi tidak sama`);
  const arah = a.gerak.ikonDeltaX > 0 ? 'kanan' : a.gerak.ikonDeltaX < 0 ? 'kiri' : 'diam';
  const arahB = b.gerak.ikonDeltaX > 0 ? 'kanan' : b.gerak.ikonDeltaX < 0 ? 'kiri' : 'diam';
  console.log(`ARAH IKON: main=${arah}  agents=${arahB}  ${arah === arahB ? 'SAMA' : '*** BEDA ***'}`);
}

main.close();
agents.close();
