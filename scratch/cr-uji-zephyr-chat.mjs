const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("#agents"));
if (!page) throw new Error("target #agents tidak ditemukan");

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

const probe = `JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const o={};
  o.starting = !!document.querySelector('[data-testid="agx-starting"]');
  o.conversation = !!document.querySelector('[data-testid="agx-conversation"]');
  o.box1 = R(document.querySelector('[data-testid="agx-box1"]'));
  o.box2 = R(document.querySelector('[data-testid="agx-box2"]'));
  o.chatCard = R(document.querySelector('[data-testid="agx-chat-card"]'));
  o.panel = R(document.querySelector('[data-testid="agx-panel"]'));
  o.msgCount = document.querySelectorAll('[data-testid="agx-msg-user"]').length;
  return o;
})())`;

// Isi field lewat store Zephyr (bukan DOM event) supaya tidak bergantung React internals
await ev(`(async()=>{
  const m = await import('/src/lib/aiStore.ts');
  m.useAi.getState().setDraft('halo dari verifikasi', 'agents');
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));

console.log("=== setelah isi draft ===");
console.log(await ev(probe));

// Klik tombol kirim
await ev(`(()=>{const b=document.querySelector('[data-testid="agx-send"]'); if(b){b.click(); return true} return false})()`);
await new Promise((r) => setTimeout(r, 1200));

console.log("=== setelah kirim ===");
console.log(await ev(probe));

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs/promises");
await fs.writeFile("D:/Zephyr/scratch/zephyr-agents-chat.png", Buffer.from(shot.data, "base64"));
console.log("screenshot chat disimpan");

ws.close();
process.exit(0);
