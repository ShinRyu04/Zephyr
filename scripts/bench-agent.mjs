/*
 * Benchmark tugas agent — ukur model secara adil, bukan opini.
 *
 * Menjalankan tugas yang SAMA lewat jalur agent asli (bukan mock), lalu
 * menilai hasilnya dari disk, bukan dari klaim model:
 *
 *   npm run bench:agent -- --task kalkulator --provider custom-x --model gpt-...
 *   npm run bench:agent -- --task catatan   (aplikasi Electron catatan)
 *
 * Metrik: durasi, jumlah langkah, tool yang dipakai, langkah gagal, argumen
 * rusak, berhenti diam-diam, interrupt provider, dan apakah agent memverifikasi
 * hasilnya sendiri. Skor benar/salah dihitung harness tanpa melihat jawaban.
 *
 * Butuh app hidup + CDP (lihat AGENTS.md): WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
 * ="--remote-debugging-port=9223".
 */
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Cdp, pilihJendelaUtama, sleep } from './lib-cdp.mjs';

const arg = (nama, bawaan = null) => {
  const i = process.argv.indexOf(`--${nama}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
};
const flag = (nama) => process.argv.includes(`--${nama}`);

const PORT = arg('port', '9223');
const TUGAS = arg('task', 'kalkulator');
const PROVIDER = arg('provider', '');
const MODEL = arg('model', '');
const MENIT = Number(arg('menit', TUGAS === 'catatan' || TUGAS === 'miniide' ? '25' : '12'));
const DIR = arg('dir', '');
const SKILL_MATI = (arg('nonaktif-skill', '') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const OUT = arg('out', path.join(tmpdir(), `bench-agent-${Date.now()}.json`));
const JEDA_MS = 2000;

const TUGAS_SPEC = {
  kalkulator: {
    prompt:
      'Kerjakan di folder saat ini. Buat dua berkas: `hitung.js` (CommonJS) yang mengekspor fungsi `tambah(a,b)` dan `kurang(a,b)`, ' +
      'dan `test.js` yang menguji keduanya memakai `assert` lalu mencetak `OK` bila lulus. ' +
      'Setelah menulis, jalankan `node test.js` dan pastikan keluar dengan kode 0. Jangan menyentuh berkas lain.',
    siapkan: (d) => {
      writeFileSync(path.join(d, 'PERINTAH.txt'), TUGAS_SPEC.kalkulator.prompt + '\n');
    },
  },
  catatan: {
    prompt:
      'Buat aplikasi catatan desktop dengan Electron di folder saat ini: `package.json` (electron + script start), `main.js` ' +
      '(window + IPC simpan/baca JSON), `preload.js` (contextBridge), `renderer.js`, `index.html`, `style.css`. ' +
      'Fitur: tambah catatan, tandai selesai (toggle), hapus, dan cari. Simpan ke notes.json di userData lewat IPC. ' +
      'Jangan pakai framework dan JANGAN jalankan `npm install` (elektron sudah ada di mesin ini) — cukup tulis berkasnya. ' +
      'Setelah selesai, verifikasi sendiri bahwa berkasnya ada dan sintaksnya benar.',
    siapkan: () => {},
  },
  miniide: {
    prompt:
      'Buat aplikasi web "editor kode mini" di folder saat ini, murni HTML/CSS/JS tanpa framework: `index.html`, `app.js`, ' +
      '`ide-core.js` (CommonJS, logika inti agar bisa diuji), `style.css`, `README.md`. ' +
      'Fitur wajib: (1) daftar berkas di panel kiri dari daftar teks yang ada di halaman, (2) buka berkas ke textarea, ' +
      '(3) simpan isi textarea kembali ke daftar (di memori), (4) CARI: highlight/daftar hasil pencarian kata di berkas aktif ' +
      'beserta nomor baris dan kolom. `ide-core.js` WAJIB mengekspor `cariKata(teks, kata)` CommonJS yang mengembalikan ' +
      'array `{baris, kolom}` (1-based, kolom 1-based). Tanpa `npm install`. Setelah selesai, jalankan `node --check` pada ' +
      'berkas JS dan pastikan lolos, lalu laporkan ringkasannya.',
    siapkan: () => {},
  },
  bughunt: {
    prompt:
      'Folder ini adalah proyek kecil (kalkulator + todo CLI) yang DIKETAHUI punya beberapa bug. ' +
      'Tugas: cari bug di `hitung.js` dan `todo.js`, perbaiki SEMUANYA, lalu buktikan dengan menjalankan `node test.js` ' +
      'sampai keluar dengan kode 0. Jangan ubah `test.js` (ia adalah spesifikasi). Jangan menambah fitur baru. ' +
      'Setelah semua lulus, laporkan daftar bug yang kamu perbaiki.',
    siapkan: (d) => {
      writeFileSync(
        path.join(d, 'hitung.js'),
        [
          '// Kalkulator kecil. CommonJS.',
          'function tambah(a, b) {',
          '  return a * b; // TODO: ini kelihatan salah',
          '}',
          '',
          'function kurang(a, b) {',
          '  return b - a; // TODO: periksa urutan',
          '}',
          '',
          'function kali(a, b) {',
          '  let hasil = 0;',
          '  for (let i = 0; i <= b; i++) hasil += a; // TODO: batas loop',
          '  return hasil;',
          '}',
          '',
          'module.exports = { tambah, kurang, kali };',
          '',
        ].join('\n'),
      );
      writeFileSync(
        path.join(d, 'todo.js'),
        [
          "// Todo CLI kecil. CommonJS. Data disimpan di todo.json (dibuat saat simpan()).",
          "const fs = require('node:fs');",
          'const FILE = "todo.json";',
          '',
          'function muat() {',
          '  const teks = fs.readFileSync(FILE, "utf8"); // TODO: berkas belum ada?',
          '  return JSON.parse(teks);',
          '}',
          '',
          'function simpan(daftar) {',
          '  fs.writeFileSync(FILE, JSON.stringify(daftar, null, 2));',
          '}',
          '',
          'function tambah(daftar, teks) {',
          '  daftar.push({ id: daftar.length + 1, teks, selesai: false });',
          '  return daftar;',
          '}',
          '',
          'function toggle(daftar, id) {',
          '  const item = daftar.find((x) => x.id === id - 1); // TODO: id salah?',
          '  if (!item) return daftar;',
          '  item.selesai = !item.selesai;',
          '  return daftar;',
          '}',
          '',
          'function sisa(daftar) {',
          '  let n = 0;',
          '  for (let i = 0; i <= daftar.length; i++) { // TODO: batas loop',
          '    if (!daftar[i].selesai) n++;',
          '  }',
          '  return n;',
          '}',
          '',
          'module.exports = { muat, simpan, tambah, toggle, sisa };',
          '',
        ].join('\n'),
      );
      writeFileSync(
        path.join(d, 'test.js'),
        [
          "const assert = require('node:assert');",
          "const fs = require('node:fs');",
          "const { tambah, kurang, kali } = require('./hitung.js');",
          "const T = require('./todo.js');",
          '',
          'assert.strictEqual(tambah(2, 3), 5, "tambah");',
          'assert.strictEqual(tambah(-1, 1), 0, "tambah negatif");',
          'assert.strictEqual(kurang(9, 4), 5, "kurang");',
          'assert.strictEqual(kali(4, 3), 12, "kali");',
          'assert.strictEqual(kali(0, 5), 0, "kali nol");',
          '',
          'if (fs.existsSync("todo.json")) fs.unlinkSync("todo.json");',
          '',
          'let daftar = T.muat(); // berkas belum ada -> harus [] tanpa crash',
          'assert.deepStrictEqual(daftar, [], "muat kosong");',
          '',
          'T.tambah(daftar, "a");',
          'T.tambah(daftar, "b");',
          'T.simpan(daftar);',
          'daftar = T.muat();',
          'assert.strictEqual(daftar.length, 2, "persistensi");',
          '',
          'T.toggle(daftar, 1);',
          'assert.strictEqual(daftar[0].selesai, true, "toggle id 1");',
          'assert.strictEqual(T.sisa(daftar), 1, "sisa");',
          'T.toggle(daftar, 2);',
          'assert.strictEqual(T.sisa(daftar), 0, "sisa habis");',
          '',
          "console.log('OK');",
          '',
        ].join('\n'),
      );
    },
  },
};

const spec = TUGAS_SPEC[TUGAS];
if (!spec) {
  console.log(`tugas tidak dikenal: ${TUGAS} (pilih: ${Object.keys(TUGAS_SPEC).join(', ')})`);
  process.exit(1);
}

const targetPage = pilihJendelaUtama(await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json());
if (!targetPage) {
  console.log('app mati / tidak ada target CDP');
  process.exit(1);
}
const c = await Cdp.connect(targetPage.webSocketDebuggerUrl);
const nonaktifLama = await c.eval(
  `(() => { try { return localStorage.getItem('zephyr.skills.nonaktif'); } catch (e) { return null; } })()`,
);

const awal = await c.runAsync(`
  const st = X.store.getState();
  return {
    busy: st.agentBusy,
    steps: (st.agentSteps || []).length,
    model: st.model || null,
    provider: st.provider || null,
    approval: st.approvalMode || null,
    runMode: st.runMode || null,
    workspace: S.getState().workspace || null,
  };
`);
if (awal.busy) {
  console.log('agent masih sibuk — hentikan dulu sebelum benchmark');
  process.exit(1);
}

const dir = DIR || path.join(tmpdir(), `zephyr-bench-${TUGAS}-${Date.now()}`);
/* Pemeriksaan SEBELUM siapkan(): siapkan() memang menulis berkas tugas, jadi
   memeriksa setelahnya membuat benchmark selalu mundur sendiri (terukur). */
for (const f of ['hitung.js', 'test.js', 'todo.js', 'main.js', 'renderer.js', 'preload.js', 'index.html', 'style.css', 'app.js', 'ide-core.js', 'package.json']) {
  if (existsSync(path.join(dir, f)) && !flag('overwrite') && DIR) {
    console.log(`folder tidak kosong (${f}) — pakai --overwrite atau --dir lain`);
    process.exit(1);
  }
}
mkdirSync(dir, { recursive: true });
spec.siapkan(dir);
if (flag('overwrite')) {
  for (const f of ['hitung.js', 'test.js']) {
    try { rmSync(path.join(dir, f), { force: true }); } catch { /* abaikan */ }
  }
}

const siap = await c.runAsync(`
  ${SKILL_MATI.length ? `try { localStorage.setItem('zephyr.skills.nonaktif', ${JSON.stringify(JSON.stringify(SKILL_MATI))}); } catch (e) {}` : ''}
  await S.getState().openWorkspace(${JSON.stringify(dir)});
  try { await window.__ZEPHYR_WS__.state().setTrust(${JSON.stringify(dir)}, true); } catch (e) {}
  /* Tab editor dari run/workspace SEBELUMNYA tetap terbuka setelah openWorkspace,
     dan akarCwd() memilih folder berkas aktif sebagai cwd bash_run — tab lama
     membuat SETIAP bash_run ditolak "cwd di luar workspace" (terukur di run
     miniide deepseek ke-2). Tutup semuanya supaya cwd = workspace baru. */
  try {
    const st9 = S.getState();
    for (const t of [...st9.tabs]) st9.forceCloseTab(t.id);
  } catch (e) {}
  X.store.setState({ approvalMode: 'auto' });
  ${MODEL ? `await X.store.getState().setModel(${JSON.stringify(MODEL)}, ${JSON.stringify(PROVIDER || undefined)});` : ''}
  X.store.getState().newChat('');
  const st = X.store.getState();
  return {
    workspace: S.getState().workspace || null,
    model: st.model || null,
    provider: st.provider || null,
    approval: st.approvalMode || null,
  };
`);

const dipilih = {
  model: siap?.model ?? null,
  provider: siap?.provider ?? null,
  workspace: siap?.workspace ?? null,
};
if (MODEL && dipilih.model !== MODEL) {
  console.log(`model tidak terpilih (diminta ${MODEL}, dapat ${dipilih.model}) — cek Settings → Models`);
  process.exit(1);
}

console.log(`== benchmark ${TUGAS} ==`);
console.log(`model=${dipilih.model} provider=${dipilih.provider} workspace=${dipilih.workspace}`);
console.log(`folder=${dir}\n`);

await c.eval(`(() => {
  window.__BENCH_SEND = { done: false, value: null, error: null };
  const p = window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(spec.prompt)});
  Promise.resolve(p).then(
    (v) => { window.__BENCH_SEND = { done: true, value: v === true, error: null }; },
    (e) => { window.__BENCH_SEND = { done: true, value: false, error: String((e && e.message) || e).slice(0, 300) }; },
  );
  return 'dikirim';
})()`);

const mulai = Date.now();
let mulaiJalan = false;
let henti = null;
let puncakLangkah = 0;
let terakhir = null;
let ditolakPada = null;

while (Date.now() - mulai < MENIT * 60_000) {
  await sleep(JEDA_MS);
  const s = await c.eval(`(() => {
    const st = window.__ZEPHYR_AI__.store.getState();
    return {
      busy: st.agentBusy,
      steps: (st.agentSteps || []).length,
      idx: st.agentStepIndex || 0,
      phase: st.agentPhase || null,
      tool: st.agentCurrentTool || null,
      confirm: st.agentConfirm ? st.agentConfirm.tool : null,
      tanya: st.agentTanya ? true : false,
      resume: Boolean(st.agentResume),
      kirim: window.__BENCH_SEND || null,
    };
  })()`);
  terakhir = s;
  puncakLangkah = Math.max(puncakLangkah, s.steps);

  if (s.confirm) { henti = `butuh konfirmasi tool: ${s.confirm}`; break; }
  if (s.tanya) { henti = 'agent mengajukan pertanyaan (ask_user)'; break; }
  if (s.kirim?.done && s.kirim.value === false && !s.busy && s.steps <= (awal.steps || 0)) {
    if (!ditolakPada) ditolakPada = Date.now();
    if (Date.now() - ditolakPada > 6000) { henti = `kirim ditolak: ${s.kirim.error || 'tanpa pesan'}`; break; }
  } else {
    ditolakPada = null;
  }

  if (s.busy || s.steps > (awal.steps || 0)) mulaiJalan = true;
  if (mulaiJalan && !s.busy) { henti = 'selesai'; break; }
  if (!mulaiJalan && Date.now() - mulai > 45_000) { henti = 'agent tidak pernah mulai'; break; }
}
if (!henti) henti = 'timeout';

const akhir = await c.runAsync(`
  const st = X.store.getState();
  const sess = st.sessions.find((x) => x.id === (st.activeIds[''] ?? st.activeId)) || null;
  const msg = (sess && sess.messages) || [];
  const asisten = msg.filter((m) => m.role === 'assistant');
  const terakhirAsisten = asisten.length ? String(asisten[asisten.length - 1].content || '') : '';
  return {
    steps: (st.agentSteps || []).map((x) => ({ kind: x.kind, name: x.name || null, ok: x.ok ?? null, ms: x.ms ?? null, args: x.args ? JSON.stringify(x.args) : null, hasil: String(x.result || '').slice(0, 160) })),
    pesan: msg.length,
    asisten: asisten.length,
    teksAkhir: terakhirAsisten.slice(0, 400),
    resume: Boolean(st.agentResume),
    phase: st.agentPhase || null,
  };
