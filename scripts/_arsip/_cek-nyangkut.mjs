import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const s = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const keys = ['agentBusy','agentPhase','agentCurrentTool','agentStepIndex','agentStepLimit','agentFailure','agentStopReason','streaming','cursor'];
  const out = {};
  for (const k of keys) out[k] = A[k] === undefined ? null : A[k];
  out.now = Date.now();
  out.jejak = (A.agentSteps || []).slice(-6).map((x) => ({ k: x.kind, n: x.name, at: x.at, r: String(x.result || '').slice(0, 140) }));
  const sesi = A.activeSession ? A.activeSession() : null;
  out.sesiJudul = sesi ? sesi.title : null;
  const msgs = (sesi && sesi.messages) ? sesi.messages : [];
  out.nPesan = msgs.length;
  out.pesanTerakhir = msgs.length ? (() => {
    const m = msgs[msgs.length - 1];
    return { role: m.role, streaming: !!m.streaming, error: m.error || null, panjang: String(m.content || '').length, ekor: String(m.content || '').slice(-400) };
  })() : null;
  out.semuaPesan = msgs.slice(-6).map((m) => ({ role: m.role, streaming: !!m.streaming, panjang: String(m.content || '').length }));
  return out;
})())`);
console.log(JSON.stringify(s, null, 1));
await cdp.close();
