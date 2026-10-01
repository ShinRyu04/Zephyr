// cek-style13.mjs — does ANY highlight style colour the text?
//
// The language extension is present and the view renders 5 lines, yet no span
// is coloured. Append a hard-coded bright highlight style and see whether the
// spans appear. If they do, zephyrHighlight is the broken part; if they do
// not, the view is not running the highlighter at all.

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
  await tunggu(500);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2200);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  const hitung = () => {
    const cm = document.querySelector('.cm-content');
    if (!cm) return { sintaks: 0, warna: [] };
    const sp = [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className));
    return { sintaks: sp.length, warna: [...new Set(sp.map(s => getComputedStyle(s).color))] };
  };
  const sebelum = hitung();

  let langHasil = null, styleHasil = null;
  try {
    const langMod = await import('/src/lib/lang.ts');
    const rr = await langMod.extensiUntukFile(dir + '/contoh.ts');
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    view.dispatch({ effects: StateEffect.appendConfig.of(rr.ext) });
    await tunggu(700);
    langHasil = hitung();
  } catch (e) { langHasil = { err: String(e).slice(0, 120) }; }

  // Sekarang pasang highlight style dengan warna mentah.
  try {
    const { syntaxHighlighting, HighlightStyle } = await import('/node_modules/@codemirror/language/dist/index.js');
    const { tags } = await import('/node_modules/@lezer/highlight/dist/index.js');
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    const style = syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: 'rgb(255,0,0)' },
      { tag: tags.string, color: 'rgb(0,255,0)' },
      { tag: tags.number, color: 'rgb(0,0,255)' },
      { tag: tags.comment, color: 'rgb(128,128,128)' },
      { tag: tags.typeName, color: 'rgb(255,0,255)' },
    ]));
    view.dispatch({ effects: StateEffect.appendConfig.of(style) });
    await tunggu(900);
    styleHasil = hitung();
  } catch (e) { styleHasil = { err: String(e).slice(0, 120) }; }

  return JSON.stringify({ viewAda: true, sebelum, langHasil, styleHasil });
`,
  120000,
);
console.log(r);
await cdp.close();
