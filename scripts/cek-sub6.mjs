import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const sub = window.__ZEPHYR_SUB__;
  if (!sub) return { bridge: 'TIDAK ADA' };

  const st = window.__ZEPHYR__.getState();

  // 1. roster custom, lewat bridge (store hidup)
  sub.muat(); await wait(400);
  const pekerja = sub.pekerja();
  const kustom = pekerja.filter(p => p.custom);

  // 2. ikon robot vs peran
  const robot = sub.ikonPeran('custom');
  const cari  = sub.ikonPeran('cari');

  // 3. buka dialog Edit sub-agent DI ATAS AI panel
  st.setActivity('settings');
  st.setSettingsOpen(true);
  await wait(1400);
  const su = await import('/src/lib/settingsStore.ts');
  su.useSettingsUi.getState().setSection('subagent');
  await wait(1800);
  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1800);

  const back = q('.modal-backdrop');
  const zB = back ? getComputedStyle(back).zIndex : 'TIDAK ADA';

  let atas = null, tengahDiModal = null;
  if (back) {
    const rc = back.getBoundingClientRect();
    const el = document.elementFromPoint(rc.width / 2, rc.height / 2);
    tengahDiModal = el ? !!el.closest('.modal-backdrop') : null;
    const menu = q('.sub-daftar-menu');
    const zM = menu ? Number(getComputedStyle(menu).zIndex) : -1;
    atas = Number(getComputedStyle(back).zIndex) > zM;
  }

  return {
    bridge: 'ok',
    totalPekerja: pekerja.length,
    kustom: kustom.map(k => ({ label: k.label, ikon: k.ikon })),
    robotBedaDariCari: robot !== cari,
    robotAdaBentuk: robot.includes('M8 2.2'),
    dialogTerbuka: !!back,
    zBackdrop: zB,
    diAtasMenuAI: atas,
    tengahLayarDiDalamModal: tengahDiModal,
    judul: q('.subagent-modal .modal-title')?.textContent ?? null,
    namaDiForm: q('.subagent-modal input')?.value ?? null,
  };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
