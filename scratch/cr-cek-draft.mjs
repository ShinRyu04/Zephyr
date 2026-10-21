const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("#agents"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", () => rej(new Error("ws")), { once: true });
});
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception?.description || "").slice(0, 800) };
  return r.result?.value;
};

console.log("field value:", await ev(`document.querySelector('[data-testid="agx-field"]')?.value`));
console.log("send disabled:", await ev(`document.querySelector('[data-testid="agx-send"]')?.disabled`));

console.log("--- store: drafts ---");
console.log(await ev(`(async()=>{
  const m = await import('/src/lib/aiStore.ts');
  const s = m.useAi.getState();
  return JSON.stringify({
    drafts: s.drafts,
    activeIds: s.activeIds,
    sessions: s.sessions.map(x=>({id:x.id, msgs:x.messages.length, title:x.title})),
    model: s.model,
    provider: s.provider,
    agentBusy: s.agentBusy,
  });
})()`));

console.log("--- set draft lalu baca lagi ---");
console.log(await ev(`(async()=>{
  const m = await import('/src/lib/aiStore.ts');
  m.useAi.getState().setDraft('tes123', 'agents');
  await new Promise(r=>setTimeout(r,300));
  return JSON.stringify({draftSetelah: m.useAi.getState().drafts});
})()`));
await new Promise((r) => setTimeout(r, 400));
console.log("field value sesudah:", await ev(`document.querySelector('[data-testid="agx-field"]')?.value`));

ws.close();
process.exit(0);
