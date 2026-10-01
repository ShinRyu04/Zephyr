// cek-facet13.mjs — read the language facet through the app's own module graph.
//
// Importing '/node_modules/@codemirror/language/dist/index.js' from CDP creates
// a second module instance, so its facet ids never match the ones the editor
// registered and syntaxTree() always returns empty. This reaches the same
// facet through the app's own chunk instead, using a module the app already
// imports and that re-exports what is needed.

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
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2800);

  // Ukur dari DOM saja: itu bukti yang tidak bisa dibohongi oleh instance
  // modul kedua.
  const cm = document.querySelector('.cm-content');
  const sp = cm ? [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className)) : [];
  const view = window.__ZEPHYR_CM__();

  // Baca facet lewat modul app (cmTheme mengekspor dari @codemirror/language
  // lewat jalur yang sama dengan komponen).
  let facetLewatApp = null;
  try {
    const m = await import('/src/lib/cmTheme.ts');
    facetLewatApp = { kunci: Object.keys(m).slice(0, 6) };
  } catch (e) { facetLewatApp = { err: String(e).slice(0, 100) }; }

  return JSON.stringify({
    viewAda: !!view,
    spanSintaks: sp.length,
    warna: [...new Set(sp.map(s => getComputedStyle(s).color))],
    kelas: [...new Set(sp.map(s => s.className))].slice(0, 6),
    facetLewatApp,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
