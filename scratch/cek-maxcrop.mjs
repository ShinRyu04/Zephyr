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
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),w:Math.round(b.width)}};
  const name=document.querySelector('.ai-model-name');
  const btn=document.querySelector('.ai-model-btn');
  const cs=btn?getComputedStyle(btn):null;
  return {max: document.querySelector('.ai-side-col')?.className,
    modelBtn:R(btn), modelName:R(name), maxW: cs&&cs.maxWidth, overflow: name&&getComputedStyle(name).overflow,
    scrollW: name?name.scrollWidth:null, clientW: name?name.clientWidth:null,
    teks: name?name.textContent:null};
})())`);
console.log(out);
ws.close(); process.exit(0);
