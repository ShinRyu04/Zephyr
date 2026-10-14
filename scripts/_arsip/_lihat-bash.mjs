import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[];
  const bash = steps.filter(s=>s.name==='bash_run').map(s=>{ let c=''; try{c=JSON.parse(s.args||'{}').command||'';}catch{} return c.slice(0,70); });
  return { total: bash.length, contoh: bash.slice(0,30) };
})())`);
console.log('total bash_run:', r.total);
r.contoh.forEach((c,i)=>console.log(`${i}: ${c}`));
await cdp.close();
