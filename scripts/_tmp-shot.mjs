// _tmp-shot.mjs — ambil screenshot + info render lewat CDP. Sementara (boleh dihapus).
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '9223';
const out = process.argv[3] ?? 'shot.png';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
console.log('targets:', list.map((t) => `${t.type}:${t.title}`).join(' | '));
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
});
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    p(msg);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const info = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    vis: document.visibilityState,
    focused: document.hasFocus(),
    iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    rootBg: getComputedStyle(document.querySelector('.app-root') || document.body).backgroundColor,
    sheets: [...document.styleSheets].map(s => ({ href: (s.href||'inline').slice(-40), rules: (() => { try { return s.cssRules.length } catch { return -1 } })() })),
    htmlLen: document.documentElement.outerHTML.length
  })`,
  returnByValue: true,
});
console.log('INFO:', info.result?.result?.value ?? JSON.stringify(info).slice(0, 300));

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (shot.result?.data) {
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('SHOT:', out);
} else {
  console.log('SHOT FAILED:', JSON.stringify(shot).slice(0, 400));
}
ws.close();
