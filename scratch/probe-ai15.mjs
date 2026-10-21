// Probe: tirukan langkah V6 -> V7 (buka panel AI, kirim TEXTONLY, lihat sesi).
const PORT = process.argv[2] ?? '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !/#panel=/.test(t.url ?? ''));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
};
const send = (method, params) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

const expr = `(async () => {
  const S = window.__ZEPHYR__;
  const A = window.__ZEPHYR_AI__;
  const AS = () => A.store.getState();
  const q = (s) => document.querySelector(s);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  out.mode0 = AS().agentMode;
  S.getState().setActivity('ai');
  S.getState().bukaViewAi('ai-chat');
  await wait(700);
  const st = S.getState();
  const t = st.tabs.find(x => x.view === 'ai-chat');
  if (t && st.activeTabId !== t.id) S.setState({ activeTabId: t.id });
  out.tahap1 = { tabs: S.getState().tabs.map(x => [x.id, x.view ?? null]), aktif: S.getState().activeTabId,
                 viewChat: !!q('[data-testid="ai-view-chat"]'), input: !!q('[data-testid="ai-input"]'),
                 activeIds: AS().activeIds, aktId: AS().activeId, mode: AS().agentMode };
  if (!AS().activeIds.editor) A.store.getState().newChat('editor');
  await wait(400);
  out.tahap2 = { activeIds: AS().activeIds, input: !!q('[data-testid="ai-input"]') };
  const el = q('[data-testid="ai-input"]');
  if (el) {
    const proto = HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'hitung TEXTONLY');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(200);
  out.draftEditor = AS().draftOf('editor');
  out.draftUtama = AS().draftOf('');
  q('[data-testid="ai-send"]')?.click();
  await wait(1500);
  out.setelah = { busy: AS().agentBusy, pending: AS().pending, mode: AS().agentMode,
    aktifTab: S.getState().activeTabId,
    sesi: AS().sessions.map(s => [s.id, s.messages.length, s.messages.map(m => m.role + ':' + m.content.length).join('|')]).slice(-5),
    stop: !!q('[data-testid="ai-stop"]'), sendBtn: !!q('[data-testid="ai-send"]'),
    toast: q('[data-testid="ai-toast"]')?.textContent ?? '' };
  return JSON.stringify(out);
})()`;

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result ?? r, null, 1));
ws.close();
