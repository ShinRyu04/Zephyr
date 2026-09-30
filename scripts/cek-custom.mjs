import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  // Baca settings file lewat jembatan store, bukan baca langsung.
  const mod = await import('/src/lib/subagentCustom.ts');
  const daftar = mod.bacaDaftar();
  const aktif = mod.customAktif();
  const pekerja = mod.daftarPekerja();
  return {
    total: daftar.length,
    aktif: aktif.length,
    nama: daftar.map(d => ({ id: d.id, nama: d.nama, aktif: d.aktif, alat: (d.alat||[]).length })),
    pekerja: pekerja.filter(p => p.custom).map(p => ({ label: p.label, ikon: p.ikon })),
  };
`,
  90000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
