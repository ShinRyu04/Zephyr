// cek-support13.mjs — inspect the LanguageSupport object itself.
//
// A brand-new compartment with the loader's extension still produces an empty
// syntax tree. Either the extension array is empty, or the LanguageSupport was
// built by a different copy of @codemirror/language than the one the view uses
// (two module instances means the facet id never matches).

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  const out = {};

  const langMod = await import('/src/lib/lang.ts');
  const rr = await langMod.extensiUntukFile(dir + '/contoh.ts');
  const ls = rr.ext[0];
  out.langId = rr.langId;
  out.jumlahExt = rr.ext.length;
  out.lsCtor = ls?.constructor?.name ?? null;
  out.lsKunci = ls ? Object.keys(ls).slice(0, 8) : null;
  out.lsExtJumlah = ls?.extension?.length ?? null;
  // Bahasa yang dibawa: LanguageSupport.extension[0] biasanya Language.
  const bahasa = ls?.extension?.[0];
  out.bahasaCtor = bahasa?.constructor?.name ?? null;

  // Bandingkan identitas modul: apakah language.ts memakai instance yang sama
  // dengan yang dipakai view?
  const modA = await import('/node_modules/@codemirror/language/dist/index.js');
  out.modAKunci = Object.keys(modA).slice(0, 10);
  // Facet languageData dari dua jalur
  out.facetDariApp = typeof modA.languageData;
  out.facetId = modA.languageData?.id ?? null;

  // Cek: apakah bahasa punya parser?
  try {
    const parser = bahasa?.parser;
    out.parserAda = !!parser;
    out.parserNama = parser?.constructor?.name ?? null;
  } catch (e) { out.parserErr = String(e).slice(0, 80); }

  return JSON.stringify(out);
`,
  90000,
);
console.log(r);
await cdp.close();
