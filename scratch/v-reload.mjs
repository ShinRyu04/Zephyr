import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log(daftar.filter((t) => t.type === 'page').map((t) => `${t.title} :: ${t.url}`).join('\n'));
cdp2: {
  const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
  const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.eval('location.reload()', 5000).catch(() => {});
  cdp.close();
}
await new Promise((x) => setTimeout(x, 8000));
const lagi = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target2 = lagi.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target2.webSocketDebuggerUrl);
console.log(
  'setelah reload:',
  await cdp.eval(
    `(() => {
       const tab = [...document.querySelectorAll('.ag-tab')].map(e => e.getAttribute('data-testid')).join(',');
       const rows = document.querySelectorAll('.ag-diff-row').length;
       return 'tab=' + tab + ' rows=' + rows + ' start=' + !!document.querySelector('[data-testid="ag-start-here"]');
     })()`,
    25000,
  ),
);
cdp.close();
