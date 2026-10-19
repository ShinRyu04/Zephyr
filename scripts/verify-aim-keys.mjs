/*
 * Bukti: panel Providers & API keys TIDAK hilang dari AI Models.
 *
 * Ini regresi yang harus ditangkap: saat halaman AI Models digambar ulang jadi
 * bentuk TRAE, field API key dan Base URL ikut terhapus - sehingga daftar model
 * tidak bisa dipakai sama sekali. Tes ini menuntut keduanya ADA dan BISA
 * DISIMPAN.
 *
 *   K1  tombol Manage ada di halaman AI Models
 *   K2  panel kunci terbuka dan memuat semua provider
 *   K3  tiap provider punya field API key
 *   K4  tiap provider punya field Base URL
 *   K5  menyimpan Base URL benar-benar menulis ke setelan
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-models');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-models';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:20px';
  document.body.appendChild(host);
  window.__UJI_M__ = false;
  (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const mod = await import('/src/components/settings/AiModelsPage.tsx');
      Dom.createRoot(host).render(React.createElement(mod.default));
      window.__UJI_M__ = true;
    } catch (e) {
      window.__UJI_M__ = 'GAGAL: ' + String(e);
    }
  })();
  return 'mulai';
})()`,
);
await new Promise((r) => setTimeout(r, 2600));

const out = {};
out.mount = await cdp.eval(`window.__UJI_M__`);

const k1 = await J(`(() => ({
  adaManage: !!document.querySelector('#uji-models [data-testid="aim-kunci"]'),
  adaPanel: !!document.querySelector('#uji-models [data-testid="aim-keys"]'),
}))()`);
out.k1 = typeof k1 === 'string' ? JSON.parse(k1) : k1;

await cdp.eval(
  `(() => { const b = document.querySelector('#uji-models [data-testid="aim-kunci"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 1200));

const k2 = await J(`(() => {
  const p = document.querySelector('#uji-models [data-testid="aim-keys"]');
  return {
    adaPanel: !!p,
    kartu: p ? p.querySelectorAll('[data-testid^="aim-key-"]').length : 0,
    adaGemini: !!p?.querySelector('[data-testid="aim-key-gemini"]'),
    inputKey: p ? p.querySelectorAll('[data-testid^="aim-key-input-"]').length : 0,
    inputUrl: p ? p.querySelectorAll('[data-testid^="aim-key-url-"]').length : 0,
  };
})()`);
out.k2 = typeof k2 === 'string' ? JSON.parse(k2) : k2;

/* K5: save a base URL and read it back from settings. */
const sebelum = await J(`(() => ({
  url: window.__ZEPHYR__.getState().settings.models?.providers?.gemini?.baseUrl ?? null,
}))()`);
out.sebelum = typeof sebelum === 'string' ? JSON.parse(sebelum) : sebelum;

await cdp.eval(
  `(() => {
  const i = document.querySelector('#uji-models [data-testid="aim-key-url-gemini"]');
  if (!i) return 'no';
  const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  st.call(i, 'https://contoh.invalid/v1');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-models [data-testid="aim-key-url-simpan-gemini"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 1400));

const sesudah = await J(`(() => ({
  url: window.__ZEPHYR__.getState().settings.models?.providers?.gemini?.baseUrl ?? null,
}))()`);
out.sesudah = typeof sesudah === 'string' ? JSON.parse(sesudah) : sesudah;

/* Put the URL back. */
const asli = JSON.stringify(out.sebelum?.url ?? null);
await cdp.eval(
  `(() => {
  const S = window.__ZEPHYR__.getState();
  const m = S.settings.models ?? {};
  const p = { ...(m.providers ?? {}) };
  const lama = ${asli};
  if (lama === null) { delete p.gemini; } else { p.gemini = { ...(p.gemini ?? {}), baseUrl: lama }; }
  void S.applySettings({ models: { ...m, providers: p } });
  return 'ok';
})()`,
);
await cdp.eval(
  `(() => {
  const h = document.getElementById('uji-models');
  if (h) h.remove();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 600));

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — API key & Base URL TIDAK hilang dari AI Models:');
cek('K1 tombol Manage ada di halaman AI Models', out.mount === true && out.k1?.adaManage === true, '');
cek(
  'K2 panel kunci terbuka dan memuat semua provider',
  out.k2?.adaPanel === true && (out.k2?.kartu ?? 0) >= 8,
  `kartu=${out.k2?.kartu}`,
);
cek('K3 tiap provider punya field API key', (out.k2?.inputKey ?? 0) >= 8, `input=${out.k2?.inputKey}`);
cek('K4 tiap provider punya field Base URL', (out.k2?.inputUrl ?? 0) >= 8, `input=${out.k2?.inputUrl}`);
cek(
  'K5 menyimpan Base URL benar-benar menulis ke setelan',
  out.sesudah?.url === 'https://contoh.invalid/v1',
  `${out.sebelum?.url} -> ${out.sesudah?.url}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
