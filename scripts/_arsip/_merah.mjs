import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  const msgs = sess ? sess.messages.slice(-6).map(m=>({r:m.role, err:m.error||m.isError||false, c:String(m.content||'').slice(0,200)})) : [];
  // cari elemen DOM merah/error
  const errDom = [...document.querySelectorAll('[class*=error],[class*=merah],[class*=gagal],[data-error]')]
    .map(e=>e.innerText||'').filter(t=>t.trim()).slice(-5);
  return { busy:A.agentBusy, phase:A.agentPhase, msgs, errDom };
})())`);
console.log(r);
await cdp.close();
