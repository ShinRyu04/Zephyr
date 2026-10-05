/*
 * Kenapa agent berhenti setelah 3 tool, walau to-do listnya masih 4 tugas?
 *
 * Datanya sudah benar: kelima tugas lengkap, tidak menyusut. Tapi agent
 * berhenti dengan `busy=false` dan tugas 1 masih `in_progress` - padahal
 * foldernya sudah dibuat dan index.html sudah ditulis. Jadi update status
 * tidak pernah dikirim setelah langkah pertama.
 *
 * Yang perlu dilihat: pesan terakhir dari model (jawaban yang mengakhiri loop),
 * dan apakah ada error/toast yang menjelaskannya.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (m, p) =>
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

console.log('=== kunci store AI ===');
console.log(await ev(`Object.keys(window.__ZEPHYR_AI__.store.getState()).join(', ')`));

console.log('\n=== sesi aktif: pesannya ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  const s = a.sessions.find(x => x.id === a.activeId);
  if (!s) return 'sesi tidak ketemu';
  return JSON.stringify({
    kunciSesi: Object.keys(s),
    pesan: (s.messages || []).map(m => ({ peran: m.role, isi: String(m.content ?? '').slice(0, 600) })),
  }, null, 1);
})()`),
);

console.log('\n=== semua langkah, dengan isi ===');
console.log(
  await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentSteps || []).map((x, i) => ({
    i, kind: x.kind, nama: x.name ?? null, ok: x.ok ?? null,
    hasil: String(x.result ?? '').slice(0, 200), args: String(x.args ?? '').slice(0, 200)
  })), null, 1)`),
);

console.log('\n=== toast / failure ===');
console.log(
  await ev(`JSON.stringify({
    toast: window.__ZEPHYR_AI__.store.getState().toast ?? null,
    failure: window.__ZEPHYR_AI__.store.getState().agentFailure ?? null,
    phase: window.__ZEPHYR_AI__.store.getState().agentPhase,
    loops: window.__ZEPHYR_AI__.store.getState().loops,
  }, null, 1)`),
);

ws.close();
