import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  // buka file panjang lebar
  await s.openWorkspace('D:' + BS + 'Zephyr');
  await wait(3000);
  out.ws = window.__ZEPHYR__.getState().workspace;
  await s.openPath('D:' + BS + 'Zephyr' + BS + 'src' + BS + 'lib' + BS + 'aiStore.ts');
  await wait(3000);
  out.tabCount = window.__ZEPHYR__.getState().tabs.length;
  out.editorAda = !!q('.cm-editor');
  const gut = q('.cm-gutters');
  out.gutterAda = !!gut;
  if (gut) {
    const g = getComputedStyle(gut);
    out.minWidth = g.minWidth;
    out.lebar = Math.round(gut.getBoundingClientRect().width);
    const els = qa('.cm-lineNumbers .cm-gutterElement');
    out.jumlah = els.length;
    out.contohNomor = els.slice(0, 3).map(e => e.textContent.trim());
    out.contohLebar = els.slice(0, 3).map(e => Math.round(e.getBoundingClientRect().width));
    // apakah digit pertama kepotong? cek overflow
    out.terpotong = els.slice(0, 3).map(e => {
      const r2 = e.getBoundingClientRect();
      const sp = document.createElement('span');
      sp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(e).font;
      sp.textContent = e.textContent;
      document.body.appendChild(sp);
      const need = sp.getBoundingClientRect().width;
      sp.remove();
      return need > r2.width - 1;
    });
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
