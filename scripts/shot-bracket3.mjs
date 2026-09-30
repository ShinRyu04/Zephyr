import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(700).from).top;
  await wait(2500);
  return {
    scroll: Math.round(v.scrollDOM.scrollTop),
    baris: v.state.doc.lineAt(v.visibleRanges[0].from).number,
    zbr: document.querySelectorAll('[class*="cm-zbr-"]').length,
    zig: document.querySelectorAll('.cm-zig').length,
  };
`, 90000);
console.log(JSON.stringify(r));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-bracket3.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
