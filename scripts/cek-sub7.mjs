import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const sub = window.__ZEPHYR_SUB__;
  const st = window.__ZEPHYR__.getState();
  st.setActivity('settings'); await wait(1200);

  const su = await import('/src/lib/settingsStore.ts');
  su.useSettingsUi.getState().setSection('subagent');
  await wait(1800);

  const sebelum = { sunting: sub.sunting(), section: su.useSettingsUi.getState().section, act: window.__ZEPHYR__.getState().activity };
  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1500);
  const sesudah = { sunting: sub.sunting(), act: window.__ZEPHYR__.getState().activity };

  // cari elemen apa saja di halaman settings
  const sec = q('.subagent-section, [data-section="subagent"]');
  const teksSection = sec ? sec.textContent.slice(0, 120) : null;
  const tmpatSunting = qa('[data-testid^="sc-"]').map(e => e.getAttribute('data-testid')).slice(0, 12);

  return { sebelum, sesudah, daftar: d.length, teksSection, tmpatSunting, adaBackdrop: !!q('.modal-backdrop') };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
