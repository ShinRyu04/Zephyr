import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const HL = await import('/node_modules/@lezer/highlight/dist/index.js');
  const CPS = await import('/node_modules/@codemirror/state/dist/index.js');

  // ambil view aktif
  const view = window.__ZEPHYR_CM__ ? window.__ZEPHYR_CM__() : null;
  out.viewAda = !!view;
  if (!view) return out;

  // cari extension syntaxHighlighting yang aktif
  const f = view.state.facet(CPS.Facet);
  // ganti: pakai highlightTree dengan highlighter kustom yang catat SEMUA tag
  const LT = await import('/node_modules/@lezer/lr/dist/index.js').catch(() => null);
  const lang = await import('/node_modules/@codemirror/language/dist/index.js');
  const tree = lang.syntaxTree(view.state);
  out.treeAda = !!tree;
  out.treeLen = tree ? tree.length : 0;

  // catat nama tag yang benar-benar keluar
  const tagNames = new Set();
  const hlr = HL.tagHighlighter([
    { tag: HL.tags.keyword, class: 'K' },
    { tag: HL.tags.string, class: 'S' },
    { tag: HL.tags.number, class: 'N' },
    { tag: HL.tags.comment, class: 'C' },
    { tag: HL.tags.variableName, class: 'V' },
    { tag: HL.tags.propertyName, class: 'P' },
    { tag: HL.tags.function(HL.tags.variableName), class: 'F' },
    { tag: HL.tags.typeName, class: 'T' },
    { tag: HL.tags.operator, class: 'O' },
    { tag: HL.tags.punctuation, class: 'U' },
    { tag: HL.tags.bool, class: 'B' },
  ]);
  let jumlah = 0;
  HL.highlightTree(tree, hlr, (from, to, cls) => { jumlah++; if (tagNames.size < 20) tagNames.add(cls); });
  out.jumlahToken = jumlah;
  out.tagKeluar = [...tagNames];

  // apakah tree isi node?
  out.nodePertama = '';
  tree.iterate({ enter: (n) => { if (!out.nodePertama) out.nodePertama = n.name; return true; } });
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
