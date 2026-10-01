import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  // nyalakan minimap via settings
  const cur = JSON.parse(JSON.stringify(st.settings.editor));
  cur.minimap = true;
  cur.extras = true;
  await st.applySettings({ editor: cur });
  await wait(2000);
  const st2 = window.__ZEPHYR__.getState();
  out.sekarang = st2.settings.editor.minimap;
  out.extras = st2.settings.editor.extras;

  const mm = q('[data-testid="minimap"]');
  out.minimapAda = !!mm;
  if (mm) {
    const rc = mm.getBoundingClientRect();
    const host = mm.parentElement.getBoundingClientRect();
    out.mm = Math.round(rc.width) + 'x' + Math.round(rc.height) + ' @top' + Math.round(rc.top);
    out.host = Math.round(host.width) + 'x' + Math.round(host.height) + ' @top' + Math.round(host.top);
    out.sejajarAtas = Math.abs(rc.top - host.top) < 3;
    out.penuhBawah = Math.abs(rc.bottom - host.bottom) < 3;
    const cv = q('[data-testid="minimap-canvas"]');
    out.canvasH = cv ? Math.round(cv.getBoundingClientRect().height) : null;
    out.canvasAttr = cv ? cv.getAttribute('height') : null;
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-minimap2.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
