import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  const setui = window.__ZEPHYR_SETUI__;
  const sub = window.__ZEPHYR_SUB__;

  st.setActivity('settings');
  st.setSettingsOpen(true);
  await wait(1400);
  setui.setSection('subagent');
  await wait(2400);

  const kartu = q('[data-testid="sub-custom-card"]');
  const out = {
    section: setui.section(),
    kartuAda: !!kartu,
    kartuTeks: kartu ? kartu.textContent.replace(/\\s+/g,' ').slice(0, 180) : null,
    testidSub: qa('[data-testid^="sub-"]').map(e => e.getAttribute('data-testid')).slice(0, 14),
  };

  // buka dialog Edit lewat bridge (store yang sama dengan komponen)
  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1600);

  const back = q('.modal-backdrop');
  out.setelahBuka = {
    sunting: sub.sunting(),
    backdrop: !!back,
    dialog: !!q('.subagent-modal'),
    judul: q('.subagent-modal .modal-title')?.textContent ?? null,
  };
  if (back) {
    const zB = Number(getComputedStyle(back).zIndex);
    const menu = q('.sub-daftar-menu');
    const zM = menu ? Number(getComputedStyle(menu).zIndex) : -1;
    const rc = back.getBoundingClientRect();
    const el = document.elementFromPoint(rc.width / 2, rc.height / 2);
    out.z = { backdrop: zB, menuAI: zM, diAtas: zB > zM };
    out.tengahDiModal = el ? !!el.closest('.modal-backdrop') : null;
  }
  return out;
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
if (r.afterBackdrop !== false) {
  const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('D:/Zephyr/shot-sub-modal.png', Buffer.from(sh.result.data, 'base64'));
  console.log('shot-sub-modal.png');
}
cdp.close();
