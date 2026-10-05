const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const p = list.find((t) => t.title.includes('Zephyr'));
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const send = (m, pa) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: pa }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true });
  return r.result?.result?.value;
};

console.log('semua bridge __ZEPHYR* :');
console.log(await ev(`Object.keys(window).filter(k => k.startsWith('__ZEPHYR')).map(k => k + ' -> ' + (typeof window[k] === 'object' && window[k] ? Object.keys(window[k]).slice(0,6).join(',') : typeof window[k])).join('\\n')`));

ws.close();
