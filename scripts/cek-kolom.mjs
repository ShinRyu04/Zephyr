// cek-kolom.mjs — cek apakah menubar rata dengan kolom di bawahnya.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, '');

const r = await cdp.eval(`(() => {
  const ab = document.querySelector('.activitybar');
  const abR = ab.getBoundingClientRect();
  const svg = document.querySelector('.mb-brand svg').getBoundingClientRect();
  const file = document.querySelector('.mb-menu').getBoundingClientRect();
  const brand = document.querySelector('.mb-brand').getBoundingClientRect();

  // Cari elemen apa pun di bawah menubar yang tepi kirinya = 48 (kolom 1)
  const sejajar48 = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (Math.abs(b.x - abR.right) < 1.5 && b.width > 20 && b.height > 10) {
      sejajar48.push(String(el.className).slice(0, 40));
    }
  }

  return {
    activityBar: { x: +abR.x.toFixed(1), w: +abR.width.toFixed(1), kanan: +abR.right.toFixed(1) },
    brand: { x: +brand.x.toFixed(1), w: +brand.width.toFixed(1) },
    logo: {
      x: +svg.x.toFixed(1),
      kanan: +svg.right.toFixed(1),
      center: +((svg.x + svg.right) / 2).toFixed(1),
    },
    menuFile: { x: +file.x.toFixed(1) },
    rapi: {
      logoCenterVsABcenter: +(((svg.x + svg.right) / 2) - abR.width / 2).toFixed(1),
      fileVsTepiAB: +(file.x - abR.right).toFixed(1),
    },
    elemenSejajar48: [...new Set(sejajar48)].slice(0, 8),
  };
})()`);

console.log(JSON.stringify(r, null, 2));
cdp.close();
process.exit(0);
