import { writeFileSync } from 'fs';

/*
 * Attach by TARGET ID.
 *
 * Every "main window" probe so far silently attached to the Agents window,
 * because the helper matches URLs with `includes('http://localhost:5173/')` and
 * BOTH targets start with that prefix. The result was a probe that reported the
 * Agents layout and called it the editor's — a measurement bug that looks exactly
 * like a real regression.
 */
async function byId(port, id) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.id === id);
  if (!t) throw new Error('target tidak ada');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let n = 0;
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
      const k = ++n;
      pending.set(k, { res, rej });
      ws.send(JSON.stringify({ id: k, method, params }));
    });
  return {
    target: t,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 600));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.url === 'http://localhost:5173/');
const agen = list.find((x) => x.url.includes('#agents'));

const hasil = [];

/* ── The editor: must be untouched ─────────────────────────────────────── */
if (utama) {
  const c = await byId(9223, utama.id);
  const v = await c.eval(`JSON.stringify((()=>{
    const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{if(!e)return null;const s=getComputedStyle(e);return {bg:s.backgroundColor,r:s.borderRadius,bw:s.borderWidth,disp:s.display}};
    const q=(s)=>document.querySelector(s);
    return {
      root: q('#root')?.firstElementChild?.className,
      agMenubar: !!q('.ag-menubar'),
      aiHeadDisp: cs(q('.ai-head'))?.disp,
      aiHeadH: q('.ai-head') ? Math.round(q('.ai-head').getBoundingClientRect().height) : null,
      inputRowR: cs(q('.ai-input-row'))?.r,
      inputRowBg: cs(q('.ai-input-row'))?.bg,
      inputRowBorder: cs(q('.ai-input-row'))?.bw,
    };
  })())`);
  hasil.push('EDITOR  ' + v);
  c.close();
}

/* ── The Agents window: the rebuilt layout ─────────────────────────────── */
if (agen) {
  const c = await byId(9223, agen.id);
  const v = await c.eval(`JSON.stringify((()=>{
    const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const q=(s)=>document.querySelector(s);
    return {
      root: q('#root')?.firstElementChild?.className,
      menubar: r(q('.ag-menubar')),
      chat: r(q('.ag-center')),
      right: r(q('.ag-right')),
      chatHead: r(q('.ag-center .ai-head')),
      composerR: getComputedStyle(q('.ag-center .ai-input-row')).borderRadius,
    };
  })())`);
  hasil.push('AGENTS  ' + v);
  c.close();
}

writeFileSync('D:\\Zephyr\\scratch\\dua-jendela.txt', hasil.join('\n'), 'utf8');
console.log(hasil.join('\n'));
process.exit(0);
