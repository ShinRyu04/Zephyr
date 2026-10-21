import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');
const out = await c.eval(`JSON.stringify((()=>{
  return {
    hash: location.hash,
    judul: document.title,
    teks: (document.body.innerText || '').slice(0, 600),
    testid: [...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')).slice(0,50),
    jumlah: document.querySelectorAll('[data-testid]').length,
  };
})())`);
console.log(out);
c.close();
process.exit(0);
