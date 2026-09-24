// cek-polos13.mjs — does a bare CodeMirror instance highlight inside this app?
//
// Everything about the app's setup looks correct, so this builds a throwaway
// EditorView on the page with only the typescript language and a highlight
// style. If it colours, the app's editor is the problem; if it does not, the
// page environment is.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  // Buang instance lama kalau ada.
  document.getElementById('uji-cm-polos')?.remove();
  const host = document.createElement('div');
  host.id = 'uji-cm-polos';
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:200px;';
  document.body.appendChild(host);

  const { EditorState } = await import('/node_modules/@codemirror/state/dist/index.js');
  const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
  const { javascript } = await import('/node_modules/@codemirror/lang-javascript/dist/index.js');
  const { syntaxHighlighting, HighlightStyle, syntaxTree } = await import('/node_modules/@codemirror/language/dist/index.js');
  const { tags } = await import('/node_modules/@lezer/highlight/dist/index.js');

  const style = syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword, color: 'rgb(255,0,0)' },
    { tag: tags.string, color: 'rgb(0,255,0)' },
    { tag: tags.number, color: 'rgb(0,0,255)' },
  ]));

  const view = new EditorView({
    state: EditorState.create({
      doc: "export const angka = 42;\\nconst teks = 'halo';\\n",
      extensions: [javascript({ typescript: true }), style],
    }),
    parent: host,
  });
  await new Promise(r => setTimeout(r, 700));

  const tree = syntaxTree(view.state);
  const spans = [...host.querySelectorAll('.cm-line span')];
  const hasil = {
    treePanjang: tree.length,
    treeTop: tree.topNode.type.name,
    span: spans.length,
    warna: [...new Set(spans.map(s => getComputedStyle(s).color))],
    teks: spans.slice(0, 4).map(s => s.textContent),
  };
  view.destroy();
  host.remove();
  return JSON.stringify(hasil);
`,
  120000,
);
console.log(r);
await cdp.close();
