const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find(x => x.url === "http://localhost:5173/");
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };

// klik tab Claude Code
await ev("[...document.querySelectorAll('.ai-host-tab')].find(b=>/Claude/.test(b.textContent))?.click()");
await new Promise(r=>setTimeout(r,2500));
console.log(await ev(`JSON.stringify({
  tabAktif: [...document.querySelectorAll('.ai-host-tab')].map(b=>b.textContent.trim()+"="+b.getAttribute('aria-selected')),
  errorTeks: document.querySelector('.ai-cli-empty-title')?.textContent ?? null,
  errorLain: document.querySelector('.ai-cli-error')?.textContent ?? null,
  isiPane: (document.querySelector('.ai-host-pane:not([hidden])')||{}).innerText?.slice(0,200) ?? null,
}, null, 1)`));
ws.close(); process.exit(0);
