import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* Render halaman AI Models apa adanya, lalu laporkan APA yang benar-benar ada. */
await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-d');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-d';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#111;padding:16px';
  document.body.appendChild(host);
  window.__D__ = 'menunggu';
  window.__DERR__ = null;
  (async () => {
    try {
      const R = (await import('/node_modules/.vite/deps/react.js')).default;
      const D = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const mod = await import('/src/components/settings/AiModelsPage.tsx');
      D.createRoot(host).render(R.createElement(mod.default));
      window.__D__ = 'ok';
    } catch (e) {
      window.__D__ = 'GAGAL';
      window.__DERR__ = String(e && e.stack ? e.stack : e).slice(0, 600);
    }
  })();
  window.addEventListener('error', (e) => {
    window.__DERR__ = (window.__DERR__ || '') + ' | window.onerror: ' + (e.message || '');
  });
  return 'mulai';
})()`,
);
await new Promise((r) => setTimeout(r, 3000));

const hasil = await cdp.eval(
  `JSON.stringify((() => {
  const p = document.querySelector('#uji-d');
  const teks = p ? (p.textContent || '') : '';
  const semuaInput = p ? [...p.querySelectorAll('input')] : [];
  return {
    status: window.__D__,
    galat: window.__DERR__,
    adaIsi: teks.length,
    teksAwal: teks.slice(0, 300),
    input: semuaInput.map((i) => i.getAttribute('data-testid') || i.type).slice(0, 20),
    testids: p ? [...p.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).slice(0, 40) : [],
  };
})())`,
);
console.log(hasil);
process.exit(0);
