import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Verifikasi: (1) popover ModeMenu & IzinMenu buka KE ATAS dan tidak terpotong,
 * (2) blok Thinking punya baris ringkas + shimmer + timer.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

// Pastikan mode agent (supaya IzinMenu menampilkan seksi Permissions).
await cdp.runAsync(`
  const zzAI = X.store;
  zzAI.setState({ agentMode: 'agent' });
  await wait(800);
  return 'ok';
`, 20000);

// 1. Buka IzinMenu, ukur posisi popover relatif tombol + viewport.
const izin = await cdp.runAsync(`
  q('[data-testid="ai-izin-menu"]')?.click();
  await wait(700);

  const zzPop = q('[data-testid="ai-izin-pop"]');
  const zzBtn = q('[data-testid="ai-izin-menu"]');
  if (!zzPop || !zzBtn) return { ada: false };

  const pr = zzPop.getBoundingClientRect();
  const br = zzBtn.getBoundingClientRect();
  const panel = q('[data-testid="ai-panel"]').getBoundingClientRect();

  return {
    ada: true,
    popTop: Math.round(pr.top),
    popBottom: Math.round(pr.bottom),
    btnTop: Math.round(br.top),
    bukaKeAtas: pr.bottom <= br.top + 2,
    diAtasViewport: pr.top >= 0,
    diAtasPanel: pr.top >= panel.top,
    tinggi: Math.round(pr.height),
    item: qa('[data-testid^="ai-approval-"]').length,
    effort: qa('[data-testid^="ai-effort-"]').length,
    zIndex: getComputedStyle(zzPop).zIndex,
  };
`, 30000);
console.log('  IZIN :', JSON.stringify(izin));

const sh1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh1?.result?.data) {
  writeFileSync('D:/Zephyr/shot-izin-up.png', Buffer.from(sh1.result.data, 'base64'));
  console.log('  shot-izin-up.png');
}

// Tutup, buka ModeMenu.
const mode = await cdp.runAsync(`
  document.body.click();
  await wait(400);
  q('[data-testid="ai-mode-menu"]')?.click();
  await wait(700);

  const zzPop = q('[data-testid="ai-mode-pop"]');
  const zzBtn = q('[data-testid="ai-mode-menu"]');
  if (!zzPop || !zzBtn) return { ada: false };
  const pr = zzPop.getBoundingClientRect();
  const br = zzBtn.getBoundingClientRect();
  return {
    ada: true,
    bukaKeAtas: pr.bottom <= br.top + 2,
    diAtasViewport: pr.top >= 0,
    item: qa('[data-testid="ai-mode-chat-item"], [data-testid="ai-mode-agent-item"]').length,
  };
`, 30000);
console.log('  MODE :', JSON.stringify(mode));

const sh2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh2?.result?.data) {
  writeFileSync('D:/Zephyr/shot-mode-up.png', Buffer.from(sh2.result.data, 'base64'));
  console.log('  shot-mode-up.png');
}

cdp.close();
