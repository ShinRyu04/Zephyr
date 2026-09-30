import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(700).from).top;
  await wait(2000);
  const el = q('.cm-scroller');
  const rc = el.getBoundingClientRect();
  return { x: Math.round(rc.left), y: Math.round(rc.top), w: 700, h: 340 };
`, 90000);
console.log(JSON.stringify(r));
const sh = await cdp.send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 },
});
writeFileSync('D:/Zephyr/shot-crop-bracket.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
