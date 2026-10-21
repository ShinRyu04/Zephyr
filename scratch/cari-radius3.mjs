const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, {once:true}); ws.addEventListener("error", ()=>rej(new Error("ws")), {once:true}); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params={}) => new Promise((res,rej)=>{ const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params})); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", {expression:expr, awaitPromise:true, returnByValue:true}); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||"").slice(0,400)); return r.result?.value; };
console.log(await ev(`(() => {
  const el = document.querySelector(".ai-input-row");
  const cs = getComputedStyle(el);
  const hits = [];
  const semua = [...document.styleSheets, ...(document.adoptedStyleSheets||[])];
  for (const sh of semua) {
    let rules; try { rules = sh.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!r.selectorText || !/ai-input-row/.test(r.selectorText)) continue;
      const br = r.style.getPropertyValue("border-radius");
      if (!br) continue;
      let cocok=false; try { cocok = el.matches(r.selectorText); } catch {}
      hits.push({sel:r.selectorText.slice(0,60), br, cocok});
    }
  }
  return JSON.stringify({sheets: semua.length, computedRadius: cs.borderRadius, computedBg: cs.backgroundColor, hits:hits.slice(0,12)}, null, 1);
})()`));
ws.close(); process.exit(0);
