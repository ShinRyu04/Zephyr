import { cdp } from './cdp2.mjs';

/*
 * Open the Agents window and measure it against the TRAE numbers.
 *
 * The Agents window is a SEPARATE WebView (`#agents`), so this has to open it the
 * way the app does — `bukaAgentsWindow` — rather than change a hash on the main
 * window.
 */
const c = await cdp(9223, 'localhost:5173');

await c.eval(`(async () => {
  const m = await import('/src/lib/agentsWindow.ts');
  await m.bukaAgentsWindow();
  return 1;
})()`);
c.close();

await new Promise((r) => setTimeout(r, 5000));

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log('targets:');
list.forEach((x) => console.log('  ' + x.url));

const ag = list.find((x) => x.url.includes('#agents'));
if (!ag) {
  console.log('JENDELA AGENTS TIDAK TERBUKA');
  process.exit(0);
}

const a = await cdp(9223, '#agents');
const out = JSON.parse(
  await a.eval(`JSON.stringify((()=>{
    const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
    const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,r:s.borderRadius,bw:s.borderWidth,bc:s.borderColor,fs:s.fontSize,gap:s.gap,pad:s.padding}};
    const q=(s)=>document.querySelector(s);
    const hasil={win:{w:innerWidth,h:innerHeight}};
    for (const sel of ['.ag-menubar','.ag-body','.ag-left','.ag-panels','.ag-center','.ag-right','.ag-sash','.ag-sesi','.ag-sesi-baru','.ag-sesi-list','.ag-sesi-footer','.ag-tabs','.ag-tab']) {
      const e=q(sel); if(e) hasil[sel]={box:r(e),s:cs(e)};
    }
    hasil.tabs=[...document.querySelectorAll('.ag-tab')].map(e=>({box:r(e),teks:(e.innerText||'').trim().slice(0,20),aktif:e.getAttribute('aria-selected')==='true',s:cs(e)}));
    hasil.sesi=[...document.querySelectorAll('.ag-sesi-row')].slice(0,3).map(e=>({box:r(e),teks:(e.innerText||'').trim().slice(0,30)}));
    return hasil;
  })())`),
);

console.log(JSON.stringify(out, null, 1));
a.close();
process.exit(0);
