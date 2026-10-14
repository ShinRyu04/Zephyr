import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps=(A.agentSteps||[]).filter(x=>x.kind==='tool'&&x.name==='bash_run');
  return steps.slice(-6).map(x=>({args:String(x.args||'').slice(0,150), ok:x.ok, r:String(x.result||'').slice(0,100)}));
})())`);
console.log(r);
await cdp.close();
