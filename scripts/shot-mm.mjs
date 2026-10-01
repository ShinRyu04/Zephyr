import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  if (v) v.dispatch({ selection: { anchor: 300 } });
  await wait(1000);
  // crop area editor + minimap
  return { ok: true };
`, 60000).catch(() => ({ ok: false }));
console.log(JSON.stringify(r));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-mm-final.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
