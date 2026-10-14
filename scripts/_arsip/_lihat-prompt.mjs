import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  // ambil riwayat yang dikirim ke provider dari langkah pertama kalau tersimpan
  const sess = A.activeSession ? A.activeSession() : null;
  return { keys: Object.keys(A).filter(x=>/prompt|system|persona/i.test(x)) };
})())`);
console.log(JSON.stringify(r,null,1));
await cdp.close();
