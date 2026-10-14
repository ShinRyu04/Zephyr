import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
console.log(JSON.stringify(await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  const t0 = Date.now();
  void A.getState().send('Balas tepat satu kata: HALO');
  while (Date.now() - t0 < 90000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  while (Date.now() - t0 < 120000 && A.getState().agentBusy) await new Promise((r) => setTimeout(r, 300));
  const s = A.getState();
  const sn = s.activeSession ? s.activeSession() : null;
  const ms = (sn && sn.messages) ? sn.messages : [];
  return { ms: Date.now() - t0, busy: s.agentBusy,
    pesan: ms.map((m) => ({ role: m.role, len: String(m.content||'').length, awal: String(m.content||'').slice(0,120), err: m.error ?? null })),
    nama: (s.agentSteps||[]).map((x) => x.kind + ':' + (x.name||'')) };
})())`, 180000), null, 1));
await cdp.close();
