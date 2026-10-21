async function probe(idx) {
  const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const t = list[idx];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) return "ERR: "+(r.exceptionDetails.exception?.description||"").slice(0,120); return r.result?.value; };
  const out = await ev(`JSON.stringify({url: location.href, root: document.querySelector("#root")?.firstElementChild?.className || "-", aiHost: !!document.querySelector('[data-testid="ai-host"]'), composer: !!document.querySelector('.ai-input-row'), models: !!document.querySelector('[data-testid="aim-page"]'), teks: (document.body.innerText||"").slice(0,80)})`);
  ws.close();
  return out;
}
for (const i of [0,1]) console.log(i + ": " + await probe(i));
process.exit(0);
