import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(3500);
  }
  st.setActivity('explorer');
  await wait(1500);

  const baris = qa('.tree-row').filter((e) => !!e.querySelector('.tree-folder-ikon'));
  out.jumlahFolder = baris.length;

  // ambil folder pertama yang punya anak (bisa diklik)
  let target = null;
  for (const b of baris) {
    const name = (b.getAttribute('title') || b.textContent || '').trim();
    if (/src|components|styles|scripts|src-tauri/.test(name)) { target = b; out.nama = name; break; }
  }
  if (!target) target = baris[1] || baris[0];

  const ikon = () => target.querySelector('.tree-folder-ikon');
  out.sebelum = ikon() ? ikon().getAttribute('data-buka') : null;
  out.ikonSebelum = ikon()?.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? null;

  target.click();
  await wait(120);
  const mid = ikon();
  out.animasiBerjalan = mid ? getComputedStyle(mid).animationName : null;
  out.ikonSaatBuka = mid?.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? null;

  await wait(500);
  const akhir = ikon();
  out.sesudah = akhir ? akhir.getAttribute('data-buka') : null;
  out.ikonSesudah = akhir?.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? null;
  out.anakMuncul = qa('.tree-row').length > baris.length;

  // tutup lagi
  target.click();
  await wait(500);
  const tutup = ikon();
  out.setelahTutup = tutup ? tutup.getAttribute('data-buka') : null;
  out.ikonSetelahTutup = tutup?.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? null;

  const el = q('.sidebar');
  const rc = el.getBoundingClientRect();
  out.clip = { x: Math.round(rc.left)+2, y: Math.round(rc.top)+2, width: Math.round(rc.width)-4, height: Math.min(600, Math.round(rc.height)-4) };
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
if (r.clip) {
  const sh = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...r.clip, scale: 2 } });
  writeFileSync('D:/Zephyr/side-folder.png', Buffer.from(sh.result.data, 'base64'));
}
cdp.close();
