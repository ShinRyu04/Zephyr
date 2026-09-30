import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const bs = window.__ZEPHYR__;
  const st = bs.getState();

  // 1. roster custom harus terisi dari file, bukan dari store kosong
  const mod = await import('/src/lib/subagentCustom.ts');
  const pekerja = mod.daftarPekerja();
  const kustom = pekerja.filter(p => p.custom);

  // 2. ikon robot untuk custom
  const ic = await import('/src/lib/peranIcons.ts');
  const robot = ic.IKON_KUSTOM.slice(0, 40);
  const cari = ic.pathIkonPeran('cari').slice(0, 30);
  const bCustom = ic.pathIkonPeran('custom').slice(0, 30);

  // 3. modal vs AI panel z-index
  const back = q('.modal-backdrop');
  const menu = q('.sub-daftar-menu');
  const zBack = back ? getComputedStyle(back).zIndex : null;
  const zMenu = menu ? getComputedStyle(menu).zIndex : null;

  return {
    totalPekerja: pekerja.length,
    kustom: kustom.map(k => ({ label: k.label, ikon: k.ikon, hint: k.hint })),
    robotSama: bCustom === robot,
    cariBeda: cari !== bCustom,
    zBackdrop: zBack,
    zMenuAI: zMenu,
    modalDiAtas: zBack !== null && (zMenu === null || Number(zBack) > Number(zMenu)),
  };
`,
  90000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
