import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const rc = await cdp.runAsync(`
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(3500);
  }
  st.setActivity('terminal'); await wait(1500);
  const el = q('.sidebar');
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.min(700, Math.round(r.height)) };
`, 90000);
const sh = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...rc, scale: 1 } });
writeFileSync('D:/Zephyr/side-term.png', Buffer.from(sh.result.data, 'base64'));
console.log(JSON.stringify(rc));
cdp.close();
