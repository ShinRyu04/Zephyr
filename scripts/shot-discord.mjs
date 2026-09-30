import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223', { timeoutMs: 60000 });
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  await st.setSettingsOpen(true);
  await wait(250);
  window.__ZEPHYR_SETUI__?.setSection?.('about');
  await wait(1400);
  const btn = q('[data-testid="about-discord"]');
  if (!btn) return null;
  btn.scrollIntoView({ block: 'center' });
  await wait(500);
  const rc = btn.getBoundingClientRect();
  return { x: Math.round(rc.x), y: Math.round(rc.y), w: Math.round(rc.width), h: Math.round(rc.height) };
`,
  60000,
);
if (r) {
  // crop sekeliling tombol supaya ada konteks
  const clip = {
    x: Math.max(0, r.x - 40),
    y: Math.max(0, r.y - 60),
    width: Math.min(700, r.w + 120),
    height: r.h + 130,
    scale: 2,
  };
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip });
  const data = shot?.result?.data ?? shot?.data;
  if (!data) {
    console.log('gagal:', JSON.stringify(shot).slice(0, 200));
  } else {
    writeFileSync('D:/Zephyr/shot-discord.png', Buffer.from(data, 'base64'));
    console.log('ok', JSON.stringify(clip));
  }
}
cdp.close();