`);

const durasiDetik = Math.round((Date.now() - mulai) / 1000);
const steps = akhir?.steps || [];
const tool = steps.filter((x) => x.kind === 'tool');
const namaTool = {};
for (const t of tool) namaTool[t.name] = (namaTool[t.name] || 0) + 1;
const gagal = tool.filter((t) => t.ok === false);
const argumenRusak = tool.filter(
  (t) =>
    t.ok === false &&
    /argumen|tidak valid|input is not valid|invalid|parse/i.test(t.hasil || '') &&
    !/permission denied|dinonaktifkan|not trusted/i.test(t.hasil || ''),
);
const verifikasi = tool.filter(
  (t) =>
    ['bash_run', 'bash_job', 'bash_background'].includes(t.name) &&
    /node\s+-c|node\s+--check|node\s+[^\s]*\.js|node\s+test|npm\s+(run\s+)?test|jest|cargo\s+test|tsc|eslint|\.js:\s*OK|passed|lulus/i.test(
      `${t.args || ''} ${t.hasil || ''}`,
    ),
);
const selesaiNormal = steps.some((x) => x.kind === 'selesai');
const diamTanpaRingkasan = henti === 'selesai' && !selesaiNormal && !(akhir?.teksAkhir || '').trim();

const jalankan = (berkas, argv) => {
  const r = spawnSync(process.execPath, argv || [berkas], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  return { kode: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim().slice(0, 400) };
};

const cek = [];
if (TUGAS === 'kalkulator') {
  const adaHitung = existsSync(path.join(dir, 'hitung.js'));
  const adaTest = existsSync(path.join(dir, 'test.js'));
  cek.push({ nama: 'K1 berkas hitung.js + test.js ada', lulus: adaHitung && adaTest, bukti: `${adaHitung}/${adaTest}` });

  const ujiSendiri = adaTest ? jalankan('test.js') : { kode: null, out: 'tidak ada test.js' };
  cek.push({ nama: 'K2 node test.js exit 0', lulus: ujiSendiri.kode === 0, bukti: `kode=${ujiSendiri.kode} ${ujiSendiri.out.slice(0, 120)}` });

  if (adaHitung) {
    const tersembunyi = path.join(dir, '_uji_tersembunyi.mjs');
    writeFileSync(
      tersembunyi,
      [
        "import assert from 'node:assert';",
        "import { createRequire } from 'node:module';",
        "const require = createRequire(import.meta.url);",
        "const m = require('./hitung.js');",
        "const h = typeof m.tambah === 'function' ? m : (m.default || {});",
        "assert.strictEqual(typeof h.tambah, 'function', 'tambah bukan fungsi');",
        "assert.strictEqual(typeof h.kurang, 'function', 'kurang bukan fungsi');",
        'assert.strictEqual(h.tambah(2, 3), 5);',
        'assert.strictEqual(h.tambah(-1, 1), 0);',
        'assert.strictEqual(h.kurang(9, 4), 5);',
        "console.log('HIDDEN-OK');",
      ].join('\n'),
    );
    const hidden = jalankan('_uji_tersembunyi.mjs');
    cek.push({
      nama: 'K3 uji tersembunyi tambah/kurang',
      lulus: hidden.kode === 0 && hidden.out.includes('HIDDEN-OK'),
      bukti: `kode=${hidden.kode} ${hidden.out.slice(0, 120)}`,
    });
    try { rmSync(tersembunyi, { force: true }); } catch { /* abaikan */ }
  } else {
    cek.push({ nama: 'K3 uji tersembunyi tambah/kurang', lulus: false, bukti: 'tidak ada hitung.js' });
  }

  const verifikasiSendiri = tool.some(
    (t) => ['bash_run', 'bash_job', 'bash_background'].includes(t.name) && /node\s+test\.js|npm\s+test/i.test(`${t.hasil || ''}`),
  ) || tool.some((t) => /OK|tes lulus|test passed/i.test(t.hasil || ''));
  cek.push({ nama: 'K4 agent menjalankan verifikasinya sendiri', lulus: verifikasiSendiri, bukti: `${verifikasiSendiri}` });
} else if (TUGAS === 'miniide') {
  const wajib = ['index.html', 'app.js', 'ide-core.js', 'style.css', 'README.md'];
  const hilang = wajib.filter((f) => !existsSync(path.join(dir, f)));
  cek.push({ nama: 'M1 lima berkas aplikasi ada', lulus: hilang.length === 0, bukti: hilang.length ? `hilang: ${hilang.join(',')}` : 'lengkap' });

  const cekSintaks = ['app.js', 'ide-core.js']
    .filter((f) => existsSync(path.join(dir, f)))
    .map((f) => ({ f, r: spawnSync(process.execPath, ['--check', f], { cwd: dir, encoding: 'utf8' }) }));
  const rusak = cekSintaks.filter((x) => x.r.status !== 0);
  cek.push({ nama: 'M2 sintaks app.js + ide-core.js valid', lulus: rusak.length === 0, bukti: rusak.map((x) => x.f).join(',') || 'ok' });

  if (existsSync(path.join(dir, 'ide-core.js'))) {
    const tersembunyi = path.join(dir, '_uji_tersembunyi.mjs');
    writeFileSync(
      tersembunyi,
      [
        "import assert from 'node:assert';",
        "import { createRequire } from 'node:module';",
        "const require = createRequire(import.meta.url);",
        "const m = require('./ide-core.js');",
        'const f = typeof m.cariKata === "function" ? m.cariKata : m.default && m.default.cariKata;',
        "assert.strictEqual(typeof f, 'function', 'cariKata bukan fungsi');",
        'const hasil = f("halo dunia halo", "halo");',
        'assert.ok(Array.isArray(hasil), "hasil array");',
        'assert.deepStrictEqual(hasil, [{ baris: 1, kolom: 1 }, { baris: 1, kolom: 12 }], "dua temuan satu baris");',
        'const dua = f("satu\\ndua satu\\n", "satu");',
        'assert.deepStrictEqual(dua, [{ baris: 1, kolom: 1 }, { baris: 2, kolom: 5 }], "dua baris");',
        'assert.deepStrictEqual(f("tidak ada", "xyz"), [], "tidak ada temuan");',
        "console.log('HIDDEN-OK');",
      ].join('\n'),
    );
    const hidden = jalankan('_uji_tersembunyi.mjs');
    cek.push({
      nama: 'M3 uji tersembunyi cariKata (baris+kolom 1-based)',
      lulus: hidden.kode === 0 && hidden.out.includes('HIDDEN-OK'),
      bukti: `kode=${hidden.kode} ${hidden.out.slice(0, 140).replace(/\n/g, ' ')}`,
    });
    try { rmSync(tersembunyi, { force: true }); } catch { /* abaikan */ }
  } else {
    cek.push({ nama: 'M3 uji tersembunyi cariKata', lulus: false, bukti: 'tidak ada ide-core.js' });
  }

  let isiApp = '';
  let isiHtml = '';
  try { isiApp = readFileSync(path.join(dir, 'app.js'), 'utf8'); } catch { isiApp = ''; }
  try { isiHtml = readFileSync(path.join(dir, 'index.html'), 'utf8'); } catch { isiHtml = ''; }
  const gabung = `${isiApp}\n${isiHtml}`;
  const fitur = [
    ['daftar berkas', /daftar|list|file/i],
    ['buka ke editor', /textarea|editor/i],
    ['simpan', /simpan|save/i],
    ['pencarian + nomor baris', /cari|search|highlight/i],
  ];
  const ada = fitur.filter(([, re]) => re.test(gabung)).map(([n]) => n);
  cek.push({ nama: 'M4 fitur daftar/buka/simpan/cari tampak di UI', lulus: ada.length === 4, bukti: ada.join(',') });

  cek.push({ nama: 'M5 agent memverifikasi sendiri', lulus: verifikasi.length > 0, bukti: `${verifikasi.length} langkah` });
} else if (TUGAS === 'bughunt') {
  /*
   * Penilaian bughunt: proyek asli diperbaiki agent, lalu diuji dengan
   * "test.js" MILIK AGENT (spesifikasi yang dilarang diubah). Harness
   * menjalankan node test.js di folder hasil, plus salinan spesifikasi
   * tersembunyi untuk memastikan agent tidak menipu dengan melonggarkan test:
   * salinan aslinya ditulis ulang di sini dan dijalankan dari folder lain.
   */
  const ujiAsli = path.join(dir, '_spesifikasi_asli.mjs');
  writeFileSync(
    ujiAsli,
    [
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "const assert = require('node:assert');",
      "const { tambah, kurang, kali } = require('./hitung.js');",
      "const T = require('./todo.js');",
      "const fs = require('node:fs');",
      'assert.strictEqual(tambah(2, 3), 5, "tambah");',
      'assert.strictEqual(tambah(-1, 1), 0, "tambah negatif");',
      'assert.strictEqual(kurang(9, 4), 5, "kurang");',
      'assert.strictEqual(kali(4, 3), 12, "kali");',
      'assert.strictEqual(kali(0, 5), 0, "kali nol");',
      'try { fs.unlinkSync("todo.json"); } catch { }',
      'let daftar = T.muat();',
      'assert.deepStrictEqual(daftar, [], "muat kosong");',
      'T.tambah(daftar, "a");',
      'T.tambah(daftar, "b");',
      'T.simpan(daftar);',
      'daftar = T.muat();',
      'assert.strictEqual(daftar.length, 2, "persistensi");',
      'T.toggle(daftar, 1);',
      'assert.strictEqual(daftar[0].selesai, true, "toggle id 1");',
      'assert.strictEqual(T.sisa(daftar), 1, "sisa");',
      'T.toggle(daftar, 2);',
      'assert.strictEqual(T.sisa(daftar), 0, "sisa habis");',
      "console.log('SPESIFIKASI-OK');",
      '',
    ].join('\n'),
  );
  const spesifikasi = jalankan('_spesifikasi_asli.mjs');
  cek.push({
    nama: 'B1 spesifikasi asli lulus (semua 6 bug benar diperbaiki)',
    lulus: spesifikasi.kode === 0 && spesifikasi.out.includes('SPESIFIKASI-OK'),
    bukti: `kode=${spesifikasi.kode} ${spesifikasi.out.slice(0, 140).replace(/\n/g, ' ')}`,
  });

  const testAgent = existsSync(path.join(dir, 'test.js')) ? jalankan('test.js') : { kode: null, out: 'tidak ada test.js' };
  const testTidakDilonggarkan = (() => {
    try {
      const isi = readFileSync(path.join(dir, 'test.js'), 'utf8');
      /* Spesifikasi asli punya 13 assert; versi dilonggarkan menghapus/mengganti sebagian. */
      return isi.includes('tambah(2, 3), 5') && isi.includes('kali(4, 3), 12') && isi.includes('toggle(daftar, 1)') && isi.includes('muat()');
    } catch {
      return false;
    }
  })();
  cek.push({
    nama: 'B2 node test.js (milik agent, tidak dilonggarkan) exit 0',
    lulus: testAgent.kode === 0 && testTidakDilonggarkan,
    bukti: `kode=${testAgent.kode} utuh=${testTidakDilonggarkan}`,
  });

  const lapor = akhir?.teksAkhir || '';
  const bugDilaporkan = (lapor.match(/\b(bug|bugnya|perbaiki|diperbaiki|salah)\b/gi) || []).length;
  cek.push({
    nama: 'B3 agent melaporkan daftar bug yang diperbaiki',
    lulus: bugDilaporkan >= 2,
    bukti: `sebutan=${bugDilaporkan} teks=${lapor.slice(0, 80).replace(/\n/g, ' ')}`,
  });

  try { rmSync(ujiAsli, { force: true }); } catch { /* abaikan */ }
} else {
  const wajib = ['index.html', 'main.js', 'preload.js', 'renderer.js', 'style.css', 'package.json'];
  const hilang = wajib.filter((f) => !existsSync(path.join(dir, f)));
  cek.push({ nama: 'C1 enam berkas aplikasi ada', lulus: hilang.length === 0, bukti: hilang.length ? `hilang: ${hilang.join(',')}` : 'lengkap' });

  let paketOk = false;
  try {
    const p = JSON.parse(spawnSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync('package.json','utf8'))"], { cwd: dir, encoding: 'utf8' }).stdout);
    paketOk = Boolean(p.main) && Boolean(p.dependencies?.electron || p.devDependencies?.electron);
  } catch { paketOk = false; }
  cek.push({ nama: 'C2 package.json valid + electron', lulus: paketOk, bukti: `${paketOk}` });

  const sintaks = ['main.js', 'preload.js', 'renderer.js']
    .filter((f) => existsSync(path.join(dir, f)))
    .map((f) => ({ f, r: spawnSync(process.execPath, ['--check', f], { cwd: dir, encoding: 'utf8' }) }));
  const rusak = sintaks.filter((x) => x.r.status !== 0);
  cek.push({ nama: 'C3 sintaks main/preload/renderer valid', lulus: rusak.length === 0, bukti: rusak.map((x) => x.f).join(',') || 'ok' });

  let isi = '';
  try { isi = readFileSync(path.join(dir, 'renderer.js'), 'utf8'); } catch { isi = ''; }
  const kemampuan = [
    ['tambah', /\b(tambah|tambahkan|addNote|addCatatan|buatCatatan|createNote|simpanCatatan)\b/i],
    ['hapus', /\b(hapus|deleteNote|removeNote|hapusCatatan|delete|remove)\b/i],
    ['cari', /\b(cari|search|filter|query|saring)\b/i],
  ];
  const punya = kemampuan.filter(([, re]) => re.test(isi)).map(([n]) => n);
  cek.push({ nama: 'C4 renderer punya tambah/hapus/cari', lulus: punya.length === 3, bukti: punya.join(',') });

  cek.push({ nama: 'C5 agent memverifikasi sendiri', lulus: verifikasi.length > 0, bukti: `${verifikasi.length} langkah` });
}

const lulus = cek.filter((x) => x.lulus).length;
const hasil = {
  waktu: new Date().toISOString(),
  tugas: TUGAS,
  model: dipilih.model,
  provider: dipilih.provider,
  folder: dir,
  henti,
  durasiDetik,
  langkah: steps.length,
  tool: namaTool,
  langkahGagal: gagal.length,
  argumenRusak: argumenRusak.length,
  verifikasiSendiri: verifikasi.length,
  diamTanpaRingkasan,
  interruptProvider: Boolean(akhir?.resume),
  teksAkhir: akhir?.teksAkhir || '',
  skor: `${lulus}/${cek.length}`,
  cek,
  steps,
};

await c.runAsync(`
  ${awal.workspace ? `await S.getState().openWorkspace(${JSON.stringify(awal.workspace)});` : 'try { if (S.getState().closeWorkspace) S.getState().closeWorkspace(); } catch (e) {}'}
  try { await window.__ZEPHYR_WS__.state().lupakanTrust(${JSON.stringify(dir)}); } catch (e) {}
  X.store.setState({ approvalMode: ${JSON.stringify(awal.approval || 'ask')} });
  try {
    const lama = ${JSON.stringify(nonaktifLama)};
    const pasang = ${JSON.stringify(SKILL_MATI.length ? JSON.stringify(SKILL_MATI) : null)};
    if (pasang !== null && localStorage.getItem('zephyr.skills.nonaktif') === pasang) {
      if (lama === null) localStorage.removeItem('zephyr.skills.nonaktif');
      else localStorage.setItem('zephyr.skills.nonaktif', lama);
    }
  } catch (e) {}
  return true;
`);

writeFileSync(OUT, JSON.stringify(hasil, null, 2));
console.log('\n-- hasil --');
for (const x of cek) console.log(`${x.lulus ? 'LULUS' : 'GAGAL'}  ${x.nama}  [${x.bukti}]`);
console.log(`\nskor=${hasil.skor} henti=${henti} durasi=${durasiDetik}s langkah=${steps.length} tool=${JSON.stringify(namaTool)}`);
console.log(`gagal=${gagal.length} argumen-rusak=${argumenRusak.length} diam-tanpa-ringkasan=${diamTanpaRingkasan} interrupt=${hasil.interruptProvider}`);
console.log(`laporan: ${OUT}`);
console.log(`folder: ${dir}`);

process.exit(lulus === cek.length ? 0 : 2);
