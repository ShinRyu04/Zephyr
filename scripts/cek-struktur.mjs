import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(700).from).top;
  await wait(2000);
  // ambil semua .cm-zbr dan lihat parent/child
  const z = [...document.querySelectorAll('[class*="cm-zbr-"]')].slice(0, 4);
  out.detail = z.map(e => ({
    tag: e.tagName,
    cls: e.className,
    teks: JSON.stringify(e.textContent.slice(0, 6)),
    parentCls: e.parentElement ? e.parentElement.className.slice(0, 40) : null,
    childCls: e.children[0] ? e.children[0].className.slice(0, 40) : null,
    html: e.outerHTML.slice(0, 160),
  }));
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
