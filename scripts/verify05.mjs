// verify05.mjs — verifikasi V1..V10 fase 05 (terminal PTY + private)
// lewat CDP di app yang benar-benar berjalan.
//
// Pakai:  node scripts/verify05.mjs [port]
// Syarat: zephyr.exe berjalan dengan
//         WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"

import WebSocket from 'ws';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  #send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.#send('Runtime.evaluate', {
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

  /** Async di halaman + polling hasil (hindari "Promise was collected"). */
  async runAsync(body, timeoutMs = 40000) {
    const slot = `__ZV5_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const s = window.__ZEPHYR__.getState();
        const t = window.__ZEPHYR_TERM__.getState();
        const T = window.__ZEPHYR_TERM__;
        const P = window.__ZEPHYR_PTY__;
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && (e.message || e.code)) ? JSON.stringify(e) : String(e) }; },
      );
      return 'started';
    })()`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(120);
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

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(6)} ${detail}`);
};

const pidAlive = (pid) => {
  if (!pid) return false;
  try {
    return execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' }).includes(String(pid));
  } catch {
    return false;
  }
};

/** Seluruh turunan sebuah pid (rekursif) via WMI — bukti Ctrl+C membersihkan pohon. */
const descendants = (pid) => {
  try {
    const out = execSync(
      `powershell -NoLogo -NoProfile -File scripts/descendants.ps1 -RootPid ${pid}`,
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

/** Cek HTTP ke localhost DAN 127.0.0.1: Vite bind 'localhost' (::1 di Windows). */
const httpProbe = async (port, tries = 1) => {
  for (let i = 0; i < tries; i++) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      try {
        const r = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(2500) });
        return { status: r.status, host };
      } catch {
        /* coba host berikutnya */
      }
    }
    if (i + 1 < tries) await sleep(1000);
  }
  return { status: null, host: null };
};

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_TERM__')) === 'undefined') {
    throw new Error('__ZEPHYR_TERM__ tidak ada — reload halaman');
  }

  // Helper di dalam halaman: kirim perintah lalu tunggu regex muncul.
  await cdp.eval(`(() => {
    window.__ZV_RUN__ = async (id, line, re, tries = 40) => {
      await window.__ZEPHYR_PTY__.write(id, line + '\\r');
      for (let i = 0; i < tries; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const buf = window.__ZEPHYR_PTY__.read(id, 60);
        if (new RegExp(re, 'm').test(buf)) return buf;
      }
      return window.__ZEPHYR_PTY__.read(id, 60);
    };
    return 'helper';
  })()`);

  // Bersihkan state.
  await cdp.runAsync(`
    for (const x of t.terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  `);
  await sleep(500);

  // ───────── V1: terminal muncul, prompt PowerShell, echo halo ─────────
  const id1 = await cdp.runAsync(`
    const id = await T.getState().addPane('shell');
    await new Promise(r => setTimeout(r, 2000));
    return id;
  `);

  const dom = JSON.parse(
    await cdp.eval(`JSON.stringify({
      area: !!document.querySelector('.term-area'),
      tabs: document.querySelectorAll('.pane').length,
      xtermMounted: !!document.querySelector('.xterm-pane .xterm-screen'),
      title: document.querySelector('.pane-head .pane-title')?.textContent,
      pid: window.__ZEPHYR_TERM__.getState().allPanes()[0]?.pid,
      prompt: window.__ZEPHYR_PTY__.read(${JSON.stringify(id1)}, 30),
    })`),
  );
  const promptOk = /PS [A-Z]:\\/.test(dom.prompt);
  check(
    'V1a',
    dom.area && dom.tabs === 1 && dom.xtermMounted && promptOk && dom.pid > 0,
    `panel=${dom.area} tab="${dom.title}" xterm=${dom.xtermMounted} pid=${dom.pid} prompt="${dom.prompt.trim().slice(0, 24)}"`,
  );

  const echo = await cdp.runAsync(`
    await P.write(${JSON.stringify(id1)}, 'cls\\r');
    await new Promise(r => setTimeout(r, 800));
    const buf = await window.__ZV_RUN__(${JSON.stringify(id1)}, 'echo halo-zephyr', '^halo-zephyr\\\\s*$');
    return JSON.stringify({ lines: buf.split('\\n').filter(Boolean) });
  `);
  const echoLines = JSON.parse(echo).lines;
  // Output harus muncul TEPAT sekali (bukan dobel karena listener ganda).
  const echoCount = echoLines.filter((l) => l.trim() === 'halo-zephyr').length;
  check(
    'V1b',
    echoCount === 1,
    `\`echo halo-zephyr\` -> "halo-zephyr" muncul ${echoCount}x (harus 1x, bukan dobel); layar: ${JSON.stringify(echoLines)}`,
  );

  // ───────── V2: warna ANSI dari OUTPUT (bukan syntax highlight input) ─────────
  const colors = JSON.parse(
    await cdp.runAsync(`
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 800));
      await P.write(${JSON.stringify(id1)},
        'Write-Host "MERAH" -ForegroundColor Red; Write-Host "HIJAU" -ForegroundColor Green; ' +
        'Write-Host "CYAN" -ForegroundColor Cyan\\r');
      await new Promise(r => setTimeout(r, 1800));
      // Hanya span yang isinya TEPAT salah satu penanda output kita:
      // PSReadLine juga mewarnai baris perintah yang diketik, itu bukan bukti ANSI.
      const target = ['MERAH', 'HIJAU', 'CYAN'];
      const found = target.map((t) => {
        const el = [...document.querySelectorAll('.xterm-rows span')]
          .find((e) => e.textContent.trim() === t && /xterm-fg-\\d+/.test(e.className));
        return el ? { txt: t, cls: el.className, color: getComputedStyle(el).color } : { txt: t, cls: null, color: null };
      });
      return JSON.stringify({ found, unik: new Set(found.map((f) => f.color).filter(Boolean)).size });
    `),
  );
  check(
    'V2',
    colors.found.every((f) => f.color) && colors.unik === 3,
    `output Write-Host berwarna: ` +
      colors.found.map((f) => `${f.txt}=${f.color ?? 'TANPA WARNA'} (${f.cls ?? '-'})`).join(', ') +
      ` -> ${colors.unik} warna berbeda`,
  );

  // ───────── V3: resize -> grid ikut, output tetap benar ─────────
  const resize = JSON.parse(
    await cdp.runAsync(`
      const before = P.size(${JSON.stringify(id1)});
      T.getState().setHeight(430);
      await new Promise(r => setTimeout(r, 1000));
      const big = P.size(${JSON.stringify(id1)});
      T.getState().setHeight(240);
      await new Promise(r => setTimeout(r, 1000));
      const small = P.size(${JSON.stringify(id1)});
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 700));
      const buf = await window.__ZV_RUN__(${JSON.stringify(id1)}, 'echo resize-ok', '^resize-ok\\\\s*$');
      // Rust harus tahu ukuran baru: minta shell melaporkan lebar buffer.
      const buf2 = await window.__ZV_RUN__(${JSON.stringify(id1)},
        'echo "COLS=$($Host.UI.RawUI.WindowSize.Width)"', 'COLS=\\\\d+');
      const m = buf2.match(/COLS=(\\d+)/);
      return JSON.stringify({ before, big, small, ok: /^resize-ok\\s*$/m.test(buf),
        shellCols: m ? Number(m[1]) : null });
    `),
  );
  check(
    'V3',
    resize.big.rows > resize.before.rows &&
      resize.small.rows < resize.big.rows &&
      resize.ok &&
      resize.shellCols === resize.small.cols,
    `rows ${resize.before.rows} -> ${resize.big.rows} (panel 430px) -> ${resize.small.rows} (240px); ` +
      `shell melihat COLS=${resize.shellCols} (xterm ${resize.small.cols}); perintah setelah resize jalan=${resize.ok}`,
  );

  // ───────── V4: child berat (npm run dev) streaming + Ctrl+C ─────────
  // Sesuai prompt fase: jalankan proses build/dev sungguhan di terminal,
  // pastikan output streaming lalu Ctrl+C membunuh SELURUH pohon proses.
  const shellPid = JSON.parse(
    await cdp.runAsync(`
      const sess = T.getState().findPane(${JSON.stringify(id1)});
      return JSON.stringify(sess.pid);
    `),
  );

  const started = JSON.parse(
    await cdp.runAsync(
      `
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 800));
      // Vite di port lain supaya tidak bentrok dengan dev server yang dipakai app ini.
      // --host 127.0.0.1 supaya bisa di-probe dari luar (default 'localhost' -> ::1).
      await P.write(${JSON.stringify(id1)},
        'cd D:\\\\Zephyr; npm run dev -- --port 5199 --strictPort --host 127.0.0.1\\r');
      let buf = '';
      for (let i = 0; i < 80; i++) {           // tunggu maks 40s
        await new Promise(r => setTimeout(r, 500));
        buf = P.read(${JSON.stringify(id1)}, 60);
        if (/localhost:5199|ready in|VITE v/i.test(buf)) break;
      }
      return JSON.stringify({
        streaming: /localhost:5199|ready in|VITE v/i.test(buf),
        panjang: buf.length,
        cuplikan: buf.split('\\n').filter(Boolean).slice(-4),
      });
    `,
      70000,
    ),
  );

  const treeBefore = descendants(shellPid);
  const up = await httpProbe(5199, 3);

  const afterInt = JSON.parse(
    await cdp.runAsync(
      `
      const sebelum = P.read(${JSON.stringify(id1)}, 80).length;
      const killed = await P.interrupt(${JSON.stringify(id1)});
      await new Promise(r => setTimeout(r, 2500));
      const t1 = P.read(${JSON.stringify(id1)}, 80).length;
      await new Promise(r => setTimeout(r, 2500));
      const t2 = P.read(${JSON.stringify(id1)}, 80).length;
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 800));
      const revive = await window.__ZV_RUN__(${JSON.stringify(id1)}, 'echo setelah-ctrlc', '^setelah-ctrlc\\\\s*$');
      const sess = T.getState().findPane(${JSON.stringify(id1)});
      return JSON.stringify({ killed, sebelum, t1, t2, outputBerhenti: t1 === t2,
        shellHidup: sess.status === 'live', bangkit: /^setelah-ctrlc\\s*$/m.test(revive) });
    `,
      60000,
    ),
  );

  const treeAfter = descendants(shellPid);
  const down = await httpProbe(5199);

  check(
    'V4',
    started.streaming &&
      up.status === 200 &&
      treeBefore.length > 0 &&
      treeAfter.length === 0 &&
      down.status === null &&
      afterInt.outputBerhenti &&
      afterInt.shellHidup &&
      afterInt.bangkit,
    `npm run dev di terminal: streaming=${started.streaming} (${started.cuplikan.at(-1) ?? ''}), ` +
      `HTTP 5199=${up.status} via ${up.host}; pohon proses sebelum Ctrl+C=[${treeBefore.join(', ')}] -> sesudah=[${treeAfter.join(', ')}] ` +
      `(${afterInt.killed} proses dimatikan), port mati setelahnya=${down.status === null}, output berhenti=${afterInt.outputBerhenti}, ` +
      `shell hidup=${afterInt.shellHidup}, terima perintah baru=${afterInt.bangkit}`,
  );

  // ───────── V5: copy & paste (jalur UI: klik kanan / Ctrl+Shift+C) ─────────
  const clip = JSON.parse(
    await cdp.runAsync(`
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 800));
      await window.__ZV_RUN__(${JSON.stringify(id1)}, 'echo KLIPBOARD-TEST', '^KLIPBOARD-TEST\\\\s*$');

      // COPY: pilih baris hasil, lalu jalankan copy lewat jalur UI.
      const dipilih = P.selectText(${JSON.stringify(id1)}, 'KLIPBOARD-TEST');
      await new Promise(r => setTimeout(r, 250));
      const sel = P.selection(${JSON.stringify(id1)}).trim();
      const tersalin = (await P.copy(${JSON.stringify(id1)})).trim();
      const diClipboard = (await P.clipRead()).trim();

      // PASTE: isi clipboard lalu paste lewat jalur UI -> masuk ke shell.
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 700));
      await P.clipWrite('echo teks-dari-clipboard');
      await P.paste(${JSON.stringify(id1)});
      await new Promise(r => setTimeout(r, 400));
      // paste TIDAK mengeksekusi sendiri: butuh Enter dari user.
      const sebelumEnter = P.read(${JSON.stringify(id1)}, 20);
      await P.write(${JSON.stringify(id1)}, '\\r');
      await new Promise(r => setTimeout(r, 1500));
      const buf = P.read(${JSON.stringify(id1)}, 20);
      return JSON.stringify({
        dipilih, sel, tersalin, diClipboard,
        pasteTampil: sebelumEnter.includes('echo teks-dari-clipboard'),
        pasteJalan: /^teks-dari-clipboard\\s*$/m.test(buf),
      });
    `),
  );
  check(
    'V5',
    clip.dipilih &&
      clip.sel === 'KLIPBOARD-TEST' &&
      clip.tersalin === 'KLIPBOARD-TEST' &&
      clip.diClipboard === 'KLIPBOARD-TEST' &&
      clip.pasteTampil &&
      clip.pasteJalan,
    `copy: seleksi="${clip.sel}" -> clipboard OS="${clip.diClipboard}"; ` +
      `paste: teks masuk ke baris perintah=${clip.pasteTampil}, dieksekusi setelah Enter=${clip.pasteJalan}`,
  );

  // ───────── V6: private terminal ─────────
  // Bukti yang sesungguhnya: perintah dari sesi private TIDAK ditulis ke
  // file history PSReadLine, sementara sesi normal TETAP ditulis (kontrol
  // negatif — supaya bukan sekadar "file tidak berubah").
  const histPath = execSync(
    'powershell -NoLogo -NoProfile -Command "(Get-PSReadLineOption).HistorySavePath"',
    { encoding: 'utf8' },
  ).trim();
  const stamp = Date.now().toString(36);
  const markPriv = `ZEPHYR-PRIV-${stamp}`;
  const markNorm = `ZEPHYR-NORM-${stamp}`;

  const id2 = await cdp.runAsync(`
    const id = await T.getState().addPane('private');
    await new Promise(r => setTimeout(r, 2500));
    return id;
  `);
  const priv = JSON.parse(
    await cdp.runAsync(`
      const st = T.getState();
      const sess = st.findPane(${JSON.stringify(id2)});
      const tab = document.querySelector('[data-pane-head=' + JSON.stringify(${JSON.stringify(id2)}) + ']');
      const buf = await window.__ZV_RUN__(${JSON.stringify(id2)},
        'echo "priv=$env:ZEPHYR_PRIVATE style=$((Get-PSReadLineOption).HistorySaveStyle)"',
        'priv=1 style=');
      // penanda unik: dijalankan di sesi PRIVATE
      await window.__ZV_RUN__(${JSON.stringify(id2)}, 'echo ${markPriv}', '^${markPriv}\\\\s*$');
      // kontrol: penanda lain dijalankan di sesi NORMAL
      await window.__ZV_RUN__(${JSON.stringify(id1)}, 'echo ${markNorm}', '^${markNorm}\\\\s*$');
      await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({
        kind: sess?.kind, title: sess?.title, pid: sess?.pid,
        incognito: !!tab?.querySelector('svg[aria-label^="Private"]'),
        env: /priv=1/.test(buf),
        saveNothing: /style=SaveNothing/.test(buf),
        banner: /riwayat tidak disimpan/.test(P.read(${JSON.stringify(id2)}, 60)),
      });
    `),
  );

  const hist = existsSync(histPath) ? readFileSync(histPath, 'utf8') : '';
  const privInHist = hist.includes(markPriv);
  const normInHist = hist.includes(markNorm);

  check(
    'V6a',
    priv.kind === 'private' &&
      priv.incognito &&
      priv.pid > 0 &&
      priv.env &&
      priv.saveNothing &&
      !privInHist &&
      normInHist,
    `kind=${priv.kind} ikon incognito=${priv.incognito} pid=${priv.pid}; ZEPHYR_PRIVATE=1 -> ${priv.env}; ` +
      `HistorySaveStyle=SaveNothing -> ${priv.saveNothing}; banner tampil=${priv.banner}; ` +
      `file history (${histPath.split('\\').pop()}): perintah private tercatat=${privInHist} (harus false), ` +
      `perintah sesi normal tercatat=${normInHist} (harus true)`,
  );

  const closed = JSON.parse(
    await cdp.runAsync(`
      const punyaInstance = P.ids().includes(${JSON.stringify(id2)});
      const isiSebelum = P.read(${JSON.stringify(id2)}, 40).length;
      await T.getState().closePane(${JSON.stringify(id2)});
      await new Promise(r => setTimeout(r, 700));
      return JSON.stringify({
        punyaInstance, isiSebelum,
        instanceDibuang: !P.ids().includes(${JSON.stringify(id2)}),
        scrollbackKosong: P.read(${JSON.stringify(id2)}, 40) === '',
        tanpaDialog: !document.querySelector('.modal[role="dialog"]'),
        sisaTab: T.getState().allPanes().length,
      });
    `),
  );
  check(
    'V6b',
    closed.punyaInstance &&
      closed.isiSebelum > 0 &&
      closed.instanceDibuang &&
      closed.scrollbackKosong &&
      closed.tanpaDialog,
    `tutup private: scrollback ${closed.isiSebelum} char -> dibuang=${closed.instanceDibuang}, kosong=${closed.scrollbackKosong}, tanpa dialog=${closed.tanpaDialog}, sisa tab=${closed.sisaTab}`,
  );

  // ───────── V7: kill dari kebab -> pid benar-benar mati ─────────
  const victim = JSON.parse(
    await cdp.runAsync(`
      const id = await T.getState().addPane('shell');
      await new Promise(r => setTimeout(r, 1800));
      const sess = T.getState().findPane(id);
      return JSON.stringify({ id, pid: sess.pid });
    `),
  );
  const aliveBefore = pidAlive(victim.pid);
  await cdp.runAsync(`
    T.getState().setActivePane(T.getState().activeTabId, ${JSON.stringify(victim.id)});
    await T.getState().killPane(${JSON.stringify(victim.id)});
    await new Promise(r => setTimeout(r, 1300));
    return 'killed';
  `);
  await sleep(1300);
  const aliveAfter = pidAlive(victim.pid);
  const marked = JSON.parse(
    await cdp.eval(`(() => {
      const sess = window.__ZEPHYR_TERM__.getState().findPane(${JSON.stringify(victim.id)});
      const head = document.querySelector('[data-pane-head=' + JSON.stringify(${JSON.stringify(victim.id)}) + ']');
      return JSON.stringify({ alive: sess?.status === 'live', deadBadge: !!head?.querySelector('.tt-dead') });
    })()`),
  );
  check(
    'V7',
    aliveBefore && !aliveAfter && marked.alive === false && marked.deadBadge,
    `pid ${victim.pid}: hidup sebelum=${aliveBefore}, mati sesudah (tasklist)=${!aliveAfter}, UI menandai "exited"=${marked.deadBadge}`,
  );
  await cdp.runAsync(`await T.getState().closePane(${JSON.stringify(victim.id)}); return 'x';`);

  // ───────── V8: tiga terminal independen ─────────
  const three = JSON.parse(
    await cdp.runAsync(
      `
      const ids = [${JSON.stringify(id1)}];
      for (let i = 0; i < 2; i++) {
        ids.push(await T.getState().addPane('shell'));
        await new Promise(r => setTimeout(r, 1800));
      }
      // bersihkan layar semua sesi lalu tulis penanda unik
      for (const id of ids) {
        await P.write(id, 'cls\\r');
      }
      await new Promise(r => setTimeout(r, 1000));
      for (let i = 0; i < ids.length; i++) {
        await P.write(ids[i], 'echo PENANDA-' + i + '\\r');
      }
      await new Promise(r => setTimeout(r, 2500));

      const bufs = ids.map((id) => P.read(id, 40));
      return JSON.stringify({
        ids,
        pids: T.getState().allPanes().map(x => x.pid),
        // tiap layar HANYA memuat penandanya sendiri
        isolated: bufs.every((b, i) =>
          new RegExp('^PENANDA-' + i + '\\\\s*$', 'm').test(b) &&
          bufs.every((_, j) => j === i || !b.includes('PENANDA-' + j)),
        ),
        detail: bufs.map((b, i) => ({
          punyaSendiri: new RegExp('^PENANDA-' + i + '\\\\s*$', 'm').test(b),
          punyaLain: bufs.map((_, j) => j !== i && b.includes('PENANDA-' + j)).filter(Boolean).length,
        })),
      });
    `,
      70000,
    ),
  );
  const uniquePids = new Set(three.pids.filter(Boolean));
  check(
    'V8',
    three.ids.length === 3 && three.isolated && uniquePids.size === 3,
    `3 terminal, pid unik ${[...uniquePids].join('/')}; isolasi=${three.isolated} ` +
      `(tiap layar punya penandanya sendiri: ${three.detail.map((d) => d.punyaSendiri).join(',')}; bocor ke layar lain: ${three.detail.map((d) => d.punyaLain).join(',')})`,
  );

  // ───────── V9: minimize -> output ditahan, tidak hilang ─────────
  const pauseTest = JSON.parse(
    await cdp.runAsync(`
      await P.write(${JSON.stringify(id1)}, 'cls\\r');
      await new Promise(r => setTimeout(r, 900));
      // Jalur yang sama dipakai on_window_event saat window minimized.
      await window.__ZEPHYR_SET_PAUSED__(true);
      await P.write(${JSON.stringify(id1)}, 'echo SAAT-PAUSED\\r');
      await new Promise(r => setTimeout(r, 1600));
      const during = P.read(${JSON.stringify(id1)}, 30);
      await window.__ZEPHYR_SET_PAUSED__(false);
      await new Promise(r => setTimeout(r, 2000));
      const after = P.read(${JSON.stringify(id1)}, 30);
      return JSON.stringify({
        ditahan: !during.includes('SAAT-PAUSED'),
        sampaiSetelahRestore: after.includes('SAAT-PAUSED'),
        duringLines: during.split('\\n').filter(Boolean),
        afterLines: after.split('\\n').filter(Boolean),
      });
    `),
  );
  check(
    'V9',
    pauseTest.ditahan && pauseTest.sampaiSetelahRestore,
    `saat paused layar tetap "${pauseTest.duringLines.join(' | ')}" (output ditahan=${pauseTest.ditahan}); ` +
      `setelah restore output menyusul tanpa hilang=${pauseTest.sampaiSetelahRestore}`,
  );

  // ───────── V10: tanpa error konsol ─────────
  const errs = JSON.parse(await cdp.eval('JSON.stringify(window.__ZEPHYR_ERRORS__ ?? [])'));
  check('V10', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'tidak ada console error');

  // bersihkan semua sesi uji
  await cdp.runAsync(`
    for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
    return 'cleanup';
  `);

  cdp.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fail.length}/${results.length} lulus ==`);
  if (fail.length) {
    console.log('GAGAL: ' + fail.map((f) => f.id).join(', '));
    process.exit(1);
  }
};

main().catch((e) => {
  console.error('verify05 error:', e.message);
  process.exit(2);
});
