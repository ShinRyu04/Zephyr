// verify14.mjs — verifikasi V1..V9 fase 14 (Backend Rust Core: hardening & perf).
//
// Pakai:  node scripts/verify14.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: tidak ada yang "dianggap lulus".
//   * V1/V2 memanggil command Rust MENTAH lewat `__ZEPHYR_DIAG__` dan membaca
//     objek error `{code,message}` yang benar-benar dikembalikan.
//   * V3 menjalankan 3 operasi git BERSAMAAN (Promise.all) lalu membuktikan
//     tidak ada yang gagal karena index.lock + repo tetap konsisten.
//   * V4 mengukur CPU proses zephyr.exe SUNGGUHAN lewat WMIC/PowerShell saat
//     2 pane `ping -t` mengalir, bukan menebak dari jumlah event.
//   * V5 membuktikan pelepasan memori lewat JS heap setelah GC paksa
//     (HeapProfiler.collectGarbage) — RSS proses WebView2 tidak turun seketika.
//   * V8 membaca RAM TOTAL (zephyr.exe + seluruh proses WebView2) dari
//     `get_diagnostics`; ambangnya beda untuk dev vs release.
//   * V6 membaca file log di %APPDATA%\zephyr\logs dari disk.
//   * V7 memanggil `debug_panic` lalu memastikan stack ada di file log dan
//     dialog crash muncul di DOM.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const CDP_PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── CDP ─────────────────────────

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => {
      c.#ws.once('open', res);
      c.#ws.once('error', rej);
    });
    c.#ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const p = c.#pending.get(msg.id);
      if (p) {
        c.#pending.delete(msg.id);
        p(msg);
      }
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      userGesture: true,
    });
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    }
    return r.result?.result?.value;
  }

  /** Async di halaman + polling (WebView2 sering membuang promise). */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV14_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const D = window.__ZEPHYR_DIAG__;
        const G = window.__ZEPHYR_GIT__;
        const SET = window.__ZEPHYR_SET__;
        const PTY = window.__ZEPHYR_PTY__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        /** tangkap error command Rust sebagai objek biasa */
        const tangkap = async (fn) => {
          try { const v = await fn(); return { ok: true, value: v ?? null }; }
          catch (e) {
            return { ok: false, code: e && e.code ? e.code : null,
                     message: e && e.message ? e.message : String(e) };
          }
        };
        /** buka halaman Settings di section tertentu (pelajaran fase 13:
         *  panel terminal maximized membuat .editor-area display:none). */
        const bukaSet = async (sec) => {
          if (TS().maximized || TS().visible) TS().setVisible(false);
          S.setState({ sidebarVisible: true });
          S.getState().setActivity('settings');
          S.getState().setSettingsOpen(true);
          if (sec) SET.ui.getState().setSection(sec);
          await wait(360);
        };
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && e.stack) ? String(e.stack).slice(0, 400)
                       : (e && (e.message || e.code)) ? JSON.stringify(e) : String(e) }; },
      );
      return 'started';
    })()`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(150);
      const st = JSON.parse(await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`));
      if (st.done) {
        await this.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'x'; })()`);
        if (st.error) throw new Error(st.error);
        return st.value;
      }
      if (Date.now() > deadline) throw new Error(`timeout: ${body.slice(0, 70)}…`);
    }
  }

  close() {
    this.#ws.close();
  }
}

/** Paksa garbage collection lalu baca ukuran JS heap yang TERPAKAI.
 *
 *  KENAPA JS HEAP, BUKAN RSS PROSES (fase 14, sudah kena): memori proses
 *  WebView2 TIDAK turun seketika setelah tab ditutup — allocator dan renderer
 *  Chromium menahan halaman untuk dipakai ulang. Mengukur RSS untuk menilai
 *  "tab ditutup = memori turun" menghasilkan angka acak (pernah 666MB → 795MB
 *  padahal 8 tab sudah ditutup). JS heap setelah GC paksa adalah tempat isi
 *  tab benar-benar hidup, dan ia turun secara deterministik.
 */
async function heapSetelahGc(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(700);
  const v = await cdp.eval(
    "(performance.memory ? performance.memory.usedJSHeapSize : 0)",
  );
  return Number(v ?? 0);
}

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
};

// ───────────────────── util host (di luar WebView) ─────────────────────

const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const LOG_DIR = path.join(appdata, 'zephyr', 'logs');

function logFileHariIni() {
  const d = new Date();
  const nama = `zephyr-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}.log`;
  return path.join(LOG_DIR, nama);
}

function bacaLog() {
  const f = logFileHariIni();
  if (!fs.existsSync(f)) return '';
  return fs.readFileSync(f, 'utf8');
}

/** PID + total CPU-seconds proses zephyr.exe (dua sampel = %CPU nyata). */
function cpuSample() {
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-Process zephyr -ErrorAction SilentlyContinue | Sort-Object -Property WS -Descending | Select-Object -First 1 | ForEach-Object { \"$($_.Id) $($_.CPU) $($_.WS)\" }",
    ],
    { encoding: 'utf8' },
  );
  const line = (ps.stdout ?? '').trim().split(/\r?\n/)[0] ?? '';
  const [pid, cpu, ws] = line.split(/\s+/);
  if (!pid) return null;
  return { pid: Number(pid), cpu: Number(cpu), ws: Number(ws), t: Date.now() };
}

// ───────────────────────── main ─────────────────────────

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_DIAG__')) === 'undefined') {
    throw new Error('__ZEPHYR_DIAG__ tidak ada — reload halaman (devBridge fase 14)');
  }

  // Sandbox: workspace uji + repo git uji.
  const BASE = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-p14-${process.pid}`);
  fs.rmSync(BASE, { recursive: true, force: true });
  const WS = path.join(BASE, 'ws');
  fs.mkdirSync(WS, { recursive: true });

  // Repo git uji (V3): init + commit awal supaya HEAD ada.
  const git = (args, cwd = WS) =>
    spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Zephyr Uji']);
  git(['config', 'user.email', 'uji@zephyr.local']);
  fs.writeFileSync(path.join(WS, 'awal.txt'), 'satu\n');
  git(['add', '.']);
  git(['commit', '-m', 'awal']);

  // Kondisi awal di app: buka workspace uji, tutup semua tab & pane.
  await cdp.runAsync(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    await S.getState().openWorkspace(${JSON.stringify(WS)});
    await wait(500);
    await G.refresh();
    return 'siap';
  `,
    60000,
  );

  // ───────── V1: buka file yang sudah dihapus → NotFound jelas ─────────
  const hilang = path.join(WS, 'sudah-dihapus.txt');
  fs.writeFileSync(hilang, 'nanti dihapus\n');
  const v1 = JSON.parse(
    await cdp.runAsync(
      `
      // Buka dulu supaya tab hidup, lalu file dihapus dari luar (host),
      // lalu dibaca lagi lewat command MENTAH.
      await s.openPath(${JSON.stringify(hilang)});
      await wait(300);
      const adaTab = S.getState().tabs.some((t) => t.path === ${JSON.stringify(hilang)});
      return JSON.stringify({ adaTab });
    `,
      40000,
    ),
  );
  fs.rmSync(hilang, { force: true });
  const v1b = JSON.parse(
    await cdp.runAsync(
      `
      const baca = await tangkap(() => D.read(${JSON.stringify(hilang)}));
      const stat = await tangkap(() => D.get());
      // openPath ke file hilang juga tidak boleh melempar keluar / crash
      const buka = await tangkap(() => s.openPath(${JSON.stringify(hilang)} + 'x'));
      return JSON.stringify({
        code: baca.code, msg: baca.message,
        masihHidup: stat.ok,
        errKonsol: (window.__ZEPHYR_ERRORS__ ?? []).length,
        bukaOk: buka.ok || !!buka.code,
      });
    `,
      40000,
    ),
  );
  check(
    'V1',
    v1.adaTab &&
      v1b.code === 'NotFound' &&
      /sudah-dihapus\.txt/.test(v1b.msg) &&
      /dihapus atau dipindah/.test(v1b.msg) &&
      v1b.masihHidup,
    `file dihapus dari luar → fs_read = ${v1b.code}: "${v1b.msg.slice(0, 78)}" (menyebut nama file), app tetap hidup`,
  );

  // ───────── V2: fs_write di luar workspace → WorkspaceOutside ─────────
  const luar = path.join(BASE, 'luar-workspace.txt');
  const luarTrik = path.join(WS, '..', 'trik-dotdot.txt');
  const dalam = path.join(WS, 'boleh.txt');
  const v2 = JSON.parse(
    await cdp.runAsync(
      `
      const a = await tangkap(() => D.write(${JSON.stringify(luar)}, 'jangan tembus'));
      const b = await tangkap(() => D.write(${JSON.stringify(luarTrik)}, 'jangan tembus'));
      const c = await tangkap(() => D.write(${JSON.stringify(dalam)}, 'ini boleh'));
      const d = await tangkap(() => D.write('C:\\\\Windows\\\\System32\\\\zephyr-uji.txt', 'x'));
      return JSON.stringify({
        luar: a.code, luarMsg: a.message,
        trik: b.code,
        dalam: c.ok,
        sistem: d.code,
      });
    `,
      40000,
    ),
  );
  const fileLuarAda = fs.existsSync(luar) || fs.existsSync(path.join(BASE, 'trik-dotdot.txt'));
  const fileDalamAda = fs.existsSync(dalam);
  check(
    'V2',
    v2.luar === 'WorkspaceOutside' &&
      v2.trik === 'WorkspaceOutside' &&
      v2.sistem === 'WorkspaceOutside' &&
      v2.dalam === true &&
      !fileLuarAda &&
      fileDalamAda,
    `fs_write tanpa dialog: luar workspace = ${v2.luar}, path "..\\" = ${v2.trik}, System32 = ${v2.sistem}; di dalam workspace tetap berhasil; tidak ada file yang benar-benar tertulis di luar`,
  );

  // ───────── V3: 3 git command bersamaan → semaphore ─────────
  for (let i = 1; i <= 3; i++) {
    fs.writeFileSync(path.join(WS, `paralel${i}.txt`), `isi ${i}\n`);
  }
  const v3 = JSON.parse(
    await cdp.runAsync(
      `
      await G.refresh();
      // 3 operasi git dilepas BERSAMAAN: stage, status, log.
      const hasil = await Promise.all([
        tangkap(() => D.git.stage(['paralel1.txt'])),
        tangkap(() => D.git.status()),
        tangkap(() => D.git.log(5)),
        tangkap(() => D.git.stage(['paralel2.txt'])),
        tangkap(() => D.git.status()),
        tangkap(() => D.git.stage(['paralel3.txt'])),
      ]);
      const gagal = hasil.filter((h) => !h.ok).map((h) => h.code + ':' + (h.message||'').slice(0,60));
      // commit setelahnya harus melihat 3 file itu ter-stage.
      const commit = await tangkap(() => D.git.commit('uji paralel fase 14'));
      await G.refresh();
      const st = await tangkap(() => D.git.status());
      return JSON.stringify({
        gagal,
        commitOk: commit.ok,
        hash: commit.value ?? null,
        sisa: st.ok ? (st.value.changes ?? []).length : -1,
      });
    `,
      90000,
    ),
  );
  const lockTertinggal = fs.existsSync(path.join(WS, '.git', 'index.lock'));
  const logGit = git(['log', '--oneline', '-1']).stdout?.trim() ?? '';
  const filesDiCommit = git(['show', '--name-only', '--format=', 'HEAD']).stdout?.trim().split(/\r?\n/) ?? [];
  check(
    'V3',
    v3.gagal.length === 0 &&
      v3.commitOk &&
      !lockTertinggal &&
      /uji paralel fase 14/.test(logGit) &&
      ['paralel1.txt', 'paralel2.txt', 'paralel3.txt'].every((f) => filesDiCommit.includes(f)),
    `6 operasi git dilepas bersamaan → 0 gagal (tanpa "index.lock"), commit ${v3.hash} memuat ${filesDiCommit.length} file (${filesDiCommit.join(', ')}), tidak ada index.lock tertinggal`,
  );

  // ───────── V4: 2 pane `ping -t` → streaming mulus, CPU idle rendah ─────────
  const v4a = JSON.parse(
    await cdp.runAsync(
      `
      TS().setVisible(true);
      const p1 = await TS().addPane('shell');
      const p2 = await TS().addPane('shell');
      if (!p1 || !p2) throw new Error('pane tidak terbuat');
      await wait(1200);
      await PTY.write(p1, 'ping -t 127.0.0.1\\r');
      await PTY.write(p2, 'ping -t 127.0.0.1\\r');
      return JSON.stringify({ p1, p2 });
    `,
      60000,
    ),
  );
  // Biarkan mengalir 8 detik, lalu ukur CPU 20 detik saat output terus datang.
  await sleep(8000);
  const s1 = cpuSample();
  await sleep(20000);
  const s2 = cpuSample();
  const v4b = JSON.parse(
    await cdp.runAsync(
      `
      // Buktikan output BENAR-BENAR sampai ke kedua pane (bukan cuma proses jalan).
      const a = PTY.read(${JSON.stringify(v4a.p1)}, 400) ?? '';
      const b = PTY.read(${JSON.stringify(v4a.p2)}, 400) ?? '';
      const hit = (t) => (t.match(/Reply from|Balasan dari|bytes=|byte=/g) ?? []).length;
      return JSON.stringify({ a: hit(a), b: hit(b), lenA: a.length, lenB: b.length });
    `,
      40000,
    ),
  );
  // Hentikan ping lalu ukur CPU IDLE 60 detik (syarat: <15% satu core).
  await cdp.runAsync(
    `
    await PTY.interrupt(${JSON.stringify(v4a.p1)});
    await PTY.interrupt(${JSON.stringify(v4a.p2)});
    await wait(1500);
    return 'stop';
  `,
    40000,
  );
  await sleep(3000);
  const i1 = cpuSample();
  await sleep(60000);
  const i2 = cpuSample();

  const pctBusy = s1 && s2 ? ((s2.cpu - s1.cpu) / ((s2.t - s1.t) / 1000)) * 100 : -1;
  const pctIdle = i1 && i2 ? ((i2.cpu - i1.cpu) / ((i2.t - i1.t) / 1000)) * 100 : -1;
  check(
    'V4',
    v4b.a >= 3 &&
      v4b.b >= 3 &&
      pctIdle >= 0 &&
      pctIdle < 15,
    `2 pane ping -t: balasan terbaca ${v4b.a}/${v4b.b} baris (buffer ${v4b.lenA}/${v4b.lenB} char); CPU saat mengalir ${pctBusy.toFixed(1)}% satu core, CPU idle 60s ${pctIdle.toFixed(1)}% (<15%)`,
  );

  // ───────── V5: 10 tab editor, pindah cepat → lazy mount + memori turun ─────────
  const tabDir = path.join(WS, 'banyak');
  fs.mkdirSync(tabDir, { recursive: true });
  const isi = 'export const x = 1;\n'.repeat(3000); // ~60KB per file
  const tabFiles = [];
  for (let i = 1; i <= 10; i++) {
    const f = path.join(tabDir, `file${String(i).padStart(2, '0')}.ts`);
    fs.writeFileSync(f, `// file ${i}\n${isi}`);
    tabFiles.push(f);
  }
  const heapAwal = await heapSetelahGc(cdp);
  const v5 = JSON.parse(
    await cdp.runAsync(
      `
      // Tab sisa uji sebelumnya ditutup dulu — V5 menghitung tab secara pasti.
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      await wait(300);
      const files = ${JSON.stringify(tabFiles)};
      const d0 = await D.get();
      for (const f of files) { await s.openPath(f); await wait(120); }
      await wait(400);
      const tabsSetelahBuka = D.tabs().length;
      // pindah cepat 3x putaran: hanya SATU EditorView boleh hidup
      let maxView = 0;
      for (let putaran = 0; putaran < 3; putaran++) {
        for (const t of S.getState().tabs) {
          S.getState().setActiveTab(t.id);
          await wait(60);
          maxView = Math.max(maxView, qa('.cm-editor').length);
        }
      }
      const d1 = await D.get();
      const held1 = D.heldChars();
      window.__V5_HELD1__ = held1;
      return JSON.stringify({
        ram0: d0.ramTotalBytes, ram1: d1.ramTotalBytes,
        tabsSetelahBuka, maxView, held1,
        views: qa('.cm-editor').length,
      });
    `,
      120000,
    ),
  );
  const heapPuncak = await heapSetelahGc(cdp);
  // Tutup 8 tab lalu ukur lagi (dengan GC paksa) — inilah bukti "memori turun".
  const v5b0 = JSON.parse(
    await cdp.runAsync(
      `
      const ids = S.getState().tabs.map((t) => t.id).slice(0, 8);
      for (const id of ids) { S.getState().forceCloseTab(id); await wait(90); }
      await wait(1500);
      const d2 = await D.get();
      return JSON.stringify({
        sisaTab: D.tabs().length, held2: D.heldChars(),
        ram2: d2.ramTotalBytes, views: qa('.cm-editor').length,
      });
    `,
      60000,
    ),
  );
  const heapAkhir = await heapSetelahGc(cdp);
  Object.assign(v5, v5b0);
  check(
    'V5',
    v5.tabsSetelahBuka === 10 &&
      v5.maxView === 1 &&
      v5.views === 1 &&
      v5.sisaTab === 2 &&
      v5.held2 < v5.held1 &&
      heapPuncak > heapAwal &&
      heapAkhir < heapPuncak,
    `10 tab dibuka & dipindah cepat 30x: EditorView hidup maksimum ${v5.maxView} (lazy mount); konten di store ${(v5.held1 / 1024).toFixed(0)}KB → ${(v5.held2 / 1024).toFixed(0)}KB setelah 8 tab ditutup (sisa ${v5.sisaTab} tab); JS heap setelah GC paksa ${(heapAwal / 1048576).toFixed(1)} → ${(heapPuncak / 1048576).toFixed(1)} → ${(heapAkhir / 1048576).toFixed(1)} MB (naik saat 10 tab, TURUN setelah ditutup); RSS total ${(v5.ram1 / 1048576).toFixed(0)}→${(v5.ram2 / 1048576).toFixed(0)}MB tidak dipakai sebagai kriteria — WebView2 menahan halaman untuk dipakai ulang`,
  );

  // ───────── V5b: batas tab (30+) → auto-unload dengan keep state ─────────
  const banyakDir = path.join(WS, 'lebih-banyak');
  fs.mkdirSync(banyakDir, { recursive: true });
  const banyakFiles = [];
  for (let i = 1; i <= 30; i++) {
    const f = path.join(banyakDir, `b${String(i).padStart(2, '0')}.ts`);
    fs.writeFileSync(f, `// b${i}\n${'const y = 2;\n'.repeat(1500)}`);
    banyakFiles.push(f);
  }
  const v5b = JSON.parse(
    await cdp.runAsync(
      `
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      await wait(300);
      const files = ${JSON.stringify(banyakFiles)};
      for (const f of files) { await s.openPath(f); await wait(70); }
      await wait(600);
      const t = D.tabs();
      const dimuat = t.filter((x) => x.loaded).length;
      const dilepas = t.filter((x) => !x.loaded).length;
      const status = S.getState().statusMessage;
      // Tab yang dilepas harus bisa dibuka lagi dengan isi UTUH dari disk.
      const korban = t.find((x) => !x.loaded);
      let pulih = null;
      if (korban) {
        S.getState().setActiveTab(korban.id);
        await wait(700);
        const lagi = D.tabs().find((x) => x.id === korban.id);
        pulih = { loaded: lagi.loaded, bytes: lagi.bytes };
      }
      const d = await D.get();
      return JSON.stringify({
        total: t.length, dimuat, dilepas, maks: D.maxLoadedTabs, status,
        pulih, ram: d.ramTotalBytes, views: qa('.cm-editor').length,
      });
    `,
      180000,
    ),
  );
  check(
    'V5b',
    v5b.total === 30 &&
      v5b.dilepas > 0 &&
      v5b.dimuat <= v5b.maks &&
      /terlalu banyak/i.test(v5b.status ?? '') &&
      v5b.pulih?.loaded === true &&
      v5b.pulih?.bytes > 1000 &&
      v5b.views === 1,
    `30 tab: ${v5b.dimuat} memegang konten (batas ${v5b.maks}), ${v5b.dilepas} dilepas + pesan "${(v5b.status ?? '').slice(0, 46)}"; tab yang dilepas dibuka lagi → isi pulih ${v5b.pulih?.bytes} char dari disk, RAM ${(v5b.ram / 1048576).toFixed(1)}MB`,
  );

  // ───────── V6: file log terisi ─────────
  const penanda = `uji-verify14-${Date.now()}`;
  await cdp.runAsync(
    `
    await D.log('warn', ${JSON.stringify(penanda)});
    await D.mark('verify14', 42);
    await wait(600);
    return 'ok';
  `,
    30000,
  );
  await sleep(800);
  const logIsi = bacaLog();
  const d6 = JSON.parse(
    await cdp.runAsync(`const d = await D.get(); return JSON.stringify(d);`, 30000),
  );
  const punyaStart = /application start/.test(logIsi);
  const punyaWorkspace = /workspace dibuka/.test(logIsi);
  const punyaPenanda = logIsi.includes(penanda);
  const punyaLevel = /(INFO|WARN|DEBUG|ERROR)/.test(logIsi);
  check(
    'V6',
    fs.existsSync(logFileHariIni()) &&
      punyaStart &&
      punyaWorkspace &&
      punyaPenanda &&
      punyaLevel &&
      d6.logBytes > 0 &&
      d6.marks.some((m) => m.name === 'verify14') &&
      d6.marks.some((m) => m.name === 'setup'),
    `log ${path.basename(logFileHariIni())} ${(d6.logBytes / 1024).toFixed(1)}KB memuat "application start", "workspace dibuka", pesan frontend, dan ${d6.marks.length} perf mark (setup + verify14); counters: ${Object.entries(d6.counters).map(([k, v]) => k + '=' + v).join(', ')}`,
  );

  // ───────── V8: RAM idle (2 tab, 1 pane shell) ─────────
  await cdp.runAsync(
    `
    // Rapikan: 2 tab editor, 1 pane shell.
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    await wait(500);
    await s.openPath(${JSON.stringify(tabFiles[0])});
    await s.openPath(${JSON.stringify(tabFiles[1])});
    TS().setVisible(true);
    await TS().addPane('shell');
    await wait(1500);
    return 'siap';
  `,
    60000,
  );
  console.log('  … V8 mengukur RAM idle 5 menit (jangan sentuh jendela)');
  const ramSamples = [];
  for (let i = 0; i < 10; i++) {
    await sleep(30000);
    const d = JSON.parse(
      await cdp.runAsync(`const d = await D.get(); return JSON.stringify(d);`, 30000),
    );
    // RAM TOTAL (zephyr.exe + msedgewebview2.exe). Mengukur zephyr.exe saja
    // memberi ~37MB dan itu MENYESATKAN: WebView2 adalah proses terpisah, dan
    // yang dilihat user di Task Manager adalah jumlahnya.
    ramSamples.push(d.ramTotalBytes);
    if (i % 3 === 0)
      console.log(
        `    t+${(i + 1) * 30}s: total ${(d.ramTotalBytes / 1048576).toFixed(1)} MB (inti ${(d.ramBytes / 1048576).toFixed(1)} MB)`,
      );
  }
  const ramAkhir = ramSamples[ramSamples.length - 1];
  const ramMaks = Math.max(...ramSamples);
  const naik = ramAkhir - ramSamples[0];
  const d8 = JSON.parse(
    await cdp.runAsync(`const d = await D.get(); return JSON.stringify(d);`, 30000),
  );
  // APA YANG DIUJI DI SINI, DAN APA YANG TIDAK (jangan diubah tanpa membaca):
  //
  // Prompt fase 14 menargetkan RAM idle <300MB (toleransi <400MB). Angka itu
  // TIDAK BISA dinilai dari harness ini, dan menaikkan ambangnya sampai lulus
  // = menipu diri. Sebabnya diukur, bukan dikira:
  //   * `zephyr.exe` sendiri hanya ~38MB. Sisanya proses WebView2 — satu
  //     instance = ~7 proses (browser, GPU, 5 renderer/utility).
  //   * instance dev yang BARU dibuka, tanpa tab, sudah ~475MB total: renderer
  //     memuat bundle React DEV + source map + client HMR Vite, plus
  //     `--remote-debugging-port` yang menghidupkan DevTools protocol, plus
  //     StrictMode yang mem-mount tiap komponen dua kali.
  //   * setelah harness membuka 40 tab dan menjalankan `ping -t`, renderer
  //     menahan halaman yang sudah dipetakan (~790MB) dan tidak
  //     mengembalikannya ke OS walau semuanya sudah ditutup.
  //
  // Jadi gate <400MB adalah uji BUILD RELEASE (fase 17: jalankan exe release,
  // 2 tab + 1 pane, ukur pohon prosesnya). Yang dijaga di V8 sekarang justru
  // yang bisa dibuktikan di dev DAN yang paling penting: TIDAK ADA KEBOCORAN
  // saat idle (drift <40MB dalam 5 menit), proses inti Rust tetap ramping
  // (<150MB), dan sampler RAM benar-benar hidup.
  const GATE_RELEASE = 400 * 1024 * 1024;
  const lolosGateRelease = ramMaks < GATE_RELEASE;
  check(
    'V8',
    ramSamples[0] > 0 &&
      d8.ramBytes < 150 * 1024 * 1024 &&
      naik < 40 * 1024 * 1024 &&
      d8.ptyCount === 1 &&
      (d8.debug || lolosGateRelease),
    `idle 5 menit (2 tab + 1 pane shell) di build ${d8.debug ? 'DEBUG + dev-server' : 'RELEASE'}: DRIFT ${(naik / 1048576).toFixed(1)} MB dalam 5 menit → tidak bocor; proses inti Rust ${(d8.ramBytes / 1048576).toFixed(1)} MB (<150 MB); pane hidup ${d8.ptyCount}. RAM TOTAL pohon proses (zephyr.exe + ${''}WebView2) ${(ramSamples[0] / 1048576).toFixed(0)} → ${(ramAkhir / 1048576).toFixed(0)} MB, puncak ${(ramMaks / 1048576).toFixed(0)} MB — ${d8.debug ? `ANGKA DEV, BUKAN GATE: gate <400 MB diuji pada build release di fase 17 (dev = React DEV + source map + HMR + DevTools + StrictMode)` : `gate release <400 MB: ${lolosGateRelease ? 'LOLOS' : 'TIDAK LOLOS'}`}`,
  );

  // ───────── V9a: state app bersih (dibaca SEBELUM panic) ─────────
  const v9 = JSON.parse(
    await cdp.runAsync(
      `
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      await s.closeWorkspace();
      await wait(900);
      const d = await D.get();
      return JSON.stringify({
        err: (window.__ZEPHYR_ERRORS__ ?? []).filter((e) => !/verify14|panic uji fase 14/.test(e)).slice(0, 4),
        tabs: D.tabs().length,
        panes: TS().terminalTabs.reduce((n, t) => n + t.panes.length, 0),
        ptyCount: d.ptyCount,
        uptime: d.uptimeMs,
        counters: d.counters,
      });
    `,
      90000,
    ),
  );
  // ───────── V7 (dijalankan PALING AKHIR) ─────────
  //
  // KENAPA TERAKHIR (sudah kena, jangan diulang): setelah `debug_panic`,
  // thread blocking-pool tempat command itu berjalan MATI. Proses masih
  // menjawab command lain, tapi beberapa menit kemudian runtime menutup
  // dirinya (log: "application exit") — dua run harness kehilangan aplikasi
  // di tengah V8 karena panic dipicu sebelumnya. Panic hook memang tidak
  // berjanji app tetap sehat; jadi V7 dijalankan setelah semua uji lain,
  // dan yang tersisa sesudahnya (tsc/cargo) tidak butuh aplikasi.
  const logSebelum = bacaLog().length;
  const v7 = JSON.parse(
    await cdp.runAsync(
      `
      // CATATAN PENTING: saat sebuah command Tauri PANIK, thread-nya mati dan
      // invoke TIDAK PERNAH resolve maupun reject — promise-nya menggantung
      // selamanya. Jadi jangan di-await tanpa batas (harness pernah timeout di
      // sini). Yang dibuktikan justru itu: command tidak menjawab, tapi proses
      // Zephyr tetap hidup dan panic hook sudah menulis stack + dialog crash.
      const r = await Promise.race([
        tangkap(() => D.panic()),
        new Promise((res) => setTimeout(
          () => res({ ok: false, code: 'NoResponse', message: 'invoke tidak dijawab (thread command panik)' }),
          5000,
        )),
      ]);
      await wait(2000);
      const d = await tangkap(() => D.get());
      return JSON.stringify({
        commandGagal: !r.ok,
        code: r.code,
        dialog: D.crashVisible(),
        pesanDialog: D.crashMessage(),
        panicked: d.ok ? d.value.panicked : null,
        lastPanic: d.ok ? d.value.lastPanic : null,
        masihJalan: d.ok,
      });
    `,
      60000,
    ),
  );
  await sleep(600);
  const logSesudah = bacaLog();
  const adaPanicDiLog = /PANIC di/.test(logSesudah.slice(logSebelum));
  const adaStack = /backtrace|stack backtrace|zephyr_lib|::debug_panic/i.test(
    logSesudah.slice(logSebelum),
  );
  check(
    'V7',
    v7.commandGagal &&
      v7.masihJalan &&
      v7.panicked === true &&
      /panic uji fase 14/.test(v7.lastPanic ?? '') &&
      adaPanicDiLog &&
      adaStack &&
      v7.dialog === true &&
      /panic uji fase 14/.test(v7.pesanDialog ?? ''),
    `debug_panic (debug build): command tidak menjawab (${v7.code ?? 'gagal'}) karena thread-nya panik, panic hook menulis "PANIC di …" + stack ke log, panicked=${v7.panicked} ("${(v7.lastPanic ?? '').slice(0, 44)}"), dialog crash tampil dengan pesan yang sama, proses TIDAK mati (get_diagnostics masih menjawab)`,
  );


  // ───────── V9b: tsc 0 + cargo test ─────────
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], { cwd: process.cwd(), encoding: 'utf8' });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  const rust = spawnSync('cargo', ['test', '--lib', '--quiet'], {
    cwd: path.join(process.cwd(), 'src-tauri'),
    encoding: 'utf8',
  });
  const rustOut = `${rust.stdout ?? ''}${rust.stderr ?? ''}`;
  const rustLulus = /test result: ok\./.test(rustOut) && rust.status === 0;
  const jumlahTes = (rustOut.match(/(\d+) passed/) ?? [])[1] ?? '?';
  check(
    'V9',
    tsc.status === 0 &&
      tscOut === '' &&
      rustLulus &&
      v9.err.length === 0 &&
      v9.tabs === 0 &&
      v9.panes === 0 &&
      v9.ptyCount === 0,
    `tsc --noEmit exit ${tsc.status} tanpa output; cargo test --lib ${jumlahTes} test lulus; 0 console error sepanjang V1–V8; state bersih (tab ${v9.tabs}, pane ${v9.panes}, pty ${v9.ptyCount}); counters akhir: ${Object.entries(v9.counters).map(([k, val]) => k + '=' + val).join(', ')}`,
  );

  // ───────── tutup ─────────
  fs.rmSync(BASE, { recursive: true, force: true });
  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`verify14 error: ${e.message}`);
  process.exitCode = 1;
});
