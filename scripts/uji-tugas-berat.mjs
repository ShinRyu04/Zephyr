/**
 * uji-tugas-berat.mjs - uji NYATA tugas agen berat: bikin situs multi-berkas.
 *
 * Tujuan: mengukur apa yang benar-benar terjadi pada tugas besar, bukan pada
 * satu panggilan tool. Yang dicatat:
 *   - berapa langkah, berapa tool tulis vs baca
 *   - apakah rencana (todo_write) dipakai, dan berapa yang `done`
 *   - apakah run berakhir sendiri, macet, atau dibunuh guard
 *   - berkas APA SAJA yang benar-benar ada di disk (bukti, bukan klaim)
 *
 * Dipakai dua kali: sebelum perbaikan (baseline) dan sesudahnya.
 *
 *   node scripts/uji-tugas-berat.mjs 9223 D:/Testing/berat
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/berat').replace(/\\/g, '/');
const MENIT = Number(process.env.UJI_MENIT ?? 12);
const R = reporter('tugas berat - situs multi-berkas');

fs.mkdirSync(path.resolve(WS), { recursive: true });

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, provider: A.provider, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     sebelum: ${awal.provider}/${awal.model} ws=${awal.ws} busy=${awal.busy}`);

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
  'Bikin situs statis multi-halaman di dalam workspace, di folder `situs`.',
  'Isi berkas yang WAJIB ada, semuanya dengan isi nyata dan lengkap:',
  '1. situs/index.html - landing page, menautkan style.css dan script.js',
  '2. situs/tentang.html - halaman tentang',
  '3. situs/kontak.html - halaman kontak dengan form',
  '4. situs/style.css - gaya untuk ketiga halaman',
  '5. situs/script.js - validasi form + menu mobile',
  '6. situs/README.md - cara menjalankan dan struktur berkas',
  'Tulis berkas-berkas itu dengan write_file. Jangan pakai placeholder "TODO"',
  'atau isi kosong: setiap berkas harus benar-benar bisa dibuka dan jadi.',
  'Setelah semua berkas ditulis, verifikasi SEKALI dengan list_directory,',
  'lalu tutup dengan ringkasan 3 baris.',
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
        balasan: last ? String(last.content || '').slice(0, 1200) : '',
        error: last ? (last.error || null) : null,
        streaming: last ? !!last.streaming : null,
        jejak,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 120000) {
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
R.check('H3', tulis >= 6, `menulis >= 6 berkas: ${tulis} tulis / ${baca} baca / ${nama.length} langkah`);
R.check('H4', baca <= tulis + 4, `rasio baca:tulis sehat (${baca} baca vs ${tulis} tulis)`);
R.check('H5', (hasil.todoTotal ?? 0) >= 3, `rencana dipakai: ${hasil.todoTotal} todo`);
R.check('H6', (hasil.todoDone ?? 0) >= 3 && hasil.todoDone === hasil.todoTotal, `todo tuntas: ${hasil.todoDone}/${hasil.todoTotal}`);

/* ── Bukti dari DISK ─────────────────────────────────────────────────── */
const wajib = ['index.html', 'tentang.html', 'kontak.html', 'style.css', 'script.js', 'README.md'];
const berkas = wajib.map((f) => {
  const p = path.join(path.resolve(WS), 'situs', f);
  let isi = '';
  try { isi = fs.readFileSync(p, 'utf8'); } catch { return { f, ada: false, isi: '' }; }
  return { f, ada: true, panjang: isi.length };
});
const hilang = berkas.filter((b) => !b.ada).map((b) => b.f);
R.check('H7', hilang.length === 0, `semua berkas WAJIB ada di disk (${hilang.join(', ') || 'lengkap'})`);
for (const b of berkas) console.log(`     ${b.ada ? 'ADA ' : 'HILANG'} ${b.f}${b.ada ? ` (${b.panjang} char)` : ''}`);

console.log('\n--- laporan agent ---');
console.log(String(hasil.balasan ?? '').trim().slice(0, 900) || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(R.results.some((r) => !r.ok) ? 1 : 0);
