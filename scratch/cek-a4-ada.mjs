import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(
  `return JSON.stringify({
     panels: document.querySelectorAll('[data-testid="ai-panel"]').length,
     kosong: !!document.querySelector('[data-testid="ai-panel"].is-kosong'),
     innerLen: (document.body.innerText || '').length,
     aktif: document.querySelector('.ai-panel')?.className ?? null,
   });`,
  20000,
);
console.log(r);
keluarBersih(0);
