import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
/* Tunggu HMR selesai, lalu ukur ulang. */
await new Promise((x) => setTimeout(x, 4000));
console.log(
  await cdp.eval(
    `(document.querySelector('[data-testid="ag-diff"]') ? 'diff-ada' : 'diff-tidak') + '|total=' + (document.querySelector('[data-testid="ag-diff-total"]')?.textContent ?? '') + '|baris=' + [...document.querySelectorAll('.ag-diff-row')].length + '|lebih=' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-')`,
    20000,
  ),
);
cdp.close();
