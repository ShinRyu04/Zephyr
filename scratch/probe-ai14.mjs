// Probe: ke permukaan mana composer AI menulis, dan mengapa sesi lain bertambah.
const PORT = process.argv[2] ?? '9223';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !/#panel=/.test(t.url ?? ''));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m);
    tunggu.delete(m.id);
  }
};
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    tunggu.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const expr = `(() => {
  const A = window.__ZEPHYR_AI__;
  const st = A.store.getState();
  const S = (window.__ZEPHYR__ ?? window.__ZEPHYR_MAIN__);
  return JSON.stringify({
    bridge: Object.keys(window).filter((k) => k.startsWith('__ZEPHYR')).join(','),
    aiPanel: S?.getState?.().settings?.general?.aiPanel,
    activeId: st.activeId,
    activeIds: st.activeIds,
    viewChat: !!document.querySelector('[data-testid="ai-view-chat"]'),
    panel: !!document.querySelector('[data-testid="ai-panel"]'),
    input: !!document.querySelector('[data-testid="ai-input"]'),
    tabs: S?.getState?.().tabs?.map((t) => [t.id, t.view ?? null]),
    activeTabId: S?.getState?.().activeTabId,
    sesi: st.sessions.map((s) => [s.id, s.messages.length, s.title]).slice(-6),
  });
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r.result?.result?.value ?? JSON.stringify(r));
ws.close();
