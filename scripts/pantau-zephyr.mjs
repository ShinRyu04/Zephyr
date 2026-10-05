/*
 * Keadaan Zephyr sebelum/sesudah mengerjakan: provider, model, dan kesibukan.
 *
 * Dipakai untuk memantau run AI tanpa membuka jendelanya - jadi kalau ada yang
 * macet, penyebabnya kelihatan dari dalam aplikasi, bukan ditebak.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu di 9223');
  process.exit(1);
}
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

console.log('=== bridge ===');
console.log(' ', await ev(`Object.keys(window).filter(k => k.startsWith('__ZEPHYR')).join(', ')`));

console.log('\n=== bentuk bridge ===');
console.log(' __ZEPHYR__    :', await ev(`Object.keys(window.__ZEPHYR__).join(', ')`));
console.log(' __ZEPHYR_AI__ :', await ev(`Object.keys(window.__ZEPHYR_AI__).join(', ')`));

console.log('\n=== keadaan ===');
console.log(
  await ev(`(() => {
  const ambil = (b) => (b && typeof b.getState === 'function' ? b.getState() : b && b.store && b.store.getState ? b.store.getState() : null);
  const a = ambil(window.__ZEPHYR_AI__);
  const z = ambil(window.__ZEPHYR__);
  if (!a && !z) return 'kedua store tidak terbaca';
  return JSON.stringify({
    workspace: z ? (z.workspace ?? z.root ?? null) : null,
    agentBusy: a ? (a.agentBusy ?? null) : null,
    agentPhase: a ? (a.agentPhase ?? null) : null,
    provider: a ? (a.provider ?? a.providerId ?? null) : null,
    model: a ? (a.model ?? a.modelId ?? null) : null,
    jumlahPesan: a ? ((a.messages || []).length) : null,
    jumlahLangkah: a ? ((a.agentSteps || []).length) : null,
  }, null, 1);
})()`),
);

console.log('\n=== langkah terakhir (kalau ada) ===');
console.log(
  await ev(`(() => {
  const s = window.__ZEPHYR_AI__.store.getState().agentSteps || [];
  return JSON.stringify(s.slice(-3).map(x => ({ alat: x.name, hasil: String(x.result ?? '').slice(0, 120) })), null, 1);
})()`),
);

ws.close();
