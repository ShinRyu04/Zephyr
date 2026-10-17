// verify-tata-letak-popup.mjs — C2/C3/C4/C5: Settings, Extensions, Dev Tools melayang.
//
// Latar (rilis 1.1.14): ketiga permukaan ini dulu menelan seluruh area editor /
// side bar. Pembaca kehilangan berkas yang sedang dibuka hanya untuk melihat
// preferensi, dan "kembali" berarti mencari tabnya. Sekarang ketiganya melayang
// di atas pekerjaan, dengan scrim, Escape, dan klik-luar untuk menutup; gear
// pindah ke slot paling bawah ActivityBar, DI BAWAH avatar GitHub.
//
// Uji ini mengunci janji itu:
//   C2a gear ada di rail dan berada SETELAH tombol avatar (paling bawah),
//   C2b klik gear membuka popup Settings berisi nav + halaman, dan editor tetap ada,
//   C2c Escape menutup popup,
//   C2d klik scrim menutup popup,
//   C3a Extensions membuka popup (bukan side bar) dengan tombol "Open in Editor",
//   C3b tombol itu menutup popup lalu membuka tab editor yang sama,
//   C4a Dev Tools membuka popup dengan empat tab,
//   C4b popup Tools bisa ditutup dan ikonnya tidak lagi menelan area editor.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) keluarBersih(1);
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Tata letak popup (C2-C5) ===\n');

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const out = {};

  /*
   * Geometry, not just existence.
   *
   * The first version of this harness only asked "is the popup in the DOM?".
   * It passed while every popup was rendered OFF-SCREEN: the card was centred
   * with negative percentage margins (which resolve against the viewport) on
   * top of a translate, so it sat half a window too high and the reader saw
   * nothing but its bottom edge. "In the DOM" is not "the user can see it".
   */
  const ukur = (testid) => {
    const el = q('[data-testid="' + testid + '"]');
    if (!el) return { ada: false };
    const r = el.getBoundingClientRect();
    return {
      ada: true,
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      /* Fully inside the viewport, with no edge cut off. */
      diLayar:
        r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
      /* Centre within a few pixels of the viewport centre. */
      tengah:
        Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2) < 24 &&
        Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) < 24,
      /* Body actually has height: a card with a collapsed body is empty. */
      bodyH: Math.round(q('[data-testid="' + testid + '"] .mpop-body')?.getBoundingClientRect().height ?? 0),
    };
  };

  /* Bersihkan sisa uji sebelumnya. */
  for (const t of S.getState().tabs.filter((x) => x.view === 'extensions' || x.view === 'tools')) {
    S.getState().requestCloseTab(t.id);
  }
  S.getState().setSettingsOpen(false);
  S.getState().setExtensionsOpen(false);
  S.getState().setToolsOpen(false);
  await tunggu(400);

  /* Mulai dari keadaan rapi: sidebar tertutup, tak ada popup. */
  S.getState().setSidebarVisible(false);
  await tunggu(300);

  /* C2a: gear di bawah avatar. */
  const rail = q('nav.activitybar');
  const tombol = [...(rail?.querySelectorAll('button') ?? [])];
  const ghIdx = tombol.findIndex((b) => b.getAttribute('data-testid') === 'ab-gh');
  const gearIdx = tombol.findIndex((b) => b.getAttribute('data-testid') === 'ab-settings');
  out.gear = { ada: gearIdx >= 0, diBawahAvatar: gearIdx > ghIdx, total: tombol.length };

  /* C2b: klik gear -> popup berisi nav + halaman, editor tetap hidup. */
  tombol[gearIdx]?.click();
  await tunggu(900);
  out.settings = {
    ukuran: ukur('settings-pop'),
    pop: !!q('[data-testid="settings-pop"]'),
    scrim: !!q('[data-testid="settings-pop-scrim"]'),
    nav: document.querySelectorAll('[data-testid^="set-nav-"]').length,
    page: !!q('[data-testid="settings-page"]'),
    bukanPenuhArea: !q('.set-topbar'),
    editorMasihAda: !!q('.editor-area'),
    role: q('[data-testid="settings-pop"]')?.getAttribute('role'),
  };

  /* Sidebar: tidak boleh ada <aside> kosong, nav tidak boleh dobel. */
  out.sidebar = {
    aside: !!q('aside.sidebar'),
    navDiSidebar: document.querySelectorAll('aside.sidebar [data-testid^="set-nav-"]').length,
    navDiPopup: document.querySelectorAll('[data-testid="settings-pop"] [data-testid^="set-nav-"]').length,
  };

  /* Maximize: ukur sebelum, klik, ukur sesudah, lalu Escape. */
  const tombolMax = q('[data-testid="settings-pop-max"]');
  out.maximize = { adaTombol: !!tombolMax, sebelum: ukur('settings-pop') };
  tombolMax?.click();
  await tunggu(600);
  out.maximize.setelah = ukur('settings-pop');
  out.maximize.label = q('[data-testid="settings-pop-max"]')?.textContent?.trim() ?? null;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tunggu(500);
  out.maximize.escMasihTerbuka = !!q('[data-testid="settings-pop"]');
  out.maximize.escUkuran = ukur('settings-pop');

  /* C2c: Escape menutup. */
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tunggu(500);
  out.escMenutup = !q('[data-testid="settings-pop"]');

  /* C2d: klik scrim menutup. */
  S.getState().setSettingsOpen(true);
  await tunggu(600);
  q('[data-testid="settings-pop-scrim"]')?.click();
  await tunggu(500);
  out.scrimMenutup = !q('[data-testid="settings-pop"]');

  /* C3a: Extensions popup, bukan side bar. */
  S.getState().setExtensionsOpen(true);
  await tunggu(1000);
  out.extensions = {
    ukuran: ukur('extensions-pop'),
    pop: !!q('[data-testid="extensions-pop"]'),
    view: !!q('[data-testid="extensions-view"]'),
    tombolEditor: !!q('[data-testid="extensions-pop-open-editor"]'),
    bukanDiSidebar: !q('aside.sidebar [data-testid="extensions-view"]'),
    sidebarAside: !!q('aside.sidebar'),
    adaMax: !!q('[data-testid="extensions-pop-max"]'),
  };

  /* C3b: "Open in Editor" menutup popup dan membuka tab. */
  q('[data-testid="extensions-pop-open-editor"]')?.click();
  await tunggu(1100);
  out.openInEditor = {
    popTutup: !q('[data-testid="extensions-pop"]'),
    tabAda: !!q('[data-testid="ai-view-tab-extensions"]'),
    viewDiTab: !!q('[data-testid="ai-view-tab-extensions"] [data-testid="extensions-view"]'),
  };

  /* C4a: Dev Tools popup dengan empat tab. */
  S.getState().setToolsOpen(true);
  await tunggu(1000);
  out.tools = {
    ukuran: ukur('tools-pop'),
    pop: !!q('[data-testid="tools-pop"]'),
    view: !!q('[data-testid="tools-view"]'),
    tab: document.querySelectorAll('[data-testid^="tools-tab-"]').length,
    sidebarAside: !!q('aside.sidebar'),
    adaMax: !!q('[data-testid="tools-pop-max"]'),
  };

  /* C4b: tutup lagi. */
  S.getState().setToolsOpen(false);
  await tunggu(400);
  out.toolsTutup = !q('[data-testid="tools-pop"]');

  /* Pulihkan. */
  for (const t of S.getState().tabs.filter((x) => x.view === 'extensions' || x.view === 'tools')) {
    S.getState().requestCloseTab(t.id);
  }
  S.getState().setSettingsOpen(false);
  S.getState().setExtensionsOpen(false);
  S.getState().setToolsOpen(false);
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  90000,
);

