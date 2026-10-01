import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const root = getComputedStyle(document.documentElement);
  const names = ['--syntax-keyword','--syntax-string','--syntax-number','--syntax-fn','--syntax-type','--syntax-operator','--syntax-comment','--fg2'];
  out.nilai = {};
  for (const n of names) out.nilai[n] = root.getPropertyValue(n).trim() || '(kosong)';

  // dari host editor (mungkin define-nya di situ, bukan :root)
  const host = q('.cm-editor') || document.body;
  const hs = getComputedStyle(host);
  out.dariEditor = {};
  for (const n of names) out.dariEditor[n] = hs.getPropertyValue(n).trim() || '(kosong)';

  // warna span sebenarnya di DOM
  const spans = [...document.querySelectorAll('.cm-line span')].slice(0, 10);
  out.spanWarna = spans.map(s => getComputedStyle(s).color);
  out.spanTeks = spans.map(s => s.textContent.slice(0, 14));
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
