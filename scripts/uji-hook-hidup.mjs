/**
 * uji-hook-hidup.mjs - bukti hook berjalan dari UI NYATA.
 *
 * Sampai sekarang executor hook hanya diuji langsung ke perintah Rust-nya
 * (`hooks.rs`), bukan lewat jalur yang benar-benar dipakai pembaca: pasang hook
 * di panel, kirim pesan, dan lihat apakah perintahnya benar-benar jalan.
 *
 * Yang diuji di sini adalah RANTAI-nya, bukan perintahnya:
 *
 *   1. hook `session-end` yang enabled benar-benar dieksekusi saat run selesai
 *   2. hook yang DISABLED tidak dieksekusi
 *   3. hook dengan event yang belum tersambung (`before-tool`) tidak pernah
 *      dieksekusi, walau ia enabled - inilah yang UI klaim dengan (not active yet)
 *   4. hook `session-start` jalan saat sesi baru dibuka
 *
 * Buktinya sebuah berkas: perintah hook menulis ke berkas sementara, dan
 * berkas itu diperiksa setelahnya. Bukan dengan membaca state internal, karena
 * yang ingin dibuktikan adalah "perintahnya benar-benar dijalankan", dan
 * menjalankan perintah adalah satu-satunya cara membuktikannya.
 *
 *   node scripts/uji-hook-hidup.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('hook berjalan dari UI nyata');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-hook-'));
const tanda = (nama) => path.join(DIR, `${nama}.txt`);

const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
cdp.snapshot = null;

/*
 * A workspace is REQUIRED, and the hook executor refuses without one.
 *
 * `dir_kerja` (hooks.rs) resolves an empty cwd to the workspace root and
 * returns "no workspace is open" when there is none — a hook is project
 * tooling, and there is no project. So the test opens one rather than working
 * around it: running hooks outside a project is not a case that should be made
 * to pass.
 *
 * A scratch folder is used, not the repository, so a hook command that writes a
 * file cannot touch anything the reader cares about.
 */
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-hook-ws-'));
await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS.replace(/\\/g, '/'))});
  return true;
})())`);
await new Promise((r) => setTimeout(r, 1200));

const wsAktif = await cdp.json(`return JSON.stringify(window.__ZEPHYR__.getState().workspace)`);
R.check('H-1', !!wsAktif, `workspace uji terbuka (${wsAktif ?? 'gagal'})`);

/* ── Pasang empat hook lewat store yang sama dengan panel ──────────────── */

/*
 * Ditulis lewat `useAgentExtras.setState` supaya bentuk datanya persis sama
 * dengan yang dihasilkan panel. Menyuntik ke localStorage langsung akan
 * menguji jalur yang berbeda dari yang dipakai pembaca.
 *
 * Perintahnya dibangun DI NODE, bukan di dalam string JavaScript yang
 * dievaluasi di halaman. Alasannya ditemukan saat menguji ini: `hook_run`
 * menjalankan perintah lewat `cmd.exe`, dan cmd menolak tujuan redirect yang
 * memakai garis miring depan — `echo ok > "C:/Temp/x.txt"` dijawab "The
 * filename, directory name, or volume label syntax is incorrect". Perintahnya
 * harus memakai backslash, dan menyusun backslash di dalam string yang sudah
 * di-escape dua lapis adalah cara paling cepat salah.
 */
const DIRWIN = DIR.split('/').join('\\');
const perintah = (nama) => `echo ok > "${DIRWIN}\\${nama}.txt"`;

const dipasang = await cdp.json(`return JSON.stringify((() => {
  const m = window.__ZEPHYR_AGENT_EXTRAS__;
  if (!m || !m.useAgentExtras) return { error: 'store agent extras tidak terjangkau' };
  m.useAgentExtras.setState({
    hooks: [
      { id: 'h1', name: 'end-on',   event: 'session-end',   command: ${JSON.stringify(perintah('end-on'))},  enabled: true },
      { id: 'h2', name: 'end-off',  event: 'session-end',   command: ${JSON.stringify(perintah('end-off'))}, enabled: false },
      { id: 'h3', name: 'tool-on',  event: 'before-tool',   command: ${JSON.stringify(perintah('tool-on'))}, enabled: true },
      { id: 'h4', name: 'start-on', event: 'session-start', command: ${JSON.stringify(perintah('start-on'))}, enabled: true },
    ],
  });
  return { jumlah: m.useAgentExtras.getState().hooks.length };
})())`);

R.check('H0', !dipasang.error, `hook dipasang lewat store (${dipasang.error ?? dipasang.jumlah + ' hook'})`);
if (dipasang.error) {
  R.selesai();
  await cdp.close();
  process.exit(1);
}

/* ── Sesi baru: session-start harus jalan ─────────────────────────────── */

/*
 * `newChat` adalah satu-satunya tempat `session-start` dipanggil, dan itu
 * memang definisinya: momen sebuah percakapan dimulai.
 */
await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR_AI__.store.getState().newChat();
  return true;
})())`);

/* Beri waktu executor menulis berkas; ia fire-and-forget dengan sengaja. */
await new Promise((r) => setTimeout(r, 2500));

R.check('H1', fs.existsSync(tanda('start-on')), 'session-start yang enabled DIEKSEKUSI');
R.check('H2', !fs.existsSync(tanda('tool-on')), 'before-tool TIDAK dieksekusi (event belum tersambung)');

/* ── Kirim pesan: session-end harus jalan saat run selesai ────────────── */

const kirim = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  const s = A.getState();
  if (s.agentBusy) return { error: 'agent masih sibuk dari run sebelumnya' };
  void s.send('Balas satu kata saja: ok');
  return { dikirim: true };
})())`);

R.check('H3', !kirim.error, `pesan terkirim (${kirim.error ?? 'ya'})`);

/*
 * Tunggu run selesai. Batasnya panjang karena ini memanggil provider SUNGGUHAN
 * dengan kunci yang ada di mesin ini - bukan mock. Kalau tidak ada kunci atau
 * jaringan mati, run tetap berakhir (dengan error) dan `session-end` tetap
 * menyala, jadi uji ini tidak bergantung pada jawaban yang berhasil.
 */
const selesai = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (!A.getState().agentBusy) return { ok: true, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, ms: Date.now() - t0 };
})())`);

R.check('H4', selesai.ok === true, `run berakhir dalam ${Math.round(selesai.ms / 1000)}s`);

/* `session-end` fire-and-forget setelah persist; beri waktu yang sama. */
await new Promise((r) => setTimeout(r, 3000));

R.check('H5', fs.existsSync(tanda('end-on')), 'session-end yang enabled DIEKSEKUSI setelah run selesai');
R.check('H6', !fs.existsSync(tanda('end-off')), 'session-end yang DISABLED tidak dieksekusi');

/* ── Bersihkan ─────────────────────────────────────────────────────────── */

await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR_AGENT_EXTRAS__.useAgentExtras.setState({ hooks: [] });
  return true;
})())`);

for (const d of [DIR, WS]) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* direktori sementara; gagal menghapus tidak mengubah hasil uji */
  }
}

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
