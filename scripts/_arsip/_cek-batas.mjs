import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  const msgs = sess ? sess.messages : [];
  const asisten = msgs.filter(m=>m.role==='assistant');
  const last = asisten[asisten.length-1]||{};
  return { isiAkhir: String(last.content||'').slice(-500), error: last.error||null };
})())`);
console.log('ERR:', r.error);
console.log('--- isi akhir pesan asisten ---');
console.log(r.isiAkhir);
await cdp.close();
