import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const setFilter = (v) =>
  cdp.eval(
    `(() => {
       const f = document.querySelector('[data-testid="ag-diff-filter"]');
       const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
       set.call(f, ${JSON.stringify(v)});
       f.dispatchEvent(new Event('input', { bubbles: true }));
       return document.querySelectorAll('.ag-diff-row').length;
     })()`,
    20000,
  );

await setFilter('');
await new Promise((x) => setTimeout(x, 2500));
const dedup = await cdp.eval(
  `(() => {
     const t = [...document.querySelectorAll('.ag-diff-row')].map(e => e.getAttribute('title'));
     return t.length + '|' + new Set(t).size + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-');
   })()`,
  30000,
);
console.log('semua:', dedup);

const n = await setFilter('AgentsBrowser');
await new Promise((x) => setTimeout(x, 1500));
const s = await cdp.eval(
  `document.querySelectorAll('.ag-diff-row').length + '|' + document.querySelector('.ag-diff-row')?.getAttribute('title')`,
  20000,
);
console.log('setelah filter:', n, s);
cdp.close();
