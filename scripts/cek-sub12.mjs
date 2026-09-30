import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  const setui = window.__ZEPHYR_SETUI__;
  const sub = window.__ZEPHYR_SUB__;

  st.setActivity('settings'); st.setSettingsOpen(true); await wait(1300);
  setui.setSection('subagent'); await wait(1800);

  const d = sub.daftar();
  if (d.length) sub.bukaSunting(d[0].id);
  await wait(1800);

  const btns = qa('[data-testid^="sc-ikon-"]');
  const robot = q('[data-testid="sc-ikon-robot"]');
  const umum  = q('[data-testid="sc-ikon-umum"]');
  return {
    dialog: !!q('.subagent-modal'),
    jumlahIkon: btns.length,
    idSemua: btns.map(b => b.getAttribute('data-ikon')),
    adaRobot: !!robot,
    adaUmum: !!umum,
    labelTerpilih: (q('.subagent-ikon-pilih')?.parentElement?.textContent || '').replace(/\\s+/g,' ').slice(-60),
    svgRobot: robot ? robot.querySelector('path')?.getAttribute('d')?.slice(0, 50) : null,
    svgUmum:  umum  ? umum.querySelector('path')?.getAttribute('d')?.slice(0, 50) : null,
  };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
