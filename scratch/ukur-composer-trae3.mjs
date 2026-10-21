const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("solo"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };

const out = await ev(`JSON.stringify((()=>{
  const box=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,r:s.borderRadius,bw:s.borderWidth}};
  const kanan = document.querySelector(".chat-input-v2-editor-part-lower__right");
  if(!kanan) return {ada:false};
  return [...kanan.querySelectorAll("*")].filter(e=>{const b=e.getBoundingClientRect();return b.width>2&&b.height>2}).map(e=>({
    tag:e.tagName.toLowerCase(), cls:String(e.className||"").slice(0,50), box:box(e),
    teks:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(" ").slice(0,30)||undefined,
    s:cs(e),
  }));
})())`);
for (const a of JSON.parse(out)) console.log(a.tag + "." + a.cls + "  " + a.box.join(",") + "  r=" + a.s.r + " bg=" + a.s.bg + (a.teks ? "  «" + a.teks + "»" : ""));
ws.close();
process.exit(0);
