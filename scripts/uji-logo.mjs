// uji-logo.mjs — ukur logo Zephyr di menubar secara nyata, bandingkan
// dengan logo app lain pada bar setinggi 28px (acuan: VS Code 16x16 glyph).
//
// Cara pakai: app dev harus jalan + CDP di 9223.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, '');

const hasil = await cdp.eval(`(() => {
  const brand = document.querySelector('.mb-brand');
  if (!brand) return { err: '.mb-brand tidak ketemu' };

  const svg = brand.querySelector('svg');
  if (!svg) return { err: 'svg logo tidak ketemu di .mb-brand' };

  const b = brand.getBoundingClientRect();
  const s = svg.getBoundingClientRect();

  // Kotak yang benar-benar digambar isi logo (bukan kotak SVG-nya).
  // getBBox() = bounding box koordinat internal SVG.
  let isi = null;
  try {
    const bb = svg.getBBox();
    // Petakan bbox internal ke ukuran render.
    const vb = svg.getAttribute('viewBox').split(/\\s+/).map(Number);
    const skala = vb[2] > 0 ? s.width / vb[2] : 1;
    isi = {
      internal: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
      renderTinggi: +(bb.height * skala).toFixed(1),
      renderLebar: +(bb.width * skala).toFixed(1),
    };
  } catch (e) { isi = { err: String(e) }; }

  // Ada kotak latar? Logo ber-kotak punya <rect> pertama selebar viewBox.
  const rect = svg.querySelector('rect');
  const adaKotak = !!rect;

  // Tinggi glyph nyata = tinggi bbox internal * skala.
  const tinggiGlyph = isi && isi.renderTinggi ? isi.renderTinggi : 0;

  // Acuan VS Code: glyph 16px di bar 28px → rasio glyph/bar = 0.571
  const bar = document.querySelector('.menubar');
  const barH = bar ? bar.getBoundingClientRect().height : 0;

  return {
    brand: { w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
    svg: { w: +s.width.toFixed(1), h: +s.height.toFixed(1) },
    viewBox: svg.getAttribute('viewBox'),
    adaKotakLatar: adaKotak,
    isi,
    tinggiGlyph,
    tinggibar: barH,
    svgCenterY: +(s.y + s.height / 2).toFixed(2),
    rasioVsBar: barH ? +(tinggiGlyph / barH).toFixed(3) : 0,
    targetVsCode: 0.571,
    // Cap-height teks menu, diukur di halaman dengan canvas.
    capHeightTeks: (() => {
      const menuEl =
        [...document.querySelectorAll('.mb-menu *')].find(
          (e) => (e.textContent || '').trim() === 'File',
        ) || document.querySelector('.mb-menu');
      const cs = getComputedStyle(menuEl);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      return +cv.measureText('File').actualBoundingBoxAscent.toFixed(2);
    })(),
  };
})()`);

console.log(JSON.stringify(hasil, null, 2));

// ── Penilaian ────────────────────────────────────────────────────────
const LULUS = [];
const GAGAL = [];

if (hasil.err) {
  GAGAL.push(hasil.err);
} else {
  // 1. glyph harus mengisi tinggi penuh container-nya (tanpa kotak latar)
  if (hasil.adaKotakLatar) GAGAL.push('kotak latar masih ada — logo tetap menyisakan padding');
  else LULUS.push('tanpa kotak latar → area 16px terpakai penuh');

  // 2. Tinggi glyph harus mengisi hampir seluruh svg (bukan ~55% seperti
  //    versi ber-kotak). Ambang 0.93, bukan 0.95: mode glyph menyisakan
  //    margin setengah unit di atas & sisa di bawah, jadi ~96% adalah hasil
  //    yang benar — bukan kekurangan.
  const rasioIsi = hasil.svg.h ? hasil.tinggiGlyph / hasil.svg.h : 0;
  if (rasioIsi >= 0.93)
    LULUS.push(`glyph isi ${(rasioIsi * 100).toFixed(0)}% tinggi svg (dulu ~55%)`);
  else GAGAL.push(`glyph cuma ${(rasioIsi * 100).toFixed(0)}% tinggi svg — seharusnya >=93%`);

  // 3. glyph harus proporsional terhadap cap-height teks menu (~1.2x),
  //    bukan sekadar besar. Logo 16px terbukti kegedean (1.78x cap-height).
  const rasioKeTeks = hasil.tinggiGlyph / hasil.capHeightTeks;
  hasil.rasioKeTeks = +rasioKeTeks.toFixed(2);

  if (rasioKeTeks >= 1.0 && rasioKeTeks <= 1.4) {
    LULUS.push(
      `glyph ${rasioKeTeks.toFixed(2)}x cap-height teks (${hasil.capHeightTeks}px) — proporsional`,
    );
  } else {
    GAGAL.push(`glyph ${rasioKeTeks.toFixed(2)}x cap-height teks — target 1.0-1.4x`);
  }

  // 4. glyph tidak boleh melebihi tinggi menubar
  if (hasil.tinggiGlyph <= hasil.tinggibar) LULUS.push(`glyph muat di menubar ${hasil.tinggibar}px`);
  else GAGAL.push(`glyph ${hasil.tinggiGlyph}px lebih tinggi dari menubar ${hasil.tinggibar}px`);

  // 5. logo harus center vertikal terhadap menubar (toleransi 1.5px)
  const geser = hasil.svgCenterY - hasil.tinggibar / 2;
  hasil.geserVertikal = +geser.toFixed(2);
  if (Math.abs(geser) <= 1.5) LULUS.push(`center vertikal, geser ${geser.toFixed(1)}px`);
  else GAGAL.push(`logo tidak center: geser ${geser.toFixed(1)}px dari tengah menubar`);
}

console.log('');
for (const l of LULUS) console.log('LULUS  ' + l);
for (const g of GAGAL) console.log('GAGAL  ' + g);
console.log(`\n== ${LULUS.length}/${LULUS.length + GAGAL.length} lulus ==`);

await cdp.close();
process.exit(GAGAL.length ? 1 : 0);
