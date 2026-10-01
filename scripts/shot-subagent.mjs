// shot-subagent.mjs — screenshot panel subagent (T3.6/T3.8) untuk user.
//
// Menjalankan subagent lewat mock provider, lalu memotret panelnya dalam dua
// keadaan: saat bekerja (baris status hidup + timer) dan setelah selesai
// (rekap + timeline langkah berlabel). Bukti visual, bukan klaim.
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
// Jendela berjalan minimized: tanpa fokus emulasi, WebView2 tidak menggambar
// ulang dan screenshot bisa kosong.
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

// ── 1. buka panel AI + siapkan provider mock ──
await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  T.getState().setHeight(420);
  await new Promise((r) => setTimeout(r, 900));
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TODO__.bersih();
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 90000);

// ── 2. TODO + subagent (mock membalas cepat, jadi ini selesai ~0.5s) ──
await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_TODO__.tulis([
    { content: 'Baca AGENTS.md', status: 'done' },
    { content: 'Perbaiki timeline subagent', status: 'in_progress' },
    { content: 'Rebuild rilis v1.1.10', status: 'pending' },
  ]);
  await new Promise((r) => setTimeout(r, 300));
  await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Balas satu kata: SATU',
    'Balas satu kata: DUA',
    'Balas satu kata: TIGA',
    'Balas satu kata: EMPAT',
  ]);
  await new Promise((r) => setTimeout(r, 2500));
  // Buka daftar langkah kartu pertama supaya timeline berlabelnya terlihat.
  const toggle = document.querySelector('[data-testid^="sub-toggle-"]');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`, 180000);

// ── 3. potret panel AI ──
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
const b64 = shot?.result?.data;
if (!b64) throw new Error('captureScreenshot gagal');
const out = 'D:/Zephyr/docs/screenshots/14-subagent-tedi.png';
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`  tersimpan: ${out}`);

// ── 4. laporan isi panel (teks, biar bisa diverifikasi tanpa lihat gambar) ──
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const judul = document.querySelector('[data-testid="sub-title"]')?.textContent?.trim();
  const kartu = [...document.querySelectorAll('[data-testid^="sub-card-"]')].map((k) => ({
    nama: k.querySelector('.sub-nama')?.textContent?.trim(),
    status: k.getAttribute('data-status'),
    meta: k.querySelector('.sub-meta')?.textContent?.trim(),
    now: k.querySelector('.sub-now-teks')?.textContent?.trim() || null,
    nLangkah: k.querySelectorAll('.sub-step').length,
    aksi: [...k.querySelectorAll('[data-step="tool"]')].map((e) => e.getAttribute('data-aksi')),
  }));
  const todo = [...document.querySelectorAll('[data-todo-status]')].map((e) => e.getAttribute('data-todo-status') + ':' + e.querySelector('.todo-teks')?.textContent?.trim());
  return { judul, kartu, todo };
})())`, 90000);
console.log(JSON.stringify(isi, null, 1));

// bersihkan
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_TODO__.bersih();
  await new Promise((r) => setTimeout(r, 300));
  return 1;
})())`, 60000);

await cdp.close();
