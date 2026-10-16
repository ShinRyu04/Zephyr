// Ukur: siapa yang benar-benar berada di atas tombol toggle kanan
// (data-testid="ag-toggle-right") di window Agents, memakai elementFromPoint
// di titik tengah tombol. Bukan tebakan.
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

const PROBE = `(() => {
  const btn = document.querySelector('[data-testid="ag-toggle-right"]');
  if (!btn) return { error: 'tombol tidak ditemukan' };
  const r = btn.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;

  const top = document.elementFromPoint(cx, cy);

  const desc = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: (typeof el.className === 'string' ? el.className : '(svg)') || '(none)',
      testid: el.getAttribute('data-testid'),
      rect: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      pointerEvents: cs.pointerEvents,
      transform: cs.transform,
      zIndex: cs.zIndex,
      position: cs.position,
    };
  };

  // Naik dari titik itu ke atas, kumpulkan elemen yang menutupi
  const stack = document.elementsFromPoint(cx, cy).slice(0, 6).map(desc);

  // Apakah tombolnya sendiri ada di stack, dan di indeks berapa
  const idx = document.elementsFromPoint(cx, cy).findIndex((e) => e === btn);

  return {
    tombol: desc(btn),
    titik: { x: +cx.toFixed(1), y: +cy.toFixed(1) },
    yangDiAtas: desc(top),
    tombolKetutup: top !== btn && !btn.contains(top),
    indeksTombolDiStack: idx,
    stack,
  };
})()`;

const b = await attach((t) => t.type === 'page' && t.url.includes('#agents'), 'AGENTS');
if (!b) {
  console.log('Window Agents tidak terbuka.');
} else {
  const out = await b.ev(PROBE);
  console.log(JSON.stringify(out, null, 2));
  b.close();
}
