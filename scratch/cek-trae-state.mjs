const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("solo"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };

/* Is the empty state / start-here visible right now? */
console.log(await ev(`JSON.stringify({
  buildWith: [...document.querySelectorAll("*")].filter(e=>e.children.length===0 && /Build With/i.test(e.textContent||"")).map(e=>e.textContent.trim().slice(0,40)).slice(0,3),
  startHere: [...document.querySelectorAll("*")].filter(e=>e.children.length===0 && /Start here/i.test(e.textContent||"")).map(e=>e.textContent.trim().slice(0,40)).slice(0,3),
  toolbar: document.querySelectorAll(".tools-panel-tab-bar-host").length,
  kosong: document.querySelector(".solo-lite-main-area") ? (document.querySelector(".solo-lite-main-area").innerText||"").slice(0,200) : null,
})`));
ws.close();
process.exit(0);
