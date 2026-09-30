import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = { daftar: [], swap: null };
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('explorer');
  await wait(1500);

  const baris = qa('.tree-row').filter((e) => !!e.querySelector('.tree-folder-ikon'));
  // test sebelumnya menutup semua folder; buka lagi yang paling atas
  const top = baris[1] || baris[0];
  if (top && top.querySelector('.tree-folder-ikon')?.getAttribute('data-buka') === '0') {
    top.click();
    await wait(700);
  }
  for (const b of baris) {
    const n = (b.getAttribute('title') || b.textContent || '').trim().split(/[${String.fromCharCode(92)}/]/).pop();
    out.daftar.push({
      nama: n,
      ikon: b.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? null,
      buka: b.querySelector('.tree-folder-ikon')?.getAttribute('data-buka') ?? null,
    });
  }

  // cari yang ikon-nya folder generik (bukan folder-nama)
  const generik = baris.find((b) => {
    const ik = b.querySelector('[data-ikon]')?.getAttribute('data-ikon') || '';
    return ik === 'folder' || ik === 'folder-open';
  });
  if (!generik) return out;

  const ikon = () => generik.querySelector('[data-ikon]');
  const sebelum = ikon()?.getAttribute('data-ikon') ?? null;
  generik.click();
  await wait(450);
  const sesudah = ikon()?.getAttribute('data-ikon') ?? null;
  const anim = getComputedStyle(generik.querySelector('.tree-folder-ikon')).animationName;
  out.swap = { nama: (generik.textContent || '').trim().slice(0, 24), sebelum, sesudah, anim, berubah: sebelum !== sesudah };
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-full.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
