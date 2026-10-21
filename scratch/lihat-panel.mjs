import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agents&seksi=conversations');
const out = await c.eval(`JSON.stringify((()=>{
  const teks = (document.body.innerText || '').slice(0, 1200);
  const kelas = [...new Set([...document.querySelectorAll('[class]')].flatMap(e => String(e.className).split(/\\s+/)))].filter(Boolean).slice(0, 60);
  return {
    hash: location.hash,
    judul: document.title,
    teks,
    kelas,
    jumlahTestid: document.querySelectorAll('[data-testid]').length,
    testid: [...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')).slice(0,40),
  };
})())`);
console.log(out);
c.close();
process.exit(0);
