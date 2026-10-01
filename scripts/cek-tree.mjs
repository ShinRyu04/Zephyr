import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  if (st.workspace !== 'D:' + String.fromCharCode(92) + 'Zephyr') {
    st.openWorkspace('D:' + String.fromCharCode(92) + 'Zephyr');
    await wait(3500);
  }
  window.__ZEPHYR__.getState().setActivity('explorer');
  await wait(1500);
  out.baris = qa('.tree-slot').length;
  const s0 = q('.tree-slot');
  out.animAda = s0 ? getComputedStyle(s0).animationName : null;
  out.delay0 = s0 ? getComputedStyle(s0).animationDelay : null;
  const s3 = qa('.tree-slot')[3];
  out.delay3 = s3 ? getComputedStyle(s3).animationDelay : null;
  out.animDurasi = s0 ? getComputedStyle(s0).animationDuration : null;
  out.chevTrans = (() => { const c = q('.tree-chevron'); return c ? getComputedStyle(c).transitionDuration : null; })();
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
