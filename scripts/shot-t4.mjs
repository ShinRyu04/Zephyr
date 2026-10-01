// shot-t4.mjs — screenshot tab Subagents (T4.1/T4.2).
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama, out) {
  await new Promise((r) => setTimeout(r, 1200));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot?.result?.data;
  if (!b64) throw new Error(`gagal ${nama}`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}  ${Math.round(Buffer.from(b64, 'base64').length / 1024)} KB`);
}

// Siapkan provider mock + panel.
await cdp.json(`return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  const T = window.__ZEPHYR_TERM__;
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  T.getState().setVisible(true);
  T.getState().setHeight(420);
  await new Promise((r) => setTimeout(r, 1000));
  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`, 90000);

// 1. Tab Subagents KOSONG (empty state).
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1200));
  return 1;
})())`, 60000);
await simpan('20-tab-subagents-kosong', 'D:/Zephyr/docs/screenshots/20-tab-subagents-kosong.png');

// 2. Jalankan 3 subagent dengan peran berbeda.
await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Balas satu kata: SATU',
    '@audit cek apakah rencana ini jalan',
    '@kerja perbaiki contoh',
  ]);
  await new Promise((r) => setTimeout(r, 2800));
  return 1;
})())`, 180000);
await simpan('21-tab-subagents-isi', 'D:/Zephyr/docs/screenshots/21-tab-subagents-isi.png');

// 3. Panel AI — bukti chat bersih tanpa kartu subagent.
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_TERM__.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1200));
  return 1;
})())`, 60000);
await simpan('22-chat-bersih', 'D:/Zephyr/docs/screenshots/22-chat-bersih.png');

// Laporan.
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1200));
  const kartu = [...document.querySelectorAll('[data-testid^="sub-card-"]')].map((k) => ({
    nama: k.querySelector('.sub-nama')?.textContent?.trim(),
    peran: k.querySelector('[data-testid^="sub-peran-"]')?.textContent?.trim(),
    status: k.getAttribute('data-status'),
  }));
  return { kartu };
})())`, 90000);
console.log(JSON.stringify(isi, null, 1));

await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TERM__.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 60000);

await cdp.close();
