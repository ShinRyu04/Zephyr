const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };

console.log(await ev(`(() => {
  const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
  const row = document.querySelector(".ai-input-row");
  const tb  = document.querySelector(".ai-input-toolbar");
  return JSON.stringify({
    sideCol: R(document.querySelector(".ai-side-col")),
    inputRow: R(row),
    textarea: R(document.querySelector(".ai-input")),
    toolbar: R(tb),
    toolbarKids: tb ? [...tb.children].map(c => c.className.toString().slice(0,30) + " " + JSON.stringify(R(c))) : null,
    botbarAda: !!document.querySelector(".ai-botbar"),
  }, null, 1);
})()`));
ws.close(); process.exit(0);
