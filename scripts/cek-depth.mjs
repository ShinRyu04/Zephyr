import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const doc = v.state.doc;
  const lang = await import('/node_modules/.vite/deps/@codemirror_language.js?v=d1ad1012');
  const tree = lang.syntaxTree(v.state);

  // tampilkan baris 695-705 apa adanya
  out.baris = [];
  for (let n = 695; n <= 705; n++) out.baris.push(n + ': ' + doc.line(n).text.slice(0, 60));

  // hitung depth manual untuk baris 700 dengan aturan yang sama
  const BUKA = new Set(['(', '[', '{']);
  const PAS = { ')': '(', ']': '[', '}': '{' };
  const tumpukan = [];
  const hasil = [];
  for (let i = 0; i < doc.length; i++) {
    const ch = doc.sliceString(i, i+1);
    if (!BUKA.has(ch) && !(ch in PAS)) continue;
    const nama = tree.resolveInner(i, 1).name;
    if (/String|Comment|Literal/.test(nama)) continue;
    const barisKe = doc.lineAt(i).number;
    if (BUKA.has(ch)) { 
      if (barisKe >= 695 && barisKe <= 705) hasil.push(barisKe + ' ' + ch + ' depth=' + (tumpukan.length % 6));
      tumpukan.push(ch); 
    } else {
      const harus = PAS[ch];
      if (tumpukan.length > 0 && tumpukan[tumpukan.length-1] === harus) {
        tumpukan.pop();
        if (barisKe >= 695 && barisKe <= 705) hasil.push(barisKe + ' ' + ch + ' depth=' + (tumpukan.length % 6));
      }
    }
  }
  out.depthBaris700 = hasil;
  out.totalBuka = tumpukan.length;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
