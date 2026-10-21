import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
console.log(
  await a.eval(`JSON.stringify((()=>{
    const h = document.querySelector('.ag-center .ai-head');
    if (!h) return {ada:false};
    const s = getComputedStyle(h);
    const b = h.getBoundingClientRect();
    return {
      ada: true,
      hiddenAttr: h.hasAttribute('hidden'),
      display: s.display,
      height: s.height,
      box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
      anak: h.children.length,
      parent: h.parentElement?.className,
      parentDisplay: getComputedStyle(h.parentElement).display,
    };
  })())`),
);
a.close();
process.exit(0);
