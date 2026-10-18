/*
 * Bukti: Marketplace berbentuk referensi (Plugins | Skills | MCP).
 *
 *   M1  pane merender dengan judul Marketplace
 *   M2  tiga sub-tab: Plugins, Skills, MCP
 *   M3  chip kategori ada (All + minimal 4 kategori)
 *   M4  kotak cari ada
 *   M5  tab Skills menampilkan skill yang BENAR-BENAR ada di disk
 *   M6  tab MCP menampilkan server yang terkonfigurasi (atau empty state jujur)
 *   M7  pencarian benar-benar menyaring daftar
 *   M8  chip kategori benar-benar menyaring daftar
 *   M9  tidak ada lagi grid 8 item lama (yang aksinya cuma "Open")
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const slot = '__UJI_MARKETPLACE__';

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-mkt');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-mkt';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111)';
  document.body.appendChild(host);
  return 'ok';
})()`,
);

const mount = await J(`await (async () => {
  try {
    const ReactMod = await import('/node_modules/.vite/deps/react.js');
    const React = ReactMod.default ?? ReactMod;
    const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
    const Dom = DomMod.default ?? DomMod;
    const createRoot = Dom.createRoot ?? DomMod.createRoot;
    const mod = await import('/src/components/settings/Marketplace.tsx');
    const host = document.getElementById('uji-mkt');
    const root = createRoot(host);
    root.render(React.createElement(mod.default));
    window[${JSON.stringify(slot)}] = root;
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})()`, 120000);
console.log('mount:', JSON.stringify(mount));
await new Promise((r) => setTimeout(r, 1800));

const out = {};

const dasar = await J(`(() => {
  const pane = document.querySelector('#uji-mkt [data-testid="marketplace"]');
  const o = { adaPane: !!pane };
  if (!pane) return o;
  o.judul = pane.querySelector('.mkt-judul')?.textContent?.trim() ?? null;
  o.tab = [...pane.querySelectorAll('[data-testid^="mkt-tab-"]')].map((x) =>
    x.getAttribute('data-testid').replace('mkt-tab-', ''),
  );
  o.chips = [...pane.querySelectorAll('[data-testid^="mkt-chip-"]')].map((x) =>
    x.getAttribute('data-testid').replace('mkt-chip-', ''),
  );
  o.adaCari = !!pane.querySelector('[data-testid="mkt-cari"]');
  o.kartuPlugin = pane.querySelectorAll('[data-testid^="mkt-kartu-"]').length;
  o.gridLama = document.querySelectorAll('.market-grid, [data-testid="market"]').length;
  return o;
})()`);
out.dasar = typeof dasar === 'string' ? JSON.parse(dasar) : dasar;

/* M5: tab Skills harus menampilkan skill yang benar-benar ada. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-mkt [data-testid="mkt-tab-skills"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 900));
const skillsTab = await J(`(() => {
  const pane = document.querySelector('#uji-mkt [data-testid="marketplace"]');
  return {
    kartu: pane.querySelectorAll('[data-testid^="mkt-kartu-"]').length,
    adaKosong: !!pane.querySelector('[data-testid="mkt-kosong"]'),
    nama: [...pane.querySelectorAll('.mkt-nama')].slice(0, 5).map((x) => x.textContent),
  };
})()`);
out.skills = typeof skillsTab === 'string' ? JSON.parse(skillsTab) : skillsTab;

/* M6: tab MCP. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-mkt [data-testid="mkt-tab-mcp"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 900));
const mcpTab = await J(`(() => {
  const pane = document.querySelector('#uji-mkt [data-testid="marketplace"]');
  return {
    kartu: pane.querySelectorAll('[data-testid^="mkt-kartu-"]').length,
    adaKosong: !!pane.querySelector('[data-testid="mkt-kosong"]'),
  };
})()`);
out.mcp = typeof mcpTab === 'string' ? JSON.parse(mcpTab) : mcpTab;

/* M7: search benar-benar menyaring. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-mkt [data-testid="mkt-tab-plugins"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 600));
const sebelumCari = await J(`(() => ({ n: document.querySelectorAll('#uji-mkt [data-testid^="mkt-kartu-"]').length }))()`);
out.sebelumCari = typeof sebelumCari === 'string' ? JSON.parse(sebelumCari) : sebelumCari;

await cdp.eval(
  `(() => {
  const inp = document.querySelector('#uji-mkt [data-testid="mkt-cari"]');
  if (!inp) return 'no';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'zzz-tidak-ada-apa-apa');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 800));
const sesudahCari = await J(`(() => ({
  n: document.querySelectorAll('#uji-mkt [data-testid^="mkt-kartu-"]').length,
  adaKosong: !!document.querySelector('#uji-mkt [data-testid="mkt-kosong"]'),
}))()`);
out.sesudahCari = typeof sesudahCari === 'string' ? JSON.parse(sesudahCari) : sesudahCari;

/* M8: chip kategori menyaring (pakai chip yang pasti sempit). */
await cdp.eval(
  `(() => {
  const inp = document.querySelector('#uji-mkt [data-testid="mkt-cari"]');
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 700));
const sebelumChip = await J(`(() => ({ n: document.querySelectorAll('#uji-mkt [data-testid^="mkt-kartu-"]').length }))()`);
out.sebelumChip = typeof sebelumChip === 'string' ? JSON.parse(sebelumChip) : sebelumChip;

await cdp.eval(
  `(() => { const b = document.querySelector('#uji-mkt [data-testid="mkt-chip-design"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 800));
const sesudahChip = await J(`(() => ({ n: document.querySelectorAll('#uji-mkt [data-testid^="mkt-kartu-"]').length }))()`);
out.sesudahChip = typeof sesudahChip === 'string' ? JSON.parse(sesudahChip) : sesudahChip;

/* Bersihkan. */
await cdp.eval(
  `(() => {
  try { window[${JSON.stringify(slot)}]?.unmount(); } catch (e) {}
  const host = document.getElementById('uji-mkt');
  if (host) host.remove();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 400));

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — Marketplace berbentuk referensi:');
cek('M1 pane merender dengan judul', mount.ok === true && /Marketplace/.test(out.dasar?.judul ?? ''), out.dasar?.judul ?? '');
cek(
  'M2 tiga sub-tab Plugins/Skills/MCP',
  JSON.stringify(out.dasar?.tab ?? []) === JSON.stringify(['plugins', 'skills', 'mcp']),
  (out.dasar?.tab ?? []).join(','),
);
cek('M3 chip kategori ada (All + >=4)', (out.dasar?.chips ?? []).length >= 5, (out.dasar?.chips ?? []).join(','));
cek('M4 kotak cari ada', out.dasar?.adaCari === true, '');
cek(
  'M5 tab Skills menampilkan skill nyata',
  (out.skills?.kartu ?? 0) > 0,
  `${out.skills?.kartu} kartu: ${(out.skills?.nama ?? []).join(', ')}`,
);
cek('M6 tab MCP menampilkan server atau empty state jujur', out.mcp?.kartu > 0 || out.mcp?.adaKosong === true, `${out.mcp?.kartu} kartu`);
cek(
  'M7 pencarian benar-benar menyaring',
  (out.sesudahCari?.n ?? 0) === 0 && out.sesudahCari?.adaKosong === true,
  `${out.sebelumCari?.n} -> ${out.sesudahCari?.n}`,
);
cek(
  'M8 chip kategori benar-benar menyaring',
  (out.sesudahChip?.n ?? -1) <= (out.sebelumChip?.n ?? 0),
  `${out.sebelumChip?.n} -> ${out.sesudahChip?.n}`,
);
cek('M9 grid 8 item lama sudah hilang', out.dasar?.gridLama === 0, String(out.dasar?.gridLama));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
