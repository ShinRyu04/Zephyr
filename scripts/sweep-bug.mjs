// dbg-sweep.mjs — SWEEP BUG menyeluruh: semua fitur utama, cari yang rusak.
//
// Tujuan: sebelum update GitHub, pastikan tidak ada fitur yang mati diam-diam.
// Yang diperiksa: struktur shell, tiap ikon ActivityBar, tiap tab panel,
// Settings semua section, AI (bawah + kanan + maximize), command palette,
// terminal, editor, dan error console.
import { Cdp } from './lib-cdp.mjs';

const hasil = [];
const cek = (nama, ok, info = '') => {
  hasil.push({ nama, ok, info });
  console.log(`  ${ok ? 'OK  ' : 'RUSAK'}  ${nama}${info ? `  — ${info}` : ''}`);
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.send('Runtime.enable');
const errs = [];
cdp.on?.('Runtime.exceptionThrown', (p) =>
  errs.push(p?.exceptionDetails?.exception?.description?.slice(0, 200)),
);

await cdp.send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 14000));
console.log('=== SWEEP BUG ===\n');

// ── 1. Struktur shell ────────────────────────────────────────────────────
const s1 = await cdp.json(
  `return JSON.stringify({
  activitybar: !!document.querySelector('.activitybar'),
  sidebar: !!document.querySelector('.sidebar'),
  main: !!document.querySelector('.main-area'),
  statusbar: !!document.querySelector('.statusbar'),
  menubar: !!document.querySelector('.menubar'),
  errBoundary: document.querySelectorAll('.err-boundary').length,
  posUndefined: (document.querySelector('.app-body')?.className || '').includes('undefined'),
  sidebarNilai: window.__ZEPHYR__.getState().settings.sidebar,
})`,
  90000,
);
cek('ActivityBar ada', s1.activitybar);
cek('Sidebar ada', s1.sidebar);
cek('Area utama ada', s1.main);
cek('StatusBar ada', s1.statusbar);
cek('MenuBar ada', s1.menubar);
cek('Tidak ada ErrorBoundary', s1.errBoundary === 0, `${s1.errBoundary} boundary`);
cek('Tidak ada kelas "undefined"', !s1.posUndefined, s1.sidebarNilai ?? 'null');

// ── 2. Semua ikon ActivityBar bisa dibuka ────────────────────────────────
const IKON = ['explorer', 'search', 'scm', 'debug', 'ai', 'terminal', 'extensions', 'settings'];
const s2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const out = [];
  for (const id of ${JSON.stringify(IKON)}) {
    // Deterministik: set lewat store (ikon itu toggle).
    S.getState().setActivity(id);
    S.getState().setSidebarVisible(true);
    if (id === 'settings') S.getState().setSettingsOpen(true);
    await new Promise((r) => setTimeout(r, 600));
    const sb = document.querySelector('.sidebar');
    out.push({
      id,
      adaSidebar: !!sb,
      panjangIsi: sb ? sb.innerHTML.length : 0,
      settingsOpen: S.getState().settingsOpen,
    });
    if (id === 'settings') S.getState().setSettingsOpen(false);
  }
  return out;
})())`,
  150000,
);
for (const x of s2) {
  cek(`ikon "${x.id}" membuka sidebar berisi`, x.adaSidebar && x.panjangIsi > 200, `${x.panjangIsi} char`);
}

// ── 3. Semua tab panel bawah bisa dibuka ─────────────────────────────────
const TABS = ['problems', 'output', 'debug', 'terminal', 'ports', 'ai', 'subagents'];
const s3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const P = window.__ZEPHYR_PANEL__;
  const T = window.__ZEPHYR_TERM__;
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  await new Promise((r) => setTimeout(r, 900));
  T.getState().setVisible(true);
  await new Promise((r) => setTimeout(r, 500));
  const out = [];
  for (const t of ${JSON.stringify(TABS)}) {
    P.store.getState().focusTab(t);
    await new Promise((r) => setTimeout(r, 600));
    const body = document.querySelector('[data-testid="panel-body"]');
    out.push({ t, aktif: P.store.getState().activeTab, panjangIsi: body ? body.innerHTML.length : 0 });
  }
  return out;
})())`,
  150000,
);
for (const x of s3) {
  cek(`tab "${x.t}" menampilkan isi`, x.aktif === x.t && x.panjangIsi > 50, `${x.panjangIsi} char`);
}

