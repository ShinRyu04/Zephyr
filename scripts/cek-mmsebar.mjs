import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const cv = q('[data-testid="minimap-canvas"]');
  if (!cv) return out;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  // bagi jadi 10 pita vertikal, hitung warna unik per pita (alpha tinggi saja)
  const pita = 10;
  const tinggiPita = Math.floor(cv.height / pita);
  out.perPita = [];
  for (let p = 0; p < pita; p++) {
    const set = new Set();
    for (let y = p * tinggiPita; y < (p + 1) * tinggiPita; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (d[i+3] < 200) continue;
        set.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
      }
    }
    out.perPita.push(set.size);
  }
  out.total = out.perPita.reduce((a,b) => a+b, 0);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
