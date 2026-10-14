// lib-cdp.mjs — klien CDP bersama untuk harness verifikasi (dipakai verify15+).
//
// Dipisah dari verify*.mjs karena setiap harness sebelumnya menyalin kelas yang
// sama; satu salinan lebih mudah diperbaiki saat WebView2 berulah.
//
// Pelajaran yang sudah dibayar mahal dan dikodekan di sini:
//   * `Runtime.evaluate` dengan `awaitPromise:true` sering gagal di WebView2
//     ("Promise was collected"). `runAsync()` menyimpan promise di `window`
//     lalu polling status — itu satu-satunya cara yang stabil.
//   * Command Tauri yang PANIK membuat `invoke` menggantung selamanya, jadi
//     apa pun yang menguji panic wajib memakai timeout sendiri.

import WebSocket from 'ws';

/* Tee ke berkas: di mesin ini stdout process latar (node dijalankan lewat
   terminal Hermes) kadang dimakan ("stdin is not a tty" tanpa isi lain),
   sehingga laporan harness hilang walau run-nya benar-benar jalan. Set
   UJI_LOG=<path> dan setiap baris laporan ikut ditulis ke berkas itu. */
if (process.env.UJI_LOG) {
  const { appendFileSync: _tulis } = await import('node:fs');
  const _berkas = process.env.UJI_LOG;
  for (const _nama of ['log', 'error']) {
    const _asli = console[_nama].bind(console);
    console[_nama] = (...a) => {
      const baris = a.map((x) => (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
      try { _tulis(_berkas, baris + '\n'); } catch { /* laporan tidak boleh menjatuhkan uji */ }
      _asli(...a);
    };
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Batas waktu tiap panggilan CDP. Harness yang membeku tanpa pesan adalah
 * kerugian ganda: run-nya menghabiskan jatah waktu runner DAN tidak
 * meninggalkan bukti apa pun. Karena itu setiap permintaan punya jaring
 * sendiri, bukan hanya loop di atasnya.
 */
export const BATAS_PANGGILAN_MS = Number(process.env.ZEPHYR_CDP_BATAS_MS ?? 20000);

/**
 * Tunggu sampai bridge dev (`window.__ZEPHYR_*__`) benar-benar terpasang.
 *
 * Sebagian bridge dipasang lewat `void import('./agentTools').then(...)`, dan
 * seluruh `installDevBridge` baru jalan beberapa saat setelah halaman selesai
 * memuat. Harness yang memeriksa langsung setelah attach lalu mati dengan
 * "bridge tidak ada" / "__ZEPHYR_THEME__ tidak ada" — padahal app-nya sehat dan
 * bridge-nya muncul sepersekian detik kemudian. Itu kegagalan balapan, bukan
 * regresi kode, jadi tunggu (poll), jangan memeriksa sekali.
 */
export async function tungguBridge(cdp, nama, batasMs = 25000) {
  const batas = Date.now() + batasMs;
  for (;;) {
    let ada = false;
    try {
      ada = (await cdp.eval(`typeof window[${JSON.stringify(nama)}] !== 'undefined'`, 5000)) === true;
    } catch {
      /* halaman sedang reload */
    }
    if (ada) return true;
    if (Date.now() > batas) return false;
    await sleep(400);
  }
}

/**
 * Bangunkan renderer yang membeku, lewat endpoint BROWSER.
 *
 * `Target.*` dan `Page.reload` dilayani proses browser, jadi keduanya masih
 * dijawab saat renderer halamannya sendiri sudah tidak menjawab apa pun. Ini
 * jalur pemulihan satu-satunya yang tidak perlu mematikan app user: halaman
 * yang beku direload di tempat, lalu bisa dipakai lagi.
 *
 * Kembalian: jumlah halaman yang direload.
 */
async function pulihkanLewatBrowser(port) {
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  let id = 0;
  const tunggu = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const p = tunggu.get(m.id);
    if (p) {
      tunggu.delete(m.id);
      p(m);
    }
  });
  const kirim = (method, params = {}, sessionId) =>
    new Promise((res) => {
      const i = ++id;
      tunggu.set(i, res);
      const jaring = setTimeout(() => {
        if (tunggu.delete(i)) res({ timeout: true });
      }, 5000);
      /* Tidak di-unref(): timer yang di-unref tidak menahan event loop, jadi
         socket yang macet berakhir sebagai proses keluar diam-diam, bukan
         sebagai timeout. */
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  try {
    const tg = await kirim('Target.getTargets');
    let jumlah = 0;
    for (const t of (tg.result?.targetInfos ?? []).filter((x) => x.type === 'page')) {
      const at = await kirim('Target.attachToTarget', { targetId: t.targetId, flatten: true });
      const sid = at.result?.sessionId;
      if (!sid) continue;
      const cek = await kirim('Runtime.evaluate', { expression: '1+1', returnByValue: true }, sid);
      if (cek.result?.result?.value === 2) continue; // halaman ini sudah sehat
      await kirim('Page.enable', {}, sid);
      await kirim('Page.reload', { ignoreCache: false }, sid);
      jumlah++;
    }
    return jumlah;
  } finally {
    try {
      ws.close();
    } catch {
      /* sudah tutup */
    }
  }
}

export class Cdp {
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
        clearTimeout(p.jaring);
        p.resolve(msg);
      }
    });
    /*
     * Socket mati = semua permintaan yang masih menunggu TIDAK AKAN PERNAH
     * dijawab. Tanpa ini, `send` menggantung selamanya: harness membeku tanpa
     * error, deadline di sekitarnya (runAsync) tidak pernah dievaluasi karena
     * ia menunggu eval di dalam loop-nya, dan runner suite hanya melihat
     * "timeout" tanpa satu baris pun alasan. Terjadi saat app reload / WebView2
     * membuang konteks di tengah uji.
     */
    c.#ws.on('close', () => c.#tolakSemua(new Error('socket CDP tertutup: app reload / target hilang?')));
    c.#ws.on('error', (e) => c.#tolakSemua(new Error(`socket CDP error: ${e?.message ?? e}`)));
    return c;
  }

  #tolakSemua(err) {
    for (const [, p] of this.#pending) {
      clearTimeout(p.jaring);
      p.reject(err);
    }
    this.#pending.clear();
  }

  /**
   * Sambung ke tab Zephyr lewat /json/list.
   *
   * PENTING — harness MENGUBAH settings user. Semua uji AI menulis baseUrl
   * provider ke mock (127.0.0.1:8098) supaya tidak memakai kuota; kalau nilai
   * itu tidak dikembalikan, app user mengirim request ke mock dan jawabannya
   * palsu tanpa ia tahu. Karena itu setiap attach mengambil SNAPSHOT dulu, dan
   * close() mengembalikannya otomatis — tidak bergantung pada disiplin tiap
   * harness.
   */
  static async attach(port = '9223', judul = 'Zephyr') {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    // `judul` boleh berupa DAFTAR nama, dicoba satu per satu (bukan regex).
    // Judul jendela bisa berbeda antara dev dan build, dan harness yang
    // tidak menemukan targetnya MATI sebelum mengukur apa pun - kegagalannya
    // lalu menyamar sebagai masalah lingkungan, bukan masalah nyata yang
    // sedang diburu.
    const daftar = Array.isArray(judul) ? judul : [judul];
    const kandidat = [];
    for (const j of daftar) {
      for (const t of targets) {
        if (t.type === 'page' && (t.title ?? '').includes(j)) kandidat.push(t);
      }
      if (kandidat.length) break;
    }
    // Jaring terakhir: kalau judulnya tidak dikenal sama sekali, pakai halaman
    // Tauri yang ada. Menyerah di sini membuat harness mustahil dijalankan
    // pada build dengan judul lain.
    if (!kandidat.length) {
      kandidat.push(...targets.filter((t) => t.type === 'page' && t.url?.startsWith('http://tauri.localhost')));
    }
    if (!kandidat.length) throw new Error(`target ${daftar.join('/')} tidak ditemukan di :${port}`);

    /*
     * Pilih target yang BENAR-BENAR MENJAWAB.
     *
     * Setelah webview reload, daftar /json/list sempat memuat target LAMA dengan
     * judul dan URL yang sama persis. Koneksi websocket ke target mati itu tetap
     * DITERIMA (yang menjawab server devtools, bukan halaman), tapi tidak ada
     * satu pun perintah yang dijawab. Harness yang memilih target pertama secara
     * membabi buta lalu membeku tanpa pesan — dulu ini menyamar sebagai
     * "app tidak siap" dan memaksa orang menebak-nebak. Karena itu tiap kandidat
     * diprobe dengan eval sepele dan yang bisu dilewati.
     */
    let galatTerakhir;
    const coba = async () => {
      for (const page of kandidat) {
        let cdp;
        try {
          cdp = await Cdp.connect(page.webSocketDebuggerUrl);
          const balas = await cdp.eval('1+1', 4000);
          if (balas !== 2) throw new Error(`probe menjawab ${JSON.stringify(balas)}, bukan 2`);
        } catch (e) {
          galatTerakhir = e;
          try { cdp?.close(); } catch { /* sudah mati */ }
          continue;
        }
        try {
          cdp.snapshot = await cdp.json(
            `return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__?.getState?.();
  if (!s) return null;
  // SELURUH settings disimpan (bukan sebagian): harness ada yang memanggil
  // reset_settings yang MENGHAPUS file, dan key yang tidak disimpan di sini
  // hilang permanen — pernah kejadian: key sidebar hilang sampai menu kiri
  // tidak ter-render (kelas sidebar-pos-undefined).
  return { penuh: s.settings ?? null };
})())`,
            30000,
          );
        } catch {
          // Halaman belum siap / bukan app Zephyr — lewati pemulihan.
          cdp.snapshot = null;
        }
        return { cdp, page };
      }
      return null;
    };

    let hasil = await coba();
    if (hasil) return hasil;

    /*
     * Semua kandidat bisu: renderer-nya yang macet, bukan daftarnya yang salah.
     * WebView2 bisa membeku di tengah kerja (halaman tetap terdaftar, websocket
     * tetap menerima koneksi, tapi tidak satu pun perintah dijawab). Reload
     * dilayani proses BROWSER, jadi masih bisa dipakai untuk membangunkan
     * renderer — sekali percobaan, lalu probe ulang.
     */
    const dibangunkan = await pulihkanLewatBrowser(port).catch(() => 0);
    if (dibangunkan) {
      await sleep(3000);
      hasil = await coba();
      if (hasil) return hasil;
    }

    throw new Error(
      `tidak ada target ${daftar.join('/')} yang menjawab di :${port} (${kandidat.length} kandidat, semua bisu, ${dibangunkan} direload): ${galatTerakhir?.message}`,
    );
  }

  send(method, params = {}, batasMs = BATAS_PANGGILAN_MS) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      /*
       * Socket yang sudah tidak terbuka: menolak SEGERA.
       *
       * `ws.send()` di socket tertutup hanya memancarkan 'error' lewat
       * process.nextTick; kalau saat itu event loop sudah tidak punya handle
       * lain, Node menguras loop dan mati dengan "Detected unsettled top-level
       * await" + exit 13 - tanpa satu baris pun alasan, seolah skripnya cuma
       * berhenti. Menolak di sini membuat penyebabnya terlihat.
       */
      if (this.#ws.readyState !== 1) {
        reject(new Error(`socket CDP tidak terbuka (readyState=${this.#ws.readyState}): ${method}`));
        return;
      }
      /*
       * Batas waktu per panggilan. Timer ini SENGAJA tidak di-unref(): socket
       * yang setengah mati (TCP hidup, target berhenti menjawab) tidak
       * mengirim 'close', dan timer yang di-unref() tidak menahan event loop
       * tetap hidup - jadi permintaan yang menggantung berakhir sebagai proses
       * yang keluar diam-diam, bukan sebagai timeout yang bisa dibaca.
       */
      const jaring = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`timeout ${batasMs}ms: ${method} tidak dijawab (socket CDP macet?)`));
      }, batasMs);
      this.#pending.set(id, { resolve, reject, jaring });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr, batasMs = BATAS_PANGGILAN_MS) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      userGesture: true,
    }, batasMs);
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    }
    return r.result?.result?.value;
  }

  /**
   * Tangkap layar, kembalikan data PNG dalam base64.
   *
   * `clip` opsional: `{ x, y, width, height }` dalam piksel CSS. Tanpa itu,
   * seluruh viewport yang diambil.
   *
   * Ada alasannya ini disediakan: keluhan seperti "melayang" dan "ketimbun"
   * hanya bisa dinilai dengan MATA. Angka tinggi dan nilai overflow tidak
   * menangkap kesan visualnya - panel bisa lolos semua pemeriksaan angka dan
   * tetap terlihat salah bagi orang yang memakainya.
   */
  async screenshot(clip) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) {
      params.clip = { ...clip, scale: 1 };
      /* Tanpa ini, WebView2 memotong wilayah di luar viewport alih-alih
         mengembalikan yang kosong - dan hasilnya PNG yang tampak benar
         tapi isinya salah tempat. */
      params.captureBeyondViewport = false;
    }
    const r = await this.send('Page.captureScreenshot', params);
    if (r.error) throw new Error(`screenshot: ${JSON.stringify(r.error)}`);
    if (!r.result?.data) throw new Error('screenshot: tidak ada data yang dikembalikan');
    return r.result.data;
  }

  /** Jalankan body async DI HALAMAN lalu polling hasilnya.
   *  Pintasan yang tersedia di dalam body: S/s (store), T/TS (terminal),
   *  B (__ZEPHYR_BUG__), D (__ZEPHYR_DIAG__), G (git), M (mcp), X (ai),
   *  CP (palette), SET (settings), PTY, q/qa (querySelector), wait, tangkap. */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV15_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const B = window.__ZEPHYR_BUG__;
        const D = window.__ZEPHYR_DIAG__;
        const G = window.__ZEPHYR_GIT__;
        const M = window.__ZEPHYR_MCP__;
        const X = window.__ZEPHYR_AI__;
        const CP = window.__ZEPHYR_CP__;
        const SET = window.__ZEPHYR_SET__;
        const PTY = window.__ZEPHYR_PTY__;
        /** fase 21/24: bridge yang datang belakangan (boleh undefined di app lama) */
        const LSP = window.__ZEPHYR_LSP__;
        const EX = window.__ZEPHYR_EXTRAS__;
        /** fase 19: bridge Extensions native */
        const E19 = window.__ZEPHYR_EXT19__;
        /** fase 23: bridge Tasks */
        const TK = window.__ZEPHYR_TASK__;
        /** fase 26: bridge Timeline / Local History */
        const HS = window.__ZEPHYR_HIST__;
        /** fase 25: bridge Global Search (ripgrep) */
        const SR = window.__ZEPHYR_SRC__;
        /** fase 22: bridge Run & Debug (DAP) */
        const DBG = window.__ZEPHYR_DBG__;
        const CLI = window.__ZEPHYR_CLI__;
        /** fase 29: bridge multi-root + Workspace Trust */
        const WS = window.__ZEPHYR_WS__;
        /** fase 30: bridge Snippets */
        const SN = window.__ZEPHYR_SNIP__;
        /** fase 31: bridge Accessibility */
        const AY = window.__ZEPHYR_A11Y__;
        const CM = () => window.__ZEPHYR_CM__();
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        /** tangkap error command Rust sebagai objek biasa (bukan throw) */
        const tangkap = async (fn) => {
          try { const v = await fn(); return { ok: true, value: v ?? null }; }
          catch (e) {
            return { ok: false, code: e && e.code ? e.code : null,
                     message: e && e.message ? e.message : String(e) };
          }
        };
        /** buka Settings di section tertentu (panel terminal maximized bikin
         *  .editor-area display:none — pelajaran fase 13). */
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
      const mentah = await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`);
      // Halaman bisa RELOAD di tengah uji (Vite HMR saat berkas src disunting) sehingga slot hilang
      // dan eval mengembalikan "undefined"; dulu ini meledak jadi SyntaxError JSON.parse yang menyesatkan.
      if (mentah === undefined || mentah === 'undefined') {
        if (Date.now() > deadline) {
          throw new Error(
            `timeout: halaman sepertinya RELOAD di tengah uji (slot ${slot} hilang) — ${body.slice(0, 60)}…`
          );
        }
        continue;
      }
      const st = JSON.parse(mentah);
      if (st.done) {
        await this.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'x'; })()`);
        if (st.error) throw new Error(st.error);
        return st.value;
      }
      if (Date.now() > deadline) throw new Error(`timeout: ${body.slice(0, 70)}…`);
    }
  }

  /** runAsync yang hasilnya JSON.parse. */
  async json(body, timeoutMs = 60000) {
    return JSON.parse(await this.runAsync(body, timeoutMs));
  }

  /**
   * Tutup koneksi, tapi KEMBALIKAN dulu settings yang diubah harness.
   *
   * KENAPA di sini: harness ditulis cepat dan sering lupa membersihkan; akibatnya
   * settings user perlahan menunjuk ke mock. Memulihkan di satu tempat
   * (close) jauh lebih andal daripada mengandalkan tiap harness.
   */
  async close() {
    if (this.snapshot) {
      try {
        await this.json(
          `return JSON.stringify(await (async () => {
  const snap = ${JSON.stringify(this.snapshot)};
  const S = window.__ZEPHYR__;
  const asli = snap.penuh ?? snap;
  const kini = S.getState().settings ?? {};

  // 1. Provider yang menunjuk mock DIPULIHKAN ke nilai aslinya. Snapshot yang
  //    sendiri sudah tercemar mock tidak dipakai (menulisnya kembali akan
  //    memperburuk keadaan).
  const patch = {};
  const kiniProv = kini.models?.providers ?? {};
  const asliProv = asli.models?.providers ?? {};
  const pulihProv = {};
  for (const [k, v] of Object.entries(asliProv)) {
    const sekarang = kiniProv[k]?.baseUrl ?? '';
    const benar = v?.baseUrl ?? '';
    if (sekarang.includes('127.0.0.1:8098') && !benar.includes('127.0.0.1:8098')) {
      pulihProv[k] = { baseUrl: benar, model: v?.model ?? '' };
    }
  }
  if (Object.keys(pulihProv).length) patch.models = { providers: pulihProv };

  // 2. Key yang HILANG dikembalikan. Ini yang dulu bocor: harness memanggil
  //    reset_settings (menghapus file), lalu key seperti sidebar tidak
  //    pernah kembali -> sidebar tidak ter-render sama sekali.
  for (const [k, v] of Object.entries(asli)) {
    if (k === 'models') continue; // sudah ditangani di atas
    if (kini[k] === undefined) patch[k] = v;
  }

  if (Object.keys(patch).length) await S.getState().applySettings(patch);
  await new Promise((r) => setTimeout(r, 400));
  return Object.keys(patch);
})())`,
          60000,
        );
      } catch {
        // Koneksi mungkin sudah tidak sehat — pemulihan best-effort.
      }
    }
    this.#ws.close();
  }
}

