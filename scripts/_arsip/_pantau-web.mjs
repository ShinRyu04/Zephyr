import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
let last = null;
for (let i=0;i<80;i++){
  const r = await cdp.json(`return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
    const sess = A.activeSession ? A.activeSession() : null;
    const msgs = sess ? sess.messages : [];
    const last = msgs[msgs.length-1] || {};
    const steps = v.steps||[];
    return {
      busy: A.agentBusy, idx: A.agentStepIndex,
      tools: steps.filter(s=>s.name).map(s=>s.name),
      errs: steps.filter(s=>s.error).map(s=>String(s.error).slice(0,140)),
      lastErr: last.error ? String(last.error).slice(0,180) : null,
    };
  })())`);
  const line = `${i} busy=${r.busy} idx=${r.idx} nTool=${r.tools.length}` + (r.errs.length?` ERR=${JSON.stringify(r.errs.slice(-2))}`:'') + (r.lastErr?` MSGERR=${r.lastErr}`:'');
  if (line !== last) { console.log(line); last = line; }
  if (!r.busy && i>2){ console.log('SELESAI tools:', JSON.stringify(r.tools)); break; }
  await new Promise(s=>setTimeout(s,6000));
}
await cdp.close();
