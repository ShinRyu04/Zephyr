// cek-dom-cm13.mjs — print the raw CodeMirror DOM.
//
// Even a hard-coded bright highlight style produces no spans, which means the
// highlighter never runs. Print the actual markup so the reason is visible:
// maybe the content is rendered as a single text node because the editor is in
// read-only mode, or the highlight plugin is not installed at all.

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
  await tunggu(2500);

  const cm = document.querySelector('.cm-content');
  const lines = [...document.querySelectorAll('.cm-line')];
  return JSON.stringify({
    cmAda: !!cm,
    cmKelas: cm?.className ?? null,
    cmAttrs: cm ? [...cm.attributes].map(a => a.name + '=' + a.value.slice(0, 40)) : [],
    isiHTML: cm?.innerHTML?.slice(0, 700) ?? null,
    jumlahBaris: lines.length,
    barisHTML: lines.slice(0, 3).map(l => l.innerHTML.slice(0, 160)),
    barisChildNodes: lines.slice(0, 3).map(l => [...l.childNodes].map(n => n.nodeName + (n.nodeType === 3 ? ':' + n.textContent.slice(0, 30) : '')).slice(0, 4)),
    editorReadOnly: document.querySelector('.cm-editor')?.classList.contains('cm-readonly') ?? null,
    adaReadOnlyBanner: !!document.querySelector('.readonly-banner'),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
