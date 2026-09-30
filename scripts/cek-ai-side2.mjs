import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/* Reload app, lalu ukur ulang header AI setelah CSS compact termuat. */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

await cdp.eval('location.reload()').catch(() => {});
console.log('  reload dikirim');
cdp.close();

await new Promise((r) => setTimeout(r, 26000));

const list2 = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page2 = list2.find((t) => t.type === 'page');
const { cdp: cdp2 } = await Cdp.attach('9223', page2.title);

const r = await cdp2.runAsync(`
  const zzHead = q('.ai-head');
  const zzIkon = qa('.ai-ikon');
  return {
    headH: zzHead?.offsetHeight ?? -1,
    headW: zzHead?.offsetWidth ?? -1,
    ikon: zzIkon.length,
    semuaKotak: zzIkon.every((b) => b.offsetWidth === 24 && b.offsetHeight === 24),
    tombolTeks: qa('.ai-export').length,
    inputH: q('[data-testid="ai-input"]')?.offsetHeight ?? -1,
    inputRadius: getComputedStyle(q('[data-testid="ai-input"]')).borderRadius,
    inputRowFlex: getComputedStyle(q('.ai-input-row')).flexDirection,
    pos: q('[data-testid="ai-panel"]')?.getAttribute('data-pos') ?? null,
  };
`, 30000);

console.log('  hasil:', JSON.stringify(r, null, 2));

const sh = await cdp2.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-ai-side2.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-ai-side2.png');
}

cdp2.close();
