import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // semua tombol primary di halaman
  out.primary = [...document.querySelectorAll('.btn-primary')].map((e) => {
    const cs = getComputedStyle(e);
    const rc = e.getBoundingClientRect();
    return {
      text: e.textContent.trim().slice(0, 20),
      color: cs.color,
      bg: cs.backgroundColor,
      w: Math.round(rc.width),
      h: Math.round(rc.height),
      visible: rc.width > 0 && rc.height > 0,
    };
  });
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
