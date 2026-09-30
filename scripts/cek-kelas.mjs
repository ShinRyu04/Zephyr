import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // apakah syntaxTree punya isi?
  const mods = await import('/node_modules/@codemirror/language/dist/index.js').catch(() => null);
  out.bisaImport = !!mods;
  const hl = await import('/node_modules/@lezer/highlight/dist/index.js').catch(() => null);
  out.bisaHL = !!hl;
  if (hl) out.classHighlighterAda = typeof hl.classHighlighter;

  // cek kelas token yang sebenarnya di DOM editor
  const spans = [...document.querySelectorAll('.cm-line span')].slice(0, 12);
  out.kelasDom = spans.map(s => s.className).filter(Boolean).slice(0, 8);
  out.jumlahSpan = document.querySelectorAll('.cm-line span').length;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
