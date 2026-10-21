const PORT = '9223';
const LIST = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log('targets', LIST.filter(t=>t.type==='page').map(t=>t.url));
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
  const X = window.__ZEPHYR_SET__;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
  await AS().loadKeys();
  await wait(300);
  const st = S.getState();
  st.setActivity('ai');
  if (!S.getState().sidebarVisible) st.toggleSidebar();
  if ((S.getState().settings?.general?.aiPanel ?? 'right') !== 'right') S.getState().bukaViewAi('ai-chat');
  else if (!S.getState().aiKolomVisible) S.getState().setAiKolomVisible(true);
  await wait(400);
  if (!AS().activeIds?.chat) AS().newChat('chat');
  for (let i = 0; i < 25 && !document.querySelector('[data-testid="ai-model-btn"]'); i++) await wait(200);
  const btn = document.querySelector('[data-testid="ai-model-btn"]');
  out.btn = !!btn;
  out.act = S.getState().activity;
  out.viewChat = !!document.querySelector('[data-testid="ai-view-chat"]');
  out.panels = document.querySelectorAll('[data-testid="ai-panel"]').length;
  out.menus = document.querySelectorAll('[data-testid="ai-model-menu"]').length;
  if (btn && !document.querySelector('[data-testid="ai-model-menu"]')) { btn.click(); await wait(600); }
  out.menusSetelah = document.querySelectorAll('[data-testid="ai-model-menu"]').length;
  out.grup = [...document.querySelectorAll('[data-group]')].map(e => e.dataset.group);
  out.keys = (AS().keys ?? []).map(k => k.provider + ':' + (k.hasKey?1:0));
  out.boxTxt = (document.body.innerText || '').slice(0, 200);
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r));
ws.close();
