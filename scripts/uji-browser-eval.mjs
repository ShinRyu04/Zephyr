const CDP = process.env.CDP;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost'));
  if (!t) throw new Error('target utama tidak ada');
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
  // Cari pane id browser dari store global kalau ada. Coba beberapa nama.
  const paneId = await ev(send, `(()=>{
    const cands = [window.__ZEPHYR_TERM__, window.__ZEPHYR__, window.__ZEPHYR_EX__];
    // fallback: baca dari DOM
    const el = document.querySelector('[data-pane-kind="browser"]') || document.querySelector('[data-pane-body]');
    return el ? el.getAttribute('data-pane-body') : null;
  })()`);
  console.log('browser pane id:', paneId);
  // Invoke browser_pane_eval lewat Rust bridge bila ada di window (release: tidak ada).
  // Jadi kita panggil lewat tauri invoke dari dalam page.
  const title = await ev(send, `(()=>new Promise(async(res)=>{
    try {
      const r = await window.__TAURI__.core.invoke('browser_pane_info', { paneId: ${JSON.stringify(paneId)} });
      res(r);
    } catch(e){ res({err:String(e)}); }
  }))()`);
  console.log('browser_pane_info:', JSON.stringify(title));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
