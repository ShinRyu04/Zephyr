import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[];
  const writes = steps.filter(s=>s.name==='write_file').map(s=>{
    let p=''; try{ p=JSON.parse(s.args||'{}').path||''; }catch{}
    return { path: p, ok: s.ok!==false, res: String(s.result||'').slice(0,60) };
  });
  const errs = steps.filter(s=>s.error||s.ok===false).map(s=>({n:s.name, e:String(s.error||s.result||'').slice(0,90)}));
  return { nWrite: writes.length, writes: writes.slice(0,40), nErr: errs.length, errs: errs.slice(0,12) };
})())`);
console.log('WRITE_FILE calls:', r.nWrite);
r.writes.forEach(w=>console.log('  ', w.ok?'ok ':'ERR', w.path));
console.log('ERRORS:', r.nErr);
r.errs.forEach(e=>console.log('  ', e.n, e.e));
await cdp.close();
