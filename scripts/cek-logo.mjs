import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const st = window.__ZEPHYR__.getState();
  st.setActivity('terminal');
  await wait(1600);
  const el = q('.sidebar');
  const rc = el.getBoundingClientRect();
  return { x: Math.round(rc.left), y: Math.round(rc.top), width: Math.round(rc.width), height: Math.round(rc.height) };
`, 60000);
const sh = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...r, height: Math.min(520, r.height), scale: 2 } });
writeFileSync('D:/Zephyr/side-term2.png', Buffer.from(sh.result.data, 'base64'));
console.log('ok', JSON.stringify(r));
cdp.close();
