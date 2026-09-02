// verify16.mjs — verifikasi fase 16 (Bugfix Vol 2: perf, RAM, startup, edge).
//
// Pakai:  node scripts/verify16.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + 'npm run dev'.
//
// Peta V → item prompt fase 16:
//   V1  startup tercatat di perf marks (16.1)
//   V2  RAM 20 tab + 4 pane, tutup semua → turun (16.2)
//   V3  mode penghemat RAM benar-benar berlaku (16.2)
//   V4  path >260 char + nama unicode/spasi/# (16.3)
//   V5  workspace C:\ ditolak dengan pesan jelas (16.3)
//   V6  settings.json rusak → default + backup .broken (16.3)
//   V7  AI offline → pesan jelas, bukan hang (16.3)
//   V8  Diagnostics: tabel domain + export report (16.5)
//   V9  self_test semua hijau (16.5)
//   V10 tsc 0 + cargo test + 0 console error
//
// Stress 16.4 dijalankan terpisah: 'npm run stress'.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify16');
const J = JSON.stringify;

const BASE = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `zephyr-p16-${process.pid}`,
);
const WS = path.join(BASE, 'ws');
const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const DATA_DIR = path.join(appdata, 'zephyr');

/** Folder bersarang sampai path totalnya >300 karakter. */
function buatPathPanjang() {
  let p = WS;
  while (p.length < 300) p = path.join(p, 'folder-yang-namanya-panjang-sekali');
  fs.mkdirSync(p, { recursive: true });
  return path.join(p, 'berkas-dalam.txt');
}

