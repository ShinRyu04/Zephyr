import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const ic = await import('/src/lib/peranIcons.ts');
  const sama = ic.pathIkonPeran('custom') === ic.IKON_KUSTOM;
  const cariSama = ic.pathIkonPeran('cari') === ic.IKON_KUSTOM;
  const adaRobot = ic.IKON_KUSTOM.includes('M8 2.2');

  // buka modal Edit sub-agent dengan AI panel aktif
  const st = window.__ZEPHYR__.getState();
  st.setActivity('ai'); await wait(1200);

  const sc = await import('/src/lib/subagentCustom.ts');
  sc.useSubagentCustom.getState().muat();
  await wait(400);
  const d = sc.useSubagentCustom.getState().daftar;
  if (d.length) sc.useSubagentCustom.getState().bukaSunting(d[0].id);
  await wait(1600);

  const back = q('.modal-backdrop');
  const menu = q('.sub-daftar-menu');
  const zB = back ? getComputedStyle(back).zIndex : 'TIDAK ADA';
  const zM = menu ? getComputedStyle(menu).zIndex : 'tidak terbuka';

  // bandingkan rect: apakah modal benar-benar di atas?
  const rectB = back ? back.getBoundingClientRect() : null;
  const elAt = rectB ? document.elementFromPoint(rectB.width / 2, rectB.height / 2) : null;
  const diDalamModal = elAt ? !!elAt.closest('.modal-backdrop') : null;

  return {
    pathCustomSamaDenganIkon: sama,
    pathCariSamaDenganRobot: cariSama,
    adaBentukRobot: adaRobot,
    modalTerbuka: !!back,
    zBackdrop: zB,
    zMenuAI: zM,
    elemenTengahLayarDiDalamModal: diDalamModal,
    daftarCustom: d.length,
  };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
