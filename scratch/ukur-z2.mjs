import { writeFileSync } from 'fs';
import { cdp } from './cdp2.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ag = list.find((x) => x.url.includes('#agents'));
if (!ag) {
  writeFileSync('D:\\Zephyr\\scratch\\z-hasil.txt', 'JENDELA AGENTS TIDAK ADA', 'utf8');
  process.exit(0);
}

const a = await cdp(9223, '#agents');
const out = await a.eval(`JSON.stringify((()=>{
  const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,r:s.borderRadius,bw:s.borderWidth,bc:s.borderColor,fs:s.fontSize,gap:s.gap,pad:s.padding,color:s.color}};
  const q=(s)=>document.querySelector(s);
  const hasil={win:{w:innerWidth,h:innerHeight}};
  for (const sel of ['.ag-menubar','.ag-body','.ag-left','.ag-panels','.ag-center','.ag-right','.ag-sash','.ag-sesi','.ag-sesi-baru','.ag-sesi-list','.ag-sesi-footer','.ag-tabs']) {
    const e=q(sel); if(e) hasil[sel]={box:r(e),s:cs(e)};
  }
  hasil.tabs=[...document.querySelectorAll('.ag-tab')].map(e=>({box:r(e),teks:(e.innerText||'').trim().slice(0,20),aktif:e.getAttribute('aria-selected')==='true',s:cs(e)}));
  hasil.sesi=[...document.querySelectorAll('.ag-sesi-row')].slice(0,3).map(e=>({box:r(e),teks:(e.innerText||'').trim().slice(0,30)}));
  hasil.grup=[...document.querySelectorAll('.ag-sesi-grup-head')].slice(0,3).map(e=>({box:r(e),teks:(e.innerText||'').trim().slice(0,30)}));
  return hasil;
})())`);

writeFileSync('D:\\Zephyr\\scratch\\z-hasil.txt', out, 'utf8');
a.close();
process.exit(0);