function siapkan() {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  // 20 file untuk uji RAM.
  for (let i = 0; i < 20; i++) {
    fs.writeFileSync(
      path.join(WS, `tab${String(i).padStart(2, '0')}.txt`),
      `file ${i}\n${'isi baris berulang untuk menambah ukuran\n'.repeat(200)}`,
    );
  }
  // Nama file aneh: spasi, #, Mandarin, tanda kurung.
  fs.writeFileSync(path.join(WS, '# file dengan spasi (1).ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(WS, '中文文件名.md'), '# 标题\n\n内容\n');
  return { panjang: buatPathPanjang() };
}

const main = async () => {
  const { panjang } = siapkan();
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_BUG__')) === 'undefined') {
    throw new Error('__ZEPHYR_BUG__ tidak ada — reload halaman');
  }

  await cdp.runAsync(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    await window.__ZEPHYR_SET_PAUSED__(false);
    await S.getState().openWorkspace(${J(WS)});
    await wait(600);
    return 'siap';
  `,
    60000,
  );

  // ═════════ V1: startup tercatat ═════════
  // CATATAN: `perf_mark` menumpuk sepanjang proses hidup (workspace_open dari
  // uji sebelumnya ikut tercatat, dan `ui-ready` bertambah setiap reload
  // halaman dev). Yang benar diuji adalah mark ui-ready PERTAMA — itulah
  // startup sebenarnya; mark berikutnya adalah hot-reload Vite.
  const v1 = await cdp.json(
    `
    const d = await D.get();
    const pertama = {};
    for (const x of d.marks) if (!(x.name in pertama)) pertama[x.name] = x.atMs;
    return JSON.stringify({ marks: pertama, namaMark: [...new Set(d.marks.map((x) => x.name))],
                            jumlahMark: d.marks.length,
                            uptimeMs: d.uptimeMs, os: d.os, cpu: d.cpuCount,
                            hostRam: d.hostRamBytes });
  `,
    40000,
  );
  const adaUiReady = typeof v1.marks['ui-ready'] === 'number';
  const adaSetup = v1.namaMark.some((n) => /setup|start/.test(n));
  check(
    'V1',
    adaUiReady &&
      v1.marks['ui-ready'] < 6000 &&
      adaSetup &&
      v1.os.length > 0 &&
      v1.cpu > 0 &&
      v1.hostRam > 0,
    `perf marks: ${v1.namaMark.join(', ')} (${v1.jumlahMark} entri); ui-ready PERTAMA @${v1.marks['ui-ready']}ms setelah proses mulai (dev build; target release ≤2500ms diuji fase 17); host: ${v1.os}, ${v1.cpu} CPU, ${(v1.hostRam / 1024 / 1024 / 1024).toFixed(1)} GB RAM`,
  );

  // ═════════ V2: 20 tab + 4 pane → RAM, lalu tutup semua ═════════
  const v2 = await cdp.json(
    `
    const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
    const h0 = heap();
    for (let i = 0; i < 20; i++) {
      await s.openPath(${J(WS)} + '\\\\tab' + String(i).padStart(2, '0') + '.txt');
    }
    await wait(400);
    const tabs = S.getState().tabs.length;
    // "termuat" = tab yang masih MEMEGANG konten di memori. 'bytes' adalah
    // ukuran file di disk dan selalu >0, jadi tidak bisa dipakai untuk ini.
    const termuat = B.tabs().filter((t) => t.loaded && t.held > 0).length;
    TS().setVisible(true);
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const id = await TS().addPane('shell');
      if (id) ids.push(id);
    }
    await wait(1800);
    const d1 = await D.get();
    const h1 = heap();
    // Tutup semua tab & pane.
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await Promise.all(ids.map((id) => TS().closePane(id)));
    await wait(1200);
    return JSON.stringify({ tabs, termuat, panes: ids.length,
                            ramTotal: d1.ramTotalBytes, ramInti: d1.ramBytes,
                            ptyCount: d1.ptyCount, h0, h1 });
  `,
    180000,
  );
  // GC paksa lalu ukur heap turun.
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(900);
  const v2b = await cdp.json(
    `
    const d = await D.get();
    return JSON.stringify({
      heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
      tabs: S.getState().tabs.length, panes: B.panes().length,
      ptyCount: d.ptyCount, ramTotal: d.ramTotalBytes,
    });
  `,
    40000,
  );
  const mb = (b) => (b / 1024 / 1024).toFixed(1);
  const turunPersen = v2.h1 > 0 ? Math.round(((v2.h1 - v2b.heap) / v2.h1) * 100) : 0;
  check(
    'V2',
    v2.tabs === 20 &&
      v2.panes === 4 &&
      v2.termuat <= 12 &&
      v2b.tabs === 0 &&
      v2b.panes === 0 &&
      v2b.ptyCount === 0 &&
      v2b.heap <= v2.h1 &&
      v2.ramTotal < 800 * 1024 * 1024,
    `20 tab (${v2.termuat} memegang konten, ${20 - v2.termuat} dilepas) + ${v2.panes} pane: RAM total ${mb(v2.ramTotal)} MB (dev build; gate <400MB diuji di release fase 17), JS heap ${mb(v2.h0)}→${mb(v2.h1)} MB; setelah semua ditutup + GC: heap ${mb(v2b.heap)} MB (${turunPersen >= 0 ? 'turun' : 'naik'} ${Math.abs(turunPersen)}%), pty ${v2b.ptyCount}, tab ${v2b.tabs}`,
  );

  // ═════════ V3: mode penghemat RAM ═════════
  const v3 = await cdp.json(
    `
    const awal = S.getState().settings.general.lowRam === true;
    await S.getState().applySettings({ general: { lowRam: true } });
    await wait(600);
    const nyala = S.getState().settings.general.lowRam === true;
    const batasNyala = B.maxTabs();
    // Buka 12 file: dengan lowRam batasnya 8, jadi minimal 4 harus dilepas.
    for (let i = 0; i < 12; i++) {
      await s.openPath(${J(WS)} + '\\\\tab' + String(i).padStart(2, '0') + '.txt');
    }
    await wait(600);
    const termuatNyala = B.tabs().filter((t) => t.loaded && t.held > 0).length;
    const host = q('.zephyr-cm-host');
    const dataLowram = host ? host.dataset.lowram : null;
    const dataSmooth = host ? host.dataset.smooth : null;
    const dariDisk = (await SET.settingsFromDisk()).general.lowRam;
    // Kembalikan.
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().applySettings({ general: { lowRam: false } });
    await wait(500);
    return JSON.stringify({ awal, nyala, batasNyala, termuatNyala,
                            dataLowram, dataSmooth,
                            batasMati: B.maxTabs(), dariDisk });
  `,
    120000,
  );
  check(
    'V3',
    v3.nyala === true &&
      v3.batasNyala === 8 &&
      v3.termuatNyala <= 8 &&
      v3.dataLowram === '1' &&
      v3.dataSmooth === '0' &&
      v3.batasMati === 12,
    `lowRam ON: batas tab ${v3.batasNyala} (dari 12), 12 file dibuka → ${v3.termuatNyala} memegang konten, editor data-lowram=${v3.dataLowram} data-smooth=${v3.dataSmooth}; tersimpan ke disk (${v3.dariDisk}); OFF → batas ${v3.batasMati}`,
  );

  // ═════════ V4: path >260 char + nama unicode/spasi/# ═════════
  const isiPanjang = `berkas di path ${panjang.length} karakter\n`;
  const v4 = await cdp.json(
    `
    // Tulis lewat jalur Rust (fs_write) ke path >260 char.
    const tulis = await tangkap(() => B.write(${J(panjang)}, ${J(isiPanjang)}));
    const baca = await tangkap(() => B.read(${J(panjang)}));
    // File dengan nama aneh: buka lewat store (jalur user).
    await s.openPath(${J(path.join(WS, '# file dengan spasi (1).ts'))});
    await wait(300);
    await s.openPath(${J(path.join(WS, '中文文件名.md'))});
    await wait(300);
    const tabs = B.tabs().map((t) => ({ name: t.name, bytes: t.bytes, lang: null }));
    const isiUnicode = (S.getState().tabs.find((t) => t.name === '中文文件名.md') || {}).content || '';
    const isiSpasi = (S.getState().tabs.find((t) => (t.name || '').includes('spasi')) || {}).content || '';
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    return JSON.stringify({
      tulisOk: tulis.ok, tulisErr: tulis.message || null,
      bacaOk: baca.ok, isiBaca: baca.ok ? baca.value.content : null,
      tabs, isiUnicode, isiSpasi,
      panjangPath: ${panjang.length},
    });
  `,
    90000,
  );
  const adaDiDisk = fs.existsSync(panjang) || fs.existsSync(`\\\\?\\${panjang}`);
  check(
    'V4',
    v4.tulisOk &&
      v4.bacaOk &&
      /berkas di path/.test(v4.isiBaca ?? '') &&
      adaDiDisk &&
      /标题/.test(v4.isiUnicode) &&
      /export const a/.test(v4.isiSpasi),
    `path ${v4.panjangPath} karakter (>260): fs_write ok, fs_read mengembalikan isinya, file ada di disk (${adaDiDisk}); nama "# file dengan spasi (1).ts" dan "中文文件名.md" terbuka dengan isi benar`,
  );

  // ═════════ V5: workspace root drive ditolak ═════════
  const wsSebelum = await cdp.eval(`String(window.__ZEPHYR__.getState().workspace)`);
  const v5 = await cdp.json(
    `
    const t0 = performance.now();
    const r = await tangkap(() => B.openWs('C:\\\\'));
    const ms = Math.round(performance.now() - t0);
    return JSON.stringify({ ok: r.ok, code: r.code, msg: r.message || null, ms,
                            workspace: S.getState().workspace,
                            status: S.getState().statusMessage });
  `,
    60000,
  );
  check(
    'V5',
    v5.ok === false &&
      v5.code === 'InvalidInput' &&
      /root drive/.test(v5.msg ?? '') &&
      v5.ms < 3000 &&
      v5.workspace === wsSebelum,
    `workspace_open("C:\\") ditolak dalam ${v5.ms}ms: ${v5.code} "${(v5.msg ?? '').slice(0, 70)}…" — tidak scan disk, workspace tidak berubah`,
  );

  // ═════════ V6: settings.json rusak → default + backup ═════════
  const settingsPath = path.join(DATA_DIR, 'settings.json');
  const asli = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : null;
  fs.writeFileSync(settingsPath, '{ "general": { "fontSize": 13,,, RUSAK');
  const v6 = await cdp.json(
    `
    const cfg = await SET.settingsFromDisk();
    const broken = await B.brokenConfig();
    return JSON.stringify({ fontSize: cfg.general.fontSize, theme: cfg.theme.current,
                            broken, adaKunciDefault: !!cfg.mcp && !!cfg.agents });
  `,
    60000,
  );
  const backupAda = fs.existsSync(v6.broken ?? '');
  const isiBackup = backupAda ? fs.readFileSync(v6.broken, 'utf8') : '';
  // Pulihkan settings asli.
  if (asli) fs.writeFileSync(settingsPath, asli);
  await cdp.runAsync(`await S.getState().reloadSettings(); await wait(300); return 'x';`, 30000);
  check(
    'V6',
    v6.fontSize === 13 &&
      v6.adaKunciDefault &&
      backupAda &&
      /RUSAK/.test(isiBackup) &&
      /\.broken-/.test(v6.broken ?? ''),
    `settings.json dirusak → get_settings mengembalikan DEFAULT lengkap (fontSize ${v6.fontSize}, theme ${v6.theme}), file buruk dipindah ke ${path.basename(v6.broken ?? '-')} (isinya masih ada: ${/RUSAK/.test(isiBackup)})`,
  );

  // ═════════ V7: AI offline → pesan jelas ═════════
  const v7 = await cdp.json(
    `
    // Arahkan baseUrl ke IP yang tidak akan menjawab (TEST-NET-1, RFC 5737)
    // supaya yang diuji adalah TIMEOUT KONEKSI — bukan "connection refused"
    // yang balas instan. Key palsu dipasang supaya guard key lewat dan request
    // benar-benar dicoba lewat Rust.
    await SET.setKey('openai', 'MOCK-KEY-OFFLINE-TEST');
    await S.getState().applySettings({
      models: { activeProvider: 'openai', providers: { openai: { baseUrl: 'http://192.0.2.1:81/v1' } } },
    });
    await wait(400);
    await X.store.getState().loadKeys();
    // PENTING: id model harus ADA di katalog. findModel untuk id tak dikenal
    // fallback ke provider saat ini (gemini), jadi request tidak pernah dikirim
    // ke openai dan yang muncul cuma toast "isi API key Gemini".
    await X.store.getState().setModel('gpt-5.1-mini');
    await wait(300);
    X.store.setState({ toast: null });
    // Panel AI harus TAMPIL supaya bubble error benar-benar ada di DOM
    // (bukti "muncul di chat area, bukan console" — syarat 16.3).
    TS().setVisible(true);
    TS().setDock('ai');
    await wait(400);
    const t0 = performance.now();
    await X.send('halo offline');
    // Tunggu bubble error / selesai (maks 35s) — bukan hang.
    let pesan = null;
    for (let i = 0; i < 70; i++) {
      await wait(500);
      const msgs = X.messages();
      const akhir = msgs[msgs.length - 1];
      if (akhir && (akhir.error || !akhir.streaming)) { pesan = akhir; break; }
    }
    const ms = Math.round(performance.now() - t0);
    await wait(400);
    const errDom = (q('[data-testid="ai-error"]') || {}).textContent || null;
    await SET.setKey('openai', '');
    X.store.getState().newChat();
    TS().setVisible(false);
    return JSON.stringify({ ms, error: pesan ? pesan.error : null,
                            streaming: pesan ? pesan.streaming : null,
                            errDom, pending: X.store.getState().pending });
  `,
    150000,
  );
  check(
    'V7',
    v7.ms < 20000 &&
      v7.pending === null &&
      v7.streaming === false &&
      /koneksi internet|tidak bisa menghubungi/i.test(v7.error ?? '') &&
      (v7.errDom ?? '').length > 0,
    `provider tidak menjawab: error datang dalam ${(v7.ms / 1000).toFixed(1)}s (timeout_connect 10s, tanpa retry — bukan hang), bubble error TAMPIL di area chat "${(v7.errDom ?? '').slice(0, 80)}", streaming berhenti, pending=null`,
  );

  // ═════════ V8: Diagnostics tabel domain + export ═════════
  const v8 = await cdp.json(
    `
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.setState({ sidebarVisible: true });
    S.getState().setActivity('settings');
    S.getState().setSettingsOpen(true);
    SET.ui.getState().setSection('about');
    await wait(700);
    const rows = qa('[data-testid="diag-domains"] tr').map((tr) => ({
      id: tr.dataset.domain, level: tr.dataset.level,
      detail: (tr.querySelector('code') || {}).textContent || '',
    }));
    const tabel = qa('[data-testid="diag-table"] tr').map((tr) =>
      (tr.querySelector('.about-k') || {}).textContent);
    const adaExport = !!q('[data-testid="diag-export"]');
    const adaLogs = !!q('[data-testid="diag-open-logs"]');
    // Klik export → laporan JSON masuk clipboard (jalur clipboard-manager).
    q('[data-testid="diag-export"]').click();
    await wait(800);
    const msg = (q('[data-testid="diag-export-msg"]') || {}).textContent || null;
    const clip = await PTY.clipRead();
    return JSON.stringify({ rows, tabel, adaExport, adaLogs, msg,
                            clipPanjang: (clip || '').length,
                            clipValid: (() => { try { const j = JSON.parse(clip); return !!j.versi && Array.isArray(j.domains); } catch (e) { return false; } })(),
                            clipAdaSecret: /sk-|ghp_|token/i.test(clip || '') });
  `,
    90000,
  );
  const domainWajib = ['fs', 'pty', 'git', 'mcp', 'ai', 'extensions', 'log'];
  const adaSemua = domainWajib.every((d) => v8.rows.some((r) => r.id === d));
  check(
    'V8',
    adaSemua &&
      v8.rows.every((r) => ['ok', 'warn', 'off'].includes(r.level)) &&
      v8.tabel.includes('OS') &&
      v8.tabel.includes('RAM mesin') &&
      v8.adaExport &&
      v8.adaLogs &&
      v8.clipValid &&
      !v8.clipAdaSecret,
    `tabel domain lengkap (${v8.rows.map((r) => r.id + '=' + r.level).join(', ')}); tabel info memuat OS + RAM mesin; Export report → ${v8.clipPanjang} byte JSON valid di clipboard tanpa secret ("${v8.msg}")`,
  );

  // ═════════ V9: self-test hijau ═════════
  const v9 = await cdp.json(
    `
    q('[data-testid="diag-self-run"]').click();
    let items = [];
    for (let i = 0; i < 30; i++) {
      await wait(400);
      items = qa('[data-testid="diag-self"] li').map((li) => ({
        name: li.dataset.test, ok: li.dataset.ok === '1',
        detail: (li.querySelector('.diag-self-detail') || {}).textContent || '',
        ms: (li.querySelector('.diag-self-ms') || {}).textContent || '',
      }));
      if (items.length > 0) break;
    }
    const ringkas = (q('[data-testid="diag-self-summary"]') || {}).textContent || null;
    return JSON.stringify({ items, ringkas });
  `,
    90000,
  );
  const gagal = v9.items.filter((x) => !x.ok);
  check(
    'V9',
    v9.items.length >= 5 && gagal.length === 0,
    `self-test ${v9.ringkas}: ${v9.items.map((x) => `${x.name} ${x.ms}`).join(', ')}${gagal.length ? ` — GAGAL: ${gagal.map((x) => x.name + ': ' + x.detail).join('; ')}` : ''}`,
  );

  // ═════════ V10: tsc + cargo test + state bersih ═════════
  const v10 = await cdp.json(
    `
    S.getState().setSettingsOpen(false);
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().closeWorkspace();
    await wait(700);
    const err = (window.__ZEPHYR_ERRORS__ || []).filter((e) =>
      !/ERR_ABORTED|favicon|ResizeObserver|127.0.0.1:9\\b|ERR_CONNECTION/.test(e));
    const d = await D.get();
    return JSON.stringify({ err: err.slice(0, 4), errN: err.length,
                            tabs: S.getState().tabs.length, panes: B.panes().length,
                            ptyCount: d.ptyCount, panicked: d.panicked });
  `,
    60000,
  );
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], { cwd: process.cwd(), encoding: 'utf8' });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  const rust = spawnSync('cargo', ['test', '--lib', '--quiet'], {
    cwd: path.join(process.cwd(), 'src-tauri'),
    encoding: 'utf8',
  });
  const rustLulus = /test result: ok\./.test(`${rust.stdout ?? ''}`) && rust.status === 0;
  const jumlahTes = ((rust.stdout ?? '').match(/(\d+) passed/) ?? [])[1] ?? '?';
  check(
    'V10',
    tsc.status === 0 &&
      tscOut === '' &&
      rustLulus &&
      v10.errN === 0 &&
      v10.tabs === 0 &&
      v10.panes === 0 &&
      v10.ptyCount === 0 &&
      v10.panicked === false,
    `tsc --noEmit exit ${tsc.status} tanpa output; cargo test --lib ${jumlahTes} lulus; ${v10.errN} console error sepanjang V1–V9${v10.errN ? ` (${v10.err.join(' | ').slice(0, 80)})` : ''}; state bersih & tidak ada panic`,
  );

  fs.rmSync(BASE, { recursive: true, force: true });
  cdp.close();
  selesai();
};

main().catch((e) => {
  console.error(`verify16 error: ${e.message}`);
  process.exitCode = 1;
});
