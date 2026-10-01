// shot-sesi-ini.mjs — screenshot semua fitur baru sesi ini.
//
// Yang diambil:
//   36  tema baru (grid 19 tema)
//   37  latar belakang — panel pengaturan
//   38  wallpaper terpasang (editor)
//   39  AI di kanan TANPA panel bawah
//   40  command palette bersih
//   41  Compact About
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const DIR = 'docs/screenshots';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

const simpan = (nama, data) => {
  writeFileSync(`${DIR}/${nama}`, Buffer.from(data, 'base64'));
  console.log(`  ${nama}`);
};
const shot = async (nama) => {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  simpan(nama, s.data ?? s.result?.data);
};

/** Buka Settings → section tertentu, deterministik lewat store. */
const bukaSection = (id) => `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSidebarVisible(true);
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 800));
  document.querySelector('[data-testid="set-nav-${id}"]')?.click();
  await new Promise((r) => setTimeout(r, 1400));
  return 1;
})())`;

console.log('=== screenshot fitur sesi ini ===\n');

// ── 36: grid tema ─────────────────────────────────────────────────────────
await cdp.json(bukaSection('theme'), 90000);
await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="theme-grid"]')?.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`,
  60000,
);
await shot('36-tema-19.png');

// ── 37: panel latar belakang ──────────────────────────────────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  const el = [...document.querySelectorAll('.set-label')].find((e) => /latar belakang/i.test(e.textContent || ''));
  el?.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`,
  60000,
);
await shot('37-latar-panel.png');

// ── 38: wallpaper di editor (tutup settings) ──────────────────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('explorer');
  await new Promise((r) => setTimeout(r, 1200));
  return 1;
})())`,
  60000,
);
await shot('38-wallpaper-editor.png');

// ── 39: AI di kanan tanpa panel bawah ─────────────────────────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const T = window.__ZEPHYR_TERM__;
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await new Promise((r) => setTimeout(r, 800));
  T.getState().setVisible(false);
  await new Promise((r) => setTimeout(r, 1400));
  return JSON.stringify({ panel: T.getState().visible, kolom: !!document.querySelector('.ai-side-col') });
})())`,
  90000,
);
await shot('39-ai-kanan-tanpa-panel.png');

// ── 40: command palette ───────────────────────────────────────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  const CP = window.__ZEPHYR_CP__;
  CP.open('command');
  await new Promise((r) => setTimeout(r, 1000));
  CP.setQuery('theme');
  await new Promise((r) => setTimeout(r, 600));
  return 1;
})())`,
  90000,
);
await shot('40-palette.png');
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR_CP__.close();
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

// ── 41: About ringkas ─────────────────────────────────────────────────────
await cdp.json(bukaSection('about'), 90000);
await cdp.json(
  `return JSON.stringify(await (async () => {
  let t = null;
  const batas = Date.now() + 8000;
  while (Date.now() < batas && !t) {
    t = document.querySelector('[data-testid="about-donate"]');
    if (!t) await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`,
  90000,
);
await shot('41-about-ringkas.png');

// Bersihkan: kembali ke keadaan normal.
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('explorer');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  90000,
);

await cdp.close();
console.log('  selesai');
