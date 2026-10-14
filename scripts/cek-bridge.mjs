import { Cdp } from './lib-cdp.mjs';
let list;
try {
  list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
} catch (e) {
  console.log(`TIDAK BERLAKU: app tidak hidup di port 9223 (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('TIDAK BERLAKU: tidak ada halaman app di port 9223.');
  process.exit(2);
}
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.eval(`
  Object.keys(window).filter(k => k.startsWith('__ZEPHYR')).sort().join(', ')
`);
/* lib-cdp.mjs:314 mengembalikan NILAI-nya langsung (return r.result?.result?.value),
   jadi `r` di sini ADALAH string jembatan - bukan lagi amplop balasan CDP. */
console.log('BRIDGES:', r);
const r2 = await cdp.eval(`
  JSON.stringify({
    viteErr: !!document.querySelector('#vite-error-overlay'),
    rootIsi: (document.querySelector('#root') || {}).childElementCount,
    judul: document.title,
    bodyIsi: document.body.innerHTML.length,
  })
`);
console.log('PAGE:', r2);
cdp.close();
