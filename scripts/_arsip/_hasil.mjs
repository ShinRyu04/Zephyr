import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  const last = sess && sess.messages.length ? sess.messages[sess.messages.length-1] : null;
  return {
    busy: A.agentBusy,
    idx: A.agentStepIndex,
    total:(A.agentSteps||[]).length,
    lastRole: last?last.role:null,
    lastTxt: last?String(last.content||'').slice(0,500):null
  };
})())`);
console.log(r);
await cdp.close();
