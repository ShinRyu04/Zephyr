import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1500); }
  const c = q('[data-ext-card="zephyr.lang-elm"]');
  if (!c) return {found: false};
  const logo = c.querySelector('.xc-logo');
  return {
    found: true,
    html: logo ? logo.innerHTML.slice(0, 400) : null,
    kelas: logo ? logo.className : null,
  };
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
