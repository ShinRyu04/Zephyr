import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const panels = [
  ['term', 'terminal', null],
  ['dbg', 'debug', null],
  ['ext', 'extensions', 'marketplace'],
];
for (const [nama, act, tab] of panels) {
  await cdp.runAsync(`
    const st = window.__ZEPHYR__.getState();
    st.setActivity('${act}');
    await wait(1800);
    ${tab ? `window.__ZEPHYR_EXT19__.state().setTab('${tab}'); await wait(1800);` : ''}
    return 1;
  `, 60000);
  const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`D:/Zephyr/shot-p-${nama}.png`, Buffer.from(sh.result.data, 'base64'));
  console.log('  ' + nama + ' ok');
}
cdp.close();
