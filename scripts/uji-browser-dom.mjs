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
  // Buka pane browser lewat store seperti tombol Split With Browser.
  const klik = await ev(send, `(()=>{const b=document.querySelector('[data-testid="empty-split-browser"]'); if(b){b.click(); return 'klik';} return 'tidak ada tombol';})()`);
  console.log('klik:', klik);
  await wait(6000);
  // Ambil pane id dari DOM, lalu panggil bridge window.__ZEPHYR__ (dev) ATAU lewat store.
  // Di rilis bridge tidak ada; gunakan store global kalau terekspos. Kita coba __ZEPHYR__ dulu.
  const idPane = await ev(send, `(()=>{const el=document.querySelector('[data-pane-body]'); return el?el.getAttribute('data-pane-body'):null;})()`);
  console.log('pane id (DOM):', idPane);
  // Cek isi stage: kalau ada <webview> anak atau canvas, berarti child webview menempel.
  const stage = await ev(send, `(()=>{
    const st=document.querySelector('[data-testid="bp-stage"]');
    if(!st) return {adaStage:false};
    return {adaStage:true, childTags:[...st.children].map(c=>c.tagName+'.'+(c.className||'').toString().slice(0,30)), rect: (r=>r?{w:Math.round(r.width),h:Math.round(r.height)}:null)(st.getBoundingClientRect())};
  })()`);
  console.log('stage:', JSON.stringify(stage));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
