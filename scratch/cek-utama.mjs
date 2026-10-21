async function main() {
  const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const t = list.find(x => x.url === "http://localhost:5173/");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };

  console.log(await ev(`(() => {
    const col = document.querySelector(".ai-side-col");
    const R = (e)=>{ if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x),w:Math.round(b.width)}; };
    const res = document.querySelector('[data-testid="ai-resizer"]');
    const tb = document.querySelector(".ai-input-toolbar");
    const isi = tb ? [...tb.children].filter(c=>c.getBoundingClientRect().width>0).map(c=>({k:c.className.toString().slice(0,16), ...R(c)})) : null;
    const kanan = isi && isi.length ? isi[isi.length-1].x + isi[isi.length-1].w : 0;
    return JSON.stringify({
      col: R(col), resizer: res ? R(res) : null,
      toolbarW: tb ? Math.round(tb.getBoundingClientRect().width) : null,
      tbRight: tb ? Math.round(tb.getBoundingClientRect().right) : null,
      isi, kanan, muat: tb ? kanan <= Math.round(tb.getBoundingClientRect().right) : null,
      modelTeks: document.querySelector(".ai-model-name")?.textContent,
      peringatanKey: /no api key|does not have an api key|add an api key/i.test(document.body.innerText),
    }, null, 1);
  })()`));
  ws.close(); process.exit(0);
}
main();
