// cek-reconfigure13.mjs — catch the compartment reconfigure.
//
// extensiUntukFile returns a LanguageSupport instantly and the effect is wired
// correctly on paper, yet the view has no syntax tree. Wrap the view dispatch
// and log every reconfigure effect so we can see whether the language effect
// ever reaches the view.

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
  await tunggu(500);

  // Buka file, lalu segera pasang pembungkus dispatch pada view yang hidup.
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(1200);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  const catatan = [];
  const dispatchAsli = view.dispatch.bind(view);
  view.dispatch = (tr, ...rest) => {
    const efek = tr?.effects;
    if (efek) {
      const daftar = Array.isArray(efek) ? efek : [efek];
      for (const e of daftar) {
        catatan.push({
          isi: e?.is ? 'StateEffect' : typeof e,
          tipe: e?.value?.constructor?.name ?? e?.value?.get?.('extension')?.constructor?.name ?? 'unknown',
        });
      }
    }
    return dispatchAsli(tr, ...rest);
  };

  // Paksa efek bahasa jalan lagi dengan mengubah tab.lang supaya dependency-nya
  // berubah — cara paling tidak invasif untuk memicu useEffect.
  // Buka ulang file: memaksa komponen mount view baru + menjalankan effect
  // bahasa dari awal, dengan dispatch sudah dibungkus.
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  let tree = null;
  try {
    const mod = await import('/node_modules/@codemirror/language/dist/index.js');
    const t = mod.syntaxTree(view.state);
    tree = { panjang: t.length, top: t.topNode.type.name };
  } catch (e) { tree = { err: String(e).slice(0, 100) }; }

  return JSON.stringify({ viewAda: true, jumlahDispatch: catatan.length, catatan: catatan.slice(0, 8), tree });
`,
  120000,
);
console.log(r);
await cdp.close();
