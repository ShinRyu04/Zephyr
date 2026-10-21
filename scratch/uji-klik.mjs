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

/* Pilih preset custom supaya form muncul, lalu cek apa yang menutupi input. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-m [data-testid="aim-preset-custom"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 900));

const d = await cdp.eval(
  `JSON.stringify((() => {
  const inp = document.querySelector('#uji-m [data-testid="aim-add-id"]');
  if (!inp) return { ada: false };
  const r = inp.getBoundingClientRect();
  const atas = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const modal = inp.closest('.modal');
  const backdrop = document.querySelector('#uji-m .modal-backdrop');
  return {
    ada: true,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    elementAtPoint: atas ? atas.tagName + '.' + (atas.className || '') : null,
    samaDenganInput: atas === inp,
    modalRect: modal ? (() => { const m = modal.getBoundingClientRect(); return { x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.width), h: Math.round(m.height) }; })() : null,
    backdropPosisi: backdrop ? getComputedStyle(backdrop).position : null,
    modalPosisi: modal ? getComputedStyle(modal).position : null,
    inert: modal ? modal.inert : null,
    ariaHidden: modal ? modal.getAttribute('aria-hidden') : null,
  };
})())`,
);
console.log(d);
process.exit(0);
