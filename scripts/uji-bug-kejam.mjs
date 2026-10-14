/**
 * uji-bug-kejam.mjs — versi KEJAM dari uji perbaikan bug.
 *
 * Bedanya dengan `uji-bug-hunt.mjs`: di sana agen diberi proyek yang sudah punya
 * TES yang gagal, jadi letak masalahnya bisa ditemukan dengan menjalankan tes.
 * Di sini agen hanya diberi KELUHAN pengguna (gejala), tanpa tes, tanpa petunjuk
 * letak, dan tanpa contoh input yang salah. Yang harus ia lakukan sendiri:
 * memahami gejala -> menyusun hipotesis -> menemukan akar -> membuktikan.
 *
 * Musuh yang sengaja dipasang:
 *   * tambalan termudah adalah "hitung ulang di laporan.js" (dilarang di keluhan)
 *   * tambalan kedua adalah mengubah data supaya cocok (dilarang)
 *   * tambalan ketiga adalah menghapus keluhannya
 * Karena itu yang dinilai BUKAN kata-kata agen, tapi: hasil `node laporan.js`
 * yang dijalankan HARNESS sendiri, dibandingkan dengan hitungan yang dihitung
 * harness sendiri dari data mentah.
 *
 *   node scripts/uji-bug-kejam.mjs [port] [akar-proyek]
 *   Env: MENIT=12
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Cdp, reporter } from './lib-cdp.mjs';

/* Berkas .mjs tidak punya `require`: dipakai untuk memanggil modul kasir
   (CommonJS) langsung dari disk, supaya yang diuji kode nyata - bukan salinan. */
const require = createRequire(import.meta.url);

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const AKAR = (process.argv[3] ?? 'D:/Testing/bug-kejam').replace(/\\/g, '/');
const MENIT = Number(process.env.MENIT ?? 12);
const ASLI = path.join(AKAR, '.asli');
const R = reporter('bug "versi kejam": gejala saja, tanpa tes');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ada = (f) => fs.existsSync(path.join(AKAR, f));

/* ── pulihkan kondisi awal (run sebelumnya sudah memperbaiki bug) ────── */
const berkasInti = ['kasir.js', 'laporan.js', 'data/keranjang.json', 'KELUHAN.md'];
if (fs.existsSync(ASLI)) {
  for (const f of berkasInti) {
    const dari = path.join(ASLI, f);
    if (fs.existsSync(dari)) fs.copyFileSync(dari, path.join(AKAR, f));
  }
  console.log('     (kondisi bug dipulihkan dari .asli/)');
} else {
  fs.mkdirSync(path.join(ASLI, 'data'), { recursive: true });
  for (const f of berkasInti) fs.copyFileSync(path.join(AKAR, f), path.join(ASLI, f));
  console.log('     (.asli/ dibuat: salinan kondisi bug)');
}

const sebelum = Object.fromEntries(berkasInti.map((f) => [f, sha(path.join(AKAR, f))]));

/* Hitungan BENAR dihitung harness sendiri dari data mentah - bukan dari kode
   yang diperbaiki agen, bukan dari klaim agen. */
const data = JSON.parse(fs.readFileSync(path.join(AKAR, 'data/keranjang.json'), 'utf8'));
const diharapkan = data.reduce((n, it) => {
  const bruto = it.harga * it.qty;
  const potongan = it.diskon ? Math.round(bruto * Number(it.diskon_persen ?? 10) / 100) : 0;
  return n + bruto - potongan;
}, 0);
const keluhan = fs.readFileSync(path.join(AKAR, 'KELUHAN.md'), 'utf8');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const sibuk = await cdp.json(`return JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentBusy)`);
if (sibuk) {
  console.log('     BERHENTI: agen masih sibuk.');
  await cdp.close();
  process.exit(2);
}

/* Workspace harus benar-benar pindah sebelum tugas dikirim: kalau openWorkspace
   diabaikan (mis. app sibuk), perbaikan akan mendarat di folder lain dan uji ini
   melaporkan "kasir.js tidak berubah" untuk run yang sebenarnya sukses. */
console.log(`     menyiapkan workspace ${AKAR}...`);
const wsPasang = await cdp.json(
  `return JSON.stringify(await (async () => {
  for (let i = 0; i < 20; i++) {
    void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(AKAR)});
    await new Promise((r) => setTimeout(r, 250));
    const ws = window.__ZEPHYR__.getState().workspace ?? null;
    if (String(ws).split(String.fromCharCode(92)).join('/') === ${JSON.stringify(AKAR.split('\\').join('/'))}) return { ws, ok: true };
  }
  return { ws: window.__ZEPHYR__.getState().workspace ?? null, ok: false };
})())`,
  30000,
);
if (!wsPasang.ok) {
  console.log(`     BERHENTI: workspace uji tidak bisa dipasang (sekarang ${wsPasang.ws}).`);
  await cdp.close();
  process.exit(3);
}

