// verify-tata-letak-popup.mjs — C2/C3/C4/C5: Settings, Extensions, Dev Tools
// adalah JENDELA, bukan popup.
//
// LATAR (rilis 1.1.14, putaran kedua): ketiga permukaan ini sempat dibuat
// melayang di dalam app. Melayang berarti bingkai, scrim, drag offset, dan
// tombol maximize buatan sendiri — dan justru kombinasi itu yang bermasalah:
// kartu yang di-maximize sambil menyisakan offset drag menimpa isinya sendiri
// dengan rail kirinya. Keputusannya: ketiganya jadi jendela OS sungguhan.
//
// Uji ini mengunci janji itu, dan yang diuji adalah hal-hal yang TIDAK bisa
// dijamin type checker:
//
//   C2a gear ada di rail dan berada SETELAH avatar (paling bawah),
//   C2b klik gear TIDAK membuka popup di dalam app (tidak ada `settings-pop`,
//       tidak ada scrim) — jendelanya sendiri tidak bisa diperiksa dari sini
//       karena ia WebView terpisah; yang diperiksa adalah "tidak ada salinan
//       kedua di dalam app", yaitu keluhan "ada 2"-nya,
//   C2c Extensions dan Tools juga tidak membuka salinan di dalam app,
//   C2d tidak ada <aside> kosong yang tersisa setelah gear ditekan.
//
// Pemeriksaan "jendelanya benar-benar terbuka" ada di
// `verify-jendela-panel.mjs` (statis) dan diukur live lewat CDP ke target
// `#panel=...` bila app hidup.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) keluarBersih(1);
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Tata letak panel: JENDELA, bukan popup (C2-C5) ===\n');

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const out = {};

  /* Bersihkan sisa uji sebelumnya: tab view dan flag popup yang mati. */
  for (const t of S.getState().tabs.filter((x) => x.view === 'extensions' || x.view === 'tools')) {
    S.getState().requestCloseTab(t.id);
  }
  S.getState().setSettingsOpen(false);
  S.getState().setExtensionsOpen(false);
  S.getState().setToolsOpen(false);
  S.getState().setSidebarVisible(false);
  await tunggu(400);

  /* C2a: gear di rail, SETELAH avatar GitHub (paling bawah). */
  const rail = q('nav.activitybar');
  const tombol = [...(rail?.querySelectorAll('button') ?? [])];
  const ghIdx = tombol.findIndex((b) => b.getAttribute('data-testid') === 'ab-gh');
  const gearIdx = tombol.findIndex((b) => b.getAttribute('data-testid') === 'ab-settings');
  out.gear = { ada: gearIdx >= 0, diBawahAvatar: gearIdx > ghIdx, total: tombol.length };

  /*
   * C2b: klik gear TIDAK boleh menyisakan salinan di dalam app.
   *
   * Inilah keluhan "pas buka settings dia ada 2": popup lama masih dirender
   * bersama jendela barunya. Jendelanya sendiri adalah WebView lain, jadi dari
   * sini yang bisa dan HARUS diperiksa adalah ketiadaan salinan lokal.
   */
  tombol[gearIdx]?.click();
  await tunggu(1200);
  out.settings = {
    popupLokal: !!q('[data-testid="settings-pop"]'),
    scrimLokal: !!q('[data-testid="settings-pop-scrim"]'),
    /* Nav Settings tidak boleh muncul di dalam window ini sama sekali. */
    navLokal: document.querySelectorAll('[data-testid^="set-nav-"]').length,
    pageLokal: !!q('[data-testid="settings-page"]'),
    /* Flag store tidak boleh dinyalakan: itu jalur popup lama. */
    flagSettingsOpen: S.getState().settingsOpen === true,
    editorMasihAda: !!q('.editor-area'),
  };

  /* Tidak ada <aside> kosong yang tertinggal. */
  out.sidebar = {
    aside: !!q('aside.sidebar'),
    navDiSidebar: document.querySelectorAll('aside.sidebar [data-testid^="set-nav-"]').length,
  };

  /* C2c: Extensions — juga tidak boleh ada salinan lokal. */
  S.getState().setExtensionsOpen(true);
  await tunggu(900);
  out.extensions = {
    popupLokal: !!q('[data-testid="extensions-pop"]'),
    viewLokal: !!q('[data-testid="extensions-view"]'),
    flagNyala: S.getState().extensionsOpen === true,
    diSidebar: !!q('aside.sidebar [data-testid="extensions-view"]'),
  };

  /* C2d: Tools — idem. */
  S.getState().setToolsOpen(true);
  await tunggu(900);
  out.tools = {
    popupLokal: !!q('[data-testid="tools-pop"]'),
    viewLokal: !!q('[data-testid="tools-view"]'),
    flagNyala: S.getState().toolsOpen === true,
    diSidebar: !!q('aside.sidebar [data-testid="tools-view"]'),
  };

  /*
   * setActivity('settings') — pintu yang dipakai 10 pemanggil lama — harus
   * membuka JENDELA, bukan menyalakan flag popup. Kalau flag-nya menyala,
   * salinan lokal akan muncul lagi di build yang masih merender popup.
   */
  S.getState().setActivity('settings');
  await tunggu(700);
  out.setActivity = {
    flagSettingsOpen: S.getState().settingsOpen === true,
    popupLokal: !!q('[data-testid="settings-pop"]'),
  };

  /* Pulihkan. */
  S.getState().setSettingsOpen(false);
  S.getState().setExtensionsOpen(false);
  S.getState().setToolsOpen(false);
  for (const t of S.getState().tabs.filter((x) => x.view === 'extensions' || x.view === 'tools')) {
    S.getState().requestCloseTab(t.id);
  }
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  90000,
);

