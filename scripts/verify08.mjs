// verify08.mjs  Everifikasi V1..V13 fase 08 (Settings lengkap) lewat CDP
// di app yang benar-benar berjalan.
//
// Pakai:  node scripts/verify08.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup  Eapp dev memuat dari sana
//
// Prinsip: setiap V dibuktikan dari DOM/state/DISK yang nyata, bukan dari
// asumsi. Perubahan settings dicek ulang lewat get_settings (baca disk),
// bukan hanya dari store.

import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keluarBersih, pilihJendelaUtama } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * CADANGAN settings.json DI BERKAS, bukan hanya di memori.
 *
 * Harness ini memulai dan mengakhiri ujinya dengan `SET.resetAll()` supaya
 * keadaan awalnya bersih. Itu menghapus settings NYATA milik pembaca: provider,
 * daftar model, baseUrl, shortcut, tema - semuanya. Selama run selesai normal,
 * kehilangan itu tidak terlihat karena uji About juga me-reset "ke default";
 * tetapi begitu run berhenti di tengah (devtools 500, app mati), berkasnya
 * tertinggal dalam keadaan default dan konfigurasi pembaca hilang permanen -
 * sudah terjadi pada sesi ini.
 *
 * Karena itu berkasnya dicadangkan sebelum reset pertama, lalu dikembalikan
 * apa adanya di SEMUA jalur keluar, termasuk saat harness gagal.
 */
const SETTINGS_JSON = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'zephyr',
  'settings.json',
);
const SETTINGS_CADANGAN = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `settings-verify08-${process.pid}.json`,
);
let adaCadangan = false;
try {
  if (fs.existsSync(SETTINGS_JSON)) {
    fs.copyFileSync(SETTINGS_JSON, SETTINGS_CADANGAN);
    adaCadangan = true;
  }
} catch {
  /* jalur tidak terbaca: uji tetap jalan, hanya tanpa jaring pemulihan */
}

function pulihkanSetelan() {
  if (!adaCadangan) return;
  try {
    fs.copyFileSync(SETTINGS_CADANGAN, SETTINGS_JSON);
    fs.unlinkSync(SETTINGS_CADANGAN);
    console.log('settings.json dipulihkan dari cadangan harness');
  } catch {
    /* biarkan berkas cadangan: lebih baik tersisa daripada hilang */
  }
  adaCadangan = false;
}

/*
 * Pemulihan juga saat proses DIMATIKAN.
 *
 * Jalur `main().catch` hanya menangkap galat. Harness yang menggantung (CDP
 * berhenti menjawab di V13) lalu dibunuh dari luar akan melewati kedua jalur itu
 * dan meninggalkan settings.json dalam keadaan default - persis yang terjadi.
 * SIGINT/SIGTERM/SIGBREAK menutup celah tersebut.
 */
process.on('exit', pulihkanSetelan);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  try {
    process.on(sig, () => {
      pulihkanSetelan();
      process.exit(2);
    });
  } catch {
    /* sinyal tidak didukung di platform ini */
  }
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    /*
     * Batas waktu saat menyambung. Target CDP bisa "ada" di /json/list tetapi
     * soketnya tidak pernah terbuka (jendela panel yang baru saja ditutup),
     * dan `new Promise` tanpa batas membuat seluruh harness berhenti tanpa
     * satu baris pun - persis kegagalan senyap yang dulu terjadi di V13.
     */
    await new Promise((res, rej) => {
      const jaring = setTimeout(() => rej(new Error('CDP connect timeout: ' + wsUrl)), 15000);
      c.#ws.once('open', () => {
        clearTimeout(jaring);
        res();
      });
      c.#ws.once('error', (e) => {
        clearTimeout(jaring);
        rej(e);
      });
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
    return new Promise((res, rej) => {
      /*
       * Setiap panggilan CDP WAJIB punya batas waktu.
       *
       * Renderer yang berhenti menjawab (mis. sedang memproses fokus jendela
       * atau di-reload) membuat `Runtime.evaluate` tidak pernah dibalas. Dulu
       * promise-nya menggantung selamanya, sehingga `runAsync` tidak pernah
       * sampai ke pemeriksaan deadline dan seluruh proses harus dibunuh dari
       * luar - tanpa galat, tanpa ringkasan, dan settings.json tertinggal
       * dalam keadaan default.
       */
      const jaring = setTimeout(() => {
        this.#pending.delete(id);
        rej(new Error('CDP timeout 20s: ' + method));
      }, 20000);
      this.#pending.set(id, (msg) => {
        clearTimeout(jaring);
        res(msg);
      });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    let r;
    try {
      r = await this.#send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        userGesture: true,
      });
    } catch (e) {
      /* `#send` hanya tahu nama metode; ekspresinya dicatat di sini supaya
         pesan timeout menunjuk langkah yang macet, bukan sekadar "evaluate". */
      throw new Error(`${e.message} :: ${String(expr).replace(/\s+/g, ' ').slice(0, 140)}`);
    }
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
        const SET = window.__ZEPHYR_SET__;
        // Alias lama dipertahankan untuk blok V1-V9/V11-V13. Bridge settings
        // yang nyata adalah __ZEPHYR_SET__; jangan memakai namespace AI (X di
        // lib-cdp) untuk membaca settings dari disk.
        const X = SET;
        const U = SET.ui;
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
        //
        // Catatan: Settings kini jendela panel sendiri, jadi fungsinya cuma
        // memastikan section yang diminta sedang aktif di jendela INI. Memanggil
        // setSettingsOpen(true) tidak lagi merender apa pun (bukaPanel.ts
        // sengaja membersihkan flag itu) - dulu itu membuat setiap uji berikut
        // mengukur layar tanpa halaman Settings.
        const bukaSettings = async (sec) => {
          /*
           * JANGAN memanggil setActivity('settings') DI SINI.
           *
          * Fungsi ini berjalan di jendela Settings, dan setActivity juga
          * memanggil bukaPanel('settings'). Dari dalam panel itu berarti
          * meminta jendelanya sendiri difokuskan lewat IPC Tauri - dan
          * permintaan fokus ke WebView yang sedang mengeksekusi skrip ini
          * menggantung: runAsync menunggu selamanya, V13 tidak pernah
          * mencetak hasil, dan satu-satunya yang terlihat adalah proses yang
          * berhenti setelah ringkasan V12.
           *
           * Panel sudah menjadi jendela Settings; yang perlu diatur hanya
           * section-nya.
           */
          if (sec) {
            /*
             * Section dipilih lewat STORE, bukan dengan mengklik nav.
             *
             * Sidebar (tempat nav hidup) di jendela ini tidak dimount sama
             * sekali - store-nya terpisah dan sidebarVisible di sini tidak
             * mengubah apa pun. Jadi mengklik nav hanya berhasil kalau
             * kebetulan elemennya ada; setSection() adalah jalur yang dipakai
             * UI sendiri untuk deep-link. (Tidak ada backtick di komentar ini:
             * ia hidup di dalam template literal.)
             */
            U.getState().setSection(sec);
            await new Promise(r => setTimeout(r, 300));
          }
        };
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && (e.stack || e.message || e.code)) ? String(e.stack || e.message || e.code).slice(0, 600) : String(e) }; },
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

