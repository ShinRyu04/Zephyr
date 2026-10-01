import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  const st = window.__ZEPHYR__.getState();
  await st.openPathAt('D:' + BS + 'Zephyr' + BS + 'src' + BS + 'lib' + BS + 'aiStore.ts', 1);
  await wait(3500);
  out.tabs = st.tabs.length;
  out.editorAda = !!q('.cm-editor');
  const gut = q('.cm-gutters');
  out.gutterAda = !!gut;
  if (gut) {
    out.minWidth = getComputedStyle(gut).minWidth;
    out.lebar = Math.round(gut.getBoundingClientRect().width);
    const els = qa('.cm-lineNumbers .cm-gutterElement');
    out.jumlahBaris = els.length;
    out.contoh = els.slice(0, 4).map(e => e.textContent.trim());
    out.lebarSel = els.slice(0, 4).map(e => Math.round(e.getBoundingClientRect().width));
    // cek digit kepotong: scrollWidth > clientWidth
    out.terpotong = els.slice(0, 4).map(e => e.scrollWidth > e.clientWidth + 1);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
