/*
 * Gambaran lengkap kamus: kunci mana yang dipakai, mana yang mati, dan bahasa
 * mana yang kehilangan apa.
 *
 * Sebelum menyamakan 10 kamus, harus jelas dulu kunci mana yang PANTAS ada.
 * Menyalin kunci mati ke sembilan kamus hanya memperbanyak sampah; membuang
 * kunci yang ternyata dipakai akan menghapus terjemahan yang sah. Jadi tiap
 * kunci diklasifikasi dulu, lalu keputusannya mengikuti klasifikasi itu.
 *
 * Klasifikasi:
 *   DIPAKAI  - kalimatnya muncul di komponen (tr(...) atau sebagai nilai data)
 *   MATI     - hanya muncul di berkas kamus
 *
 * Batas yang diketahui: kunci yang dirakit dinamis tidak akan pernah terbaca
 * DIPAKAI di sini, jadi hasilnya adalah kandidat, bukan kepastian.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BERKAS = 'src/lib/i18n-extra.ts';
const KODE = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const PENGECUALIAN = ['i18n-extra.ts', 'i18n.ts', 'i18n-src.ts', 'devBridge.ts'];

function berkasSumber(d, keluaran = []) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) berkasSumber(p, keluaran);
    else if (/\.(tsx|ts)$/.test(f.name)) keluaran.push(p);
  }
  return keluaran;
}

const baris = readFileSync(BERKAS, 'utf8').split('\n');

/* Batas kamus. */
const peta = {};
for (let i = 0; i < baris.length; i++) {
  const m = baris[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) peta[m[1]] = i;
}

/* Kunci per kamus, BESERTA nomor barisnya supaya bisa disunting. */
const kunci = {};
for (let i = 0; i < KODE.length; i++) {
  const k = KODE[i];
  if (peta[k] === undefined) continue;
  const mulai = peta[k] + 1;
  const akhir = i + 1 < KODE.length && peta[KODE[i + 1]] !== undefined ? peta[KODE[i + 1]] : baris.length;
  const isi = new Map();
  for (let j = mulai; j < akhir; j++) {
    const m = baris[j].match(/^\s{2}(['"])(.*?)\1\s*:/);
    if (m) isi.set(m[2], j);
  }
  kunci[k] = isi;
}

/* Semua berkas sumber, sekali dibaca, untuk klasifikasi DIPAKAI/MATI. */
const sumber = berkasSumber('src')
  .filter((b) => !PENGECUALIAN.some((p) => b.endsWith(p)))
  .map((b) => readFileSync(b, 'utf8'));

function dipakai(k) {
  return sumber.some((t) => t.includes(k));
}

const acuan = kunci.ES;
const semuaKunci = new Set();
for (const k of KODE) if (kunci[k]) for (const x of kunci[k].keys()) semuaKunci.add(x);

let dipakaiN = 0;
let matiN = 0;
const kurang = {};
for (const k of KODE) kurang[k] = [];

for (const x of semuaKunci) {
  if (dipakai(x)) dipakaiN += 1;
  else matiN += 1;
  for (const k of KODE) {
    if (kunci[k] && !kunci[k].has(x)) kurang[k].push(x);
  }
}

console.log('Total kunci unik di semua kamus: ' + semuaKunci.size);
console.log('  dipakai komponen: ' + dipakaiN);
console.log('  mati (kandidat):  ' + matiN);

console.log('\nKunci yang belum ada di tiap bahasa:');
for (const k of KODE) console.log('  ' + k + ': ' + kurang[k].length);

/* Yang paling penting untuk keputusan: apakah kunci yang HILANG di EN itu
   dipakai atau mati. Kalau dipakai, itu bug nyata; kalau mati, itu sampah. */
console.log('\n--- kunci yang hilang di EN, dipisah dipakai/mati ---');
for (const x of kurang.EN) {
  console.log('  ' + (dipakai(x) ? 'DIPAKAI' : 'MATI   ') + '  ' + x);
}

/* Kunci yang HANYA ada di satu kamus - sumber ketidakseimbangan. */
console.log('\n--- kunci yang hanya ada di ID (tidak di 9 lainnya) ---');
const hanyaID = [...(kunci.ID?.keys() ?? [])].filter((x) => KODE.filter((k) => k !== 'ID').every((k) => !kunci[k]?.has(x)));
for (const x of hanyaID.slice(0, 30)) console.log('  ' + (dipakai(x) ? 'DIPAKAI' : 'MATI   ') + '  ' + x);
if (hanyaID.length > 30) console.log('  ... dan ' + (hanyaID.length - 30) + ' lagi');

writeFileSync('scripts/_kamus-analisis.json', JSON.stringify({
  total: semuaKunci.size, dipakai: dipakaiN, mati: matiN,
  kurang, hanyaID,
  klasifikasi: Object.fromEntries([...semuaKunci].map((x) => [x, dipakai(x) ? 'DIPAKAI' : 'MATI'])),
}, null, 1));
console.log('\nRincian: scripts/_kamus-analisis.json');
