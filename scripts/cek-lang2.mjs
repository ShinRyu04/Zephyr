import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // pakai modul yang SAMA dengan app (lewat vite deps)
  const lang = await import('/node_modules/.vite/deps/@codemirror_language.js?v=d1ad1012').catch((e) => null);
  out.langModul = !!lang;
  if (!lang) return out;
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012').catch(() => null);
  out.viewModul = !!CV;
  if (!CV) return out;

  const el = q('.cm-editor');
  const v = CV.EditorView.findFromDOM(el);
  out.adaView = !!v;
  if (!v) return out;

  const tree = lang.syntaxTree(v.state);
  out.treeLen = tree.length;
  out.akar = tree.type ? tree.type.name : null;

  const ld = v.state.facet(lang.languageData);
  out.jumlahLangData = ld ? ld.length : 0;

  const st = window.__ZEPHYR__.getState();
  const tab = st.tabs.find((t) => t.id === st.activeTabId);
  out.tabPath = tab ? tab.path : null;
  out.jumlahTab = st.tabs.length;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
