import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[];
  // hitung tool berdasarkan nama
  const byName = {};
  for (const s of steps) if (s.name) byName[s.name] = (byName[s.name]||0)+1;
  // 10 langkah terakhir
  const last10 = steps.filter(s=>s.name).slice(-12).map(s=>s.name);
  return { stepIdxAkhir: A.agentStepIndex, byName, last10, totalSteps: steps.length };
})())`);
console.log('byName:', JSON.stringify(r.byName,null,1));
console.log('12 tool terakhir:', JSON.stringify(r.last10));
await cdp.close();
