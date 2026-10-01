// shot-subagent-v2.mjs — screenshot panel subagent compact + Settings (T3.10).
//
// Dua potret: (1) panel AI dengan subagent berjalan, (2) halaman Settings →
// Subagent. Dipakai untuk menjawab keluhan user "numpuk bnget" dengan bukti
// visual, bukan klaim.
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama, out) {
  await new Promise((r) => setTimeout(r, 1200));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot?.result?.data;
  if (!b64) throw new Error(`captureScreenshot gagal (${nama})`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}  ${Math.round(Buffer.from(b64, 'base64').length / 1024)} KB`);
}

// ── 1. panel AI + subagent ──
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
  T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  T.getState().setHeight(400);
  await new Promise((r) => setTimeout(r, 1000));
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TODO__.bersih();
  await new Promise((r) => setTimeout(r, 400));
  await window.__ZEPHYR_TODO__.tulis([
    { content: 'Baca AGENTS.md', status: 'done' },
    { content: 'Perbaiki panel subagent', status: 'in_progress' },
    { content: 'Rebuild rilis v1.1.10', status: 'pending' },
  ]);
  await new Promise((r) => setTimeout(r, 300));
  await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Balas satu kata: SATU',
    'Balas satu kata: DUA',
    'Balas satu kata: TIGA',
  ]);
  await new Promise((r) => setTimeout(r, 2500));
  return 1;
})())`, 180000);
await simpan('15-subagent-compact', 'D:/Zephyr/docs/screenshots/15-subagent-compact.png');

// ── 2. halaman Settings → Subagent ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_SETTINGS__.buka('subagent');
  await new Promise((r) => setTimeout(r, 1500));
  return 1;
})())`, 60000);
await simpan('16-settings-subagent', 'D:/Zephyr/docs/screenshots/16-settings-subagent.png');

// laporan isi (teks) supaya bisa diverifikasi tanpa lihat gambar
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const nav = [...document.querySelectorAll('[data-testid^="set-nav-"]')].map((e) => e.textContent.trim()).filter(Boolean);
  const input = [...document.querySelectorAll('[data-testid^="sub-"]')].map((e) => ({
    id: e.getAttribute('data-testid'),
    nilai: e.value !== undefined && e.value !== '' ? e.value : (e.getAttribute('aria-checked') ?? e.textContent.trim().slice(0, 40)),
  })).filter((x) => x.id && !x.id.includes('max') || x.id === 'sub-maxparallel' || x.id === 'sub-maxsteps');
  return { nav, input };
})())`, 60000);
console.log(JSON.stringify(isi, null, 1));

// ── 3. kembali ke panel AI, bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_SETTINGS__.tutup();
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TODO__.bersih();
  await new Promise((r) => setTimeout(r, 600));
  return 1;
})())`, 60000);

await cdp.close();
