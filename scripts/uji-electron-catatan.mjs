/**
 * uji-electron-catatan.mjs - uji NYATA tugas berat: aplikasi Electron "catatan".
 *
 * Ini lebih berat dari uji situs statis: 8 berkas, ada proses utama + preload +
 * renderer + penyimpanan JSON, dan berkas harus SALING NYAMBUNG (IPC, require
 * path, script/link path). Karena itu selain "berkas ada", uji ini memeriksa:
 *   - tiap berkas JS lulus `node --check` (sintaks benar, bukan tebakan)
 *   - package.json valid dan benar-benar mendeklarasikan electron + main
 *   - tidak ada placeholder TODO/FIXME
 *   - rasio baca:tulis dan jumlah langkah (indikator treadmill)
 *
 *   node scripts/uji-electron-catatan.mjs 9223 D:/Testing/electron-catatan
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/electron-catatan').replace(/\\/g, '/');
const MENIT = Number(process.env.UJI_MENIT ?? 15);
const R = reporter('tugas berat - aplikasi Electron catatan');

fs.mkdirSync(path.resolve(WS), { recursive: true });

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, provider: A.provider, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     sebelum: ${awal.provider}/${awal.model} ws=${awal.ws} busy=${awal.busy}`);
if (awal.busy) {
  console.log('     PERINGATAN: agen masih sibuk; uji dibatalkan supaya tidak mencampur dua run.');
  await cdp.close();
  process.exit(2);
}

await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)});
  return true;
})())`);
for (let i = 0; i < 40; i++) {
  const r = await cdp.json(`return JSON.stringify({ws: window.__ZEPHYR__.getState().workspace})`);
  if (String(r.ws ?? '').replace(/\\/g, '/') === WS) break;
  await new Promise((s) => setTimeout(s, 500));
}

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  return true;
})())`);

const TUGAS = [
  'Di workspace ini, bikin aplikasi desktop Electron yang berfungsi: aplikasi catatan (notes).',
  'Tulis berkas-berkas berikut, semuanya di akar workspace, dengan isi nyata dan lengkap:',
  '1. package.json - name, "main": "main.js", script "start": "electron .", devDependency electron.',
  '2. main.js - proses utama Electron: BrowserWindow (contextIsolation true, nodeIntegration false),',
  '   buka renderer/index.html, dan IPC handler untuk notes:list, notes:simpan, notes:hapus, notes:cari.',
  '3. preload.js - contextBridge.exposeInMainWorld("catatan", ...) yang membungkus IPC di atas.',
  '4. src/penyimpanan.js - baca/tulis catatan ke berkas JSON di app.getPath("userData") (CommonJS).',
  '5. renderer/index.html - sidebar daftar catatan + area editor + kotak cari.',
  '6. renderer/app.js - render daftar, simpan, hapus, cari (pakai API dari preload).',
  '7. renderer/style.css - tampilan rapi, tema gelap, responsif.',
  '8. README.md - cara install (npm install) dan menjalankan (npm start) + struktur berkas.',
  'Semua berkas harus SALING NYAMBUNG: path require/import, link css, dan pemanggilan IPC harus cocok.',
  'Jangan pakai placeholder TODO/FIXME dan jangan isi kosong - tiap berkas harus benar-benar jadi.',
  'Tulis pakai write_file. Setelah semua tertulis, verifikasi SEKALI dengan list_directory,',
  'lalu tutup dengan ringkasan singkat: berkas apa saja yang dibuat dan bagaimana menjalankannya.',
].join(' ');

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);
console.log(`     tugas dikirim (${new Date().toISOString()})`);

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  const jejak = [];
  let terakhir = '';
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) {
    await new Promise((r) => setTimeout(r, 50));
  }
  let nLangkah = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => x.name);
    const todos = s.agentTodos || [];
    const baris = 'n=' + steps.length + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length
      + ' baca=' + nama.filter((n) => ['read_file','list_directory','glob','grep','search_files'].includes(n)).length
      + ' todo=' + todos.filter((t) => t.status === 'done').length + '/' + todos.length;
    if (baris !== terakhir) {
      terakhir = baris;
      jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris);
    }
    if (!s.agentBusy) {
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0,
        langkah: steps.length,
        nama,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        todoTotal: todos.length,
        todoDone: todos.filter((t) => t.status === 'done').length,
        todoTeks: todos.map((t) => (t.status || '?') + ' ' + String(t.text ?? t.teks ?? t.title ?? '').slice(0, 60)),
        balasan: last ? String(last.content || '').slice(0, 1500) : '',
        error: last ? (last.error || null) : null,
        jejak,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 180000) {
      return { ok: false, macet: true, ms: Date.now() - t0, langkah: nama.length, nama,
               todoTotal: (s.agentTodos || []).length, jejak };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0, jejak };
})())`,
  MENIT * 60000 + 30000,
);

const detik = Math.round((Date.now() - t0) / 1000);
console.log('\n--- jejak ---');
for (const j of hasil.jejak ?? []) console.log('  ' + j);

const nama = hasil.nama ?? [];
const tulis = nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length;
const baca = nama.filter((n) => ['read_file', 'list_directory', 'glob', 'grep', 'search_files'].includes(n)).length;

R.check('H1', hasil.ok === true, `run BERAKHIR sendiri dalam ${detik}s${hasil.macet ? ' (MACET)' : ''}${hasil.timeout ? ' (TIMEOUT)' : ''}`);
R.check('H2', !hasil.error, `tidak ada error provider (${hasil.error ?? 'bersih'})`);
R.check('H3', tulis >= 8, `menulis >= 8 berkas: ${tulis} tulis / ${baca} baca / ${nama.length} langkah`);
R.check('H4', baca <= tulis + 6, `rasio baca:tulis sehat (${baca} baca vs ${tulis} tulis)`);
R.check('H5', (hasil.todoTotal ?? 0) >= 4, `rencana dipakai: ${hasil.todoTotal} todo`);
R.check('H6', (hasil.todoDone ?? 0) >= 4 && hasil.todoDone === hasil.todoTotal, `todo tuntas: ${hasil.todoDone}/${hasil.todoTotal}`);

/* ── Bukti dari DISK ─────────────────────────────────────────────────── */
const akar = path.resolve(WS);
const wajib = ['package.json', 'main.js', 'preload.js', 'src/penyimpanan.js',
  'renderer/index.html', 'renderer/app.js', 'renderer/style.css', 'README.md'];
