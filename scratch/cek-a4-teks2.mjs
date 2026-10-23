import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(
  `const ps = Array.from(document.querySelectorAll('[data-testid^="ai-user"]'));
   const sc = document.querySelector('.ai-scroll, .ai-msgs, .ai-pesan-list');
   return JSON.stringify({
     userTestids: ps.map((e) => e.getAttribute('data-testid')),
     kelasPanel: document.querySelector('[data-testid="ai-panel"]')?.className,
     nMsgs: document.querySelectorAll('[data-testid="ai-msg"]').length,
     sc: sc ? sc.className + ' :: ' + (sc.innerText || '').slice(0, 200) : null,
   });`,
  20000,
);
console.log(r);
keluarBersih(0);