/* Tugasnya: gejala, bukan letak. Titik. */
const tugas =
  'Baca KELUHAN.md di workspace ini dan selesaikan keluhannya. ' +
  'Letak masalahnya tidak diberitahu dan tidak ada tes yang tersedia - cari sendiri akarnya, ' +
  'lalu buktikan perbaikannya dengan menjalankan programnya. Ikuti semua batasan di keluhan itu.';

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
      if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  const t0 = Date.now();
  void A.getState().send(${JSON.stringify(tugas)});
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const jejak = [];
  let nLangkah = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => x.name);
    const todos = s.agentTodos || [];
    const baris = 'n=' + steps.length + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit').length
      + ' jalankan=' + nama.filter((n) => n === 'bash_run').length
      + ' todo=' + todos.filter((t) => t.status === 'done').length + '/' + todos.length;
    if (jejak.length === 0 || jejak[jejak.length - 1].slice(5) !== baris) jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris);
    if (!s.agentBusy) {
      const sn = s.activeSession ? s.activeSession() : null;
      const ms = (sn && sn.messages) ? sn.messages : [];
      const last = ms[ms.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0, langkah: steps.length, nama, jejak,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        todoTotal: todos.length, todoDone: todos.filter((t) => t.status === 'done').length,
        balasan: last ? String(last.content || '').slice(0, 1600) : '',
        error: last ? (last.error || null) : null,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 180000) return { ok: false, macet: true, ms: Date.now() - t0, langkah: nama.length, nama, jejak, todoTotal: (s.agentTodos || []).length };
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0, jejak };
})())`,
  MENIT * 60000 + 60000,
);

console.log('\n--- jejak ---');
for (const j of hasil.jejak ?? []) console.log('  ' + j);

/* ── bukti utama: HARNESS yang menjalankan programnya ───────────────── */
const jalan = spawnSync(process.execPath, ['laporan.js'], { cwd: AKAR, encoding: 'utf8' });
let laporan = null;
try { laporan = JSON.parse(String(jalan.stdout || '{}')); } catch { /* biar K2 yang menangkap */ }
const totalDilaporkan = laporan && typeof laporan.total === 'number' ? laporan.total : null;

/* Idempotensi: bug mutasi-array membuat panggilan KEDUA memberi hasil berbeda. */
let duaKali = null;
try {
  const { hitungTotal } = require(path.join(AKAR, 'kasir.js'));
  const bikin = () => JSON.parse(fs.readFileSync(path.join(AKAR, 'data/keranjang.json'), 'utf8'));
  const a1 = hitungTotal(bikin());
  const a2 = hitungTotal(bikin());
  const sisa = bikin();
  hitungTotal(sisa); // sekali pada objek yang sama, lalu sekali lagi
  duaKali = { a1, a2, sama: a1 === a2, keduaPadaObjekSama: hitungTotal(sisa) === a1 };
} catch (e) {
  duaKali = { error: String(e && e.message ? e.message : e) };
}

const berubah = berkasInti.filter((f) => sha(path.join(AKAR, f)) !== sebelum[f]);
const kasirBaru = fs.readFileSync(path.join(AKAR, 'kasir.js'), 'utf8');

R.check('K1', hasil.ok === true, `run berakhir sendiri (${hasil.ok ? Math.round(hasil.ms / 1000) + 's' : hasil.macet ? 'MACET' : 'TIMEOUT'})`);
R.check('K2', jalan.status === 0, `\`node laporan.js\` jalan tanpa error (exit=${jalan.status}) dijalankan HARNESS, bukan agen`);
R.check('K3', totalDilaporkan === diharapkan,
  `total di laporan COCOK dengan hitungan harness sendiri: ${totalDilaporkan} vs ${diharapkan} (kurang ${diharapkan - (totalDilaporkan ?? 0)})`);
R.check('K4', duaKali && duaKali.sama === true,
  `total tidak lagi berubah kalau dihitung dua kali (${duaKali?.error ?? `${duaKali?.a1} vs ${duaKali?.a2}`})`);
R.check('K5', !berubah.includes('data/keranjang.json') && !berubah.includes('KELUHAN.md'),
  `data & keluhan TIDAK diubah (berubah: ${berubah.join(', ') || 'tidak ada'})`);
R.check('K6', berubah.includes('kasir.js') && !berubah.includes('laporan.js'),
  `perbaikan ada di kasir.js, laporan.js tidak ditambal (berubah: ${berubah.join(', ') || 'tidak ada'})`);
R.check('K7', duaKali && typeof duaKali.a1 === 'number' && !duaKali.error,
  `API kasir.js tetap utuh (hitungTotal(array) -> number)`);
R.check('K8', (hasil.nama ?? []).filter((n) => n === 'bash_run').length >= 1,
  `agen MEMBUKTIKAN dengan menjalankan programnya sendiri (${(hasil.nama ?? []).filter((n) => n === 'bash_run').length} langkah shell)`);
R.check('K9', !hasil.error, `tidak ada error provider (${hasil.error ?? 'bersih'})`);

/* Akar vs tambalan: dibaca dari KODE, bukan dari klaim agen. */
const mutasiSaatIterasi = /splice|shift\(|pop\(/.test(kasirBaru) && !/for\s*\([^)]*;[^)]*;[^)]*\)[\s\S]{0,400}?splice\(/.test(kasirBaru);
console.log(`     catatan: splice/pop masih ada di kasir.js? ${/splice/.test(kasirBaru) ? 'ya' : 'tidak'}; ` +
  `tambalan rekap di laporan.js? ${/reduce|forEach/.test(fs.readFileSync(path.join(AKAR, 'laporan.js'), 'utf8')) ? 'ya' : 'tidak'}`);

console.log('\n--- langkah yang dipakai (urut) ---');
console.log('     ' + (hasil.nama ?? []).join(' -> ').slice(0, 900));
console.log('\n--- laporan agent ---');
console.log('     ' + String(hasil.balasan ?? '').trim().slice(0, 1200).replace(/\n/g, '\n     '));
console.log(`\n--- keluhan yang diberikan ---\n     ${keluhan.split('\n')[2]?.trim() ?? ''}`);

await cdp.close();
R.selesai();
