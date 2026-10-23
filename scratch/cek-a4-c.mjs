// Uji A4 lewat jembatan resmi __ZEPHYR_AI__ (instance store yang sama dengan UI).
import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.json(
  `window.__UJI_A4C__ = { status: 'jalan' };
   (async () => {
  const out = {};
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const ai = window.__ZEPHYR_AI__.store;
    const panjang = Array.from({ length: 40 }, (_, i) => 'Baris ' + (i + 1) + ' dari pesan panjang untuk menguji pelipatan.').join('\\n');
    ai.getState().newChat('');
    await tunggu(300);
    const id = ai.getState().activeIds[''];
    out.id = id;
    ai.setState({ sessions: ai.getState().sessions.map((x) => x.id === id ? { ...x, messages: [{ id: 'uji-a4-1', role: 'user', content: panjang, at: Date.now() }] } : x) });
    await tunggu(1200);
    out.jumlah = ai.getState().sessions.find((x) => x.id === id)?.messages.length ?? -1;
    out.kosong = !!document.querySelector('[data-testid="ai-panel"].is-kosong');
    const box = document.querySelector('[data-testid="ai-user-msg"]');
    out.adaBubble = !!box;
    out.ringkas = box?.getAttribute('data-ringkas') ?? null;
    const btn = document.querySelector('[data-testid="ai-user-msg-toggle"]');
    out.labelAwal = btn?.textContent ?? null;
    const p = box?.querySelector('p');
    out.tinggiTertutup = p ? Math.round(p.getBoundingClientRect().height) : null;
    out.scrollTertutup = p ? p.scrollHeight : null;
    btn?.click();
    await tunggu(400);
    out.ringkasSesudah = document.querySelector('[data-testid="ai-user-msg"]')?.getAttribute('data-ringkas') ?? null;
    out.labelSesudah = document.querySelector('[data-testid="ai-user-msg-toggle"]')?.textContent ?? null;
    const p2 = document.querySelector('[data-testid="ai-user-msg"] p');
    out.tinggiTerbuka = p2 ? Math.round(p2.getBoundingClientRect().height) : null;
  } catch (e) { out.err = String(e && e.stack || e); }
  window.__UJI_A4C__ = { status: 'selesai', out };
})();`,
  30000,
);
await new Promise((r) => setTimeout(r, 6000));
const res = await cdp.json(`return JSON.stringify(window.__UJI_A4C__);`, 20000);
console.log(res);
keluarBersih(0);
