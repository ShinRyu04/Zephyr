import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
for (const [label, o] of await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const tanya = async (teks) => {
    if (A.getState().newChat) A.getState().newChat();
    A.getState().setAgentMode('agent');
    const t0 = Date.now();
    void A.getState().send(teks);
    while (Date.now() - t0 < 20000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
    const mulai = A.getState().agentBusy;
    while (Date.now() - t0 < 120000 && A.getState().agentBusy) await new Promise((r) => setTimeout(r, 300));
    const s = A.getState();
    const sn = s.activeSession ? s.activeSession() : null;
    const ms = (sn && sn.messages) ? sn.messages : [];
    const t = ms.length ? ms[ms.length - 1] : null;
    return { ms: Date.now() - t0, mulai, balasan: t ? String(t.content||'').slice(0,180) : '', err: t ? (t.error ?? null) : null };
  };
  const out = [];
  out.push(['HALO', await tanya('Balas tepat satu kata: HALO')]);
  out.push(['ZEPHYR-Q', await tanya('Soal Zephyr (aplikasi ini): kunci setelan mana yang mengatur jumlah pane terminal, dan berapa nilai bawaannya?')]);
  out.push(['HALO2', await tanya('Balas tepat satu kata: HALO')]);
  return out;
})())`, 300000)) {
  console.log(`${label}: ${o.ms}ms mulai=${o.mulai} err=${o.err ?? 'tidak ada'}`);
  console.log('   balasan: ' + JSON.stringify(o.balasan));
}
await cdp.close();
