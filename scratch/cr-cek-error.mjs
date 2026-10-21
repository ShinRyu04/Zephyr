const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.url.includes("5173") && !x.url.includes("#"));
if (!page) throw new Error("jendela utama tidak ditemukan");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
const consoleMsgs = [];

await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", () => rej(new Error("ws")), { once: true });
});
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(
      (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 900),
    );
  }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    consoleMsgs.push(
      m.params.type + ": " + m.params.args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 400),
    );
  }
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

await send("Runtime.enable");
await send("Log.enable");
await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 5000));

console.log("=== EXCEPTIONS ===");
console.log(errors.length ? errors.join("\n---\n") : "(tidak ada)");
console.log("=== CONSOLE ERROR/WARN ===");
console.log(consoleMsgs.length ? consoleMsgs.slice(0, 10).join("\n") : "(tidak ada)");

console.log("=== tombol & handler ===");
console.log(
  await ev(`JSON.stringify((()=>{
  const btn = [...document.querySelectorAll('button')];
  const o = { totalTombol: btn.length };
  o.tombolContoh = btn.slice(0, 12).map(b=>({
    testid: b.getAttribute('data-testid') || null,
    teks: (b.textContent||'').trim().slice(0,24),
    disabled: b.disabled,
  }));
  o.menubar = !!document.querySelector('[data-testid="menubar"]');
  o.reactRoot = !!document.querySelector('#root')?.children.length;
  return o;
})())`),
);

ws.close();
process.exit(0);
