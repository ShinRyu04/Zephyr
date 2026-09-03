// stress.mjs — skenario stres fase 16.4 (setara "24 jam" dipadatkan).
//
// Pakai:  node scripts/stress.mjs [portCdp] [putaran]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Yang dilakukan per putaran (default 20 putaran):
//   * buka + tutup 10 file (total 200 buka/tutup di 20 putaran)
//   * spawn + kill 5 pane terminal (total 100)
//   * git add + commit di repo uji
//   * MCP: /health + get_window + editor_write (lewat HTTP asli)
// Lalu mencatat RAM & jumlah pty tiap putaran dan MELAPORKAN tren.
//
// Kriteria lulus (dicetak di akhir):
//   - tidak ada panic di log
//   - RAM total tidak naik monoton >100MB dari putaran 1 ke terakhir
//   - 0 pty ghost, 0 tab yang tidak bisa ditutup

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, rpc, sleep } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const PUTARAN = Number(process.argv[3] ?? 20);
const J = JSON.stringify;

const BASE = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `zephyr-stress-${process.pid}`,
);
const WS = path.join(BASE, 'ws');

const git = (args, cwd = WS) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });

function siapkan() {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(path.join(WS, `f${i}.txt`), `file ${i}\nbaris kedua\n`);
  }
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Stress Uji']);
  git(['config', 'user.email', 'stress@zephyr.local']);
  git(['add', '.']);
  git(['commit', '-m', 'awal stress']);
}

const logPath = () => {
  const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const d = new Date();
  const nama = `zephyr-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}.log`;
  return path.join(appdata, 'zephyr', 'logs', nama);
};

