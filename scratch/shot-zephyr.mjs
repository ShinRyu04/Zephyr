import { writeFileSync } from 'fs';
import { cdp } from './cdp2.mjs';

/*
 * Screenshot the Zephyr Agents window for a visual diff against the reference.
 *
 * `fromSurface: true` with an explicit clip is the form that works here; a bare
 * `Page.captureScreenshot` hangs on these WebView targets.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ag = list.find((x) => x.url.includes('#agents'));
if (!ag) throw new Error('jendela agents tidak ada');

const a = await cdp(9223, '#agents');
const shot = await a.send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
writeFileSync('D:\\Zephyr\\scratch\\zephyr-agents.png', Buffer.from(shot.data, 'base64'));
console.log('ok bytes=' + shot.data.length);
a.close();
process.exit(0);
