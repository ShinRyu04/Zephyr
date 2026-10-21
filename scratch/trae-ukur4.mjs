const PORT = 9333;

async function cdp(port, matchFn) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.type === 'page' && matchFn(x));
  if (!t) throw new Error('target tidak ada');
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
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 600));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

/*
 * One section per probe, because a single enormous expression is what made the
 * earlier runs time out. Each call stays small enough to return quickly.
 */
const PROBES = {
  /* The left rail: "New task" row, the session list, the footer. */
  kiri: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius,ff:s.fontFamily.slice(0,40)}};
    const q=(s)=>document.querySelector(s);
    const out={};
    for (const sel of ['.task-list-base','.task-list-base-content','.task-panel-entry-buttons','.task-list-new-task-item','.task-list-new-task-text','.task-list-base-footer','.task-list-wrapper']) {
      const e=q(sel); if(e) out[sel]={box:r(e),s:cs(e)};
    }
    out.teksPanel = (q('.task-list-wrapper')?.innerText||'').slice(0,400);
    return JSON.stringify(out);
  })()`,

  /* The chat panel: header row, composer, and the empty-state text. */
  tengah: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius,border:s.borderWidth+' '+s.borderColor}};
    const q=(s)=>document.querySelector(s);
    const out={};
    for (const sel of ['.solo-lite-chat-panel-container','.solo-lite-chat-panel-main','.solo-lite-chat-panel','.solo-lite-chat-panel-content','.solo-lite-chat-container','.session-panel-cache-layout','.message-list-cache-container','.session-view','.ai-chat']) {
      const e=q(sel); if(e) out[sel]={box:r(e),s:cs(e)};
    }
    out.headerTeks = (q('.index-module__container___B9Lsb')?.innerText||'').slice(0,200);
    out.teksChat = (q('.solo-lite-chat-panel-container')?.innerText||'').slice(0,600);
    return JSON.stringify(out);
  })()`,

  /* The right panel: tab bar and whatever tab is active. */
  kanan: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius}};
    const q=(s)=>document.querySelector(s);
    const out={};
    for (const sel of ['.solo-lite-main-area','.tools-panel-tab-bar-host','.solo-lite-layout']) {
      const e=q(sel); if(e) out[sel]={box:r(e),s:cs(e)};
    }
    const bar=q('.tools-panel-tab-bar-host');
    out.tabBarTeks = (bar?.innerText||'').slice(0,300);
    out.tabBarHtml = (bar?.innerHTML||'').slice(0,900);
    out.isiKanan = (q('.solo-lite-main-area')?.innerText||'').slice(0,500);
    return JSON.stringify(out);
  })()`,

  /* Colours that the eye reads as "the TRAE look": borders, sash, radii. */
  warna: `(()=>{
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,border:s.borderColor,bw:s.borderWidth,r:s.borderRadius,shadow:s.boxShadow.slice(0,80)}};
    const q=(s)=>document.querySelector(s);
    return JSON.stringify({
      body: cs(document.body),
      root: cs(document.querySelector('#solo-lite-root')),
      kiri: cs(q('.task-list-base')),
      chat: cs(q('.solo-lite-chat-panel-container')),
      kanan: cs(q('.solo-lite-main-area')),
      sash: cs(q('.solo-lite-sash')),
    });
  })()`,
};

const c = await cdp(PORT, (x) => x.url.includes('solo'));
for (const [nama, expr] of Object.entries(PROBES)) {
  const v = await c.eval(expr);
  console.log('\n===== ' + nama + ' =====');
  console.log(typeof v === 'string' ? JSON.stringify(JSON.parse(v), null, 1) : v);
}
c.close();
process.exit(0);