const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (h.fatal) {
  console.error('  GAGAL  halaman error:', h.fatal);
  keluarBersih(1);
}

console.log('C2 — Settings melayang, gear di bawah avatar:');
cek('gear ada di rail', h.gear.ada === true);
cek('gear DI BAWAH avatar GitHub', h.gear.diBawahAvatar === true, `gear=#${h.gear.total}, total=${h.gear.total}`);
cek('popup Settings terbuka', h.settings.pop === true);
cek('scrim ada', h.settings.scrim === true);
cek('nav ikut di dalam popup', h.settings.nav > 0, `${h.settings.nav} nav`);
cek('halaman Setelan dirender', h.settings.page === true);
cek('bukan lagi penuh-area', h.settings.bukanPenuhArea === true);
cek('editor tetap ada di belakang', h.settings.editorMasihAda === true);
cek('role=dialog', h.settings.role === 'dialog');
cek('popup SEPENUHNYA terlihat di layar', h.settings.ukuran.diLayar === true,
  `${h.settings.ukuran.w}x${h.settings.ukuran.h} @ top=${h.settings.ukuran.top}`);
cek('popup terpusat di jendela', h.settings.ukuran.tengah === true);
cek('isi popup punya tinggi', h.settings.ukuran.bodyH > 100, `body=${h.settings.ukuran.bodyH}px`);
cek('Escape menutup', h.escMenutup === true);
cek('klik scrim menutup', h.scrimMenutup === true);

