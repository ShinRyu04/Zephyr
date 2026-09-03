// verify20.mjs — verifikasi fase 20 (panel bawah).
//
// Pakai:  node scripts/verify20.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → spesifikasi fase 20:
//   V1  tsc 0 error
//   V2  Ctrl+J buka/tutup panel; tinggi tersimpan ke disk
//   V3  tab Terminal = instance fase 05/06 yang SAMA (PTY tidak dibuat ulang)
//   V4  Problems: 2 diagnostik → badge tab + status bar; klik baris → line benar
//   V5  Output: 10000 baris virtualized, auto-scroll, scroll-lock, Clear
//   V6  Ports: tambah manual + dari "SSH" → tampil; hapus → hilang
//   V7  Debug Console: REPL no-op menulis ke channel "debug"
//   V8  hanya tab aktif mounted (kecuali terminal — lihat catatan Panel.tsx)
//   V9  menu View memanggil command yang sama dengan shortcut

import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagianA } from './v20/bagianA.mjs';
import { bagianB } from './v20/bagianB.mjs';
import { bagianC } from './v20/bagianC.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify20');

const main = async () => {
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  // Focus emulation: tanpa ini document.hasFocus() palsu dan element.focus()
  // tidak memindah activeElement (pelajaran fase 18).
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  if ((await cdp.eval('typeof window.__ZEPHYR_PANEL__')) === 'undefined') {
    throw new Error('__ZEPHYR_PANEL__ tidak ada — reload halaman (devBridge fase 20)');
  }

  // ═════════ V1: tsc ═════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  check(
    'V1',
    tsc.status === 0,
    `npx tsc --noEmit exit ${tsc.status}` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 8).join('\n')}` : ' tanpa output'),
  );

  // State awal bersih.
  await cdp.runAsync(
    `
    const P = window.__ZEPHYR_PANEL__;
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    P.problems.clearAll();
    P.ports.clear();
    P.output.clear('zephyr');
    P.output.clear('debug');
    P.output.setChannel('zephyr');
    P.output.setAutoScroll(true);
    P.hydrate(['problems','output','debug','terminal','ports'], 'terminal');
    P.menuOpen(false);
    if (TS().maximized) TS().toggleMaximized();
    TS().setVisible(true);
    TS().setDock('terminal');
    window.__ZEPHYR_NOTIF__.clear();
    await wait(500);
    return 'siap';
  `,
    60000,
  );

  await bagianA(cdp, check);
  await bagianB(cdp, check);
  await bagianC(cdp, check);

  // Bersihkan supaya harness fase lain tidak terpengaruh.
  await cdp.runAsync(
    `
    const P = window.__ZEPHYR_PANEL__;
    P.problems.clearAll();
    P.ports.clear();
    P.output.clear('zephyr');
    P.output.clear('debug');
    P.output.setAutoScroll(true);
    P.hydrate(['problems','output','debug','terminal','ports'], 'terminal');
    P.focusTab('terminal');
    if (TS().maximized) TS().toggleMaximized();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.setSettingsOpen(false);
    window.__ZEPHYR_NOTIF__.clear();
    return 'beres';
  `,
    60000,
  );

  await cdp.close();
  selesai();
};

main().catch((e) => {
  console.error('verify20 error:', e.message);
  process.exit(1);
});
