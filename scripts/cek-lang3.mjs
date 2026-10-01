import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const lang = await import('/node_modules/.vite/deps/@codemirror_language.js?v=d1ad1012').catch(() => null);
  if (!lang) return { err: 'no lang module' };

  // cari SEMUA EditorView di registry internal app
  const reg = await import('/src/lib/editorRegistry.ts').catch(() => null);
  out.adaRegistry = !!reg;

  // tree dari editor yang terlihat
  const el = q('.cm-editor');
  out.elAda = !!el;
  if (!el) return out;

  // akses lewat properti internal CodeMirror
  const key = Object.keys(el).find((k) => k.startsWith('cmView') || k === 'cmView');
  out.kunci = key || null;
  const view = key ? el[key]?.view : null;
  out.viewDariDOM = !!view;
  if (view) {
    out.docLen = view.state.doc.length;
    const tree = lang.syntaxTree(view.state);
    out.treeLen = tree.length;
    out.akar = tree.type ? tree.type.name : null;
    const anak = [];
    tree.iterate({ enter: (n) => { if (anak.length < 6) anak.push(n.name); return anak.length < 6; } });
    out.anak = anak;
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
