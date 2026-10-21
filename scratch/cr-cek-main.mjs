const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("5173") && !x.url.includes("#"));
if (!page) {
  console.log("URL:", list.map((x) => x.url).join(" | "));
  throw new Error("jendela utama tidak ditemukan");
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
  if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception?.description || "").slice(0, 900) };
  return r.result?.value;
};

await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4000));

console.log(
  await ev(`JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const o={ vw: innerWidth, vh: innerHeight };
  o.menubar = R(document.querySelector('.menubar, [data-testid="menubar"]'));
  o.activity = R(document.querySelector('.activity-bar, [data-testid="activity-bar"]'));
  o.sidebar = R(document.querySelector('.sidebar, [data-testid="sidebar"]'));
  o.editor = R(document.querySelector('.editor, .monaco-editor, [data-testid="editor"]'));
  o.aiPanel = R(document.querySelector('.ai-panel'));
  o.statusbar = R(document.querySelector('.statusbar, [data-testid="statusbar"]'));
  o.bodyText = document.body.innerText.slice(0, 300).replace(/\\n/g, ' | ');
  o.elemenTerlihat = [...document.querySelectorAll('body > div > *')].length;
  return o;
})())`),
);

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs/promises");
await fs.writeFile("D:/Zephyr/scratch/main-window-sekarang.png", Buffer.from(shot.data, "base64"));
console.log("screenshot disimpan: scratch/main-window-sekarang.png");

ws.close();
process.exit(0);
