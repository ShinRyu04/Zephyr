import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
console.log(
  await a.eval(`JSON.stringify((()=>{
    const e = document.querySelector('.ag-center');
    if (!e) return {ada:false};
    const s = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    const p = e.parentElement;
    const ps = getComputedStyle(p);
    return {
      kelas: e.className,
      display: s.display,
      flex: s.flex,
      width: s.width,
      box: [Math.round(b.x), Math.round(b.width)],
      induk: p.className,
      indukDisplay: ps.display,
      indukFlex: ps.flex,
      indukWidth: ps.width,
      indukBox: Math.round(p.getBoundingClientRect().width),
    };
  })())`),
);
a.close();
process.exit(0);
