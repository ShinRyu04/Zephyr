import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = A.agentStates || {}; const k = Object.keys(st)[0] ?? ''; const v = st[k] || {};
  const sess = A.activeSession ? A.activeSession() : null;
  const msgs = sess ? sess.messages : [];
  const last = msgs[msgs.length-1] || {};
  const todos = (v.todos||[]).map(t=>({c:t.content.slice(0,50), s:t.status}));
  return {
    error: last.error||null,
    isiAkhir: String(last.content||'').slice(-600),
    todos,
    nStep: (v.steps||[]).length,
  };
})())`);
console.log('ERROR:', r.error);
console.log('TODOS:', JSON.stringify(r.todos,null,1));
console.log('--- isi akhir ---'); console.log(r.isiAkhir);
await cdp.close();
