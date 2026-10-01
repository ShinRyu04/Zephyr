// cek-dom-xterm.mjs — what does the terminal DOM look like now?
//
// verify05 V2/V3 read `.xterm-rows span`, and that selector now matches zero
// elements. Print the real tree so the harness can be pointed at it.

import { Cdp } from './lib-cdp.mjs';

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
  await tunggu(900);
  await pp.write(id, 'Write-Host "MERAH" -ForegroundColor Red' + CR);
  await tunggu(2200);

  const paneEl = document.querySelector('[data-pane="' + id + '"]');
  const jalan = [];
  let el = document.querySelector('.xterm');
  for (let i = 0; i < 5 && el; i++) {
    jalan.push({
      tag: el.tagName,
      cls: el.className,
      anak: el.children.length,
      contohAnak: [...el.children].slice(0, 3).map(c => c.className || c.tagName),
    });
    el = el.querySelector('.xterm-rows, .xterm-screen, .xterm-viewport');
  }
  return JSON.stringify({
    id,
    paneAda: !!paneEl,
    xtermAda: !!document.querySelector('.xterm'),
    xtermScreen: !!document.querySelector('.xterm-screen'),
    xtermRows: !!document.querySelector('.xterm-rows'),
    jumlahXtermRows: document.querySelectorAll('.xterm-rows').length,
    spanDiRows: document.querySelectorAll('.xterm-rows span').length,
    spanDiScreen: document.querySelectorAll('.xterm-screen span').length,
    divDiRows: document.querySelectorAll('.xterm-rows div').length,
    isiRows: document.querySelector('.xterm-rows')?.innerHTML?.slice(0, 300) ?? null,
    struktur: jalan,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
