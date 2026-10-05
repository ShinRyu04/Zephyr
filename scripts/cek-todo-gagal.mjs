/*
 * Kenapa todo_write GAGAL di langkah 3?
 *
 * Di run 14:09 dan 14:21 tool ini BERHASIL. Sekarang gagal - dan perbaikan
 * saya menyentuh jalur ini, jadi penyebabnya harus dilihat dari pesan aslinya,
 * bukan ditebak.
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

console.log('=== semua langkah, dengan hasil LENGKAP ===');
console.log(
  await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentSteps.map((x, i) => ({
    i, kind: x.kind, nama: x.name ?? null, ok: x.ok ?? null, hasil: String(x.result ?? '')
  })), null, 1)`),
);

console.log('\n=== argumen yang dikirim ke todo_write ===');
console.log(
  await ev(`(() => {
  const s = window.__ZEPHYR_AI__.store.getState().agentSteps.filter(x => x.name === 'todo_write');
  return JSON.stringify(s.map(x => ({ args: String(x.args ?? '').slice(0, 900), hasil: String(x.result ?? '').slice(0, 400) })), null, 1);
})()`),
);

console.log('\n=== daftar tugas sekarang ===');
console.log(await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentTodos ?? null, null, 1)`));

ws.close();
