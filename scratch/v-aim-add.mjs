/*
 * Measure the Add Model dialog as it actually lays out, so "rusak" can be named
 * instead of guessed: which element is wider than its box, which overlaps.
 */
import * as Cdp from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.Cdp.attach(9223, 'Zephyr');
const out = await cdp.eval(`(async () => {
  const { useAiModels } = await import('/src/lib/aiModelsStore.ts');
  useAiModels.getState().buka();
  await new Promise((r) => setTimeout(r, 800));
  const dlg = document.querySelector('.modal.aim-add') || document.querySelector('[role="dialog"]');
  if (!dlg) return JSON.stringify({ ada: false, semua: [...document.querySelectorAll('.modal')].map((m) => m.className) });
  const box = (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  const anak = [...dlg.children].map((c) => ({ cls: c.className, ...box(c), scrollH: c.scrollHeight, over: c.scrollHeight > c.clientHeight + 2 }));
  const grid = dlg.querySelector('.aim-preset');
  const tiles = [...dlg.querySelectorAll('.aim-preset-btn')].slice(0, 4).map((t) => ({ ...box(t), teks: (t.innerText || '').replace(/\\n/g, '/').slice(0, 40) }));
  const lebar = [...dlg.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 2).map((e) => e.className || e.tagName).slice(0, 8);
  return JSON.stringify({
    ada: true, dlg: box(dlg), anak: anak.slice(0, 6),
    grid: grid ? { ...box(grid), kolom: getComputedStyle(grid).gridTemplateColumns, baris: getComputedStyle(grid).gridAutoRows } : null,
    tiles, overflowX: lebar,
  });
})()`, 30000);
console.log(out);
await cdp.close();
