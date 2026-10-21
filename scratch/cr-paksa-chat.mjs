const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("#agents"));
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
  if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception?.description || "").slice(0, 1200) };
  return r.result?.value;
};

// Isi sesi langsung (melewati syarat API key) supaya keadaan chat-aktif bisa diukur.
console.log(
  await ev(`(async()=>{
  const m = await import('/src/lib/aiStore.ts');
  const st = m.useAi.getState();
  const sid = st.newChat('agents');
  m.useAi.setState((s)=>({
    sessions: s.sessions.map(x=> x.id===sid ? {
      ...x,
      title: 'Verifikasi tampilan',
      messages: [
        {id:'u1', role:'user', content:'Rombak composer jadi dua kotak seperti acuan.', at:Date.now()-2000},
        {id:'a1', role:'assistant', content:'Sudah: kotak pertama memuat field dan baris kontrol, kotak kedua memuat baris Local. Panel kanan muncul setelah pesan pertama.', at:Date.now()-1000},
      ],
    } : x),
  }));
  return JSON.stringify({sid, activeIds: m.useAi.getState().activeIds});
})()`),
);

await new Promise((r) => setTimeout(r, 900));

const probe = `JSON.stringify((()=>{
  const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
  const bg=(e)=>e?getComputedStyle(e).backgroundColor:null;
  const o={};
  o.starting = !!document.querySelector('[data-testid="agx-starting"]');
  o.conversation = !!document.querySelector('[data-testid="agx-conversation"]');
  o.chatCard = R(document.querySelector('[data-testid="agx-chat-card"]'));
  o.box1 = R(document.querySelector('[data-testid="agx-box1"]'));
  o.field = R(document.querySelector('[data-testid="agx-field"]'));
  o.box2 = R(document.querySelector('[data-testid="agx-box2"]'));
  o.panel = R(document.querySelector('[data-testid="agx-panel"]'));
  o.panelBg = bg(document.querySelector('[data-testid="agx-panel"]'));
  o.msgUser = document.querySelectorAll('[data-testid="agx-msg-user"]').length;
  o.msgAgent = document.querySelectorAll('[data-testid="agx-msg-assistant"]').length;
  return o;
})())`;

console.log("=== chat aktif ===");
console.log(await ev(probe));

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs/promises");
await fs.writeFile("D:/Zephyr/scratch/zephyr-agents-chat.png", Buffer.from(shot.data, "base64"));
console.log("screenshot disimpan");

ws.close();
process.exit(0);
