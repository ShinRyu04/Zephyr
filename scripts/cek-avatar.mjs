// cek-avatar.mjs — baca warna computed avatar GitHub di app yang hidup.
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
await sleep(300);

const expr = `(() => {
  const el = document.querySelector('.ab-gh-avatar');
  if (!el) return JSON.stringify({ ada: false });
  const cs = getComputedStyle(el);
  return JSON.stringify({
    ada: true,
    teks: el.textContent,
    bg: cs.backgroundColor,
    warna: cs.color,
    border: cs.borderColor,
    tema: document.documentElement.getAttribute('data-theme') || '(tidak ada)',
    surface3: getComputedStyle(document.documentElement).getPropertyValue('--surface-3').trim(),
  });
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r?.result?.result?.value ?? JSON.stringify(r).slice(0, 300));
process.exit(0);
