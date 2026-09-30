import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const sub = window.__ZEPHYR_SUB__;
  const st = window.__ZEPHYR__.getState();
  st.setActivity('settings');
  st.setSettingsOpen(true);
  await wait(1600);
  const su = await import('/src/lib/settingsStore.ts');
  su.useSettingsUi.getState().setSection('subagent');
  await wait(2200);

  const out = {
    act: window.__ZEPHYR__.getState().activity,
    open: window.__ZEPHYR__.getState().settingsOpen,
    section: su.useSettingsUi.getState().section,
  };

  // apa yang benar-benar ada di DOM
  out.tombolNew = !!q('[data-testid="sub-custom-new"]');
  out.kartu = !!q('[data-testid="sub-custom-card"]');
  out.navItem = qa('.set-nav-item').map(e => (e.textContent||'').trim().slice(0,22)).slice(0, 14);
  out.jumlahTestidSub = qa('[data-testid^="sub-"]').map(e => e.getAttribute('data-testid'));
  out.adaSetPage = qa('.set-page, .settings-page, .set-body, .settings').length;
  out.kelasUtama = qa('.workspace > *').map(e => e.className.toString().slice(0,34)).slice(0, 6);

  // paksa buka via store, lalu cek DOM
  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1500);
  out.setelahBuka = { sunting: sub.sunting(), backdrop: !!q('.modal-backdrop'), dialog: !!q('.subagent-modal') };

  // tombol sunting di kartu
  const btnEdit = q('[data-testid^="sub-custom-edit"], [data-testid*="sunting"]');
  out.tombolSunting = btnEdit ? btnEdit.getAttribute('data-testid') : null;

  return out;
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
