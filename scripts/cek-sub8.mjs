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
  await wait(2000);

  const kartu = q('[data-testid="sub-custom-card"]');
  const semuaTestid = qa('[data-testid]').map(e => e.getAttribute('data-testid')).slice(0, 20);
  const h1 = qa('h2,h3,.set-title,.set-section-title').map(e => e.textContent.trim().slice(0,30)).slice(0, 8);

  return {
    kartuAda: !!kartu,
    kartuTeks: kartu ? kartu.textContent.replace(/\\s+/g,' ').slice(0, 200) : null,
    testid: semuaTestid,
    judul: h1,
    isiSettings: q('.settings, .set-page, .set-body') ? 'ada' : 'tidak',
  };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
