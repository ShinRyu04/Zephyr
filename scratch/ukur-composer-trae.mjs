const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("solo"));
if (!t) { console.log("TRAE tidak ada"); process.exit(0); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };

const out = await ev(`JSON.stringify((()=>{
  const box=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius,bw:s.borderWidth,bc:s.borderColor,disp:s.display,align:s.alignItems,just:s.justifyContent}};
  const ta = document.querySelector(".chat-input-v2-input-box-editable");
  if(!ta) return {ada:false};
  let box2 = ta;
  for(let i=0;i<8;i++){ if(!box2.parentElement) break; box2 = box2.parentElement; const b=box2.getBoundingClientRect(); if(b.width>470 && b.width<500) break; }
  const akar = box2;
  const semua=[...akar.querySelectorAll("*")].filter(e=>{const b=e.getBoundingClientRect();return b.width>2&&b.height>2});
  return {
    akar: {box:box(akar), s:cs(akar), kelas:String(akar.className||"").slice(0,80)},
    teks: (akar.innerText||"").replace(/\\n+/g," | ").slice(0,300),
    anak: semua.slice(0,40).map(e=>({
      tag:e.tagName.toLowerCase(),
      cls:String(e.className||"").slice(0,55),
      box:box(e),
      teks:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(" ").slice(0,40)||undefined,
      s:cs(e),
      svg: e.tagName.toLowerCase()==="svg"||e.querySelector(":scope > svg")?true:undefined,
    })),
  };
})())`);
console.log(out);
ws.close();
process.exit(0);
