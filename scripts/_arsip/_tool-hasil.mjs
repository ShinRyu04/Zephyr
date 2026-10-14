import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps = (A.agentSteps||[]);
  // ambil langkah tool list_directory + bash_run terakhir, dgn result penuh
  const picks = steps.filter(x=>x.kind==='tool').slice(-10).map(x=>({
    name:x.name, args:x.args, ok:x.ok, result:String(x.result||'').slice(0,300)
  }));
  return picks;
})())`);
console.log(r);
await cdp.close();