const info = wajib.map((f) => {
  const p = path.join(akar, f);
  try { return { f, ada: true, panjang: fs.readFileSync(p, 'utf8').length }; }
  catch { return { f, ada: false, panjang: 0 }; }
});
const hilang = info.filter((b) => !b.ada).map((b) => b.f);
const tipis = info.filter((b) => b.ada && b.panjang < 200).map((b) => b.f);
R.check('H7', hilang.length === 0, `semua berkas WAJIB ada di disk (${hilang.join(', ') || 'lengkap'})`);
R.check('H8', tipis.length === 0, `tidak ada berkas "kerangka kosong" <200 char (${tipis.join(', ') || 'bersih'})`);
for (const b of info) console.log(`     ${b.ada ? 'ADA ' : 'HILANG'} ${b.f}${b.ada ? ` (${b.panjang} char)` : ''}`);

/* Sintaks: node --check, fallback ke mode ESM lewat stdin kalau .js-nya ESM. */
function sintaksOk(p) {
  if (!fs.existsSync(p)) return { ok: false, pesan: 'tidak ada' };
  let r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (r.status === 0) return { ok: true, pesan: 'cjs/ok' };
  const isi = fs.readFileSync(p, 'utf8');
  r = spawnSync(process.execPath, ['--input-type=module', '--check', '-'], { input: isi, encoding: 'utf8' });
  if (r.status === 0) return { ok: true, pesan: 'esm/ok' };
  return { ok: false, pesan: String(r.stderr || '').split('\n').slice(0, 3).join(' ') };
}
const jsFiles = ['main.js', 'preload.js', 'src/penyimpanan.js', 'renderer/app.js'];
const sintaks = jsFiles.map((f) => ({ f, ...sintaksOk(path.join(akar, f)) }));
const rusak = sintaks.filter((s) => !s.ok);
R.check('H9', rusak.length === 0, `semua JS lulus node --check (${rusak.map((s) => s.f).join(', ') || 'bersih'})`);
for (const s of sintaks) console.log(`     ${s.ok ? 'OK  ' : 'RUSAK'} ${s.f} [${s.pesan}]`);

/* package.json harus benar-benar mendeklarasikan electron + main. */
let pkgOk = false, pkgPesan = 'tidak ada';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(akar, 'package.json'), 'utf8'));
  const dev = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  pkgOk = !!(pkg.main && dev.electron);
  pkgPesan = `main=${pkg.main ?? '-'} electron=${dev.electron ?? '-'}`;
} catch (e) { pkgPesan = 'JSON tidak valid: ' + String(e.message).slice(0, 80); }
R.check('H10', pkgOk, `package.json masuk akal (${pkgPesan})`);

/* Placeholder: info, bukan vonis - tapi kalau banyak, isinya bukan "jadi". */
let ph = 0;
for (const f of [...jsFiles, 'renderer/index.html', 'renderer/style.css', 'README.md']) {
  try {
    ph += (fs.readFileSync(path.join(akar, f), 'utf8').match(/TODO|FIXME|Lorem ipsum|placeholder/gi) || []).length;
  } catch { /* berkas hilang sudah dilaporkan di H7 */ }
}
console.log(`     info placeholder TODO/FIXME: ${ph} kemunculan`);

console.log('\n--- laporan agent ---');
console.log(String(hasil.balasan ?? '').trim().slice(0, 1200) || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(R.results.some((r) => !r.ok) ? 1 : 0);
