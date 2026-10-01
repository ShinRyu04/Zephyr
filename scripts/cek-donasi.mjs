// cek-donasi.mjs — read the donate dialog as rendered.
//
// The dialog's lower area looked unfinished: two plain boxes with a title and
// a URL, no brand marks. This prints the structure and computed colours so the
// layout can be checked without a screenshot.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  St.getState().setDonateOpen(true);
  await tunggu(800);

  const dlg = cari('.upd-dialog.donate-dialog');
  const opsi = cariAll('[data-testid="donate-options"] button');
  const rinci = opsi.map((b) => {
    const svg = b.querySelector('svg');
    const strong = b.querySelector('strong');
    const url = b.querySelector('.donate-url');
    const rb = b.getBoundingClientRect();
    return {
      testid: b.dataset.testid,
      kelas: b.className,
      adaSvg: !!svg,
      warnaSvg: svg ? getComputedStyle(svg).color : null,
      nama: strong?.textContent ?? null,
      url: url?.textContent ?? null,
      lebar: Math.round(rb.width),
      tinggi: Math.round(rb.height),
      // Padding kiri URL harus sejajar dengan teks nama (22px dari CSS).
      padUrl: url ? getComputedStyle(url).paddingLeft : null,
    };
  });

  const ico = cari('.donate-ico');
  return JSON.stringify({
    dialogAda: !!dlg,
    lebarDialog: dlg ? Math.round(dlg.getBoundingClientRect().width) : 0,
    warnaIkonHeader: ico ? getComputedStyle(ico).color : null,
    opsi: rinci,
  });
`,
  90000,
);
console.log(r);
await cdp.close();
