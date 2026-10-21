const PORT = '9223';
const LIST = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = LIST.find((t) => t.type === 'page' && !t.url.includes('#'));
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
  const AS = () => window.__ZEPHYR_AI__.store.getState();
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const st = S.getState();
  out.act = st.activity;
  out.pos = st.settings?.general?.aiPanel;
  out.kolom = st.aiKolomVisible;
  out.tabs = st.tabs.map(t => ({ id: t.id, view: t.view, active: t.id === st.activeTabId }));
  out.panels = document.querySelectorAll('[data-testid="ai-panel"]').length;
  out.inputs = document.querySelectorAll('[data-testid="ai-input"]').length;
  out.viewChat = !!document.querySelector('[data-testid="ai-view-chat"]');
  out.activeIds = AS().activeIds;
  const ak = AS().activeId;
  out.activeId = ak;
  out.override = AS().overrideChat ? Object.keys(AS().overrideChat) : null;
  out.sesi = AS().sessions.length;
  out.bodySnippet = (document.body.innerText || '').slice(0, 150);
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r));
ws.close();
