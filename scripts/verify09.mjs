// verify09.mjs — verifikasi V1..V10 fase 09 (AI panel) lewat CDP di app hidup.
//
// Pakai:  node scripts/verify09.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup
//         3) scripts/mock-ai.mjs berjalan di 127.0.0.1:8098 — harness ini
//            menyalakannya sendiri kalau belum ada.
//
// Prinsip: streaming, adapter per provider, dan cancel dibuktikan lewat jalur
// Rust yang SAMA dengan produksi. Yang ditukar hanya base URL provider →
// server tiruan, sehingga bukti mencakup ai_chat/ai-chunk/ai_cancel asli.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
const MOCK = 8098;

/*
 * Cadangan berkas secrets.json.
 *
 * Harness ini mengosongkan key uji (gemini/anthropic) lewat setKey, dan jalur
 * itu menulis ulang seluruh berkas — pernah sampai menghapus key milik user
 * (custom, mr-vip). Berkas dicadangkan sebelum uji dan dikembalikan apa
 * adanya di akhir, termasuk saat harness gagal di tengah jalan.
 */
const SECRETS = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'zephyr',
  'secrets.json',
);
const SECRETS_CADANGAN = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `secrets-verify09-${process.pid}.json`,
);

function backupSecrets() {
  try {
    if (fs.existsSync(SECRETS)) {
      fs.copyFileSync(SECRETS, SECRETS_CADANGAN);
      return true;
    }
  } catch {
    /* lanjut tanpa cadangan */
  }
  return false;
}

