import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  st.setActivity('settings'); st.setSettingsOpen(true); await wait(1600);
  const su = await import('/src/lib/settingsStore.ts');
  su.useSettingsUi.getState().setSection('subagent'); await wait(2200);
  const el = q('.set-page') || q('.settings-page') || document.body;
  const rc = el.getBoundingClientRect();
  return { x: Math.round(rc.left), y: Math.round(rc.top), width: Math.round(rc.width), height: Math.round(rc.height), teks: el.textContent.replace(/\\s+/g,' ').slice(0,300) };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: r.x, y: r.y, width: Math.min(900, r.width), height: Math.min(620, r.height), scale: 1 },
});
writeFileSync('D:/Zephyr/shot-sub-page.png', Buffer.from(sh.result.data, 'base64'));
console.log('shot-sub-page.png');
cdp.close();
