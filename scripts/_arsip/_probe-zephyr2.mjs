import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const o = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const S = window.__ZEPHYR__;
  const TANYA = 'Soal Zephyr (aplikasi ini, bukan proyek lain): setelan mana yang mengatur jumlah pane terminal maksimum, dan berapa nilai bawaannya? Jawab singkat dari pengetahuanmu soal Zephyr.';
  if (A.getState().newChat) A.getState().newChat();
  A.getState().setAgentMode('agent');
  const t0 = Date.now();
  void A.getState().send(TANYA);
  while (Date.now() - t0 < 25000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const mulai = A.getState().agentBusy;
  while (Date.now() - t0 < 240000 && A.getState().agentBusy) await new Promise((r) => setTimeout(r, 300));
  const s = A.getState();
  const sn = s.activeSession ? s.activeSession() : null;
  const ms = (sn && sn.messages) ? sn.messages : [];
  const t = ms.length ? ms[ms.length - 1] : null;
  const alat = [];
  for (const m of ms) {
    const arr = m.toolCalls || m.tools || m.calls;
    if (Array.isArray(arr)) for (const c of arr) alat.push(c && (c.name || (c.function && c.function.name)));
    if (m.toolName) alat.push(m.toolName);
  }
  return {
    ms: Date.now() - t0, mulai, jumlahPesan: ms.length,
    workspace: S && S.getState ? S.getState().workspace : 'TIDAK_TERBACA',
    alatTerakhir: window.__ZEPHYR_AI__.alatTerakhir ? window.__ZEPHYR_AI__.alatTerakhir() : null,
    tools: alat.filter(Boolean), err: t ? (t.error ?? null) : null,
    balasan: t ? String(t.content || '') : '',
  };
})())`, 300000);
console.log(`durasi=${o.ms}ms mulai=${o.mulai} pesan=${o.jumlahPesan} workspace=${JSON.stringify(o.workspace)} err=${o.err ?? '-'}`);
console.log('alatTerakhir=' + JSON.stringify(o.alatTerakhir && { adaFolder: o.alatTerakhir.adaFolder, berat: o.alatTerakhir.berat, buang: o.alatTerakhir.alatDibuang }));
console.log('tools dipanggil: ' + (o.tools.join(', ') || '(tak ada tool)'));
console.log('--- jawaban ---'); console.log(o.balasan);
await cdp.close();
