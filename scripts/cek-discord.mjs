import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223', { timeoutMs: 60000 });
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  await st.setSettingsOpen(true);
  await wait(250);
  window.__ZEPHYR_SETUI__?.setSection?.('about');
  await wait(1200);

  const btn = q('[data-testid="about-discord"]');
  if (!btn) return { ada: false, catatan: 'tombol about-discord tidak ketemu' };

  const svg = btn.querySelector('svg');
  const path = svg?.querySelector('path');
  const cs = svg ? getComputedStyle(svg) : null;
  // cek tidak ada sisa tombol WhatsApp
  const wa = q('[data-testid="about-wa"]');
  return {
    ada: true,
    teks: btn.textContent.trim(),
    svgViewBox: svg?.getAttribute('viewBox'),
    warna: cs?.color,
    jmlPath: svg?.querySelectorAll('path').length,
    panjangPath: path?.getAttribute('d')?.length,
    mulaiPath: path?.getAttribute('d')?.slice(0, 40),
    sisaTombolWA: !!wa,
    qWarnaDiscord: getComputedStyle(document.documentElement).getPropertyValue('--brand-discord').trim(),
  };
`,
  60000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
