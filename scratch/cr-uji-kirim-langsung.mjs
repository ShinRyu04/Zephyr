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
  if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception?.description || "").slice(0, 1200) };
  return r.result?.value;
};

console.log("--- panggil kirimSekarang langsung ---");
console.log(
  await ev(`(async()=>{
  const m = await import('/src/lib/aiStore.ts');
  const s = m.useAi.getState();
  s.setDraft('tes langsung', 'agents');
  try {
    await m.useAi.getState().kirimSekarang('tes langsung', undefined, 'agents');
  } catch (e) {
    return JSON.stringify({galat: String(e).slice(0,400)});
  }
  await new Promise(r=>setTimeout(r,800));
  const st = m.useAi.getState();
  return JSON.stringify({
    activeIds: st.activeIds,
    sesi: st.sessions.map(x=>({id:x.id, msgs:x.messages.length})),
    draftSisa: st.drafts,
    agentMode: st.agentMode,
    model: st.model,
    toast: st.toast,
  });
})()`),
);

ws.close();
process.exit(0);
