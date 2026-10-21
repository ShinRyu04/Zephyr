import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const r = await cdp.json(`return JSON.stringify(await (async () => {
  for (const b of qa('[data-testid^="ag-tab-close-"]')) b.click();
  await wait(400);
  const G = window.__ZEPHYR_GIT__;
  const S = window.__ZEPHYR__.getState();
  return {
    workspace: S.workspace,
    status: G ? JSON.stringify(G.status()).slice(0, 240) : null,
  };
})())`);
console.log(JSON.stringify(r, null, 2));
cdp.close();
