import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-cek');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-cek';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#111;padding:16px';
  document.body.appendChild(host);
  window.__CEK__ = 'menunggu';
  (async () => {
    try {
      const R = (await import('/node_modules/.vite/deps/react.js')).default;
      const D = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const mod = await import('/src/components/settings/AiModelsPage.tsx');
      D.createRoot(host).render(R.createElement(mod.default));
      window.__CEK__ = 'ok';
    } catch (e) { window.__CEK__ = 'GAGAL ' + String(e).slice(0, 200); }
  })();
  return 'mulai';
})()`,
);
await new Promise((r) => setTimeout(r, 3500));

const hasil = await cdp.eval(
  `JSON.stringify((() => {
  const p = document.getElementById('uji-cek');
  const q = (s) => p.querySelector(s);
  const semua = (s) => [...p.querySelectorAll(s)];
  return {
    status: window.__CEK__,
    adaTabel: !!q('[data-testid="aim-table"]'),
    barisTabel: semua('[data-testid="aim-table-row"]').length,
    logoDiTabel: semua('.aim-td-logo svg').length,
    adaInputKey: semua('[data-testid^="prov-key-"]').length,
    adaInputUrl: semua('[data-testid^="prov-url-"]').length,
    adaRefresh: semua('[data-testid^="prov-refresh-"]').length,
    adaTest: semua('[data-testid^="prov-test-"]').length,
    semuaTestid: semua('[data-testid]').map((e) => e.getAttribute('data-testid')).filter((x) => /prov-|models-|aim-/.test(x)).slice(0, 25),
  };
})())`,
);
console.log(hasil);
process.exit(0);
