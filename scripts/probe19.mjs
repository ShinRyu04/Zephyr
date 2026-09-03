// probe19.mjs — bukti awal fase 19 dari app hidup, sebelum harness penuh.
import { Cdp } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const r = await cdp.json(
  `
  const out = {};
  out.bridgeAda = typeof E19;
  if (typeof E19 !== 'object') return JSON.stringify(out);

  // Panel di sidebar KIRI + ikon activity bar
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('extensions');
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  await wait(700);
  out.ikonAda = !!q('[data-activity="extensions"]');
  out.panelAda = !!q('[data-testid="extensions-view"]');
  out.tabAda = qa('.xv-tab').length;
  out.kartu = qa('[data-ext-card]').length;

  // Katalog bundled → install satu tema
  await E19.refresh();
  await wait(600);
  out.sebelum = E19.terpasang().map((x) => x.id);

  const ok = await E19.installKatalog('zephyr.tema-senja');
  out.installOk = ok;
  await wait(1200);
  out.sesudah = E19.terpasang().map((x) => x.id);
  out.ringkasan = E19.ringkasan();
  out.themesEkstensi = E19.themesEkstensi();
  out.semuaTema = E19.semuaTema();

  return JSON.stringify(out);
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
await cdp.close();
