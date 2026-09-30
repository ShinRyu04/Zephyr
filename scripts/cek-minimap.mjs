import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // nyalakan minimap
  const st = window.__ZEPHYR__.getState();
  out.minimapAktifSetting = st.settings?.editor?.minimap ?? null;
  await wait(500);
  const mm = q('[data-testid="minimap"]');
  out.minimapAda = !!mm;
  if (mm) {
    const rc = mm.getBoundingClientRect();
    const host = mm.parentElement ? mm.parentElement.getBoundingClientRect() : null;
    out.mm = Math.round(rc.width) + 'x' + Math.round(rc.height) + ' @' + Math.round(rc.top);
    out.host = host ? Math.round(host.width) + 'x' + Math.round(host.height) + ' @' + Math.round(host.top) : null;
    out.sejajar = host ? Math.abs(rc.top - host.top) < 3 : null;
    out.mmBottom = Math.round(rc.bottom);
    out.hostBottom = host ? Math.round(host.bottom) : null;
    out.penuh = host ? Math.abs(rc.bottom - host.bottom) < 3 : null;
    const cv = q('[data-testid="minimap-canvas"]');
    out.canvas = cv ? Math.round(cv.getBoundingClientRect().height) : null;
    out.canvasAttr = cv ? (cv.getAttribute('height') + 'x' + cv.getAttribute('width')) : null;
  }
  out.extras = st.settings?.editor?.extras ?? null;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-minimap.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
