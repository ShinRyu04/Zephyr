// cek-lang13.mjs — does the language extension reach the editor?
//
// extensiUntukFile('.ts') should return a typescript extension and the editor
// should then emit coloured spans. The DOM shows none, so print what the
// loader returns and whether the compartment was reconfigured.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  const tab = St.getState().tabs.find(t => t.name.endsWith('.ts'));
  const info = { tabAda: !!tab, tabName: tab?.name, tabLang: tab?.lang, tabPath: tab?.path };

  // Buka file .ts kalau belum ada.
  if (!tab) {
    const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
    await St.getState().openPath(dir + '/contoh.ts');
    await tunggu(1500);
  }
  const t2 = St.getState().tabs.find(t => t.name.endsWith('.ts'));
  info.sesudahNama = t2?.name;
  info.sesudahLang = t2?.lang;
  info.sesudahPath = t2?.path;

  // Apakah editor punya bahasa? Cek lewat state CodeMirror.
  const cmEl = cari('.cm-editor');
  info.cmAda = !!cmEl;
  // CodeMirror menaruh info bahasa di languageData; cara paling langsung:
  // cek apakah ada span berwarna sama sekali.
  info.spanWarna = cariAll('.cm-line span').length;
  info.spanKelas = [...new Set(cariAll('.cm-line span').map(s => s.className))].slice(0, 8);
  // Cek juga span di seluruh editor (bukan cuma .cm-line)
  info.spanEditor = cariAll('.cm-editor span').length;
  info.teksBaris1 = cariAll('.cm-line')[0]?.textContent ?? null;
  info.teksBaris2 = cariAll('.cm-line')[1]?.textContent ?? null;
  return JSON.stringify(info);
`,
  90000,
);
console.log(r);
await cdp.close();
