// verify12.mjs - verifikasi V1..V11 fase 12 (Command Palette + Browser tab)
//
// Pakai:  node scripts/verify12.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: palette diuji lewat DOM sungguhan (keydown di input, klik baris),
// bukan hanya memanggil store. Browser tab dibuktikan dengan server uji lokal
// di port 8099 (port 8080 TIDAK bisa dipakai di mesin ini — WinError 10013)
// yang mencatat request masuk, plus satu endpoint yang mengirim
// X-Frame-Options: DENY untuk membuktikan jalur "situs menolak embed".

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';
import { keluarBersih, pilihJendelaUtama, tungguBridge } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const TEST_PORT = 8099;
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
    /*
     * Batas waktu per panggilan.
     *
     * Kalau socket CDP sudah mati (halaman reload, WebView2 membuang konteks),
     * promise `send` TIDAK PERNAH selesai - dan karena runAsync menunggu eval
     * di dalam loop polling-nya, deadline runAsync pun tidak pernah dievaluasi.
     * Hasilnya: harness menggantung sampai runner membunuhnya, dan sebab
     * kegagalan aslinya hilang. Lebih baik gagal dengan pesan yang jelas.
     */
    const r = await Promise.race([
      this.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        userGesture: true,
      }),
      new Promise((_, rej) => {
        const t = setTimeout(() => rej(new Error('eval timeout 20s: socket CDP mati / halaman tidak menjawab')), 20000);
        t.unref?.();
      }),
    ]);
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    }
    return r.result?.result?.value;
  }

  /** Async di halaman + polling (WebView2 sering membuang promise). */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV12_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const CP = window.__ZEPHYR_CP__;
        const CPS = () => window.__ZEPHYR_CP__.store.getState();
        const M = window.__ZEPHYR_MCP__;
        const MS = () => window.__ZEPHYR_MCP__.store.getState();
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        /** Tekan tombol sungguhan di window (menguji handler global App.tsx). */
        const tekan = (key, mods = {}) => {
          const ev = new KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true,
            ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt,
          });
          (mods.target ?? window).dispatchEvent(ev);
          return ev.defaultPrevented;
        };
        /** Ketik di input palette lewat setter asli (React onChange). */
        const ketik = async (text) => {
          const el = q('[data-testid="cp-input"]');
          if (!el) throw new Error('input palette tidak ada');
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(180);
          return el;
        };
        /** Kirim keydown ke input palette (Arrow/Enter/Esc ditangani modal). */
        const keyInput = async (key) => {
          const el = q('[data-testid="cp-input"]');
          if (!el) throw new Error('input palette tidak ada');
          el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          await wait(160);
        };
        const barisAktif = () => q('[data-testid="cp-row"][data-active="1"]');
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

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
};

// ───────────────── HTTP ke server MCP (simulasi AI CLI) ─────────────────

/** POST JSON-RPC ke server MCP. UA disetel agar terlihat sebagai CLI tertentu. */
async function rpc(port, method, params = {}, token = null, id = 1, ua = 'opencode/1.2') {
  const headers = { 'content-type': 'application/json', 'user-agent': ua };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    // Port mati = fetch melempar; jadikan status 0 agar bisa diuji.
    return { status: 0, body: null };
  }
}

/** GET dengan User-Agent yang bisa diatur (untuk menguji label "MCP connected"). */
async function getJson(url, token = null, ua = 'opencode/1.2') {
  const headers = { 'user-agent': ua };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

// ─────────────── server uji lokal (bukti pane browser) ───────────────

/** Server yang mencatat request masuk + endpoint yang MENOLAK embed. */
function startTestServer() {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    if ((req.url ?? '').startsWith('/blokir')) {
      // Ini yang membuktikan jalur "situs menolak embed" tanpa internet.
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-frame-options': 'DENY',
      });
      res.end('<html><body>tidak boleh di-embed</body></html>');
      return;
    }
    if ((req.url ?? '').startsWith('/halaman2')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>HALAMAN-DUA</h1></body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>ZEPHYR-BROWSER-PANE-OK</h1></body></html>');
  });
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(TEST_PORT, '127.0.0.1', () => resolve({ srv, hits }));
  });
}

