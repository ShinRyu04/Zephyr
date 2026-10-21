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
  const b = document.querySelector(".ai-input-toolbar .mode-btn");
  const cs = getComputedStyle(b);
  const caret = b.querySelector(".pick-caret");
  const cbox = caret ? caret.getBoundingClientRect() : null;
  const bbox = b.getBoundingClientRect();
  return JSON.stringify({
    display: cs.display, gap: cs.gap, alignItems: cs.alignItems,
    btnW: Math.round(bbox.width),
    caretRight: cbox ? Math.round(cbox.right) : null,
    caretW: cbox ? Math.round(cbox.width) : null,
    padRight: cs.paddingRight,
  }, null, 1);
})()`));
ws.close(); process.exit(0);
