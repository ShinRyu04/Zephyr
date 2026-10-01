// cek-langcall13.mjs — is extensiUntukFile actually reached, and what does it
// return for a .ts path?
//
// The tab reports lang "typescript" and the loader switch looks correct, yet
// no coloured spans appear. Call the same loader from the page and print the
// result, then check the compartment effect.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  const tab = St.getState().tabs.find(t => t.name.endsWith('.ts'));
  const path = tab?.path ?? 'C:/x/contoh.ts';

  // Panggil loader bahasa langsung dari bundle app.
  let hasil = null;
  try {
    const mod = await import('/src/lib/lang.ts');
    const r = await mod.extensiUntukFile(path);
    hasil = {
      langId: r.langId,
      dariEkstensi: r.dariEkstensi,
      jumlahExt: r.ext.length,
      tipeExt: r.ext.map(e => e?.constructor?.name ?? typeof e).slice(0, 4),
    };
  } catch (e) {
    hasil = { err: String(e).slice(0, 120) };
  }

  return JSON.stringify({
    path,
    hasil,
    spanSekarang: cariAll('.cm-line span').length,
    cmAda: !!cari('.cm-editor'),
    tabLang: tab?.lang,
  });
`,
  90000,
);
console.log(r);
await cdp.close();
