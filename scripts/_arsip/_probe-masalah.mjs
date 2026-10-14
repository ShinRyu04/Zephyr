import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const SOAL = 'Gua pake Zephyr, tiba-tiba panel bawah (terminal) ilang dan Nggak bisa munculin lagi. Ini kenapa dan gue harus cek di mana? Jangan buka folder atau nyari-nyari di proyek, jawab dari yang kamu tahu soal Zephyr.';
const o = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const S = window.__ZEPHYR__;
  if (A.getState().newChat) A.getState().newChat();
  A.getState().setAgentMode('agent');
  const t0 = Date.now();
  void A.getState().send(${JSON.stringify(SOAL)});
  while (Date.now() - t0 < 25000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  while (Date.now() - t0 < 200000 && A.getState().agentBusy) await new Promise((r) => setTimeout(r, 300));
  const s = A.getState();
  const sn = s.activeSession ? s.activeSession() : null;
  const ms = (sn && sn.messages) ? sn.messages : [];
  const nama = [];
  for (const m of ms) {
    const arr = m.toolCalls || m.tools || m.calls;
    if (Array.isArray(arr)) for (const c of arr) nama.push(c && (c.name || (c.function && c.function.name)));
    if (m.toolName) nama.push(m.toolName);
  }
  const t = ms.length ? ms[ms.length - 1] : null;
  return { ms: Date.now() - t0, workspace: S.getState().workspace, tools: nama.filter(Boolean),
    err: t ? (t.error ?? null) : null, balasan: t ? String(t.content || '') : '' };
})())`, 260000);
const b = String(o.balasan || '');
const cek = {
  log: /logs|zephyr-\d{4}-\d{2}-\d{2}\.log|zephyr-YYYY/i.test(b),
  panel: /panel|Ctrl\+J|bottom panel|Toggle/i.test(b),
  settings: /settings\.json|Settings|pengaturan/i.test(b),
  bukanNgarang: !/membuka folder|aku akan mencari|let me search/i.test(b),
};
console.log(`durasi=${o.ms}ms workspace=${JSON.stringify(o.workspace)} err=${o.err ?? '-'} tools=${o.tools.join(',') || '(kosong)'}`);
console.log(JSON.stringify(cek));
console.log('--- jawaban ---'); console.log(b);
await cdp.close();
