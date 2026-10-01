// uji-t4-16.mjs — RESET SETTINGS tidak boleh menghilangkan UI.
//
// BUG NYATA yang diuji di sini (dilaporkan user: "gua buka menu kiri mlah
// hilang smua"): `reset_settings` di Rust MENGHAPUS settings.json, lalu
// `get_settings` mengembalikan `default_settings()` — dan default itu TIDAK
// memuat key `sidebar`, `layout`, `subagent`, `general.aiPanel`. Akibatnya
// `settings.sidebar` undefined → kelas `sidebar-pos-undefined` → seluruh
// sidebar (Explorer, Search, SCM, Settings nav) tidak ter-render.
//
// Uji ini memastikan: SETELAH reset, semua key yang dipakai frontend ada.
import { Cdp } from './lib-cdp.mjs';

const cek = (nama, syarat, info = '') => {
  console.log(`  ${syarat ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!syarat) process.exitCode = 1;
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Reset settings tidak boleh menghilangkan UI ===\n');

// ── V1: panggil reset_settings, lalu baca settings yang dikembalikan ───────
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('reset_settings');
  await new Promise((r) => setTimeout(r, 900));
  const s = await Ti.invoke('get_settings');
  return {
    sidebar: s.sidebar ?? null,
    layout: s.layout ?? null,
    aiPanel: s.general?.aiPanel ?? null,
    layoutGeneral: s.general?.layout ?? null,
    subagent: s.subagent ?? null,
    visibleTabs: s.panel?.visibleTabs ?? null,
    generalKeys: Object.keys(s.general ?? {}),
  };
})())`,
  90000,
);

cek('sidebar ada setelah reset', r1.sidebar !== null, String(r1.sidebar));
cek('sidebar bernilai valid', ['left', 'right', 'top', 'bottom'].includes(r1.sidebar), String(r1.sidebar));
cek('layout ada setelah reset', r1.layout !== null, String(r1.layout));
cek('general.aiPanel ada', r1.aiPanel !== null, String(r1.aiPanel));
cek('general.layout ada', r1.layoutGeneral !== null, String(r1.layoutGeneral));
cek('subagent ada', r1.subagent !== null, r1.subagent ? Object.keys(r1.subagent).join(',') : 'HILANG');
cek('subagent punya maxParallel', typeof r1.subagent?.maxParallel === 'number', String(r1.subagent?.maxParallel));
cek('subagent punya allowWrite', typeof r1.subagent?.allowWrite === 'boolean', String(r1.subagent?.allowWrite));
cek('panel.visibleTabs memuat ai', (r1.visibleTabs || []).includes('ai'), (r1.visibleTabs || []).join(','));
cek('panel.visibleTabs memuat subagents', (r1.visibleTabs || []).includes('subagents'));

// ── V2: setelah reset + reload, SELURUH UI harus tetap ada ────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 300));
  return 1;
})())`,
  60000,
);
await cdp.send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 13000));

const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__.getState();
  const body = document.querySelector('.app-body');
  return {
    sidebarNilai: S.settings.sidebar ?? null,
    kelasBody: body?.className,
    posUndefined: (body?.className || '').includes('sidebar-pos-undefined'),
    adaSidebar: !!document.querySelector('.sidebar'),
    adaActivityBar: !!document.querySelector('.activitybar'),
    adaMain: !!document.querySelector('.main-area'),
    anakBodyCol: [...(document.querySelector('.app-body-col')?.children || [])].map((e) => e.className),
    aiPanel: S.settings.general?.aiPanel ?? null,
    subagent: !!S.settings.subagent,
  };
})())`,
  90000,
);

cek('kelas body TIDAK "sidebar-pos-undefined"', r2.posUndefined === false, r2.kelasBody);
cek('SIDEBAR ter-render setelah reset', r2.adaSidebar === true, r2.anakBodyCol.join(' | '));
cek('ActivityBar ter-render', r2.adaActivityBar === true);
cek('area utama ter-render', r2.adaMain === true);
cek('settings.subagent tetap ada', r2.subagent === true);

// ── V3: sidebar bisa dibuka per ikon (regresi bug toggle) ─────────────────
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const out = {};
  // Ikon ActivityBar TOGGLE: klik saat sudah aktif MENUTUP sidebar. Jadi klik
  // hanya kalau memang belum aktif — kalau tidak, uji ini gagal sendiri saat
  // dijalankan berulang (pernah kejadian).
  const bukaIkon = async (id) => {
    const st = S.getState();
    if (st.activity === id && st.sidebarVisible) return;
    document.querySelector('[data-testid="ab-' + id + '"]')?.click();
    await new Promise((r) => setTimeout(r, 800));
  };
  await bukaIkon('explorer');
  out.explorer = { activity: S.getState().activity, ada: !!document.querySelector('.sidebar') };
  await bukaIkon('settings');
  await new Promise((r) => setTimeout(r, 700));
  out.settings = {
    activity: S.getState().activity,
    settingsOpen: S.getState().settingsOpen,
    nav: document.querySelectorAll('[data-testid^="set-nav-"]').length,
  };
  // Tutup lalu buka lagi (ini yang dulu rusak: activity nyangkut)
  S.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 600));
  document.querySelector('[data-testid="ab-settings"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  out.settingsLagi = {
    activity: S.getState().activity,
    settingsOpen: S.getState().settingsOpen,
    nav: document.querySelectorAll('[data-testid^="set-nav-"]').length,
  };
  // SCM
  await bukaIkon('scm');
  out.scm = { activity: S.getState().activity, ada: !!document.querySelector('.sidebar') };
  return out;
})())`,
  120000,
);

cek('ikon Explorer membuka sidebar', r3.explorer.ada === true && r3.explorer.activity === 'explorer', r3.explorer.activity);
cek('ikon Settings membuka halaman + nav', r3.settings.settingsOpen === true && r3.settings.nav > 0, `${r3.settings.nav} nav`);
cek('tutup lalu klik gear lagi -> TERBUKA', r3.settingsLagi.settingsOpen === true && r3.settingsLagi.nav > 0, `${r3.settingsLagi.nav} nav`);
cek('ikon SCM membuka sidebar', r3.scm.ada === true && r3.scm.activity === 'scm', r3.scm.activity);

await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setActivity('explorer');
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

await cdp.close();
console.log(`\n== ${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LULUS'} ==`);
