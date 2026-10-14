/**
 * uji-raksasa.mjs — tugas RAKSASA: situs statis 44 berkas dalam satu run.
 *
 * Pertanyaan yang dijawab: seberapa jauh Zephyr mampu mengerjakan tugas
 * multi-berkas besar (bukan 6-8 berkas, tapi 40+), dan di mana batasnya
 * (kehabisan langkah? guard? treadmill menulis-ulang?).
 *
 * Tugas: folder `raksasa/` berisi index.html + 40 artikel + gaya.css + app.js
 * + README.md. Tiap artikel minimal 300 karakter, punya <title>, <h1> dan
 * tautan balik ke ../index.html; index.html menautkan ke-40 artikel itu.
 *
 * Yang diperiksa:
 *   R1  run berakhir sendiri (tidak kena batas waktu/langkah, tidak macet)
 *   R2  tanpa error provider di balasan terakhir
 *   R3  run berhenti karena SELESAI, bukan karena kehabisan langkah (MAX_AGENT_STEPS)
 *   R4  berkas benar-benar ADA di disk: >= 40 berkas, >= 40 artikel aNN.html
 *   R5  tiap artikel memenuhi syarat isi (title+judul+tautan balik, >=300 char)
 *   R6  index.html menautkan ke >= 40 artikel
 *   R7  tidak ada berkas kosong/cangkang (< 200 char)
 *   R8  rasio baca:tulis wajar (< 2.0) — treadmill terlihat di angka ini
 *   R9  todo_write dipakai sebagai rencana
 *
 *   node scripts/uji-raksasa.mjs [port] [ws] [menit]     Launcher: scripts/_run-raksasa.bat
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing').replace(/\\/g, '/');
const MENIT = Number(process.argv[4] ?? process.env.UJI_MENIT ?? 45);
const R = reporter(`tugas raksasa: 44 berkas dalam satu run (batas ${MENIT} menit)`);

const akar = path.join(path.resolve(WS), 'raksasa');
fs.rmSync(akar, { recursive: true, force: true });

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     agen: ${awal.model} ws=${awal.ws} busy=${awal.busy}`);
if (awal.busy) {
  console.log('     BERHENTI: agen masih sibuk, uji kedua menumpuk tidak sah.');
  await cdp.close();
  process.exit(2);
}

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)}); return true; })())`);
for (let i = 0; i < 40; i++) {
  const r = await cdp.json(`return JSON.stringify({ ws: window.__ZEPHYR__.getState().workspace })`);
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

const judul = [
  'Sejarah Kopi di Nusantara', 'Cara Kerja Mesin Diesel', 'Panduan Bertanam Hidroponik', 'Dasar Fotografi Cahaya Alami',
  'Mengenal Bahasa Pemrograman Rust', 'Tips Merawat Sepeda Lipat', 'Sejarah Kereta Api Indonesia', 'Dasar Akuntansi untuk UMKM',
  'Membuat Roti Sourdough', 'Panduan Mendaki Gunung Pemula', 'Sejarah Batik Pekalongan', 'Dasar Jaringan Komputer',
  'Cara Membaca Peta Topografi', 'Mengenal Alat Musik Angklung', 'Dasar Desain Grafis Vektor', 'Tips Hemat Listrik Rumah',
  'Sejarah Trem di Jakarta', 'Panduan Budidaya Ikan Lele', 'Dasar Statistik untuk Pemula', 'Mengenal Satelit Cuaca',
  'Sejarah Wayang Kulit', 'Dasar Tata Boga Indonesia', 'Cara Merawat Kaktus', 'Mengenal Blockchain Sederhana',
  'Dasar Musik Teori Akor', 'Panduan Menulis Naskah Pendek', 'Sejarah Penerbangan Sipil', 'Dasar Kimia Air Minum',
  'Mengenal Budaya Suku Baduy', 'Dasar Otomotif Mesin Bensin', 'Cara Membuat Sabun Alami', 'Sejarah Perkebunan Teh',
  'Dasar Bahasa Isyarat', 'Mengenal Kapal Pinisi', 'Dasar Ilmu Gizi', 'Cara Menjaga Kesehatan Gigi',
  'Sejarah Radio Komunitas', 'Dasar Seni Ukir Kayu', 'Mengenal Alat Berat Konstruksi', 'Dasar Pemrograman untuk Anak',
];

const TUGAS = [
  'Kerjakan tugas membuat SITUS STATIS lengkap di workspace ini. Ini tugas besar: 44 berkas.',
  '',
  'Langkah pertama WAJIB: panggil todo_write dengan daftar pekerjaanmu (pecah jadi beberapa butir, mis. struktur+CSS, artikel 1-10, 11-20, 21-30, 31-40, index+README, lalu pemeriksaan akhir).',
  '',
  'Struktur yang harus dibuat, semua di dalam folder `raksasa/`:',
  '1. `raksasa/index.html` — halaman utama, memuat daftar tautan ke SEMUA 40 artikel (`artikel/aNN.html`, NN = a01 sampai a40).',
  '2. `raksasa/artikel/aNN.html` — 40 berkas artikel (a01.html ... a40.html). Setiap artikel: HTML lengkap dengan <title>, <h1>, minimal dua paragraf teks asli.',
  '   Setiap artikel memakai judul ini sesuai nomornya:',
  ...judul.map((j, i) => `     a${String(i + 1).padStart(2, '0')}.html = ${j}`),
  '   Setiap artikel WAJIB memuat tautan balik ke halaman utama: <a href="../index.html">.',
  '   Tiap berkas minimal 300 karakter isi — jangan berkas cangkang.',
  '3. `raksasa/gaya.css` — gaya sederhana (minimal 20 baris).',
  '4. `raksasa/app.js` — JavaScript kecil (minimal 10 baris, mis. penanda halaman aktif).',
  '5. `raksasa/README.md` — penjelasan struktur dan cara membukanya.',
  '',
  'ATURAN:',
  '- Tulis berkas satu per satu dengan write_file, langsung isi lengkap. JANGAN menulis berkas placeholder lalu berniat menambalnya nanti.',
  '- JANGAN membaca berkas yang baru kamu tulis sendiri (kamu sudah tahu isinya). Menghemat langkah itu penting di tugas 44 berkas.',
  '- Selesaikan sendiri sampai ke-44 berkas selesai; jangan berhenti di tengah untuk bertanya.',
  '- Di akhir, panggil todo_write lagi dan tandai semua pekerjaan selesai, lalu jawab ringkas: berapa berkas yang dibuat.',
].join('\n');

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)}); return true; })())`);
console.log(`     tugas dikirim (${new Date().toISOString()}) — ini akan makan waktu lama, sabar.`);

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  const jejak = [];
  let terakhir = '';
  while (Date.now() - t0 < 20000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  let nLangkah = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => String(x.name));
    const todos = s.agentTodos || [];
    const baris = 'n=' + steps.length + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length
      + ' baca=' + nama.filter((n) => n === 'read_file' || n === 'bash_run' || n === 'grep').length
      + ' todo=' + todos.filter((t) => t.status === 'done').length + '/' + todos.length;
    if (baris !== terakhir) { terakhir = baris; jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris); }
    if (!s.agentBusy) {
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0, langkah: steps.length,
        tulis: nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length,
        baca: nama.filter((n) => n === 'read_file' || n === 'bash_run' || n === 'grep').length,
        planner: nama.filter((n) => n === 'todo_write').length,
        todoTotal: todos.length, todoDone: todos.filter((t) => t.status === 'done').length,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => String(x.name)),
        error: last ? (last.error || null) : null,
        balasan: last ? String(last.content || '') : '', jejak,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 600000) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const s = A.getState();
  return { ok: false, ms: Date.now() - t0, langkah: (s.agentSteps || []).length, balasan: 'BATAS WAKTU', jejak };
})())`,
  MENIT * 60000 + 90000,
);

console.log(`\n     run: ${hasil.ok ? 'kelar sendiri' : 'TIDAK kelar'} dalam ${Math.round(hasil.ms / 1000)}s, ${hasil.langkah} langkah`);
for (const j of (hasil.jejak || []).slice(-14)) console.log('       ' + j);
console.log(`     tulis=${hasil.tulis} baca=${hasil.baca} todo=${hasil.todoDone}/${hasil.todoTotal} boleh-rencana=${hasil.planner ?? 0}`);
if (hasil.gagal?.length) console.log(`     langkah gagal: ${[...new Set(hasil.gagal)].join(', ')}`);

/* ---- bukti di disk ---- */
function daftarBerkas(dir) {
  const out = [];
  const jalan = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) jalan(p); else out.push(p);
    }
  };
  if (fs.existsSync(dir)) jalan(dir);
  return out;
}
const berkas = daftarBerkas(akar);
const artikel = berkas.filter((p) => /artikel[\\/]a\d{2}\.html$/.test(p));
const ukuran = berkas.map((p) => ({ p: path.relative(akar, p), n: fs.statSync(p).size }));
ukuran.sort((a, b) => a.n - b.n);
console.log(`     di disk: ${berkas.length} berkas (${artikel.length} artikel). Terkecil:`);
for (const u of ukuran.slice(0, 4)) console.log(`       ${u.n} char  ${u.p}`);