const main = async () => {
  siapkan();
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# stress fase 16.4 — target: ${page.title}, ${PUTARAN} putaran\n`);

  const logSebelum = fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf8').length : 0;

  await cdp.runAsync(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    await window.__ZEPHYR_SET_PAUSED__(false);
    await S.getState().openWorkspace(${J(WS)});
    await wait(600);
    await G.refresh();
    return 'siap';
  `,
    60000,
  );

  const mcp = await cdp.json(`await M.refresh();
    let st = M.status();
    // MCP harus HIDUP supaya panggilan HTTP di tiap putaran benar-benar diuji.
    if (!st || !st.running) { await M.toggle(true); await wait(1400); await M.refresh(); st = M.status(); }
    return JSON.stringify({ port: st ? st.port : 0, token: st ? st.token : '', running: st ? st.running : false });`);

  const jejak = [];
  for (let r = 1; r <= PUTARAN; r++) {
    const hasil = await cdp.json(
      `
      // 10 buka/tutup file
      for (let i = 0; i < 10; i++) {
        await s.openPath(${J(WS)} + '\\\\f' + i + '.txt');
      }
      await wait(150);
      const tabsSetelahBuka = S.getState().tabs.length;
      S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
      await wait(120);

      // 5 spawn/kill pane
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const id = await TS().addPane('shell');
        if (id) ids.push(id);
      }
      await wait(700);
      await Promise.all(ids.map((id) => TS().closePane(id)));
      await wait(500);
      const ptySisa = (await PTY.list()).filter((p) => p.alive).length;

      const d = await D.get();
      const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
      return JSON.stringify({
        tabsSetelahBuka, tabsSisa: S.getState().tabs.length,
        paneSisa: B.panes().length, ptySisa,
        ramTotal: d.ramTotalBytes, ramInti: d.ramBytes,
        ptyCount: d.ptyCount, panicked: d.panicked,
        heap, xterm: PTY.ids().length,
      });
    `,
      180000,
    );

    // git commit nyata tiap putaran
    fs.writeFileSync(path.join(WS, `stress-${r}.txt`), `putaran ${r}\n`);
    const gitHasil = await cdp.json(
      `
      await G.refresh();
      await wait(250);
      await G.stage(['stress-${r}.txt']);
      G.setMessage('stress putaran ${r}');
      await G.commit();
      await wait(400);
      return JSON.stringify({ err: G.error(), info: G.info() });
    `,
      90000,
    );

    // MCP tiga panggilan HTTP asli
    let mcpOk = 0;
    if (mcp.port) {
      const h = await fetch(`http://127.0.0.1:${mcp.port}/health`).then((x) => x.status).catch(() => 0);
      if (h === 200) mcpOk++;
      const w = await rpc(mcp.port, 'get_window', {}, mcp.token, 900 + r);
      if (w.body?.result) mcpOk++;
      const p = await rpc(mcp.port, 'list_panes', {}, mcp.token, 950 + r);
      if (p.body?.result) mcpOk++;
    }

    jejak.push({ r, ...hasil, gitErr: gitHasil.err, mcpOk });
    process.stdout.write(
      `putaran ${String(r).padStart(2)}: tab ${hasil.tabsSetelahBuka}→${hasil.tabsSisa}, ` +
        `pty sisa ${hasil.ptySisa}, xterm ${hasil.xterm}, heap ${(hasil.heap / 1024 / 1024).toFixed(0)}MB, ` +
        `RAM total ${(hasil.ramTotal / 1024 / 1024).toFixed(0)}MB, ` +
        `mcp ${mcpOk}/3${hasil.panicked ? ' PANIC!' : ''}${gitHasil.err ? ` gitErr: ${gitHasil.err}` : ''}\n`,
    );
    await sleep(200);
  }

  // ── laporan ──
  // GC paksa dulu supaya angka heap terakhir bukan sampah yang belum dibuang.
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(1200);
  const akhir = await cdp.json(
    `const d = await D.get();
     return JSON.stringify({ ram: d.ramTotalBytes, ptyCount: d.ptyCount,
       heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
       xterm: PTY.ids().length, panicked: d.panicked });`,
    40000,
  );

  const logSesudah = fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf8') : '';
  const barisBaru = logSesudah.slice(logSebelum);
  const adaPanic = /PANIC|panicked at/.test(barisBaru) || akhir.panicked;
  const heapAwal = jejak[0]?.heap ?? 0;
  const naikHeapMB = (akhir.heap - heapAwal) / 1024 / 1024;
  const ramAwal = jejak[0]?.ramTotal ?? 0;
  const ramAkhir = akhir.ram;
  const naikMB = (ramAkhir - ramAwal) / 1024 / 1024;
  const ghost = jejak.filter((x) => x.ptySisa > 0).length;
  const tabNyangkut = jejak.filter((x) => x.tabsSisa > 0).length;
  const gitGagal = jejak.filter((x) => x.gitErr).length;
  const mcpGagal = jejak.filter((x) => x.mcpOk < 3).length;

  // KRITERIA (16.4): yang menentukan ada-tidaknya kebocoran adalah JS HEAP
  // setelah GC + jumlah instance xterm + pty, BUKAN RSS proses WebView2.
  // RSS Chromium menahan halaman untuk dipakai ulang dan tidak turun seketika —
  // memakainya sebagai gate menghasilkan angka acak (pelajaran V5 fase 14).
  const lulus =
    !adaPanic &&
    naikHeapMB < 25 &&
    akhir.xterm === 0 &&
    akhir.ptyCount === 0 &&
    ghost === 0 &&
    tabNyangkut === 0 &&
    gitGagal === 0;

  console.log(`\n── ringkasan ${PUTARAN} putaran ──`);
  console.log(`buka/tutup file : ${PUTARAN * 10}x`);
  console.log(`spawn/kill pane : ${PUTARAN * 5}x`);
  console.log(`git commit      : ${PUTARAN}x (gagal: ${gitGagal})`);
  console.log(
    `MCP panggilan   : ${PUTARAN * 3}x (putaran tidak penuh: ${mcpGagal}${mcp.running ? '' : ' — server mati, tidak dihitung'})`,
  );
  console.log(
    `JS heap (GC)    : ${(heapAwal / 1024 / 1024).toFixed(1)}MB → ${(akhir.heap / 1024 / 1024).toFixed(1)}MB (${naikHeapMB >= 0 ? '+' : ''}${naikHeapMB.toFixed(1)}MB, batas +25MB) ← INI penentu kebocoran`,
  );
  console.log(
    `RSS proses      : ${(ramAwal / 1024 / 1024).toFixed(0)}MB → ${(ramAkhir / 1024 / 1024).toFixed(0)}MB (${naikMB >= 0 ? '+' : ''}${naikMB.toFixed(0)}MB) — informatif saja, allocator WebView2 menahan halaman`,
  );
  console.log(`instance xterm  : ${akhir.xterm} (harus 0)`);
  console.log(`pty terdaftar   : ${akhir.ptyCount} (harus 0)`);
  console.log(`pty ghost       : ${ghost} putaran`);
  console.log(`tab nyangkut    : ${tabNyangkut} putaran`);
  console.log(`panic di log    : ${adaPanic ? 'ADA' : 'tidak ada'}`);
  console.log(`\n== ${lulus ? 'LULUS' : 'GAGAL'} ==`);

  await cdp.runAsync(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().closeWorkspace();
    return 'bersih';
  `,
    60000,
  );
  fs.rmSync(BASE, { recursive: true, force: true });
  cdp.close();
  if (!lulus) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`stress error: ${e.message}`);
  process.exitCode = 1;
});
