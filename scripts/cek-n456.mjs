import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};

  // N6: minimap
  const mm = q('.cm-minimap, [data-testid="minimap"], .minimap');
  out.minimapAda = !!mm;
  if (mm) {
    const cs = getComputedStyle(mm);
    out.mmW = Math.round(mm.getBoundingClientRect().width);
    out.mmTop = Math.round(mm.getBoundingClientRect().top);
    out.mmHeight = Math.round(mm.getBoundingClientRect().height);
    out.mmOverflow = cs.overflow;
  }
  // cari semua elemen bernama minimap
  out.kandidat = [...document.querySelectorAll('[class*=minimap]')].map(e => e.className).slice(0, 5);

  // N5: autocomplete popup
  const ac = q('.cm-tooltip-autocomplete');
  out.acAda = !!ac;
  if (ac) {
    const r2 = ac.getBoundingClientRect();
    out.acPos = Math.round(r2.left) + ',' + Math.round(r2.top);
    out.acSize = Math.round(r2.width) + 'x' + Math.round(r2.height);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
