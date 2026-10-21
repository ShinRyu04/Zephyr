const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find(x => x.url === "http://localhost:5173/");
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };
await ev("document.querySelector('[data-testid=\"ai-host-maximize\"]')?.click()");
await new Promise(r=>setTimeout(r,900));
const out = await ev(`JSON.stringify((()=>{
  const name=document.querySelector('.ai-model-name');
  const tb=document.querySelector('.ai-input-toolbar');
  const kids=[...tb.children].filter(c=>c.getBoundingClientRect().width>0);
  const kanan=kids.length?Math.round(kids[kids.length-1].getBoundingClientRect().right):0;
  return {mode: document.querySelector('.ai-side-col')?.className,
    colW: Math.round(document.querySelector('.ai-side-col').getBoundingClientRect().width),
    namaTampil: name.clientWidth, namaButuh: name.scrollWidth, terpotong: name.scrollWidth > name.clientWidth,
    muat: kanan<=Math.round(tb.getBoundingClientRect().right), sisa: Math.round(tb.getBoundingClientRect().right)-kanan,
    rowH: Math.round(document.querySelector('.ai-input-row').getBoundingClientRect().height)};
})())`);
console.log(out);
ws.close(); process.exit(0);
