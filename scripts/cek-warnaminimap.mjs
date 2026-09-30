import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  out.viteErr = !!q('#vite-error-overlay');
  const st = window.__ZEPHYR__.getState();
  const cur = JSON.parse(JSON.stringify(st.settings.editor));
  cur.minimap = true; cur.extras = true;
  await st.applySettings({ editor: cur });
  await wait(1500);
  await window.__ZEPHYR__.getState().openPathAt('D:' + BS + 'Zephyr' + BS + 'src' + BS + 'lib' + BS + 'aiStore.ts', 1);
  await wait(3500);
  const mm = q('[data-testid="minimap"]');
  out.minimapAda = !!mm;
  // baca piksel canvas: berapa warna unik?
  const cv = q('[data-testid="minimap-canvas"]');
  out.canvasAda = !!cv;
  if (cv) {
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const ctx = c2.getContext('2d');
    ctx.drawImage(cv, 0, 0);
    const d = ctx.getImageData(0, 0, Math.min(cv.width, 84), Math.min(cv.height, 400)).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 20) continue;
      set.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
    }
    out.canvasSize = cv.width + 'x' + cv.height;
    out.warnaUnik = set.size;
    out.contohWarna = [...set].slice(0, 8);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-mm-warna.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
