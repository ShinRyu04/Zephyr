// Diagnosa ringan: keadaan kunci di window Agents, tanpa operasi panjang.
import WebSocket from 'ws';
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
for (const t of targets.filter((x) => x.type === 'page')) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    const tmo = setTimeout(() => { pending.delete(myId); reject(new Error('timeout')); }, 8000);
    pending.set(myId, { resolve, t: tmo });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.exception?.description?.slice(0, 200) };
    return r.result?.result?.value;
  };
  console.log('=== ' + t.url);
  console.log(await ev(`JSON.stringify((() => {
    const s = window.__ZEPHYR__?.getState?.();
    if (!s) return { noStore: true };
    return {
      aiKolomVisible: s.aiKolomVisible,
      aiPanelSet: s.settings?.general?.aiPanel,
      settingsLoaded: s.settingsLoaded,
      workspace: s.workspace,
      activeTabView: s.tabs?.find(t => t.id === s.activeTabId)?.view ?? null,
      activeTabName: s.tabs?.find(t => t.id === s.activeTabId)?.name ?? null,
      tabs: (s.tabs ?? []).length,
      domAiPanel: document.querySelectorAll('[data-testid="ai-panel"]').length,
      domHost: document.querySelectorAll('[data-testid="ai-host"]').length,
      domSideCol: document.querySelectorAll('[data-testid="ai-side-col"]').length,
      domComposer: document.querySelectorAll('textarea, [contenteditable="true"]').length,
    };
  })())`));
  ws.close();
}
