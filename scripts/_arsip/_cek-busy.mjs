import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  return { busy: A.agentBusy, idx: A.agentStepIndex, nTool: (v.steps||[]).filter(s=>s.name).length };
})())`);
console.log(JSON.stringify(r));
await cdp.close();
