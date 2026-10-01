import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const st = window.__ZEPHYR__.getState();
  st.setActivity('extensions');
  await wait(2000);
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1500); }
  const rows = qa('[data-ext-card]').slice(0, 30);
  const out = [];
  for (const c of rows) {
    const img = c.querySelector('.xc-logo img');
    if (!img) continue;
    const src = img.getAttribute('src') || '';
    out.push({
      id: c.getAttribute('data-ext-card'),
      cls: c.querySelector('.xc-logo')?.className,
      srcDepan: src.slice(0, 40),
      warna: getComputedStyle(c.querySelector('.xc-logo')).backgroundColor,
    });
    if (out.length >= 3) break;
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
