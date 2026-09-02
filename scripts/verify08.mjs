// verify08.mjs — verifikasi V1..V13 fase 08 (Settings lengkap) lewat CDP
// di app yang benar-benar berjalan.
//
// Pakai:  node scripts/verify08.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup — app dev memuat dari sana
//
// Prinsip: setiap V dibuktikan dari DOM/state/DISK yang nyata, bukan dari
// asumsi. Perubahan settings dicek ulang lewat get_settings (baca disk),
// bukan hanya dari store.

import WebSocket from 'ws';

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
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV8_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const X = window.__ZEPHYR_SET__;
        const U = window.__ZEPHYR_SET__.ui;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        // React melacak nilai input lewat setter internal: menimpa
        // el.value langsung TIDAK memicu onChange (React menyangka nilainya
        // tidak berubah). Harus lewat setter asli prototipe.
        const setNativeValue = (el, val) => {
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        // Nav 11 section + tombol Reset ada di SIDEBAR KIRI (fase 08 revisi),
        // jadi sidebar harus terlihat sebelum mengklik apa pun di sana.
        const bukaSettings = async (sec) => {
          const st = S.getState();
          st.setActivity('settings');
          st.setSettingsOpen(true);
          if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
          await new Promise(r => setTimeout(r, 260));
          if (sec) {
            document.querySelector('[data-testid="set-nav-' + sec + '"]').click();
            await new Promise(r => setTimeout(r, 300));
          }
        };
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

const SECTIONS = [
  'general',
  'editor',
  'theme',
  'shortcuts',
  'models',
  'agents',
  'extensions',
  'scm',
  'mcp',
  'ssh',
  'about',
];

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_SET__')) === 'undefined') {
    throw new Error('__ZEPHYR_SET__ tidak ada — reload halaman');
  }

  // Kondisi awal bersih: tutup terminal & tab, kembalikan settings default.
  await cdp.runAsync(`
    for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    await X.resetAll();
    await s.reloadSettings();
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  `);
  await sleep(700);

  // ───────── V1: buka tiap section, tidak ada tombol mati ─────────
  // "Tombol mati" = tombol tanpa handler/disabled tanpa alasan. Yang bisa
  // dibuktikan dari luar: setiap section punya kontrol yang benar-benar
  // ter-render, dan mengklik nav-nya mengganti isi panel.
  const v1 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings();
      const out = [];
      for (const id of ${JSON.stringify(SECTIONS)}) {
        q('[data-testid="set-nav-' + id + '"]').click();
        await wait(240);
        const body = q('.set-body');
        out.push({
          id,
          judul: q('.set-h2')?.textContent ?? '',
          kontrol: body.querySelectorAll('button, input, select').length,
          navAktif: q('[data-testid="set-nav-' + id + '"]').classList.contains('is-active'),
        });
      }
      return JSON.stringify({
        page: !!q('[data-testid="settings-page"]'),
        nav: qa('.set-nav-item').length,
        out,
      });
    `),
  );
  const semuaAdaJudul = v1.out.every((x) => x.judul.length > 0 && x.navAktif);
  // "Tidak ada tombol dead": tiap section punya kontrol yang bisa dipakai.
  // About & SSH memang berisi tombol tautan/daftar, jadi ambang 1 kontrol
  // berlaku untuk SEMUA section tanpa pengecualian.
  const semuaAdaKontrol = v1.out.every((x) => x.kontrol >= 1);
  check(
    'V1',
    v1.page && v1.nav === 11 && semuaAdaJudul && semuaAdaKontrol,
    `11 section terbuka semua: ${v1.out.map((x) => `${x.id}="${x.judul}"(${x.kontrol} kontrol)`).join(', ')}`,
  );

  // ───────── V2: fontSize 14 -> editor terbuka berubah LIVE ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      if (S.getState().tabs.length === 0) { S.getState().newUntitled(); await wait(700); }
      const host = () => q('.zephyr-cm-host');
      const sebelum = getComputedStyle(host()).fontSize;
      await S.getState().applySettings({ general: { fontSize: 14 } });
      await wait(500);
      const sesudah = getComputedStyle(host()).fontSize;
      const disk = await X.settingsFromDisk();
      return JSON.stringify({ sebelum, sesudah, disk: disk.general.fontSize });
    `),
  );
  check(
    'V2',
    v2.sebelum === '13px' && v2.sesudah === '14px' && v2.disk === 14,
    `fontSize editor hidup: ${v2.sebelum} -> ${v2.sesudah} (settings.json di disk = ${v2.disk})`,
  );

  // ───────── V3: tema Zephyr Light -> UI + editor berubah ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      const bacaWarna = () => ({
        html: document.documentElement.dataset.theme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        editorBg: q('.cm-editor') ? getComputedStyle(q('.cm-editor')).backgroundColor : null,
        token: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      });
      const gelap = bacaWarna();
      await bukaSettings('theme');
      q('[data-theme-card="zephyr-light"]').click();
      await wait(600);
      const terang = bacaWarna();
      // kembalikan ke dark supaya uji berikutnya tidak terpengaruh
      q('[data-theme-card="zephyr-dark"]').click();
      await wait(500);
      const balik = bacaWarna();
      return JSON.stringify({ gelap, terang, balik, kartu: qa('[data-theme-card]').length });
    `),
  );
  check(
    'V3',
    v3.kartu === 6 &&
      v3.terang.html === 'zephyr-light' &&
      v3.terang.bodyBg !== v3.gelap.bodyBg &&
      v3.terang.editorBg !== v3.gelap.editorBg &&
      v3.balik.html === 'zephyr-dark',
    `6 kartu tema; dark bg=${v3.gelap.bodyBg} editor=${v3.gelap.editorBg} -> light bg=${v3.terang.bodyBg} editor=${v3.terang.editorBg} -> balik ${v3.balik.html}`,
  );

  // ───────── V4: shortcut remap + konflik ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('shortcuts');
      const awal = X.bindings().find(b => b.id === 'view.explorer');

      // 1) konflik: coba pakai Ctrl+S (sudah dipakai file.save) -> harus ditolak
      const bentrok = X.conflicts('view.explorer', 'Ctrl+S');

      // 2) remap sah: Ctrl+Alt+E
      q('[data-testid="sc-btn-view.explorer"]').click();
      await wait(200);
      const menunggu = q('[data-testid="sc-btn-view.explorer"]').classList.contains('is-capturing');
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'e', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
      }));
      await wait(500);
      const sesudah = X.bindings().find(b => b.id === 'view.explorer');
      const disk = await X.settingsFromDisk();

      // 3) coba set binding yang bentrok lewat UI -> tersimpan? (harus TIDAK)
      q('[data-testid="sc-btn-view.settings"]').click();
      await wait(200);
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 's', ctrlKey: true, bubbles: true, cancelable: true,
      }));
      await wait(400);
      const peringatan = q('[data-testid="sc-conflict"]')?.textContent ?? '';
      const settingsBinding = X.bindings().find(b => b.id === 'view.settings');
      return JSON.stringify({
        awal, menunggu, sesudah, peringatan, settingsBinding, bentrok,
        diskBinding: disk.shortcuts['view.explorer'] ?? null,
      });
    `),
  );
  check(
    'V4',
    v4.awal.binding === 'Ctrl+Shift+E' &&
      v4.menunggu &&
      v4.sesudah.binding === 'Ctrl+Alt+E' &&
      v4.sesudah.isCustom &&
      v4.diskBinding === 'Ctrl+Alt+E' &&
      v4.bentrok?.length >= 1 &&
      /sudah dipakai/i.test(v4.peringatan) &&
      v4.settingsBinding.binding === 'Ctrl+,',
    `remap Explorer ${v4.awal.binding} -> ${v4.sesudah.binding} (disk: ${v4.diskBinding}); konflik Ctrl+S ditolak dengan pesan "${v4.peringatan.slice(0, 58)}…" dan Settings tetap ${v4.settingsBinding.binding}` +
      (process.env.ZV8_DEBUG ? ` :: RAW ${JSON.stringify(v4)}` : ''),
  );

  // ───────── V4b: shortcut hasil remap BENAR-BENAR jalan ─────────
  const v4b = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      S.getState().setActivity('search');
      await wait(300);
      const sebelum = S.getState().activity;
      // tekan binding baru: Ctrl+Alt+E
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'e', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
      }));
      await wait(400);
      const sesudah = S.getState().activity;
      // binding LAMA (Ctrl+Shift+E) harus tidak berfungsi lagi
      S.getState().setActivity('search');
      await wait(250);
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'E', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
      await wait(400);
      const lama = S.getState().activity;
      return JSON.stringify({ sebelum, sesudah, lama });
    `),
  );
  check(
    'V4b',
    v4b.sebelum === 'search' && v4b.sesudah === 'explorer' && v4b.lama === 'search',
    `binding baru Ctrl+Alt+E memindah activity ${v4b.sebelum} -> ${v4b.sesudah}; binding lama Ctrl+Shift+E sudah mati (tetap ${v4b.lama})`,
  );

  // ───────── V5: settings.json di disk ikut berubah ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      await S.getState().applySettings({
        editor: { tabSize: 8, wordWrap: true },
        git: { defaultBranch: 'develop' },
      });
      await wait(500);
      const disk = await X.settingsFromDisk();
      return JSON.stringify({
        tabSize: disk.editor.tabSize,
        wordWrap: disk.editor.wordWrap,
        branch: disk.git.defaultBranch,
        // nilai yang TIDAK disentuh harus tetap ada (merge, bukan overwrite)
        fontSize: disk.general.fontSize,
        mcpPort: disk.mcp.port,
      });
    `),
  );
  check(
    'V5',
    v5.tabSize === 8 && v5.wordWrap === true && v5.branch === 'develop' && v5.fontSize === 14 && v5.mcpPort === 9222,
    `settings.json: tabSize=${v5.tabSize} wordWrap=${v5.wordWrap} defaultBranch=${v5.branch}; nilai lain utuh (fontSize=${v5.fontSize}, mcp.port=${v5.mcpPort})`,
  );

  // ───────── V6: Reset Semua (konfirmasi ganda) ─────────
  const v6 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings();
      const sebelum = await X.settingsFromDisk();
      // tahap 1
      q('[data-testid="set-reset"]').click();
      await wait(220);
      const c1 = !!q('[data-testid="set-reset-c1"]');
      // batal dulu untuk membuktikan konfirmasi benar-benar menahan
      const langsungReset = (await X.settingsFromDisk()).editor.tabSize;
      q('[data-testid="set-reset-yes1"]').click();
      await wait(220);
      const c2 = !!q('[data-testid="set-reset-c2"]');
      const belumReset = (await X.settingsFromDisk()).editor.tabSize;
      q('[data-testid="set-reset-yes2"]').click();
      await wait(900);
      const sesudah = await X.settingsFromDisk();
      return JSON.stringify({
        c1, c2, langsungReset, belumReset,
        sebelum: { tabSize: sebelum.editor.tabSize, fontSize: sebelum.general.fontSize, sc: Object.keys(sebelum.shortcuts).length },
        sesudah: { tabSize: sesudah.editor.tabSize, fontSize: sesudah.general.fontSize, sc: Object.keys(sesudah.shortcuts).length },
        tema: document.documentElement.dataset.theme,
      });
    `),
  );
  check(
    'V6',
    v6.c1 &&
      v6.c2 &&
      v6.langsungReset === 8 &&
      v6.belumReset === 8 &&
      v6.sesudah.tabSize === 2 &&
      v6.sesudah.fontSize === 13 &&
      v6.sesudah.sc === 0,
    `konfirmasi 2 tahap (tahap1=${v6.c1}, tahap2=${v6.c2}); belum berubah sebelum konfirmasi akhir (tabSize tetap ${v6.belumReset}); setelah reset tabSize ${v6.sebelum.tabSize}->${v6.sesudah.tabSize}, fontSize ${v6.sebelum.fontSize}->${v6.sesudah.fontSize}, shortcut custom ${v6.sebelum.sc}->${v6.sesudah.sc}`,
  );

  // ───────── V7: bahasa UI id <-> en ─────────
  const v7 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('general');
      const bacaNav = () => qa('.set-nav-item span').map(e => e.textContent.trim());
      const idLabels = bacaNav();
      q('[data-testid="general-lang"] [data-pill="en"]').click();
      await wait(600);
      const enLabels = bacaNav();
      const diskLang = (await X.settingsFromDisk()).general.uiLang;
      q('[data-testid="general-lang"] [data-pill="id"]').click();
      await wait(500);
      const balik = bacaNav();
      return JSON.stringify({ idLabels, enLabels, balik, diskLang });
    `),
  );
  const beda = v7.idLabels.filter((x, i) => x !== v7.enLabels[i]).length;
  check(
    'V7',
    beda >= 4 &&
      v7.enLabels.includes('General') &&
      v7.idLabels.includes('Umum') &&
      v7.diskLang === 'en' &&
      v7.balik.includes('Umum'),
    `${beda} label berubah: id[${v7.idLabels.slice(0, 4).join(', ')}] -> en[${v7.enLabels.slice(0, 4).join(', ')}]; tersimpan di disk (uiLang=${v7.diskLang}) lalu dikembalikan`,
  );

  // ───────── V8: API key masked + test connection ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('models');
      const sebelum = await X.publicModels();
      const badge0 = q('[data-testid="prov-badge-gemini"]').textContent.trim();

      // simpan key dummy lewat UI (bukan panggilan langsung)
      const input = q('[data-testid="prov-key-gemini"]');
      setNativeValue(input, 'AIzaSy-DUMMY-KEY-UNTUK-UJI-1234abcd');
      await wait(260);
      q('[data-testid="prov-save-gemini"]').click();
      await wait(700);

      const sesudah = await X.publicModels();
      const badge1 = q('[data-testid="prov-badge-gemini"]').textContent.trim();
      const g = sesudah.find(x => x.provider === 'gemini');

      // test connection dengan key dummy -> harus gagal dengan pesan ramah
      q('[data-testid="prov-test-gemini"]').click();
      await wait(9000);
      const hasil = q('[data-testid="prov-result-gemini"]')?.textContent?.trim() ?? '(tidak ada hasil)';

      return JSON.stringify({
        hasKeyAwal: sebelum.find(x => x.provider === 'gemini')?.hasKey ?? null,
        badge0, badge1,
        hasKey: g?.hasKey, preview: g?.preview,
        hasil,
        // BUKTI KEAMANAN: key utuh tidak pernah ada di objek yang diterima UI
        adaKeyUtuh: JSON.stringify(sesudah).includes('DUMMY-KEY-UNTUK-UJI'),
        logo: !!q('[data-provider="gemini"] svg[aria-label="Google Gemini"]'),
      });
    `, 40000),
  );
  check(
    'V8',
    v8.hasKeyAwal === false &&
      v8.hasKey === true &&
      v8.preview.includes('…') &&
      !v8.adaKeyUtuh &&
      v8.logo &&
      /✕|✓/.test(v8.hasil),
    `hasKey ${v8.hasKeyAwal} -> ${v8.hasKey}, badge "${v8.badge0}" -> "${v8.badge1}", mask="${v8.preview}", key utuh bocor ke frontend=${v8.adaKeyUtuh}, logo brand=${v8.logo}; test connection: ${v8.hasil.slice(0, 92)}`,
  );

  // ───────── V8b: secrets.json tidak menyimpan plaintext ─────────
  // Dibuktikan dari Rust: file dibaca ulang oleh get_public_models (mask),
  // dan isi file dicek lewat fs_read biasa (tanpa dekripsi) untuk memastikan
  // string key tidak muncul apa adanya.
  const v8b = JSON.parse(
    await cdp.runAsync(`
      const info = S.getState().appInfo;
      const path = info.dataDir + '\\\\secrets.json';
      const r = await window.__ZEPHYR_FS__.read(path);
      const isi = r.content ?? '';
      return JSON.stringify({
        path,
        ada: isi.length > 0,
        adaPlaintext: isi.includes('DUMMY-KEY-UNTUK-UJI'),
        cuplikan: isi.slice(0, 120),
      });
    `),
  );
  check(
    'V8b',
    v8b.ada && !v8b.adaPlaintext,
    `${v8b.path}: ada=${v8b.ada}, memuat key plaintext=${v8b.adaPlaintext}; isi awal ${JSON.stringify(v8b.cuplikan.slice(0, 76))}`,
  );

  // ───────── V9: agents — deteksi CLI, start command, maxPanes ─────────
  const v9 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('agents');
      await T.getState().loadAgents();
      await wait(400);
      const kartu = qa('[data-agent]').map(e => e.dataset.agent);
      const kosong = !!q('[data-testid="agents-empty"]');
      const agents = T.getState().agents.map(a => a.id);

      // ubah start command agent pertama lewat UI
      let cmdSebelum = null, cmdSesudah = null, diskCmd = null, target = null;
      if (agents.length > 0) {
        target = agents[0];
        const inp = q('[data-testid="agent-cmd-' + target + '"]');
        cmdSebelum = inp.value;
        setNativeValue(inp, 'cmd.exe /c echo UJI-START-COMMAND');
        await wait(750);
        diskCmd = (await X.settingsFromDisk()).agents.startCommands[target];
        cmdSesudah = q('[data-testid="agent-cmd-' + target + '"]').value;
        // reset ke default
        q('[data-testid="agent-cmd-reset-' + target + '"]').click();
        await wait(600);
      }
      const setelahReset = (await X.settingsFromDisk()).agents.startCommands[target] ?? null;

      // maxPanes slider
      const slider = q('[data-testid="agents-maxpanes-box"]');
      setNativeValue(slider, '3');
      await wait(650);
      const maxDisk = (await X.settingsFromDisk()).agents.maxPanes;
      const maxStore = T.getState().maxPanes();
      return JSON.stringify({ kartu, kosong, agents, target, cmdSebelum, cmdSesudah, diskCmd, setelahReset, maxDisk, maxStore });
    `),
  );
  check(
    'V9',
    v9.agents.length === v9.kartu.length &&
      (v9.agents.length > 0 ? !v9.kosong : v9.kosong) &&
      (v9.agents.length === 0 ||
        (v9.diskCmd?.join(' ') === 'cmd.exe /c echo UJI-START-COMMAND' && v9.setelahReset === null)) &&
      v9.maxDisk === 3 &&
      v9.maxStore === 3,
    `CLI terdeteksi [${v9.agents.join(', ')}] = ${v9.kartu.length} kartu; start command ${v9.target}: "${v9.cmdSebelum}" -> disk ${JSON.stringify(v9.diskCmd)} -> reset ke default (${v9.setelahReset}); maxPanes disk=${v9.maxDisk} store=${v9.maxStore}`,
  );

  // ───────── V10: panel MCP (fase 11 menggantikan panel palsu fase 08) ─────────
  // Fase 08 dulu hanya menyimpan pilihan & selalu menampilkan "Berhenti".
  // Sejak fase 11 panel ini mengendalikan server sungguhan, jadi yang diuji
  // di sini: switch benar-benar menyalakan server, token datang dari mcp.json
  // (bukan settings.json), dan daftar CLI lengkap. Detail protokolnya diuji
  // di verify11.mjs.
  const v10 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('mcp');
      const errSebelum = window.__ZEPHYR_ERRORS__.length;
      const M = window.__ZEPHYR_MCP__;
      const tungguMcp = async () => {
        const batas = Date.now() + 20000;
        while (M.store.getState().busy && Date.now() < batas) await wait(80);
        await wait(150);
      };
      // Pastikan mulai dari kondisi mati.
      await M.toggle(false);
      await tungguMcp();
      const statusMati = q('[data-testid="mcp-status"]');
      const mati = { running: statusMati?.dataset.running, teks: statusMati?.textContent?.trim() };

      q('[data-testid="mcp-enable"]').click();
      await tungguMcp();
      await wait(400);
      await M.refresh();
      // Ambil NILAI-nya sekarang, bukan simpan node: React mengganti elemen
      // saat re-render, jadi membaca dataset di akhir memberi status terakhir
      // (sudah dimatikan lagi) — bukan status saat hidup.
      const elHidup = q('[data-testid="mcp-status"]');
      const hidupRunning = elHidup?.dataset.running ?? null;
      const hidupTeks = elHidup?.textContent?.trim() ?? null;
      const st = M.status();

      // Pilih satu CLI: pilihan wajib tersimpan ke settings.json.
      q('[data-testid="mcp-cli-opencode"]').click();
      await wait(700);
      const disk = (await X.settingsFromDisk()).mcp;

      // Kembalikan ke kondisi mati supaya uji lain tidak terpengaruh.
      q('[data-testid="mcp-enable"]').click();
      await tungguMcp();
      await wait(300);
      M.setChecked([]);

      return JSON.stringify({
        errBaru: window.__ZEPHYR_ERRORS__.length - errSebelum,
        mati,
        hidupRunning,
        hidupTeks,
        port: st?.port, tokenLen: (st?.token || '').length,
        enabledDisk: disk.enabled, writeToCli: disk.writeToCli,
        cli: qa('[data-testid^="mcp-cli-"]').length,
        tokenDiSettings: (disk.token || ''),
        akhirRunning: q('[data-testid="mcp-status"]')?.dataset.running,
      });
    `, 60000),
  );
  check(
    'V10',
    v10.errBaru === 0 &&
      v10.mati.running === '0' &&
      v10.hidupRunning === '1' &&
      /Running/.test(v10.hidupTeks) &&
      v10.port === 9222 &&
      v10.tokenLen === 32 &&
      v10.cli === 7 &&
      v10.writeToCli.includes('opencode') &&
      v10.tokenDiSettings === '' &&
      v10.akhirRunning === '0',
    `switch OFF→"${v10.mati.teks}", ON→"${v10.hidupTeks}" (server nyata di port ${v10.port}); token ${v10.tokenLen} char dari mcp.json dan TIDAK ikut ke settings.json; ${v10.cli} CLI checkbox, pilihan tersimpan (${v10.writeToCli.join(', ')}); dimatikan lagi di akhir; console error baru=${v10.errBaru}`,
  );


  // ───────── V11: extensions enable/disable ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('extensions');
      const kartu = qa('[data-ext]').map(e => e.dataset.ext);
      const semuaOnAwal = qa('[data-ext] [role="switch"]').every(b => b.getAttribute('aria-checked') === 'true');
      q('[data-testid="ext-lang-rust"]').click();
      await wait(650);
      const disk = (await X.settingsFromDisk()).extensions.enabled;
      const rustOff = q('[data-testid="ext-lang-rust"]').getAttribute('aria-checked') === 'false';
      return JSON.stringify({ kartu, semuaOnAwal, disk, rustOff });
    `),
  );
  check(
    'V11',
    v11.kartu.length === 6 &&
      v11.semuaOnAwal &&
      v11.rustOff &&
      !v11.disk.includes('lang-rust') &&
      v11.disk.includes('lang-web'),
    `${v11.kartu.length} ekstensi bawaan, awalnya semua aktif=${v11.semuaOnAwal}; mematikan lang-rust -> UI off=${v11.rustOff}, disk enabled=[${v11.disk.join(', ')}]`,
  );

  // ───────── V12: Source Control field tersimpan ─────────
  const v12 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('scm');
      const setText = async (testid, val) => {
        setNativeValue(q('[data-testid="' + testid + '"]'), val);
        await wait(520);
      };
      await setText('scm-name', 'ShinRyu04');
      await setText('scm-email', 'muhkhalid039@gmail.com');
      await setText('scm-branch', 'main');
      q('[data-testid="scm-pull"]').click();
      await wait(600);
      const disk = (await X.settingsFromDisk()).git;
      // muat ulang halaman settings dari disk untuk membuktikan bukan cuma state
      await S.getState().reloadSettings();
      await wait(400);
      const uiSetelahReload = {
        name: q('[data-testid="scm-name"]').value,
        email: q('[data-testid="scm-email"]').value,
        branch: q('[data-testid="scm-branch"]').value,
      };
      return JSON.stringify({ disk, uiSetelahReload });
    `),
  );
  check(
    'V12',
    v12.disk.userName === 'ShinRyu04' &&
      v12.disk.userEmail === 'muhkhalid039@gmail.com' &&
      v12.disk.defaultBranch === 'main' &&
      v12.disk.pullBeforePush === false &&
      v12.uiSetelahReload.name === 'ShinRyu04',
    `git di disk: userName=${v12.disk.userName}, userEmail=${v12.disk.userEmail}, defaultBranch=${v12.disk.defaultBranch}, pullBeforePush=${v12.disk.pullBeforePush}; UI setelah reloadSettings tetap "${v12.uiSetelahReload.name}"`,
  );

  // ───────── V13: zoom + About + tanpa console error ─────────
  const v13 = JSON.parse(
    await cdp.runAsync(`
      await bukaSettings('about');
      const baris = qa('[data-testid="about-table"] tr').length;
      const versi = qa('[data-testid="about-table"] .about-v code')[0]?.textContent ?? '';
      const dataDir = qa('[data-testid="about-table"] .about-v code')[2]?.textContent ?? '';

      // zoom lewat shortcut (Ctrl+= / Ctrl+0) -> font root berubah
      const rootFont = () => getComputedStyle(document.documentElement).fontSize;
      const zoomAwal = rootFont();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true }));
      await wait(600);
      const zoomNaik = rootFont();
      const diskZoom = (await X.settingsFromDisk()).general.zoom;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true, cancelable: true }));
      await wait(600);
      const zoomBalik = rootFont();

      // bersihkan: kembalikan semua ke default + tutup halaman Settings.
      // WAJIB tutup: harness fase 02/03 memeriksa empty-state editor, dan
      // halaman Settings yang masih terbuka menutupinya (F03-V0 gagal).
      await X.resetAll();
      await X.setKey('gemini', '');
      await S.getState().reloadSettings();
      S.getState().setSettingsOpen(false);
      S.getState().setActivity('explorer');
      await wait(500);
      return JSON.stringify({
        baris, versi, dataDir, zoomAwal, zoomNaik, zoomBalik, diskZoom,
        errors: window.__ZEPHYR_ERRORS__,
        keySisa: (await X.publicModels()).find(x => x.provider === 'gemini')?.hasKey,
      });
    `),
  );
  check(
    'V13',
    // Fase 11 menambah satu baris "Automation" (MCP 9222) → 9 baris.
    v13.baris === 9 &&
      /^\d+\.\d+\.\d+$/.test(v13.versi) &&
      /zephyr/i.test(v13.dataDir) &&
      v13.zoomAwal === '16px' &&
      v13.zoomNaik === '18px' &&
      v13.diskZoom === 110 &&
      v13.zoomBalik === '16px' &&
      v13.errors.length === 0 &&
      v13.keySisa === false,
    `About ${v13.baris} baris (versi ${v13.versi}, data ${v13.dataDir}); zoom ${v13.zoomAwal} -> ${v13.zoomNaik} (disk ${v13.diskZoom}%) -> reset ${v13.zoomBalik}; bersih (key uji dihapus=${v13.keySisa === false}); console error: ${v13.errors.length === 0 ? 'tidak ada' : JSON.stringify(v13.errors)}`,
  );

  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error('verify08 error:', e.message ?? e);
  process.exitCode = 2;
});
