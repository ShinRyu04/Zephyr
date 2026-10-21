const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find((x) => x.url.includes("#agents"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws")), { once: true }); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "").slice(0, 400)); return r.result?.value; };

await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 5000));

console.log(await ev(`JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const out = {adaPanel: !!document.querySelector('.ai-panel')};
  out.panel = R(document.querySelector('.ai-panel'));
  out.empty = R(document.querySelector('.ai-empty'));
  out.judul = R(document.querySelector('.ai-empty-judul'));
  out.tagline = R(document.querySelector('.ai-empty-tagline'));
  out.inputRow = R(document.querySelector('.ai-input-row'));
  out.textarea = R(document.querySelector('.ai-input'));
  out.toolbar = R(document.querySelector('.ai-input-toolbar'));
  out.local = R(document.querySelector('.ai-local-row'));
  out.kategori = R(document.querySelector('.ai-kategori'));
  out.kartu = [...document.querySelectorAll('.ai-saran-kartu')].map(k=>R(k));
  out.kartuTeks = [...document.querySelectorAll('.ai-saran-label')].map(e=>e.textContent);
  return out;
})())`));
ws.close(); process.exit(0);
