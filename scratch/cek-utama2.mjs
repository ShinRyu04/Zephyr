import { cdp } from './cdp2.mjs';

/* Target index 1 is the MAIN window: it has no `#agents` in its URL. */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => !x.url.includes('#agents'));
if (!utama) {
  console.log('jendela utama tidak ada');
  process.exit(0);
}
const c = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);

const out = await c.eval(`JSON.stringify((()=>{
  const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const cs=(e)=>{if(!e)return null;const s=getComputedStyle(e);return {bg:s.backgroundColor,r:s.borderRadius,bw:s.borderWidth,disp:s.display}};
  const q=(s)=>document.querySelector(s);
  return {
    root: q('#root')?.firstElementChild?.className,
    agAda: !!q('.ag-menubar'),
    aiPanel: r(q('.ai-panel')),
    aiHead: r(q('.ai-head')),
    aiHeadDisp: cs(q('.ai-head'))?.disp,
    aiInputRow: r(q('.ai-input-row')),
    aiInputRowRadius: cs(q('.ai-input-row'))?.r,
    aiInputRowBg: cs(q('.ai-input-row'))?.bg,
  };
})())`);

console.log(out);
c.close();
process.exit(0);
