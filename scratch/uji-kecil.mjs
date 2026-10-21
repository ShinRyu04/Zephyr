const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };
const klik = async () => { const k = await ev(`(() => { const b = document.querySelector('[data-testid="ai-host-maximize"]'); if(!b) return "tidak ada"; b.click(); return b.getAttribute("title"); })()`); return k; };
console.log("toggle:", await klik());
await new Promise(r=>setTimeout(r,800));
console.log(await ev(`(() => {
  const R = (e)=>{ if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x),w:Math.round(b.width)}; };
  const tb = document.querySelector(".ai-input-toolbar");
  const kids = tb ? [...tb.children].map(c=>({k:c.className.toString().slice(0,20), ...R(c)})) : null;
  const row = document.querySelector(".ai-input-row");
  const last = kids ? kids[kids.length-1] : null;
  return JSON.stringify({
    colW: Math.round(document.querySelector(".ai-side-col").getBoundingClientRect().width),
    row: R(row), rowRight: Math.round(row.getBoundingClientRect().right),
    toolbarW: tb ? Math.round(tb.getBoundingClientRect().width) : null,
    kids,
    muat: last && tb ? (last.x + last.w) <= Math.round(tb.getBoundingClientRect().right) : null,
    sisa: last && tb ? Math.round(tb.getBoundingClientRect().right - (last.x + last.w)) : null,
  }, null, 1);
})()`));
ws.close(); process.exit(0);
