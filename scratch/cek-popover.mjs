import { Cdp, sleep } from '../scripts/lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && !(t.url ?? '').includes('#'));
const { cdp } = await Cdp.attach('9223', page.title);
await cdp.eval(`window.__ZEPHYR__.getState().bukaViewAi('ai-chat'); 'ok'`);
await sleep(700);
const out = await cdp.eval(`JSON.stringify((() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bawah: Math.round(b.bottom) }; };
  const btn = document.querySelector('.ai-model-btn');
  const row = document.querySelector('.ai-input-row');
  return { win: innerHeight, btn: r(btn), row: r(row), menuAda: !!document.querySelector('.ai-model-menu') };
})())`);
console.log('SEBELUM', out);
await cdp.eval(`document.querySelector('.ai-model-btn')?.click(); 'ok'`);
await sleep(500);
const out2 = await cdp.eval(`JSON.stringify((() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bawah: Math.round(b.bottom) }; };
  const m = document.querySelector('.ai-model-menu');
  const btn = document.querySelector('.ai-model-btn');
  const s = m ? getComputedStyle(m) : null;
  return { menu: r(m), btn: r(btn), pos: s ? { top: s.top, bottom: s.bottom, maxH: s.maxHeight } : null, win: innerHeight };
})())`);
console.log('SESUDAH', out2);
await cdp.eval(`document.querySelector('.ai-model-btn')?.click(); 'ok'`);