let artikelBaik = 0;
for (const p of artikel) {
  const isi = fs.readFileSync(p, 'utf8');
  if (isi.length >= 300 && /<title>/i.test(isi) && /<h1[^>]*>/i.test(isi) && /\.\.\/index\.html/i.test(isi)) artikelBaik++;
}
const adaIndex = fs.existsSync(path.join(akar, 'index.html'));
let tautanIndex = 0;
try {
  tautanIndex = [...fs.readFileSync(path.join(akar, 'index.html'), 'utf8').matchAll(/artikel\/a\d{2}\.html/gi)].length;
} catch { /* belum ada */ }
const cssJs = ['gaya.css', 'app.js', 'README.md'].filter((f) => {
  const p = path.join(akar, f);
  return fs.existsSync(p) && fs.statSync(p).size > 100;
});
const cangkang = ukuran.filter((u) => u.n < 200);

R.check('R1', !!hasil.ok, `run berakhir sendiri (${Math.round(hasil.ms / 1000)}s, ${hasil.langkah} langkah)`);
R.check('R2', !hasil.error, `tanpa error provider (error=${JSON.stringify(hasil.error ?? null)})`);
R.check('R3', (hasil.langkah ?? 0) < 200, `berhenti karena selesai, bukan kehabisan langkah (${hasil.langkah}/200)`);
R.check('R4', berkas.length >= 44 && artikel.length >= 40, `berkas di disk: ${berkas.length} (artikel ${artikel.length}/40)`);
R.check('R5', artikelBaik >= 40, `artikel yang isinya benar (title+judul+tautan balik+>=300 char): ${artikelBaik}/40`);
R.check('R6', adaIndex && tautanIndex >= 40, `index.html ${adaIndex ? `menautkan ${tautanIndex} artikel` : 'TIDAK ADA'}`);
R.check('R7', cangkang.length === 0 && cssJs.length === 3, `tanpa berkas cangkang (${cangkang.length}), css/js/README terisi (${cssJs.length}/3)`);
R.check('R8', (hasil.baca ?? 0) < (hasil.tulis ?? 0) * 2, `rasio baca:tulis wajar (baca ${hasil.baca} vs tulis ${hasil.tulis})`);
R.check('R9', (hasil.planner ?? 0) >= 1 && hasil.todoTotal >= 3, `rencana dipakai (todo_write ${hasil.planner ?? 0}×, ${hasil.todoTotal} butir)`);

console.log(`\n     jawaban akhir agen:\n${'       ' + String(hasil.balasan || '').replace(/\n/g, '\n       ').slice(0, 700)}`);
await cdp.close();
R.selesai();
