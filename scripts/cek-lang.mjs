import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const lang = await import('/node_modules/@codemirror/language/dist/index.js');
  const CV = await import('/node_modules/@codemirror/view/dist/index.js');

  const el = q('.cm-editor');
  const v = CV.EditorView.findFromDOM(el);
  out.adaView = !!v;
  if (!v) return out;

  // bahasa aktif?
  out.langData = v.state.facet(lang.languageData) ? v.state.facet(lang.languageData).length : 0;
  // language support?
  const ls = v.state.facet(lang.language) ?? null;
  out.languageFacet = ls === null ? 'null' : (typeof ls);
  try {
    const langState = lang.getLanguage ? lang.getLanguage ? null : null : null;
  } catch (e) {}

  // cek compartment punya isi?
  out.extLen = v.state.extensions ? v.state.extensions.length : null;

  // coba lihat documentLanguage
  const d = v.state.facet(lang.languageData);
  out.jumlahLangData = d.length;

  // tree sekarang
  const tree = lang.syntaxTree(v.state);
  out.treeLen = tree.length;
  out.akarNama = tree.type ? tree.type.name : null;
  out.anak = [];
  tree.iterate({ enter: (n) => { if (out.anak.length < 8) out.anak.push(n.name); return out.anak.length < 8; } });

  // ekstensi yang terpasang: coba cek dari tab path
  const st = window.__ZEPHYR__.getState();
  const tab = st.tabs.find(t => t.id === st.activeTabId);
  out.tabPath = tab ? tab.path : null;
  out.tabLang = tab ? tab.languageId : null;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
