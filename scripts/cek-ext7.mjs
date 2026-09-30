import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('extensions');
  await wait(2000);
  const tMkt = q('[data-testid="ext-tab-marketplace"]');
  if (tMkt) { tMkt.click(); await wait(1200); }

  const tabs = qa('.xv-tab');
  out.tab = tabs.map((t) => ({
    nama: (t.textContent || '').trim(),
    aktif: t.getAttribute('aria-selected'),
    bg: getComputedStyle(t).backgroundColor,
  }));
  const box = q('.xv-tabs');
  if (box) {
    const cs = getComputedStyle(box);
    out.kontainer = {
      bg: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      radius: cs.borderTopLeftRadius,
    };
  }
  out.kartu = qa('[data-ext-card]').length;
  out.badgePub = qa('.xc-pub-badge').length;
  out.badgeVer = qa('.xc-ver-badge').length;
  out.badgeCat = qa('.xc-cat-badge').length;
  out.offline = qa('.xc-tag').length;

  const el = q('.sidebar');
  const rc = el.getBoundingClientRect();
  out.clip = { x: Math.round(rc.left)+2, y: Math.round(rc.top)+2, width: Math.round(rc.width)-4, height: Math.min(620, Math.round(rc.height)-4) };
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
if (r.clip) {
  const sh = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...r.clip, scale: 2 } });
  writeFileSync('D:/Zephyr/side-ext.png', Buffer.from(sh.result.data, 'base64'));
}
cdp.close();
