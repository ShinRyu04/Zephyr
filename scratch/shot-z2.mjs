import { writeFileSync } from 'fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ag = list.find((x) => x.url.includes('#agents'));
if (!ag) throw new Error('jendela agents tidak ada');

const ws = new WebSocket(ag.webSocketDebuggerUrl);
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

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
writeFileSync('D:\\Zephyr\\scratch\\zephyr-agents.png', Buffer.from(shot.data, 'base64'));
console.log('ok bytes=' + shot.data.length);
ws.close();
process.exit(0);
