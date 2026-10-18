import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* Compare the store instance the APP uses with the one an import() gives us. */',
    'const viaImport = await import("/src/lib/store.ts");',
    'out.appStore = typeof window.__ZEPHYR_SET__;',
    'out.importSetActivity = viaImport.useStore.getState().activity;',
    'if (window.__ZEPHYR_SET__) {',
    '  out.bridgeKeys = Object.keys(window.__ZEPHYR_SET__);',
    '  out.appActivity = window.__ZEPHYR_SET__.baca ? window.__ZEPHYR_SET__.baca().activity : "(tidak ada baca)";',
    '}',
    '/* Are they the SAME object? */',
    'out.sama = !!(window.__ZEPHYR_SET__ && window.__ZEPHYR_SET__.store && window.__ZEPHYR_SET__.store === viaImport.useStore);',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
