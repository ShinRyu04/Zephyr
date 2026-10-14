import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps=(A.agentSteps||[]);
  const last8=steps.slice(-8).map(x=>({k:x.kind,n:x.name||'',ok:x.ok,r:String(x.result||'').slice(0,110)}));
  return {busy:A.agentBusy, cur:A.agentCurrentTool, phase:A.agentPhase, idx:A.agentStepIndex, nStep:steps.length, last8};
})())`);
console.log(r);
await cdp.close();
