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
  window.__UJI_HASIL__ = null;
  (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const mod = await import('/src/components/extensions/ExtensionsView.tsx');
      const root = Dom.createRoot(host);
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
await new Promise((r) => setTimeout(r, 2500));

for (const t of ['plugins', 'skills', 'mcp', 'marketplace']) {
  await cdp.eval(
    `(() => { const b = document.querySelector('#uji-ext [data-testid="ext-tab-${t}"]'); if (b) b.click(); return 'ok'; })()`,
  );
  await new Promise((r) => setTimeout(r, 900));
  const d = await cdp.eval(
    `JSON.stringify((() => {
    const v = document.querySelector('#uji-ext [data-testid="extensions-view"]');
    const grid = v?.querySelector('[data-testid="xmkt-grid"]');
    return {
      t: '${t}',
      kartu: grid ? grid.querySelectorAll('.xmkt-kartu').length : 0,
      nama: grid ? [...grid.querySelectorAll('.xmkt-nama')].slice(0, 6).map((x) => x.textContent) : [],
      total: v ? (v.textContent || '').length : 0,
    };
  })())`,
  );
  console.log(d);
}

/* Berapa isi store-nya sebenarnya? */
const st = await cdp.eval(
  `JSON.stringify((() => {
  const P = window.__ZEPHYR_PLUGINS__;
  const S = window.__ZEPHYR_SKILLS__;
  const M = window.__ZEPHYR_MCP__;
  return {
    pluginDaftar: P?.usePlugins?.getState?.().daftar?.length ?? 'n/a',
    pluginPasar: P?.usePlugins?.getState?.().pasar?.length ?? 'n/a',
    skill: S?.useSkills?.getState?.().daftar?.length ?? 'n/a',
    mcp: M?.servers?.()?.length ?? 'n/a',
  };
})())`,
);
console.log('store:', st);
process.exit(0);
