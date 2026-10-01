import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const lang = await import('/src/lib/lang.ts');
  const v = reg.getActiveView();
  out.adaView = !!v;
  if (!v) return out;
  out.docLen = v.state.doc.length;

  const tree = (await import('/node_modules/.vite/deps/@codemirror_language.js?v=d1ad1012')).syntaxTree(v.state);
  out.treeLen = tree.length;
  out.akar = tree.type ? tree.type.name : null;
  const anak = [];
  tree.iterate({ enter: (n) => { if (anak.length < 6) anak.push(n.name); return anak.length < 6; } });
  out.anak = anak;

  // test extLangUntuk langsung
  out.ts = lang.extLangUntuk('src/lib/aiStore.ts');
  out.vue = lang.extLangUntuk('App.vue');
  out.detectTs = lang.detectLang('src/lib/aiStore.ts');
  const e = await lang.extensiUntukFile('src/lib/aiStore.ts');
  out.extLen = e.ext.length;
  out.langId = e.langId;
  out.dariEkstensi = e.dariEkstensi;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