function restoreSecrets() {
  try {
    if (fs.existsSync(SECRETS_CADANGAN)) {
      fs.copyFileSync(SECRETS_CADANGAN, SECRETS);
      fs.rmSync(SECRETS_CADANGAN, { force: true });
    }
  } catch {
    /* biarkan — cadangan masih ada di disk */
  }
}

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

  /** Async di halaman + polling hasil (WebView2 sering membuang promise). */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV9_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const X = window.__ZEPHYR_SET__;
        const A = window.__ZEPHYR_AI__;
        const AS = () => window.__ZEPHYR_AI__.store.getState();
        const P = window.__ZEPHYR_PTY__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        // React melacak nilai input lewat setter internal (catatan fase 08):
        // menimpa el.value langsung TIDAK memicu onChange.
        const setNativeValue = (el, val) => {
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        /** Buka panel AI di dock bawah + sidebar AI. */
        const bukaAi = async () => {
          const st = S.getState();
          st.setSettingsOpen(false);
          st.setActivity('ai');
          if (!S.getState().sidebarVisible) st.toggleSidebar();
          T.getState().setVisible(true);
          T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
          await wait(260);
        };
        /** Tunggu sampai streaming selesai (pending null). */
        const tungguSelesai = async (ms = 25000) => {
          const batas = Date.now() + ms;
          while (AS().pending && Date.now() < batas) await wait(120);
          await wait(220);
          return !AS().pending;
        };
        /** Kirim lewat UI seperti user: isi textarea lalu klik Kirim.
         *  Kalau masih ada request menggantung, batalkan dulu supaya tombol
         *  Kirim benar-benar ada (saat pending yang tampil adalah Stop).
         *  PENTING: send() menyetel pending SETELAH await loadKeys(), jadi
         *  fungsi ini harus menunggu pending terpasang — kalau tidak,
         *  tungguSelesai() langsung lolos dan kita membaca jawaban separuh. */
        const kirim = async (teks) => {
          if (AS().pending) { await AS().cancel(); await wait(300); }
          // Toast lama masih tampil sampai 3.2s; kalau tidak dibersihkan,
          // pengiriman BERIKUTNYA salah dibaca sebagai "diblokir" dan
          // harness lanjut sebelum jawaban datang (V5 pernah gagal begini).
          AS().setToast(null);
          /*
           * Tunggu toast benar-benar lepas dari DOM.
           *
           * setToast(null) hanya mengubah state; React baru menghapus
           * elemennya pada render berikutnya. Kalau pengiriman berikutnya
           * dimulai sebelum itu, sisa toast dari uji sebelumnya terbaca
           * sebagai "diblokir" dan harness lanjut tanpa pesan terkirim —
           * itulah sebabnya V3 melaporkan jejak 0→0→0.
           */
          for (let i = 0; i < 12 && q('[data-testid="ai-toast"]'); i++) await wait(80);
          setNativeValue(q('[data-testid="ai-input"]'), teks);
          await wait(140);
          const btn = q('[data-testid="ai-send"]');
          if (!btn) throw new Error('tombol Kirim tidak ada (pending=' + AS().pending + ')');
          const jumlahSebelum = A.messages().length;
          btn.click();
          const batas = Date.now() + 6000;
          // Request dianggap benar-benar mulai bila pending terisi ATAU
          // pesan bertambah (untuk kasus yang ditolak sebelum jalan).
          while (Date.now() < batas) {
            if (AS().pending) return true;
            if (A.messages().length !== jumlahSebelum) return true;
            if (q('[data-testid="ai-toast"]')) return false; // diblokir (tanpa key)
            await wait(80);
          }
          return false;
        };
        /** Klik elemen setelah menunggu ia muncul — panel AI baru ter-mount
         *  saat dock berpindah, jadi query langsung bisa mengenai null. */
        const klik = async (sel, ms = 4000) => {
          const batas = Date.now() + ms;
          for (;;) {
            const el = q(sel);
            if (el) { el.click(); return true; }
            if (Date.now() > batas) throw new Error('elemen tidak muncul: ' + sel);
            await wait(120);
          }
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

const mockLog = async () => (await fetch(`http://127.0.0.1:${MOCK}/__log`)).json();
const mockReset = () => fetch(`http://127.0.0.1:${MOCK}/__reset`);

const MOCK_VERSION = 5;

async function ensureMock() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
    if (v.version === MOCK_VERSION) return null; // sudah jalan & versinya benar
    throw new Error(
      `mock-ai di :${MOCK} versi ${v.version}, harness butuh ${MOCK_VERSION} — matikan proses itu dulu`,
    );
  } catch (e) {
    if (String(e.message).includes('harness butuh')) throw e;
    /* belum jalan -> nyalakan */
  }
  const child = spawn(process.execPath, ['scripts/mock-ai.mjs', String(MOCK)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    try {
      const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
      if (v.version !== MOCK_VERSION) throw new Error('versi mock salah');
      return child;
    } catch {
      /* tunggu */
    }
  }
  throw new Error(`mock-ai tidak mau start di :${MOCK}`);
}

const main = async () => {
  backupSecrets();
  const mock = await ensureMock();
  await mockReset();

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  let cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_AI__')) === 'undefined') {
    throw new Error('__ZEPHYR_AI__ tidak ada — reload halaman (devBridge fase 09)');
  }

  // Kondisi awal bersih: tutup terminal/tab, settings default, chat kosong,
  // base URL ketiga provider diarahkan ke server tiruan.
  await cdp.runAsync(`
    for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    await X.resetAll();

    /*
     * Uji V2 memerlukan keadaan TANPA key pada provider yang aktif.
     *
     * aiStore.init() memilih provider aktif hanya kalau provider itu punya
     * key; kalau tidak, ia pindah ke provider ber-key pertama. Jadi provider
     * aktif harus diarahkan ke provider yang memang belum punya key — bukan
     * dengan menghapus key user.
     *
     * PENTING: key milik user (custom, github, provider lain) TIDAK BOLEH
     * disentuh. Versi sebelumnya mengosongkan SETIAP provider yang punya key
     * lewat setKey(id, ''), dan itu menghapus key user secara permanen.
     */
    await X.setKey('gemini', '');
    await X.setKey('anthropic', '');
    await AS().loadKeys();

    // Provider aktif = yang tidak punya key. Fallback ke 'gemini' kalau
    // semua provider ternyata punya key (keadaan tanpa-key tidak mungkin).
    const tanpaKey = AS().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
    await s.applySettings({ models: { activeProvider: tanpaKey } });
    await s.reloadSettings();
    await AS().loadKeys();

    // Paksa store AI memakai provider tanpa key itu: init() akan memindahnya
    // kembali ke provider ber-key kalau dibiarkan memilih sendiri.
    A.store.setState({ provider: tanpaKey, model: '' });
    AS().setModel?.(tanpaKey);
    localStorage.removeItem('zephyr.ai.sessions.v1');
    AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
    await AS().loadKeys();
    // Simpan baseUrl asli SEBELUM ditimpa mock. Harness ini pernah menulis
    // http://127.0.0.1:8098 ke settings.json dan tidak pernah mengembalikannya,
    // sehingga provider user menunjuk ke server uji dan chat gagal 401.
    window.__ZV9_ORIG_PROVIDERS__ = JSON.parse(JSON.stringify(
      s.settings.models?.providers ?? {}));
    await s.applySettings({ models: { providers: {
      gemini:    { baseUrl: 'http://127.0.0.1:${MOCK}' },
      openai:    { baseUrl: 'http://127.0.0.1:${MOCK}/v1' },
      anthropic: { baseUrl: 'http://127.0.0.1:${MOCK}' },
    } } });
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  `);
  await sleep(500);

  // ───────── V1: dropdown model = logo + nama; provider → baseUrl ─────────
  const v1 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Pasang key mock untuk gemini lebih dulu.
       *
       * Menu provider hanya menampilkan provider yang punya key, dan provider
       * ber-key di mesin ini bisa cuma local/custom yang masing-masing punya
       * SATU model — tidak cukup untuk membuktikan tingkat kedua dropdown.
       * Uji V2 mengosongkan key ini lagi sebelum memeriksa badge oranye.
       */
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(250);

      await bukaAi();
      /*
       * Buka menu model — tapi hanya kalau belum terbuka.
       *
       * Tombolnya adalah toggle: kalau modelMenuOpen masih true dari uji
       * sebelumnya, klik justru MENUTUP menu dan daftar provider kosong.
       */
      if (!q('[data-testid="ai-model-menu"]')) {
        await klik('[data-testid="ai-model-btn"]');
        await wait(400);
      }
      const menu = q('[data-testid="ai-model-menu"]');
      // Tingkat PROVIDER: hanya provider ber-key yang ditawarkan.
      const providerRows = qa('[data-provider-item]').map(el => ({
        provider: el.dataset.provider,
        nama: el.querySelector('.ai-mi-name')?.textContent ?? '',
        logo: el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
      }));
      // Masuk ke tingkat MODEL: pilih provider pertama yang punya key.
      // Only providers with a key are listed by design, so the opening
      // provider must be read from the list rather than assumed — a machine
      // with only one provider configured has no "openai" row at all.
      /*
       * Pilih provider yang punya BANYAK model, bukan yang pertama di daftar.
       *
       * Katalog memuat provider dengan satu model saja (local, custom), dan
       * urutan barisnya bergantung key yang ada di mesin ini. Uji ini memeriksa
       * tingkat kedua dropdown (daftar model milik provider), jadi provider
       * bertenaga satu model tidak bisa membuktikan apa pun.
       */
      const pilihProvider = (providerRows.find((x) => x.provider === 'gemini')
        ?? providerRows.find((x) => x.provider === 'openai')
        ?? providerRows[0])?.provider;
      if (!pilihProvider) {
        return JSON.stringify({
          err: 'tidak ada provider ber-key',
          jumlahProvider: providerRows.length,
        });
      }
      await klik('[data-provider-item="' + pilihProvider + '"]');
      await wait(300);
      const items = qa('[data-model-item]').map(el => ({
        model: el.dataset.modelItem,
        provider: el.dataset.provider,
        baseUrl: el.dataset.baseurl,
        // logo = SVG dengan aria-label brand di dalam baris
        logo: el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
        nama: el.querySelector('.ai-mi-name')?.textContent ?? '',
      }));
      const sebelum = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
      };
      const modelPertama = items[0]?.model;
      if (!modelPertama) return JSON.stringify({ err: 'provider tanpa model' });
      await klik('[data-model-item="' + modelPertama + '"]');
      await wait(600);
      const sesudah = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
        judul: q('[data-testid="ai-model-btn"]').getAttribute('title'),
        disk: (await X.settingsFromDisk()).models.activeProvider,
      };
      /*
       * Tidak ada langkah "kembalikan ke provider semula": provider awal bisa
       * saja provider TANPA key (mis. anthropic) yang barisnya memang tidak
       * pernah muncul di menu, jadi mengkliknya hanya menggantung. Tiap uji
       * berikutnya menetapkan providernya sendiri lewat setModel().
       */
      return JSON.stringify({
        adaMenu: !!menu, providerRows, items, sebelum, sesudah,
        providerDibuka: pilihProvider,
        katalog: A.catalog().length,
        jumlahProviderKatalog: P && P.PROVIDER_COUNT ? P.PROVIDER_COUNT : null,
        akhir: q('[data-testid="ai-model-btn"]').dataset.model,
      });
    `),
  );
  // Kalau blok di halaman mengembalikan {err}, tampilkan apa adanya —
  // tanpa ini kegagalan muncul sebagai TypeError yang tidak informatif.
  if (v1.err) check('V1', false, `dropdown dua tingkat gagal di halaman: ${v1.err}`);
  const semuaAdaLogo = (v1.items ?? []).every((x) => x.logo && x.nama.length > 0);
  const providerAdaLogo = (v1.providerRows ?? []).every((x) => x.logo && x.nama.length > 0);
  check(
    'V1',
    v1.adaMenu &&
      // Tingkat provider: hanya provider ber-key (mock memasang key untuk
      // gemini + openai), ditambah provider bebas (custom/lokal).
      v1.providerRows.length > 0 &&
      v1.providerRows.length < 6 &&
      providerAdaLogo &&
      // Tingkat model: hanya model MILIK provider yang dibuka.
      // Tingkat kedua hanya memuat model milik provider yang dibuka.
      v1.items.length >= 9 &&
      semuaAdaLogo &&
      v1.items.every((x) => x.provider === v1.providerDibuka) &&
      v1.sesudah.provider === v1.providerDibuka &&
      v1.sesudah.disk === v1.providerDibuka,
    `dua tingkat: ${v1.providerRows.length} provider ber-key (${v1.providerRows.map((x) => x.provider).join(', ')}) → ${v1.items.length} model ${v1.items[0]?.provider ?? '?'}, semua berlogo; ganti gemini → openai: provider disk=${v1.sesudah.disk}, baseUrl efektif "${v1.sesudah.judul.split('— ')[1]}"`,
  );

  // ───────── V2: tanpa key → status oranye + kirim diblokir, tidak crash ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Arahkan provider aktif ke provider TANPA key.
       *
       * aiStore.init() memindahkan provider aktif ke provider ber-key pertama
       * kalau provider aktif tidak punya key, jadi badge hanya oranye selama
       * provider aktif memang belum punya key. V1 meninggalkan provider
       * ber-key terpilih, jadi keadaan itu harus dipulihkan di sini.
       */
      await X.setKey('gemini', '');
      await X.setKey('anthropic', '');
      await AS().loadKeys();
      await wait(200);
      const tanpaKey = AS().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
      /*
       * Provider DAN model harus dipindah bersama.
       *
       * aiStore.init() memilih ulang provider dari daftar key saat store
       * dibaca; menyetel provider saja meninggalkan model milik provider lama,
       * dan findModel() memakai model itu untuk menentukan provider — jadi
       * store kembali ke provider ber-key dan badge tetap hijau.
       */
      A.store.setState({ provider: tanpaKey, model: '' });
      await wait(250);
      await AS().loadKeys();
      await wait(200);

      /*
       * Chat dikosongkan dulu: V1 mengirim pesan untuk menguji markdown, dan
       * sesi yang sama dipakai di sini — tanpa ini jumlah pesan bukan nol
       * sehingga "chat tetap kosong" tidak bisa dibuktikan.
       */
      A.store.getState().newChat();
      await wait(350);

      /*
       * Semua pembacaan badge dilakukan lewat q() yang segar, bukan variabel
       * elemen yang disimpan — React mengganti node-nya saat render ulang, dan
       * referensi lama akan melaporkan nilai basi.
       */
      const bacaBadge = () => {
        const el = q('[data-testid="ai-keystate"]');
        return { haskey: el.dataset.haskey, kelas: el.className,
                 warna: getComputedStyle(el).color };
      };

      /*
       * Tombol "Isi API key" dibaca SEBELUM kirim.
       *
       * Setelah kirim diblokir, aiStore memindahkan provider aktif ke provider
       * ber-key lain (mis. github milik user) supaya percakapan tetap bisa
       * jalan — provider itu punya key, jadi tombolnya memang hilang. Yang
       * diuji adalah keadaan TANPA key, jadi tombolnya harus dibaca saat
       * provider aktif masih yang tanpa key.
       */
      const adaTombolSettings = !!q('[data-testid="ai-goto-settings"]');
      const sebelumKirim = bacaBadge();

      // Kirim lewat UI (isi textarea + Enter) supaya jalurnya sama dengan user.
      await kirim('halo tanpa key');
      await wait(900);
      return JSON.stringify({
        haskey: sebelumKirim.haskey,
        kelas: sebelumKirim.kelas,
        warna: sebelumKirim.warna,
        toast: q('[data-testid="ai-toast"]')?.textContent ?? '',
        pesan: A.messages().length,
        pending: AS().pending,
        adaTombolSettings,
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  check(
    'V2',
    v2.haskey === '0' &&
      /is-warn/.test(v2.kelas) &&
      // Pesannya dua bentuk: "belum ada key — pindah ke X yang sudah kamu isi"
      // (kalau ada provider ber-key) atau ajakan isi key kalau tidak ada.
      /belum ada key|Isi API key/i.test(v2.toast) &&
      v2.pesan === 0 &&
      v2.pending === null &&
      v2.adaTombolSettings &&
      v2.errors === 0,
    `tanpa key: badge oranye (${v2.warna}, ${v2.kelas.trim()}), tombol "Isi API key" ada, kirim diblokir toast "${v2.toast}", chat tetap 0 pesan, 0 console error`,
  );

  // ───────── V3: dengan key → streaming kata per kata + markdown bold ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Pindah provider aktif ke gemini.
       *
       * Urutannya penting: key mock dipasang DULU supaya providernya muncul di
       * menu, lalu setModel() memindahkan provider + model sekaligus — jalur
       * yang sama dipakai menu saat user memilih model. Uji V2 meninggalkan
       * provider aktif pada provider TANPA key, jadi tanpa langkah ini pesan
       * V3 dikirim ke provider itu dan mock tidak pernah dipanggil.
       */
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(250);
      /*
       * URUTAN PENTING: setModel(modelId) hanya mengganti MODEL pada provider
       * yang sedang aktif (findModel(id, provider) memakai provider aktif).
       * Kalau provider aktif masih custom (freeText), model apa pun akan
       * dipasang DI provider custom dan mock tidak pernah dipanggil — uji ini
       * dulu gagal dengan "adapter gemini dipanggil 0x". Jadi pindahkan
       * provider LEBIH DULU, baru pilih modelnya.
       */
      await A.store.getState().setProvider?.('gemini');
      await S.getState().applySettings({ models: { activeProvider: 'gemini' } });
      await wait(450);
      await A.store.getState().setModel('gemini-3.8-flash');
      await wait(450);
      const providerKini = q('[data-testid="ai-model-btn"]').dataset.provider;
      const badgeOk = q('[data-testid="ai-keystate"]').dataset.haskey;

      /*
       * Chat kosong dulu: jejak panjang teks mengukur pertumbuhan selama
       * streaming, dan sesi yang sudah berisi jawaban uji sebelumnya membuat
       * pembacaan pertama langsung di angka penuh (naik 0x).
       */
      A.store.getState().newChat();
      await wait(350);

      /*
       * Paksa provider tepat SEBELUM kirim.
       *
       * newChat() dan langkah sebelumnya bisa membuat aiStore memilih ulang
       * provider dari daftar key (perilaku auto-switch aplikasi), jadi
       * provider yang disetel di awal blok belum tentu masih berlaku saat
       * tombol Kirim ditekan. Sama seperti di atas: provider dulu, model
       * kemudian (setModel mengikuti provider aktif).
       */
      await S.getState().applySettings({ models: { activeProvider: 'gemini' } });
      await wait(350);
      await A.store.getState().setModel('gemini-3.8-flash');
      await wait(400);
      const providerSaatKirim = A.store.getState().provider;

      await kirim('sapa saya SLOW');

      // Ambil panjang teks beberapa kali selagi streaming (bukti bertahap).
      const jejak = [];
      for (let i = 0; i < 10; i++) {
        await wait(280);
        const m = A.messages().find(x => x.role === 'assistant');
        jejak.push({ n: (m?.content ?? '').length, streaming: !!m?.streaming,
                     typing: !!q('[data-testid="ai-typing"]') });
      }
      await tungguSelesai();
      const akhir = A.messages().find(x => x.role === 'assistant');

      // Sekali lagi tanpa SLOW untuk menguji render markdown **bold**.
      await kirim('sapa saya');
      await tungguSelesai();
      const msgs = A.messages();
      const last = msgs[msgs.length - 1];
      const bodyEl = q('[data-ai-body="' + last.id + '"]');
      return JSON.stringify({
        badgeOk, jejak, providerKini, providerSaatKirim,
        akhirTeks: akhir?.content ?? '',
        akhirStreaming: !!akhir?.streaming,
        bold: bodyEl?.querySelector('strong')?.textContent ?? null,
        html: bodyEl?.innerHTML.slice(0, 90) ?? '',
        role: last.role,
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  const naik = v3.jejak.filter((x, i) => i > 0 && x.n > v3.jejak[i - 1].n).length;
  const adaTyping = v3.jejak.some((x) => x.typing);
  const logV3 = await mockLog();
  const gemReq = logV3.filter((e) => e.kind === 'gemini');
  check(
    'V3',
    v3.badgeOk === '1' &&
      naik >= 3 &&
      adaTyping &&
      !v3.akhirStreaming &&
      v3.akhirTeks.length > 20 &&
      v3.bold === 'uji' &&
      gemReq.length >= 2 &&
      gemReq[0].headers.xGoog === 'MOCK-KEY-GEMINI-1234' &&
      v3.errors === 0,
    `streaming bertahap: panjang teks naik ${naik}x (${v3.jejak.map((x) => x.n).join('→')}), indikator "mengetik…" tampil; markdown <strong>=${JSON.stringify(v3.bold)}; adapter gemini dipanggil ${gemReq.length}x dengan header x-goog-api-key (key benar sampai ke provider, tidak lewat frontend)`,
  );

  // ───────── V4: attach file aktif → jawaban mengutip isinya ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(`
      // Buat file aktif berisi penanda yang mudah dicek.
      s.newUntitled();
      await wait(400);
      const tab = S.getState().tabs[S.getState().tabs.length - 1];
      S.getState().updateTabContent(tab.id, 'ZEPHYR-ATTACH-MARKER-42\\nbaris kedua file uji');
      await wait(250);
      AS().setAttachActive(true);
      await wait(150);
      const tombolOn = q('[data-testid="ai-attach"]').getAttribute('aria-pressed');

      await kirim('ringkas file ini ECHOFILE');
      await tungguSelesai();

      const msgs = A.messages();
      const user = msgs.filter(m => m.role === 'user').pop();
      const bot = msgs.filter(m => m.role === 'assistant').pop();
      const chip = q('[data-testid="ai-attach-chip"]')?.textContent ?? '';
      AS().setAttachActive(false);
      return JSON.stringify({
        tombolOn, chip,
        attached: user?.attached ?? null,
        jawaban: bot?.content ?? '',
        namaTab: tab.name,
      });
    `),
  );
  const logV4 = await mockLog();
  const reqAttach = [...logV4].reverse().find((e) => e.kind === 'gemini');
  check(
    'V4',
    v4.tombolOn === 'true' &&
      !!v4.attached &&
      v4.jawaban.includes('ZEPHYR-ATTACH-MARKER-42') &&
      reqAttach.promptHead.includes('konteks kerja aktif') &&
      reqAttach.promptHead.includes(v4.namaTab) &&
      v4.chip.includes(v4.namaTab),
    `lampiran terkirim: prompt memuat path "${v4.attached.path}" + instruksi konteks; jawaban mengutip isi file ("…${v4.jawaban.slice(-30).trim()}"); chip di bubble = "${v4.chip}"`,
  );

  // ───────── V5: ganti ke Claude → adapter anthropic; tanpa key = tolak ramah ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      /*
       * 1) tanpa key anthropic -> penolakan ramah, bukan crash.
       *
       * Provider dipindahkan LEBIH DULU, baru model dipilih: setModel()
       * mengikuti provider yang sedang aktif, jadi memanggilnya saat provider
       * masih gemini hanya mengganti model di gemini.
       */
      await X.setKey('anthropic', '');
      await AS().loadKeys();
      await wait(220);
      await S.getState().applySettings({ models: { activeProvider: 'anthropic' } });
      await wait(350);
      await A.store.getState().setModel('claude-sonnet-4-5');
      await wait(450);
      const badgeTanpaKey = q('[data-testid="ai-keystate"]').dataset.haskey;
      await kirim('halo claude');
      await wait(800);
      const toastTanpaKey = q('[data-testid="ai-toast"]')?.textContent ?? '';
      const pesanSebelum = A.messages().length;
      // 2) dengan key -> adapter anthropic (x-api-key + /v1/messages) jalan
      await X.setKey('anthropic', 'MOCK-KEY-ANTHROPIC-9876');
      await AS().loadKeys();
      await wait(200);
      await S.getState().applySettings({ models: { activeProvider: 'anthropic' } });
      await wait(300);
      await A.store.getState().setModel('claude-sonnet-4-5');
      await wait(350);
      await kirim('halo claude');
      await tungguSelesai();
      const bot = A.messages().filter(m => m.role === 'assistant').pop();

      // 3) uji error ramah: provider jawab 401
      await kirim('coba ERR401');
      await tungguSelesai();
      const err = A.messages().filter(m => m.error).pop();

      await X.setKey('anthropic', '');
      await AS().loadKeys();
      return JSON.stringify({
        badgeTanpaKey, toastTanpaKey, pesanSebelum,
        jawaban: bot?.content ?? '',
        model: bot?.model ?? null,
        error: err?.error ?? null,
        errUi: q('[data-testid="ai-error"]')?.textContent ?? '',
      });
    `),
  );
  const logV5 = await mockLog();
  const anth = logV5.filter((e) => e.kind === 'anthropic');
  check(
    'V5',
    v5.badgeTanpaKey === '0' &&
      // Pesan bisa berbentuk "Isi API key X" atau "X belum ada key — pindah
      // ke Y" (kalau ada provider lain yang sudah ber-key). Keduanya sama-sama
      // menandakan penolakan ramah, bukan crash.
      /Anthropic/i.test(v5.toastTanpaKey) &&
      /key/i.test(v5.toastTanpaKey) &&
      anth.length >= 1 &&
      anth[0].headers.xApiKey === 'MOCK-KEY-ANTHROPIC-9876' &&
      anth[0].headers.anthropicVersion === '2023-06-01' &&
      anth[0].body.max_tokens > 0 &&
      v5.jawaban.includes('uji') &&
      v5.model === 'claude-sonnet-4-5' &&
      /401/.test(v5.error ?? '') &&
      /API key salah/i.test(v5.error ?? ''),
    `tanpa key: toast "${v5.toastTanpaKey}"; dengan key: POST /v1/messages dengan x-api-key + anthropic-version + max_tokens=${anth[0]?.body.max_tokens} → jawaban tampil; HTTP 401 jadi pesan ramah "${(v5.error ?? '').slice(0, 60)}…"`,
  );

  // ───────── V6: Jalankan di Terminal + konfirmasi perintah destruktif ─────────
  const v6 = JSON.parse(
    await cdp.runAsync(`
      // kembali ke gemini (punya key mock) — provider dulu, baru model
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(200);
      await S.getState().applySettings({ models: { activeProvider: 'gemini' } });
      await wait(300);
      await A.store.getState().setModel('gemini-3.6-flash');
      await wait(450);

      // 1) jawaban dengan fenced bash -> tombol muncul
      await kirim('kasih perintah BASHCMD');
      await tungguSelesai();
      const tombolBar = !!q('[data-testid="ai-run-last"]');
      const tombolBlok = !!q('[data-testid="ai-run-code"]');
      const cmdBar = q('.ai-action-cmd')?.textContent ?? '';

      // siapkan pane shell dulu supaya perintah punya tujuan yang jelas
      window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
      const paneId = await T.getState().addPane('shell');
      await wait(2500);
      T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
      await wait(200);

      await klik('[data-testid="ai-run-last"]');
      await wait(2500);
      const layar = P.read(paneId, 40);
      const toastKirim = q('[data-testid="ai-toast"]')?.textContent ?? '';

      // 2) perintah destruktif -> dialog konfirmasi, TIDAK langsung jalan
      await kirim('hapus dist RMCMD');
      await tungguSelesai();
      const cmdDestruktif = A.command(A.messages().filter(m => m.role === 'assistant').pop().content);
      await klik('[data-testid="ai-run-last"]');
      await wait(500);
      const dialog = !!q('[data-testid="ai-confirm"]');
      const isiDialog = q('.ai-confirm-cmd')?.textContent ?? '';
      const layarSebelumBatal = P.read(paneId, 40);
      await klik('[data-testid="ai-confirm-no"]');
      await wait(400);
      const dialogSetelahBatal = !!q('[data-testid="ai-confirm"]');

      return JSON.stringify({
        tombolBar, tombolBlok, cmdBar, toastKirim,
        adaOutput: layar.includes('ZEPHYR-RUN-OK'),
        layarEkor: layar.split('\\n').filter(Boolean).slice(-4),
        cmdDestruktif, dialog, isiDialog, dialogSetelahBatal,
        rmTidakJalan: !/rm -rf dist/.test(layarSebelumBatal.replace(/echo[^\\n]*/g, '')),
        destruktifTerdeteksi: A.destructive('rm -rf dist'),
        amanTidakTerdeteksi: A.destructive('echo ZEPHYR-RUN-OK'),
        paneId,
      });
    `, 90000),
  );
  check(
    'V6',
    v6.tombolBar &&
      v6.tombolBlok &&
      v6.adaOutput &&
      /dikirim ke terminal/i.test(v6.toastKirim) &&
      v6.dialog &&
      v6.isiDialog.includes('rm -rf dist') &&
      !v6.dialogSetelahBatal &&
      v6.rmTidakJalan &&
      v6.destruktifTerdeteksi === true &&
      v6.amanTidakTerdeteksi === false,
    `tombol "Jalankan di Terminal" muncul (action bar + blok kode); klik → shell menjalankan perintah, layar: ${JSON.stringify(v6.layarEkor)}; perintah destruktif "${v6.cmdDestruktif}" DITAHAN dialog konfirmasi & batal = tidak dieksekusi`,
  );

  // ───────── V7: cancel streaming benar-benar berhenti ─────────
  const v7 = JSON.parse(
    await cdp.runAsync(`
      await kirim('hitung SLOW');
      await wait(1400);
      const adaStop = !!q('[data-testid="ai-stop"]');
      const pendingSebelum = AS().pending;
      const sebelum = (A.messages().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
      await klik('[data-testid="ai-stop"]');
      await wait(300);
      const tepatSetelah = (A.messages().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
      // tunggu jauh lebih lama dari jeda token (400ms): kalau stream benar
      // berhenti, panjang teks TIDAK boleh bertambah lagi
      await wait(3500);
      const jauhSetelah = (A.messages().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
      const m = A.messages().filter(x => x.role === 'assistant').pop();
      return JSON.stringify({
        adaStop, pendingSebelum, sebelum, tepatSetelah, jauhSetelah,
        pendingSesudah: AS().pending,
        streaming: !!m.streaming,
        adaTombolKirim: !!q('[data-testid="ai-send"]'),
      });
    `),
  );
  check(
    'V7',
    v7.adaStop &&
      v7.pendingSebelum !== null &&
      v7.sebelum > 0 &&
      v7.jauhSetelah === v7.tepatSetelah &&
      v7.pendingSesudah === null &&
      !v7.streaming &&
      v7.adaTombolKirim,
    `Stop: panjang teks ${v7.sebelum} → ${v7.tepatSetelah} saat dibatalkan → tetap ${v7.jauhSetelah} setelah 3.5s (stream mati, bukan cuma UI); pending kembali null, tombol Kirim balik`,
  );

  // ───────── V8: batas 200 pesan + chat baru bersih ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(`
      const idAwal = AS().activeId;
      const sebelum = A.messages().length;
      // Isi sesi aktif melewati batas lewat store (tanpa 200 panggilan jaringan).
      const St = window.__ZEPHYR_AI__.store;
      St.setState((st) => ({
        sessions: st.sessions.map(x => x.id === idAwal ? {
          ...x,
          messages: Array.from({ length: 260 }, (_, i) => ({
            id: 'bulk-' + i, role: i % 2 ? 'assistant' : 'user',
            content: 'pesan ' + i, at: Date.now(),
          })).slice(-window.__ZEPHYR_AI__.maxMsgs),
        } : x),
      }));
      await wait(250);
      const setelahIsi = A.messages().length;
      const pertama = A.messages()[0]?.content ?? '';

      // chat baru harus bersih & jadi sesi aktif
      const idBaru = AS().newChat();
      await wait(300);
      const bersih = A.messages().length;
      const kosongUi = !!q('[data-testid="ai-empty"]');
      const jumlahSesi = AS().sessions.length;
      return JSON.stringify({
        max: window.__ZEPHYR_AI__.maxMsgs,
        sebelum, setelahIsi, pertama, bersih, kosongUi, jumlahSesi,
        idBeda: idBaru !== idAwal,
        sesiLamaMasihAda: AS().sessions.some(x => x.id === idAwal),
      });
    `),
  );
  check(
    'V8',
    v8.max === 200 &&
      v8.setelahIsi === 200 &&
      v8.pertama === 'pesan 60' &&
      v8.bersih === 0 &&
      v8.kosongUi &&
      v8.idBeda &&
      v8.sesiLamaMasihAda,
    `batas history: 260 pesan → tersisa ${v8.setelahIsi} (mulai dari "${v8.pertama}", yang tertua dibuang); chat baru = ${v8.bersih} pesan + empty-state tampil, sesi lama tetap tersimpan (${v8.jumlahSesi} sesi)`,
  );

  // ───────── V9: sesi terakhir direstore setelah reload ─────────
  const tandaRestore = `RESTORE-${Date.now().toString(36)}`;
  await cdp.runAsync(`
    // Tulis satu chat nyata (lewat provider mock) sebagai bahan restore.
    await kirim('tanda ${tandaRestore}');
    await tungguSelesai();
    return A.messages().length;
  `);
  const sebelumReload = JSON.parse(
    await cdp.runAsync(`
      return JSON.stringify({
        sesi: AS().sessions.length,
        pesan: A.messages().length,
        judul: AS().activeSession()?.title ?? '',
        adaLs: (A.persisted() ?? '').includes('${tandaRestore}'),
      });
    `),
  );

  await cdp.send('Page.enable');
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(6000);
  // Reload memutus konteks CDP lama → sambung ulang.
  cdp.close();
  const targets2 = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page2 = targets2.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  cdp = await Cdp.connect(page2.webSocketDebuggerUrl);
  for (let i = 0; i < 40; i++) {
    if ((await cdp.eval('typeof window.__ZEPHYR_AI__')) !== 'undefined') break;
    await sleep(300);
  }

  const v9 = JSON.parse(
    await cdp.runAsync(`
      await wait(600);
      const msgs = A.messages();
      return JSON.stringify({
        sesi: AS().sessions.length,
        pesan: msgs.length,
        judul: AS().activeSession()?.title ?? '',
        adaTanda: msgs.some(m => m.content.includes('${tandaRestore}')),
        adaStreamingNyangkut: msgs.some(m => m.streaming),
        pending: AS().pending,
        bubbleDom: qa('[data-ai-msg]').length,
      });
    `),
  );
  check(
    'V9',
    sebelumReload.adaLs &&
      v9.sesi === sebelumReload.sesi &&
      v9.pesan === sebelumReload.pesan &&
      v9.adaTanda &&
      !v9.adaStreamingNyangkut &&
      v9.pending === null,
    `setelah reload halaman: ${v9.sesi} sesi & ${v9.pesan} pesan kembali dari localStorage (judul "${v9.judul}", penanda ${tandaRestore} ada), ${v9.bubbleDom} bubble ter-render, tidak ada pesan yang nyangkut status "streaming"`,
  );

  // ───────── V10: RAM + tanpa console error + bersih ─────────
  const v10 = JSON.parse(
    await cdp.runAsync(`
      // Panel AI dibuka dengan chat terisi, lalu ukur RAM proses (event ram-usage).
      await bukaAi();
      await wait(3500);
      const ram = S.getState().ramBytes;
      // bersih-bersih: hapus key uji, kosongkan chat, kembalikan settings &
      // panel. Key user dipulihkan dari cadangan berkas oleh sisi Node
      // (lihat backupSecrets/restoreSecrets di main()).
      await X.setKey('gemini', '');
      await X.setKey('anthropic', '');
      // Kembalikan baseUrl provider ke nilai asli. Nilai null menghapus
      // key (RFC 7386), jadi provider yang tadinya tidak punya baseUrl
      // kembali tanpa baseUrl, bukan tetap menunjuk mock.
      const origProv = window.__ZV9_ORIG_PROVIDERS__ ?? {};
      const balik = {};
      for (const k of ['gemini', 'openai', 'anthropic']) {
        const v = origProv[k]?.baseUrl;
        balik[k] = { baseUrl: v ? v : null };
      }
      await s.applySettings({ models: { providers: balik } });
      await X.resetAll();
      await s.reloadSettings();
      for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
      AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
      localStorage.removeItem('zephyr.ai.sessions.v1');
      S.getState().tabs.slice().forEach(t => S.getState().forceCloseTab(t.id));
      window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
      T.getState().setVisible(true);
      S.getState().setSettingsOpen(false);
      S.getState().setActivity('explorer');
      await wait(600);
      return JSON.stringify({
        ram,
        errors: window.__ZEPHYR_ERRORS__,
        keySisa: (await X.publicModels()).filter(x => x.hasKey).map(x => x.provider),
        sesiSisa: AS().sessions.length,
      });
    `),
  );
  const mb = Math.round(v10.ram / (1024 * 1024));
  check(
    'V10',
    v10.ram > 0 &&
      mb < 500 &&
      v10.errors.length === 0 &&
      // Yang wajib bersih hanya key UJI (gemini/anthropic). Key milik user
      // (github, custom) memang harus TETAP ADA — menghapusnya adalah bug,
      // bukan syarat lulus.
      v10.keySisa.every((x) => !['gemini', 'anthropic'].includes(x)) &&
      v10.sesiSisa <= 1,
    `RAM proses dengan panel AI + chat = ${mb} MB (< 500 MB); console error: ${v10.errors.length === 0 ? 'tidak ada' : JSON.stringify(v10.errors)}; key uji (gemini/anthropic) dihapus, key user tetap: ${JSON.stringify(v10.keySisa)}, chat dikosongkan`,
  );

  cdp.close();
  if (mock) mock.kill();
  restoreSecrets();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  // Key user dikembalikan walau harness gagal di tengah jalan.
  restoreSecrets();
  console.error('verify09 error:', e.message ?? e);
  process.exitCode = 2;
});
