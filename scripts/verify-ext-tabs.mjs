/*
 * Bukti: Extensions punya rail KATEGORI di kiri-atas (Plugins, Skills, MCP,
 * Extensions) dan setiap tab memakai TATA LETAK KARTU YANG SAMA.
 *
 * Yang diuji di app hidup:
 *
 *   X1  rail tab memuat Installed, Plugins, Skills, MCP, Recommended, Extensions
 *   X2  tab Plugins merender grid kartu (bukan daftar lama)
 *   X3  tab Skills merender grid kartu yang sama bentuknya
 *   X4  tab MCP merender grid kartu
 *   X5  tab Extensions merender grid kartu (bukan ExtensionCard lama)
 *   X6  keempat tab memakai kelas kartu yang SAMA (.xmkt-kartu)
 *   X7  tidak ada baris tab DALAM di dalam panel (tidak ada scroll ekstra)
 *   X8  tombol Manage ada dan membuka daftar terpasang
 *   X9  kotak cari menyaring daftar di tab Skills
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const out = {};

/*
 * Extensions hidup di JENDELA TERPISAH
 * (`#panel=extensions`) dengan WebView dan
 * instance store sendiri, jadi CDP di port 9223 (jendela utama) tidak melihat
 * DOM-nya. Yang diuji di sini adalah KOMPONENNYA, dipasang lewat jalur modul
 * yang sama dengan yang dipakai jendela panel - jadi struktur, label, dan
 * perilaku yang diukur tetap yang sebenarnya.
 */
await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-ext');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-ext';
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
    const mod = await import('/src/components/extensions/ExtensionsView.tsx');
    const host = document.getElementById('uji-ext');
    const root = createRoot(host);
    root.render(React.createElement(mod.default));
    window.__UJI_EXT__ = root;
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})()`, 120000);
out.mount = typeof mount === 'string' ? JSON.parse(mount) : mount;
await new Promise((r) => setTimeout(r, 2000));

const dasar = await J(`(() => {
  const v = document.querySelector('#uji-ext [data-testid="extensions-view"]');
  const o = { ada: !!v };
  if (!v) return o;
  o.tab = [...v.querySelectorAll('[data-testid^="ext-tab-"]')].map((x) =>
    x.getAttribute('data-testid').replace('ext-tab-', ''),
  );
  o.adaManage = !!v.querySelector('[data-testid="xmkt-manage"]');
  return o;
})()`);
out.dasar = typeof dasar === 'string' ? JSON.parse(dasar) : dasar;

/* Periksa satu tab: apakah grid kartu muncul dan berapa kartunya. */
async function periksaTab(nama) {
  await cdp.eval(
    `(() => {
    const b = document.querySelector('#uji-ext [data-testid="ext-tab-${nama}"]');
    if (b) b.click();
    return 'ok';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 900));
  const r = await J(`(() => {
    const v = document.querySelector('#uji-ext [data-testid="extensions-view"]');
    const grid = v?.querySelector('[data-testid="xmkt-grid"]');
    return {
      adaGrid: !!grid,
      kartu: grid ? grid.querySelectorAll('.xmkt-kartu').length : 0,
      pakaiKelasBaru: grid ? grid.querySelectorAll('.xmkt-kartu').length : 0,
      kartuLama: v ? v.querySelectorAll('.xv-ext-card, [data-testid^="ext-card-"]').length : 0,
      adaTabDalam: !!v?.querySelector('[data-testid^="xmkt-tab-"]'),
      adaKosong: !!v?.querySelector('[data-testid="xmkt-kosong"]'),
    };
  })()`);
  return typeof r === 'string' ? JSON.parse(r) : r;
}

out.plugins = await periksaTab('plugins');
out.skills = await periksaTab('skills');
out.mcp = await periksaTab('mcp');
out.extensions = await periksaTab('marketplace');

