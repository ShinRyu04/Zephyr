const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const t = list.find((x) => x.url.includes("#agents"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws")), { once: true }); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "").slice(0, 400)); return r.result?.value; };
const fs = await import("node:fs/promises");

await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 5500));

const shot = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile("scratch/agents-sekarang.png", Buffer.from(shot.data, "base64"));
console.log("screenshot disimpan");
ws.close(); process.exit(0);
