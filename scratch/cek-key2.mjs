async function main() {
  const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const t = list.find(x => x.url === "http://localhost:5173/");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };

  console.log(await ev(`(async () => {
    const s = window.__ZEPHYR_AI__.store.getState();
    const st = window.__ZEPHYR__.getState();
    let hasKeyCustom = null, hasKeyGemini = null;
    try { hasKeyCustom = s.hasKey("custom"); } catch(e) { hasKeyCustom = "err:"+e.message; }
    try { hasKeyGemini = s.hasKey("gemini"); } catch(e) { hasKeyGemini = "err:"+e.message; }
    const models = st.settings?.models || {};
    const semuaModel = (models.list || models.all || models.builtin || []);
    const cari = Array.isArray(semuaModel) ? semuaModel.filter(m => /deepseek-v4-flash-0731-free/i.test(JSON.stringify(m))) : [];
    return JSON.stringify({
      keys: s.keys, hasKeyCustom, hasKeyGemini,
      modelTerpilih: s.model, providerTerpilih: s.provider,
      modelAdaDiDaftar: cari.length,
      contohModelDaftar: Array.isArray(semuaModel) ? semuaModel.slice(0,3).map(m=>m.id||m) : "bukan array",
      jumlahModel: Array.isArray(semuaModel) ? semuaModel.length : null,
    }, null, 1);
  })()`));
  ws.close(); process.exit(0);
}
main();
