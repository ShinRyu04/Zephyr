// cek-ext13.mjs — is the language extension actually landing in the view?
//
// Reconfigure the language compartment directly from the page using the same
// loader the component uses, then count spans. If the count stays zero even
// then, the highlight style or the theme variables are the problem, not the
// language loader.

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

  const sebelum = cariAll('.cm-line span').length;

  // Pasang bahasa + highlight style LANGSUNG ke view, bypass compartment.
  let hasil = {};
  try {
    const langMod = await import('/src/lib/lang.ts');
    const r = await langMod.extensiUntukFile(dir + '/contoh.ts');
    const { syntaxHighlighting, HighlightStyle } = await import('/node_modules/@codemirror/language/dist/index.js');
    const { tags } = await import('/node_modules/@lezer/highlight/dist/index.js');

    const style = syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: 'rgb(255, 0, 0)' },
      { tag: tags.string, color: 'rgb(0, 255, 0)' },
      { tag: tags.number, color: 'rgb(0, 0, 255)' },
    ]));

    view.dispatch({ effects: view.state.reconfigure ? [] : [] });
    // Sisipkan lewat dispatch biasa: gunakan compartment? Tidak ada akses.
    // Jadi pakai StateEffect.appendConfig.
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    view.dispatch({ effects: StateEffect.appendConfig.of([...r.ext, style]) });
    await tunggu(600);
    hasil = { jumlahExt: r.ext.length, langId: r.langId };
  } catch (e) {
    hasil = { err: String(e).slice(0, 140) };
  }

  const sesudah = cariAll('.cm-line span').length;
  const warna = [...new Set(cariAll('.cm-line span').map(s => getComputedStyle(s).color))];
  return JSON.stringify({
    viewAda: true,
    sebelum, sesudah,
    hasil,
    warna: warna.slice(0, 6),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