const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (h.fatal) {
  console.error('  GAGAL  halaman error:', h.fatal);
  keluarBersih(1);
}

console.log('C2 — Gear membuka JENDELA, bukan popup:');
cek('gear ada di rail', h.gear.ada === true);
cek('gear DI BAWAH avatar GitHub', h.gear.diBawahAvatar === true, `total tombol=${h.gear.total}`);
cek('TIDAK ada popup Settings di dalam app', h.settings.popupLokal === false);
cek('TIDAK ada scrim popup', h.settings.scrimLokal === false);
cek('nav Settings tidak dirender di window ini', h.settings.navLokal === 0, `${h.settings.navLokal} nav`);
cek('halaman Settings tidak dirender di window ini', h.settings.pageLokal === false);
cek('flag settingsOpen TIDAK dinyalakan', h.settings.flagSettingsOpen === false);
cek('editor tetap ada (window utama utuh)', h.settings.editorMasihAda === true);

console.log('\nC2b — Tidak ada kolom kiri yang tertinggal:');
cek('tidak ada <aside class=sidebar> kosong', h.sidebar.aside === false);
cek('tidak ada nav Settings di side bar', h.sidebar.navDiSidebar === 0);

console.log('\nC3 — Extensions juga jendela:');
cek('TIDAK ada popup Extensions', h.extensions.popupLokal === false);
cek('marketplace tidak dirender di window ini', h.extensions.viewLokal === false);
cek('flag extensionsOpen TIDAK dinyalakan', h.extensions.flagNyala === false);
cek('tidak lagi di side bar', h.extensions.diSidebar === false);

console.log('\nC4 — Dev Tools juga jendela:');
cek('TIDAK ada popup Tools', h.tools.popupLokal === false);
cek('tools tidak dirender di window ini', h.tools.viewLokal === false);
cek('flag toolsOpen TIDAK dinyalakan', h.tools.flagNyala === false);
cek('tidak lagi di side bar', h.tools.diSidebar === false);

console.log("\nC5 — setActivity('settings') membuka jendela:");
cek('tidak menyalakan flag popup', h.setActivity.flagSettingsOpen === false);
cek('tidak memunculkan salinan lokal', h.setActivity.popupLokal === false);

console.log('\nSemua lulus.');
keluarBersih(0);
