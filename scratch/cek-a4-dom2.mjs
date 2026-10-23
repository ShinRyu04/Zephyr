// Uji A4: buka chat lewat UI/aksi sah, kirim pesan panjang, cek toggle.
import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.json(
  `window.__UJI_A4__ = { status: 'jalan', out: null };
   (async () => {
  const out = {};
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const ai = (await import('/src/lib/aiStore.ts')).useAi;
    const s = (await import('/src/lib/store.ts')).useStore;
    const st0 = ai.getState();
    out.kunci = Object.keys(st0).filter((k) => /chat|session|active|composer|draft/i.test(k));
    out.adaNewChat = typeof st0.newChat;
    out.adaSend = typeof st0.send;
    if (st0.newChat) st0.newChat('');
    await tunggu(400);
    out.activeSetelahNew = ai.getState().activeIds?.[''] ?? null;
    const panjang = Array.from({ length: 40 }, (_, i) => 'Baris ' + (i + 1) + ' dari pesan panjang yang dipakai untuk menguji pelipatan.').join('\\n');
    ai.setState({
      sessions: ai.getState().sessions.map((x) => x.id === (ai.getState().activeIds?.[''] ?? null) ? { ...x, messages: [{ id: 'uji-a4-1', role: 'user', content: panjang, at: Date.now() }] } : x),
    });
    s.getState().setSettingsOpen(false);
    await tunggu(1200);
    out.jumlahPesan = ai.getState().sessions.find((x) => x.id === ai.getState().activeIds[''])?.messages.length ?? -1;
    out.kosong = !!document.querySelector('[data-testid="ai-panel"].is-kosong');
    const box = document.querySelector('[data-testid="ai-user-msg"]');
    out.adaBubble = !!box;
    out.ringkas = box?.getAttribute('data-ringkas') ?? null;
    const btn = document.querySelector('[data-testid="ai-user-msg-toggle"]');
    out.labelAwal = btn?.textContent ?? null;
    const p = box?.querySelector('p');
    out.tinggiTertutup = p ? Math.round(p.getBoundingClientRect().height) : null;
    btn?.click();
    await tunggu(400);
    out.ringkasSesudah = document.querySelector('[data-testid="ai-user-msg"]')?.getAttribute('data-ringkas') ?? null;
    out.labelSesudah = document.querySelector('[data-testid="ai-user-msg-toggle"]')?.textContent ?? null;
    const p2 = document.querySelector('[data-testid="ai-user-msg"] p');
    out.tinggiTerbuka = p2 ? Math.round(p2.getBoundingClientRect().height) : null;
  } catch (e) {
    out.err = String(e && e.stack || e);
  }
  window.__UJI_A4__ = { status: 'selesai', out };
})();`,
  30000,
);

await new Promise((r) => setTimeout(r, 6000));
const r = await cdp.json(`return JSON.stringify(window.__UJI_A4__ ?? { status: 'hilang' });`, 20000);
console.log(r);
keluarBersih(0);
