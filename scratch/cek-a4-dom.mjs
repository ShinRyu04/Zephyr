// Uji perilaku Nyata PesanUser: pesan panjang -> terlipat, tombol membuka/menutup.
import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.json(
  `window.__UJI_A4__ = { status: 'jalan', out: null };
   (async () => {
  const out = {};
  try {
    const ai = (await import('/src/lib/aiStore.ts')).useAi;
    const s = (await import('/src/lib/store.ts')).useStore;
    const st = ai.getState();
    const panjang = Array.from({ length: 40 }, (_, i) => 'Baris ' + (i + 1) + ' dari pesan panjang yang dipakai untuk menguji pelipatan.').join('\\n');
    const pesan = { id: 'uji-a4-1', role: 'user', content: panjang, at: Date.now() };
    let sesi = st.sessions.find((x) => Array.isArray(x.messages));
    out.jumlahSesi = st.sessions.length;
    if (!sesi) {
      sesi = { id: 'uji-sesi-a4', title: 'Uji A4', messages: [pesan], createdAt: Date.now() };
      ai.setState({ sessions: [...st.sessions, sesi], activeId: sesi.id, activeIds: { ...st.activeIds, '': sesi.id } });
    } else {
      ai.setState({
        sessions: st.sessions.map((x) => (x.id === sesi.id ? { ...x, messages: [pesan] } : x)),
        activeId: sesi.id,
        activeIds: { ...st.activeIds, '': sesi.id },
      });
    }
    s.getState().setSettingsOpen(false);
    await new Promise((r) => setTimeout(r, 1500));
    out.activeId = ai.getState().activeIds[''] ?? null;
    out.kosong = !!document.querySelector('[data-testid="ai-panel"].is-kosong');
    const box = document.querySelector('[data-testid="ai-user-msg"]');
    out.adaBubble = !!box;
    out.ringkas = box?.getAttribute('data-ringkas') ?? null;
    const btn = document.querySelector('[data-testid="ai-user-msg-toggle"]');
    out.labelAwal = btn?.textContent ?? null;
    const p = box?.querySelector('p');
    out.tinggiTertutup = p ? Math.round(p.getBoundingClientRect().height) : null;
    btn?.click();
    await new Promise((r) => setTimeout(r, 500));
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

await new Promise((r) => setTimeout(r, 5000));
const r = await cdp.json(`return JSON.stringify(window.__UJI_A4__ ?? { status: 'hilang' });`, 20000);
console.log(r);
keluarBersih(0);
