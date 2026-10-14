import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
let last = null;
for (let i=0;i<110;i++){
  const r = await cdp.json(`return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
    const sess = A.activeSession ? A.activeSession() : null;
    const msgs = sess ? sess.messages : [];
    const lastMsg = msgs[msgs.length-1] || {};
    const steps = v.steps||[];
    const todos = (v.todos||[]);
    return {
      busy: A.agentBusy, idx: A.agentStepIndex,
      nTool: steps.filter(s=>s.name).length,
      lanjut: steps.filter(s=>s.name==='(lanjut)').length,
      todoDone: todos.filter(t=>t.status==='done').length,
      todoTotal: todos.length,
      errs: steps.filter(s=>s.error).length,
      lastErr: lastMsg.error ? String(lastMsg.error).slice(0,120) : null,
    };
  })())`);
  const line = `${i} busy=${r.busy} tool=${r.nTool} todo=${r.todoDone}/${r.todoTotal} lanjut=${r.lanjut}` + (r.errs?` errs=${r.errs}`:'') + (r.lastErr?` MSGERR=${r.lastErr}`:'');
  if (line !== last){ console.log(line); last=line; }
  if (!r.busy && i>2){ console.log('SELESAI'); break; }
  await new Promise(s=>setTimeout(s,6000));
}
await cdp.close();