// ── 4. AI: bawah, kanan, maximize ────────────────────────────────────────
const s4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const P = window.__ZEPHYR_PANEL__;
  const T = window.__ZEPHYR_TERM__;
  const out = {};
  // Bawah
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  await new Promise((r) => setTimeout(r, 1100));
  T.getState().setVisible(true);
  P.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1300));
  out.bawah = {
    panel: document.querySelectorAll('[data-testid="ai-panel"]').length,
    input: !!document.querySelector('[data-testid="ai-input"]'),
    kirim: !!document.querySelector('[data-testid="ai-send"]'),
    model: !!document.querySelector('[data-testid="ai-model-btn"]'),
  };
  // Kanan
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await new Promise((r) => setTimeout(r, 1400));
  out.kanan = {
    kolom: !!document.querySelector('.ai-side-col'),
    panel: document.querySelectorAll('[data-testid="ai-panel"]').length,
    input: !!document.querySelector('[data-testid="ai-input"]'),
    max: !!document.querySelector('[data-testid="ai-max"]'),
    resizer: !!document.querySelector('[data-testid="ai-resizer"]'),
  };
  // Maximize
  document.querySelector('[data-testid="ai-max"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const kolom = document.querySelector('.ai-side-col');
  out.max = {
    aktif: S.getState().aiMax,
    lebar: kolom ? Math.round(kolom.getBoundingClientRect().width) : 0,
  };
  document.querySelector('[data-testid="ai-max"]')?.click();
  await new Promise((r) => setTimeout(r, 700));
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  await new Promise((r) => setTimeout(r, 700));
  return out;
})())`,
  180000,
);
cek('AI di bawah: panel + input + tombol kirim + pemilih model',
  s4.bawah.panel === 1 && s4.bawah.input && s4.bawah.kirim && s4.bawah.model,
  `panel=${s4.bawah.panel}`);
cek('AI di kanan: kolom + input + maximize + resizer',
  s4.kanan.kolom && s4.kanan.panel === 1 && s4.kanan.input && s4.kanan.max && s4.kanan.resizer);
cek('maximize melebarkan kolom', s4.max.aktif && s4.max.lebar > 800, `${s4.max.lebar}px`);

// ── 5. Command palette: duplikat + isi ───────────────────────────────────
const s5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const CP = window.__ZEPHYR_CP__;
  CP.open('command');
  await new Promise((r) => setTimeout(r, 1200));
  const items = CP.items();
  const hitung = {};
  for (const i of items) hitung[i.label] = (hitung[i.label] || 0) + 1;
  const dup = Object.entries(hitung).filter(([, n]) => n > 1);
  const idHitung = {};
  for (const i of items) idHitung[i.id] = (idHitung[i.id] || 0) + 1;
  const dupId = Object.entries(idHitung).filter(([, n]) => n > 1);
  CP.close();
  return { total: items.length, dup: dup.length, dupId: dupId.length, contohDup: dup.slice(0, 3) };
})())`,
  120000,
);
cek('palette tanpa duplikat', s5.dup === 0 && s5.dupId === 0, `${s5.total} command, ${s5.dup} dup label, ${s5.dupId} dup id`);

// ── 6. Editor: buka file & ketik ─────────────────────────────────────────
const s6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().newUntitled();
  await new Promise((r) => setTimeout(r, 1200));
  const ta = document.querySelector('.cm-content');
  return {
    adaTab: S.getState().tabs.length > 0,
    adaEditor: !!ta,
    jumlahTab: S.getState().tabs.length,
  };
})())`,
  120000,
);
cek('editor bisa buka tab baru', s6.adaTab && s6.adaEditor, `${s6.jumlahTab} tab`);

// ── 7. Settings: semua section punya judul + kontrol ─────────────────────
const s7 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSidebarVisible(true);
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 1200));
  const nav = [...document.querySelectorAll('.set-nav-item')];
  const out = [];
  for (const n of nav) {
    const id = (n.getAttribute('data-testid') || '').replace('set-nav-', '');
    n.click();
    await new Promise((r) => setTimeout(r, 320));
    const body = document.querySelector('.set-body');
    out.push({
      id,
      judul: document.querySelector('.set-h2')?.textContent?.trim() ?? '',
      kontrol: body ? body.querySelectorAll('button, input, select').length : 0,
    });
  }
  return out;
})())`,
  200000,
);
const tanpaJudul = s7.filter((x) => !x.judul);
const tanpaKontrol = s7.filter((x) => x.kontrol < 1);
cek('semua section Settings punya judul', tanpaJudul.length === 0, tanpaJudul.map((x) => x.id).join(',') || `${s7.length} section`);
cek('semua section punya kontrol', tanpaKontrol.length === 0, tanpaKontrol.map((x) => x.id).join(',') || 'ok');

// ── 8. Error console ─────────────────────────────────────────────────────
const s8 = await cdp.json(
  `return JSON.stringify({
  errors: (window.__ZEPHYR_ERRORS__ || []).slice(-8),
  boundary: document.querySelectorAll('.err-boundary').length,
})`,
  60000,
);
cek('tidak ada error console', (s8.errors || []).length === 0, JSON.stringify(s8.errors || []).slice(0, 150));
cek('tidak ada ErrorBoundary', s8.boundary === 0);

await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  window.__ZEPHYR__.getState().setActivity('explorer');
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

await cdp.close();

const rusak = hasil.filter((h) => !h.ok);
console.log(`\n== ${hasil.length - rusak.length}/${hasil.length} OK ==`);
if (rusak.length) {
  console.log('\nRUSAK:');
  for (const r of rusak) console.log(`  - ${r.nama}  ${r.info}`);
  process.exitCode = 1;
}
if (errs.length) console.log('\nEXCEPTIONS:\n' + errs.slice(-4).join('\n---\n'));
