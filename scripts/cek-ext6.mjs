import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const EXX = window.__ZEPHYR_EXT19__;

  // Tab RECOMMENDED
  EXX.state().setTab('recommended');
  await wait(1800);
  out.recommended = {
    tab: EXX.state().tab,
    hasil: EXX.state().hasil().length,
    kartu: qa('[data-ext-card]').length,
    kosong: (q('[data-testid="ext-rec-empty"]') || {}).textContent || null,
  };

  // Tab MARKETPLACE
  EXX.state().setTab('marketplace');
  await wait(1800);
  out.marketplace = {
    tab: EXX.state().tab,
    hasil: EXX.state().hasil().length,
    kartu: qa('[data-ext-card]').length,
    filter: !!q('[data-testid="ext-filter"]'),
  };
  out.namaKartu = qa('[data-ext-card]').slice(0, 5).map((e) => {
    const t = e.querySelector('*');
    return e.getAttribute('data-ext-card');
  });

  // Tab INSTALLED
  EXX.state().setTab('installed');
  await wait(1200);
  out.installed = {
    hasil: EXX.state().hasil().length,
    kosong: (q('[data-testid="ext-kosong"]') || {}).textContent || null,
  };
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ext-mkt.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
