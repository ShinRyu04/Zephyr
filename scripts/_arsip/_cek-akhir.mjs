import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const steps = v.steps||[]; const todos = v.todos||[];
  const sess = A.activeSession ? A.activeSession() : null;
  const msgs = sess ? sess.messages : [];
  const lastMsg = msgs[msgs.length-1] || {};
  const writes = steps.filter(s=>s.name==='write_file').map(s=>{ let p=''; try{p=JSON.parse(s.args||'{}').path||'';}catch{} return p; });
  return {
    todos: todos.map(t=>({c:t.content.slice(0,45), s:t.status})),
    nWrite: writes.length,
    writeUnik: [...new Set(writes)],
    lanjut: steps.filter(s=>s.name==='(lanjut)').length,
    lastErr: lastMsg.error||null,
    isiAkhir: String(lastMsg.content||'').slice(-400),
  };
})())`);
console.log('TODOS:'); r.todos.forEach(t=>console.log(`  [${t.s}] ${t.c}`));
console.log('nWrite:', r.nWrite, 'lanjut-disodok:', r.lanjut);
console.log('FILE DITULIS:', JSON.stringify(r.writeUnik,null,1));
console.log('ERROR AKHIR:', r.lastErr);
console.log('--- isi akhir ---'); console.log(r.isiAkhir);
await cdp.close();
