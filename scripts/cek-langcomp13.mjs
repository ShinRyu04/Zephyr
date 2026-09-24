// cek-langcomp13.mjs — did the language compartment ever get configured?
//
// The editor opens a .ts file, the tab says typescript, the loader returns a
// LanguageSupport, and yet no syntax spans render. That means either the
// reconfigure effect never ran, or the reconfigure effect ran with an empty
// extension list (readOnly path or a stale closure).

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  try { await window.__ZEPHYR_WS__.setTrust(dir, true); } catch {}
  await tunggu(250);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  // Baca state internal: apakah ada bahasa terpasang? Cara paling langsung
  // adalah memeriksa apakah syntax tree punya node selain Document.
  const doc = view.state.doc.toString();
  const spans = cariAll('.cm-line span');
  const baris = cariAll('.cm-line');

  // Coba pasang bahasa manual dari bundle yang sama dan lihat apakah span muncul.
  let setelahManual = null;
  try {
    const mod = await import('/src/lib/lang.ts');
    const r = await mod.extensiUntukFile(dir + '/contoh.ts');
    const { Compartment } = await import('/node_modules/@codemirror/state/dist/index.js');
    const comp = new Compartment();
    view.dispatch({ effects: comp.appendTo ? [] : [] });
    // Sisipkan langsung sebagai extension baru lewat reconfigure view.
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    // Cara termudah: bikin efek reconfigure pada compartment yang sudah ada
    // tidak bisa dari luar, jadi kita ukur dulu apakah span muncul tanpa itu.
    setelahManual = { jumlahExt: r.ext.length, langId: r.langId };
  } catch (e) {
    setelahManual = { err: String(e).slice(0, 100) };
  }

  return JSON.stringify({
    viewAda: true,
    doc: doc.slice(0, 50),
    baris: baris.length,
    spanWarna: spans.length,
    kelasSpan: [...new Set(spans.map(s => s.className))].slice(0, 6),
    warnaSpan: [...new Set(spans.map(s => getComputedStyle(s).color))].slice(0, 6),
    setelahManual,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
