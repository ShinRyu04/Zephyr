import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const lang = await import('/node_modules/.vite/deps/@codemirror_language.js?v=d1ad1012');
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const tree = lang.syntaxTree(v.state);
  const doc = v.state.doc;
  out.treeLen = tree.length;

  // cek 5 kurung pertama di dokumen
  const teks = doc.sliceString(0, 3000);
  let c = 0;
  out.contoh = [];
  for (let i = 0; i < teks.length && c < 6; i++) {
    const ch = teks[i];
    if ('({['.includes(ch) || ')}]'.includes(ch)) {
      const n = tree.resolveInner(i, 1).name;
      out.contoh.push(ch + ' @' + i + ' → ' + n);
      c++;
    }
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
