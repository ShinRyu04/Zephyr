import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const raw = await cdp.runAsync(`return JSON.stringify(await (${expr}))`, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const idWadah = 'uji-hooks';
const path = '/src/components/settings/AgcHooks.tsx';

await cdp.eval(
  `(() => {
    const lama = document.getElementById('${idWadah}');
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = '${idWadah}';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:24px';
    document.body.appendChild(host);
    return 'ok';
  })()`,
);

try {
  const r = await J(`await (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const createRoot = Dom.createRoot ?? DomMod.createRoot;
      const mod = await import('${path}');
      const host = document.getElementById('${idWadah}');
      const root = createRoot(host);
      root.render(React.createElement(mod.default));
      window.__UJI_X__ = root;
      return { ok: true };
    } catch (e) {
      return { ok: false, galat: String(e) };
    }
  })()`);
  console.log('mount:', JSON.stringify(r));
} catch (e) {
  console.log('mount GAGAL:', String(e).slice(0, 300));
}
process.exit(0);
