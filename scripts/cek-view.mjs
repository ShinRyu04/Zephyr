import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const lang = await import('/node_modules/@codemirror/language/dist/index.js');
  const CV = await import('/node_modules/@codemirror/view/dist/index.js');

  // semua .cm-editor di DOM → view-nya
  const els = [...document.querySelectorAll('.cm-editor')];
  out.jumlahEditor = els.length;
  out.detail = els.map((el, i) => {
    let v = null;
    try { v = CV.EditorView.findFromDOM(el); } catch (e) {}
    const tree = v ? lang.syntaxTree(v.state) : null;
    return {
      i,
      adaView: !!v,
      docLen: v ? v.state.doc.length : null,
      treeLen: tree ? tree.length : null,
      terlihat: el.getBoundingClientRect().height > 0,
    };
  });

  // view dari bridge
  const vb = window.__ZEPHYR_CM__ ? window.__ZEPHYR_CM__() : null;
  const tb = vb ? lang.syntaxTree(vb.state) : null;
  out.bridgeTreeLen = tb ? tb.length : null;
  out.bridgeDocLen = vb ? vb.state.doc.length : null;
  out.bridgeSamaDengan = els.findIndex(el => { try { return CV.EditorView.findFromDOM(el) === vb; } catch(e) { return false; } });
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
