// probe.mjs — utilitas kecil: reload halaman lalu evaluasi satu ekspresi.
// node scripts/probe.mjs 9223 "JSON.stringify({x:1})" [--reload]

import WebSocket from 'ws';

const port = process.argv[2] ?? '9223';
const expr = process.argv[3] ?? '1+1';
const doReload = process.argv.includes('--reload');

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.error('tidak ada target page');
  process.exit(2);
}

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

if (doReload) {
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 4500));
}

const r = await send('Runtime.evaluate', {
  expression: expr,
  returnByValue: true,
  awaitPromise: true,
});
if (r.result?.exceptionDetails) {
  console.log('EXC:', r.result.exceptionDetails.exception?.description);
} else {
  console.log(r.result?.result?.value);
}
ws.close();
