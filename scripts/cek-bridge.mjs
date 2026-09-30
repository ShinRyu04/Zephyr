import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.eval(`
  Object.keys(window).filter(k => k.startsWith('__ZEPHYR')).sort().join(', ')
`);
console.log('BRIDGES:', r.result.value);
const r2 = await cdp.eval(`
  JSON.stringify({
    viteErr: !!document.querySelector('#vite-error-overlay'),
    rootIsi: (document.querySelector('#root') || {}).childElementCount,
    judul: document.title,
    bodyIsi: document.body.innerHTML.length,
  })
`);
console.log('PAGE:', r2.result.value);
cdp.close();
