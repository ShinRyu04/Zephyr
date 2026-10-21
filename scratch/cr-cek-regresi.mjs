const PORT = process.argv[2] || "9334";
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();

const targets = [
  { name: "jendela utama", url: "http://localhost:5173/" },
  { name: "agents", url: "#agents" },
];

for (const t of targets) {
  const page = t.url.startsWith("#")
    ? list.find((x) => x.url.includes(t.url))
    : list.find((x) => x.url.endsWith("/") && x.url.includes("5173") && !x.url.includes("#"));
  if (!page) {
    console.log(`${t.name}: TIDAK ADA`);
    continue;
  }

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
    if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception?.description || "").slice(0, 600) };
    return r.result?.value;
  };

  const info = await ev(`JSON.stringify((()=>{
    const R=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height)}};
    const errs = [...document.querySelectorAll('*')].filter(e=>e.tagName==='BODY').length;
    return {
      judul: document.title,
      adaAiPanel: !!document.querySelector('.ai-panel'),
      aiPanel: R(document.querySelector('.ai-panel')),
      adaAgxComposer: !!document.querySelector('[data-testid="agx-composer"]'),
      adaAgxStarting: !!document.querySelector('[data-testid="agx-starting"]'),
      bodyLen: document.body.innerText.length,
      teksAwal: document.body.innerText.slice(0, 120).replace(/\\n/g,' | '),
    };
  })())`);
  console.log(`${t.name} (${page.url}):`);
  console.log("  " + info);
  ws.close();
}

process.exit(0);