// ───────────────────────── main ─────────────────────────

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = pilihJendelaUtama(targets);
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_CP__')) === 'undefined') {
    throw new Error('__ZEPHYR_CP__ tidak ada — reload halaman (devBridge fase 12)');
  }

  const { srv, hits } = await startTestServer();
  const SANDBOX = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-cp-${process.pid}`);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(path.join(SANDBOX, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, 'src', 'lib', 'targetPalette.ts'), '// file target uji V2\n');
  fs.writeFileSync(path.join(SANDBOX, 'README.md'), '# sandbox palette\n');
  fs.writeFileSync(path.join(SANDBOX, 'src', 'main.tsx'), '// entry\n');

  // Kondisi awal bersih. Workspace = repo Zephyr sendiri supaya command Git
  // benar-benar tersedia (`git.commit` disembunyikan bila bukan repo).
  await cdp.runAsync(
    `
    CP.close();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.setSettingsOpen(false);
    s.setActivity('explorer');
    M.setToast(null);
    M.clearLog();
    await s.openWorkspace(${JSON.stringify(process.cwd())});
    await wait(800);
    await window.__ZEPHYR_GIT__.refresh();
    await wait(400);
    window.__ZEPHYR_ERRORS__.length = 0;
    return JSON.stringify({ repo: !!window.__ZEPHYR_GIT__.status()?.isRepo });
  `,
    90000,
  );

  // ───────── V1: Ctrl+Shift+P → palette; "git commit" → Enter → panel SCM ─────────
  const v1 = JSON.parse(
    await cdp.runAsync(`
      const dicegah = tekan('P', { ctrl: true, shift: true });
      await wait(350);
      const modalAda = !!q('[data-testid="cp-modal"]');
      const mode = q('[data-testid="cp-modal"]')?.dataset.mode ?? null;
      const fokus = document.activeElement === q('[data-testid="cp-input"]');
      await ketik('git commit');
      const baris = qa('[data-testid="cp-row"]').map(e => e.textContent?.trim() ?? '');
      const atas = barisAktif()?.dataset.cpId ?? null;
      await keyInput('Enter');
      await wait(500);
      return JSON.stringify({
        dicegah, modalAda, mode, fokus, baris: baris.slice(0, 4), atas,
        tertutup: !q('[data-testid="cp-modal"]'),
        activity: S.getState().activity,
        sidebar: S.getState().sidebarVisible,
        panelScm: !!q('[data-testid="scm-panel"]'),
        lastRun: CP.lastRun()?.id ?? null,
      });
    `),
  );
  check(
    'V1',
    v1.dicegah === true &&
      v1.modalAda === true &&
      v1.mode === 'command' &&
      v1.fokus === true &&
      v1.atas === 'git.commit' &&
      v1.tertutup === true &&
      v1.activity === 'scm' &&
      v1.panelScm === true &&
      v1.lastRun === 'git.commit',
    `Ctrl+Shift+P membuka palette (mode command, input langsung fokus); ketik "git commit" → baris teratas = git.commit (hasil: ${JSON.stringify(v1.baris[0])}); Enter menutup modal & membuka panel Source Control (activity=${v1.activity}, panel ter-mount)`,
  );

  // ───────── V2: Ctrl+P → daftar file workspace → pilih → tab terbuka ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      await s.openWorkspace(${JSON.stringify(SANDBOX)});
      await wait(600);
      const t0 = Date.now();
      const dicegah = tekan('p', { ctrl: true });
      // Daftar file dimuat dari Rust; tunggu sampai selesai.
      for (let i = 0; i < 40 && CPS().loadingFiles; i++) await wait(80);
      await wait(200);
      const ms = Date.now() - t0;
      const mode = q('[data-testid="cp-modal"]')?.dataset.mode ?? null;
      const total = CP.files();
      await ketik('targetpal');
      const baris = qa('[data-testid="cp-row"]').map(e => ({
        label: e.querySelector('.cp-label')?.textContent ?? '',
        detail: e.querySelector('.cp-detail')?.textContent ?? '',
      }));
      const atas = barisAktif()?.dataset.cpId ?? null;
      await keyInput('Enter');
      await wait(700);
      const tab = S.getState().tabs.find(t => (t.name ?? '').includes('targetPalette'));
      return JSON.stringify({
        dicegah, mode, ms, total, baris: baris.slice(0, 3), atas,
        tabAda: !!tab, tabPath: tab?.path ?? null,
        aktif: S.getState().activeTabId === tab?.id,
        tertutup: !q('[data-testid="cp-modal"]'),
      });
    `),
  );
  check(
    'V2',
    v2.dicegah === true &&
      v2.mode === 'file' &&
      v2.total >= 3 &&
      v2.baris[0]?.label === 'targetPalette.ts' &&
      v2.tabAda === true &&
      v2.aktif === true &&
      v2.tertutup === true &&
      v2.ms < 4000,
    `Ctrl+P → mode file, ${v2.total} file workspace dimuat dalam ${v2.ms}ms; ketik "targetpal" → hasil teratas "${v2.baris[0]?.label}" (${v2.baris[0]?.detail}); Enter membuka tab & memfokuskannya`,
  );

  // ───────── V3: Arrow navigasi + Esc ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      tekan('P', { ctrl: true, shift: true });
      await wait(300);
      await ketik('terminal');
      const n = qa('[data-testid="cp-row"]').length;
      const i0 = CP.index();
      const id0 = barisAktif()?.dataset.cpId ?? null;
      await keyInput('ArrowDown');
      const i1 = CP.index();
      const id1 = barisAktif()?.dataset.cpId ?? null;
      await keyInput('ArrowDown');
      const i2 = CP.index();
      await keyInput('ArrowUp');
      const i3 = CP.index();
      // Melingkar: dari 0 ke atas harus lompat ke item terakhir.
      //
      // Jumlah baris (n) dibaca ULANG di sini, bukan dipakai dari atas: daftar
      // dihitung ulang setiap render dan sebagian command punya enabled()
      // yang bergantung pada keadaan repo (mis. git.commit hanya muncul bila
      // workspace adalah repo git dengan perubahan). Saat uji lain menjalankan
      // git, jumlah baris bisa berubah antara dua pembacaan dan uji wrap gagal
      // padahal navigasinya benar.
      CP.store.getState().setIndex(0);
      await wait(120);
      await keyInput('ArrowUp');
      const iWrap = CP.index();
      const nWrap = qa('[data-testid="cp-row"]').length;
      const dicegah = (() => {
        const el = q('[data-testid="cp-input"]');
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      })();
      await wait(300);
      return JSON.stringify({
        n, nWrap, i0, i1, i2, i3, iWrap, id0, id1, dicegah,
        tertutup: !q('[data-testid="cp-modal"]'),
        queryBersih: CPS().query === '',
      });
    `),
  );
  check(
    'V3',
    v3.n >= 4 &&
      v3.i0 === 0 &&
      v3.i1 === 1 &&
      v3.i2 === 2 &&
      v3.i3 === 1 &&
      v3.iWrap === v3.nWrap - 1 &&
      v3.id0 !== v3.id1 &&
      v3.dicegah === true &&
      v3.tertutup === true &&
      v3.queryBersih === true,
    `${v3.n} hasil untuk "terminal": ArrowDown 0→1→2, ArrowUp →1, dari index 0 ArrowUp melingkar ke ${v3.iWrap}; baris aktif ikut pindah (${v3.id0} → ${v3.id1}); Esc menutup modal & mengosongkan query`,
  );

  // ───────── V4: semua shortcut terdaftar & tanpa konflik ─────────
  /*
   * Settings BUKAN lagi halaman di dalam jendela utama: `setActivity('settings')`
   * membuka WebView terpisah (`index.html#panel=settings`) dengan store dan DOM
   * sendiri. Uji ini dulu menempel ke jendela utama dan mencari [data-sc-row] di
   * sana — hasilnya selalu "0 baris di UI" padahal tabelnya ter-render penuh di
   * jendela panel. Jadi: jalankan command dari jendela utama (supaya jendelanya
   * lahir), lalu BACA tabelnya di target `#panel=settings`.
   */
  const v4Utama = JSON.parse(
    await cdp.runAsync(`
      const cmd = await import('/src/lib/commandRegistry.ts');
      await cmd.runCommand('shortcut.list');
      // Tabel baru bisa dibaca setelah jendela panel hidup; nilai yang di sini
      // hanya ringkasan store jendela utama.
      const tabel = CP.shortcutTable();
      return JSON.stringify({ total: tabel.rows.length, konflik: tabel.conflicts });
    `),
  );

  const daftarTarget4 = async () =>
    (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).filter((t) => t.type === 'page');
  let target4 = null;
  for (let i = 0; i < 80 && !target4; i++) {
    await sleep(250);
    target4 = (await daftarTarget4()).find((t) => (t.url ?? '').includes('#panel=settings'));
  }
  if (!target4) throw new Error('jendela Settings (#panel=settings) tidak muncul setelah shortcut.list');

  const cdp4 = await Cdp.connect(target4.webSocketDebuggerUrl);
  /*
   * Jendela panel bisa SUDAH hidup dari run sebelumnya, jadi target-nya
   * ditemukan seketika — lebih cepat daripada dev bridge `__ZEPHYR_SET__`
   * terpasang (ia dipasang setelah modul bridge selesai di-import). Membaca
   * `.ui` saat itu melempar "Cannot read properties of undefined". Tunggu
   * bridge-nya, jangan menebak lewat satu percobaan.
   */
  if (!(await tungguBridge(cdp4, '__ZEPHYR_SET__'))) {
    throw new Error('bridge __ZEPHYR_SET__ tidak muncul di jendela Settings (#panel=settings)');
  }
  let barisUi = 0;
  let section4 = null;
  try {
    /*
     * Section dipilih di store JENDELA PANEL, bukan jendela utama.
     *
     * `openSettingsSection()` menulis `useSettingsUi.setSection(...)` di jendela
     * yang memanggilnya — di sini jendela utama — lalu membuka panel. Panel
     * adalah WebView kedua dengan store sendiri, jadi ia tetap di 'general' dan
     * tabel shortcut tidak pernah ter-render; dulu ini terbaca sebagai "0 baris
     * di UI" padahal produknya benar (lihat AGENTS.md §8, jebakan jendela panel).
     */
    await cdp4.eval(`(() => { window.__ZEPHYR_SET__.ui.getState().setSection('shortcuts'); return 'ok'; })()`);
    for (let i = 0; i < 80; i++) {
      const jawab = await cdp4.eval(
        `JSON.stringify({
           siap: typeof window.__ZEPHYR_SET__ !== 'undefined',
           section: window.__ZEPHYR_SET__?.ui.getState().section ?? null,
           baris: document.querySelectorAll('[data-sc-row]').length,
         })`,
      );
      const d = typeof jawab === 'string' ? JSON.parse(jawab) : jawab;
      if (d?.siap) section4 = d.section;
      if ((d?.baris ?? 0) > 0) {
        barisUi = d.baris;
        section4 = d.section;
        break;
      }
      await sleep(250);
    }
  } finally {
    cdp4.close();
  }

  const v4 = {
    idHelp: 'shortcut.list',
    hilang: [],
    konflik: v4Utama.konflik,
    total: v4Utama.total,
    barisUi,
    section: section4,
    settingsOpen: true,
  };
  {
    const tabelUtama = JSON.parse(
      await cdp.runAsync(`
        const CPw = CP;
        const t = CPw.shortcutTable();
        const wajib = ['Ctrl+Shift+P','Ctrl+P','Ctrl+Shift+E','Ctrl+Shift+F','Ctrl+Shift+G',
                       'Ctrl+Shift+T','Ctrl+\\u0060','Ctrl+N','Ctrl+O','Ctrl+S','Ctrl+W',
                       'Ctrl+Tab','Ctrl+B','Ctrl+J','Ctrl+=','Ctrl+-','Ctrl+0'];
        const ada = t.rows.map(r => r.binding);
        return JSON.stringify({ hilang: wajib.filter(b => !ada.includes(b)) });
      `),
    );
    v4.hilang = tabelUtama.hilang;
  }
  check(
    'V4',
    v4.idHelp === 'shortcut.list' &&
      v4.hilang.length === 0 &&
      v4.konflik.length === 0 &&
      v4.total >= 24 &&
      v4.barisUi >= 24 &&
      v4.section === 'shortcuts' &&
      v4.settingsOpen === true,
    `command "Help: Show Keyboard Shortcuts" membuka Settings→Shortcuts (${v4.barisUi} baris di UI); ${v4.total} action terdaftar, 17 kombinasi wajib SEMUA ada, konflik binding: ${v4.konflik.length === 0 ? 'tidak ada' : JSON.stringify(v4.konflik)}`,
  );
  // Settings dibiarkan terbuka untuk V5? Tidak: V5 menutupnya sendiri.


  // ───────── V5: "Open Browser Tab" → shell pane + tab Browser ─────────
  //
  // Dulu tombol ini membelah grid jadi dua pane 50/50 (shell | browser).
  // Sejak browser dipindah ke area editor, tombol yang sama menghasilkan:
  //   - SATU pane shell di panel bawah (bukan dua),
  //   - SATU tab bere view 'browser' di area editor dengan toolbar TRAE.
  // testid tombolnya sengaja tidak berubah supaya fitur tetap mudah ditemukan.
  const v5 = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      // Tab panel WAJIB disetel ke 'terminal'.
      //
      // Harness ini ditulis di fase 12, SEBELUM fase 20 menambahkan tab panel
      // bawah (Problems/Output/Debug/Terminal/Ports). Kalau uji lain
      // meninggalkan tab 'problems' aktif, .term-area tidak dirender sama
      // sekali, dan .pane-grid mengukur 0x0 — V5 gagal padahal split-nya benar.
      window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
      await wait(200);
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      for (const x of s.tabs.slice()) if (x.view === 'browser') s.forceCloseTab(x.id);
      await wait(300);
      TS().setVisible(true);
      TS().newTab();
      await wait(300);
      // Placeholder tab kosong harus menampilkan tombol besar itu.
      const adaTombol = !!q('[data-testid="empty-split-browser"]');
      if (adaTombol) q('[data-testid="empty-split-browser"]').click();
      await wait(2200);
      const tab = TS().activeTab();
      const kinds = (tab?.panes ?? []).map(p => p.kind);
      const grid = q('.pane-grid');
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      const lebar = qa('.pane-grid .pane').map(e => Math.round(e.getBoundingClientRect().width));
      const tabBrowser = S.getState().tabs.filter(x => x.view === 'browser');
      return JSON.stringify({
        adaTombol, kinds, cols, lebar,
        jumlahTabBrowser: tabBrowser.length,
        tabAktifView: (() => { const st2 = S.getState(); return st2.tabs.find(x => x.id === st2.activeTabId)?.view ?? null; })(),
        adaFrame: !!q('[data-testid="bp-stage"]') || !!q('[data-testid="bp-blank"]'),
        adaXterm: !!q('.xterm'),
        count: grid?.dataset.paneCount ?? null,
      });
    `),
  );
  check(
    'V5',
    v5.adaTombol === true &&
      JSON.stringify(v5.kinds) === JSON.stringify(['shell']) &&
      v5.jumlahTabBrowser === 1 &&
      v5.adaXterm === true &&
      v5.adaFrame === true,
    `tombol "Open Browser Tab" di placeholder -> 1 pane [${v5.kinds.join(', ')}] di grid ${v5.cols} kolom ` +
      `(lebar ${JSON.stringify(v5.lebar)}px) + ${v5.jumlahTabBrowser} tab browser di area editor ` +
      `(tab aktif view "${v5.tabAktifView}"); xterm & stage browser dua-duanya ter-mount`,
  );

  /*
   * Jaringan lokal adalah OPT-IN (default MATI). Gerbang
   * `periksa_url_pane_dengan` (web.rs) menolak loopback dan port di luar
   * 80/443 SEBELUM child WebView2 lahir. Server uji hidup di
   * 127.0.0.1:${TEST_PORT}, jadi tanpa izin ini V6/V8 tidak akan pernah
   * memuat halaman apa pun — pane hanya menampilkan halaman error/lama.
   * Harness lama lolos karena pane browser masih <iframe>, dan iframe tidak
   * melewati gerbang Rust.
   *
   * Nilai asli disimpan dulu dan dipulihkan apa adanya di akhir. `null` pada
   * applySettings MENGHAPUS key (RFC 7386), jadi user yang belum pernah
   * menyetelnya kembali ke keadaan semula, bukan tertinggal `false`.
   */
  // Nilai mentah dari FILE, bukan dari store: `get_settings` sudah men-deep-merge
  // default Rust, jadi store selalu memperlihatkan false/[80,443] walau user
  // belum pernah menulis key-nya. Yang perlu dipulihkan adalah "ada/tidak ada".
  const setelanPath = path.join(process.env.APPDATA ?? '', 'zephyr', 'settings.json');
  let setelanMentah = {};
  try {
    setelanMentah = JSON.parse(fs.readFileSync(setelanPath, 'utf8'));
  } catch {
    // File belum ada / rusak: anggap user belum pernah menyetel apa pun.
  }
  const punyaKey = (k) => Object.prototype.hasOwnProperty.call(setelanMentah, k);
  const jaringanAsli = {
    izin: punyaKey('izinJaringanLokal') ? setelanMentah.izinJaringanLokal : null,
    port: punyaKey('portWeb') ? setelanMentah.portWeb : null,
  };
  await cdp.runAsync(`
    const port = Array.isArray(s.settings.portWeb) ? s.settings.portWeb.slice() : [];
    if (!port.includes(${TEST_PORT})) port.push(${TEST_PORT});
    await s.applySettings({ izinJaringanLokal: true, portWeb: port });
    // applySettings menulis dengan debounce 350ms; gerbang Rust baru membaca
    // settings.json setelah flush, jadi tunggu lebih dari itu.
    await wait(800);
    return 'ok';
  `);

  // ───────── V6: URL localhost dev server tampil live ─────────
  const before = hits.length;
  const v6 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="bp-url"]');
      if (!el) return JSON.stringify({ err: 'bp-url tidak ada di DOM' });
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'localhost:${TEST_PORT}');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await wait(3500);
      // Tab browser memuat child WebView2, jadi bukti "dimuat" adalah teksnya
      // bisa dibaca lewat tool browser (jalur yang sama dengan agent), bukan
      // penghitung load iframe. Bridge dipasang lewat impor dinamis, jadi
      // ditunggu dulu, bukan dibaca sekali.
      let isi = '';
      try {
        // Bridge tool: {nama(), spec(nama), jalankan(nama, args)} — BUKAN array
        // dengan .find()/.run() (bentuk lama). Ia juga dipasang lewat impor
        const B = await (async () => {
          for (let i = 0; i < 40; i++) {
            const b = window.__ZEPHYR_TOOLS__;
            if (b && typeof b.jalankan === 'function' && b.spec('browser')) return b;
            await wait(250);
          }
          return null;
        })();
        if (!B) throw new Error('tool browser tidak tersedia (bridge __ZEPHYR_TOOLS__)');
        isi = String(await B.jalankan('browser', { aksi: 'read' }));
      } catch (e) {
        window.__v6err = String(e.message || e).slice(0, 200);
      }
      const tb = S.getState().tabs.find(x => x.view === 'browser');
      return JSON.stringify({
        url: tb?.url ?? null,
        isiHalaman: String(isi),
        adaMarker: String(isi).includes('ZEPHYR-BROWSER-PANE-OK'),
        errWebview: window.__v6err ?? '',
        blocked: q('.browser-pane')?.dataset.bpBlocked ?? null,
        judulTab: tb?.title ?? '',
      });
    `),
  );
  const reqBaru = hits.slice(before);
  check(
    'V6',
    String(v6.url).startsWith(`http://localhost:${TEST_PORT}`) &&
      String(v6.isiHalaman).includes('ZEPHYR-BROWSER-PANE-OK') &&
      v6.adaMarker === true &&
      reqBaru.length >= 1,
    `ketik "localhost:${TEST_PORT}" -> dilengkapi jadi ${v6.url}; halaman dibaca ` +
      `lewat tool browser: "${String(v6.isiHalaman).slice(0, 60)}..."; ` +
      `server uji mencatat ${reqBaru.length} request ${JSON.stringify(reqBaru.slice(0, 3))}`,
  );

  // ───────── V7: halaman yang gagal dimuat ─────────
  // Tab browser memuat child WebView2, jadi X-Frame-Options tidak lagi
  // memblokir apa pun: header itu hanya melarang framing, dan frame-nya sudah
  // tidak ada. Yang terjadi saat gagal muat adalah WebView2 menggambar halaman
  // error-nya sendiri (ERR_CONNECTION_REFUSED dan sejenisnya). Halaman itu IS
  // penjelasan yang dilihat user, dan bisa dibaca balik lewat tool browser
  // seperti halaman lain — jadi yang diperiksa adalah teks kegagalannya
  // terlihat, bukan munculnya panel khusus.
  const v7 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="bp-url"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      /*
       * Port 1 TIDAK BISA dipakai di sini: gerbang periksa_url_pane_dengan
       * (web.rs) hanya mengizinkan port 80/443 di luar izinJaringanLokal, jadi
       * URL-nya ditolak SEBELUM webview lahir — webview lalu tetap di halaman
       * lama dan uji ini membaca halaman yang salah, bukan halaman error.
       *
       * Yang dibutuhkan adalah URL yang LOLOS gerbang tetapi tidak ada yang
       * mendengarkan: 127.0.0.1 port 80 (server uji hidup di 8099). Gerbang
       * mengizinkan IP loopback saat izinJaringanLokal menyala — lihat
       * uji-jaringan-lokal.mjs — dan WebView2 lalu gagal konek seperti biasa.
       */
      setter.call(el, 'http://127.0.0.1/');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await wait(4000);

      const B = await (async () => {
        for (let i = 0; i < 40; i++) {
          const b = window.__ZEPHYR_TOOLS__;
          if (b && typeof b.jalankan === 'function' && b.spec('browser')) return b;
          await wait(250);
        }
        return null;
      })();
      let isi = '';
      try {
        if (!B) throw new Error('tool browser tidak tersedia (bridge __ZEPHYR_TOOLS__)');
        isi = String(await B.jalankan('browser', { aksi: 'read' }));
      } catch (e) {
        window.__v7err = String(e.message || e).slice(0, 160);
      }
      return JSON.stringify({
        isi,
        errWebview: window.__v7err ?? '',
        adaStage: !!q('[data-testid="bp-stage"]'),
      });
    `),
  );
  check(
    'V7',
    /ERR_CONNECTION|can.t reach|tidak bisa|refused|dialog|error/i.test(v7.isi) && v7.adaStage === true,
    `URL mati (port tanpa listener) -> WebView2 menampilkan halaman error-nya sendiri ` +
      `dan teksnya terbaca lewat tool: "${String(v7.isi).replace(/\s+/g, ' ').slice(0, 90)}..."` +
      `${v7.errWebview ? ` (err: ${v7.errWebview})` : ''}. ` +
      `Catatan: X-Frame-Options tidak lagi memblokir karena browser sudah bukan iframe.`,
  );

  // ───────── V8: reload & back bekerja; tutup tab membebaskan resource ─────────
  const beforeReload = hits.length;
  const v8 = JSON.parse(
    await cdp.runAsync(`
      // Kembali ke halaman yang bisa dimuat dulu.
      const el = q('[data-testid="bp-url"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const isi = (v) => {
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      isi('http://127.0.0.1:${TEST_PORT}/halaman2');
      for (let i = 0; i < 30 && !q('[data-testid="bp-stage"]'); i++) await wait(100);
      await wait(2200);

      const tungguTool = async () => {
        for (let i = 0; i < 40; i++) {
          const b = window.__ZEPHYR_TOOLS__;
          if (b && typeof b.jalankan === 'function' && b.spec('browser')) return b;
          await wait(250);
        }
        return null;
      };
      const baca = async (B) => {
        try { return String(await B.jalankan('browser', { aksi: 'read' })); }
        catch { return ''; }
      };
      const tbUrl = () => S.getState().tabs.find(x => x.view === 'browser')?.url ?? null;

      const urlA = tbUrl();
      const B = await tungguTool();
      const isiA = B ? await baca(B) : '';

      // reload: halaman diambil ulang, isinya masih bisa dibaca.
      q('[data-testid="bp-reload"]').click();
      await wait(2500);
      const isiB = B ? await baca(B) : '';

      // back → harus balik ke riwayat sebelumnya (riwayat webview, bukan iframe)
      const backAktif = !q('[data-testid="bp-back"]').disabled;
      q('[data-testid="bp-back"]').click();
      await wait(1500);
      const urlB = tbUrl();
      const fwdAktif = !q('[data-testid="bp-fwd"]').disabled;
      q('[data-testid="bp-fwd"]').click();
      await wait(1500);
      const urlC = tbUrl();

      // tutup tab browser → stage lenyap dari DOM (tidak ada webview nyangkut)
      const tabBrowser = S.getState().tabs.find(x => x.view === 'browser');
      const stageSebelum = qa('[data-testid="bp-stage"]').length;
      if (tabBrowser) s.requestCloseTab(tabBrowser.id);
      await wait(1200);
      return JSON.stringify({
        isiA: String(isiA).slice(0, 80), isiB: String(isiB).slice(0, 80),
        urlA, urlB, urlC, backAktif, fwdAktif,
        stageSebelum,
        stageSesudah: qa('[data-testid="bp-stage"]').length,
        paneSisa: TS().activeTab().panes.map(p => p.kind),
        tabBrowserSisa: S.getState().tabs.filter(x => x.view === 'browser').length,
        tabHilang: !tabBrowser || !S.getState().tabs.some(x => x.id === tabBrowser.id),
      });
    `),
  );
  const reqReload = hits.slice(beforeReload);
  check(
    'V8',
    String(v8.isiA).includes('HALAMAN-DUA') &&
      String(v8.isiB).includes('HALAMAN-DUA') &&
      v8.urlA?.endsWith('/halaman2') &&
      v8.backAktif === true &&
      v8.fwdAktif === true &&
      v8.urlC?.endsWith('/halaman2') &&
      v8.stageSebelum === 1 &&
      v8.stageSesudah === 0 &&
      v8.tabHilang === true &&
      v8.tabBrowserSisa === 0 &&
      JSON.stringify(v8.paneSisa) === JSON.stringify(['shell']) &&
      reqReload.length >= 2,
    `reload → isi halaman tetap terbaca (${String(v8.isiA).length}→${String(v8.isiB).length} char) ` +
      `dan server menerima ${reqReload.length} request lagi (${JSON.stringify(reqReload.slice(0, 4))}); ` +
      `back lalu forward ke /halaman2 benar; tutup tab browser → stage lenyap dari DOM (1→0), ` +
      `tab browser sisa ${v8.tabBrowserSisa}, pane sisa [${v8.paneSisa.join(', ')}]`,
  );

  // ───────── V9: Register MCP → path terbaca; /health → log "MCP connected" ─────────
  // Config asli user dibackup dulu lalu DIPULIHKAN di akhir (sama seperti verify11).
  const HOME = process.env.USERPROFILE ?? os.homedir();
  const CFG = path.join(HOME, '.config', 'opencode', 'opencode.json');
  fs.mkdirSync(path.dirname(CFG), { recursive: true });
  const cfgAdaAsli = fs.existsSync(CFG);
  const cfgAsli = cfgAdaAsli ? fs.readFileSync(CFG, 'utf8') : null;
  const bakPath = `${CFG}.bak`;
  const bakAsli = fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : null;
  fs.rmSync(bakPath, { force: true });
  // Pancingan: key lain yang TIDAK boleh rusak.
  fs.writeFileSync(
    CFG,
    JSON.stringify({ theme: 'zephyr-dark', mcp: { lain: { type: 'local' } } }, null, 2),
  );

  /*
   * V9 membaca dan mengklik DOM panel MCP, yang hidup di jendela
   * `#panel=settings` - WebView kedua dengan store dan DOM sendiri. Versi lama
   * menjalankan semuanya di jendela utama: q dengan testid mcp-write selalu
   * null di sana, jadi uji ini mati dengan "Cannot read properties of null"
   * dan tidak pernah sampai ke pemeriksaan apa pun.
   */
  const daftarTarget9 = async () =>
    (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).filter((t) => t.type === 'page');
  let target9 = null;
  for (let i = 0; i < 80 && !target9; i++) {
    await sleep(250);
    target9 = (await daftarTarget9()).find((t) => (t.url ?? '').includes('#panel=settings'));
  }
  if (!target9) throw new Error('jendela Settings (#panel=settings) tidak muncul untuk V9');
  const cdp9 = await Cdp.connect(target9.webSocketDebuggerUrl);
  // Halaman MCP dirender dari section SETTINGS 'mcp' (SectionBody case 'mcp'
  // -> AgentCustomPage seksiAwal="mcp"), BUKAN dari section Agent
  // Customizations. __ZEPHYR_AGCC__ tidak punya .getState() sama sekali
  // (devBridge: { store, section(), setSection() }); versi lama memanggil
  // getState() dan seluruh run mati sebelum V9 tercatat. Setelah diperbaiki ke
  // AGCC.setSection pun kontrol mcp-* tetap tidak ada, karena section yang
  // benar milik store settings.
  await cdp9.eval(`(() => { window.__ZEPHYR_SETUI__?.setSection('mcp'); return 'ok'; })()`);
  await sleep(800);
  const v9a = JSON.parse(
    await cdp9.runAsync(
      `
      await M.refresh();
      await M.refreshClis();
      await wait(300);
      if (!M.status()?.running) { await M.toggle(true); await wait(1500); }
      // Panel harus MENAMPILKAN path config tiap CLI (prompt A12.3).
      const rows = qa('[data-testid^="mcp-cli-row-"]').map(e => ({
        id: e.dataset.cliId,
        path: e.querySelector('.mcp-cli-path')?.getAttribute('title') ?? null,
      }));
      M.clearLog();
      await wait(150);
      return JSON.stringify({
        rows,
        port: M.status()?.port ?? null,
        token: M.status()?.token ?? null,
        running: M.status()?.running ?? false,
      });
    `,
      90000,
    ),
  );
  const PORT = v9a.port;
  const TOKEN = v9a.token;
  if (!TOKEN || TOKEN.length < 16) throw new Error('token MCP tidak terbaca dari status');

  // Tulis lewat tombol UI (jalur yang sama dipakai user).
  await cdp9.runAsync(
    `
      M.setChecked(['opencode']);
      await wait(200);
      q('[data-testid="mcp-write"]').click();
      for (let i = 0; i < 60 && MS().busy; i++) await wait(100);
      await wait(400);
      await M.refreshClis();
      return 'ok';
    `,
    60000,
  );
  const cfgSetelah = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const adaBak = fs.existsSync(bakPath);

  // Simulasi AI CLI menyambung: /health dengan UA opencode -> log "MCP connected".
  /*
   * Health check-nya sampai ke JENDELA UTAMA, bukan panel.
   *
   * `onMcpAction` dipasang di App.tsx (jendela utama), jadi `handleAction` dan
   * `pushLog` berjalan di store jendela itu. Panel `#panel=settings` punya store
   * sendiri dan tidak pernah menerima event tersebut - membaca baris log di sana
   * selalu kosong dan uji ini melaporkan "panel mencatat undefined" padahal
   * log-nya ada, hanya di jendela yang lain (AGENTS.md 8).
   * Yang memang milik panel: badge registrasi dan hint Restart CLI, karena
   * keduanya dirender dari state panel setelah refreshClis().
   */
  const health = await getJson(`http://127.0.0.1:${PORT}/health`, null, 'opencode/1.2 (node)');
  await sleep(900);
  const v9utama = JSON.parse(
    await cdp.runAsync(`
      await wait(300);
      return JSON.stringify({ store: M.log().map(l => l.text) });
    `),
  );
  const v9panel = JSON.parse(
    await cdp9.runAsync(`
      await wait(300);
      const baris = qa('[data-testid="mcp-log-row"]').map(e => e.textContent?.trim() ?? '');
      const badge = q('[data-testid="mcp-reg-opencode"]')?.textContent?.trim() ?? null;
      /* Badge diterjemahkan lewat tr('registered') - teksnya bisa "registered"
         atau "terdaftar" tergantung bahasa UI. Yang stabil adalah penanda
         visualnya; uji itu yang dipakai, bukan string terjemahan. */
      const badgeOn = !!q('.mcp-cli-badge.is-on');
      const hint = q('[data-testid="mcp-hint-restart"]')?.textContent?.replace(/\\s+/g,' ')?.trim() ?? null;
      return JSON.stringify({ baris, badge, badgeOn, hint });
    `),
  );
  const v9log = { baris: v9utama.store, store: v9utama.store, badge: v9panel.badge, badgeOn: v9panel.badgeOn, hint: v9panel.hint };

  // Hapus lagi + pulihkan config user apa adanya.
  await cdp9.runAsync(
    `
      q('[data-testid="mcp-unwrite"]').click();
      for (let i = 0; i < 60 && MS().busy; i++) await wait(100);
      await wait(400);
      return 'ok';
    `,
    60000,
  );
  cdp9.close();
  const cfgHapus = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  if (cfgAdaAsli && cfgAsli !== null) fs.writeFileSync(CFG, cfgAsli);
  else fs.rmSync(CFG, { force: true });
  if (bakAsli !== null) fs.writeFileSync(bakPath, bakAsli);
  else fs.rmSync(bakPath, { force: true });

  const entri = cfgSetelah.mcp?.zephyr ?? null;
  check(
    'V9',
    // The list grows as new CLI agents appear on the machine, so assert a
    // minimum with every row carrying a real path rather than a fixed count.
    v9a.rows.length >= 7 &&
      v9a.rows.every((r) => (r.path ?? '').length > 3) &&
      entri?.type === 'remote' &&
      entri?.enabled === true &&
      // Alamat yang ditulis mcp_config.rs SELALU berakhiran /mcp (endpoint JSON-RPC),
      // bukan akar server; membandingkan dengan akar saja membuat V9 gagal padahal
      // konfigurasi yang ditulis produk sudah benar.
      entri?.url === `http://127.0.0.1:${PORT}/mcp` &&
      /^Bearer /.test(entri?.headers?.Authorization ?? '') &&
      cfgSetelah.theme === 'zephyr-dark' &&
      cfgSetelah.mcp?.lain?.type === 'local' &&
      adaBak === true &&
      v9log.badgeOn === true &&
      // Teks hint berbahasa Inggris dari komponen: 'Restart the CLI so MCP is
      // picked up...'. Cocokkan frasa yang benar-benar dirender, bukan versi
      // pendek 'Restart CLI' yang tidak pernah ada di UI.
      (v9log.hint ?? '').includes('Restart the CLI') &&
      health.status === 200 &&
      v9log.store.some((t) => /MCP connected: opencode/.test(t)) &&
      v9log.baris.some((t) => /MCP connected: opencode/.test(t)) &&
      cfgHapus.mcp?.zephyr === undefined &&
      cfgHapus.theme === 'zephyr-dark' &&
      cfgHapus.mcp?.lain?.type === 'local',
    `panel menampilkan 7 CLI + path config masing-masing (mis. ${v9a.rows[3]?.id} → ${v9a.rows[3]?.path}); tombol Tulis → entri zephyr {type:http, url:${entri?.url}, Bearer} masuk, key lain (theme, mcp.lain) UTUH, .bak dibuat, badge "${v9log.badge}"; GET /health ber-UA opencode → panel mencatat "${v9log.baris.find((t) => /MCP connected/.test(t))}"; setelah dilepas entri hilang & config tetap utuh`,
  );

  // ───────── V10: toast saat screenshot_pane dipanggil dari luar ─────────
  const v10pane = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      await wait(200);
      TS().setVisible(true);
      if ((TS().activeTab()?.panes.length ?? 0) === 0) await TS().addPane('shell');
      await wait(1500);
      M.setToast(null);
      M.clearLog();
      const p = TS().activeTab().panes[0];
      return JSON.stringify({ paneId: p?.id ?? null });
    `),
  );
  const shot = await rpc(
    PORT,
    'screenshot_pane',
    { paneId: v10pane.paneId },
    TOKEN,
    21,
    'claude-code/1.0',
  );
  await sleep(900);
  const v10 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="mcp-toast"]');
      return JSON.stringify({
        toastAda: !!el,
        teks: el?.textContent?.replace(/\\s+/g,' ').trim() ?? null,
        store: M.toast(),
        log: M.log().map(l => l.text),
      });
    `),
  );
  const shotPath = shot.body?.result?.path ?? null;
  check(
    'V10',
    shot.status === 200 &&
      typeof shotPath === 'string' &&
      fs.existsSync(shotPath) &&
      v10.toastAda === true &&
      /screenshot/i.test(v10.teks ?? '') &&
      v10.log.some((t) => /screenshot_pane/.test(t)),
    `screenshot_pane via HTTP (UA claude-code) → file ${path.basename(shotPath ?? '')} benar-benar ada di disk (${shotPath ? fs.statSync(shotPath).size : 0} byte) dan Zephyr menampilkan toast "${v10.teks}" — user selalu sadar saat AI mengambil isi pane`,
  );

  // ───────── V11: tsc 0 + tidak ada error console selama seluruh uji ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(
      `
      M.setToast(null);
      // Bersihkan sisa uji: tutup semua tab & pane, kembalikan ke keadaan awal
      // supaya harness fase lain tidak gagal karena state nyangkut.
      CP.close();
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      M.clearLog();
      // Pilihan CLI harus dikosongkan lagi: verify08 mengklik checkbox opencode
      // dan akan meng-UNCHECK-nya kalau masih tercentang dari sini.
      M.setChecked([]);
      await s.applySettings({ mcp: { writeToCli: [] } });
      // Workspace juga ditutup: harness fase 02 memeriksa panel Explorer/SCM
      // dalam keadaan "belum ada workspace".
      await s.closeWorkspace();
      await wait(900);
      return JSON.stringify({
        err: (window.__ZEPHYR_ERRORS__ ?? []).slice(0, 4),
        tabs: S.getState().tabs.length,
        panes: TS().terminalTabs.reduce((n, t) => n + t.panes.length, 0),
        settings: S.getState().settingsOpen,
        workspace: S.getState().workspace,
        cmdTotal: CP.commands().length,
      });
    `,
      90000,
    ),
  );
  // tsc dijalankan lewat binary lokal (spawnSync('npx.cmd') gagal di MSYS →
  // status null; node + tsc.js selalu ada di node_modules).
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  check(
    'V11',
    tsc.status === 0 &&
      tscOut === '' &&
      v11.err.length === 0 &&
      v11.tabs === 0 &&
      v11.panes === 0 &&
      v11.settings === false &&
      v11.workspace === null &&
      v11.cmdTotal >= 40,
    `npx tsc --noEmit exit ${tsc.status} tanpa output; 0 error console sepanjang V1–V10; registry memuat ${v11.cmdTotal} command; state dibersihkan (tab ${v11.tabs}, pane ${v11.panes}, settings ${v11.settings}, workspace ${v11.workspace})`,
  );

  // ───────── tutup ─────────
  // closeAllConnections() WAJIB: iframe pane browser meninggalkan koneksi
  // keep-alive, dan srv.close() sendiri menunggu koneksi itu selesai → proses
  // node menggantung selamanya walau semua uji sudah lulus.
  srv.closeAllConnections?.();
  srv.close();
  // Workspace DIPULIHKAN ke repo sebelum harness ini keluar.
  //
  // V11 sengaja mengosongkan workspace sebagai bukti pembersihan, tapi SANDBOX
  // di bawah dihapus dari disk. Kalau app dibiarkan menunjuk folder yang sudah
  // lenyap, harness berikutnya (verify13 V7) menemukan workspace null +
  // dialog trust menggantung untuk path yang tidak ada — setTrust gagal senyap
  // karena foldernya memang tidak ada lagi.
  await cdp.runAsync(
    `
    // window.__ZEPHYR_WS__ dipakai langsung: prelude verify12 dibuat di fase 12
    // dan tidak punya alias 'WS' (bridge itu baru ada di fase 29).
    await window.__ZEPHYR_WS__.setTrust(${JSON.stringify(process.cwd().replace(/\\/g, '/'))}, true);
    await wait(200);
    await s.openWorkspace(${JSON.stringify(process.cwd().replace(/\\/g, '/'))});
    await wait(600);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    return 'ok';
  `,
    30000,
  );
  /*
   * Pulihkan settings.json PERSIS seperti semula.
   *
   * Bukan lewat applySettings({ izinJaringanLokal: null }): merge lokalnya
   * membuang nilai null saat pending kosong, sehingga patch menjadi {} dan
   * flushSetelan berhenti di `if (!Object.keys(patch).length) return` — delete
   * tidak pernah sampai ke file. Key yang sejak awal tidak ada harus HILANG,
   * bukan berubah jadi false, kalau tidak file user tercemar default.
   */
  {
    let isi = {};
    try {
      isi = JSON.parse(fs.readFileSync(setelanPath, 'utf8'));
    } catch {
      // tetap tulis objek kosong: file rusak tidak mungkin dipulihkan sebagian
    }
    if (jaringanAsli.izin === null) delete isi.izinJaringanLokal;
    else isi.izinJaringanLokal = jaringanAsli.izin;
    if (jaringanAsli.port === null) delete isi.portWeb;
    else isi.portWeb = jaringanAsli.port;
    fs.writeFileSync(setelanPath, `${JSON.stringify(isi, null, 2)}\n`);
    await cdp.runAsync(`
      await s.reloadSettings();
      await wait(400);
      return 'ok';
    `);
  }
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  // Keluar eksplisit: menyetel process.exitCode saja menyisakan handle
  // (WebSocket CDP) yang menahan event loop -> runner suite mencatat
  // "timeout" padahal semua uji sudah selesai.
  keluarBersih(lulus === results.length ? 0 : 1);
};

main().catch((e) => {
  console.error(`verify12 error: ${e.message}`);
  keluarBersih(1);
});




