import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const jawab = [];
cdp.send('Runtime.enable').catch(() => {});
await cdp.eval(`window.__VUJI_ERR__ = []; window.addEventListener('error', e => window.__VUJI_ERR__.push(String(e.message)))`, 10000).catch(() => {});

/* Buka tab browser (kartu Start here) supaya AgentsBrowser mount. */
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`, 15000);
await new Promise((x) => setTimeout(x, 400));
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-open-browser"]')?.click(); return 1; })()`, 15000);
await new Promise((x) => setTimeout(x, 2500));
console.log('browser tab:', await cdp.eval(`!!document.querySelector('[data-testid="ag-browser"]') + '|' + (document.querySelector('[data-testid="ag-browser-empty"]')?.innerText ?? '').replace(/\\n/g, ' / ')`, 20000));
console.log('errors:', await cdp.eval(`JSON.stringify(window.__VUJI_ERR__ ?? [])`, 15000));
void jawab;
cdp.close();
