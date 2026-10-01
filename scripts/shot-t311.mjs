// shot-t311.mjs — screenshot fitur baru T3.11 untuk user.
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama, out) {
  await new Promise((r) => setTimeout(r, 1100));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot?.result?.data;
  if (!b64) throw new Error(`gagal ${nama}`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}  ${Math.round(Buffer.from(b64, 'base64').length / 1024)} KB`);
}

// Panel AI + mode agent + beberapa pesan supaya konteks terisi.
await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  T.getState().setHeight(400);
  window.__ZEPHYR_AI__.store.getState().setAgentMode('agent');
  await new Promise((r) => setTimeout(r, 1000));
  return 1;
})())`, 60000);

// 1. Popover MODE PERSETUJUAN terbuka.
await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-approval"]').click();
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`, 60000);
await simpan('17-mode-agent', 'D:/Zephyr/docs/screenshots/17-mode-agent.png');

// 2. Popover PENALARAN terbuka.
await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-approval"]').click();
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('[data-testid="ai-effort"]').click();
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`, 60000);
await simpan('18-penalaran', 'D:/Zephyr/docs/screenshots/18-penalaran.png');

// 3. Popover KONTEKS terbuka.
await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-effort"]').click();
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('[data-testid="ctx-meter"]').click();
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`, 60000);
await simpan('19-konteks', 'D:/Zephyr/docs/screenshots/19-konteks.png');

// Laporan isi.
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const ctx = document.querySelector('[data-testid="ctx-pop"]');
  return {
    konteks: ctx ? [...ctx.querySelectorAll('.ctx-baris')].map((e) => e.textContent.trim()) : [],
    angka: ctx?.querySelector('[data-testid="ctx-angka"]')?.textContent?.trim(),
    micAda: !!document.querySelector('[data-testid="voice-btn"]'),
    micDidukung: !document.querySelector('[data-testid="voice-btn"]')?.disabled,
  };
})())`, 60000);
console.log(JSON.stringify(isi, null, 1));

// bersihkan
await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ctx-meter"]').click();
  window.__ZEPHYR_AI__.store.getState().setAgentMode('chat');
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`, 60000);

await cdp.close();
