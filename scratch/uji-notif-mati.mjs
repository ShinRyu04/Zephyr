import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');

const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

const setSaklar = async (id, nyala) => {
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

/* Turn sound OFF through the switch, then read the store directly. */
await setSaklar('agx-conv-notif-sound', false);

const hasil = await j(`
  const store = await import('/src/lib/store.ts');
  const n = await import('/src/lib/notifikasiAi.ts');
  const conv = store.useStore.getState().settings.conversation;
  const sebelum = n.riwayatBunyiNotif().length;
  n.catatMulaiRun('cek-mati', Date.now() - 60000);
  n.catatSelesaiRun('cek-mati', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,300));
  const sesudah = n.riwayatBunyiNotif();
  return {
    notifSoundDiStore: conv.notifSound,
    notifBannerDiStore: conv.notifBanner,
    sebelum,
    sesudahJumlah: sesudah.length,
    entriBaru: sesudah.length > sebelum ? sesudah.at(-1) : null,
  };
`);

console.log(JSON.stringify(hasil, null, 1));
c.close();
process.exit(0);
