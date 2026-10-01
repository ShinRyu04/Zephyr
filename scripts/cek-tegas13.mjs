// cek-tegas13.mjs — the decisive syntax-highlighting test.
//
// Earlier probes were inconclusive because a different tab was active while
// the .ts tab sat in the background, and a plain-text view legitimately has no
// coloured spans. This closes every tab, opens exactly one .ts file, confirms
// it is the active tab, and then counts spans.

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

  // Tutup SEMUA tab supaya tidak ada sisa view lain.
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(700);

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const st = St.getState();
  const aktif = st.tabs.find(t => t.id === st.activeTabId);
  const view = window.__ZEPHYR_CM__();

  // Isi file yang ditulis tes: 4 baris dengan keyword, string, number, komentar.
  const doc = view ? view.state.doc.toString() : '';
  const cmContent = document.querySelector('.cm-content');
  const semuaSpan = cmContent ? [...cmContent.querySelectorAll('span')] : [];

  return JSON.stringify({
    jumlahTab: st.tabs.length,
    tabAktif: aktif?.name,
    tabAktifLang: aktif?.lang,
    viewAda: !!view,
    docIsi: doc,
    baris: cariAll('.cm-line').length,
    // Dua cara hitung: selector lama dan semua span di .cm-content.
    spanCmLines: cariAll('.cm-line span').length,
    spanSemua: semuaSpan.length,
    kelasSpan: [...new Set(semuaSpan.map(s => s.className))].slice(0, 10),
    warnaSpan: [...new Set(semuaSpan.map(s => getComputedStyle(s).color))].slice(0, 8),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
