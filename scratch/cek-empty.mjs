const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find(x => x.url.includes("#agents"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };
await send("Page.reload", {ignoreCache:true});
await new Promise(r=>setTimeout(r,4500));
const out = await ev(`JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const judul=document.querySelector('.ai-empty-judul');
  const tag=document.querySelector('.ai-empty-tagline');
  const kartu=[...document.querySelectorAll('.ai-empty .ai-saran-kartu')];
  return {judul: judul?{t:judul.textContent, ...R(judul), fs:getComputedStyle(judul).fontSize}:null,
    tagline: tag?{t:tag.textContent.slice(0,50), ...R(tag)}:null,
    jumlahKartu: kartu.length,
    kartuLabel: kartu.map(k=>k.querySelector('.ai-saran-label')?.textContent),
    barisKartu: kartu.length?R(kartu[0]).y===R(kartu[1]||kartu[0]).y:null};
})())`);
console.log(out);
ws.close(); process.exit(0);
