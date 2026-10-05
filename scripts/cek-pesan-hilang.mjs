/*
 * Ke mana jawaban terakhir yang mengakhiri run?
 *
 * Agent berhenti dengan `kind:"selesai"` setelah `write_file`, tapi
 * `messages` kosong. Kalau jawaban yang mengakhiri loop memang hilang, pengguna
 * tidak punya cara tahu MENGAPA ia berhenti - persis gejala "kok dia berhenti
 * kerja ya".
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

console.log('=== sesi ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({
    jumlahSesi: a.sessions.length,
    activeId: a.activeId,
    sesi: a.sessions.map(s => ({ id: s.id, judul: s.title, pesan: (s.messages||[]).length })),
  }, null, 1);
})()`),
);

console.log('\n=== isi sesi aktif (mentah) ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  const s = a.sessions.find(x => x.id === a.activeId);
  if (!s) return 'sesi aktif tidak ketemu';
  return JSON.stringify({ kunci: Object.keys(s), pesan: s.messages }, null, 1).slice(0, 2000);
})()`),
);

console.log('\n=== apakah DOM menampilkan jawaban? ===');
console.log(
  await ev(`(() => {
  const el = document.querySelector('.ai-messages, .ai-chat, [class*="message"]');
  if (!el) return 'elemen pesan tidak ketemu';
  return String(el.innerText ?? '').slice(0, 800);
})()`),
);

console.log('\n=== isi panel AI (teks) ===');
console.log(
  await ev(`(() => {
  const el = document.querySelector('.ai-panel, aside, [class*="ai-panel"]');
  if (!el) return 'panel tidak ketemu';
  return String(el.innerText ?? '').slice(0, 1200);
})()`),
);

ws.close();
