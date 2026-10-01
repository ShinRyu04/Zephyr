import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, '');
const r = await cdp.eval(`(() => {
  const ab = document.querySelector('.activitybar');
  const abR = ab.getBoundingClientRect();
  // Kotak tiap tombol ikon di activity bar
  const btns = [...ab.querySelectorAll('button, [role=button], a')].map(b => {
    const r2 = b.getBoundingClientRect();
    const svg = b.querySelector('svg');
    const sR = svg ? svg.getBoundingClientRect() : null;
    return {
      label: (b.getAttribute('aria-label') || b.title || '').slice(0, 22),
      btn: [+r2.x.toFixed(1), +r2.right.toFixed(1)],
      btnCenter: +((r2.x + r2.right) / 2).toFixed(1),
      ikon: sR ? [+sR.x.toFixed(1), +sR.right.toFixed(1)] : null,
      ikonCenter: sR ? +((sR.x + sR.right) / 2).toFixed(1) : null,
      ikonW: sR ? +sR.width.toFixed(1) : null,
    };
  });
  return {
    activitybar: { x: abR.x, w: abR.width, center: abR.width / 2 },
    logoCenter: (() => { const s = document.querySelector('.mb-brand svg').getBoundingClientRect(); return +((s.x + s.right) / 2).toFixed(1); })(),
    tombol: btns.slice(0, 4),
  };
})()`);
console.log(JSON.stringify(r, null, 2));
cdp.close(); process.exit(0);
