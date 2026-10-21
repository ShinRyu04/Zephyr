import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
console.log(
  await a.eval(`JSON.stringify((()=>{
    const btn = document.querySelector('[data-testid="ag-toggle-right"]');
    btn.click();
    const c = document.querySelector('.ag-center');
    const s = getComputedStyle(c);
    const hasil = {
      kelas: c.className,
      display: s.display,
      flexGrow: s.flexGrow, flexShrink: s.flexShrink, flexBasis: s.flexBasis,
      width: s.width, minWidth: s.minWidth, maxWidth: s.maxWidth,
      inline: c.getAttribute('style'),
      induk: getComputedStyle(c.parentElement).flexDirection,
      indukW: getComputedStyle(c.parentElement).width,
      box: Math.round(c.getBoundingClientRect().width),
    };
    btn.click();
    return hasil;
  })())`),
);
a.close();
process.exit(0);
