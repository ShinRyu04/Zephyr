// verify06.mjs — verifikasi V1..V12 fase 06 (multi-pane + AI agent + browser)
// lewat CDP di app yang benar-benar berjalan.
//
// Pakai:  node scripts/verify06.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup — app dev memuat dari sana
//
// Server uji untuk V7 dijalankan sendiri oleh skrip ini di port 8099.
// CATATAN: port 8080 TIDAK bisa dipakai di mesin Windows ini
// (WinError 10013 — masuk excluded port range Hyper-V/WinNAT).

import WebSocket from 'ws';
import { createServer } from 'node:http';

const PORT = process.argv[2] ?? '9223';
const TEST_PORT = 8099;
const MARKER = 'HALO-DARI-BROWSER-PANE';
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
    const slot = `__ZV6_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const t = window.__ZEPHYR_TERM__.getState();
        const P = window.__ZEPHYR_PTY__;
        const q = (sel) => document.querySelector(sel);
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
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
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(5)} ${detail}`);
};

/** Server statis kecil untuk V7; menghitung request yang masuk. */
function startTestServer() {
  let hits = 0;
  const srv = createServer((req, res) => {
    hits++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body><h1 id="marker">${MARKER}</h1></body></html>`);
  });
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(TEST_PORT, '127.0.0.1', () =>
      resolve({ srv, hits: () => hits, close: () => new Promise((r) => srv.close(r)) }),
    );
  });
}

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_TERM__')) === 'undefined') {
    throw new Error('__ZEPHYR_TERM__ tidak ada — reload halaman');
  }

  // Bersihkan state terminal & editor.
  await cdp.runAsync(`
    for (const x of t.terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    window.__ZEPHYR_ERRORS__.length = 0;
    T.getState().setHeight(520);
    return 'reset';
  `);
  await sleep(600);

  // ───────── V1: placeholder tab kosong ─────────
  const v1 = JSON.parse(
    await cdp.eval(`JSON.stringify({
      placeholder: !!document.querySelector('[data-testid="pane-empty"]'),
      tombol: [...document.querySelectorAll('.pane-empty-actions button')].map(b => b.textContent.trim()),
      sub: document.querySelector('.pane-empty-sub')?.textContent ?? '',
    })`),
  );
  check(
    'V1',
    v1.placeholder && v1.tombol.length === 4 && /6 panes/.test(v1.sub),
    `placeholder tampil dengan tombol [${v1.tombol.join(', ')}] dan keterangan "${v1.sub}"`,
  );

  // ───────── V2: Shell + Private lewat klik DOM ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      q('[data-testid="empty-shell"]').click();
      await wait(2200);
      q('[data-testid="term-picker"]').click();
      await wait(320);
      q('[data-testid="term-new-private"]').click();
      await wait(2600);
      const tab = T.getState().terminalTabs[0];
      return JSON.stringify({
        panes: tab.panes.map(p => ({ kind: p.kind, title: p.title, pid: p.pid, status: p.status })),
        domPanes: document.querySelectorAll('.pane').length,
        xterm: document.querySelectorAll('.pane .xterm-screen').length,
        incognito: !!q('[data-pane-kind="private"] svg[aria-label^="Private"]'),
      });
    `),
  );
  const pidUnikV2 = new Set(v2.panes.map((p) => p.pid)).size === 2;
  check(
    'V2',
    v2.panes.length === 2 &&
      v2.panes[0].kind === 'shell' &&
      v2.panes[1].kind === 'private' &&
      v2.panes.every((p) => p.pid > 0 && p.status === 'live') &&
      pidUnikV2 &&
      v2.domPanes === 2 &&
      v2.xterm === 2 &&
      v2.incognito,
    `2 pane hidup: ${v2.panes.map((p) => `${p.title}(pid ${p.pid})`).join(' + ')}; ` +
      `xterm terpasang=${v2.xterm}, ikon incognito=${v2.incognito}, pid unik=${pidUnikV2}`,
  );

  // ───────── V3: agent picker + logo ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      q('[data-testid="term-agent"]').click();
      await wait(400);
      const picker = q('[data-testid="agent-picker"]');
      const items = [...picker.querySelectorAll('.tt-drop-item')].map(b => ({
        id: b.dataset.agent, label: b.textContent.trim(), logo: !!b.querySelector('svg'),
      }));
      const fromRust = await P.agents();
      return JSON.stringify({ items, fromRust: fromRust.map(a => a.id) });
    `),
  );
  check(
    'V3',
    v3.items.length > 0 &&
      v3.items.every((i) => i.logo && i.id) &&
      v3.items.map((i) => i.id).join() === v3.fromRust.join(),
    `CLI terdeteksi di mesin: ${v3.items.map((i) => `${i.label}[${i.id}]`).join(', ')} — semua punya logo; ` +
      `sama dengan hasil list_agents Rust (${v3.fromRust.join(', ')})`,
  );

  const agentId = v3.items[0]?.id;
  if (!agentId) throw new Error('tidak ada agent CLI di mesin ini — V4/V5/V9/V11 tidak bisa diuji');

  // ───────── V4: spawn agent, output nyata ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(
      `
      q('[data-agent=${JSON.stringify(agentId)}]').click();
      await wait(1500);
      const tab = T.getState().terminalTabs[0];
      const ap = tab.panes.find(p => p.kind === 'agent');
      // tunggu sampai agent menggambar sesuatu (maks 20s)
      let isi = '';
      for (let i = 0; i < 40; i++) {
        await wait(500);
        isi = P.read(ap.id, 60);
        if (isi.replace(/\\s/g, '').length > 40) break;
      }
      const info = (await P.list()).find(x => x.id === ap.id);
      return JSON.stringify({
        title: ap.title, pid: ap.pid, agent: ap.agent,
        shell: info?.shell, alive: info?.alive,
        isiPanjang: isi.replace(/\\s/g, '').length,
        baris: isi.split('\\n').filter(l => l.trim()).slice(0, 3),
      });
    `,
      70000,
    ),
  );
  check(
    'V4',
    v4.pid > 0 && v4.alive && v4.isiPanjang > 40 && v4.agent?.name === agentId,
    `pane agent "${v4.title}" pid ${v4.pid} dari ${v4.shell}; ` +
      `output nyata ${v4.isiPanjang} char non-spasi, mis. "${(v4.baris[1] ?? v4.baris[0] ?? '').trim().slice(0, 40)}"`,
  );

  // ───────── V5: klik agent yang sama lagi -> duplikat ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(
      `
      q('[data-testid="term-agent"]').click();
      await wait(350);
      q('[data-agent=${JSON.stringify(agentId)}]').click();
      await wait(1200);
      const ops = () => T.getState().terminalTabs[0].panes.filter(p => p.agent?.name === ${JSON.stringify(agentId)});
      // tunggu pane kedua ikut menggambar
      for (let i = 0; i < 40; i++) {
        await wait(500);
        if (ops().every(p => P.read(p.id, 60).replace(/\\s/g, '').length > 40)) break;
      }
      const list = ops();
      return JSON.stringify({
        jumlah: list.length,
        judul: list.map(p => p.title),
        pid: list.map(p => p.pid),
        isi: list.map(p => P.read(p.id, 60).replace(/\\s/g, '').length),
      });
    `,
      70000,
    ),
  );
  const pidUnikV5 = new Set(v5.pid).size === v5.pid.length;
  check(
    'V5',
    v5.jumlah === 2 && pidUnikV5 && v5.isi.every((n) => n > 40),
    `klik ${agentId} dua kali -> ${v5.judul.join(' + ')}, pid ${v5.pid.join('/')} (unik=${pidUnikV5}), ` +
      `dua-duanya hidup & menggambar (${v5.isi.join(' & ')} char)`,
  );

  // ───────── V6: batas 6 pane ─────────
  const v6 = JSON.parse(
    await cdp.runAsync(
      `
      while (T.getState().terminalTabs[0].panes.length < 6) {
        q('[data-testid="term-new"]').click();
        await wait(1900);
      }
      const enam = T.getState().terminalTabs[0].panes.length;
      const kolom6 = getComputedStyle(q('.pane-grid')).gridTemplateColumns.split(' ').length;
      q('[data-testid="term-new"]').click();
      await wait(900);
      const st = T.getState();
      return JSON.stringify({
        enam, kolom6,
        setelahCoba7: st.terminalTabs[0].panes.length,
        toast: q('[data-testid="term-toast"]')?.textContent ?? null,
        max: st.maxPanes(),
        kinds: st.terminalTabs[0].panes.map(p => p.kind),
      });
    `,
      70000,
    ),
  );
  check(
    'V6',
    v6.enam === 6 && v6.setelahCoba7 === 6 && /Maksimal 6 pane/.test(v6.toast ?? ''),
    `6 pane [${v6.kinds.join(', ')}] tersusun ${v6.kolom6} kolom; pane ke-7 DITOLAK ` +
      `(tetap ${v6.setelahCoba7}) dengan toast "${v6.toast}"`,
  );

  // ───────── V7: Split With Browser ─────────
  const server = await startTestServer();
  const v7 = JSON.parse(
    await cdp.runAsync(
      `
      for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
      await wait(700);
      q('[data-testid="empty-shell"]').click();
      await wait(2000);
      q('[data-testid="term-browser"]').click();
      await wait(900);

      const setV = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const inp = q('[data-testid="bp-url"]');
      setV.call(inp, '127.0.0.1:${TEST_PORT}');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await wait(2500);
      const loads1 = Number(q('[data-testid="bp-frame"]')?.dataset.loads ?? 0);

      q('[data-testid="bp-reload"]').click();
      await wait(2000);
      const fr = q('[data-testid="bp-frame"]');

      // URL yang belum dibuka -> pane tetap hidup, tidak crash
      const tab = T.getState().terminalTabs[0];
      const bp = tab.panes.find(p => p.kind === 'browser');
      return JSON.stringify({
        panes: tab.panes.map(p => p.kind),
        url: bp.url,
        src: fr?.getAttribute('src'),
        loads1, loads2: Number(fr?.dataset.loads ?? 0),
        adaUrlBar: !!q('[data-testid="bp-url"]'),
        adaReload: !!q('[data-testid="bp-reload"]'),
      });
    `,
      70000,
    ),
  );
  const hits = server.hits();
  await server.close();
  check(
    'V7',
    v7.panes.includes('browser') &&
      v7.src === `http://127.0.0.1:${TEST_PORT}` &&
      v7.loads1 > 0 &&
      v7.loads2 > v7.loads1 &&
      hits >= 2 &&
      v7.adaUrlBar &&
      v7.adaReload,
    `pane [${v7.panes.join(' + ')}]; iframe src=${v7.src} memuat ${v7.loads1}x lalu ${v7.loads2}x setelah reload; ` +
      `server uji menerima ${hits} request (bukti halaman benar-benar diambil); URL bar & reload ada. ` +
      `Isi DOM iframe tidak dibaca: sandbox = origin lain`,
  );

  // ───────── V8: drag header -> tukar posisi ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(`
      const before = T.getState().terminalTabs[0].panes.map(p => p.kind);
      const dt = { _d: {}, types: ['text/zephyr-pane'],
        setData(k, v) { this._d[k] = v }, getData(k) { return this._d[k] }, effectAllowed: '' };
      const heads = [...document.querySelectorAll('.pane-head')];
      heads[0].dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
      heads[1].dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: dt }));
      await wait(450);
      const after = T.getState().terminalTabs[0].panes.map(p => p.kind);
      const domOrder = [...document.querySelectorAll('.pane')].map(e => e.dataset.paneKind);
      return JSON.stringify({ before, after, domOrder });
    `),
  );
  check(
    'V8',
    v8.before[0] === v8.after[1] &&
      v8.before[1] === v8.after[0] &&
      v8.domOrder.join() === v8.after.join(),
    `drag header pane: [${v8.before.join(', ')}] -> [${v8.after.join(', ')}]; urutan DOM ikut (${v8.domOrder.join(', ')})`,
  );

  // ───────── V9: tutup pane agent -> proses mati ─────────
  const v9 = JSON.parse(
    await cdp.runAsync(
      `
      q('[data-testid="term-agent"]').click();
      await wait(350);
      q('[data-agent=${JSON.stringify(agentId)}]').click();
      await wait(3500);
      const ap = T.getState().terminalTabs[0].panes.find(p => p.kind === 'agent');
      const sebelum = (await P.list()).find(x => x.id === ap.id);
      q('[data-testid="pane-close-' + ap.id + '"]').click();
      await wait(2500);
      const sesudah = (await P.list()).find(x => x.id === ap.id);
      return JSON.stringify({
        id: ap.id, pid: ap.pid,
        aliveSebelum: sebelum?.alive,
        masihAdaDiRust: !!sesudah,
        xtermDibuang: !P.ids().includes(ap.id),
        panesTersisa: T.getState().terminalTabs[0].panes.map(p => p.kind),
      });
    `,
      70000,
    ),
  );
  // Bukti dari luar app: pid benar-benar hilang dari tabel proses OS.
  const { execSync } = await import('node:child_process');
  const pidGone = !execSync(`tasklist /FI "PID eq ${v9.pid}" /NH`, { encoding: 'utf8' }).includes(
    String(v9.pid),
  );
  check(
    'V9',
    v9.aliveSebelum && !v9.masihAdaDiRust && v9.xtermDibuang && pidGone,
    `tutup pane agent (pid ${v9.pid}): hidup sebelum=${v9.aliveSebelum}, hilang dari registry Rust=${!v9.masihAdaDiRust}, ` +
      `xterm dibuang=${v9.xtermDibuang}, pid hilang dari tasklist=${pidGone}; sisa [${v9.panesTersisa.join(', ')}]`,
  );

  // ───────── V10: resize -> pty tiap pane ikut ─────────
  const v10 = JSON.parse(
    await cdp.runAsync(`
      const ptyPanes = () => T.getState().terminalTabs[0].panes.filter(p => p.kind !== 'browser');
      T.getState().setHeight(260);
      await wait(1200);
      const kecil = ptyPanes().map(p => P.size(p.id));
      T.getState().setHeight(620);
      await wait(1300);
      const besar = ptyPanes().map(p => P.size(p.id));
      // buktikan shell benar-benar tahu ukuran baru
      const first = ptyPanes()[0];
      await P.write(first.id, 'cls\\r');
      await wait(700);
      await P.write(first.id, 'echo "R=$($Host.UI.RawUI.WindowSize.Height)"\\r');
      let m = null;
      for (let i = 0; i < 30; i++) {
        await wait(250);
        m = P.read(first.id, 40).match(/R=(\\d+)/);
        if (m) break;
      }
      return JSON.stringify({ kecil, besar, shellRows: m ? Number(m[1]) : null, xtermRows: P.size(first.id).rows });
    `),
  );
  check(
    'V10',
    v10.besar.every((s, i) => s.rows > v10.kecil[i].rows) && v10.shellRows === v10.xtermRows,
    `panel 260px -> 620px: rows pane ${v10.kecil.map((s) => s.rows).join('/')} -> ${v10.besar
      .map((s) => s.rows)
      .join('/')}; shell melihat ${v10.shellRows} baris = xterm ${v10.xtermRows}`,
  );

  // ───────── V11: start command kustom dari Settings ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(
      `
      const custom = ['cmd.exe', '/c', 'echo ZEPHYR-START-CMD-KUSTOM && pause'];
      await S.getState().applySettings({ agents: { startCommands: { ${JSON.stringify(agentId)}: custom } } });
      await wait(900);
      q('[data-testid="term-agent"]').click();
      await wait(350);
      q('[data-agent=${JSON.stringify(agentId)}]').click();
      await wait(2500);
      const ap = [...T.getState().terminalTabs[0].panes].reverse().find(p => p.kind === 'agent');
      const info = (await P.list()).find(x => x.id === ap.id);
      let isi = '';
      for (let i = 0; i < 24; i++) {
        await wait(250);
        isi = P.read(ap.id, 30);
        if (/ZEPHYR-START-CMD-KUSTOM/.test(isi)) break;
      }
      // kembalikan Settings ke default
      await S.getState().applySettings({ agents: { startCommands: { ${JSON.stringify(agentId)}: [] } } });
      await wait(500);
      return JSON.stringify({
        shell: info?.shell,
        penandaTampil: /ZEPHYR-START-CMD-KUSTOM/.test(isi),
        baris: isi.split('\\n').filter(l => l.trim()).slice(0, 2),
        settingsDikembalikan: S.getState().settings.agents.startCommands[${JSON.stringify(agentId)}],
      });
    `,
      70000,
    ),
  );
  check(
    'V11',
    v11.penandaTampil && /cmd\.exe$/i.test(v11.shell ?? ''),
    `start command diubah di Settings -> pane spawn "${v11.shell}" dan mencetak penanda kustom ` +
      `("${(v11.baris[0] ?? '').trim()}"); Settings dikembalikan ke default`,
  );

  // ───────── V12: tanpa error konsol + RAM wajar ─────────
  const v12 = JSON.parse(
    await cdp.runAsync(`
      for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
      await wait(800);
      for (let i = 0; i < 3; i++) { await T.getState().addPane('shell'); await wait(1900); }
      await wait(4000);
      const ram = document.querySelector('.statusbar')?.textContent?.match(/RAM: ([\\d.]+) (MB|GB)/);
      return JSON.stringify({
        panes: T.getState().terminalTabs[0].panes.length,
        ramMb: ram ? (ram[2] === 'GB' ? Number(ram[1]) * 1024 : Number(ram[1])) : null,
        errors: window.__ZEPHYR_ERRORS__.slice(0, 3),
      });
    `),
  );
  check(
    'V12',
    v12.panes === 3 && v12.errors.length === 0 && v12.ramMb !== null && v12.ramMb < 500,
    `3 pane shell aktif, RAM proses ${v12.ramMb} MB (< 500 MB), tidak ada console error`,
  );

  // bersihkan
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
  console.error('verify06 error:', e.message);
  process.exit(2);
});
