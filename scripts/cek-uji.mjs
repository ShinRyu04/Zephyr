import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const cur = JSON.parse(JSON.stringify(st.settings.editor));
  cur.bracketPairColorization = false;
  await st.applySettings({ editor: cur });
  await wait(1500);
  out.zbrSetelahOff = document.querySelectorAll('[class*="cm-zbr"]').length;
  cur.bracketPairColorization = true;
  await st.applySettings({ editor: cur });
  await wait(1500);
  out.zbrSetelahOn = document.querySelectorAll('[class*="cm-zbr"]').length;
  out.kelas = [...new Set([...document.querySelectorAll('[class*="cm-zbr"]')].map(e => e.className.split(' ').filter(c => c.startsWith('cm-zbr-')).join('')))];

  // cek plugin list lagi
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.pluginCount = v.plugins.length;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
