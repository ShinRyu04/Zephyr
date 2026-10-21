const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find(x => x.url === "http://localhost:5173/");
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };
const out = await ev(`JSON.stringify((()=>{
  const R=(e)=>{const b=e.getBoundingClientRect();return {y:Math.round(b.y),h:Math.round(b.height)}};
  const ta=document.querySelector('.ai-input');
  const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  const hasil=[];
  for(const n of [1,3,6,12]){
    setter.call(ta, Array.from({length:n},(_,i)=>'baris '+(i+1)).join('\\n'));
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    const row=document.querySelector('.ai-input-row');
    hasil.push({baris:n, textareaH:R(ta).h, rowH:R(row).h, rowY:R(row).y});
  }
  setter.call(ta,''); ta.dispatchEvent(new Event('input',{bubbles:true}));
  return {hasil, akhir:R(document.querySelector('.ai-input-row'))};
})())`);
console.log(out);
ws.close(); process.exit(0);
