import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  const last = sess && sess.messages.length ? sess.messages[sess.messages.length-1] : null;
  // berapa langkah tool sejak teks terakhir berubah
  const steps=(A.agentSteps||[]);
  return {
    busy:A.agentBusy, phase:A.agentPhase, idx:A.agentStepIndex,
    contentLen: last?String(last.content||'').length:0,
    streaming: last?last.streaming:null,
    contentTail: last?String(last.content||'').slice(-180):null,
  };
})())`);
console.log(r);
await cdp.close();
