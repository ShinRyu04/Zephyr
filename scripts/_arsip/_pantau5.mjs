import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
let lastIdle = 0;
for (let i=0;i<120;i++){
  let r;
  try {
    r = await cdp.json(`return JSON.stringify((() => {
      const A = window.__ZEPHYR_AI__.store.getState();
      const steps=(A.agentSteps||[]).filter(x=>x.kind==='tool');
      const tally={};
      for(const s of steps){tally[s.name]=(tally[s.name]||0)+1;}
      const sess=A.activeSession?A.activeSession():null;
      const last=sess&&sess.messages.length?sess.messages[sess.messages.length-1]:null;
      return { busy:A.agentBusy, idx:A.agentStepIndex, nTool:steps.length,
        todo:(A.agentTodos||[]).filter(t=>t.status==='done').length+'/'+(A.agentTodos||[]).length,
        tally, lastRole:last?last.role:null };
    })())`);
  } catch(e){ console.log(i,'(cdp hup)', e.message.slice(0,40)); await new Promise(s=>setTimeout(s,3000)); continue; }
  const t=r.tally||{};
  const ts=Object.entries(t).map(([k,v])=>`${k}:${v}`).join(' ');
  console.log(i, `busy=${r.busy} idx=${r.idx} nTool=${r.nTool} todo=${r.todo} | ${ts}`);
  if(!r.busy){ if(++lastIdle>=2){ console.log('=== IDLE, selesai ==='); break; } }
  else lastIdle=0;
  await new Promise(s=>setTimeout(s,5000));
}
await cdp.close();
