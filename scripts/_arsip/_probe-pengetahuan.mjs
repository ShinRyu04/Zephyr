import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const s = A.getState();
  const sn = s.activeSession ? s.activeSession() : null;
  const ms = (sn && sn.messages) ? sn.messages : [];
  const steps = (s.agentSteps || []);
  return {
    busy: s.agentBusy,
    mode: s.agentMode, steps: steps.length,
    maksSteps: s.agentMaxSteps ?? null,
    pesan: ms.map((m) => ({ role: m.role, len: String(m.content||'').length, awal: String(m.content||'').slice(0,160) })),
    stepAkhir: steps.slice(-3).map((x) => ({ kind: x.kind, name: x.name, ok: x.ok, teks: String(x.teks||x.content||'').slice(0,200) })),
    todos: (s.agentTodos||[]).length,
    sesiNama: sn ? sn.title ?? sn.name ?? null : null,
  };
})())`, 30000);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
