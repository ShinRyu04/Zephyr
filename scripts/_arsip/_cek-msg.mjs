import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession?A.activeSession():null;
  const msgs = sess?sess.messages:[];
  return msgs.map(m=>({role:m.role, err:m.error||null, isi:String(m.content||'').slice(0,200)}));
})())`);
console.log(JSON.stringify(r,null,1));
await cdp.close();
