import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');
await c.eval(`location.reload()`);
c.close();
await new Promise((r) => setTimeout(r, 5000));
const c2 = await cdp(9223, '#panel=agent-custom');
console.log(await c2.eval(`JSON.stringify({
  hash: location.hash,
  root: document.querySelector('#root')?.firstElementChild?.className ?? '(kosong)',
  testid: [...document.querySelectorAll('[data-testid]')].slice(0,25).map(e=>e.getAttribute('data-testid')),
})`));
c2.close();
process.exit(0);
