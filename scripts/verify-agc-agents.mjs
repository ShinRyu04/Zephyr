/*
 * Bukti: halaman Agents berbentuk referensi (TRAE).
 *
 * CATATAN ARSITEKTUR — kenapa uji ini menyuntik komponennya sendiri:
 *
 * Agent Customizations hidup di JENDELA TERPISAH (`#panel=agent-custom`), dan
 * jendela itu punya WebView serta instance store sendiri. CDP di port 9223
 * hanya melihat jendela utama, jadi menguji halaman itu lewat jendela aslinya
 * butuh target CDP kedua - dan di mesin ini jendela panel tidak membuka port
 * debug sendiri.
 *
 * Jadi yang diuji di sini adalah KOMPONENNYA, dipasang ke jendela utama lewat
 * jalur modul yang sama dengan yang dipakai jendela panel. Yang dibuktikan tetap
 * hal yang benar: struktur, label, dan perilaku halaman - bukan sekadar "file
 * ini ada".
 *
 *   A1  komponen bisa dipasang dan merender pane
 *   A2  ada seksi Custom Agents dan Built-In Agents
 *   A3  built-in Chat dan Agent tampil
 *   A4  menu ⋮ punya View Details
 *   A5  View Details menampilkan tool agent itu
 *   A6  tombol Create membuka editor dengan Name + Prompt + Smart Generate
 *   A7  checklist tool tampil
 *   A8  field delegasi muncul hanya setelah dicentang
 *   A9  membuat agent benar-benar menambah daftar di store
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* Wadah uji, di jendela utama. */
await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-agc-agen');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-agc-agen';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:24px';
  document.body.appendChild(host);
  return 'ok';
})()`,
);

/*
 * Mount the real component through React's own createRoot, using the module
 * Vite already serves. A hand-written copy of the markup would prove nothing.
 */
const mount = await cdp.json(
  `return JSON.stringify(await (async () => {
  try {
    const ReactMod = await import('/node_modules/.vite/deps/react.js');
    const React = ReactMod.default ?? ReactMod;
    const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
    const Dom = DomMod.default ?? DomMod;
    const createRoot = Dom.createRoot ?? DomMod.createRoot;
    if (typeof createRoot !== 'function') {
      return { ok: false, galat: 'createRoot tidak ada; kunci: ' + Object.keys(DomMod).join(',') };
    }
    const mod = await import('/src/components/settings/AgcAgents.tsx');
    const host = document.getElementById('uji-agc-agen');
    if (!host) return { ok: false, galat: 'host hilang' };
    const root = createRoot(host);
    root.render(React.createElement(mod.default));
    window.__UJI_AGC_ROOT__ = root;
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})())`,
  120000,
);
const mt = typeof mount === 'string' ? JSON.parse(mount) : mount;
console.log('mount:', JSON.stringify(mt));
await new Promise((r) => setTimeout(r, 1500));

const h = await cdp.json(
  `return JSON.stringify((() => {
  const out = {};
  const pane = document.querySelector('#uji-agc-agen .agx-pane');
  out.adaPane = !!pane;
  if (!pane) return out;
  out.judul = pane.querySelector('.agc-pane-title')?.textContent?.trim() ?? null;
  out.seksi = [...pane.querySelectorAll('.agx-seksi')].map((x) => x.textContent.trim());
  out.baris = [...pane.querySelectorAll('[data-testid^="agx-baris-"]')].map((x) =>
    x.getAttribute('data-testid').replace('agx-baris-', ''),
  );
  out.adaCreate = !!pane.querySelector('[data-testid="agx-create"]');
  const menuBtn = pane.querySelector('[data-testid="agx-menu-Agent"]') || pane.querySelector('.agx-menu-btn');
  if (menuBtn) menuBtn.click();
  return out;
})())`,
  60000,
);
const d = typeof h === 'string' ? JSON.parse(h) : h;
await new Promise((r) => setTimeout(r, 500));

const menu = await cdp.json(
  `return JSON.stringify((() => {
  const out = { adaMenu: !!document.querySelector('#uji-agc-agen .agx-menu') };
  const detail = document.querySelector('#uji-agc-agen [data-testid="agx-menu-detail"]');
  out.adaViewDetails = !!detail;
  if (detail) detail.click();
  return out;
})())`,
  60000,
);
d.menu = typeof menu === 'string' ? JSON.parse(menu) : menu;
await new Promise((r) => setTimeout(r, 900));

const detail = await cdp.json(
  `return JSON.stringify((() => {
  const pane = document.querySelector('#uji-agc-agen [data-testid="agx-detail"]');
  const out = { adaDetail: !!pane };
  if (!pane) return out;
  out.judul = pane.querySelector('.agc-pane-title')?.textContent?.trim() ?? null;
  out.alat = [...pane.querySelectorAll('[data-testid^="agx-detail-alat-"]')].map((x) =>
    x.getAttribute('data-testid').replace('agx-detail-alat-', ''),
  );
  out.adaKotakMCP = [...pane.querySelectorAll('.agx-kotak-head')].some((x) => /MCP/i.test(x.textContent || ''));
  out.adaKotakBuiltIn = [...pane.querySelectorAll('.agx-kotak-head')].some((x) => /Built-In/i.test(x.textContent || ''));
  const kembali = pane.querySelector('.agx-kembali');
  if (kembali) kembali.click();
  return out;
})())`,
  60000,
);
d.detail = typeof detail === 'string' ? JSON.parse(detail) : detail;
await new Promise((r) => setTimeout(r, 700));

await cdp.eval(
  `(() => {
  const create = document.querySelector('#uji-agc-agen [data-testid="agx-create"]');
  if (create) create.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 900));

const ed = await cdp.json(
  `return JSON.stringify((() => {
  const pane = document.querySelector('#uji-agc-agen [data-testid="agx-editor"]');
  const out = { adaEditor: !!pane };
  if (!pane) return out;
  out.adaNama = !!pane.querySelector('[data-testid="agx-nama"]');
  out.adaPrompt = !!pane.querySelector('[data-testid="agx-prompt"]');
  out.adaSmart = !!pane.querySelector('[data-testid="agx-smart"]');
  out.alat = [...pane.querySelectorAll('[data-testid^="agx-alat-"]')].map((x) =>
    x.getAttribute('data-testid').replace('agx-alat-', ''),
  );
  out.delegasiTersembunyi = !pane.querySelector('[data-testid="agx-id-inggris"]');
  const bisa = pane.querySelector('[data-testid="agx-bisa-dipanggil"]');
  if (bisa) bisa.click();
  return out;
})())`,
  60000,
);
d.editor = typeof ed === 'string' ? JSON.parse(ed) : ed;
await new Promise((r) => setTimeout(r, 600));

const deleg = await cdp.json(
  `return JSON.stringify((() => {
  const pane = document.querySelector('#uji-agc-agen [data-testid="agx-editor"]');
  return {
    adaIdInggris: !!pane?.querySelector('[data-testid="agx-id-inggris"]'),
    adaKapan: !!pane?.querySelector('[data-testid="agx-kapan"]'),
  };
})())`,
  60000,
);
d.delegasi = typeof deleg === 'string' ? JSON.parse(deleg) : deleg;

/* A9: isi nama, simpan, dan periksa store benar-benar bertambah. */
const sebelum = await cdp.json(
  `return JSON.stringify({ jumlah: window.__ZEPHYR_SUB__?.state?.().daftar?.length ?? -1 })`,
  60000,
);
d.sebelum = typeof sebelum === 'string' ? JSON.parse(sebelum) : sebelum;

await cdp.eval(
  `(() => {
  const nama = document.querySelector('#uji-agc-agen [data-testid="agx-nama"]');
  if (!nama) return 'no-nama';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(nama, 'Uji Agen');
  nama.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 400));

await cdp.eval(
  `(() => {
  const btn = document.querySelector('#uji-agc-agen [data-testid="agx-simpan"]');
  if (btn) btn.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 1500));

const sesudah = await cdp.json(
  `return JSON.stringify((() => {
  const g = window.__ZEPHYR_SUB__?.state?.();
  return {
    jumlah: g?.daftar?.length ?? -1,
    nama: (g?.daftar ?? []).map((x) => x.nama),
    adaDiDom: !!document.querySelector('#uji-agc-agen [data-testid="agx-baris-Uji Agen"]'),
  };
})())`,
  60000,
);
d.sesudah = typeof sesudah === 'string' ? JSON.parse(sesudah) : sesudah;

/* Bersihkan: lepas komponen, hapus agent uji, buang wadah. */
await cdp.eval(
  `(() => {
  try { window.__UJI_AGC_ROOT__?.unmount(); } catch (e) {}
  const host = document.getElementById('uji-agc-agen');
  if (host) host.remove();
  const g = window.__ZEPHYR_SUB__?.state?.();
  const uji = (g?.daftar ?? []).filter((x) => x.nama === 'Uji Agen');
  for (const a of uji) { void window.__ZEPHYR_SUB__.state().hapus(a.id); }
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 600));

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — halaman Agents berbentuk referensi:');
cek('A1 komponen merender pane', mt.ok === true && d.adaPane === true, `judul=${d.judul ?? '-'} ${mt.galat ?? ''}`);
cek(
  'A2 ada seksi Custom Agents dan Built-In Agents',
  (d.seksi ?? []).some((s) => /Custom Agents/i.test(s)) && (d.seksi ?? []).some((s) => /Built-In Agents/i.test(s)),
  (d.seksi ?? []).join(' | '),
);
cek(
  'A3 built-in Chat dan Agent tampil',
  (d.baris ?? []).includes('Chat') && (d.baris ?? []).includes('Agent'),
  (d.baris ?? []).join(', '),
);
cek('A4 menu punya View Details', d.menu?.adaViewDetails === true, '');
cek(
  'A5 View Details menampilkan tool agent',
  d.detail?.adaDetail === true && (d.detail?.alat ?? []).length > 0,
  `alat=${(d.detail?.alat ?? []).join(',')}`,
);
cek('A5b detail punya kotak MCP dan Built-In', d.detail?.adaKotakMCP === true && d.detail?.adaKotakBuiltIn === true, '');
cek(
  'A6 Create membuka editor (Name + Prompt + Smart Generate)',
  d.editor?.adaEditor === true && d.editor?.adaNama === true && d.editor?.adaPrompt === true && d.editor?.adaSmart === true,
  '',
);
cek('A7 checklist tool tampil (>= 5)', (d.editor?.alat ?? []).length >= 5, (d.editor?.alat ?? []).join(','));
cek('A8 field delegasi tersembunyi sampai dicentang', d.editor?.delegasiTersembunyi === true, '');
cek(
  'A8b mencentang Callable memunculkan Identifier + When to Call',
  d.delegasi?.adaIdInggris === true && d.delegasi?.adaKapan === true,
  '',
);
cek(
  'A9 membuat agent benar-benar menambah daftar',
  (d.sesudah?.jumlah ?? 0) > (d.sebelum?.jumlah ?? 0),
  `${d.sebelum?.jumlah} -> ${d.sesudah?.jumlah}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
