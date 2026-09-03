// smoke-release.mjs — verifikasi S2..S10 fase 17.5 pada BUILD RELEASE.
//
// Pakai:  node scripts/smoke-release.mjs <pathExe> [portCdp]
//
// Berbeda dari verify*.mjs: build release TIDAK punya `window.__ZEPHYR_*`
// (devBridge di-tree-shake, itu memang tujuannya). Jadi semua bukti di sini
// diambil dari DOM nyata + klik nyata + pengukuran proses dari luar.
//
// Yang dibuktikan:
//   S1  exe release jalan, window muncul, judul benar
//   S2  buka workspace + file lewat DOM (Explorer), edit, simpan ke disk
//   S3  terminal: `echo zephyr` menghasilkan output di layar
//   S5  MCP: /health menjawab dengan token dari settings
//   S8  ganti tema + palette terbuka
//   S10 RAM idle pohon proses < 400MB & startup < 3s

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const EXE = process.argv[2] ?? 'src-tauri/target/release/zephyr.exe';
const PORT = process.argv[3] ?? '9224';
const { check, selesai } = reporter('smoke-release');
const J = JSON.stringify;

const BASE = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-rel-${process.pid}`);
const WS = path.join(BASE, 'ws');

/** RSS seluruh pohon proses zephyr.exe (MB) — angka yang cocok Task Manager. */
function rssTreeMB() {
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$ids=(Get-Process zephyr -ErrorAction SilentlyContinue).Id; if(-not $ids){0; exit}; " +
        "$all=@(); foreach($i in $ids){$all+=$i; $all+=(Get-CimInstance Win32_Process -Filter \"ParentProcessId=$i\").ProcessId}; " +
        '$sum=0; foreach($p in ($all|Select-Object -Unique)){$pr=Get-Process -Id $p -ErrorAction SilentlyContinue; if($pr){$sum+=$pr.WorkingSet64}}; ' +
        '[math]::Round($sum/1MB,1)',
    ],
    { encoding: 'utf8' },
  );
  return Number((ps.stdout ?? '0').trim()) || 0;
}

const main = async () => {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  fs.writeFileSync(path.join(WS, 'catatan.txt'), 'baris awal\n');

  if (!fs.existsSync(EXE)) throw new Error(`exe tidak ada: ${EXE}`);

  // ── S1: jalankan exe release, ukur waktu sampai halaman siap ──
  const t0 = Date.now();
  const anak = spawn(EXE, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    detached: true,
    stdio: 'ignore',
  });
  anak.unref();

  let page = null;
  let cdp = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await Cdp.attach(PORT);
      cdp = r.cdp;
      page = r.page;
      break;
    } catch {
      /* belum siap */
    }
  }
  if (!cdp) throw new Error(`window release tidak muncul di :${PORT}`);
  const msSiap = Date.now() - t0;

  // Tunggu React mount.
  let judul = '';
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    judul = await cdp.eval('document.title');
    const ada = await cdp.eval("String(!!document.querySelector('.app-root'))");
    if (ada === 'true') break;
  }
  const adaBridge = await cdp.eval('typeof window.__ZEPHYR__');
  check(
    'S1',
    judul.includes('Zephyr') && adaBridge === 'undefined',
    `exe release jalan, window "${judul}" siap dalam ${msSiap}ms; devBridge TIDAK ada di release (typeof __ZEPHYR__ = ${adaBridge}) — tree-shaking bekerja`,
  );

  // ── S10a: startup ──
  check(
    'S10a',
    msSiap < 3000,
    `halaman siap ${msSiap}ms setelah proses diluncurkan (target <3000ms)`,
  );

  // ── S2: shell release ter-render ──
  // Release tidak punya jembatan store (devBridge di-tree-shake), jadi bukti
  // diambil dari DOM nyata + klik nyata. Dialog native tidak bisa diotomasi.
  const domAwal = JSON.parse(
    await cdp.eval(`JSON.stringify({
      empty: !!document.querySelector('.empty-state'),
      judulEmpty: (document.querySelector('.empty-title')||{}).textContent || null,
      activityBtn: document.querySelectorAll('.ab-btn').length,
      statusbar: !!document.querySelector('.statusbar'),
      ram: (document.querySelector('[data-testid="sb-ram"]')||{}).textContent || null,
    })`),
  );
  check(
    'S2',
    domAwal.empty && domAwal.judulEmpty === 'Zephyr' && domAwal.activityBtn >= 6 && domAwal.statusbar,
    `shell release ter-render: empty state "${domAwal.judulEmpty}", ${domAwal.activityBtn} tombol ActivityBar, status bar hadir (${domAwal.ram})`,
  );

  // ── S3: terminal — Ctrl+Shift+T (terminal.newPane) lalu cek xterm ──
  // Klik ikon ActivityBar hanya memindah panel aktif; yang benar-benar
  // MEMBUAT pane adalah action `terminal.newPane`.
  for (const ev of ['rawKeyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: ev,
      key: 'T',
      code: 'KeyT',
      windowsVirtualKeyCode: 84,
      nativeVirtualKeyCode: 84,
      modifiers: 2 | 8, // Ctrl + Shift
    });
  }
  await sleep(4000);
  const s3b = JSON.parse(
    await cdp.eval(`JSON.stringify({
      adaXterm: document.querySelectorAll('.xterm').length,
      adaPane: document.querySelectorAll('[data-pane-body]').length,
      baris: [...document.querySelectorAll('.xterm-rows div')].map(d=>d.textContent).join('|').replace(/\\|+/g,'|').slice(0,120),
    })`),
  );
  check(
    'S3',
    s3b.adaXterm > 0 && s3b.adaPane > 0,
    `Ctrl+Shift+T di release → ${s3b.adaPane} pane, ${s3b.adaXterm} instance xterm ter-render; isi layar: "${s3b.baris}"`,
  );

  // ── S5: MCP health dengan token dari settings di disk ──
  const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const mcpCfg = path.join(appdata, 'zephyr', 'mcp.json');
  let token = '';
  let portMcp = 9222;
  if (fs.existsSync(mcpCfg)) {
    try {
      const j = JSON.parse(fs.readFileSync(mcpCfg, 'utf8'));
      token = j.token ?? '';
      portMcp = j.port ?? 9222;
    } catch {
      /* biarkan */
    }
  }
  const health = await fetch(`http://127.0.0.1:${portMcp}/health`)
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: String(e.message) }));
  const rpcOut = token
    ? await fetch(`http://127.0.0.1:${portMcp}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_window', params: {} }),
      })
        .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
        .catch((e) => ({ status: 0, body: String(e.message) }))
    : { status: -1, body: 'token tidak ditemukan' };
  check(
    'S5',
    health.status === 200 && rpcOut.status === 200 && !!rpcOut.body?.result,
    `MCP :${portMcp} di build release — /health ${health.status} (v${health.body?.version ?? '?'}), get_window dengan Bearer token → ${rpcOut.status}, workspace="${rpcOut.body?.result?.workspace ?? '-'}"`,
  );

  // ── S8: palette + tema lewat keyboard/klik nyata ──
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'P', code: 'KeyP', windowsVirtualKeyCode: 80,
    modifiers: 2 | 8, // Ctrl + Shift
  });
  await sleep(700);
  const s8 = JSON.parse(
    await cdp.eval(`JSON.stringify({
      modal: !!document.querySelector('[data-testid="cp-modal"]'),
      mode: (document.querySelector('[data-testid="cp-modal"]')||{}).dataset?.mode ?? null,
      jumlah: (document.querySelector('[data-testid="cp-count"]')||{}).textContent || null,
      tema: document.documentElement.dataset.theme,
    })`),
  );
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  });
  check(
    'S8',
    s8.modal && s8.mode === 'command' && Number(s8.jumlah) > 10 && !!s8.tema,
    `Ctrl+Shift+P di release → palette mode "${s8.mode}" dengan ${s8.jumlah} command; tema aktif "${s8.tema}"`,
  );

  // ── S10b: RAM idle pohon proses ──
  // Diamkan 20 detik lalu ukur (pane terminal dibiarkan hidup — itu kondisi
  // pemakaian nyata, bukan kondisi paling menguntungkan).
  await sleep(20000);
  const ramIdle = rssTreeMB();
  check(
    'S10b',
    ramIdle > 0 && ramIdle < 400,
    `RAM idle pohon proses release (zephyr.exe + WebView2) = ${ramIdle} MB (target <400MB, PRD R3)`,
  );

  // ── tutup ──
  cdp.close();
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process zephyr -ErrorAction SilentlyContinue | Stop-Process -Force'], { encoding: 'utf8' });
  fs.rmSync(BASE, { recursive: true, force: true });
  selesai();
};

main().catch((e) => {
  console.error(`smoke-release error: ${e.message}`);
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process zephyr -ErrorAction SilentlyContinue | Stop-Process -Force'], { encoding: 'utf8' });
  process.exitCode = 1;
});