/** Pencatat hasil V1..Vn dengan format seragam. */
export function reporter(nama) {
  const results = [];
  const check = (id, ok, detail) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
  };
  const selesai = () => {
    const lulus = results.filter((r) => r.ok).length;
    console.log(`\n== ${lulus}/${results.length} lulus ==`);
    if (lulus !== results.length) process.exitCode = 1;
    return { lulus, total: results.length };
  };
  return { check, selesai, results, nama };
}

/**
 * Keluar TANPA menelan output.
 *
 * `process.exit()` tidak menunggu stdout. Saat harness dialihkan ke berkas atau
 * pipa - persis yang dilakukan runner suite - baris yang masih di buffer hilang,
 * dan run yang berakhir dengan "EXIT=1" tidak menyisakan satu pun baris GAGAL
 * untuk menjelaskan sebabnya: daftar kegagalan itulah yang lenyap lebih dulu.
 *
 * Menulis potongan kosong dan keluar dari callback-nya mempertahankan kode keluar
 * yang sama sekaligus memastikan semua yang sudah diantre benar-benar sampai ke
 * OS. Jaring 1 detik menjaga proses tidak menggantung bila callback tak datang
 * (mis. stdout sudah tertutup).
 */
export function keluarBersih(kode) {
  const jaring = setTimeout(() => process.exit(kode), 1000);
  process.stdout.write('', () => {
    clearTimeout(jaring);
    process.exit(kode);
  });
}

/** JSON-RPC ke server MCP. `status: 0` = port tidak listening (fetch melempar). */
export async function rpc(port, method, params = {}, token = null, id = 1) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: String(e.message ?? e) };
  }
}
