// shot-t4-38.mjs — screenshot fitur T4.3 s/d T4.8.
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

const keSection = (id) =>
  cdp.json(
    `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSettingsOpen(true);
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  await new Promise((r) => setTimeout(r, 700));
  window.__ZEPHYR_SETUI__.store.getState().setSection('${id}');
  await new Promise((r) => setTimeout(r, 1000));
  return 1;
})())`,
    90000,
  );

// 23. Prompt AI (T4.3) — dengan instruksi terisi supaya badge "diubah" terlihat.
await keSection('aiprompt');
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    aiPrompt: { instruksi: 'Selalu pakai pnpm, jangan npm. Komentar dalam bahasa Indonesia.' },
    allowCommands: ['npm run build', 'npm run verify', 'git status'],
  });
  await new Promise((r) => setTimeout(r, 1200));
  return 1;
})())`,
  90000,
);
await simpan('23-prompt-ai', 'D:/Zephyr/docs/screenshots/23-prompt-ai.png');

// 24. Prompt lengkap (pratinjau dibuka).
await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="sp-lihat"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  60000,
);
await simpan('24-prompt-pratinjau', 'D:/Zephyr/docs/screenshots/24-prompt-pratinjau.png');

// 25. About (T4.6).
await keSection('about');
await simpan('25-about', 'D:/Zephyr/docs/screenshots/25-about.png');

// 26. MCP + Capture (T4.7/T4.8) — nyalakan capture + rekam satu request.
await keSection('mcp');
await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('ai_capture_set', { on: true });
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 800));
  const AI = window.__ZEPHYR_AI__.store.getState();
  await AI.loadKeys();
  await AI.setModel('gemini-3.8-flash');
  await new Promise((r) => setTimeout(r, 700));
  window.__ZEPHYR_AI__.store.getState().newChat();
  await new Promise((r) => setTimeout(r, 400));
  window.__ZEPHYR_AI__.store.getState().setDraft('jelaskan struktur folder ini');
  await new Promise((r) => setTimeout(r, 300));
  await window.__ZEPHYR_AI__.store.getState().send();
  const batas = Date.now() + 20000;
  while (Date.now() < batas) {
    const [, d] = await Ti.invoke('ai_capture_get');
    if (d.length > 0) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 1500));
  return 1;
})())`,
  180000,
);
await simpan('26-mcp-capture', 'D:/Zephyr/docs/screenshots/26-mcp-capture.png');

// 27. Capture dibuka (body terlihat).
await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="cp-buka"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  60000,
);
await simpan('27-capture-body', 'D:/Zephyr/docs/screenshots/27-capture-body.png');

// 28. Snippet ">" (T4.4) — panel AI dengan dropdown snippet.
await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('ai_capture_set', { on: false });
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1200));
  window.__ZEPHYR_AI__.store.getState().setDraft('>');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  90000,
);
await simpan('28-snippet-pemicu', 'D:/Zephyr/docs/screenshots/28-snippet-pemicu.png');

// 29. Panel AI di kolom KANAN (T4.12) — kepala dua baris.
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  // Tutup menu layout: popup-nya menutupi panel yang sedang difoto.
  window.__ZEPHYR_LAYOUT__.store.getState().setMenuBuka(false);
  S.getState().setSettingsOpen(false);
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  window.__ZEPHYR_LAYOUT__.store.getState().setSubKanan(true);
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1400));
  window.__ZEPHYR_AI__.store.getState().setDraft('');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  90000,
);
await simpan('29-ai-kolom-kanan', 'D:/Zephyr/docs/screenshots/29-ai-kolom-kanan.png');

// Bersihkan.
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    general: { aiPanel: 'bottom' },
    aiPrompt: { instruksi: '' },
    allowCommands: [],
  });
  window.__ZEPHYR_LAYOUT__.store.getState().setSubKanan(false);
  await window.__ZEPHYR_LAYOUT__.store.getState().simpan();
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
  90000,
);
await cdp.close();
console.log('  selesai');
