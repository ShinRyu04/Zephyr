const CDP = process.env.CDP;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.type === 'page' && x.url.includes('localhost'));
  if (!t) throw new Error('no page ' + JSON.stringify(list.slice(0, 3)));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  return { ws, send };
}
async function ev(send, e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}
(async () => {
  const { ws, send } = await connect();
  await wait(1500);
  // Buka panel Terminal via menu/command palette atau tombol langsung.
  const buka = await ev(send, `(()=>{
    // cari tombol Add Terminal / pane kosong
    const cands = [...document.querySelectorAll('button')].map(b=>b.textContent.trim());
    const trig = [...document.querySelectorAll('[data-testid="empty-shell"],[data-testid="pts-tab"],[class*=add-terminal]')];
    const tab = [...document.querySelectorAll('.pts-tab')].find(x=>/Terminal/i.test(x.textContent));
    if (tab){ tab.click(); return {klikTab:true}; }
    return {cands: cands.slice(0,20), trig: trig.length};
  })()`);
  console.log('buka:', JSON.stringify(buka));
  await wait(2500);
  const info = await ev(send, `(()=>{
    const pick = (el)=> el? getComputedStyle(el).backgroundColor : null;
    const xterm = document.querySelector('.xterm');
    const pane = document.querySelector('.xterm-pane');
    const holder = document.querySelector('.xterm-holder');
    const viewport = document.querySelector('.xterm-viewport');
    const rows = document.querySelector('.xterm-rows');
    const screen = document.querySelector('.xterm-screen');
    return {
      adaXterm: !!xterm,
      bgXterm: pick(xterm), bgPane: pick(pane), bgHolder: pick(holder),
      bgViewport: pick(viewport), bgRows: pick(rows), bgScreen: pick(screen),
      termTheme: (window.__ZEPHYR__ && window.__ZEPHYR__.termTheme) ? window.__ZEPHYR__.termTheme() : 'no-bridge'
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
