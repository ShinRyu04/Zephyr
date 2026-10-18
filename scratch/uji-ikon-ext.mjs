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
  window.__UJI_OK__ = false;
  (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const mod = await import('/src/components/extensions/ExtensionsView.tsx');
      Dom.createRoot(host).render(React.createElement(mod.default));
      window.__UJI_OK__ = true;
    } catch (e) {
      window.__UJI_OK__ = 'GAGAL: ' + String(e);
    }
  })();
  return 'mulai';
})()`,
);
await new Promise((r) => setTimeout(r, 2500));

await cdp.eval(
  `(() => { const b = document.querySelector('#uji-ext [data-testid="ext-tab-marketplace"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 1200));

const r = await cdp.eval(
  `JSON.stringify((() => {
  const kartu = [...document.querySelectorAll('#uji-ext .xmkt-kartu')];
  const contoh = kartu.slice(0, 8).map((k) => {
    const box = k.querySelector('.xmkt-logo-ext');
    const svg = box?.querySelector('svg');
    const img = box?.querySelector('img');
    const ini = box?.querySelector('.xc-inisial');
    const asli = box?.querySelector('.xc-gambar-asli');
    return {
      nama: k.querySelector('.xmkt-nama')?.textContent,
      adaBox: !!box,
      svg: !!svg,
      img: !!img,
      inisial: ini ? ini.textContent : null,
      dariKatalog: !!asli,
      teks: (box?.textContent || '').slice(0, 6),
    };
  });
  return {
    total: kartu.length,
    adaIkon: kartu.filter((k) => k.querySelector('.xmkt-logo-ext svg, .xmkt-logo-ext img')).length,
    contoh,
  };
})())`,
);
console.log(r);
process.exit(0);
