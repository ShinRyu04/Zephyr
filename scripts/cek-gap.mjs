/* Detak per-detik: langkah mana yang punya gap > 210s (AGENT_IDLE_MS),
 * dan tool apa yang sedang jalan saat gap itu. */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));

const js = String.raw`(() => {
  const st = window.__ZEPHYR_AI__.store.getState().agentSteps || [];
  const t0 = st[0]?.at || 0;
  const baris = st.map((x, i) => ({
    i,
    dt: x.at ? Math.round((x.at - t0) / 1000) : null,
    kind: x.kind,
    name: x.name || '',
    ok: x.ok,
    hasil: (x.result || '').replace(/\s+/g, ' ').slice(0, 60),
  }));
  // Tandai gap besar
  const besar = [];
  for (let i = 1; i < st.length; i++) {
    const g = Math.round((st[i].at - st[i - 1].at) / 1000);
    if (g > 150) besar.push({ dari: baris[i - 1], ke: baris[i], gap: g });
  }
  return JSON.stringify({ total: st.length, semua: baris, gapBesar: besar }, null, 1);
})()`;
const m = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(m.result?.result?.value ?? JSON.stringify(m.result).slice(0, 400));
ws.close();