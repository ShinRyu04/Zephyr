// uji-t6-tema-mode.mjs — mode tampilan (pill) vs tema aktif: jangan sampai beda tanpa pesan.
//
// Latar (item C3): `resolveTheme()` menimpa pilihan tema saat mode tampilan tidak cocok
// jenisnya (light-saat-dark) TANPA apa pun di UI yang memberi tahu. Akibatnya kartu tema
// menunjuk satu tema, yang dirender tema lain. Uji ini mengunci janji sesudah perbaikan:
//   T1 pill "Zephyr Light/Dark" ikut memindah `settings.theme.current` ke pasangannya,
//   T2 kartu tema yang bertanda aktif = tema yang benar-benar dirender (data-theme),
//   T3 memilih kartu tema terang saat pill gelap → pill ikut berubah (dua arah konsisten),
//   T4 resolveTheme('system') tetap mengikuti preferensi OS (bukan memaksa pasangan).
import { Cdp } from './lib-cdp.mjs';

import { keluarBersih } from './lib-cdp.mjs';
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) keluarBersih(1);
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Mode tampilan vs tema aktif (C3) ===\n');

/** Buka setelan → tema, pilih kartu, balik ke Umum, klik pill. Semua di dalam halaman. */
const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const st = () => S.getState().settings;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  S.getState().setActivity('settings');
  S.getState().setSidebarVisible(true);
  S.getState().setSettingsOpen(true);
  await tunggu(900);

  const pilihKartu = async (id) => {
    document.querySelector('[data-testid="set-nav-theme"]')?.click();
    await tunggu(700);
    document.querySelector('[data-theme-card="' + id + '"]')?.click();
    await tunggu(900);
  };
  const klikPill = async (teks) => {
    document.querySelector('[data-testid="set-nav-general"]')?.click();
    await tunggu(700);
    const grup = document.querySelector('[data-testid="general-theme"]');
    const tombol = [...(grup?.querySelectorAll('button, [role="radio"]') ?? [])].find((b) =>
      (b.textContent || '').trim().toLowerCase().includes(teks.toLowerCase()),
    );
    if (!tombol) return false;
    tombol.click();
    await tunggu(900);
    return true;
  };
  const aktifDanKartu = async () => {
    document.querySelector('[data-testid="set-nav-theme"]')?.click();
    await tunggu(700); // grid digambar React: tanpa jeda, kartunya belum ada di DOM
    return {
      tema: st().theme.current,
      mode: st().general.theme,
      dirender: document.documentElement.dataset.theme,
      kartu: [...document.querySelectorAll('[data-theme-card].is-active')].map((e) => e.getAttribute('data-theme-card')),
    };
  };

  /* T1: tema terang dipilih dari kartu, lalu pill "Zephyr Dark".
     min-light sudah disembunyikan dari pemilih (tema kembar, lihat
     docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md), jadi kartunya tidak pernah
     dirender lagi - skrip menunggu 3,5 detik untuk elemen yang tidak ada dan
     gagal dengan pesan yang menyesatkan. Tema terang yang benar-benar
     ditawarkan adalah zephyr-light.
     Catatan: komentar ini berada DI DALAM template literal yang dikirim ke
     halaman, jadi tidak boleh memakai backtick. */
  await pilihKartu('zephyr-light');
  out.mulai = await aktifDanKartu();
  out.pillAda = await klikPill('Zephyr Dark');
  await tunggu(400);
  out.sesudah = await aktifDanKartu();
  out.kartuAktif = out.sesudah.kartu;
  out.direnderDataset = document.documentElement.dataset.theme;
  await tunggu(300);

  // T3: balik lewat kartu (pilih tema terang) → pill harus ikut jadi Zephyr Light.
  const grup = () => document.querySelector('[data-testid="general-theme"]');
  const labelPillAktif = () => {
    const cast = [...(grup()?.querySelectorAll('button, [role="radio"]') ?? [])].find(
      (b) => b.getAttribute('aria-checked') === 'true' || b.getAttribute('aria-pressed') === 'true' || b.classList.contains('is-active'),
    );
    return cast ? (cast.textContent || '').trim() : null;
  };
  document.querySelector('[data-testid="set-nav-general"]')?.click();
  await tunggu(600);
  await pilihKartu('nord-light');
  out.kartuTerangAktif = [...document.querySelectorAll('[data-theme-card].is-active')].map((e) => e.getAttribute('data-theme-card'));
  document.querySelector('[data-testid="set-nav-general"]')?.click();
  await tunggu(700);
  out.pillSetelahKartuTerang = labelPillAktif();

  // T4: resolveTheme('system') mengikuti OS.
  const th = await import('/src/lib/themes.ts');
  const osGelap = window.matchMedia('(prefers-color-scheme: dark)').matches;
  out.resolveSystem = th.resolveTheme({ theme: 'system' }, { current: 'zephyr-dark' });
  out.osGelap = osGelap;
  out.matchOs = out.resolveSystem === (osGelap ? 'zephyr-dark' : 'zephyr-light');

  // T5: state "bentrok" gaya lama (tema gelap + mode terang) — aturan mode-menang
  // memang masih berlaku, yang diuji di sini UI-nya ikut menunjukkan tema itu.
  await S.getState().applySettings({ general: { theme: 'light' }, theme: { current: 'dracula' } });
  await tunggu(900);
  out.bentrokRender = document.documentElement.dataset.theme;
  document.querySelector('[data-testid="set-nav-theme"]')?.click();
  await tunggu(800);
  out.bentrokKartu = [...document.querySelectorAll('[data-theme-card].is-active')].map((e) => e.getAttribute('data-theme-card'));
  out.bentrokResolve = th.resolveTheme({ theme: 'light' }, { current: 'dracula' });
  return out;
})())`,
  90000,
);

const s = hasil;
cek('T1 pill "Zephyr Dark" memindah tema aktif', s.pillAda && s.sesudah.tema === 'zephyr-dark', `theme.current=${s.sesudah?.tema}`);
cek('T2 yang dirender = zephyr-dark', s.direnderDataset === 'zephyr-dark', `data-theme=${s.direnderDataset}`);
cek('T2 kartu aktif = yang dirender', (s.kartuAktif ?? []).join(',') === 'zephyr-dark', `kartu=${(s.kartuAktif ?? []).join(',')}`);
cek('T3 kartu tema terang → pill jadi Zephyr Light', (s.pillSetelahKartuTerang ?? '').toLowerCase().includes('light'), `pill=${s.pillSetelahKartuTerang}`);
cek('T3 kartu aktif = nord-light', (s.kartuTerangAktif ?? []).join(',') === 'nord-light', `kartu=${(s.kartuTerangAktif ?? []).join(',')}`);
cek('T4 mode "system" mengikuti OS', s.matchOs, `resolve=${s.resolveSystem} osGelap=${s.osGelap}`);
cek(
  'T5 state bentrok: yang dirender & kartu aktif sama (tak diam-diam)',
  s.bentrokRender === s.bentrokResolve && (s.bentrokKartu ?? []).join(',') === s.bentrokResolve,
  `render=${s.bentrokRender} resolve=${s.bentrokResolve} kartu=${(s.bentrokKartu ?? []).join(',')}`,
);

cdp.close();
