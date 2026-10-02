const CDP = process.env.CDP || 'http://127.0.0.1:9351';
(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  const ev = async (x, a = false) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a }); return r.result?.result?.value; };

  console.log('=== 1. tab panel yang ada ===');
  console.log(JSON.stringify(await ev(`(()=>({
    tabs:[...document.querySelectorAll('.pts-tab')].map(x=>({t:x.textContent.trim().slice(0,18), cls:x.className.slice(0,50)})),
    panelTerbuka: !!document.querySelector('[data-testid="panel-body"]'),
    testidPanel: [...document.querySelectorAll('[data-testid]')].map(x=>x.getAttribute('data-testid')).filter(s=>/panel/i.test(s)).slice(0,10),
  }))()`), null, 2));

  console.log('=== 2. klik tab Terminal ===');
  console.log(JSON.stringify(await ev(`(()=>{
    const b=[...document.querySelectorAll('.pts-tab')].find(x=>/^Terminal$/i.test(x.textContent.trim()));
    if(!b) return {ada:false, semua:[...document.querySelectorAll('.pts-tab')].map(x=>x.textContent.trim())};
    b.click(); return {ada:true};
  })()`)));
  await new Promise(r => setTimeout(r, 2200));

  console.log('=== 3. setelah klik Terminal: tombol apa yang ada ===');
  console.log(JSON.stringify(await ev(`(()=>({
    splitBrowser: !!document.querySelector('[data-testid="empty-split-browser"]'),
    semuaTestidEmpty: [...document.querySelectorAll('[data-testid]')].map(x=>x.getAttribute('data-testid')).filter(s=>/empty|browser|term/i.test(s)).slice(0,25),
    teksPanel: (document.querySelector('[data-testid="panel-body"]')||document.body).innerText.replace(/\\s+/g,' ').slice(0,250),
  }))()`), null, 2));

  ws.close();
})().catch(e => console.log('ERR', e.message));
