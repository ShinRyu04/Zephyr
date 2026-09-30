import { Cdp } from './lib-cdp.mjs';

/* Cari elemen mana yang meng-clip popover model (overflow hidden). */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const zzBtn = q('.ai-model-btn');
  if (!zzBtn) return 'tombol model tidak ada';
  zzBtn.click();
  await wait(700);

  const zzPop = q('.ai-model-menu');
  if (!zzPop) return 'popover tidak terbuka';

  const zzJalur = [];
  let zzEl = zzPop.parentElement;
  while (zzEl && zzEl !== document.body) {
    const cs = getComputedStyle(zzEl);
    zzJalur.push({
      tag: zzEl.tagName,
      cls: (zzEl.className || '').toString().slice(0, 40),
      overflow: cs.overflow,
      overflowY: cs.overflowY,
      position: cs.position,
      zIndex: cs.zIndex,
      tinggi: zzEl.offsetHeight,
    });
    zzEl = zzEl.parentElement;
  }
  return { jalur: zzJalur };
`, 30000);

console.log(JSON.stringify(r, null, 1));
cdp.close();
