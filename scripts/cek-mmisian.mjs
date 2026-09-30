import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // debug lewat canvas: hitung berapa baris piksel yang punya isi
  const cv = q('[data-testid="minimap-canvas"]');
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let barisIsi = 0, maxY = 0;
  for (let y = 0; y < cv.height; y++) {
    let ada = false;
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i+3] > 40) { ada = true; break; }
    }
    if (ada) { barisIsi++; maxY = y; }
  }
  out.canvasH = cv.height;
  out.barisPikselIsi = barisIsi;
  out.maxY = maxY;
  out.persenTerisi = Math.round((maxY / cv.height) * 100) + '%';

  // berapa baris dokumen?
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.totalBaris = v.state.doc.lines;

  // host tinggi
  const host = q('[data-testid="minimap"]');
  out.tinggiHost = Math.round(host.getBoundingClientRect().height);
  out.dpr = window.devicePixelRatio;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
