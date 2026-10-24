/* probe: apakah ada riwayat AI tersimpan di localStorage (HANYA BACA). */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const kandidat = list.filter((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const page =
  kandidat.find((t) => /localhost:5173|Zephyr/.test(t.url + ' ' + (t.title || ''))) || kandidat[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const kirim = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const evalIn = async (expression) => {
  const out = await kirim('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return out.result?.result?.value ?? out;
};

console.log(
  JSON.stringify(
    await evalIn(`(() => {
      const keys = Object.keys(localStorage).filter((k) => /zephyr\\.ai/i.test(k));
      return keys.map((k) => {
        const v = localStorage.getItem(k) || '';
        let info = '';
        try {
          const o = JSON.parse(v);
          if (o.sessions) {
            const ids = Object.keys(o.sessions);
            info = ids.map((i) => i + ':' + (o.sessions[i].messages || []).length + 'msg/' +
              (o.sessions[i].messages || []).reduce((n, m) => n + (m.tools ? m.tools.length : 0), 0) + 'tool').join(' ');
          }
        } catch (e) { info = '(bukan json)'; }
        return k + ' len=' + v.length + ' | ' + info;
      });
    })()`),
    null,
    1,
  ),
);
ws.close();
