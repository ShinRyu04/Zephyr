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

  /* Bersihkan sisa uji sebelumnya. */
  for (const t of S.getState().tabs.filter((x) => x.view === 'extensions' || x.view === 'tools')) {
    S.getState().requestCloseTab(t.id);
  }
  S.getState().setSettingsOpen(false);
  S.getState().setExtensionsOpen(false);
  S.getState().setToolsOpen(false);
  await tunggu(400);

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
    pop: !!q('[data-testid="settings-pop"]'),
    scrim: !!q('[data-testid="settings-pop-scrim"]'),
    nav: document.querySelectorAll('[data-testid^="set-nav-"]').length,
    page: !!q('[data-testid="settings-page"]'),
    bukanPenuhArea: !q('.set-topbar'),
    editorMasihAda: !!q('.editor-area'),
    role: q('[data-testid="settings-pop"]')?.getAttribute('role'),
  };

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
    pop: !!q('[data-testid="extensions-pop"]'),
    view: !!q('[data-testid="extensions-view"]'),
    tombolEditor: !!q('[data-testid="extensions-pop-open-editor"]'),
    bukanDiSidebar: !q('aside.sidebar [data-testid="extensions-view"]'),
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
    pop: !!q('[data-testid="tools-pop"]'),
    view: !!q('[data-testid="tools-view"]'),
    tab: document.querySelectorAll('[data-testid^="tools-tab-"]').length,
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
cek('Escape menutup', h.escMenutup === true);
cek('klik scrim menutup', h.scrimMenutup === true);

console.log('\nC3 — Extensions melayang + Open in Editor:');
cek('popup Extensions terbuka', h.extensions.pop === true);
cek('isi marketplace dirender', h.extensions.view === true);
cek('tombol Open in Editor ada', h.extensions.tombolEditor === true);
cek('tidak lagi di side bar', h.extensions.bukanDiSidebar === true);
cek('tombol menutup popup', h.openInEditor.popTutup === true);
cek('tombol membuka tab editor', h.openInEditor.tabAda === true);
cek('halaman ikut pindah ke tab', h.openInEditor.viewDiTab === true);

console.log('\nC4 — Dev Tools melayang:');
cek('popup Tools terbuka', h.tools.pop === true);
cek('isi tools dirender', h.tools.view === true);
cek('empat tab tetap ada', h.tools.tab === 4, `${h.tools.tab} tab`);
cek('popup bisa ditutup', h.toolsTutup === true);

console.log('\nSemua lulus.');
keluarBersih(0);
