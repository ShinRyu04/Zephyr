import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = (A.agentSteps||[]).slice(-16).map(x=>({
    k: x.kind||x.type||x.jenis||x.role||'?',
    n: x.name||x.tool||x.nama||'',
    s: String(x.summary||x.ringkas||x.content||x.text||x.detail||'').slice(0,90)
  }));
  return { idx:A.agentStepIndex, total:(A.agentSteps||[]).length, st };
})())`);
console.log(r);
await cdp.close();
