import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-m');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-m';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#111;padding:18px';
  document.body.appendChild(host);
  window.__OK__ = false;
  (async () => {
    try {
      const R = (await import('/node_modules/.vite/deps/react.js')).default;
      const D = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const mod = await import('/src/components/settings/AiModelsPage.tsx');
      D.createRoot(host).render(R.createElement(mod.default));
      window.__OK__ = true;
    } catch (e) { window.__OK__ = 'GAGAL ' + e; }
  })();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 2600));

await cdp.eval(
  `(() => { const b = document.querySelector('#uji-m [data-testid="aim-tambah"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 1000));

const d = await cdp.eval(
  `JSON.stringify((() => {
  const grid = document.querySelector('#uji-m [data-testid="aim-preset-grid"]');
  const modal = document.querySelector('#uji-m [data-testid="aim-add-modal"] .modal');
  const tile = document.querySelector('#uji-m [data-testid="aim-preset-gemini"]');
  if (!grid) return { ada: false };
  const cs = getComputedStyle(grid);
  return {
    ada: true,
    gridW: grid.clientWidth,
    modalW: modal ? modal.clientWidth : 0,
    tileW: tile ? tile.clientWidth : 0,
    kolom: cs.gridTemplateColumns,
    display: cs.display,
    gap: cs.gap,
    maxW: modal ? getComputedStyle(modal).maxWidth : '',
    width: modal ? getComputedStyle(modal).width : '',
  };
})())`,
);
console.log(d);
process.exit(0);
