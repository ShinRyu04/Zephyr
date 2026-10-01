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
  const z = q('.cm-zbr-4');
  if (!z) return { err: 'tidak ada' };
  const rc = z.getBoundingClientRect();
  return { x: Math.round(rc.left), y: Math.round(rc.top), w: Math.round(rc.width), h: Math.round(rc.height),
           warna: getComputedStyle(z).color };
`, 90000);
console.log(JSON.stringify(r));
const sh = await cdp.send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: r.x - 260, y: r.y - 60, width: 640, height: 200, scale: 3 },
});
writeFileSync('D:/Zephyr/shot-zoom-bracket.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
