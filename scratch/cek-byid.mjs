import { writeFileSync } from 'fs';

/*
 * Attach by TARGET ID, not by URL.
 *
 * URL matching has failed repeatedly here because the Agents window and the main
 * window share the same origin and the same hash once anything navigates. The
 * target `id` is stable and unique, so every probe from here on uses it.
 */
async function attach(port, targetId) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.id === targetId);
  if (!t) throw new Error('target ' + targetId + ' tidak ada');
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
    send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 600));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const out = [];

for (const t of list) {
  out.push('=== ' + t.id + ' | ' + t.url);
  const c = await attach(9223, t.id);
  const v = await c.eval(`JSON.stringify({
    href: location.href,
    root: document.querySelector('#root')?.firstElementChild?.className,
    agMenubar: !!document.querySelector('.ag-menubar'),
    editorArea: !!document.querySelector('.editor-area'),
    activitybar: !!document.querySelector('.activitybar'),
  })`);
  out.push('    ' + v);
  c.close();
}

writeFileSync('D:\\Zephyr\\scratch\\dua-target.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
process.exit(0);
