const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const page = list.find((x) => x.url.startsWith("http://localhost:5199"));
if (!page) throw new Error("page not found");
console.log("page:", page.url);

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
await new Promise((r) => setTimeout(r, 2500));

const out = await ev(`JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const bg=(e)=>e?getComputedStyle(e).backgroundColor:null;
  const o={};
  o.vw = innerWidth; o.vh = innerHeight;
  o.titlebar = R(document.querySelector('[data-testid="titlebar"]'));
  o.titlebarBg = bg(document.querySelector('[data-testid="titlebar"]'));
  o.sidebar = R(document.querySelector('[data-testid="sidebar"]'));
  o.sidebarBg = bg(document.querySelector('[data-testid="sidebar"]'));
  o.canvas = R(document.querySelector('[data-testid="canvas"]'));
  o.canvasBg = bg(document.querySelector('[data-testid="canvas"]'));
  o.heading = R(document.querySelector('[data-testid="starting-heading"]'));
  o.headingText = document.querySelector('[data-testid="starting-heading"]')?.textContent;
  o.box1 = R(document.querySelector('[data-testid="composer-box1"]'));
  o.field = R(document.querySelector('[data-testid="composer-field"]'));
  o.controls = R(document.querySelector('[data-testid="composer-controls"]'));
  o.box2 = R(document.querySelector('[data-testid="composer-box2"]'));
  o.box2Bg = bg(document.querySelector('[data-testid="composer-box2"]'));
  o.folder = document.querySelector('[data-testid="composer-folder"]')?.textContent;
  o.cards = [...document.querySelectorAll('[data-testid^="category-"]')].map(c=>({r:R(c),t:c.textContent,ikon:!!c.querySelector('svg')}));
  o.rightPanel = !!document.querySelector('[data-testid="right-panel"]');
  return o;
})())`);

console.log(out);
ws.close();
process.exit(0);
