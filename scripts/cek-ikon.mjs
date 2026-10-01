import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = { kartu: [], warnaUnik: new Set(), chip: 0, gambar: 0, img: 0 };
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('extensions');
  await wait(2000);
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1500); }
  const rows = qa('[data-ext-card]').slice(0, 30);
  for (const c of rows) {
    const chip = c.querySelector('.xc-inisial');
    const gbr = c.querySelector('.xc-gambar');
    if (chip) out.chip += 1;
    if (gbr) out.gambar += 1;
    if (c.querySelector('.xc-logo img')) out.img += 1;
    const svg = gbr?.querySelector('svg');
    const fill = svg?.querySelector('[fill]')?.getAttribute('fill') ?? null;
    out.kartu.push({
      id: c.getAttribute('data-ext-card'),
      jenis: chip ? 'chip' : 'svg',
      ikon: (gbr ?? chip)?.getAttribute('data-ikon') ?? null,
      teks: chip ? chip.textContent : null,
      fill,
    });
    if (fill) out.warnaUnik.add(fill);
  }
  out.warnaUnik = [...out.warnaUnik];
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
