// cek-readonly13.mjs — does the editor take the readOnly branch?
//
// When readOnly is true the component skips indentOnInput, bracketMatching and
// closeBrackets, and the language effect reconfigures with an EMPTY extension
// list. That would explain a present data-language attribute with no syntax
// tree: the language is set once by the editor state and then cleared.

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

  const tab = St.getState().tabs[0];
  const cmContent = document.querySelector('.cm-content');
  const cmEditor = document.querySelector('.cm-editor');

  // Bukti readOnly dari DOM: contenteditable false atau kelas cm-readonly.
  return JSON.stringify({
    tabReadOnly: tab?.readOnly,
    tabReadOnlyTipe: typeof tab?.readOnly,
    tabKunci: tab ? Object.keys(tab).slice(0, 14) : null,
    contentEditable: cmContent?.getAttribute('contenteditable'),
    editorKelas: cmEditor?.className,
    // Banner read-only muncul kalau file dianggap read-only.
    adaBannerReadonly: !!document.querySelector('[data-testid="readonly-banner"], .readonly-banner'),
    // aria-readonly di-set dari prop readOnly komponen.
    ariaReadonly: cmContent?.getAttribute('aria-readonly'),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
