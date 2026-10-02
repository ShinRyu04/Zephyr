(async () => {
  const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const page = list.find((x) => x.url.includes('localhost:5173'));
  if (!page) return;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const send = (m, p = {}) =>
    new Promise((r) => {
      const i = ++id;
      pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
  };
  await send('Runtime.enable');
  const ev = async (x) => {
    const r = await send('Runtime.evaluate', {
      expression: x,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result?.result?.value;
  };

  // Check how many times onAiChunk callback fires when emit occurs
  const testScript = `(() => {
    let callCount = 0;
    const origCb = window.__ZEPHYR_AI_CALLBACK__;
    window.__ZEPHYR_AI_CALLBACK__ = (c) => {
      callCount++;
      if (origCb) origCb(c);
    };
    return { hasCallback: !!origCb };
  })()`;
  console.log(await ev(testScript));
  ws.close();
})();
