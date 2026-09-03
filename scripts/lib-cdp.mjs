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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        p(msg);
      }
    });
    return c;
  }

  /** Sambung ke tab Zephyr lewat /json/list. */
  static async attach(port = '9223', judul = 'Zephyr') {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page' && (t.title ?? '').includes(judul));
    if (!page) throw new Error(`target ${judul} tidak ditemukan di :${port}`);
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    return { cdp, page };
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
      const st = JSON.parse(await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`));
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

  close() {
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
