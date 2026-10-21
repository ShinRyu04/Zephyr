import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const log = [];
log.push(['awal', await cdp.eval(`[...document.querySelectorAll('.ag-tab')].map(e => e.getAttribute('data-testid')).join(',')`, 20000)]);

await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]').click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 300));
log.push(['menu', await cdp.eval(`!!document.querySelector('[data-testid="ag-menu-plus"]')`, 10000)]);

await cdp.eval(`(() => { document.querySelector('[data-testid="ag-open-diff"]').click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 2500));
log.push(['tab', await cdp.eval(`[...document.querySelectorAll('.ag-tab')].map(e => e.getAttribute('data-testid')).join(',')`, 15000)]);
log.push(['body', await cdp.eval(`document.querySelector('.ag-tab-body')?.className + '|' + (document.querySelector('[data-testid="ag-body-list"]')?.innerHTML ?? '').slice(0, 160)`, 20000)]);

for (const [k, v] of log) console.log(k, '=>', typeof v === 'string' ? v : JSON.stringify(v));
cdp.close();
