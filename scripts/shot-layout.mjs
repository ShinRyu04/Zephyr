// shot-layout.mjs — screenshot Customize Layout + panel AI yang bisa disembunyikan.
//
// Kenapa CDP: Page.captureScreenshot membaca surface WebView2 langsung, jadi
// jendela TIDAK perlu diangkat ke depan (user memakai layarnya).
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const OUT = 'D:/Zephyr/docs/screenshots';
const W = 1440;
const H = 810;

fs.mkdirSync(OUT, { recursive: true });
const { cdp, page } = await Cdp.attach(9223);
console.log('tersambung:', page.title);

await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 2,
  mobile: false,
});
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama) {
  await sleep(1000);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = r?.result?.data;
  if (!b64) throw new Error(`captureScreenshot gagal (${nama})`);
  const file = path.join(OUT, `${nama}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}.png  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

const BERSIH = `
  window.__ZEPHYR_NOTIF__.clear();
  S.getState().setSettingsOpen(false);
  S.getState().setStatus('');
  CP.close();
`;

// Siapkan: workspace Zephyr, satu file terbuka, panel AI aktif di bawah.
console.log('menyiapkan...');
await cdp.json(`
  ${BERSIH}
  await window.__ZEPHYR_WS__.setTrust('D:/Zephyr', true);
  await wait(300);
  const stA = S.getState();
  stA.setActivity('explorer');
  if (!stA.sidebarVisible) stA.toggleSidebar();
  if (stA.workspace !== 'D:/Zephyr') {
    await stA.openWorkspace('D:/Zephyr');
    await wait(1000);
  }
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  await S.getState().openPath('D:/Zephyr/src/lib/layoutStore.ts');
  await wait(800);
  TS().setVisible(true);
  TS().setHeight(300);
  TS().setDock('ai');
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  await wait(600);
  ${BERSIH}
  return JSON.stringify({ ok: true });
`);

// ── 1. Panel Customize Layout terbuka ────────────────────────────────────
console.log(
  '1:',
  await cdp.json(`
  ${BERSIH}
  const btn = document.querySelector('[data-testid="mb-customize-layout"]');
  if (btn) btn.click();
  await wait(800);
  ${BERSIH}
  return JSON.stringify({
    menu: !!document.querySelector('[data-testid="layout-menu"]'),
    baris: document.querySelectorAll('[data-testid^="lm-"]').length,
  });
`),
);
await simpan('14-customize-layout');

// Tutup panel sebelum adegan berikutnya.
await cdp.json(`
  const m = document.querySelector('[data-testid="lm-close"]');
  if (m) m.click();
  await wait(400);
  return '1';
`);

// ── 2. Panel AI dengan tombol sembunyikan ────────────────────────────────
console.log(
  '2:',
  await cdp.json(`
  ${BERSIH}
  TS().setVisible(true);
  TS().setHeight(340);
  TS().setDock('ai');
  await wait(900);
  ${BERSIH}
  return JSON.stringify({
    aiHide: !!document.querySelector('[data-testid="ai-hide"]'),
    panel: !!document.querySelector('[data-testid="ai-panel"]'),
  });
`),
);
await simpan('15-panel-ai-hide');

// ── 3. Kerapatan compact ─────────────────────────────────────────────────
console.log(
  '3:',
  await cdp.json(`
  ${BERSIH}
  window.__ZEPHYR_LAYOUT__.set({ kerapatan: 'compact' });
  await wait(800);
  ${BERSIH}
  return JSON.stringify({
    compact: document.querySelector('.app-body')?.className.includes('is-compact'),
  });
`),
);
await simpan('16-layout-compact');

// Kembalikan normal.
await cdp.json(`
  const L = window.__ZEPHYR_LAYOUT__;
  L.reset();
  await L.simpan();
  await wait(500);
  return '1';
`);

// WAJIB: cabut override emulasi — kalau ditinggalkan, harness berikutnya
// membaca viewport palsu.
await cdp.send('Emulation.clearDeviceMetricsOverride');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });

console.log(
  'pulih:',
  await cdp.json(`
  TS().setDock('terminal');
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  await S.getState().openWorkspace('D:/Zephyr');
  await wait(800);
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  ${BERSIH}
  return JSON.stringify({ ws: S.getState().workspace });
`),
);

console.log('SELESAI');
process.exit(0);
