import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(
  `const p = document.querySelector('[data-testid="ai-panel"]');
   return JSON.stringify({
     panels: document.querySelectorAll('[data-testid="ai-panel"]').length,
     kelas: p?.className ?? null,
     composerId: p?.getAttribute('data-composer-id') ?? p?.dataset?.composerId ?? null,
     semuaAttr: p ? Array.from(p.attributes).map((a) => a.name + '=' + a.value).slice(0, 20) : null,
     teksAwal: (p?.innerText || '').slice(0, 300),
   });`,
  20000,
);
console.log(r);
keluarBersih(0);
