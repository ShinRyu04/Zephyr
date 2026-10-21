const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const page = list.find((x) => x.url.startsWith("http://localhost:5199"));
if (!page) throw new Error("page not found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", () => rej(new Error("ws")), { once: true });
});
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "").slice(0, 600));
  return r.result?.value;
};

await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 2600));

const probe = `JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const bg=(e)=>e?getComputedStyle(e).backgroundColor:null;
  const o={ vw: innerWidth, vh: innerHeight };
  o.sidebar = R(document.querySelector('[data-testid="sidebar"]'));
  o.canvas = R(document.querySelector('[data-testid="canvas"]'));
  o.canvasBg = bg(document.querySelector('[data-testid="canvas"]'));
  o.heading = R(document.querySelector('[data-testid="starting-heading"]'));
  o.box1 = R(document.querySelector('[data-testid="composer-box1"]'));
  o.field = R(document.querySelector('[data-testid="composer-field"]'));
  o.controls = R(document.querySelector('[data-testid="composer-controls"]'));
  o.box2 = R(document.querySelector('[data-testid="composer-box2"]'));
  o.box2Bg = bg(document.querySelector('[data-testid="composer-box2"]'));
  const cards = [...document.querySelectorAll('.card')];
  o.cards = cards.map(c=>R(c));
  o.cardRowSameTop = cards.length ? new Set(cards.map(c=>Math.round(c.getBoundingClientRect().top))).size : null;
  o.rightPanel = R(document.querySelector('[data-testid="right-panel"]'));
  o.chatCard = R(document.querySelector('[data-testid="chat-card"]'));
  return o;
})())`;

console.log("=== KOSONG ===");
console.log(await ev(probe));

// type + send
await ev(`(()=>{const f=document.querySelector('[data-testid="composer-field"]');const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(f,'hello there');f.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
await new Promise((r) => setTimeout(r, 400));
await ev(`(()=>{const b=document.querySelector('[data-testid="composer-send"]');b.click();return true})()`);
await new Promise((r) => setTimeout(r, 700));

console.log("=== ADA CHAT ===");
console.log(await ev(probe));

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs/promises");
await fs.writeFile("D:/Zephyr/scratch/cr-app-chat.png", Buffer.from(shot.data, "base64"));
console.log("screenshot chat disimpan");

ws.close();
process.exit(0);
