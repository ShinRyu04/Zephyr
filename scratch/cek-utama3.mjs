import { cdp } from './cdp2.mjs';

/*
 * Match the URL EXACTLY.
 *
 * `includes('localhost:5173/')` is a substring of
 * `localhost:5173/index.html#agents` too, so every "main window" probe was
 * actually attaching to the Agents window and reporting its numbers as if they
 * were the editor's. Exact equality is the only safe selector here.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log('targets: ' + list.map((x) => x.url).join(' | '));

const utama = list.find((x) => !x.url.includes('#'));
if (!utama) {
  console.log('TIDAK ADA jendela utama tanpa hash');
  process.exit(0);
}
console.log('memakai: ' + utama.url);

const c = await cdp(9223, utama.url);
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
