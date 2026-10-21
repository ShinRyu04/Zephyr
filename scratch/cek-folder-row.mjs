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
  const fr=document.querySelector('.ai-folder-row');
  return {folderRow: fr?{teks:fr.innerText.replace(/\\n/g,' | '), ...R(fr)}:null,
    label: document.querySelector('.ai-folder-label')?.textContent ?? null,
    tombol: document.querySelector('[data-testid="ai-folder-pilih"]')?.textContent ?? null,
    judul: document.querySelector('.ai-empty-judul')?.textContent ?? null,
    panelKanan: !!document.querySelector('.ag-right'),
    ideChip: !!document.querySelector('[data-testid="ag-ide-chip"]')};
})())`);
console.log(out);
ws.close(); process.exit(0);
