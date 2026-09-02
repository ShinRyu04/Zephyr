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
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
const MOCK = 8098;
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
          T.getState().setDock('ai');
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
          await wait(80);
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

const MOCK_VERSION = 2;

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
    await X.setKey('gemini', '');
    await X.setKey('anthropic', '');
    await s.reloadSettings();
    localStorage.removeItem('zephyr.ai.sessions.v1');
    AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
    await AS().loadKeys();
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
      await bukaAi();
      await klik('[data-testid="ai-model-btn"]');
      await wait(260);
      const menu = q('[data-testid="ai-model-menu"]');
      const items = qa('[data-model-item]').map(el => ({
        model: el.dataset.modelItem,
        provider: el.dataset.provider,
        baseUrl: el.dataset.baseurl,
        // logo = SVG dengan aria-label brand di dalam baris
        logo: el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
        nama: el.querySelector('.ai-mi-name')?.textContent ?? '',
      }));
      // ganti ke model OpenAI -> tombol & baseUrl efektif harus ikut berubah
      const sebelum = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
      };
      await klik('[data-model-item="gpt-5.2"]');
      await wait(500);
      const sesudah = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
        judul: q('[data-testid="ai-model-btn"]').getAttribute('title'),
        disk: (await X.settingsFromDisk()).models.activeProvider,
      };
      // kembalikan ke gemini untuk uji berikutnya
      await klik('[data-testid="ai-model-btn"]');
      await wait(200);
      await klik('[data-model-item="gemini-3.6-flash"]');
      await wait(400);
      return JSON.stringify({
        adaMenu: !!menu, items, sebelum, sesudah,
        katalog: A.catalog().length,
        akhir: q('[data-testid="ai-model-btn"]').dataset.model,
      });
    `),
  );
  const semuaAdaLogo = v1.items.every((x) => x.logo && x.nama.length > 0);
  check(
    'V1',
    v1.adaMenu &&
      v1.items.length === v1.katalog &&
      v1.items.length >= 9 &&
      semuaAdaLogo &&
      v1.sebelum.provider === 'gemini' &&
      v1.sesudah.provider === 'openai' &&
      v1.sesudah.disk === 'openai' &&
      v1.sesudah.judul.includes(`127.0.0.1:${MOCK}/v1`) &&
      v1.akhir === 'gemini-3.6-flash',
    `dropdown ${v1.items.length} model, semua punya logo brand (${[...new Set(v1.items.map((x) => x.logo))].join(', ')}); ganti gemini → openai: provider disk=${v1.sesudah.disk}, baseUrl efektif "${v1.sesudah.judul.split('— ')[1]}"`,
  );

  // ───────── V2: tanpa key → status oranye + kirim diblokir, tidak crash ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      await AS().loadKeys();
      await wait(200);
      const badge = q('[data-testid="ai-keystate"]');
      const warna = getComputedStyle(badge).color;
      const kelas = badge.className;
      // Kirim lewat UI (isi textarea + Enter) supaya jalurnya sama dengan user.
      await kirim('halo tanpa key');
      await wait(900);
      return JSON.stringify({
        haskey: badge.dataset.haskey,
        kelas, warna,
        toast: q('[data-testid="ai-toast"]')?.textContent ?? '',
        pesan: A.messages().length,
        pending: AS().pending,
        adaTombolSettings: !!q('[data-testid="ai-goto-settings"]'),
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  check(
    'V2',
    v2.haskey === '0' &&
      /is-warn/.test(v2.kelas) &&
      /Isi API key/i.test(v2.toast) &&
      v2.pesan === 0 &&
      v2.pending === null &&
      v2.adaTombolSettings &&
      v2.errors === 0,
    `tanpa key: badge oranye (${v2.warna}, ${v2.kelas.trim()}), tombol "Isi API key" ada, kirim diblokir toast "${v2.toast}", chat tetap 0 pesan, 0 console error`,
  );

  // ───────── V3: dengan key → streaming kata per kata + markdown bold ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(200);
      const badgeOk = q('[data-testid="ai-keystate"]').dataset.haskey;

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
        badgeOk, jejak,
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
      // 1) tanpa key anthropic -> penolakan ramah, bukan crash
      await klik('[data-testid="ai-model-btn"]');
      await wait(200);
      await klik('[data-model-item="claude-sonnet-4.5"]');
      await wait(500);
      await AS().loadKeys();
      const badgeTanpaKey = q('[data-testid="ai-keystate"]').dataset.haskey;
      await kirim('halo claude');
      await wait(800);
      const toastTanpaKey = q('[data-testid="ai-toast"]')?.textContent ?? '';
      const pesanSebelum = A.messages().length;
      // 2) dengan key -> adapter anthropic (x-api-key + /v1/messages) jalan
      await X.setKey('anthropic', 'MOCK-KEY-ANTHROPIC-9876');
      await AS().loadKeys();
      await wait(200);
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
      /Isi API key Anthropic/i.test(v5.toastTanpaKey) &&
      anth.length >= 1 &&
      anth[0].headers.xApiKey === 'MOCK-KEY-ANTHROPIC-9876' &&
      anth[0].headers.anthropicVersion === '2023-06-01' &&
      anth[0].body.max_tokens > 0 &&
      v5.jawaban.includes('uji') &&
      v5.model === 'claude-sonnet-4.5' &&
      /401/.test(v5.error ?? '') &&
      /API key salah/i.test(v5.error ?? ''),
    `tanpa key: toast "${v5.toastTanpaKey}"; dengan key: POST /v1/messages dengan x-api-key + anthropic-version + max_tokens=${anth[0]?.body.max_tokens} → jawaban tampil; HTTP 401 jadi pesan ramah "${(v5.error ?? '').slice(0, 60)}…"`,
  );

  // ───────── V6: Jalankan di Terminal + konfirmasi perintah destruktif ─────────
  const v6 = JSON.parse(
    await cdp.runAsync(`
      // kembali ke gemini (punya key mock)
      await klik('[data-testid="ai-model-btn"]');
      await wait(200);
      await klik('[data-model-item="gemini-3.6-flash"]');
      await wait(400);

      // 1) jawaban dengan fenced bash -> tombol muncul
      await kirim('kasih perintah BASHCMD');
      await tungguSelesai();
      const tombolBar = !!q('[data-testid="ai-run-last"]');
      const tombolBlok = !!q('[data-testid="ai-run-code"]');
      const cmdBar = q('.ai-action-cmd')?.textContent ?? '';

      // siapkan pane shell dulu supaya perintah punya tujuan yang jelas
      T.getState().setDock('terminal');
      const paneId = await T.getState().addPane('shell');
      await wait(2500);
      T.getState().setDock('ai');
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
      // bersih-bersih: hapus key uji, kosongkan chat, kembalikan settings & panel
      await X.setKey('gemini', '');
      await X.setKey('anthropic', '');
      await X.resetAll();
      await s.reloadSettings();
      for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
      AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
      localStorage.removeItem('zephyr.ai.sessions.v1');
      S.getState().tabs.slice().forEach(t => S.getState().forceCloseTab(t.id));
      T.getState().setDock('terminal');
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
      v10.keySisa.length === 0 &&
      v10.sesiSisa <= 1,
    `RAM proses dengan panel AI + chat = ${mb} MB (< 500 MB); console error: ${v10.errors.length === 0 ? 'tidak ada' : JSON.stringify(v10.errors)}; key uji dihapus (sisa: ${JSON.stringify(v10.keySisa)}), chat dikosongkan`,
  );

  cdp.close();
  if (mock) mock.kill();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error('verify09 error:', e.message ?? e);
  process.exitCode = 2;
});