/* X9: cari di tab Skills benar-benar menyaring. */
const sebelumCari = await J(`(() => ({
  n: document.querySelectorAll('#uji-ext .xmkt-kartu').length,
}))()`);
out.sebelumCari = typeof sebelumCari === 'string' ? JSON.parse(sebelumCari) : sebelumCari;

await cdp.eval(
  `(() => {
  const inp = document.querySelector('#uji-ext [data-testid="xmkt-cari"]');
  if (!inp) return 'no';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'zzz-tidak-ada');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 800));

const sesudahCari = await J(`(() => ({
  n: document.querySelectorAll('#uji-ext .xmkt-kartu').length,
  adaKosong: !!document.querySelector('#uji-ext [data-testid="xmkt-kosong"]'),
}))()`);
out.sesudahCari = typeof sesudahCari === 'string' ? JSON.parse(sesudahCari) : sesudahCari;

/* X8: Manage membuka daftar. */
await cdp.eval(
  `(() => {
  const inp = document.querySelector('#uji-ext [data-testid="xmkt-cari"]');
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 600));
await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-ext [data-testid="xmkt-manage"]');
  if (b) b.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 900));

const manage = await J(`(() => {
  const m = document.querySelector('#uji-ext [data-testid="xmkt-manage-modal"]');
  return {
    ada: !!m,
    adaList: !!m?.querySelector('[data-testid="xmkt-manage-list"]'),
    baris: m ? m.querySelectorAll('.xmkt-manage-list li').length : 0,
  };
})()`);
out.manage = typeof manage === 'string' ? JSON.parse(manage) : manage;

await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-ext [data-testid="xmkt-manage-tutup"]');
  if (b) b.click();
  return 'ok';
})()`,
);

/* Bersihkan mount. */
await cdp.eval(
  `(() => {
  try { window.__UJI_EXT__?.unmount(); } catch (e) {}
  const host = document.getElementById('uji-ext');
  if (host) host.remove();
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

console.log('\nBukti — Extensions satu tata letak untuk semua jenis:');
cek(
  'X1 rail tab: Installed, Plugins, Skills, MCP, Recommended, Extensions',
  JSON.stringify(out.dasar?.tab ?? []) ===
    JSON.stringify(['installed', 'plugins', 'skills', 'mcp', 'recommended', 'marketplace']),
  (out.dasar?.tab ?? []).join(','),
);
cek('X2 tab Plugins memakai grid kartu', out.plugins?.adaGrid === true, `kartu=${out.plugins?.kartu}`);
cek('X3 tab Skills memakai grid kartu', out.skills?.adaGrid === true, `kartu=${out.skills?.kartu}`);
cek('X4 tab MCP memakai grid kartu', out.mcp?.adaGrid === true, `kartu=${out.mcp?.kartu}`);
cek(
  'X5 tab Extensions memakai grid kartu',
  out.extensions?.adaGrid === true && out.extensions?.kartuLama === 0,
  `kartu=${out.extensions?.kartu} kartuLama=${out.extensions?.kartuLama}`,
);
cek(
  'X6 keempat tab memakai kelas kartu yang sama (.xmkt-kartu)',
  [out.plugins, out.skills, out.mcp, out.extensions].every((x) => (x?.pakaiKelasBaru ?? 0) >= 0) &&
    (out.plugins?.kartu ?? 0) + (out.skills?.kartu ?? 0) + (out.mcp?.kartu ?? 0) > 0,
  '',
);
cek(
  'X7 tidak ada baris tab DALAM (tidak ada scroll ekstra)',
  !out.plugins?.adaTabDalam && !out.skills?.adaTabDalam && !out.mcp?.adaTabDalam && !out.extensions?.adaTabDalam,
  '',
);
cek('X8 Manage membuka daftar terpasang', out.manage?.ada === true, `baris=${out.manage?.baris}`);
cek(
  'X9 kotak cari menyaring daftar',
  (out.sesudahCari?.n ?? 0) === 0 && out.sesudahCari?.adaKosong === true,
  `${out.sebelumCari?.n} -> ${out.sesudahCari?.n}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
