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

const c = await cdp(PORT, (x) => x.url.includes('solo'));

const PROBES = {
  /* Rows in the left list: padding, height, icon, title, subtitle, hover bg. */
  barisSesi: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius,lh:s.lineHeight}};
    const wrap=document.querySelector('.task-list-wrapper');
    if(!wrap) return 'tidak ada';
    const anak=[...wrap.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.height>20&&b.height<90&&b.width>100}).slice(0,14);
    return JSON.stringify(anak.map(e=>({tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,60),box:r(e),teks:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ').slice(0,40)||undefined,s:cs(e)})));
  })()`,

  /* The chat header: what is in it, and how each control is sized. */
  headerChat: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius}};
    const h=document.querySelector('.index-module__container___B9Lsb');
    if(!h) return 'tidak ada';
    return JSON.stringify({html:h.outerHTML.slice(0,1400),box:r(h),s:cs(h)});
  })()`,

  /* The composer at the bottom of the chat: box, radius, buttons. */
  composer: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,pad:s.padding,gap:s.gap,r:s.borderRadius,border:s.borderWidth+' '+s.borderColor}};
    const teks=[...document.querySelectorAll('textarea,[contenteditable="true"]')];
    const out=teks.map(e=>({tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,60),box:r(e),s:cs(e),ph:e.placeholder||undefined}));
    const bawah=[...document.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.y>700&&b.height>30&&b.height<200&&b.width>300&&b.width<520}).slice(0,12);
    return JSON.stringify({input:out, areaBawah:bawah.map(e=>({tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,60),box:r(e),s:cs(e),teks:(e.innerText||'').slice(0,80)}))});
  })()`,

  /* Right tab bar: tab items, active state, and the toolbar buttons. */
  tabKanan: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius}};
    const bar=document.querySelector('.tools-panel-tab-bar-host');
    if(!bar) return 'tidak ada';
    const tabs=[...bar.querySelectorAll('[data-role="tool-panel-tab"]')];
    return JSON.stringify({
      bar:{box:r(bar),s:cs(bar)},
      tabs:tabs.map(e=>({box:r(e),s:cs(e),teks:(e.innerText||'').trim().slice(0,30),aktif:e.getAttribute('aria-selected')||e.className.includes('active')||undefined})),
      semuaTeks:(bar.innerText||'').replace(/\\n/g,' | '),
    });
  })()`,

  /* Right content: the changes list rows. */
  daftarPerubahan: `(()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,fw:s.fontWeight,pad:s.padding,gap:s.gap,r:s.borderRadius}};
    const area=document.querySelector('.solo-lite-main-area');
    if(!area) return 'tidak ada';
    const baris=[...area.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.y>150&&b.y<420&&b.height>16&&b.height<60&&b.width>500}).slice(0,14);
    return JSON.stringify(baris.map(e=>({tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,50),box:r(e),teks:(e.innerText||'').replace(/\\n/g,' / ').slice(0,70),s:cs(e)})));
  })()`,
};

for (const [nama, expr] of Object.entries(PROBES)) {
  try {
    const v = await c.eval(expr);
    console.log('\n===== ' + nama + ' =====');
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      console.log(JSON.stringify(JSON.parse(v), null, 1));
    } else {
      console.log(v);
    }
  } catch (e) {
    console.log('\n===== ' + nama + ' ===== GAGAL: ' + String(e.message).slice(0, 200));
  }
}

c.close();
process.exit(0);
