import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-ext');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-ext';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#111';
  document.body.appendChild(host);
  return 'ok';
})()`,
);

/* Mount lewat eval + slot manual, tanpa runAsync (yang menyentuh __ZEPHYR__). */
await cdp.eval(
  `(() => {
  window.__UJI_HASIL__ = null;
  (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const createRoot = Dom.createRoot ?? DomMod.createRoot;
      const mod = await import('/src/components/extensions/ExtensionsView.tsx');
      const host = document.getElementById('uji-ext');
      const root = createRoot(host);
      root.render(React.createElement(mod.default));
      window.__UJI_EXT__ = root;
      window.__UJI_HASIL__ = 'ok';
    } catch (e) {
      window.__UJI_HASIL__ = 'GAGAL: ' + String(e);
    }
  })();
  return 'mulai';
})()`,
);

await new Promise((r) => setTimeout(r, 3000));

const hasil = await cdp.eval(`window.__UJI_HASIL__`);
console.log('mount:', hasil);

const dom = await cdp.eval(
  `JSON.stringify((() => {
  const v = document.querySelector('#uji-ext [data-testid="extensions-view"]');
  return {
    ada: !!v,
    tabs: v ? [...v.querySelectorAll('[data-testid^="ext-tab-"]')].map((x) => x.getAttribute('data-testid')) : [],
    grid: !!v?.querySelector('[data-testid="xmkt-grid"]'),
    kartu: v ? v.querySelectorAll('.xmkt-kartu').length : 0,
    teks: v ? (v.textContent || '').slice(0, 200) : null,
  };
})())`,
);
console.log('dom:', dom);
process.exit(0);
