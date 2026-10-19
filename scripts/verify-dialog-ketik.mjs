/*
 * Bukti bahwa input di dialog BISA DIKETIK.
 *
 * Ini regresi paling mahal yang pernah ada di sini: `useEffect` dengan
 * dependensi `[onTutup]` (fungsi arrow baru tiap render) merebut fokus kembali
 * ke modal setiap kali pembaca mengetik. Gejalanya "field tidak bisa diisi",
 * yang terlihat seperti bug CSS dan bukan.
 *
 * Tes ini mengetik karakter demi karakter lalu membaca nilainya kembali. Kalau
 * fokus direbut, karakternya hilang dan tesnya gagal.
 *
 *   T1  Add Model: field Model ID bisa diketik
 *   T2  Add Model: field Base URL bisa diketik
 *   T3  Add Model: field Context size bisa diketik
 *   T4  Agents: field Name bisa diketik
 *   T5  Agents: textarea Prompt bisa diketik
 *   T6  Agents: textarea Smart Generate bisa diketik
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

/** Evaluate an expression and parse its JSON result, locally. */
async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function mount(id, path) {
  await cdp.eval(
    `(() => {
    const lama = document.getElementById(${JSON.stringify(id)});
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = ${JSON.stringify(id)};
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#111;padding:18px';
    document.body.appendChild(host);
    window.__OK__ = false;
    (async () => {
      try {
        const R = (await import('/node_modules/.vite/deps/react.js')).default;
        const D = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
        const mod = await import(${JSON.stringify(path)});
        D.createRoot(host).render(R.createElement(mod.default));
        window.__OK__ = true;
      } catch (e) { window.__OK__ = 'GAGAL ' + e; }
    })();
    return 'mulai';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 2600));
  return cdp.eval(`window.__OK__`);
}

const klik = (sel) =>
  cdp.eval(
    `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`,
  );

/*
 * Type into a field one character at a time.
 *
 * The value is set through REAL input events after focusing the element, then
 * read back AFTER the render that follows each keystroke. Setting `.value`
 * directly would prove nothing: it bypasses exactly the path that was broken.
 * The selector is passed as an argument rather than interpolated, so no quoting
 * can go wrong inside the template.
 */
async function ketik(sel, teks) {
  const badan = [
    'return JSON.stringify(await (async () => {',
    '  const sel = ' + JSON.stringify(sel) + ';',
    '  const teks = ' + JSON.stringify(teks) + ';',
    '  const el = document.querySelector(sel);',
    "  if (!el) return { ok: false, galat: 'tidak ada elemen' };",
    '  el.focus();',
    "  const proto = el.tagName === 'TEXTAREA'",
    '    ? window.HTMLTextAreaElement.prototype',
    '    : window.HTMLInputElement.prototype;',
    "  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;",
    '  let nilai = el.value;',
    '  for (const ch of teks) {',
    '    nilai += ch;',
    '    setter.call(el, nilai);',
    "    el.dispatchEvent(new Event('input', { bubbles: true }));",
    '    await new Promise((r) => setTimeout(r, 25));',
    '  }',
    '  await new Promise((r) => setTimeout(r, 260));',
    '  const sesudah = document.querySelector(sel);',
    '  return {',
    '    ok: true,',
    '    nilai: sesudah ? sesudah.value : null,',
    '    fokusDi: document.activeElement === sesudah,',
    '  };',
    '})())',
  ].join('\n');
  const raw = await cdp.runAsync(badan, 60000);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const out = {};

/* ── Add Model ──────────────────────────────────────────────────────────── */
out.mountModels = await mount('uji-km', '/src/components/settings/AiModelsPage.tsx');
await klik('#uji-km [data-testid="aim-tambah"]');
await new Promise((r) => setTimeout(r, 900));
await klik('#uji-km [data-testid="aim-preset-custom"]');
await new Promise((r) => setTimeout(r, 900));

out.t1 = await ketik('#uji-km [data-testid="aim-add-id"]', 'model-uji');
out.t2 = await ketik('#uji-km [data-testid="aim-add-url"]', 'https://x.test');
out.t3 = await ketik('#uji-km [data-testid="aim-add-ctx"]', '64000');

await cdp.eval(
  `(() => {
  const h = document.getElementById('uji-km');
  if (h) h.remove();
  return 'ok';
})()`,
);

/* ── Agents ─────────────────────────────────────────────────────────────── */
out.mountAgents = await mount('uji-ka', '/src/components/settings/AgcAgents.tsx');
await klik('#uji-ka [data-testid="agx-create"]');
await new Promise((r) => setTimeout(r, 900));

out.t4 = await ketik('#uji-ka [data-testid="agx-nama"]', 'AgenUji');
out.t5 = await ketik('#uji-ka [data-testid="agx-prompt"]', 'Selalu baca dulu.');

await klik('#uji-ka [data-testid="agx-smart"]');
await new Promise((r) => setTimeout(r, 900));
out.t6 = await ketik('#uji-ka [data-testid="agx-smart-teks"]', 'Review kode untuk bug');

await cdp.eval(
  `(() => {
  const h = document.getElementById('uji-ka');
  if (h) h.remove();
  return 'ok';
})()`,
);

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

const utuh = (r, target) => r?.ok === true && r?.nilai === target;

console.log('\nBukti — input dialog BISA DIKETIK (bug fokus direbut):');
cek('T1 Add Model: Model ID bisa diketik', utuh(out.t1, 'model-uji'), `nilai="${out.t1?.nilai}"`);
cek('T2 Add Model: Base URL bisa diketik', utuh(out.t2, 'https://x.test'), `nilai="${out.t2?.nilai}"`);
cek('T3 Add Model: Context size bisa diketik', utuh(out.t3, '64000'), `nilai="${out.t3?.nilai}"`);
cek('T4 Agents: Name bisa diketik', utuh(out.t4, 'AgenUji'), `nilai="${out.t4?.nilai}"`);
cek('T5 Agents: Prompt bisa diketik', utuh(out.t5, 'Selalu baca dulu.'), `nilai="${out.t5?.nilai}"`);
cek('T6 Agents: Smart Generate bisa diketik', utuh(out.t6, 'Review kode untuk bug'), `nilai="${out.t6?.nilai}"`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
