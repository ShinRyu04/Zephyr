// cek-bridge-tools.mjs — confirm the dev bridge exposes the agent tool list.
//
// The harness for phase 06 drives browser tools the same way the agent does.
// It must read them from the page module registry (window.__ZEPHYR_TOOLS__),
// never through a dynamic import in the evaluated snippet: Vite would resolve
// that import to a second copy of the module, whose pane store is a different
// instance than the one on screen.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const t = window.__ZEPHYR_TOOLS__;
  return JSON.stringify({
    ada: !!t,
    jumlah: t ? t.length : 0,
    browser: t ? t.filter(x => String(x.spec.name).startsWith('browser_')).map(x => x.spec.name) : [],
  });
`);

console.log(r);
await cdp.close();
