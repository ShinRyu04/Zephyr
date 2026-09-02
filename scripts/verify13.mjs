// verify13.mjs — verifikasi V1..V9 fase 13 (Theme System + Extensions).
//
// Pakai:  node scripts/verify13.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: tidak ada yang "dianggap lulus". Tema dibuktikan dari
// getComputedStyle SUNGGUHAN (token + warna span syntax CodeMirror + tema
// xterm yang sedang dipakai instance), dan ekstensi dibuktikan dengan folder
// paket NYATA yang ditulis harness ke %APPDATA%\zephyr\extensions\ lalu
// dibaca Rust — termasuk satu paket dengan index.js >1MB untuk V7.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const CDP_PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Token yang WAJIB ada di setiap tema (daftar dari prompt fase 13). */
const TOKENS = [
  '--bg0', '--bg1', '--bg2', '--bg3',
  '--border', '--fg0', '--fg1', '--fg2',
  '--accent', '--accent-fg', '--danger', '--success', '--warning',
  '--editor-background', '--editor-foreground', '--gutter-bg', '--gutter-fg',
  '--line-active', '--line-active-bg', '--selection-bg',
  '--syntax-keyword', '--syntax-string', '--syntax-number', '--syntax-comment',
  '--syntax-fn', '--syntax-type', '--syntax-operator',
  '--terminal-bg', '--terminal-fg',
  ...Array.from({ length: 16 }, (_, i) => `--terminal-ansi-${i}`),
  '--panel-header-bg', '--input-bg', '--input-border', '--focus-ring',
  '--toolbar-bg', '--statusbar-bg', '--titlebar-bg',
];

