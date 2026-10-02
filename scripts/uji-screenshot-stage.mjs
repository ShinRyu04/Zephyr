import { writeFileSync } from 'fs';
const CDP = process.env.CDP;
const OUT = process.env.OUT || 'stage.png';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable').catch(() => {});
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
  const dump = await ev(send, `(()=>{
    const tab=[...document.querySelectorAll('.pts-tab')].map(x=>x.textContent.trim());
    const emptyShell=!!document.querySelector('[data-testid="empty-shell"]');
    const emptyBrowser=!!document.querySelector('[data-testid="empty-split-browser"]');
    const panes=[...document.querySelectorAll('[data-pane-kind]')].map(e=>e.getAttribute('data-pane-kind'));
    return {tab, emptyShell, emptyBrowser, panes};
  })()`);
  console.log('dump:', JSON.stringify(dump));
  // Klik tombol Split With Browser bila ada.
  const klik = await ev(send, `(()=>{
    const b=document.querySelector('[data-testid="empty-split-browser"]');
    if(b){b.click(); return true;}
    return false;
  })()`);
  console.log('klik split-browser:', klik);
  await wait(7000);
  const clip = await ev(send, `(()=>{const st=document.querySelector('[data-testid="bp-stage"]')||document.querySelector('.browser-pane'); if(!st) return null; const r=st.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
  console.log('clip:', JSON.stringify(clip));
  if (clip) {
    const shot = await send('Page.captureScreenshot', { clip: { ...clip, scale: 1 }, format: 'png', captureBeyondViewport: false });
    const b64 = shot.result?.data;
    if (b64) { writeFileSync(OUT, Buffer.from(b64, 'base64')); console.log('saved', OUT, b64.length, 'bytes'); }
    else console.log('no data', JSON.stringify(shot).slice(0, 200));
  }
  ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
