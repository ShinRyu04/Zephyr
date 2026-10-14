import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const o = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const TANYA = 'Pertanyaan soal Zephyr sendiri (aplikasi ini), bukan soal berkas: '
    + '(1) kunci setelan mana yang mengatur berapa pane terminal boleh jalan bersamaan, dan berapa nilai bawaannya? '
    + '(2) port berapa yang dipakai server MCP secara bawaan, dan port mana yang dicadangkan untuk debug WebView2/CDP? '
    + '(3) kontrol sub-agent (maxParallel, allowWrite) muncul di halaman mana? '
    + 'Jawab singkat 3 poin, sebutkan nama kunci setelannya apa adanya.';
  if (A.getState().newChat) A.getState().newChat();
  A.getState().setAgentMode('chat');
  const t0 = Date.now();
  void A.getState().send(TANYA);
  while (Date.now() - t0 < 20000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const mulai = A.getState().agentBusy;
  while (Date.now() - t0 < 150000 && A.getState().agentBusy) await new Promise((r) => setTimeout(r, 300));
  const s = A.getState();
  const sn = s.activeSession ? s.activeSession() : null;
  const ms = (sn && sn.messages) ? sn.messages : [];
  const ter = ms.length ? ms[ms.length - 1] : null;
  return { ms: Date.now() - t0, mulai, busy: s.agentBusy, mode: s.agentMode,
    balasan: ter ? String(ter.content || '') : '', err: ter ? (ter.error ?? null) : null,
    langkah: (s.agentSteps||[]).map((x) => x.kind + ':' + (x.name||'')) };
})())`, 200000);
console.log('ms=' + o.ms + ' mulai=' + o.mulai + ' mode=' + o.mode + ' err=' + o.err + ' langkah=' + JSON.stringify(o.langkah));
console.log('--- jawaban ---'); console.log(o.balasan);
await cdp.close();
