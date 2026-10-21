/*
 * Clean-room measurement of TRAE's Agents window.
 *
 * We do NOT read TRAE's source to copy it. We read the RENDERED DOM and its
 * COMPUTED STYLES — the same information a screenshot gives, but with exact
 * numbers. Everything Zephyr gets rebuilt from here is a measurement (a colour,
 * a width, a gap), not a copy of anyone's code.
 */
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
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 800));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

const c = await cdp(PORT, (x) => x.url.includes('solo'));

const out = await c.eval(`JSON.stringify((()=>{
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, fs: s.fontSize, fw: s.fontWeight, ff: s.fontFamily.slice(0,60), pad: s.padding, gap: s.gap, radius: s.borderRadius, border: s.border, display: s.display }; };

  const semua = [...document.querySelectorAll('body *')];
  const besar = semua.filter(e => { const b = e.getBoundingClientRect(); return b.width > 200 && b.height > 200; }).slice(0, 25);

  return {
    win: { w: innerWidth, h: innerHeight },
    body: cs(document.body),
    struktur: besar.map(e => ({
      tag: e.tagName.toLowerCase(),
      cls: String(e.className).slice(0, 90),
      id: e.id || undefined,
      box: r(e),
      style: cs(e),
    })),
  };
})())`);

console.log(out);
c.close();
process.exit(0);
