import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const s = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps = (A.agentSteps || []);
  const nama = steps.map((x) => x.name).filter(Boolean);
  const sesi = A.activeSession ? A.activeSession() : null;
  const msgs = (sesi && sesi.messages) ? sesi.messages : [];
  return {
    busy: A.agentBusy, langkah: nama.length,
    tulis: nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length,
    baca: nama.filter((n) => ['read_file','list_directory','glob','grep','search_files'].includes(n)).length,
    todo: (A.agentTodos || []).map((t) => t.status),
    ekor: nama.slice(-12),
    pesan: msgs.length,
    akhir: msgs.length ? String(msgs[msgs.length - 1].content || '').slice(0, 600) : '',
  };
})())`);
console.log(JSON.stringify(s, null, 1));
await cdp.close();
