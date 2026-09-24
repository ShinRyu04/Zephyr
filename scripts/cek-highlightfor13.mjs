// cek-highlightfor13.mjs — does highlightingFor return a class for keywords?
//
// The language is loaded, the compartment is reconfigured, and yet no token
// span appears. highlightingFor() is the function treeHighlighter uses to turn
// a syntax tag into a CSS class; calling it directly shows whether the
// highlighter resolves at all.

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
  await tunggu(700);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  // Semua lewat jalur modul app (bukan import node_modules) supaya instance
  // facet-nya sama dengan yang dipakai editor.
  const out = {};
  try {
    const lang = await import('/src/lib/lang.ts');
    const rr = await lang.extensiUntukFile(dir + '/contoh.ts');
    out.langId = rr.langId;

    // Ambil syntaxTree & highlightingFor lewat jalur yang sama dengan app:
    // CodeMirror sudah dibundel, jadi kita pakai modul deps vite (satu-satunya
    // jalur yang tersedia untuk membaca API internal).
    const m = await import('/node_modules/.vite/deps/@codemirror_language.js?v=0b196e29');
    out.modKunci = Object.keys(m).filter(k => /highlight|syntax/i.test(k)).slice(0, 6);
  } catch (e) {
    out.err = String(e).slice(0, 160);
  }

  // Baca langsung dari DOM: apakah baris 2 punya span selain cm-zbr?
  const baris = [...document.querySelectorAll('.cm-line')];
  out.barisRinci = baris.slice(0, 3).map(b => ({
    html: b.innerHTML.slice(0, 90),
    span: b.querySelectorAll('span').length,
  }));

  return JSON.stringify(out);
`,
  120000,
);
console.log(r);
await cdp.close();
