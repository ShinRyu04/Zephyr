import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

await cdp.eval('window.__ZEPHYR__.getState().setActivity("tools")');
await new Promise((r) => setTimeout(r, 3500));
await cdp.eval('document.querySelector("[data-testid=\\"tools-tab-devenv\\"]")?.click()');
await new Promise((r) => setTimeout(r, 2500));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-tools-baru.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-tools-baru.png');
}
console.log('  activity :', await cdp.eval('String(window.__ZEPHYR__.getState().activity)'));
console.log('  tab aktif:', await cdp.eval('String(document.querySelector(".tools-tab.is-active")?.textContent)'));
console.log('  sidebar  :', await cdp.eval('String(!!document.querySelector("aside.sidebar"))'));
console.log('  rail     :', await cdp.eval('JSON.stringify([...document.querySelectorAll(".ab-btn")].map(b => b.getAttribute("data-activity")).filter(Boolean))'));

cdp.close();
