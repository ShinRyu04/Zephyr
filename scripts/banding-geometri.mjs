// banding-geometri.mjs — ukur "kepadatan" isi glyph:
// berapa persen dari kotak render yang benar-benar diisi tinta.
//
// Ini jawaban kenapa logo A bisa tampak kecil di angka px yang sama, atau
// kenapa logo B harus lebih besar px-nya untuk tampak setara.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, '');

const r = await cdp.eval(`(() => {
  const svg = document.querySelector('.mb-brand svg');
  const s = svg.getBoundingClientRect();
  const bb = svg.getBBox();
  const vb = svg.getAttribute('viewBox').split(/\\s+/).map(Number);

  const kotakRender = s.width * s.height;

  // Perkiraan luas tinta tiap elemen
  let tinta = 0;
  const rincian = [];
  for (const el of svg.querySelectorAll('path, circle, rect')) {
    const b = el.getBBox();
    const sw = parseFloat(getComputedStyle(el).strokeWidth) || 0;
    const jenis = el.tagName.toLowerCase();
    let luas = 0;
    if (jenis === 'circle') {
      const rr = parseFloat(el.getAttribute('r')) || 0;
      luas = Math.PI * rr * rr;
    } else if (el.getAttribute('fill') === 'none') {
      const p = el.getTotalLength ? el.getTotalLength() : 0;
      luas = p * sw;
    } else {
      luas = b.width * b.height;
    }
    tinta += luas;
    rincian.push({ jenis, luas: Math.round(luas) });
  }

  const skala = s.height / vb[3];
  const tintaRender = tinta * skala * skala;

  const zEl = [...svg.querySelectorAll('path')].find((p) => p.getAttribute('fill') !== 'none');
  const zb = zEl.getBBox();

  return {
    render: { w: +s.width.toFixed(1), h: +s.height.toFixed(1), luas: Math.round(kotakRender) },
    viewBox: vb,
    bboxIsi: { w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) },
    rincian,
    tintaRender: Math.round(tintaRender),
    kepadatanPersen: +((tintaRender / kotakRender) * 100).toFixed(1),
    isiVertikalPersen: +(((bb.height * skala) / s.height) * 100).toFixed(1),
    z: { w: +zb.width.toFixed(0), h: +zb.height.toFixed(0), rasio: +(zb.width / zb.height).toFixed(2) },
  };
})()`);

console.log(JSON.stringify(r, null, 2));
cdp.close();
process.exit(0);
