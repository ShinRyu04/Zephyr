// cek-dispatch13.mjs — wrap dispatch BEFORE the view is created.
//
// The previous attempt wrapped the dispatch of a view that was about to be
// destroyed. Instead, hook EditorView.prototype.dispatch so every view created
// afterwards is covered, then open the file and read the trail.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  St.getState().setSettingsOpen(false);
  await tunggu(500);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(600);

  // Bungkus prototipe SEBELUM view baru dibuat.
  const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
  const catatan = [];
  const asli = EditorView.prototype.dispatch;
  EditorView.prototype.dispatch = function (tr, ...rest) {
    const efek = tr?.effects;
    if (efek) {
      const daftar = Array.isArray(efek) ? efek : [efek];
      for (const e of daftar) {
        const v = e?.value;
        catatan.push({
          tipe: v?.constructor?.name ?? typeof v,
          // Compartment reconfigure membawa extension di dalam efek.
          adaExt: !!v,
        });
      }
    }
    return asli.call(this, tr, ...rest);
  };

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);

  const view = window.__ZEPHYR_CM__();
  let tree = null;
  if (view) {
    try {
      const mod = await import('/node_modules/@codemirror/language/dist/index.js');
      const t = mod.syntaxTree(view.state);
      tree = { panjang: t.length, top: t.topNode.type.name };
    } catch (e) { tree = { err: String(e).slice(0, 90) }; }
  }
  EditorView.prototype.dispatch = asli;
  return JSON.stringify({ jumlahDispatch: catatan.length, catatan: catatan.slice(0, 10), tree, viewAda: !!view });
`,
  120000,
);
console.log(r);
await cdp.close();
