/*
 * Kenapa agent berhenti setelah 4 langkah, dengan hanya 1 tool yang tercatat?
 *
 * `agentBusy=false` padahal rencananya 4 tugas dan folder situs sudah ada -
 * berarti ia berhenti di tengah, bukan selesai. Sebabnya harus ada di salah
 * satu dari: agentFailure, toast, pesan error terakhir, atau langkah yang
 * tersimpan tanpa nama.
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

console.log('=== kunci seluruh store AI ===');
console.log(await ev(`Object.keys(window.__ZEPHYR_AI__.store.getState()).join(', ')`));

console.log('\n=== agentFailure, toast, error terakhir ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({
    agentFailure: a.agentFailure ?? null,
    toast: a.toast ?? null,
    agentPhase: a.agentPhase,
    agentGuard: a.agentGuard ?? null,
    stopReason: a.stopReason ?? a.agentStopReason ?? null,
  }, null, 1);
})()`),
);

console.log('\n=== langkah mentah (tanpa disaring) ===');
console.log(
  await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentSteps, null, 1).slice(0, 2500)`),
);

console.log('\n=== pesan terakhir ===');
console.log(
  await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().messages || []).slice(-3), null, 1).slice(0, 1800)`),
);

console.log('\n=== kesibukan paralel / task ===');
console.log(
  await ev(`(() => {
  const out = {};
  try { out.paralel = window.__ZEPHYR_PARALEL__ && Object.keys(window.__ZEPHYR_PARALEL__); } catch (e) { out.paralel = 'gagal'; }
  try { out.task = window.__ZEPHYR_TASK__ && Object.keys(window.__ZEPHYR_TASK__); } catch (e) { out.task = 'gagal'; }
  return JSON.stringify(out);
})()`),
);

ws.close();
