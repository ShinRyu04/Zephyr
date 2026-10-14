import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  return (v.steps||[]).filter(s=>s.error||s.name==='grep').map(s=>({ n: s.name, err: s.error?String(s.error).slice(0,160):null, res: String(s.result||'').slice(0,80) }));
})())`);
console.log(JSON.stringify(r,null,1));
await cdp.close();
