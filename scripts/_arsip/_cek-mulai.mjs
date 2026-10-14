import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[];
  const mulai = steps.filter(s=>s.kind==='mulai').length;
  const reminder = steps.filter(s=>s.name==='(reminder)').length;
  // write_file ke file website (bukan _helper)
  const webWrites = steps.filter(s=>{ if(s.name!=='write_file')return false; let p='';try{p=JSON.parse(s.args||'{}').path||'';}catch{} return !p.includes('/_')&&!p.includes('\\_')&&!/^_/.test(p.split(/[\\/]/).pop()||''); }).map(s=>{let p='';try{p=JSON.parse(s.args||'{}').path||'';}catch{}return p;});
  return { langkahMulai: mulai, reminder, maxStep: 120, webWrites };
})())`);
console.log('Langkah (mulai):', r.langkahMulai, '/ MAX', r.maxStep);
console.log('reminder tanpa-kemajuan:', r.reminder);
console.log('write ke file WEBSITE (bukan helper):', JSON.stringify(r.webWrites,null,1));
await cdp.close();
