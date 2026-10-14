import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const sess = A.activeSession?A.activeSession():null; const msgs=sess?sess.messages:[];
  const lm = msgs[msgs.length-1]||{};
  return { err: lm.error||null, isiAkhir: String(lm.content||'').slice(-250) };
})())`);
console.log('ERR:', r.err);
console.log('--- akhir ---', r.isiAkhir);
await cdp.close();