/*
 * Side bar tidak boleh ikut terbuka.
 *
 * Settings dulu adalah view side bar, jadi membuka panel ini sekalian
 * menampilkan kolom kiri. Sekarang nav-nya ada DI DALAM kartu: kolom kiri yang
 * tetap dirender hanya menyisakan strip kosong ber-border yang terbaca sebagai
 * bayangan panel. Yang diuji: tidak ada <aside class=sidebar>, dan tidak ada
 * satu pun nav Settings di luar popup.
 */
cek('side bar TIDAK ikut terbuka', h.sidebar.aside === false);
cek('nav Settings tidak dobel di kiri', h.sidebar.navDiSidebar === 0,
  `${h.sidebar.navDiSidebar} nav di sidebar`);
cek('nav Settings ada di dalam popup', h.sidebar.navDiPopup > 0,
  `${h.sidebar.navDiPopup} nav di popup`);

console.log('\nC2e - Maximize:');
cek('tombol Maximize ada', h.maximize.adaTombol === true);
cek('maximize memperbesar kotak',
  h.maximize.setelah.w > h.maximize.sebelum.w && h.maximize.setelah.h > h.maximize.sebelum.h,
  `${h.maximize.sebelum.w}x${h.maximize.sebelum.h} -> ${h.maximize.setelah.w}x${h.maximize.setelah.h}`);
cek('maximize tetap di layar', h.maximize.setelah.diLayar === true);
cek('label berubah jadi Restore', h.maximize.label === 'Restore', String(h.maximize.label));
cek('Escape saat maximize: kembali, bukan menutup',
  h.maximize.escMasihTerbuka === true && h.maximize.escUkuran.w === h.maximize.sebelum.w);

console.log('\nC3 — Extensions melayang + Open in Editor:');
cek('popup Extensions terbuka', h.extensions.pop === true);
cek('isi marketplace dirender', h.extensions.view === true);
cek('tombol Open in Editor ada', h.extensions.tombolEditor === true);
cek('tidak lagi di side bar', h.extensions.bukanDiSidebar === true);
cek('Extensions TIDAK membuka side bar', h.extensions.sidebarAside === false);
cek('Extensions punya Maximize', h.extensions.adaMax === true);
cek('popup Extensions terlihat penuh', h.extensions.ukuran.diLayar === true,
  `${h.extensions.ukuran.w}x${h.extensions.ukuran.h} @ top=${h.extensions.ukuran.top}`);
cek('popup Extensions terpusat', h.extensions.ukuran.tengah === true);
cek('tombol menutup popup', h.openInEditor.popTutup === true);
cek('tombol membuka tab editor', h.openInEditor.tabAda === true);
cek('halaman ikut pindah ke tab', h.openInEditor.viewDiTab === true);

console.log('\nC4 — Dev Tools melayang:');
cek('popup Tools terbuka', h.tools.pop === true);
cek('isi tools dirender', h.tools.view === true);
cek('empat tab tetap ada', h.tools.tab === 4, `${h.tools.tab} tab`);
cek('Tools TIDAK membuka side bar', h.tools.sidebarAside === false);
cek('Tools punya Maximize', h.tools.adaMax === true);
cek('popup Tools terlihat penuh', h.tools.ukuran.diLayar === true,
  `${h.tools.ukuran.w}x${h.tools.ukuran.h} @ top=${h.tools.ukuran.top}`);
cek('popup Tools terpusat', h.tools.ukuran.tengah === true);
cek('popup bisa ditutup', h.toolsTutup === true);

console.log('\nSemua lulus.');
keluarBersih(0);
