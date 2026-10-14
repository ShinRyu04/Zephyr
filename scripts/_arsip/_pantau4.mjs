import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
let last = null;
for (let i=0;i<95;i++){
  const r = await cdp.json(`return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
    const steps = v.steps||[]; const todos = v.todos||[];
    const bashHelper = steps.filter(s=>{ if(s.name!=='bash_run')return false; let c='';try{c=JSON.parse(s.args||'{}').command||'';}catch{} return /_scan|_outline|_contract|_struct|_ex\.|_sk\.|node _|node D:.*_/.test(c); }).length;
    const webWrites = [...new Set(steps.filter(s=>s.name==='write_file').map(s=>{let p='';try{p=JSON.parse(s.args||'{}').path||'';}catch{}return p;}).filter(p=>!/[\\/]_|^_/.test(p.split(/[\\/]/).pop()||'')))];
    const sess = A.activeSession?A.activeSession():null; const msgs=sess?sess.messages:[]; const lm=msgs[msgs.length-1]||{};
    return { busy:A.agentBusy, tool:steps.filter(s=>s.name).length, todoDone:todos.filter(t=>t.status==='done').length, todoTot:todos.length, lanjut:steps.filter(s=>s.name==='(lanjut)').length, bashHelper, nWeb:webWrites.length, webWrites, err:lm.error?String(lm.error).slice(0,100):null };
  })())`);
  const line=`${i} busy=${r.busy} tool=${r.tool} todo=${r.todoDone}/${r.todoTot} web=${r.nWeb} helper=${r.bashHelper} lanjut=${r.lanjut}`+(r.err?` ERR=${r.err}`:'');
  if(line!==last){ console.log(line); last=line; }
  if(!r.busy && i>2){ console.log('SELESAI web:', JSON.stringify(r.webWrites)); break; }
  await new Promise(s=>setTimeout(s,6000));
}
await cdp.close();
