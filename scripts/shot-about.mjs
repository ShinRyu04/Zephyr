// shot-about.mjs — screenshot halaman About baru (ringkas ala TEDI).
//
// Bukti visual untuk permintaan user: "UI untuk about atau tentang zephyr
// teks nya kebanyakan, dan jga buatkan kek sih TEDI".
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const DIR = 'docs/screenshots';

const simpan = (nama, data) => {
  writeFileSync(`${DIR}/${nama}`, Buffer.from(data, 'base64'));
  console.log(`  ${nama}`);
};

const bukaAbout = `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 800));
  if (!document.querySelector('[data-testid="set-nav-about"]')) {
    document.querySelector('[data-testid="ab-settings"]')?.click();
  }
  let nav = null;
  const t1 = Date.now() + 9000;
  while (Date.now() < t1 && !nav) {
    nav = document.querySelector('[data-testid="set-nav-about"]');
    if (!nav) await new Promise((r) => setTimeout(r, 200));
  }
  nav?.click();
  let tombol = null;
  const t2 = Date.now() + 9000;
  while (Date.now() < t2 && !tombol) {
    tombol = document.querySelector('[data-testid="about-donate"]');
    if (!tombol) await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`;

// ── 31: About versi baru ────────────────────────────────────────────────
await cdp.json(bukaAbout, 90000);
let shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
simpan('31-about-baru.png', shot.data ?? shot.result?.data);

// ── 32: tombol-tombolnya (potong area tautan) ───────────────────────────
const y = await cdp.json(
  `return JSON.stringify(await (async () => {
  const el = document.querySelector('.about-links');
  if (!el) return 0;
  el.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 600));
  return Math.round(el.getBoundingClientRect().top);
})())`,
  60000,
);
shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
simpan('32-about-tautan.png', shot.data ?? shot.result?.data);

// ── 33: dialog donasi ───────────────────────────────────────────────────
await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="about-donate"]')?.click();
  await new Promise((r) => setTimeout(r, 1100));
  return 1;
})())`,
  60000,
);
shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
simpan('33-donasi.png', shot.data ?? shot.result?.data);
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setDonateOpen(false);
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

// Tutup Settings.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`,
  60000,
);

await cdp.close();
console.log('  selesai');
