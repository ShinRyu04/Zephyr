// Tangkap layar app hidup lewat CDP → PNG. Dipakai untuk memeriksa tampilan
// nyata (bukan menebak dari DOM) saat merapikan UI.
import fs from 'node:fs';
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const out = process.argv[2] ?? 'D:/Zephyr/shot-now.png';
const { cdp, page } = await Cdp.attach('9223');
console.log('tersambung:', page.title);
await sleep(600);
const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
const b64 = r?.result?.data;
if (!b64) throw new Error('capture gagal: ' + JSON.stringify(r).slice(0, 200));
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('tersimpan:', out, Math.round(fs.statSync(out).size / 1024), 'KB');
process.exit(0);
