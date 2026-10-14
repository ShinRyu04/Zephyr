import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
let prev='';
for (let i=0;i<40;i++){
  let r;
  try {
    r = await cdp.json(`return JSON.stringify((() => {
      const terms=[...document.querySelectorAll('.xterm-rows')];
      const t=terms.length?terms[0].innerText||'':'';
      // ringkas: ambil baris status bawah + apakah 'esc interrupt' (sibuk) ada
      const sibuk=/esc interrupt|working|esc to interrupt/i.test(t);
      const m=t.match(/(\d+) shell · ([\d.]+K) \((\d+)%\)/);
      return { sibuk, ctx: m?m[2]+' '+m[3]+'%':'?', len:t.length };
    })())`);
  } catch(e){ console.log(i,'(hup)'); await new Promise(s=>setTimeout(s,5000)); continue; }
  console.log(i, `sibuk=${r.sibuk} ctx=${r.ctx}`);
  await new Promise(s=>setTimeout(s,5000));
}
await cdp.close();
