import { Cdp } from './lib-cdp.mjs';

/* Diagnosa: elemen mana di header AI yang bikin tingginya 98px (4 baris). */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const zzHead = q('.ai-head');
  if (!zzHead) return 'header tidak ada';

  const zzAnak = [...zzHead.children].map((el) => ({
    cls: el.className,
    tag: el.tagName,
    w: el.offsetWidth,
    h: el.offsetHeight,
    top: Math.round(el.getBoundingClientRect().top),
    teks: (el.textContent ?? '').trim().slice(0, 30),
  }));

  return {
    headH: zzHead.offsetHeight,
    headW: zzHead.offsetWidth,
    wrap: getComputedStyle(zzHead).flexWrap,
    anak: zzAnak,
  };
`, 30000);

console.log(JSON.stringify(r, null, 2));
cdp.close();
