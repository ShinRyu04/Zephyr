// cek-tree13.mjs — is there a syntax tree at all?
//
// Rainbow brackets render (they are plain Decorations), but no syntax token
// span appears even with a hard-coded highlight style. That means the Lezer
// parser never ran. Read the syntax tree straight off the live view state.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  St.getState().setSettingsOpen(false);
  await tunggu(600);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(500);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  let tree = null, err = null;
  try {
    const mod = await import('/node_modules/@codemirror/language/dist/index.js');
    const t = mod.syntaxTree(view.state);
    tree = {
      panjang: t.length,
      topNama: t.topNode.type.name,
      anak: t.topNode.firstChild?.type?.name ?? null,
      // Iterasi beberapa node untuk lihat apakah ada struktur.
      nodeContoh: (() => {
        const out = [];
        t.iterate({ enter: (n) => { if (out.length < 12) out.push(n.name); } });
        return out;
      })(),
    };
  } catch (e) {
    err = String(e).slice(0, 160);
  }

  // Cek juga: apakah ada facet bahasa terpasang?
  let facet = null;
  try {
    const mod = await import('/node_modules/@codemirror/language/dist/index.js');
    const ls = view.state.facet(mod.languageData);
    facet = { jumlah: ls.length, contoh: ls.slice(0, 3) };
  } catch (e) {
    facet = { err: String(e).slice(0, 120) };
  }

  return JSON.stringify({ viewAda: true, tree, err, facet });
`,
  120000,
);
console.log(r);
await cdp.close();
