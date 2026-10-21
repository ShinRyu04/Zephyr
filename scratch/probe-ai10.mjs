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
  const AS = () => window.__ZEPHYR_AI__.store.getState();
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const st = S.getState();
  const out = {};
  out.tabs = S.getState().tabs.map(t => ({ id: t.id, name: t.name, view: t.view }));
  out.activeTabId = S.getState().activeTabId;
  out.activity = st.activity;
  out.aiKolomVisible = st.aiKolomVisible;
  out.aiPanel = st.settings?.general?.aiPanel;
  out.aiActive = AS().activeIds;
  out.aiSessions = AS().sessions.map(x => x.id);
  out.viewChat = !!document.querySelector('[data-testid="ai-view-chat"]');
  out.panel = document.querySelectorAll('[data-testid="ai-panel"]').length;
  out.empty = !!document.querySelector('[data-testid="ai-empty"]');
  out.nokey = !!document.querySelector('[data-testid="ai-nokey"]');
  out.html = document.querySelector('.editor-area, .editor-host, main')?.className ?? null;
  out.bodyTxt = document.body.innerText.slice(0, 400);
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r, null, 2));
ws.close();
