async function main() {
  const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const t = list.find(x => x.url === "http://localhost:5173/");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };

  console.log(await ev(`(() => {
    const s = window.__ZEPHYR_AI__.store.getState();
    const sesi = s.sessions.find(x=>x.id===s.activeId);
    return JSON.stringify({
      model: s.model, provider: s.provider,
      approvalMode: s.approvalMode, runMode: s.runMode, effort: s.reasoningEffort,
      sesiPesan: sesi ? sesi.messages.length : null,
      modelTerpilih: s.model,
      daftarModelAda: (s.models||[]).length,
      kunciState: Object.keys(s).filter(k=>/model|key|siap|provider/i.test(k)),
    }, null, 1);
  })()`));
  ws.close(); process.exit(0);
}
main();