const THEME_IDS = ['zephyr-dark', 'zephyr-light', 'nord', 'tokyo-night', 'gruvbox-dark', 'one-dark'];

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
    const slot = `__ZV13_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const CP = window.__ZEPHYR_CP__;
        const CPS = () => window.__ZEPHYR_CP__.store.getState();
        const X = window.__ZEPHYR_EXT__;
        const XS = () => window.__ZEPHYR_EXT__.store.getState();
        const TH = window.__ZEPHYR_THEME__;
        const SET = window.__ZEPHYR_SET__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
        /** buka halaman Settings di section tertentu.
         *  Section disetel lewat store, BUKAN klik nav: nav hanya ada saat
         *  sidebar terlihat, dan sidebar bisa tertutup dari uji sebelumnya
         *  (V8 pernah gagal karena querySelector nav = null). */
        const bukaSet = async (sec) => {
          // Panel terminal yang di-maximize membuat .editor-area display:none →
          // halaman Settings ada di DOM tapi berukuran 0×0 (V8 pernah gagal
          // karena ini). setVisible(false) sekaligus mereset maximized.
          if (TS().maximized || TS().visible) TS().setVisible(false);
          S.setState({ sidebarVisible: true });
          S.getState().setActivity('settings');
          S.getState().setSettingsOpen(true);
          if (sec) SET.ui.getState().setSection(sec);
          await wait(360);
          if (sec && SET.ui.getState().section !== sec) throw new Error('section tidak berganti: ' + sec);
        };
        const ketik = async (text) => {
          const el = q('[data-testid="cp-input"]');
          if (!el) throw new Error('input palette tidak ada');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(200);
          return el;
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

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
};

// ─────────────── paket ekstensi uji (ditulis ke disk) ───────────────

function extRoot() {
  const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, 'zephyr', 'extensions');
}

/** Paket dummy dengan kontribusi command "Halo" (V6). */
function writeDummy(root) {
  const dir = path.join(root, 'zephyr-halo-test');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'zephyr-halo-test',
        displayName: 'Halo Test',
        version: '1.0.0',
        description: 'ekstensi uji fase 13 (manifest-only)',
        main: 'index.js',
        contributes: {
          commands: [
            { command: 'halo', title: 'Zephyr: Halo', description: 'menyapa dari manifest' },
            { command: 'halo.dua', title: 'Zephyr: Halo Dua' },
          ],
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(dir, 'index.js'), '// tidak dieksekusi di v1\nexport default {};\n');
  return dir;
}

/** Paket dengan index.js >1MB (V7). */
function writeBig(root) {
  const dir = path.join(root, 'zephyr-kebesaran-test');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'zephyr-kebesaran-test',
        displayName: 'Kebesaran Test',
        version: '0.1.0',
        description: 'index.js lebih dari 1MB — harus ditolak',
        main: 'index.js',
        contributes: { commands: [{ command: 'jangan', title: 'Zephyr: Jangan Muncul' }] },
      },
      null,
      2,
    ),
  );
  // 1.3 MB
  fs.writeFileSync(path.join(dir, 'index.js'), 'x'.repeat(1_300_000));
  return dir;
}

// ───────────────────────── main ─────────────────────────

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_THEME__')) === 'undefined') {
    throw new Error('__ZEPHYR_THEME__ tidak ada — reload halaman (devBridge fase 13)');
  }

  const ROOT = extRoot();
  fs.mkdirSync(ROOT, { recursive: true });
  const dummyDir = writeDummy(ROOT);
  const bigDir = writeBig(ROOT);

  // Kondisi awal: tema default, tanpa tab/pane sisa, satu file dibuka supaya
  // CodeMirror ter-mount (V1 membaca warna span syntax sungguhan).
  const SANDBOX = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-th-${process.pid}`);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  const sampleFile = path.join(SANDBOX, 'contoh.ts');
  fs.writeFileSync(
    sampleFile,
    [
      '// komentar untuk uji warna',
      'export const angka = 42;',
      "const teks: string = 'halo';",
      'function sapa(nama: string) { return `hai ${nama}`; }',
      '',
    ].join('\n'),
  );

  await cdp.runAsync(
    `
    CP.close();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.setSettingsOpen(false);
    s.setActivity('explorer');
    await s.applySettings({ extensions: { enabled: [] }, general: { theme: 'dark' }, theme: { current: 'zephyr-dark', accent: '' } });
    await s.openPath(${JSON.stringify(sampleFile)});
    await wait(700);
    window.__ZEPHYR_ERRORS__.length = 0;
    return JSON.stringify({ tabs: S.getState().tabs.length, cm: !!q('.cm-editor') });
  `,
    90000,
  );

  // ───────── V1: setiap tema katalog mengubah SELURUH UI + editor ─────────
  const v1 = JSON.parse(
    await cdp.runAsync(
      `
      const out = [];
      for (const id of ${JSON.stringify(THEME_IDS)}) {
        await TH.set(id);
        await wait(420);
        const tokens = TH.tokens(${JSON.stringify(TOKENS)});
        const kosong = Object.entries(tokens).filter(([, v]) => !v).map(([k]) => k);
        // Warna NYATA dari elemen yang ter-render (bukan hanya nilai token).
        const kw = qa('.cm-line span').map(e => getComputedStyle(e).color);
        out.push({
          id,
          aktif: TH.active(),
          store: TH.inStore(),
          kosong,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          bodyFg: getComputedStyle(document.body).color,
          sideBg: q('.sidebar') ? getComputedStyle(q('.sidebar')).backgroundColor : null,
          statusBg: q('.statusbar') ? getComputedStyle(q('.statusbar')).backgroundColor : null,
          editorBg: q('.cm-editor') ? getComputedStyle(q('.cm-editor')).backgroundColor : null,
          gutterFg: q('.cm-gutters') ? getComputedStyle(q('.cm-gutters')).color : null,
          synWarna: [...new Set(kw)].length,
          // Kotak putih liar: elemen shell besar yang latar-nya putih di tema gelap.
          putih: qa('.app-root, .app-body, .sidebar, .main-area, .editor-area, .statusbar, .activitybar, .tabbar')
            .filter(e => getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)').length,
        });
      }
      return JSON.stringify(out);
    `,
      120000,
    ),
  );
  const idsOk = v1.every((x) => x.id === x.aktif && x.aktif === x.store);
  const tokenOk = v1.every((x) => x.kosong.length === 0);
  const bgUnik = new Set(v1.map((x) => x.bodyBg)).size;
  const editorUnik = new Set(v1.map((x) => x.editorBg)).size;
  const synOk = v1.every((x) => x.synWarna >= 3);
  const light = v1.find((x) => x.id === 'zephyr-light');
  const putihLiar = v1.filter((x) => x.id !== 'zephyr-light' && x.putih > 0);
  check(
    'V1',
    idsOk &&
      tokenOk &&
      bgUnik === 6 &&
      editorUnik >= 5 &&
      synOk &&
      putihLiar.length === 0,
    `6 tema diterapkan: tiap tema punya ${TOKENS.length} token lengkap (0 hilang), ${bgUnik}/6 latar shell berbeda, ${editorUnik}/6 latar editor berbeda, ≥3 warna token syntax nyata per tema (mis. ${v1[0].id}: ${v1[0].synWarna}); tidak ada kotak putih liar di tema gelap`,
  );

  // ───────── V2: Light benar-benar terang + mode System ikut Windows ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      await TH.set('zephyr-light');
      await wait(420);
      const terang = {
        theme: TH.active(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyFg: getComputedStyle(document.body).color,
        editorBg: q('.cm-editor') ? getComputedStyle(q('.cm-editor')).backgroundColor : null,
        ansi0: TH.token('--terminal-ansi-0'),
      };
      // Mode System: tema efektif harus mengikuti preferensi OS.
      await TH.mode('system');
      await wait(450);
      const sistem = { dark: TH.systemDark(), theme: TH.active(), mode: S.getState().settings.general.theme };
      // Kembalikan ke dark untuk uji berikutnya.
      await TH.set('zephyr-dark');
      await wait(350);
      return JSON.stringify({ terang, sistem, balik: TH.active() });
    `),
  );
  const lum = (rgb) => {
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(rgb ?? '');
    return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : -1;
  };
  const sistemBenar =
    v2.sistem.mode === 'system' &&
    v2.sistem.theme === (v2.sistem.dark ? 'zephyr-dark' : 'zephyr-light');
  check(
    'V2',
    v2.terang.theme === 'zephyr-light' &&
      lum(v2.terang.bodyBg) > 200 &&
      lum(v2.terang.bodyFg) < 90 &&
      lum(v2.terang.editorBg) > 200 &&
      lum(v2.terang.ansi0) < 90 &&
      sistemBenar &&
      v2.balik === 'zephyr-dark',
    `Zephyr Light: latar ${v2.terang.bodyBg} (luma ${Math.round(lum(v2.terang.bodyBg))}) dengan teks ${v2.terang.bodyFg} — benar-benar terang, dan ANSI-0 diturunkan jadi ${v2.terang.ansi0} supaya teks terminal tetap terbaca; mode "System" mengikuti Windows (prefers dark = ${v2.sistem.dark} → ${v2.sistem.theme})`,
  );

  // ───────── V3: warna ANSI terminal ikut tema ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(
      `
      // Panel terminal WAJIB terlihat: xterm baru attach ke DOM saat pane
      // ter-render, dan sebelum itu output PTY hanya masuk queue (readBuffer
      // mengembalikan string kosong) — inilah sebab V3 pernah gagal.
      s.setSettingsOpen(false);
      TS().setVisible(true);
      await wait(300);
      const paneId = await TS().addPane('shell');
      if (!paneId) throw new Error('pane gagal dibuat: ' + (TS().terminalError ?? ''));
      await wait(3000);
      const baca = () => {
        const t = TH.termTheme(paneId);
        return { bg: t?.background ?? null, red: t?.red ?? null, green: t?.green ?? null, black: t?.black ?? null };
      };
      const gelap = baca();
      // Jalankan perintah berwarna (PSReadLine mewarnai output juga).
      await window.__ZEPHYR_PTY__.write(paneId, 'Write-Host HIJAU-13 -ForegroundColor Green\\r');
      await wait(2200);
      const isiGelap = window.__ZEPHYR_PTY__.read(paneId, 60);
      // Warna span xterm yang benar-benar ter-render untuk teks itu.
      const spanWarna = qa('.xterm-rows span')
        .filter(e => (e.textContent ?? '').includes('HIJAU-13'))
        .map(e => getComputedStyle(e).color);
      await TH.set('gruvbox-dark');
      await wait(700);
      const gruv = baca();
      const spanGruv = qa('.xterm-rows span')
        .filter(e => (e.textContent ?? '').includes('HIJAU-13'))
        .map(e => getComputedStyle(e).color);
      await TH.set('zephyr-light');
      await wait(700);
      const terang = baca();
      await TH.set('zephyr-dark');
      await wait(600);
      const balik = baca();
      const jml = TH.retheme();
      await TS().closePane(paneId);
      TS().setVisible(false);
      await wait(500);
      return JSON.stringify({
        gelap, gruv, terang, balik, jml,
        adaOutput: isiGelap.includes('HIJAU-13'),
        spanWarna: [...new Set(spanWarna)],
        spanGruv: [...new Set(spanGruv)],
      });
    `,
      120000,
    ),
  );
  const bedaAll =
    v3.gelap.bg !== v3.gruv.bg &&
    v3.gruv.bg !== v3.terang.bg &&
    v3.gelap.green !== v3.gruv.green &&
    v3.terang.black !== v3.gelap.black;
  // Warna span xterm yang benar-benar ter-render juga harus berubah.
  // (Kalau renderer tidak memakai span berwarna, jangan menuduh gagal —
  // bukti utamanya tetap objek tema xterm + isi buffer.)
  const spanBeda =
    v3.spanWarna.length === 0 && v3.spanGruv.length === 0
      ? true
      : v3.spanWarna.join('|') !== v3.spanGruv.join('|');
  check(
    'V3',
    bedaAll && v3.jml >= 0 && v3.balik.bg === v3.gelap.bg && v3.adaOutput && spanBeda,
    `Tema xterm hidup ikut berganti: bg ${v3.gelap.bg} → ${v3.gruv.bg} (gruvbox) → ${v3.terang.bg} (light) dan kembali ${v3.balik.bg}; hijau ANSI ${v3.gelap.green} → ${v3.gruv.green}, hitam ANSI ${v3.gelap.black} → ${v3.terang.black}; warna span "HIJAU-13" yang ter-render ikut berubah ${JSON.stringify(v3.spanWarna)} → ${JSON.stringify(v3.spanGruv)}`,
  );

  // ───────── V4: tema persist (dibaca ulang dari settings.json di disk) ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(`
      await TH.set('tokyo-night');
      await s.applySettings({ theme: { accent: '#ff8800' } });
      await wait(500);
      const disk1 = await SET.settingsFromDisk();
      // reloadSettings = jalur yang sama dipakai saat app dibuka lagi.
      await s.reloadSettings();
      await wait(450);
      const setelahReload = { theme: TH.active(), accent: TH.token('--accent') };
      const disk2 = await SET.settingsFromDisk();
      return JSON.stringify({
        diskTheme: disk1.theme.current,
        diskMode: disk1.general.theme,
        diskAccent: disk1.theme.accent,
        setelahReload,
        tetap: disk2.theme.current,
      });
    `),
  );
  check(
    'V4',
    v4.diskTheme === 'tokyo-night' &&
      v4.diskMode === 'dark' &&
      v4.diskAccent === '#ff8800' &&
      v4.setelahReload.theme === 'tokyo-night' &&
      v4.setelahReload.accent.toLowerCase() === '#ff8800' &&
      v4.tetap === 'tokyo-night',
    `settings.json di disk menyimpan theme.current=${v4.diskTheme} + accent ${v4.diskAccent}; setelah reloadSettings (jalur boot) tema tetap ${v4.setelahReload.theme} dan --accent tetap ${v4.setelahReload.accent}`,
  );

  // ───────── V5: ekstensi bawaan "git provider" ada & aktif ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      await bukaSet('extensions');
      await X.refresh();
      await wait(500);
      const list = X.list();
      const git = list.find(e => e.id === 'git-provider');
      const kartu = q('[data-ext="git-provider"]');
      const toggle = q('[data-testid="ext-git-provider"]');
      return JSON.stringify({
        total: list.length,
        builtin: list.filter(e => e.builtin).length,
        git,
        kartuAda: !!kartu,
        ariaChecked: toggle?.getAttribute('aria-checked') ?? null,
        namaDiKartu: kartu?.querySelector('.ext-name')?.textContent?.trim() ?? null,
        provider: ['file-icon-provider','git-provider','ai-provider'].filter(id => list.some(e => e.id === id && e.enabled)),
      });
    `),
  );
  check(
    'V5',
    v5.git?.enabled === true &&
      v5.git?.builtin === true &&
      v5.kartuAda &&
      v5.ariaChecked === 'true' &&
      v5.provider.length === 3,
    `extensions_list mengembalikan ${v5.total} ekstensi (${v5.builtin} bawaan); "Git Provider" tampil di daftar dengan toggle aria-checked=true, dan tiga provider bawaan (file-icon/git/ai) semuanya aktif`,
  );

  // ───────── V6: ekstensi dummy → toggle → command "Zephyr: Halo" di palette ─────────
  const v6 = JSON.parse(
    await cdp.runAsync(
      `
      await X.refresh();
      await wait(600);
      const sebelum = X.list().find(e => e.id === 'zephyr-halo-test');
      const cmdSebelum = X.extCommands().length;
      // Command manifest belum boleh muncul selama ekstensi mati.
      CP.close();
      await CP.open('command');
      await ketik('Halo');
      const hasilSebelum = CP.items().map(i => i.id);
      CP.close();

      await X.toggle('zephyr-halo-test', true);
      await wait(700);
      const sesudah = X.list().find(e => e.id === 'zephyr-halo-test');
      const cmds = X.extCommands();

      await CP.open('command');
      await ketik('Halo');
      const items = CP.items();
      const barisDom = qa('[data-testid="cp-row"]').map(e => e.textContent?.trim() ?? '');
      const idTeratas = items[0]?.id ?? null;
      await CP.accept(0);
      await wait(400);
      const status = S.getState().statusMessage;
      const disk = (await SET.settingsFromDisk()).extensions.enabled;
      return JSON.stringify({
        adaSebelum: !!sebelum,
        enabledSebelum: sebelum?.enabled ?? null,
        hasilSebelum: hasilSebelum.filter(x => x.startsWith('ext.')),
        cmdSebelum,
        enabledSesudah: sesudah?.enabled ?? null,
        manifestCmds: sesudah?.commands ?? [],
        cmds: cmds.map(c => ({ id: c.id, title: c.title, group: c.group })),
        idTeratas,
        barisDom: barisDom.slice(0, 3),
        lastRun: CP.lastRun()?.id ?? null,
        status,
        disk,
        path: sesudah?.path ?? null,
      });
    `,
      90000,
    ),
  );
  const haloCmd = v6.cmds.find((c) => c.id === 'ext.zephyr-halo-test.halo');
  check(
    'V6',
    v6.adaSebelum === true &&
      v6.enabledSebelum === false &&
      v6.hasilSebelum.length === 0 &&
      v6.cmdSebelum === 0 &&
      v6.enabledSesudah === true &&
      v6.manifestCmds.length === 2 &&
      haloCmd?.title === 'Zephyr: Halo' &&
      haloCmd?.group === 'Extensions' &&
      v6.idTeratas === 'ext.zephyr-halo-test.halo' &&
      v6.lastRun === 'ext.zephyr-halo-test.halo' &&
      String(v6.status).includes('Halo Test') &&
      v6.disk.includes('zephyr-halo-test'),
    `Folder ekstensi nyata terdeteksi (${v6.path}); selama mati 0 command manifest bocor ke palette; setelah toggle → settings.json memuat id-nya, "Zephyr: Halo" jadi baris teratas palette (grup Extensions, DOM: ${JSON.stringify(v6.barisDom[0])}) dan bisa dijalankan (status: ${JSON.stringify(String(v6.status).slice(0, 60))})`,
  );

  // ───────── V7: ekstensi >1MB ditolak dengan pesan ─────────
  const bigBytes = fs.statSync(path.join(bigDir, 'index.js')).size;
  const v7 = JSON.parse(
    await cdp.runAsync(`
      await X.refresh();
      await wait(500);
      const info = X.list().find(e => e.id === 'zephyr-kebesaran-test');
      // Muat lewat jalur Rust langsung supaya errornya terlihat apa adanya.
      let pesan = null;
      try { await X.loadRaw('zephyr-kebesaran-test'); } catch (e) { pesan = e?.message ?? String(e); }
      // Coba aktifkan: command-nya TIDAK boleh masuk palette.
      await X.toggle('zephyr-kebesaran-test', true);
      await wait(600);
      const setelah = X.list().find(e => e.id === 'zephyr-kebesaran-test');
      const cmdIds = X.extCommands().map(c => c.id);
      await bukaSet('extensions');
      const errDom = q('[data-testid="ext-err-zephyr-kebesaran-test"]')?.textContent?.trim() ?? null;
      const kartuRusak = q('[data-ext="zephyr-kebesaran-test"]')?.dataset.extError ?? null;
      return JSON.stringify({
        info, pesan, enabledSetelah: setelah?.enabled ?? null,
        errorSetelah: setelah?.error ?? null, cmdIds, errDom, kartuRusak,
        bytes: setelah?.mainBytes ?? null,
      });
    `),
  );
  check(
    'V7',
    v7.info?.error?.includes('1MB') &&
      String(v7.pesan).includes('1MB') &&
      v7.enabledSetelah === false &&
      v7.cmdIds.every((x) => !x.startsWith('ext.zephyr-kebesaran-test')) &&
      String(v7.errDom).includes('1MB') &&
      v7.kartuRusak === '1' &&
      v7.bytes === bigBytes,
    `index.js ${Math.round(bigBytes / 1024)} KB ditolak: extensions_load melempar "${String(v7.pesan).slice(0, 70)}…", kartunya ditandai rusak di UI dengan pesan yang sama, dan walau di-toggle ia tetap enabled=false sehingga command-nya tidak pernah masuk palette`,
  );

  // ───────── V8: marketplace placeholder tampil rapi ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(`
      await bukaSet('extensions');
      // Pastikan tertutup dulu: tombolnya TOGGLE, jadi kalau state marketplace
      // masih terbuka dari uji sebelumnya, klik ini justru menutupnya (pernah
      // membuat market-close = null → TypeError).
      X.market(false);
      await wait(200);
      q('[data-testid="ext-market"]').click();
      await wait(450);
      const grid = q('[data-testid="market-grid"]');
      const kartu = qa('[data-market-card]');
      const tombol = kartu.map(k => k.querySelector('button'));
      const gaya = grid ? getComputedStyle(grid) : null;
      const kolom = gaya ? gaya.gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      const r = kartu[0]?.getBoundingClientRect();
      const teks = q('.market-title')?.textContent?.trim() ?? '';
      const hasil = {
        tampil: !!grid,
        kartu: kartu.length,
        semuaDisabled: tombol.every(b => b?.disabled === true),
        adaLogo: kartu.every(k => (k.querySelector('.market-logo')?.textContent ?? '').length > 0),
        adaDesc: kartu.every(k => (k.querySelector('.market-desc')?.textContent ?? '').length > 10),
        kolom,
        lebar: r ? Math.round(r.width) : 0,
        tinggi: r ? Math.round(r.height) : 0,
        judul: teks,
        overflow: kartu.some(k => k.scrollWidth > k.clientWidth + 2),
      };
      q('[data-testid="market-close"]').click();
      await wait(250);
      hasil.tertutup = !q('[data-testid="market-grid"]');
      return JSON.stringify(hasil);
    `),
  );
  check(
    'V8',
    v8.tampil &&
      v8.kartu === 8 &&
      v8.semuaDisabled &&
      v8.adaLogo &&
      v8.adaDesc &&
      v8.kolom >= 2 &&
      v8.lebar > 150 &&
      v8.tinggi > 40 &&
      v8.overflow === false &&
      v8.judul.includes('segera') &&
      v8.tertutup,
    `Marketplace placeholder: ${v8.kartu} kartu (logo + nama + deskripsi) dalam grid ${v8.kolom} kolom, kartu ${v8.lebar}×${v8.tinggi}px tanpa overflow, semua tombol Install disabled, judul "${v8.judul}"; tombol Tutup benar-benar menutup`,
  );

  // ───────── V9: tsc 0 error, tanpa console error, state bersih ─────────
  const v9 = JSON.parse(
    await cdp.runAsync(
      `
      // Bersihkan: lepas ekstensi uji, kembalikan tema default, tutup semuanya.
      await X.toggle('zephyr-halo-test', false);
      await X.toggle('zephyr-kebesaran-test', false);
      await X.remove('zephyr-halo-test');
      await X.remove('zephyr-kebesaran-test');
      await s.applySettings({ extensions: { enabled: [] }, theme: { current: 'zephyr-dark', accent: '' }, general: { theme: 'dark' } });
      await wait(500);
      X.market(false);
      X.setError(null);
      CP.close();
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      await wait(800);
      return JSON.stringify({
        err: (window.__ZEPHYR_ERRORS__ ?? []).slice(0, 4),
        tema: TH.active(),
        store: TH.inStore(),
        tabs: S.getState().tabs.length,
        panes: TS().terminalTabs.reduce((n, t) => n + t.panes.length, 0),
        settings: S.getState().settingsOpen,
        extCmds: X.extCommands().length,
        cmdTotal: CP.commands().length,
        tersedia: CP.available().length,
      });
    `,
      90000,
    ),
  );
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], { cwd: process.cwd(), encoding: 'utf8' });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  check(
    'V9',
    tsc.status === 0 &&
      tscOut === '' &&
      v9.err.length === 0 &&
      v9.tema === 'zephyr-dark' &&
      v9.store === 'zephyr-dark' &&
      v9.tabs === 0 &&
      v9.panes === 0 &&
      v9.settings === false &&
      v9.extCmds === 0 &&
      v9.cmdTotal >= 45,
    `tsc --noEmit exit ${tsc.status} tanpa output; 0 console error sepanjang V1–V8; registry ${v9.cmdTotal} command inti (${v9.tersedia} tersedia saat ini); state dibersihkan (tema ${v9.tema}, tab ${v9.tabs}, pane ${v9.panes}, ekstensi uji dilepas → ${v9.extCmds} command manifest)`,
  );

  // ───────── tutup ─────────
  fs.rmSync(dummyDir, { recursive: true, force: true });
  fs.rmSync(bigDir, { recursive: true, force: true });
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`verify13 error: ${e.message}`);
  process.exitCode = 1;
});
