const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("#agents"));
if (!page) {
  console.log("URL tersedia:", list.map((x) => x.url).join("\n"));
  throw new Error("target #agents tidak ditemukan");
}
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
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "").slice(0, 800));
  return r.result?.value;
};

await new Promise((r) => setTimeout(r, 3500));

const out = await ev(`JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const bg=(e)=>e?getComputedStyle(e).backgroundColor:null;
  const o={ vw: innerWidth, vh: innerHeight };
  o.starting = !!document.querySelector('[data-testid="agx-starting"]');
  o.conversation = !!document.querySelector('[data-testid="agx-conversation"]');
  o.heading = document.querySelector('[data-testid="agx-heading"]')?.textContent;
  o.headingRect = R(document.querySelector('[data-testid="agx-heading"]'));
  o.box1 = R(document.querySelector('[data-testid="agx-box1"]'));
  o.field = R(document.querySelector('[data-testid="agx-field"]'));
  o.box2 = R(document.querySelector('[data-testid="agx-box2"]'));
  o.box2Bg = bg(document.querySelector('[data-testid="agx-box2"]'));
  o.folder = document.querySelector('[data-testid="agx-folder"]')?.textContent;
  o.cards = [...document.querySelectorAll('[data-testid^="agx-card-"]')].map(c=>({r:R(c),t:c.textContent,ikon:!!c.querySelector('svg')}));
  o.panel = R(document.querySelector('[data-testid="agx-panel"]'));
  o.aiPanelMasihAda = !!document.querySelector('.ai-panel');
  return o;
})())`);

console.log(out);

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs/promises");
await fs.writeFile("D:/Zephyr/scratch/zephyr-agents-baru.png", Buffer.from(shot.data, "base64"));
console.log("screenshot disimpan");

ws.close();
process.exit(0);
