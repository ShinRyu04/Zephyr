/**
 * uji-bug-hunt.mjs - uji NYATA tugas "betulin bug": proyek kecil yang tesnya
 * sedang GAGAL, lalu agen diminta memperbaiki src/ sampai tesnya lulus tanpa
 * menyentuh tesnya.
 *
 * Yang diperiksa (bukan klaim):
 *   H1 run berakhir sendiri      H2 tanpa error provider
 *   H3 tes BENAR-BENAR lulus     <-- dijalankan harness ini di host, bukan oleh agen
 *   H4 berkas tes TIDAK diubah   <-- hash sha256 sebelum vs sesudah (anti-curang)
 *   H5 rencana dipakai + tuntas  H6 rasio baca:tulis (tugas ini wajar banyak baca)
 *
 *   node scripts/uji-bug-hunt.mjs 9223 D:/Testing/bug-hunt
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/bug-hunt').replace(/\\/g, '/');
const MENIT = Number(process.env.UJI_MENIT ?? 12);
const R = reporter('tugas betulin bug - proyek kecil yang tesnya gagal');

const akar = path.resolve(WS);
const berkasTes = ['tes/jalankan.js'];
const sha = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return 'tidak-ada'; }
};
const sebelum = Object.fromEntries(berkasTes.map((f) => [f, sha(path.join(akar, f))]));

/* Keadaan awal harus benar-benar GAGAL - kalau tidak, uji ini tidak menguji apa pun. */
const pra = spawnSync(process.execPath, ['tes/jalankan.js'], { cwd: akar, encoding: 'utf8' });
console.log(`     sebelum agen: tes exit=${pra.status} (harus != 0)`);
if (pra.status === 0) {
  console.log('     BERHENTI: tes sudah lulus di awal; perbaiki dulu proyek contohnya.');
  process.exit(2);
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, provider: A.provider, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     agen: ${awal.provider}/${awal.model} ws=${awal.ws} busy=${awal.busy}`);
if (awal.busy) {
  console.log('     PERINGATAN: agen masih sibuk; uji dibatalkan.');
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
  'Di workspace ini ada proyek kecil Node yang tesnya sedang GAGAL.',
  'Jalankan dulu `node tes/jalankan.js` untuk melihat kegagalannya.',
  'Tugas kamu: cari akar penyebabnya dan perbaiki HANYA berkas di dalam `src/`',
  'supaya semua tes lulus. Berkas di `tes/` JANGAN diubah sama sekali -',
  'memperbaiki tes bukan memperbaiki kode.',
  'Setelah yakin, jalankan lagi `node tes/jalankan.js` sampai keluar "SEMUA LULUS",',
  'lalu tutup dengan ringkasan singkat: bug apa yang ditemukan, di berkas mana,',
  'dan apa perbaikannya.',
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
        langkah: steps.length, nama,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        todoTotal: todos.length,
        todoDone: todos.filter((t) => t.status === 'done').length,
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

/* ── Bukti utama: tes dijalankan DI HOST, bukan oleh agen ────────────── */
const sesudah = spawnSync(process.execPath, ['tes/jalankan.js'], { cwd: akar, encoding: 'utf8' });
const keluaran = String(sesudah.stdout || '') + String(sesudah.stderr || '');
R.check('H3', sesudah.status === 0, `tes BENAR-BENAR lulus dijalankan harness sendiri (exit=${sesudah.status})`);
console.log('     --- keluaran tes ---');
for (const baris of keluaran.split('\n').slice(-8)) console.log('     ' + baris.trimEnd());

const diubah = berkasTes.filter((f) => sha(path.join(akar, f)) !== sebelum[f]);
R.check('H4', diubah.length === 0, `berkas tes TIDAK disentuh (${diubah.join(', ') || 'utuh'})`);

R.check('H5', (hasil.todoTotal ?? 0) >= 2 && hasil.todoDone === hasil.todoTotal,
  `rencana dipakai & tuntas: ${hasil.todoDone}/${hasil.todoTotal} todo`);
/* Tugas diagnosis memang wajar banyak baca - yang dicurigai adalah baca TANPA akhir. */
R.check('H6', tulis >= 1 && baca <= tulis + 12, `baca:${baca} tulis:${tulis} dalam ${nama.length} langkah (${hasil.gagal?.length ?? 0} langkah gagal)`);

console.log('\n--- langkah yang dipakai (urut) ---');
console.log('     ' + nama.join(' -> ').slice(0, 900));

console.log('\n--- laporan agent ---');
console.log(String(hasil.balasan ?? '').trim().slice(0, 1500) || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(R.results.some((r) => !r.ok) ? 1 : 0);
