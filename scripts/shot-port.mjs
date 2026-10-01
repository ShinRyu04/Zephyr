// shot-port.mjs — tangkap layar app hidup di port debug mana pun.
// Dipakai uji RAM (exe release di port 9224) yang tidak boleh mengganggu
// sesi `tauri dev` di 9223.
//
// Pakai: node scripts/shot-port.mjs <port> <out.png>
import fs from 'node:fs';
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const port = process.argv[2] ?? '9223';
const out = process.argv[3] ?? 'D:/Zephyr/shot-port.png';
// Judul window bisa berbeda antara dev ("Zephyr") dan release ("localhost"),
// jadi ambil target page pertama yang punya endpoint debug.
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) throw new Error(`tidak ada target page di :${port}`);
const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
console.log('tersambung:', page.title);
await sleep(600);
const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
const b64 = r?.result?.data;
if (!b64) throw new Error('capture gagal: ' + JSON.stringify(r).slice(0, 200));
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('tersimpan:', out, Math.round(fs.statSync(out).size / 1024), 'KB');
process.exit(0);
