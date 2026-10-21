import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

await cdp.eval(`window.__ZEPHYR__.getState().openWorkspace('D:/Zephyr')`, 60000);
await new Promise((x) => setTimeout(x, 2500));
await cdp.eval(`window.__ZEPHYR_GIT__.refresh()`, 90000);
await new Promise((x) => setTimeout(x, 3000));
console.log(await cdp.eval(`'ws=' + window.__ZEPHYR__.getState().workspace + ' isRepo=' + window.__ZEPHYR_GIT__.status()?.isRepo + ' n=' + window.__ZEPHYR_GIT__.status()?.changes.length`, 30000));

await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`, 15000);
await new Promise((x) => setTimeout(x, 400));
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-open-diff"]')?.click(); return 1; })()`, 15000);
await new Promise((x) => setTimeout(x, 4000));
console.log(await cdp.eval(`document.querySelectorAll('.ag-diff-row').length + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-')`, 40000));
cdp.close();
