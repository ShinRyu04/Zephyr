/**
 * uji-bug-kejam-verifikasi.mjs — nilai HASIL uji "bug kejam" tanpa run baru.
 *
 * `uji-bug-kejam.mjs` menilai sambil menjalankan agen. Kalau proses node-nya mati
 * di tengah (mis. kena bersih-bersih Job Object sesi), run di dalam app tetap
 * jalan dan berkasnya tetap berubah - tapi laporannya hilang. Skrip ini membaca
 * hasil di disk dan mengulang SELURUH penilaian yang tidak butuh agen hidup:
 * hitungan manual vs `node laporan.js`, idempotensi, apa yang berubah vs `.asli/`,
 * dan apakah perbaikannya akar atau tambalan.
 *
 *   node scripts/uji-bug-kejam-verifikasi.mjs [akar-proyek]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AKAR = path.resolve(process.argv[2] ?? 'D:/Testing/bug-kejam');
const sha = (f) => createHash('sha1').update(fs.readFileSync(f)).digest('hex');

const berkasInti = ['kasir.js', 'laporan.js', 'data/keranjang.json', 'KELUHAN.md'];
const sebelum = Object.fromEntries(berkasInti.map((f) => [f, sha(path.join(AKAR, '.asli', f))]));

const items = JSON.parse(fs.readFileSync(path.join(AKAR, 'data/keranjang.json'), 'utf8'));
const daftar = Array.isArray(items) ? items : items.items;
const diharapkan = daftar.reduce((n, it) => {
  const bruto = it.harga * it.qty;
  const potongan = it.diskon ? Math.round((bruto * Number(it.diskon_persen ?? 10)) / 100) : 0;
  return n + bruto - potongan;
}, 0);

const jalan = spawnSync(process.execPath, ['laporan.js'], { cwd: AKAR, encoding: 'utf8' });
let laporan = null;
try { laporan = JSON.parse(String(jalan.stdout || '{}')); } catch { /* ditangkap di bawah */ }
const totalDilaporkan = laporan && typeof laporan.total === 'number' ? laporan.total : null;

let duaKali = null;
try {
  const { hitungTotal } = require(path.join(AKAR, 'kasir.js'));
  const bikin = () => JSON.parse(fs.readFileSync(path.join(AKAR, 'data/keranjang.json'), 'utf8'));
  const a1 = hitungTotal(bikin());
  const a2 = hitungTotal(bikin());
  const sisa = bikin();
  hitungTotal(sisa);
  duaKali = { a1, a2, sama: a1 === a2, keduaPadaObjekSama: hitungTotal(sisa) === a1 };
} catch (e) {
  duaKali = { error: String((e && e.message) || e) };
}

const berubah = berkasInti.filter((f) => sha(path.join(AKAR, f)) !== sebelum[f]);
const kasirBaru = fs.readFileSync(path.join(AKAR, 'kasir.js'), 'utf8');

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${pesan}`);
};

cek('K2', jalan.status === 0, '`node laporan.js` jalan tanpa error (exit=' + jalan.status + ')');
cek('K3', totalDilaporkan === diharapkan,
  `total laporan COCOK hitungan manual: ${totalDilaporkan} vs ${diharapkan} (kurang ${diharapkan - (totalDilaporkan ?? 0)})`);
cek('K4', duaKali && duaKali.sama === true,
  `total tidak berubah kalau dihitung dua kali (${duaKali?.error ?? duaKali?.a1 + ' vs ' + duaKali?.a2})`);
cek('K5', !berubah.includes('data/keranjang.json') && !berubah.includes('KELUHAN.md'),
  `data & keluhan TIDAK diubah (berubah: ${berubah.join(', ') || 'tidak ada'})`);
cek('K6', berubah.includes('kasir.js') && !berubah.includes('laporan.js'),
  `perbaikan ada di kasir.js, laporan.js tidak ditambal (berubah: ${berubah.join(', ') || 'tidak ada'})`);
cek('K7', duaKali && typeof duaKali.a1 === 'number' && !duaKali.error,
  'API kasir.js tetap utuh (hitungTotal(array) -> number)');
cek('K8', duaKali?.keduaPadaObjekSama === true, 'aman dipanggil pada objek array yang SAMA dua kali (tidak memutasi)');

console.log(`\ncatatan: splice/pop masih ada di kasir.js? ${/splice|pop\(|shift\(/.test(kasirBaru) ? 'ya' : 'tidak'}; ` +
  `tambalan rekap di laporan.js? ${/reduce|forEach/.test(fs.readFileSync(path.join(AKAR, 'laporan.js'), 'utf8')) ? 'ya' : 'tidak'}`);

const asli = fs.readFileSync(path.join(AKAR, '.asli/kasir.js'), 'utf8');
const barisAsli = asli.split('\n');
const barisBaru = kasirBaru.split('\n');
console.log(`\nkasir.js: ${barisAsli.length} -> ${barisBaru.length} baris`);
for (const b of barisBaru) {
  if (!barisAsli.includes(b) && b.trim()) console.log('  + ' + b.trim().slice(0, 140));
}

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
