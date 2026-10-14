import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise(r => setTimeout(r, ms));
  const klik = (s) => { const el = document.querySelector(s); if (!el) throw new Error('tidak ada: ' + s); el.click(); };
  if (!document.querySelector('[data-testid="toolgate"]')) { klik('[data-testid="ai-more"]'); await tidur(250); klik('[data-testid="ai-open-toolsets"]'); await tidur(400); }
  for (const t of document.querySelectorAll('.tg-bagian-head .tg-caret[aria-expanded="false"]')) t.click();
  await tidur(120);
  for (const t of document.querySelectorAll('.tg-grup-head .tg-caret[aria-expanded="false"]')) t.click();
  await tidur(120);
  const panel = document.querySelector('[data-testid="toolgate"]');
  const bagian = [...panel.querySelectorAll('.tg-bagian')].map(b => ({ id: b.getAttribute('data-testid'), label: b.querySelector('.tg-bagian-nama')?.textContent?.trim(), angka: b.querySelector('.tg-bagian-angka')?.textContent?.trim(), grup: [...b.querySelectorAll(':scope > .tg-grup')].map(g => g.querySelector('.tg-nama-grup')?.textContent?.trim()) }));
  return { total: panel.querySelector('[data-testid="toolgate-total"]')?.textContent?.trim(), baris: panel.querySelectorAll('.tg-row').length, bagian };
})())`);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
