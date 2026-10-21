const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,300)); return r.result?.value; };
for (const type of ["keyDown","keyUp"]) await send("Input.dispatchKeyEvent", {type, key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
await new Promise(r=>setTimeout(r,500));
console.log(await ev(`(() => {
  const col = document.querySelector(".ai-side-col");
  const res = document.querySelector("[data-testid=\\"ai-resizer\\"]");
  return JSON.stringify({popupMasihAda: !!document.querySelector('[data-testid="aim-page"]'), colAda: !!col, resizerAda: !!res}, null, 1);
})()`));
ws.close(); process.exit(0);
