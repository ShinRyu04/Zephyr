import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession ? A.activeSession() : null;
  // cari properti counter langkah tool
  const keys = Object.keys(A).filter(k=>/langkah|step|tool|count|busy|batal|percoba/i.test(k));
  const vals = {};
  for (const k of keys){ const v=A[k]; vals[k]= (typeof v==='object'&&v)?(Array.isArray(v)?('arr:'+v.length):('obj:'+Object.keys(v).length)):v; }
  // DOM: cari bubble terakhir + spinner
  const bubbles = [...document.querySelectorAll('[class*=message],[class*=bubble],[class*=pesan]')];
  const lastTxt = bubbles.length?bubbles[bubbles.length-1].innerText.slice(-200):'';
  return { vals, nMsg: sess?sess.messages.length:0, lastDom: lastTxt };
})())`);
console.log(r);
await cdp.close();
