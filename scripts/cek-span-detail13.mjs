// cek-span-detail13.mjs — list every syntax span with its text and colour.
//
// The decisive test found 4 spans in one colour, but a file with a comment,
// keywords, a number, a string and a type should produce several distinct
// colours. Print each span so the gap is visible.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  try { await window.__ZEPHYR_WS__.setTrust(dir, true); } catch {}
  await tunggu(250);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(600);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const cm = document.querySelector('.cm-content');
  if (!cm) return JSON.stringify({ cmAda: false });

  const spans = [...cm.querySelectorAll('span')].map(s => ({
    teks: s.textContent,
    kelas: s.className,
    warna: getComputedStyle(s).color,
    gaya: getComputedStyle(s).fontStyle,
  }));

  // Token CSS yang dipakai highlighter.
  const cs = getComputedStyle(document.documentElement);
  const token = {};
  for (const k of ['--syntax-keyword','--syntax-string','--syntax-number','--syntax-comment',
                   '--syntax-fn','--syntax-type','--syntax-operator','--syn-variable']) {
    token[k] = cs.getPropertyValue(k).trim();
  }

  return JSON.stringify({
    jumlahSpan: spans.length,
    spans,
    token,
    htmlPotong: cm.innerHTML.slice(0, 500),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
