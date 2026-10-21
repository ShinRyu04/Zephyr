import { writeFileSync } from 'fs';

const PORT = 9333;

async function cdp(port, matchFn) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.type === 'page' && matchFn(x));
  if (!t) throw new Error('target tidak ada');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws gagal')), { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return {
    target: t,
    send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 800));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

const c = await cdp(PORT, (x) => x.url.includes('solo'));

/* Screenshot: the only way to see type weight, icon shapes and alignment. */
const shot = await c.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:\\Zephyr\\scratch\\trae-agents.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: scratch/trae-agents.png');

/*
 * Walk the tree the way a person reads it: what is at each level, how big, what
 * colour, what text. Depth-limited so the output stays readable.
 */
const struktur = await c.eval(`JSON.stringify((()=>{
  const cs = (e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, fs: s.fontSize, fw: s.fontWeight, pad: s.padding, gap: s.gap, radius: s.borderRadius, border: s.borderWidth + ' ' + s.borderColor, dir: s.flexDirection, disp: s.display, align: s.alignItems, just: s.justifyContent }; };
  const box = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };

  const hasil = [];
  const jalan = (e, d) => {
    if (d > 5 || hasil.length > 220) return;
    const b = e.getBoundingClientRect();
    if (b.width < 3 || b.height < 3) return;
    const teksLangsung = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ');
    hasil.push({
      d,
      tag: e.tagName.toLowerCase(),
      cls: String(e.className || '').slice(0, 70) || undefined,
      box: box(e),
      teks: teksLangsung.slice(0, 60) || undefined,
      s: cs(e),
    });
    for (const a of e.children) jalan(a, d + 1);
  };
  const akar = document.querySelector('#solo-lite-root') || document.body;
  jalan(akar, 0);
  return hasil;
})())`);

writeFileSync('D:\\Zephyr\\scratch\\trae-struktur.json', struktur, 'utf8');
console.log('struktur: scratch/trae-struktur.json (' + JSON.parse(struktur).length + ' node)');

c.close();
process.exit(0);
