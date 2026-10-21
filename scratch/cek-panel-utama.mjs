import { cdp } from './cdp2.mjs';

/* The MAIN window, by target id: the editor root, not the Agents window. */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => !x.url.includes('#agents'));
const c = await cdp(9223, utama.url);

console.log(
  await c.eval(`JSON.stringify((()=>{
    const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{if(!e)return null;const s=getComputedStyle(e);return {bg:s.backgroundColor,r:s.borderRadius,bw:s.borderWidth,disp:s.display}};
    const q=(s)=>document.querySelector(s);
    return {
      root: q('#root')?.firstElementChild?.className,
      agMenubar: !!q('.ag-menubar'),
      aiPanel: r(q('.ai-panel')),
      aiHead: r(q('.ai-head')),
      aiHeadDisp: cs(q('.ai-head'))?.disp,
      aiHeadH: cs(q('.ai-head'))?.disp === 'flex' ? Math.round(q('.ai-head').getBoundingClientRect().height) : null,
      inputRow: r(q('.ai-input-row')),
      inputRowR: cs(q('.ai-input-row'))?.r,
      inputRowBg: cs(q('.ai-input-row'))?.bg,
      inputRowBorder: cs(q('.ai-input-row'))?.bw,
    };
  })())`),
);
c.close();
process.exit(0);
