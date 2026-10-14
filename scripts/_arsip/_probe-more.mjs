/* Sekali pakai: cari tombol pembuka tool gate + testid yang ada. */
import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const d = await cdp.json(`return JSON.stringify({
  jumlah: document.querySelectorAll('[data-testid]').length,
  aiMore: !!document.querySelector('[data-testid="ai-more"]'),
  toolgate: !!document.querySelector('[data-testid="toolgate"]'),
  testids: [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))],
  tombolTitik: [...document.querySelectorAll('button')].map((b) => String(b.textContent || '').trim()).filter((t) => t.length <= 3).slice(0, 20),
})`);
console.log(JSON.stringify(d, null, 1).slice(0, 4000));
await cdp.close();
