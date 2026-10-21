const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173") && !x.url.includes("agents"));
if (!t) { console.log("target tidak ketemu:", list.map(x=>x.url)); process.exit(0); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };

console.log(await ev(`(() => {
  const out = {};
  const box = document.querySelector(".ai-side-col");
  const row = document.querySelector(".ai-input-row");
  const inp = document.querySelector(".ai-input");
  const tb  = document.querySelector(".ai-input-toolbar");
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
  out.sideCol = r(box);
  out.inputRow = r(row);
  out.textarea = r(inp);
  out.toolbar = r(tb);
  out.toolbarChildren = tb ? [...tb.children].map(c => ({cls:c.className, ...r(c)})) : null;
  out.aiW = getComputedStyle(document.documentElement).getPropertyValue("--ai-w");
  return JSON.stringify(out, null, 1);
})()`));
ws.close(); process.exit(0);
