import { Cdp } from './lib-cdp.mjs';

/*
 * Cari tahu apa yang menutupi popover usage.
 *
 * Buka popover, lalu tanya browser elemen mana yang berada di titik tengah
 * popover (elementFromPoint) dan berapa z-index + stacking context tiap leluhur.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(
  `
  const zzOut = {};
  const zzBtn = q('[data-testid="ctx-meter"]');
  if (!zzBtn) return { ada: false, kenapa: 'ctx-meter tidak ketemu' };
  zzBtn.click();
  await wait(700);

  const zzPop = q('[data-testid="ctx-pop"]');
  zzOut.popBuka = !!zzPop;
  if (!zzPop) return zzOut;

  const pr = zzPop.getBoundingClientRect();
  const cx = Math.round(pr.left + pr.width / 2);
  const cy = Math.round(pr.top + Math.min(30, pr.height / 2));

  // Elemen yang sebenarnya menerima klik di titik itu.
  const zzTop = document.elementFromPoint(cx, cy);
  zzOut.titik = { x: cx, y: cy };
  zzOut.diAtas = zzTop
    ? (zzTop.getAttribute('data-testid') || zzTop.className || zzTop.tagName) + ''
    : 'null';
  zzOut.diAtasAdalahPop = !!(zzTop && zzPop.contains(zzTop));

  // Leluhur popover + z-index/stacking tiap tingkat.
  const zzJalur = [];
  let el = zzPop;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    zzJalur.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 34),
      z: cs.zIndex,
      pos: cs.position,
      ov: cs.overflow,
      transform: cs.transform === 'none' ? '-' : 'yes',
      filter: cs.filter === 'none' ? '-' : 'yes',
      isolation: cs.isolation,
    });
    el = el.parentElement;
  }
  zzOut.jalur = zzJalur;

  // Siapa saja yang menumpuk di area popover (z-index tinggi + menutupi).
  const zzZ = [...document.querySelectorAll('*')]
    .map((e) => {
      const cs = getComputedStyle(e);
      const z = parseInt(cs.zIndex, 10);
      if (!Number.isFinite(z) || z < 100) return null;
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return null;
      const timpa = !(b.right < pr.left || b.left > pr.right || b.bottom < pr.top || b.top > pr.bottom);
      if (!timpa) return null;
      return (e.getAttribute('data-testid') || String(e.className).slice(0, 30)) + ' z=' + z;
    })
    .filter(Boolean);
  zzOut.penumpuk = [...new Set(zzZ)].slice(0, 12);

  zzBtn.click();
  await wait(200);
  return zzOut;
`,
  40000
);

console.log(JSON.stringify(r, null, 1));
cdp.close();
