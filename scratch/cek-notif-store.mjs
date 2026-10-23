import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(
  `const mod = await import('/src/lib/store.ts');
   return JSON.stringify({
     kunci: Object.keys(mod),
     jumlah: mod.useStore.getState().settings.conversation ? Object.keys(mod.useStore.getState().settings.conversation).filter((k) => /notif/i.test(k)) : null,
     panjangRiwayat: (await import('/src/lib/notifikasiAi.ts')).riwayatNotifikasi().length,
   });`,
  20000,
);
console.log(r);
keluarBersih(0);
