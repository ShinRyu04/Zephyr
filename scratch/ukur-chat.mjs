import { writeFileSync } from 'fs';
import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
const out = await a.eval(`JSON.stringify((()=>{
  const r=(e)=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const cs=(e)=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,fs:s.fontSize,pad:s.padding,gap:s.gap,r:s.borderRadius,bw:s.borderWidth,bc:s.borderColor,h:s.height}};
  const q=(s)=>document.querySelector(s);
  const hasil={};
  for (const sel of ['.ai-head','.ai-chat','.ai-empty','.ai-composer','.ai-input','.ai-compose','.ai-foot','.ai-msg','.ai-pesan']) {
    const e=q(sel); if(e) hasil[sel]={box:r(e),s:cs(e)};
  }
  /* Cari elemen composer: textarea di dalam .ag-center */
  const ta=q('.ag-center textarea');
  if(ta) hasil.textarea={box:r(ta),s:cs(ta),ph:ta.placeholder};
  const wrap=ta?.closest('div[class]');
  hasil.wrapKelas=[...document.querySelectorAll('.ag-center [class]')].map(e=>e.className).filter(c=>typeof c==='string'&&/input|composer|compose|foot|bar/i.test(c)).slice(0,14);
  return hasil;
})())`);

writeFileSync('D:\\Zephyr\\scratch\\z-chat.txt', out, 'utf8');
a.close();
process.exit(0);
