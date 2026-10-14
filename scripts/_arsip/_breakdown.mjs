import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[];
  const byName={}; for(const s of steps) if(s.name) byName[s.name]=(byName[s.name]||0)+1;
  const bash = steps.filter(s=>s.name==='bash_run').map(s=>{let c='';try{c=JSON.parse(s.args||'{}').command||'';}catch{}return c.slice(0,65);});
  // hitung perintah bash berulang
  const freq={}; for(const c of bash){ const key=c.replace(/[0-9]+/g,'N'); freq[key]=(freq[key]||0)+1; }
  const topBash = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const lastMsg = (A.activeSession?A.activeSession().messages:[]).slice(-1)[0]||{};
  return { byName, topBash, langkahMulai: steps.filter(s=>s.kind==='mulai').length, isiAkhir: String(lastMsg.content||'').slice(-300) };
})())`);
console.log('byName:', JSON.stringify(r.byName,null,1));
console.log('langkah(mulai):', r.langkahMulai, '/ 120');
console.log('bash berulang (pola):'); r.topBash.forEach(([c,n])=>console.log(`  ${n}x  ${c}`));
console.log('--- isi akhir ---', r.isiAkhir);
await cdp.close();
