import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  st.setActivity('settings'); await wait(1500);

  // buka section advanced/subagents kalau perlu
  const tabs = qa('[data-testid^="set-tab"], .set-nav button, .settings-nav button');
  const adv = tabs.find(t => /advanc|lanjut|subagent/i.test(t.textContent || ''));
  if (adv) { adv.click(); await wait(1200); }

  const sc = await import('/src/lib/subagentCustom.ts');
  const d = sc.useSubagentCustom.getState().daftar;
  if (d.length) sc.useSubagentCustom.getState().bukaSunting(d[0].id);
  await wait(1800);

  const back = q('.modal-backdrop');
  const menu = q('.sub-daftar-menu');
  const zB = back ? getComputedStyle(back).zIndex : 'TIDAK ADA';
  const zM = menu ? getComputedStyle(menu).zIndex : 'tidak terbuka';

  let diDalamModal = null;
  if (back) {
    const rc = back.getBoundingClientRect();
    const el = document.elementFromPoint(rc.width / 2, rc.height / 2);
    diDalamModal = el ? !!el.closest('.modal-backdrop') : null;
  }

  return {
    modalTerbuka: !!back,
    zBackdrop: zB,
    zMenuAI: zM,
    atasMenuAI: zB !== 'TIDAK ADA' && (zM === 'tidak terbuka' || Number(zB) > Number(zM)),
    elemenTengahDiDalamModal: diDalamModal,
    judulModal: q('.subagent-modal .modal-title')?.textContent ?? null,
  };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
