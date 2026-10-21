import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `(() => {
       const f = document.querySelector('[data-testid="ag-diff-filter"]');
       return 'filter=' + JSON.stringify(f?.value) + ' rows=' + document.querySelectorAll('.ag-diff-row').length
         + ' title0=' + (document.querySelector('.ag-diff-row')?.getAttribute('title') ?? '')
         + ' total=' + (document.querySelector('[data-testid="ag-diff-total"]')?.textContent ?? '');
     })()`,
    20000,
  ),
);
cdp.close();
