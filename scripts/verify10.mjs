// verify10.mjs — verifikasi V1..V12 fase 10 (Source Control + GitHub auth)
// lewat CDP di app hidup.
//
// Pakai:  node scripts/verify10.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup
//
// Prinsip: SEMUA bukti dari repo git nyata. Harness membuat sandbox repo di
// %LOCALAPPDATA%\Temp\zephyr-scm-<pid>, membukanya sebagai workspace Zephyr,
// lalu memakai jalur Rust asli (git_status/git_stage/...). Repo D:\Zephyr
// sendiri TIDAK disentuh.
//
// V5 sengaja memakai bare repo file:// (tanpa auth) — sesuai catatan prompt
// fase 10: mekanik sync saja, auth dibuktikan V12+.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
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
    const slot = `__ZV10_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const G = window.__ZEPHYR_GIT__;
        const GS = () => window.__ZEPHYR_GIT__.store.getState();
        const EX = window.__ZEPHYR_EX__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        // Catatan fase 08: menimpa el.value TIDAK memicu React onChange.
        const setNativeValue = (el, val) => {
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        /** Buka panel Source Control di sidebar. */
        const bukaScm = async () => {
          const st = S.getState();
          st.setSettingsOpen(false);
          st.setActivity('scm');
          if (!S.getState().sidebarVisible) st.toggleSidebar();
          await wait(200);
        };
        /** Tunggu operasi git selesai (busy false). */
        const tunggu = async (ms = 30000) => {
          const batas = Date.now() + ms;
          while (GS().busy && Date.now() < batas) await wait(100);
          await wait(150);
          return !GS().busy;
        };
        /** Klik setelah menunggu elemen muncul (panel baru ter-mount). */
        const klik = async (sel, ms = 4000) => {
          const batas = Date.now() + ms;
          for (;;) {
            const el = q(sel);
            if (el) { el.click(); return true; }
            if (Date.now() > batas) throw new Error('elemen tidak muncul: ' + sel);
            await wait(100);
          }
        };
        /** Cari baris file di daftar perubahan berdasarkan path. */
        const baris = (p, staged) =>
          qa('[data-testid="scm-row"]').find(
            (el) => el.dataset.path === p && el.dataset.staged === (staged ? '1' : '0'),
          ) ?? null;
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

// ───────────────────── sandbox repo git ─────────────────────

const TMP = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp');
const SANDBOX = path.join(TMP, `zephyr-scm-${process.pid}`);
const REPO = path.join(SANDBOX, 'kerja');
const BARE = path.join(SANDBOX, 'remote.git');

const git = (args, cwd = REPO) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  });

function siapkanSandbox() {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(REPO, { recursive: true });
  // Remote bare lokal: sync bisa diuji tanpa jaringan & tanpa credential.
  fs.mkdirSync(BARE, { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: BARE, encoding: 'utf8' });

  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Zephyr Verify']);
  git(['config', 'user.email', 'verify@zephyr.local']);
  git(['config', 'commit.gpgsign', 'false']);
  // Jangan konversi LF↔CRLF: harness membandingkan isi file apa adanya.
  git(['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(REPO, 'awal.txt'), 'baris satu\nbaris dua\n');
  fs.writeFileSync(path.join(REPO, 'tetap.txt'), 'file ini tidak diubah\n');
  git(['add', '-A']);
  git(['commit', '-m', 'commit awal']);
  git(['remote', 'add', 'origin', BARE.replace(/\\/g, '/')]);
  git(['push', '-u', 'origin', 'main']);
}

function bersihkanSandbox() {
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    /* file mungkin masih terpegang; tidak fatal */
  }
}

/** Uji credential helper (V12) sebagai proses terpisah — tanpa jaringan. */
function helperJawab(input) {
  const exe = path.join('src-tauri', 'target', 'debug', 'zephyr.exe');
  return execFileSync(exe, ['git-credential', 'get'], {
    input,
    encoding: 'utf8',
    timeout: 20000,
  });
}

// ───────────────────────── main ─────────────────────────

const main = async () => {
  siapkanSandbox();

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_GIT__')) === 'undefined') {
    throw new Error('__ZEPHYR_GIT__ tidak ada — reload halaman (devBridge fase 10)');
  }

  const REPO_JS = JSON.stringify(REPO);
  const BARE_JS = JSON.stringify(BARE.replace(/\\/g, '/'));

  // Kondisi awal: tutup tab & panel, buka sandbox sebagai workspace.
  await cdp.runAsync(`
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    G.closeDiff();
    GS().setConfirm(null);
    await s.openWorkspace(${REPO_JS});
    await wait(500);
    await G.refresh();
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'siap';
  `);

  // ───────── V1: repo terdeteksi, branch main ─────────
  const v1 = JSON.parse(
    await cdp.runAsync(`
      await bukaScm();
      await G.refresh();
      await wait(200);
      const st = G.status();
      return JSON.stringify({
        isRepo: st?.isRepo, branch: st?.branch,
        panelAda: !!q('[data-testid="scm-panel"]'),
        branchDom: q('[data-testid="scm-branch-name"]')?.textContent ?? null,
        sbBranch: q('[data-testid="sb-git-branch"]')?.textContent ?? null,
      });
    `),
  );
  check(
    'V1',
    v1.isRepo === true && v1.branch === 'main' && v1.panelAda && v1.branchDom === 'main',
    `repo terdeteksi (isRepo=${v1.isRepo}), panel SCM tampil, branch "${v1.branchDom}" di panel & "${v1.sbBranch}" di status bar`,
  );

  // ───────── V2: modified + untracked muncul ─────────
  fs.appendFileSync(path.join(REPO, 'awal.txt'), 'baris tiga dari verify\n');
  fs.writeFileSync(path.join(REPO, 'baru.txt'), 'file baru untracked\nMARKER-V2\n');
  const v2 = JSON.parse(
    await cdp.runAsync(`
      await G.refresh();
      await wait(250);
      const ch = G.changes();
      return JSON.stringify({
        awal: ch.find(c => c.path === 'awal.txt') ?? null,
        baru: ch.find(c => c.path === 'baru.txt') ?? null,
        domAwal: !!baris('awal.txt', false),
        domBaru: !!baris('baru.txt', false),
        sbCount: q('[data-testid="sb-git-changes"]')?.textContent ?? null,
      });
    `),
  );
  check(
    'V2',
    v2.awal?.status === 'M' &&
      v2.awal?.staged === false &&
      v2.baru?.status === '?' &&
      v2.baru?.isNew === true &&
      v2.domAwal &&
      v2.domBaru,
    `awal.txt = M (unstaged), baru.txt = ? (untracked); dua-duanya tampil di daftar Changes; status bar Σ=${v2.sbCount}`,
  );

  // ───────── V3: stage dua file + diff benar ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      // Klik tombol + di baris seperti user, bukan panggil store.
      baris('awal.txt', false).querySelector('[data-testid="scm-stage"]').click();
      await wait(400);
      baris('baru.txt', false).querySelector('[data-testid="scm-stage"]').click();
      await wait(500);
      await G.refresh();
      const ch = G.changes();
      const staged = ch.filter(c => c.staged).map(c => c.path).sort();
      // Diff file yang di-stage: harus memuat chunk @@ dan baris +.
      await G.openDiff('awal.txt', true);
      await wait(400);
      const d = G.diff();
      const plus = qa('[data-testid="diff-pre"] .diff-line.is-add').map(e => e.textContent.trim());
      const minus = qa('[data-testid="diff-pre"] .diff-line.is-del').length;
      const hunk = qa('[data-testid="diff-pre"] .diff-line.is-hunk').length;
      G.closeDiff();
      await wait(200);
      return JSON.stringify({
        staged, plus, minus, hunk,
        stagedDom: qa('[data-testid="scm-row"]').filter(e => e.dataset.staged === '1').length,
        diffPath: d?.path ?? null, diffStaged: d?.staged ?? null,
      });
    `),
  );
  check(
    'V3',
    JSON.stringify(v3.staged) === JSON.stringify(['awal.txt', 'baru.txt']) &&
      v3.hunk >= 1 &&
      v3.plus.some((l) => l.includes('baris tiga dari verify')) &&
      v3.stagedDom === 2,
    `stage lewat tombol + → Staged Changes = ${JSON.stringify(v3.staged)} (${v3.stagedDom} baris di DOM); diff awal.txt: ${v3.hunk} hunk, baris + berisi "baris tiga dari verify", ${v3.minus} baris −`,
  );

  // ───────── V4: commit "test scm" ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="scm-message"]');
      setNativeValue(el, 'test scm');
      await wait(200);
      const btn = q('[data-testid="scm-commit"]');
      const disabledSebelum = btn.disabled;
      btn.click();
      await tunggu();
      await wait(400);
      const log = G.log();
      const st = G.status();
      return JSON.stringify({
        disabledSebelum,
        subject: log[0]?.subject ?? null,
        hash: log[0]?.hash7 ?? null,
        author: log[0]?.author ?? null,
        sisaPerubahan: st?.changes.length ?? -1,
        ahead: st?.ahead ?? -1,
        pesanKosong: GS().message === '',
        info: G.info(),
      });
    `),
  );
  const logCli = git(['log', '-1', '--pretty=%s|%h']).trim();
  check(
    'V4',
    v4.disabledSebelum === false &&
      v4.subject === 'test scm' &&
      v4.sisaPerubahan === 0 &&
      v4.ahead === 1 &&
      v4.pesanKosong &&
      logCli.startsWith('test scm|'),
    `commit "test scm" sukses (hash ${v4.hash}, author ${v4.author}); git CLI konfirmasi "${logCli}"; working tree bersih, ahead=${v4.ahead}, kotak pesan dikosongkan`,
  );

  // ───────── V5: sync ke bare repo lokal (TANPA auth) ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      await G.sync();
      await tunggu();
      await wait(400);
      const st = G.status();
      return JSON.stringify({
        ahead: st?.ahead, behind: st?.behind, upstream: st?.upstream,
        info: G.info(), error: G.error(),
        sbAb: q('[data-testid="sb-git-ab"]')?.textContent ?? null,
      });
    `),
  );
  const bareHead = execFileSync('git', ['log', '-1', '--pretty=%s'], {
    cwd: BARE,
    encoding: 'utf8',
  }).trim();
  check(
    'V5',
    v5.ahead === 0 && v5.error === null && bareHead === 'test scm',
    `sync → push ke bare repo file:// berhasil: remote HEAD = "${bareHead}", ahead=${v5.ahead} behind=${v5.behind}, badge ↑↓ hilang (${v5.sbAb}); tanpa credential helper (scope V12+)`,
  );

  // ───────── V6: pull konflik → error ramah, tidak crash ─────────
  // Buat commit berbeda di remote lalu ubah baris yang sama di lokal.
  const KLON = path.join(SANDBOX, 'klon');
  execFileSync('git', ['clone', BARE.replace(/\\/g, '/'), KLON], {
    cwd: SANDBOX,
    encoding: 'utf8',
  });
  execFileSync('git', ['config', 'user.name', 'Remote Dev'], { cwd: KLON });
  execFileSync('git', ['config', 'user.email', 'remote@zephyr.local'], { cwd: KLON });
  fs.writeFileSync(path.join(KLON, 'awal.txt'), 'baris satu\nbaris dua\nVERSI REMOTE\n');
  execFileSync('git', ['commit', '-am', 'ubah dari remote'], { cwd: KLON, encoding: 'utf8' });
  execFileSync('git', ['push'], { cwd: KLON, encoding: 'utf8' });
  fs.writeFileSync(path.join(REPO, 'awal.txt'), 'baris satu\nbaris dua\nVERSI LOKAL\n');
  git(['commit', '-am', 'ubah dari lokal']);

  const v6 = JSON.parse(
    await cdp.runAsync(`
      await G.pull(false);
      await tunggu();
      await wait(500);
      const st = G.status();
      const err = G.error();
      // File konflik harus bisa dibuka di editor.
      await s.openPath(${JSON.stringify(path.join(REPO, 'awal.txt'))});
      await wait(400);
      const tab = S.getState().tabs.find(t => (t.name ?? '').includes('awal'));
      const isi = tab?.content ?? '';
      return JSON.stringify({
        err,
        conflicted: st?.conflicted,
        u: st?.changes.filter(c => c.status === 'U').map(c => c.path),
        domConflict: q('[data-testid="scm-conflict"]')?.textContent ?? null,
        tabAda: !!tab,
        adaMarker: isi.includes('<<<<<<<') && isi.includes('>>>>>>>'),
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  check(
    'V6',
    typeof v6.err === 'string' &&
      v6.err.length > 0 &&
      v6.conflicted === true &&
      v6.u.includes('awal.txt') &&
      v6.tabAda &&
      v6.adaMarker,
    `pull konflik: error ramah tampil ("${String(v6.err).slice(0, 60)}…"), status U pada ${JSON.stringify(v6.u)}, banner "${v6.domConflict}"; file konflik terbuka di editor dan memuat marker <<<<<<< / >>>>>>>; app tidak crash (${v6.errors} console error)`,
  );

  // Bereskan konflik supaya uji berikutnya berjalan di repo sehat.
  fs.writeFileSync(path.join(REPO, 'awal.txt'), 'baris satu\nbaris dua\nGABUNGAN\n');
  git(['add', 'awal.txt']);
  git(['commit', '--no-edit']);

  // ───────── V7: discard single file → konfirmasi → bersih ─────────
  fs.appendFileSync(path.join(REPO, 'tetap.txt'), 'perubahan yang akan dibuang\n');
  const v7 = JSON.parse(
    await cdp.runAsync(`
      await G.refresh();
      await wait(300);
      const sebelum = G.changes().find(c => c.path === 'tetap.txt') ?? null;
      // Klik ikon discard di baris → dialog konfirmasi WAJIB muncul.
      baris('tetap.txt', false).querySelector('[data-testid="scm-discard"]').click();
      await wait(300);
      const judul = q('[data-testid="scm-confirm-title"]')?.textContent ?? null;
      const isi = q('[data-testid="scm-confirm-body"]')?.textContent ?? null;
      const adaTombolDanger = !!q('[data-testid="scm-confirm-ok"].btn-danger');
      // Batal dulu: perubahan HARUS masih ada.
      q('[data-testid="scm-confirm-cancel"]').click();
      await wait(300);
      await G.refresh();
      const setelahBatal = G.changes().some(c => c.path === 'tetap.txt');
      // Sekarang konfirmasi sungguhan.
      baris('tetap.txt', false).querySelector('[data-testid="scm-discard"]').click();
      await wait(250);
      q('[data-testid="scm-confirm-ok"]').click();
      await tunggu();
      await wait(500);
      await G.refresh();
      return JSON.stringify({
        sebelum, judul, isi, adaTombolDanger, setelahBatal,
        sisa: G.changes().some(c => c.path === 'tetap.txt'),
      });
    `),
  );
  const isiTetap = fs.readFileSync(path.join(REPO, 'tetap.txt'), 'utf8').replace(/\r\n/g, '\n');
  check(
    'V7',
    v7.sebelum?.status === 'M' &&
      String(v7.isi).includes('PERMANEN') &&
      v7.adaTombolDanger &&
      v7.setelahBatal === true &&
      v7.sisa === false &&
      isiTetap === 'file ini tidak diubah\n',
    `discard 1 file: dialog "${v7.judul}" + teks PERMANEN + tombol danger; Batal = perubahan tetap ada; konfirmasi = file kembali ke isi HEAD (${JSON.stringify(isiTetap)}) dan hilang dari daftar`,
  );

  // ───────── V8: branch create → commit → checkout ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(`
      await G.createBranch('feat-x');
      await tunggu();
      await wait(300);
      const br1 = G.branches();
      return JSON.stringify({ current: br1?.current, locals: br1?.locals });
    `),
  );
  fs.writeFileSync(path.join(REPO, 'khusus-feat.txt'), 'hanya ada di feat-x\n');
  const v8b = JSON.parse(
    await cdp.runAsync(`
      await G.refresh();
      await wait(250);
      await G.stage(['khusus-feat.txt']);
      G.setMessage('tambah file feat');
      await wait(150);
      await G.commit();
      await tunggu();
      await wait(300);
      await G.checkout('main');
      await tunggu();
      await wait(500);
      const diMain = G.branches()?.current;
      const adaDiMain = await window.__ZEPHYR_FS__.read(${JSON.stringify(
        path.join(REPO, 'khusus-feat.txt'),
      )}).then(() => true).catch(() => false);
      await G.checkout('feat-x');
      await tunggu();
      await wait(500);
      const diFeat = G.branches()?.current;
      const adaDiFeat = await window.__ZEPHYR_FS__.read(${JSON.stringify(
        path.join(REPO, 'khusus-feat.txt'),
      )}).then(() => true).catch(() => false);
      return JSON.stringify({ diMain, adaDiMain, diFeat, adaDiFeat });
    `),
  );
  check(
    'V8',
    v8.current === 'feat-x' &&
      v8b.diMain === 'main' &&
      v8b.adaDiMain === false &&
      v8b.diFeat === 'feat-x' &&
      v8b.adaDiFeat === true,
    `branch feat-x dibuat & aktif; commit file baru di sana; checkout main → khusus-feat.txt TIDAK ada di disk; checkout feat-x → ada lagi`,
  );

  // ───────── V9: delete branch feat-x dari main ─────────
  const v9 = JSON.parse(
    await cdp.runAsync(`
      await G.checkout('main');
      await tunggu();
      await wait(400);
      // Guard: menghapus branch yang sedang aktif harus DITOLAK.
      await G.deleteBranch('main');
      await tunggu();
      const errGuard = G.error();
      GS().setError(null);
      await G.deleteBranch('feat-x');
      await tunggu();
      await wait(400);
      const br = G.branches();
      return JSON.stringify({
        errGuard, current: br?.current, locals: br?.locals, error: G.error(),
      });
    `),
  );
  const branchCli = git(['branch', '--format=%(refname:short)']).trim().split('\n');
  check(
    'V9',
    typeof v9.errGuard === 'string' &&
      v9.errGuard.length > 0 &&
      !v9.locals.includes('feat-x') &&
      !branchCli.includes('feat-x') &&
      v9.error === null,
    `hapus branch aktif ditolak ("${String(v9.errGuard).slice(0, 55)}…"); feat-x dihapus dari main → daftar UI ${JSON.stringify(v9.locals)}, git CLI ${JSON.stringify(branchCli)}`,
  );

  // ───────── V10: rename via Explorer → status git R ─────────
  const v10 = JSON.parse(
    await cdp.runAsync(`
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      G.closeDiff();
      // Rename lewat jalur Explorer (fs_rename), bukan git mv.
      await EX.getState().startInline({ kind: 'rename', target: ${JSON.stringify(
        path.join(REPO, 'tetap.txt'),
      )} });
      await wait(150);
      await EX.getState().commitInline('tetap-baru.txt');
      await wait(600);
      await G.refresh();
      await wait(300);
      const kasar = G.changes();
      // Rename terdeteksi git hanya setelah kedua sisi masuk index.
      await G.stage(['tetap.txt', 'tetap-baru.txt']);
      await wait(500);
      await G.refresh();
      const halus = G.changes();
      return JSON.stringify({
        kasar: kasar.map(c => c.path + ':' + c.status),
        halus: halus.map(c => ({ p: c.path, s: c.status, orig: c.origPath })),
      });
    `),
  );
  const renameCli = git(['status', '--porcelain']).trim();
  const rEntry = (v10.halus ?? []).find((x) => x.s === 'R');
  check(
    'V10',
    rEntry?.p === 'tetap-baru.txt' &&
      rEntry?.orig === 'tetap.txt' &&
      renameCli.includes('R  tetap.txt -> tetap-baru.txt'),
    `rename lewat Explorer terlihat di git: sebelum stage ${JSON.stringify(v10.kasar)}; setelah stage → status R pada "${rEntry?.p}" (dulu "${rEntry?.orig}"), git CLI: "${renameCli.replace(/\n/g, ' | ')}"`,
  );

  // ───────── V11: commit disabled + RAM + tanpa console error ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(`
      // Bereskan sisa uji rename.
      G.setMessage('rename lewat explorer');
      await wait(120);
      await G.commit();
      await tunggu();
      await wait(400);
      // Tombol Commit harus MATI saat tidak ada staged change.
      const btn = q('[data-testid="scm-commit"]');
      const disabledBersih = btn.disabled;
      const hint = btn.getAttribute('title');
      // Isi pesan tanpa staged change: tetap mati.
      setNativeValue(q('[data-testid="scm-message"]'), 'pesan tanpa stage');
      await wait(250);
      const disabledAdaPesan = q('[data-testid="scm-commit"]').disabled;
      setNativeValue(q('[data-testid="scm-message"]'), '');
      await wait(150);
      const ram = S.getState().ramBytes;
      return JSON.stringify({
        disabledBersih, hint, disabledAdaPesan, ram,
        bersih: !!q('[data-testid="scm-clean"]'),
        errors: window.__ZEPHYR_ERRORS__,
      });
    `),
  );
  const mb = Math.round(v11.ram / (1024 * 1024));
  check(
    'V11',
    v11.disabledBersih === true &&
      v11.disabledAdaPesan === true &&
      String(v11.hint).includes('Stage dulu') &&
      v11.bersih === true &&
      v11.errors.length === 0 &&
      mb > 0 &&
      mb < 500,
    `tanpa staged change tombol Commit mati (hint "${v11.hint}") walau pesan diisi; empty-state "working tree bersih" tampil; RAM ${mb} MB (< 500); console error: ${v11.errors.length === 0 ? 'tidak ada' : JSON.stringify(v11.errors)}`,
  );

  // ───────── V12: credential helper (offline) ─────────
  // Simpan token palsu lewat jalur Rust (tanpa jaringan tidak bisa lewat
  // gh_set_pat yang memvalidasi ke GitHub), lalu tanya helper seperti git.
  const patExe = fs.existsSync(path.join('src-tauri', 'target', 'debug', 'zephyr.exe'));
  let v12ok = false;
  let v12detail = 'zephyr.exe debug tidak ada — jalankan cargo build dulu';
  if (patExe) {
    const github = helperJawab('protocol=https\nhost=github.com\n\n');
    const lain = helperJawab('protocol=https\nhost=example.com\n\n');
    const ssh = helperJawab('protocol=ssh\nhost=github.com\n\n');
    const store = execFileSync(
      path.join('src-tauri', 'target', 'debug', 'zephyr.exe'),
      ['git-credential', 'store'],
      { input: 'protocol=https\nhost=github.com\nusername=x\npassword=y\n\n', encoding: 'utf8' },
    );
    // Belum login → github.com juga kosong; yang penting: host lain SELALU
    // kosong, ssh kosong, store/erase no-op, dan formatnya benar bila ada.
    const formatBenar =
      github === '' || (github.includes('username=') && github.includes('password='));
    v12ok = lain === '' && ssh === '' && store === '' && formatBenar;
    v12detail =
      `helper: host=github.com → ${github === '' ? 'kosong (belum login)' : 'username+password'}; ` +
      `host=example.com → kosong (GCM user yang menangani); protocol=ssh → kosong; ` +
      `store → no-op. Tanpa jaringan.`;
  }
  check('V12', v12ok, v12detail);

  // ───────── bersih-bersih ─────────
  await cdp.runAsync(`
    G.closeDiff();
    GS().setConfirm(null);
    GS().setError(null);
    GS().setMessage('');
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    await s.closeWorkspace();
    await wait(400);
    S.getState().setActivity('explorer');
    S.getState().setSettingsOpen(false);
    await G.refresh();
    return 'bersih';
  `);

  cdp.close();
  bersihkanSandbox();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error('verify10 error:', e.message ?? e);
  bersihkanSandbox();
  process.exitCode = 2;
});
