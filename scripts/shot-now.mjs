import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(process.argv[2] || 'D:/Zephyr/shot-now.png', Buffer.from(sh.result.data, 'base64'));
console.log('  saved');
cdp.close();
