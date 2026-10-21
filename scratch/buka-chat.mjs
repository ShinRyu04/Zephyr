const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };
// keluar dari halaman models
await ev(`location.hash = ""`);
await new Promise(r=>setTimeout(r,900));
console.log(await ev(`(() => {
  const teks = document.body.innerText;
  return JSON.stringify({
    hash: location.hash,
    aiHost: !!document.querySelector('[data-testid="ai-host"]'),
    sideCol: !!document.querySelector('.ai-side-col'),
    composer: !!document.querySelector('.ai-input-row'),
    peringatanKey: /no api key|does not have an api key|add an api key|belum|no key/i.test(teks),
    cuplikan: teks.slice(0,400),
  }, null, 1);
})()`));
ws.close(); process.exit(0);
