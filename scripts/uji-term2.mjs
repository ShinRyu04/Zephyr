import { writeFileSync } from 'fs';
const CDP = process.env.CDP;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost') || x.url.includes('localhost'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable').catch(()=>{});
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
  // Buka terminal pane via tombol empty-shell kalau pane masih kosong
  const buka = await ev(send, `(()=>{
    const shell=[...document.querySelectorAll('[data-testid="empty-shell"]')][0];
    if(shell){shell.click(); return 'klik-empty-shell';}
    const tab=[...document.querySelectorAll('.pts-tab')].find(x=>/Terminal/i.test(x.textContent));
    if(tab){tab.click(); return 'klik-tab';}
    return 'no-btn';
  })()`);
  console.log('buka:', buka);
  await wait(3000);
  const info = await ev(send, `(()=>{
    const pick=el=>el?getComputedStyle(el).backgroundColor:null;
    const x=document.querySelector('.xterm');
    const pane=document.querySelector('.xterm-pane');
    const holder=document.querySelector('.xterm-holder');
    const viewport=document.querySelector('.xterm-viewport');
    const rows=document.querySelector('.xterm-rows');
    const screen=document.querySelector('.xterm-screen');
    return {
      adaXterm:!!x, adaShellBtn:!!document.querySelector('[data-testid="empty-shell"]'),
      bgXterm:pick(x), bgPane:pick(pane), bgHolder:pick(holder),
      bgViewport:pick(viewport), bgRows:pick(rows), bgScreen:pick(screen),
      termBg:getComputedStyle(document.documentElement).getPropertyValue('--terminal-bg').trim(),
      editorBg:getComputedStyle(document.documentElement).getPropertyValue('--editor-bg').trim(),
      dataTheme:document.documentElement.dataset.theme,
      // cek style inline xterm (warna hardcode?)
      xtermStyleInline: x? x.getAttribute('style'):null,
    };
  })()`);
  console.log(JSON.stringify(info,null,2));
  ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
