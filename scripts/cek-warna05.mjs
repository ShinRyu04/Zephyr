// cek-warna05.mjs — print what the terminal DOM actually contains after a
// Write-Host run, so the V2 colour check can be matched to reality.
//
// verify05 V2 looks for spans whose text is exactly MERAH/HIJAU/CYAN and whose
// class matches xterm-fg-\d+. It reports TANPA WARNA for all three, so either
// the spans carry different classes now or the text has extra characters.

import { Cdp } from './lib-cdp.mjs';

const CR = String.fromCharCode(13);

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const tt = window.__ZEPHYR_TERM__;
  const pp = window.__ZEPHYR_PTY__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const CR = String.fromCharCode(13);
  let panes = tt.getState().allPanes();
  if (!panes.length) {
    await tt.getState().addPane('shell');
    await tunggu(4000);
    panes = tt.getState().allPanes();
  }
  const id = panes[0].id;
  await pp.write(id, 'cls' + CR);
  await tunggu(1000);
  await pp.write(id,
    'Write-Host "MERAH" -ForegroundColor Red; Write-Host "HIJAU" -ForegroundColor Green; ' +
    'Write-Host "CYAN" -ForegroundColor Cyan' + CR);
  await tunggu(2500);
  const spans = [...document.querySelectorAll('.xterm-rows span')];
  const cari = (t) => spans.filter(s => s.textContent.trim() === t)
    .map(s => ({ cls: s.className, warna: getComputedStyle(s).color }));
  const kelasWarna = [...new Set(spans.map(s => s.className).filter(c => c && /xterm-fg/.test(c)))];
  const semuaTeks = spans.map(s => s.textContent.trim()).filter(Boolean).slice(-12);
  return JSON.stringify({
    id,
    totalSpan: spans.length,
    MERAH: cari('MERAH'),
    HIJAU: cari('HIJAU'),
    CYAN: cari('CYAN'),
    kelasWarnaAda: kelasWarna.slice(0, 8),
    teksTerakhir: semuaTeks,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
