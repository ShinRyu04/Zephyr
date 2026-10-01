// Screenshot the current activity so the layout can be judged by eye.
import { Cdp } from './lib-cdp.mjs';
import fs from 'node:fs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');
const id = process.argv[3] || 'devenv';

await cdp.runAsync(
  `const st = S.getState(); st.setSettingsOpen(false); st.setActivity(${JSON.stringify(id)});
   st.setState({ sidebarVisible: true }); await wait(2200); return 'ok';`,
  40000,
);

const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
const b64 = r?.data;
if (!b64) {
  console.log('gagal screenshot:', JSON.stringify(r));
  process.exit(1);
}
fs.mkdirSync('D:/Zephyr/screenshots', { recursive: true });
const out = `D:/Zephyr/screenshots/cek-${id}.png`;
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('tulis:', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
process.exit(0);
