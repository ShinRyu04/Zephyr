import { writeFileSync } from 'fs';

/*
 * Screenshot TRAE's Agents window.
 *
 * `Page.captureScreenshot` hung on this target earlier. `Page.startScreencast` is
 * a different path: it streams frames and ACKs each one, so a single frame can be
 * captured without waiting for the compositor to produce a still.
 */
const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === 'page' && x.url.includes('solo'));
if (!t) throw new Error('target TRAE tidak ada');

const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const frames = [];

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('ws gagal')), { once: true });
});

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Page.screencastFrame') {
    frames.push(m.params.data);
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
    return;
  }
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

await send('Page.enable');
await send('Page.startScreencast', { format: 'png', maxWidth: 1536, maxHeight: 912, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, 2500));
await send('Page.stopScreencast').catch(() => {});

if (!frames.length) {
  console.log('TIDAK ADA FRAME');
  process.exit(0);
}
writeFileSync('D:\\Zephyr\\scratch\\trae-agents2.png', Buffer.from(frames[frames.length - 1], 'base64'));
console.log('frame=' + frames.length + ' bytes=' + frames[frames.length - 1].length);
ws.close();
process.exit(0);
