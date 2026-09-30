import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Verifikasi ketiga dropdown composer: model, mode, izin.
 *
 * Catatan ukur: yang penting adalah menu TIDAK terpotong oleh tepi panel
 * (clipped), bukan apakah ia persis di dalam garis panel. Panel bisa jauh lebih
 * lebar dari menu (dock bawah 1200px+), jadi perbandingan left/right terhadap
 * panel hanya bermakna kalau menunya benar-benar lebih lebar.
 *
 * Yang diuji: (1) buka ke atas, (2) seluruh kotak menu ada di dalam viewport,
 * (3) tidak ada induk yang meng-clip-nya (overflow hidden/auto).
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const uji = async (nama, tombol, pop, itemSel) => {
  const r = await cdp.runAsync(`
    const zzBtn = q('${tombol}');
    if (!zzBtn) return { ada: false, tahap: 'tombol tidak ketemu' };

    // Tutup popover lain lewat Escape (bukan body.click, yang juga menutup
    // menu yang baru dibuka).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(300);

    zzBtn.click();
    await wait(800);

    const zzPop = q('${pop}');
    if (!zzPop) return { ada: false, tahap: 'popover tidak terbuka' };

    const pr = zzPop.getBoundingClientRect();
    const br = zzBtn.getBoundingClientRect();

    // Cari induk yang meng-clip (overflow bukan visible).
    let zzClipper = null;
    let zzEl = zzPop.parentElement;
    while (zzEl && zzEl !== document.body) {
      const ov = getComputedStyle(zzEl);
      if (ov.overflow !== 'visible' || ov.overflowY !== 'visible') {
        zzClipper = (zzEl.className || zzEl.tagName).toString().slice(0, 30) + ' → ' + ov.overflow;
        break;
      }
      zzEl = zzEl.parentElement;
    }

    return {
      ada: true,
      bukaKeAtas: pr.bottom <= br.top + 3,
      diAtasViewport: pr.top >= 0,
      diBawahViewport: pr.bottom <= window.innerHeight + 1,
      lebar: Math.round(pr.width),
      tinggi: Math.round(pr.height),
      item: qa('${itemSel}').length,
      zIndex: getComputedStyle(zzPop).zIndex,
      clipper: zzClipper,
    };
  `, 30000);
  console.log(`  ${nama.padEnd(6)}:`, JSON.stringify(r));
  return r;
};

await uji('MODEL', '.ai-model-btn', '.ai-model-menu', '.ai-model-menu .ai-model-item');
const sh1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh1?.result?.data) {
  writeFileSync('D:/Zephyr/shot-model-up.png', Buffer.from(sh1.result.data, 'base64'));
  console.log('  shot-model-up.png');
}

await uji('MODE', '[data-testid="ai-mode-menu"]', '[data-testid="ai-mode-pop"]', '.mode-item');
const sh2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh2?.result?.data) {
  writeFileSync('D:/Zephyr/shot-mode-up2.png', Buffer.from(sh2.result.data, 'base64'));
  console.log('  shot-mode-up2.png');
}

await uji('IZIN', '[data-testid="ai-izin-menu"]', '[data-testid="ai-izin-pop"]', '.mode-item');
const sh3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh3?.result?.data) {
  writeFileSync('D:/Zephyr/shot-izin-up2.png', Buffer.from(sh3.result.data, 'base64'));
  console.log('  shot-izin-up2.png');
}

cdp.close();
