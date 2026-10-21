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
  return { send, close: () => ws.close() };
}

const c = await cdp(PORT, (x) => x.url.includes('solo'));

/*
 * `captureScreenshot` without `fromSurface` can hang on this target. Asking for
 * the surface explicitly, with a clip equal to the viewport, is the form that
 * returns here.
 */
const shot = await c.send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
writeFileSync('D:\\Zephyr\\scratch\\trae-agents.png', Buffer.from(shot.data, 'base64'));
console.log('ok bytes=' + shot.data.length);

c.close();
process.exit(0);
