export async function cdp(port, hash) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.type === 'page' && (x.url ?? '').includes(hash));
  if (!t) throw new Error(`target ${hash} tidak ada di :${port}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws gagal')), { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return {
    target: t,
    async eval(expr) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(
          `${d.text} :: ${d.exception?.description ?? d.exception?.value ?? ''}`.slice(0, 600),
        );
      }
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}
