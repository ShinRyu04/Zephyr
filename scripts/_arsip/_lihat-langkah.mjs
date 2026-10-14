import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  const msgs = sess ? sess.messages.slice(-4).map(m=>({r:m.role, name:m.name||null, c:String(m.content||'').slice(0,160)})) : [];
  const steps = (A.langkahRiwayat||[]).slice(-14).map(x=>String(x).slice(0,70));
  return { busy:A.agentBusy, nStep:(A.langkahRiwayat||[]).length, steps, msgs };
})())`);
console.log(r);
await cdp.close();
