const PORT = process.argv[2] ?? '9223';
const LIST = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = LIST.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  const p = pending.get(m.id);
  if (p) { pending.delete(m.id); p(m); }
});
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});

const expr = `(async () => {
  const S = window.__ZEPHYR__;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  out.multi = S.getState().settingsOpen;
  const roots = [...document.querySelectorAll('body > div, body > div#root > div')].map(e => e.className);
  out.roots = roots;
  out.settingsEls = document.querySelectorAll('[data-testid="settings-page"]').length;
  out.rootHtml = (document.getElementById('root')?.innerHTML ?? '').slice(0, 1200);
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r));
ws.close();
