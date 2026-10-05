/*
 * Apakah `render_paused` GLOBAL ikut menyetel agen berhenti?
 *
 * lib.rs:221 menyetel render_paused saat jendela di-minimize, dan pty.rs:358
 * membacanya untuk berhenti membaca output PTY. Itu untuk TERMINAL.
 *
 * Pertanyaan yang harus dijawab: apakah flag GLOBAL yang sama juga membuat
 * langkah agent kosong (tanpa nama, tanpa hasil) dan berhenti? Kalau ya, itu
 * bug: mengecilkan jendela tidak boleh menghentikan pekerjaan agen.
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

console.log('=== 1. langkah: mana yang kosong, dan apa bentuk mentahnya? ===');
console.log(
  await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentSteps.map((x, i) => ({
    i, kind: x.kind, nama: x.name ?? null, adaHasil: x.result !== undefined, panjangHasil: String(x.result ?? '').length
  })), null, 1)`),
);

console.log('\n=== 2. fase & kesibukan ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({
    agentBusy: a.agentBusy, agentPhase: a.agentPhase,
    agentCurrentTool: a.agentCurrentTool ?? null,
    agentStepIndex: a.agentStepIndex ?? null,
    agentStepLimit: a.agentStepLimit ?? null,
    agentLastProgressAt: a.agentLastProgressAt ?? null,
    putusAt: a.agentLastProgressAt ? new Date(a.agentLastProgressAt).toLocaleTimeString('id-ID') : null,
    agentResume: a.agentResume ?? null,
  }, null, 1);
})()`),
);

console.log('\n=== 3. loop & antrean ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ loops: a.loops, antrian: (a.antrian||[]).length, pending: a.pending ?? null }, null, 1);
})()`),
);

console.log('\n=== 4. dokumen terlihat? (dasar render pause) ===');
console.log(
  await ev(`JSON.stringify({ visibility: document.visibilityState, hidden: document.hidden })`),
);

ws.close();
