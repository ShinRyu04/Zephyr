import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
console.log(
  await a.eval(`JSON.stringify((()=>{
    const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.width)]};
    return {
      kiri: r('.ag-left'),
      sash: r('.ag-sash-kiri'),
      panels: r('.ag-panels'),
      chat: r('.ag-center'),
      kanan: r('.ag-right'),
      total: innerWidth,
    };
  })())`),
);
a.close();
process.exit(0);