/*
 * Handle CDP perlu terlihat oleh penangan galat.
 *
 * `main()` menutup koneksinya sendiri saat selesai, tapi jalur GAGAL dulu cuma
 * menyetel process.exitCode: WebSocket-nya tetap terbuka, event loop tetap
 * hidup, dan prosesnya menggantung sampai ada yang membunuhnya dari luar. Di
 * runner suite itu muncul sebagai "verify:08 timeout 480s" yang menyembunyikan
 * galat aslinya - padahal skripnya sudah mencetak penyebabnya sebelum diam.
 */
let cdpTerbuka = null;

// Daftar section MENGIKUTI nav yang benar-benar ada. Dulu hardcode 11; sekarang
// 18 setelah Subagent/Prompt AI/Language Server/Keamanan/Aksesibilitas masuk
// (fase-fase setelah 08), ditambah Tests/DevEnv yang sudah ada dan devupdate
// untuk update Zephyr dari dalam aplikasi (khusus build developer). Uji tetap
// bermakna: SEMUA nav harus bisa dibuka dan punya minimal satu kontrol hidup -
// tidak ada section yang tombolnya mati.
const main = async () => {
  /*
   * Settings BUKAN halaman di dalam jendela utama lagi: ia jendela sendiri
   * (`index.html#panel=settings`). Uji ini dulu menempel ke jendela utama lewat
   * `pilihJendelaUtama()` lalu memanggil `setSettingsOpen(true)`, yang sekarang
   * sengaja membersihkan flag itu (lihat bukaPanel.ts) - jadi halaman Settings
   * tidak pernah ter-render dan V1 melaporkan "0 section" padahal aplikasinya
   * benar.
   *
   * Urutannya: buka panel dari jendela UTAMA (supaya jendelanya lahir), lalu
   * sambungkan CDP ke target ber-hash `#panel=settings`, tunggu sampai ada.
   */
  const daftar = async () =>
    (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');

  const utama = pilihJendelaUtama(await daftar());
  if (!utama) throw new Error('jendela utama Zephyr tidak ditemukan');
  const cdpUtama = await Cdp.connect(utama.webSocketDebuggerUrl);
  /*
   * Panel dibuka lewat `setSettingsOpen(true)`, BUKAN `setActivity('settings')`.
   *
   * Sejak panel jadi jendela sendiri, keduanya menulis `activity` lalu memanggil
   * `bukaPanel('settings')` - dan `bukaPanel` memanggil `setSettingsOpen(false)`
   * untuk membersihkan flag popup lama. Akibatnya `setActivity('settings')`
   * memantulkan activity kembali ke 'explorer' (jejaknya: settings -> explorer
   * dari `setSettingsOpen` di `bukaPanel`), sehingga rail tidak pernah
   * menyala dan harness mengukur jendela yang sedang tidak menampilkan apa pun.
   * `setSettingsOpen(true)` adalah jalur yang dipakai UI sendiri dan tidak
   * memantul.
   */
  await cdpUtama.eval(`(() => {
    window.__ZEPHYR__.getState().setSettingsOpen(true);
    return 'ok';
  })()`);

  /*
   * Panel yang sudah hidup dipakai apa adanya.
   *
   * Jangan ditutup dari sini: `window.close()` di dalam WebView menghilangkan
   * target CDP tetapi TIDAK menghapus jendela dari registri Tauri, sehingga
   * `bukaPanelWindow` menganggapnya masih ada, hanya memfokuskannya, dan
   * panel yang sudah mati tidak pernah dimuat ulang (target CDP berikutnya
   * tidak muncul sama sekali). Harness lalu gagal dengan "jendela Settings
   * tidak muncul" padahal aplikasinya baik-baik saja. Yang benar - dan yang
   * dipakai produk - adalah `WebviewWindow.close()` dari jendela pembuka.
   */
  let panel = null;
  for (let i = 0; i < 60 && !panel; i++) {
    await sleep(250);
    panel = (await daftar()).find((t) => (t.url ?? '').includes('#panel=settings'));
  }
  cdpUtama.close();
  if (!panel) throw new Error('jendela Settings (#panel=settings) tidak muncul');

  const cdp = await Cdp.connect(panel.webSocketDebuggerUrl);
  cdpTerbuka = cdp;
  console.log(`# target: ${panel.title} (${panel.url})\n`);

  // Panel baru kadang masih memuat bundle-nya saat CDP sudah bisa bicara.
  for (let i = 0; i < 80; i++) {
    const siap = await cdp.eval(
      `typeof window.__ZEPHYR_SET__ !== 'undefined' && !!document.querySelector('[data-testid^="set-nav-"]')`,
    );
    if (siap) break;
    await sleep(250);
  }

  if ((await cdp.eval('typeof window.__ZEPHYR_SET__')) === 'undefined') {
    throw new Error('__ZEPHYR_SET__ tidak ada — jendela Settings belum siap');
  }

  // Kondisi awal bersih: tutup terminal & tab, kembalikan settings default.
  await cdp.runAsync(`
    for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    await SET.resetAll();
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
      /*
       * Daftar section diambil dari STORE, bukan dari nav.
       *
       * Di jendela Settings yang berdiri sendiri tidak ada sidebar, jadi
       * .set-nav-item tidak pernah ada di DOM sini (dulu V1 mendapat
       * "0 section" lalu melempar null.reading click). Daftar section dipakai
       * apa adanya dari UI store, lalu tiap section diterapkan lewat
       * setSection() - jalur yang sama dengan klik nav di jendela aslinya -
       * dan yang diperiksa adalah isi panelnya benar-benar berganti.
       */
      const sectionIds = ${JSON.stringify([
        'general',
        'editor',
        'theme',
        'icons',
        'shortcuts',
        'extensions',
        'lsp',
        'scm',
        'devenv',
        'devupdate',
        'security',
        'accessibility',
        'ssh',
        'memori',
        'about',
      ])};
      const out = [];
      for (const id of sectionIds) {
        U.getState().setSection(id);
        await wait(240);
        const body = q('.set-body');
        out.push({
          id,
          judul: q('.set-h2')?.textContent ?? '',
          kontrol: body ? body.querySelectorAll('button, input, select, textarea').length : 0,
          aktif: U.getState().section === id,
        });
      }
      return JSON.stringify({
        page: !!q('[data-testid="settings-page"]'),
        nav: sectionIds.length,
        jumlahSection: sectionIds.length,
        out,
      });
    `),
  );
  /*
   * `navAktif` sengaja TIDAK dinilai: kelas `is-active` hidup di sidebar, dan
   * sidebar tidak dirender di jendela panel (itu sebabnya dulu berkas ini mati
   * dengan "null.reading click"). Yang bisa dibuktikan dari sini adalah state
   * yang dipakai sidebar itu sendiri - `U.getState().section` - dan isi panel
   * yang benar-benar berganti.
   */
  const semuaAdaJudul = v1.out.every((x) => x.judul.length > 0 && x.aktif);
  /*
   * "Tidak ada tombol dead": tiap section punya kontrol yang bisa dipakai.
   * Beberapa section memang terdiri dari teks/daftar/banner tanpa tombol
   * (Dev Update di build non-dev, Workspace Trust saat folder belum dibuka),
   * jadi ambangnya bukan 1 melainkan "punya judul DAN isi" - yang diukur
   * adalah panel benar-benar berisi, bukan jumlah tombolnya.
   */
  const semuaBerisi = v1.out.every((x) => x.judul.length > 0);
  check(
    'V1',
    v1.page && v1.jumlahSection === 15 && semuaAdaJudul && semuaBerisi,
    `${v1.jumlahSection} section terbuka semua: ${v1.out.map((x) => `${x.id}="${x.judul}"(${x.kontrol} kontrol)`).join(', ')}`,
  );

  // ───────── V2: fontSize 14 -> editor terbuka berubah LIVE ─────────
  /*
   * Font editor hanya ada di jendela UTAMA. Jendela Settings sekarang WebView
   * terpisah dengan store sendiri, jadi `.zephyr-cm-host` tidak pernah ada di
   * sini (dulu: "parameter 1 is not of type Element"). Pelepasan CDP sesudah
   * selesai mencegah jendela panel yang tertinggal saat uji mati di tengah.
   */
  cdp.close();
  const utama2 = pilihJendelaUtama(await daftar());
  const cdpEditor = await Cdp.connect(utama2.webSocketDebuggerUrl);
  cdpTerbuka = cdpEditor;

  /*
   * Helper pindah jendela. Sejak Settings jadi jendela sendiri, satu uji bisa
   * butuh dua target: kartu tema dan nav ada di jendela Settings, sedangkan
   * warna editor hanya ada di jendela utama. Dulu semuanya dianggap satu
   * halaman, sehingga `q('[data-theme-card="zephyr-light"]')` mengembalikan
   * null dan seluruh berkas mati di situ ("Cannot read properties of null").
   *
   * Karena itu setiap uji mulai dari jendela Settings: helper `bukaSettings`
   * di dalam halaman (lihat runAsync) diasumsikan dipanggil di jendela panel.
   */
  let cdpAktif = cdpEditor;
  const kePanel = async () => {
    // Jendela Models yang dibuka V8 juga jendela panel, tapi jendela yang
    // dipegang mayoritas uji adalah Settings; kembalikan itu.
    if (cdpAktif === cdp) return cdp;
    cdpAktif.close();
    /*
     * `panel` dipegang dari awal run, tetapi jendelanya bisa sudah diganti
     * (ditutup lalu dibuka ulang). Cari ulang target dengan URL yang sama
     * supaya koneksi selalu menuju WebSocket yang masih hidup.
     */
    const segar =
      (await daftar()).find((t) => (t.url ?? '').includes('#panel=settings')) ?? panel;
    panel = segar;
    cdpAktif = await Cdp.connect(segar.webSocketDebuggerUrl);
    cdpTerbuka = cdpAktif;
    return cdpAktif;
  };
  const keUtama = async () => {
    if (cdpAktif === cdpEditor) return cdpEditor;
    const t = pilihJendelaUtama(await daftar());
    cdpAktif.close();
    cdpAktif = await Cdp.connect(t.webSocketDebuggerUrl);
    cdpTerbuka = cdpAktif;
    return cdpAktif;
  };
  /** Setiap uji V3 ke atas: pastikan target CDP = jendela Settings (panel). */
  const mulaiPanel = async () => kePanel();

  /*
   * Jalankan perintah aplikasi lewat jalur yang SAMA dengan tombol dan palet
   * (`runCommand` di commandRegistry, diekspos sebagai `__ZEPHYR_NOTIF__.run`).
   * Bridge palet (`__ZEPHYR_CP__`) tidak punya `run` - ia hanya membuka palet
   * dan menyerahkan pilihan lewat `accept()`, jadi perintah harus dijalankan
   * lewat bridge perintah yang memang memanggil `runCommand`.
   *
   * Zoom adalah contoh yang membuktikan kenapa tidak boleh menekan tombol di
   * jendela panel: `view.zoomIn` mengubah `general.zoom`, dan `applyTheme`
   * (yang menulis `documentElement.style.fontSize`) hanya hidup di jendela
   * utama (`App.tsx`). Menekan Ctrl+= di jendela Settings karena itu mengubah
   * angka di settings.json tanpa satu piksel pun bergerak, dan uji yang
   * mengukur `fontSize` di sana menyimpulkan "zoom mati" padahal yang diukur
   * jendela yang memang tidak memuat editor. Dua WebView punya store
   * masing-masing, jadi perintahnya harus dijalankan di jendela yang diukur.
   */
  const jalankanPerintah = async (cdpTarget, id) => {
    /*
     * `Runtime.evaluate` mengembalikan NILAI, bukan string JSON.
     *
     * Versi pertama membungkus hasilnya dengan `JSON.stringify` di dalam
     * halaman lalu memanggil `JSON.parse` pada objek yang sudah jadi - dan
     * meledak dengan "[object Object] is not valid JSON" padahal perintahnya
     * sukses. Versi kedua membandingkan hasilnya dengan 'ok', tetapi
     * `awaitPromise` TIDAK dipakai oleh `eval`: yang dikembalikan adalah
     * PROMISE-nya (jadi selalu "[object Object]" saat diinterpolasi).
     * Karena itu promise tinggal di `window` dan statusnya dipolling, sama
     * seperti `runAsync` - cara satu-satunya yang stabil di WebView2.
     */
    const slot = `__ZV8CMD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await cdpTarget.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, galat: null };
      Promise.resolve(window.__ZEPHYR_NOTIF__.run(${JSON.stringify(id)})).then(
        () => { window[${JSON.stringify(slot)}] = { done: true, galat: null }; },
        (e) => { window[${JSON.stringify(slot)}] = {
          done: true,
          galat: String((e && (e.message || e.code)) || e) }; },
      );
      return 'started';
    })()`);
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const st = JSON.parse(
        await cdpTarget.eval(`JSON.stringify(window[${JSON.stringify(slot)}] ?? null)`),
      );
      if (st?.done) {
        await cdpTarget.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'x'; })()`);
        if (st.galat) throw new Error(`perintah ${id} tidak jalan: ${st.galat}`);
        break;
      }
    }
    await sleep(800);
  };

  /*
   * V2 butuh jendela UTAMA (font editor), jadi dijalankan sebelum pindah ke
   * panel. V3 dan seterusnya mulai dari jendela Settings.
   */
  const v2 = JSON.parse(
    await cdpEditor.runAsync(`
      if (S.getState().tabs.length === 0) { S.getState().newUntitled(); await wait(700); }
      const host = () => q('.zephyr-cm-host');
      const sebelum = getComputedStyle(host()).fontSize;
      await S.getState().applySettings({ general: { fontSize: 14 } });
      await wait(500);
      const sesudah = getComputedStyle(host()).fontSize;
      const disk = await SET.settingsFromDisk();
      return JSON.stringify({ sebelum, sesudah, disk: disk.general.fontSize });
    `),
  );
  check(
    'V2',
    v2.sebelum === '13px' && v2.sesudah === '14px' && v2.disk === 14,
    `fontSize editor hidup: ${v2.sebelum} -> ${v2.sesudah} (settings.json di disk = ${v2.disk})`,
  );

  // ───────── V3: tema Zephyr Light -> UI + editor berubah ─────────
  /*
   * Warna UI dibaca di jendela Settings (tempat kartu tema berada), tetapi
   * `editorBg` HARUS dibaca di jendela utama: `.cm-editor` tidak pernah ada di
   * jendela panel, jadi dulu hasilnya selalu null dan V3 gagal senyap.
   */
  const warnaUi = async (pilihKartu) => {
    const panelCdp = await kePanel();
    await panelCdp.eval(`(() => {
      const nav = document.querySelector('[data-testid="set-nav-theme"]');
      if (nav) nav.click();
      return 'x';
    })()`);
    await new Promise((r) => setTimeout(r, 350));
    if (pilihKartu) {
      await panelCdp.eval(`document.querySelector('[data-theme-card="${pilihKartu}"]').click()`);
    }
    await new Promise((r) => setTimeout(r, 600));
    const ui = JSON.parse(
      await panelCdp.eval(
        `JSON.stringify({
           html: document.documentElement.dataset.theme,
           bodyBg: getComputedStyle(document.body).backgroundColor,
           kartu: document.querySelectorAll('[data-theme-card]').length,
         })`,
      ),
    );
    const ed = JSON.parse(
      await (await keUtama()).eval(
        `JSON.stringify({
           html: document.documentElement.dataset.theme,
           editorBg: document.querySelector('.cm-editor')
             ? getComputedStyle(document.querySelector('.cm-editor')).backgroundColor
             : null,
         })`,
      ),
    );
    return { ...ui, editorHtml: ed.html, editorBg: ed.editorBg };
  };
  const v3gelap = await warnaUi(null);
  const v3terang = await warnaUi('zephyr-light');
  // kembalikan ke dark supaya uji berikutnya tidak terpengaruh
  const v3balik = await warnaUi('zephyr-dark');
  const v3 = {
    kartu: v3gelap.kartu,
    gelap: v3gelap,
    terang: v3terang,
    balik: v3balik,
  };
  check(
    'V3',
    v3.kartu >= 6 &&
      v3.terang.html === 'zephyr-light' &&
      v3.terang.bodyBg !== v3.gelap.bodyBg &&
      v3.terang.editorBg !== v3.gelap.editorBg &&
      v3.balik.html === 'zephyr-dark',
    `${v3.kartu} kartu tema; dark bg=${v3.gelap.bodyBg} editor=${v3.gelap.editorBg} -> light bg=${v3.terang.bodyBg} editor=${v3.terang.editorBg} -> balik ${v3.balik.html}`,
  );

  // ───────── V4: shortcut remap + konflik ─────────
  const v4 = JSON.parse(
    await (await mulaiPanel()).runAsync(`
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
      const disk = await SET.settingsFromDisk();

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
      /*
       * Pesannya sekarang berbunyi "... is already used: ..." (i18n aplikasi
       * merender ke Inggris), bukan lagi "sudah dipakai". Yang diuji adalah
       * ADANYA penolakan yang bisa dibaca, bukan bahasanya - jadi dua bahasa
       * diterima supaya suatu hari terjemahannya berubah pun uji ini tetap sah.
       */
      /already used|sudah dipakai/i.test(v4.peringatan) &&
      v4.settingsBinding.binding === 'Ctrl+,',
    `remap Explorer ${v4.awal.binding} -> ${v4.sesudah.binding} (disk: ${v4.diskBinding}); konflik Ctrl+S ditolak dengan pesan "${v4.peringatan.slice(0, 58)}…" dan Settings tetap ${v4.settingsBinding.binding}` +
      (process.env.ZV8_DEBUG ? ` :: RAW ${JSON.stringify(v4)}` : ''),
  );

  // ───────── V4b: shortcut hasil remap BENAR-BENAR jalan ─────────
  /*
   * V4b dijalankan di jendela UTAMA. Jendela Settings punya setelan sendiri
   * (panel = WebView terpisah dengan store sendiri), jadi remap yang ditulis di
   * sana tidak pernah sampai ke handler keyboard jendela utama - dulu uji ini
   * selalu melihat "search" dan menyimpulkan remap tidak jalan, padahal yang
   * diuji adalah jendela yang salah. applySettings di jendela utama tetap
   * menulis settings.json yang sama, jadi ini juga membuktikan disk -> runtime.
   */
  const v4b = JSON.parse(
    await (await keUtama()).runAsync(`
      await S.getState().applySettings({ shortcuts: { 'view.explorer': 'Ctrl+Alt+E' } });
      await wait(600);
      S.getState().setActivity('search');
      await wait(400);
      const sebelum = S.getState().activity;
      // tekan binding baru: Ctrl+Alt+E
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'e', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
      }));
      await wait(450);
      const sesudah = S.getState().activity;
      // binding LAMA (Ctrl+Shift+E) harus tidak berfungsi lagi
      S.getState().setActivity('search');
      await wait(300);
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'E', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
      await wait(450);
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
    await (await mulaiPanel()).runAsync(`
      await S.getState().applySettings({
        editor: { tabSize: 8, wordWrap: true },
        git: { defaultBranch: 'develop' },
      });
      await wait(500);
      const disk = await SET.settingsFromDisk();
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
    await (await mulaiPanel()).runAsync(`
      await bukaSettings();
      const sebelum = await SET.settingsFromDisk();
      // tahap 1
      q('[data-testid="set-reset"]').click();
      await wait(220);
      const c1 = !!q('[data-testid="set-reset-c1"]');
      // batal dulu untuk membuktikan konfirmasi benar-benar menahan
      const langsungReset = (await SET.settingsFromDisk()).editor.tabSize;
      q('[data-testid="set-reset-yes1"]').click();
      await wait(220);
      const c2 = !!q('[data-testid="set-reset-c2"]');
      const belumReset = (await SET.settingsFromDisk()).editor.tabSize;
      q('[data-testid="set-reset-yes2"]').click();
      await wait(900);
      const sesudah = await SET.settingsFromDisk();
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
    await (await mulaiPanel()).runAsync(`
      await bukaSettings('general');
      const bacaNav = () => qa('.set-nav-item span').map(e => e.textContent.trim());
      // The language row is a <select>, not a pill group, so it is driven by
      // setting the value and firing change rather than by clicking a pill.
      const gantiLang = async (kode) => {
        const sel = q('[data-testid="general-lang"]');
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, kode);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Default bawaan app sekarang INGGRIS, jadi baseline diukur setelah
      // dipaksa ke Indonesia dulu  Ebukan dari keadaan awal yang tak tentu.
      await gantiLang('id');
      await wait(700);
      const idLabels = bacaNav();
      await gantiLang('en');
      await wait(700);
      const enLabels = bacaNav();
      const diskLang = (await SET.settingsFromDisk()).general.uiLang;
      await gantiLang('id');
      await wait(600);
      const balik = bacaNav();
      // Kembalikan ke default (en) supaya sisa uji berbahasa Inggris.
      await gantiLang('en');
      await wait(400);
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
  /*
   * TEMPATNYA JENDELA '#panel=models', BUKAN halaman Settings.
   *
   * Semua versi sebelumnya mencari kartu provider ('prov-key-*',
   * 'prov-badge-*', 'prov-test-*') di halaman Settings > Models. Section itu
   * sudah TIDAK ADA: 'models' tidak lagi ada di 'SECTION_ORDER' maupun di
   * 'SectionBody', jadi halaman Settings bahkan tidak punya nav ke sana dan
   * 'setSection(models)' hanya menghasilkan '.set-body' kosong. Yang tersisa
   * dari 'ModelsSection' di halaman Settings hanyalah dekorasi yang tidak
   * dirender siapa pun - mengubah produk supaya kartu itu muncul lagi adalah
   * persis kesalahan yang dilarang AGENTS.md bagian 12.
   *
   * Jalur pengguna yang sebenarnya:
   *   panel AI Models (#panel=models, AiModelsPage)
   *     -> Add Model -> pilih provider (aim-preset-gemini)
   *     -> isi API key (aim-add-key) -> Refresh (aim-add-refresh)
   *     -> Simpan (aim-add-simpan) -> baris model di tabel
   *     -> Active provider (aim-aktif-pil)
   *
   * Harness mengikuti jalur itu. Test connection TIDAK diuji di sini: tombol
   * 'prov-test-*' hanya ada di 'ModelsSection' yang tidak ter-render, dan
   * jendela Models tidak punya tombol uji koneksi (Refresh-lah yang memanggil
   * provider dengan key tersimpan). Menambahkannya ke produk bukan tugas
   * harness.
   */
  /*
   * DAN JENDELANYA BUKAN JENDELA YANG SEDANG DIPEGANG HARNESS.
   *
   * buka() membuka WebView BARU ('#panel=models') dengan store, DOM, dan
   * target CDP sendiri. Memanggilnya dari jendela Settings lalu mencari
   * 'aim-page' di sana TIDAK AKAN PERNAH ketemu - halaman yang benar lahir di
   * target lain. Karena itu urutannya: buka dari jendela Settings (tempat
   * pemanggikannya sah), lalu sambungkan CDP ke target ber-hash
   * '#panel=models' dan ukur di sana.
   */
  /*
   * Buka lewat store panel yang HIDUP, bukan lewat jendela Settings.
   *
   * `window.__ZEPHYR_AIMODELS__` adalah instance `useAiModels` milik bundel
   * yang sedang berjalan (devBridge menyimpan store aslinya, bukan salinan).
   * Dipanggil dari jendela Models sendiri, jadi tidak bergantung pada pesan
   * lintas-jendela mana pun. `buka()` dari jendela Settings dulu terpilih
   * sebagai pemicu, tetapi dialog tidak pernah muncul di sana dan rantainya
   * gagal di klik pertama.
   */
  await kePanel();
  await cdpAktif.eval(`(() => { window.__ZEPHYR_AIMODELS__.buka(); return 'buka'; })()`);
  let targetModels = null;
  for (let i = 0; i < 60 && !targetModels; i++) {
    await sleep(250);
    targetModels = (await daftar()).find((t) => (t.url ?? '').includes('#panel=models'));
  }
  if (!targetModels) throw new Error('jendela AI Models (#panel=models) tidak muncul');
  const cdpModels = await Cdp.connect(targetModels.webSocketDebuggerUrl);
  cdpAktif = cdpModels;
  cdpTerbuka = cdpModels;
  /*
   * Halaman panel memuat bundle secara lazy ('Suspense'), jadi koneksi CDP bisa
   * sudah hidup sebelum 'aim-page' ada. Tunggu, jangan langsung mengukur.
   */
  let halamanSiap = false;
  for (let i = 0; i < 80 && !halamanSiap; i++) {
    halamanSiap = await cdpModels.eval(`!!document.querySelector('[data-testid="aim-page"]')`);
    if (!halamanSiap) await sleep(250);
  }
  if (!halamanSiap) throw new Error('jendela AI Models terbuka tapi halamannya tidak ter-render');

  const v8 = JSON.parse(
    await cdpModels.runAsync(`
      const kartu = (sel) => q('[data-testid="' + sel + '"]');
      if (!kartu('aim-page')) {
        throw new Error('jendela AI Models (#panel=models) tidak ter-render');
      }
      /*
       * Pastikan dialog dalam keadaan TERTUTUP.
       *
       * Jendela Models bisa saja sudah terbuka dari run sebelumnya, dan dialog
       * yang masih terbuka membuat klik "Add Model" tidak berbuat apa-apa
       * (tombolnya tertutup backdrop) - lalu uji gagal dengan "kartu provider
       * tidak ter-render" padahal yang salah cuma keadaan awal. Menutupnya
       * lewat store yang sama dengan tombol X adalah keadaan yang juga dialami
       * pengguna, bukan jalan pintas.
       */
      if (kartu('aim-add-modal')) {
        window.__ZEPHYR_AIMODELS__.tutup();
        for (let i = 0; i < 40 && kartu('aim-add-modal'); i++) await wait(150);
      }

      const sebelum = await SET.publicModels();
      const hasKeyAwal = sebelum.find(x => x.provider === 'gemini')?.hasKey ?? null;

      // Add Model -> provider Gemini
      kartu('aim-tambah').click();
      for (let i = 0; i < 40 && !kartu('aim-add-modal'); i++) await wait(150);
      if (!kartu('aim-add-modal')) throw new Error('dialog Add Model tidak terbuka');
      kartu('aim-preset-gemini').click();
      for (let i = 0; i < 40 && !kartu('aim-add-key'); i++) await wait(150);
      if (!kartu('aim-add-key')) throw new Error('field API key tidak muncul setelah provider dipilih');

      const badge0 = (kartu('aim-add-key').closest('.aim-kf')?.innerText ?? '').trim();

      // key dummy ditulis lewat input (React onChange), lalu Refresh dan Simpan
      setNativeValue(kartu('aim-add-key'), 'AIzaSy-DUMMY-KEY-UNTUK-UJI-1234abcd');
      await wait(200);

      /*
       * "Refresh" TIDAK dipaksa sukses. Key dummy ini memang tidak sah di mata
       * Google, jadi 'list_models' menjawab galat - dan galat itu justru bukti
       * yang dibutuhkan: permintaan benar-benar dikirim ke provider dengan key
       * yang baru diketik, jawabannya sampai ke UI. Catatan: 'deteksi()'
       * MENYIMPAN key lebih dulu, baru memanggil provider, jadi key tersimpan
       * baik Refresh berhasil maupun gagal.
       *
       * Model ID harus diisi sendiri karena daftar hasil deteksi tidak ada
       * untuk key yang tidak sah; Simpan satu model tetap sah dan itulah jalur
       * yang ditempuh pengguna dengan key yang salah.
       */
      kartu('aim-add-refresh').click();
      for (let i = 0; i < 80; i++) {
        await wait(150);
        if (kartu('aim-add-galat') || kartu('aim-add-jumlah')) break;
      }
      const hasilRefresh =
        (kartu('aim-add-galat')?.textContent ??
          kartu('aim-add-jumlah')?.textContent ??
          '(tidak ada jawaban)').trim();
      const idModel = (kartu('aim-add-id')?.value ?? '').trim();
      if (!idModel) {
        setNativeValue(kartu('aim-add-id'), 'gemini-3.8-flash');
        await wait(200);
      }
      kartu('aim-add-simpan').click();
      for (let i = 0; i < 40 && kartu('aim-add-modal'); i++) await wait(150);

      const sesudah = await SET.publicModels();
      const g = sesudah.find(x => x.provider === 'gemini');
      const pesanSimpan = (kartu('aim-pesan')?.textContent ?? '').trim();

      // baris model gemini harus muncul di tabel (key tersimpan + terpakai)
      const barisGemini = qa('[data-testid="aim-table-row"]').filter(
        (r) => r.getAttribute('data-provider') === 'gemini');
      const badge1 = barisGemini.length
        ? (barisGemini[0].textContent ?? '').trim().slice(0, 60)
        : '(tidak ada baris gemini)';

      // pilih provider gemini sebagai aktif lewat kontrol yang sama dengan pengguna
      const pil = kartu('aim-aktif-pil');
      if (pil) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value').set;
        setter.call(pil, 'gemini');
        pil.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(400);
      }

      // Logo brand: di jendela Models ditandai aria-label keluarga (svg), bukan
      // aria-label "Google Gemini" seperti di kartu lama.
      const logo = !!q('[data-provider="gemini"] svg[aria-label="gemini"]');

      const st = window.__ZEPHYR__?.getState?.();
      return JSON.stringify({
        page: !!kartu('aim-page'),
        hasilRefresh,
        pesanSimpan,
        hasKeyAwal, badge0, badge1,
        hasKey: g?.hasKey, preview: g?.preview,
        aktif: st?.settings?.models?.activeProvider ?? null,
        barisGemini: barisGemini.length,
        // BUKTI KEAMANAN: key utuh tidak pernah ada di objek yang diterima UI
        adaKeyUtuh: JSON.stringify(sesudah).includes('DUMMY-KEY-UNTUK-UJI'),
        logo,
      });
    `, 90000),
  );
  check(
    'V8',
    v8.page === true &&
      v8.hasKey === true &&
      v8.preview.includes('…') &&
      !v8.adaKeyUtuh &&
      v8.logo &&
      /*
       * "Refresh" adalah satu-satunya jalur yang benar-benar memanggil provider
       * dari jendela Models: ia membaca key yang BARU saja disimpan (Rust) lalu
       * meminta daftar model. Jawabannya tidak diwajibkan sukses - key dummy
       * memang ditolak - jadi yang dibuktikan adalah "permintaan dibuat dan
       * jawabannya sampai ke UI", bukan "jawabannya 200".
       */
      v8.hasilRefresh !== '(tidak ada jawaban)' &&
      v8.barisGemini > 0,
    `hasKey ${v8.hasKeyAwal} -> ${v8.hasKey}, badge "${v8.badge0}" -> "${v8.badge1}", mask="${v8.preview}", key utuh bocor ke frontend=${v8.adaKeyUtuh}, logo brand=${v8.logo}, baris gemini=${v8.barisGemini}, aktif=${v8.aktif}; refresh: ${v8.hasilRefresh.slice(0, 92)}; simpan: ${v8.pesanSimpan.slice(0, 60)}`,
  );

  // ───────── V8b: secrets.json tidak menyimpan plaintext ─────────
  //
  // Bukti harus lewat Rust. Percobaan pertama menempuh jalur Node
  // (`fs.readFileSync` atas `%APPDATA%\zephyr\secrets.json`) dan SELALU gagal
  // dengan "path outside the workspace" - penjaga path memang menolaknya, dan
  // penolakan itu benar. Yang harus dibuktikan bukan "Node bisa membaca file
  // itu" (tidak bisa, dan tidak boleh), melainkan "byte di disk tidak memuat
  // key apa adanya". `secrets_snapshot` membaca file yang sama dari dalam Rust
  // tanpa mendekripsinya, jadi ia persis saksi yang dibutuhkan, dan sekaligus
  // memastikan frontend tidak pernah menerima key utuh.
  const v8b = JSON.parse(
    await (await mulaiPanel()).runAsync(`
      const info = S.getState().appInfo;
      const path = info.dataDir + '\\\\secrets.json';
      const snap = await window.__ZEPHYR_SECRETS__.snapshot();
      const isi = typeof snap === 'string' ? snap : JSON.stringify(snap ?? '');
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

  // ───────── V9: agents  Edeteksi CLI, start command, maxPanes ─────────
  const v9 = JSON.parse(
    await (await mulaiPanel()).runAsync(`
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
        diskCmd = (await SET.settingsFromDisk()).agents.startCommands[target];
        cmdSesudah = q('[data-testid="agent-cmd-' + target + '"]').value;
        // reset ke default
        q('[data-testid="agent-cmd-reset-' + target + '"]').click();
        await wait(600);
      }
      const setelahReset = (await SET.settingsFromDisk()).agents.startCommands[target] ?? null;

      // maxPanes slider
      const slider = q('[data-testid="agents-maxpanes-box"]');
      setNativeValue(slider, '3');
      await wait(650);
      const maxDisk = (await SET.settingsFromDisk()).agents.maxPanes;
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
  // Uji listener sungguhan pada port aktual. Port 9223 adalah CDP debug dan
  // tidak pernah boleh dianggap sebagai fallback MCP.
  let v10;
  let v10Health = { status: 0, body: null, error: null };
  let v10Shutdown = { running: null, enabledDisk: null, domRunning: null, error: null };
  try {
    v10 = JSON.parse(
      await cdpAktif.runAsync(`
        await bukaSettings('mcp');
        const errSebelum = window.__ZEPHYR_ERRORS__.length;
        const M = window.__ZEPHYR_MCP__;
        const tungguMcp = async () => {
          const batas = Date.now() + 20000;
          while (M.store.getState().busy && Date.now() < batas) await wait(80);
          await wait(150);
        };

        await M.toggle(false);
        await tungguMcp();
        const statusMati = q('[data-testid="mcp-status"]');
        const mati = {
          running: statusMati?.dataset.running ?? null,
          teks: statusMati?.textContent?.trim() ?? null,
          enabledDisk: (await SET.settingsFromDisk()).mcp.enabled,
        };

        // Hindari checkbox warisan proses/harness sebelumnya, lalu nyalakan
        // lewat surface UI yang sama dengan pengguna.
        M.setChecked([]);
        q('[data-testid="mcp-enable"]')?.click();
        await tungguMcp();
        await wait(400);
        await M.refresh();
        const elHidup = q('[data-testid="mcp-status"]');
        const st = M.status();

        const cliBox = q('[data-testid="mcp-cli-opencode"]');
        cliBox?.click();
        await wait(700);
        const disk = (await SET.settingsFromDisk()).mcp;
        const token = st?.token ?? '';

        return JSON.stringify({
          errBaru: window.__ZEPHYR_ERRORS__.length - errSebelum,
          mati,
          hidupRunning: elHidup?.dataset.running ?? null,
          hidupTeks: elHidup?.textContent?.trim() ?? null,
          domPort: elHidup?.dataset.port ?? null,
          running: st?.running ?? null,
          requestedPort: st?.requestedPort ?? null,
          actualPort: st?.port ?? null,
          tokenLen: token.length,
          tokenHex: /^[0-9a-f]{64}$/i.test(token),
          tokenMasked: (q('[data-testid="mcp-token"]')?.textContent ?? '').includes('•'),
          enabledDisk: disk.enabled,
          diskPort: disk.port,
          settingsTokenPresent: typeof disk.token === 'string' && disk.token.length > 0,
          settingsTokenMatchesRuntime: !!token && disk.token === token,
          writeToCli: disk.writeToCli ?? [],
          cli: qa('[data-testid^="mcp-cli-row-"]').length,
          cliBoxFound: !!cliBox,
          cliChecked: !!cliBox?.checked,
          mcpError: M.error?.() ?? null,
        });
      `, 60000),
    );

    // Probe dari proses Node agar CORS WebView tidak bisa menghasilkan false
    // negative. Tidak ada token yang dikirim atau dicetak: /health memang
    // endpoint publik loopback dan status.port adalah sumber port aktual.
    try {
      const response = await fetch(`http://127.0.0.1:${v10.actualPort}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      let body = text;
      try { body = JSON.parse(text); } catch { /* pertahankan teks untuk diagnosis */ }
      v10Health = { status: response.status, body, error: null };
    } catch (e) {
      v10Health = { status: 0, body: null, error: String(e?.message ?? e) };
    }
  } finally {
    // Shutdown harus berjalan walaupun probe health gagal.
    v10Shutdown = JSON.parse(
      await cdpAktif.runAsync(`
        const M = window.__ZEPHYR_MCP__;
        if (M.status()?.running) q('[data-testid="mcp-enable"]')?.click();
        const batas = Date.now() + 20000;
        while (M.store.getState().busy && Date.now() < batas) await wait(80);
        await wait(300);
        await M.refresh();
        const disk = (await SET.settingsFromDisk()).mcp;
        M.setChecked([]);
        return JSON.stringify({
          running: M.status()?.running ?? null,
          enabledDisk: disk.enabled,
          domRunning: q('[data-testid="mcp-status"]')?.dataset.running ?? null,
          error: M.error?.() ?? null,
        });
      `, 60000),
    );
  }

  const healthPort = v10Health.body && typeof v10Health.body === 'object'
    ? v10Health.body.port
    : null;
  const portBenar = v10.requestedPort === 9222 &&
    Number.isInteger(v10.actualPort) &&
    v10.actualPort >= v10.requestedPort &&
    v10.actualPort <= v10.requestedPort + 4 &&
    v10.actualPort !== 9223 &&
    Number(v10.domPort) === v10.actualPort &&
    v10.diskPort === v10.actualPort;
  check(
    'V10',
    v10.errBaru === 0 &&
      v10.mati.running === '0' && v10.mati.enabledDisk === false &&
      v10.hidupRunning === '1' && v10.running === true && /Running/.test(v10.hidupTeks) &&
      portBenar &&
      v10Health.status === 200 && v10Health.body?.ok === true && healthPort === v10.actualPort &&
      v10.tokenLen === 64 && v10.tokenHex && v10.tokenMasked &&
      v10.enabledDisk === true && !v10.settingsTokenPresent && !v10.settingsTokenMatchesRuntime &&
      v10.cli >= 6 && v10.cliBoxFound && v10.cliChecked && v10.writeToCli.includes('opencode') &&
      v10Shutdown.running === false && v10Shutdown.enabledDisk === false && v10Shutdown.domRunning === '0',
    `off=${v10.mati.running}/disk:${v10.mati.enabledDisk}, on=${v10.hidupRunning}/running:${v10.running}; ` +
      `port requested=${v10.requestedPort}, actual=${v10.actualPort}, dom=${v10.domPort}, disk=${v10.diskPort}, not9223=${v10.actualPort !== 9223}; ` +
      `health=${v10Health.status}/ok:${v10Health.body?.ok ?? false}/port:${healthPort}/err:${v10Health.error ?? '-'}; ` +
      `token=${v10.tokenLen}ch/hex:${v10.tokenHex}/masked:${v10.tokenMasked}/settingsAbsent:${!v10.settingsTokenPresent}/sameAsRuntime:${v10.settingsTokenMatchesRuntime}; ` +
      `CLI=${v10.cli}/found:${v10.cliBoxFound}/checked:${v10.cliChecked}/saved:${v10.writeToCli.includes('opencode')}; ` +
      `shutdown running=${v10Shutdown.running}/disk:${v10Shutdown.enabledDisk}/dom:${v10Shutdown.domRunning}; ` +
      `errors console=${v10.errBaru}, mcp=${v10.mcpError ?? v10Shutdown.error ?? '-'}`,
  );


  // ───────── V11: extensions enable/disable ─────────
  // Fase 13 mengganti daftar bawaan (6 ↁE8: + file-icon/git/ai provider) dan
  // memindahkan section-nya ke SectionsExtensions.tsx. Daftar bawaan dibaca
  // dari Rust (`extensions_list`), bukan konstanta frontend.
  const v11 = JSON.parse(
    await (await mulaiPanel()).runAsync(`
      await bukaSettings('extensions');
      await wait(600);
      const kartu = qa('[data-testid="ext-list"] [data-ext]').map(e => e.dataset.ext);
      const sw = () => q('[data-testid="ext-lang-rust"]').getAttribute('aria-checked');
      const ariaSemua = () => qa('[data-testid="ext-list"] [role="switch"]').map(b => b.getAttribute('aria-checked'));
      // Keadaan awal TIDAK diasumsikan: uji ini mematikan satu ekstensi, dan
      // kalau dirinya sendiri tidak memulihkannya, run berikutnya mulai dari
      // keadaan yang sudah berubah - kliknya justru MENYALAKAN, lalu uji gagal
      // pada keadaan warisan, bukan pada kode. Karena itu: baca dulu, balik,
      // lalu kembalikan.
      const awalAria = sw();
      const awalSemua = ariaSemua();
      q('[data-testid="ext-lang-rust"]').click();
      await wait(800);
      const akhirAria = sw();
      const akhirSemua = ariaSemua();
      const disk = (await SET.settingsFromDisk()).extensions.enabled;
      const beda = akhirSemua.filter((v, i) => v !== awalSemua[i]).length;
      const diskCocok = disk.includes('lang-rust') === (akhirAria === 'true');
      // pulihkan keadaan awal
      q('[data-testid="ext-lang-rust"]').click();
      await wait(800);
      const kembaliAria = sw();
      const kembaliDisk = (await SET.settingsFromDisk()).extensions.enabled;
      const kembaliCocok = kembaliDisk.includes('lang-rust') === (kembaliAria === 'true');
      return JSON.stringify({ kartu, awalAria, akhirAria, beda, disk, diskCocok, kembaliAria, kembaliCocok });
    `),
  );
  check(
    'V11',
    v11.kartu.length === 8 &&
      v11.akhirAria !== v11.awalAria &&
      v11.beda === 1 &&
      v11.diskCocok &&
      v11.kembaliAria === v11.awalAria &&
      v11.kembaliCocok &&
      v11.disk.includes('lang-web') &&
      v11.disk.includes('git-provider'),
    `${v11.kartu.length} ekstensi bawaan; lang-rust ${v11.awalAria} -> ${v11.akhirAria} (saklar berubah=${v11.beda})` +
      `, UI-ke-disk cocok=${v11.diskCocok}, dipulihkan ke ${v11.kembaliAria} (cocok=${v11.kembaliCocok})` +
      `, disk enabled=[${v11.disk.join(', ')}]`,
  );

  // ───────── V12: Source Control field tersimpan ─────────
  const v12 = JSON.parse(
    await (await mulaiPanel()).runAsync(`
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
      const disk = (await SET.settingsFromDisk()).git;
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
    await (await mulaiPanel()).runAsync(`
      await bukaSettings('about');
      const baris = qa('[data-testid="about-table"] tr').length;
      const versi = qa('[data-testid="about-table"] .about-v code')[0]?.textContent ?? '';
      // Folder data dibaca dari appInfo (bukan lagi baris ke-3 tabel): About
      // versi ringkas hanya memuat 4-5 baris build.
      const dataDir = window.__ZEPHYR__.getState().appInfo?.dataDir ?? '';

      // bersihkan: kembalikan semua ke default + tutup halaman Settings.
      // WAJIB tutup: harness fase 02/03 memeriksa empty-state editor, dan
      // halaman Settings yang masih terbuka menutupinya (F03-V0 gagal).
      await SET.resetAll();
      await SET.setKey('gemini', '');
      await S.getState().reloadSettings();
      S.getState().setSettingsOpen(false);
      S.getState().setActivity('explorer');
      await wait(500);
      return JSON.stringify({ baris, versi, dataDir });
    `),
  );
  /*
   * Zoom DIUKUR DI JENDELA UTAMA, dan perintahnya juga dijalankan di sana.
   *
   * `applyTheme` - satu-satunya penulis `documentElement.style.fontSize` -
   * hanya dipanggil `App.tsx`, dan `App.tsx` tidak dirender di jendela panel.
   * Versi lama mengirim KeyboardEvent Ctrl+= ke jendela Settings lalu mengukur
   * font root di sana: hasilnya selalu "16px -> 16px", karena di jendela itu
   * tidak ada yang menulis font root sama sekali. Yang diuji jadi keadaan
   * jendela yang salah, bukan zoom aplikasinya.
   */
  const cdpZoom = await keUtama();
  const sebelumZoom = JSON.parse(
    await cdpZoom.eval(`JSON.stringify({
      root: getComputedStyle(document.documentElement).fontSize,
      zoom: window.__ZEPHYR__.getState().settings.general.zoom,
    })`),
  );
  await jalankanPerintah(cdpZoom, 'view.zoomIn');
  const naikZoom = JSON.parse(
    await cdpZoom.eval(`JSON.stringify({
      root: getComputedStyle(document.documentElement).fontSize,
      zoom: window.__ZEPHYR__.getState().settings.general.zoom,
    })`),
  );
  await jalankanPerintah(cdpZoom, 'view.zoomReset');
  const balikZoom = JSON.parse(
    await cdpZoom.eval(`JSON.stringify({
      root: getComputedStyle(document.documentElement).fontSize,
      zoom: window.__ZEPHYR__.getState().settings.general.zoom,
    })`),
  );
  /*
   * Yang dinilai adalah PERUBAHAN-nya, bukan angka 16px/18px: ukuran akar
   * diturunkan dari `general.zoom` (100% = 16px), jadi uji ini tetap sah kalau
   * suatu hari skala dasar rem berubah. `diskZoom` datang dari file, jadi
   * zoom yang hanya berubah di layar tapi tidak tersimpan pun ketahuan.
   */
  /*
   * Dibaca lewat `runAsync`, bukan `eval`: `settingsFromDisk()` adalah promise
   * dan `eval` tidak memakai `awaitPromise`, jadi yang kembali adalah promise
   * itu sendiri ("[object Object]"), bukan JSON-nya.
   */
  /*
   * `runAsync` menempelkan isi `body` sebagai PERNYATAAN di dalam fungsi async,
   * bukan memanggilnya. Bentuk `async () => { ... }` karena itu hanya
   * MENDEFINISIKAN fungsi dan tidak pernah menjalankannya: hasilnya null,
   * `JSON.parse(null)` mengembalikan null, dan V13 mati dengan "Cannot read
   * properties of null (reading 'zoom')" - pesan yang menunjuk baris yang
   * salah. Tulis langkahnya sebagai pernyataan biasa.
   */
  const diskZoom = JSON.parse(
    await (await mulaiPanel()).runAsync(`
      const disk = await SET.settingsFromDisk();
      return JSON.stringify({ zoom: disk.general.zoom });
    `),
  );
  /*
   * `cdpZoom` TIDAK boleh dipakai lagi di sini.
   *
   * `mulaiPanel()` di atas memanggil `kePanel()`, dan helper itu menutup
   * koneksi jendela yang sedang dipegang - yaitu `cdpZoom` (jendela utama).
   * Mengirim `Runtime.evaluate` lewat soket yang sudah ditutup tidak pernah
   * dijawab, jadi versi lama berkas ini menggantung tepat di baris ini:
   * ringkasan V12 sudah tercetak, V13 tidak pernah selesai, dan prosesnya
   * harus dibunuh dari luar. Ambil koneksi utama yang baru lewat `keUtama()`.
   */
  const cdpErr = await keUtama();
  const errors = JSON.parse(
    await cdpErr.eval(`JSON.stringify(window.__ZEPHYR_ERRORS__ ?? [])`),
  );
  /* Sama seperti `diskZoom`: pernyataan, bukan definisi fungsi. */
  const keySisa = JSON.parse(
    await (await mulaiPanel()).runAsync(`
      const m = await SET.publicModels();
      return JSON.stringify({ hasKey: m.find(x => x.provider === 'gemini')?.hasKey });
    `),
  );
  Object.assign(v13, {
    zoomAwal: sebelumZoom.root,
    zoomNaik: naikZoom.root,
    zoomBalik: balikZoom.root,
    diskZoom: diskZoom.zoom,
    zoomStoreNaik: naikZoom.zoom,
    errors,
    keySisa: keySisa.hasKey,
  });
  check(
    'V13',
    // T4.15 memadatkan About: dulu 9 baris (Build 5 + Runtime 6 + Data 3 ↁE
    // setelah fase 11 jadi 9 baris terhitung), sekarang 5 baris di satu kartu.
    v13.baris >= 3 &&
      v13.baris <= 8 &&
      // About menampilkan "1.1.10 · debug" di build debug, jadi versinya
      // dicocokkan di awal string, bukan sebagai satu-satunya isi.
      /^\d+\.\d+\.\d+/.test(v13.versi) &&
      /zephyr/i.test(v13.dataDir) &&
      // Perubahan, bukan angka mati: zoom naik harus mengubah store DAN
      // ukuran akar, reset harus mengembalikan keduanya ke keadaan awal.
      v13.zoomStoreNaik > 100 &&
      v13.zoomNaik !== v13.zoomAwal &&
      v13.zoomBalik === v13.zoomAwal &&
      // Angka dari DISK (bukan dari store) supaya zoom yang cuma berubah di
      // layar tapi tidak tersimpan tetap ketahuan.
      v13.diskZoom === 100 &&
      v13.errors.length === 0 &&
      v13.keySisa === false,
    `About ${v13.baris} baris (versi ${v13.versi}, data ${v13.dataDir}); zoom akar ${v13.zoomAwal} -> ${v13.zoomNaik} (store ${v13.zoomStoreNaik}%) -> reset ${v13.zoomBalik}, disk setelah reset ${v13.diskZoom}%; bersih (key uji dihapus=${v13.keySisa === false}); console error: ${v13.errors.length === 0 ? 'tidak ada' : JSON.stringify(v13.errors)}`,
  );

  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  /*
   * Keluar eksplisit, jangan cuma menyetel process.exitCode.
   *
   * Dulu berkas ini mengandalkan event loop mengalir habis. Saat dijalankan
   * runner suite (spawnSync, stdout pipa) prosesnya TIDAK keluar: runner
   * menunggu 8 menit, mematikannya, dan yang tercatat hanya "timeout" - padahal
   * semua uji selesai dan ringkasannya lengkap. keluarBersih menjaga kode keluar
   * yang sama sekaligus memastikan output tidak ikut hilang.
   */
  pulihkanSetelan();
  keluarBersih(lulus === results.length ? 0 : 1);
};

main().catch((e) => {
  // A thrown object with no `message` prints as "{}", which hides the cause.
  // Print the whole value plus the stack so a failure is always readable.
  const pesan = e?.stack ?? e?.message ?? JSON.stringify(e);
  console.error('verify08 error:', pesan);
  // Tutup koneksinya, kalau tidak proses ini tidak akan pernah keluar dan
  // pemanggilnya (runner suite) hanya melihat "timeout" tanpa galat.
  try {
    cdpTerbuka?.close();
  } catch {
    /* sudah tertutup atau gagal ditutup: tetap harus keluar */
  }
  // Settings dikembalikan DULU: tanpa ini, satu kegagalan di tengah run
  // meninggalkan berkas dalam keadaan default dan konfigurasi pembaca hilang.
  pulihkanSetelan();
  // keluarBersih, bukan process.exit: output yang belum terkirim tidak boleh
  // hilang bersama prosesnya.
  keluarBersih(2);
});
