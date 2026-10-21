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
  const X = window.__ZEPHYR_SET__;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
  await AS().loadKeys();
  await wait(300);
  const st = S.getState();
  st.setSettingsOpen(false);
  st.setActivity('ai');
  if (!S.getState().sidebarVisible) st.toggleSidebar();
  st.setAiKolomVisible(true);
  S.getState().bukaViewAi('ai-chat');
  await wait(300);
  if (!AS().activeIds?.chat) AS().newChat('chat');
  for (let i = 0; i < 25 && !document.querySelector('[data-testid="ai-model-btn"]'); i++) await wait(200);
  const btn = document.querySelector('[data-testid="ai-model-btn"]');
  out.btn = !!btn;
  out.menus = document.querySelectorAll('[data-testid="ai-model-menu"]').length;
  if (btn) { btn.click(); await wait(500); }
  out.menusSetelahKlik = document.querySelectorAll('[data-testid="ai-model-menu"]').length;
  out.grup = [...document.querySelectorAll('[data-group]')].map(e => e.dataset.group);
  out.provKeys = Object.entries(AS().providers ?? {}).map(([k,v]) => k + ':' + (v.hasKey ? 1 : 0));
  out.buttons = document.querySelectorAll('[data-testid="ai-model-btn"]').length;
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r, null, 2));
ws.close();
