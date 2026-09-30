import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('extensions'); await wait(1500);
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1500); }
  const out = { adaAtributDari: 0, dariKatalog: [], dariGambar: [] };
  const cards = qa('[data-ext-card]').slice(0, 40);
  for (const c of cards) {
    const el = c.querySelector('[data-dari="katalog"]');
    if (el) { out.adaAtributDari += 1; out.dariKatalog.push(el.getAttribute('data-ikon')); }
    else {
      const g = c.querySelector('.xc-gambar, .xc-inisial');
      if (g) out.dariGambar.push(g.getAttribute('data-ikon'));
    }
  }
  return out;
`,
  90000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
