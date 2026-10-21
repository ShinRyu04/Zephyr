const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find((x) => x.url.includes("#agents"));
if (!t) { console.log("jendela agents tidak ada"); process.exit(0); }
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
  const cs=(s,p)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null};
  const panel=document.querySelector('.ai-panel');
  const row=document.querySelector('.ai-input-row');
  const chat=document.querySelector('.ai-chat');
  return {
    panelCls: panel?panel.className:null,
    panel: R(panel),
    chat: R(chat),
    row: R(row),
    rowBg: cs('.ai-input-row','backgroundColor'),
    rowRadius: cs('.ai-input-row','borderRadius'),
    panelBg: cs('.ai-panel','backgroundColor'),
    centerBg: cs('.ag-center','backgroundColor'),
    kiriBg: cs('.ag-col.ag-left, .ag-sesi','backgroundColor'),
    localRow: !!document.querySelector('.ai-local-row'),
    hint: !!document.querySelector('.ai-composer-hint'),
    empty: !!document.querySelector('.ai-empty'),
    saran: [...document.querySelectorAll('.ai-empty .ai-saran-label')].map(e=>e.textContent),
  };
})())`));
ws.close(); process.exit(0);
