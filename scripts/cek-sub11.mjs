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

  // ── item 4: panduan persona (section 'agents')
  setui.setSection('agents');
  await wait(2000);
  const cara = q('[data-testid="persona-cara"]');
  const out = {
    panutanPersona: cara ? cara.textContent.trim().slice(0, 90) : null,
    panutanTampilBlok: cara ? getComputedStyle(cara).display : null,
  };

  // ── item 3: ikon robot di picker
  setui.setSection('subagent');
  await wait(1800);
  const btnRobot = q('[data-testid="sc-ikon-robot"]');
  out.item3 = {
    pickerAdaRobot: !!btnRobot,
    jumlahIkon: qa('[data-testid^="sc-ikon-"]').length,
  };

  // ── item 1+2: dialog Edit di depan, tidak ketimpa
  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1600);
  const back = q('.modal-backdrop');
  out.item12 = { backdrop: !!back, dialog: !!q('.subagent-modal') };
  if (back) {
    const zB = Number(getComputedStyle(back).zIndex);
    const rc = back.getBoundingClientRect();
    const el = document.elementFromPoint(rc.width / 2, rc.height / 2);
    out.item12.zBackdrop = zB;
    out.item12.tengahDiModal = el ? !!el.closest('.modal-backdrop') : null;
    const robotTerpilih = q('[data-testid="sc-ikon-robot"]');
    out.item12.ikonTerpilih = robotTerpilih ? robotTerpilih.getAttribute('data-ikon') : null;
  }
  return out;
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-sub-final.png', Buffer.from(sh.result.data, 'base64'));
console.log('shot-sub-final.png');
cdp.close();
