import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
// buka file yang banyak indent
const r = await cdp.runAsync(`
  const BS = String.fromCharCode(92);
  const st = window.__ZEPHYR__.getState();
  await st.openPathAt('D:' + BS + 'Zephyr' + BS + 'src' + BS + 'lib' + BS + 'aiStore.ts', 1);
  await wait(2000);
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  // scroll ke tengah file yang banyak indent
  v.dispatch({ selection: { anchor: v.state.doc.line(700).from } });
  await wait(1500);
  return {
    zig: document.querySelectorAll('.cm-zig').length,
    zbr: document.querySelectorAll('.cm-zbr').length,
    baris: v.state.doc.lines,
  };
`, 90000);
console.log(JSON.stringify(r));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-editor-final.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
