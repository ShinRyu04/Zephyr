import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(
  `window.__UJI_A4B__ = { status: 'jalan' };
   (async () => {
  const out = {};
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const mod = await import('/src/components/ai/AiPanel.tsx');
    out.exports = Object.keys(mod).filter((k) => /Ai/i.test(k));
    const ai = (await import('/src/lib/aiStore.ts')).useAi;
    const id = ai.getState().activeIds[''];
    out.id = id;
    out.jumlah = ai.getState().sessions.find((x) => x.id === id)?.messages.length;
    const st = window.__ZEPHYR_AI__;
    out.jembatan = st ? 'ada' : 'tidak';
  } catch (e) { out.err = String(e && e.stack || e); }
  window.__UJI_A4B__ = { status: 'selesai', out };
})();`,
  30000,
);
await new Promise((r) => setTimeout(r, 4000));
const res = await cdp.json(`return JSON.stringify(window.__UJI_A4B__);`, 20000);
console.log(res);
keluarBersih(0);
