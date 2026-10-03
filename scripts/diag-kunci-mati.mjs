/*
 * Kunci kamus yang TIDAK PERNAH diminta komponen.
 *
 * Kunci seperti 'Tool yang dikenalkan ke model' ada di kamus, tapi pencarian di
 * seluruh src menunjukkan ia hanya muncul di berkas kamus itu sendiri - tidak
 * ada komponen yang memanggil tr() dengan kalimat itu. Kunci seperti itu tidak
 * merusak apa pun, tapi ia MENYAMARKAN masalah: selisih jumlah kunci antar
 * kamus jadi terlihat seperti terjemahan yang belum lengkap, padahal yang
 * sebenarnya terjadi adalah kunci yang tidak dipakai.
 *
 * Skrip ini memisahkan dua hal itu, karena keduanya butuh tindakan berbeda.
 *
 * Penjaga: kunci yang dibentuk secara dinamis (dirakit dari variabel) tidak
 * akan pernah terdeteksi di sini, jadi hasilnya dilaporkan sebagai "kandidat",
 * bukan sebagai kepastian.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function berkasSumber(d, keluaran = []) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) berkasSumber(p, keluaran);
    else if (/\.(tsx|ts)$/.test(f.name)) keluaran.push(p);
  }
  return keluaran;
}

/* Kunci ID yang dicurigai tidak terpakai. */
const KUNCI = [
  'Tool yang dikenalkan ke model',
  'Panjang prompt sekarang',
  'Sembunyikan pratinjau',
  'Ini yang benar-benar dikirim ke model (tanpa aturan proyek & konteks).',
  'belum dipilih',
  '(belum ada model yang dipilih)',
  'Persona: identitas',
];

/* Berkas yang BOLEH memuat kunci tanpa itu berarti terpakai: berkas kamus itu
   sendiri, dan berkas bridge dev yang memang membaca daftar kunci. */
const PENGECUALIAN = ['i18n-extra.ts', 'i18n.ts', 'i18n-src.ts', 'devBridge.ts'];

const semua = berkasSumber('src');
const laporan = {};

for (const k of KUNCI) {
  const pemakai = [];
  for (const b of semua) {
    if (PENGECUALIAN.some((p) => b.endsWith(p))) continue;
    if (readFileSync(b, 'utf8').includes(k)) pemakai.push(b);
  }
  laporan[k] = pemakai;
  console.log(
    (pemakai.length ? 'DIPAKAI ' : 'MATI    ') + k + (pemakai.length ? '  <- ' + pemakai.join(', ') : ''),
  );
}

const mati = Object.entries(laporan).filter(([, p]) => p.length === 0).map(([k]) => k);
console.log('\nkandidat kunci mati: ' + mati.length + ' dari ' + KUNCI.length);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ mati, laporan }, null, 1));
}

/* Pemeriksaan kewajaran: kalau SEMUANYA mati, kemungkinan besar cara deteksinya
   yang salah (mis. kunci memang dirakit dinamis), bukan kuncinya. */
if (mati.length === KUNCI.length) {
  console.log('PERINGATAN: semua terdeteksi mati - curigai deteksinya lebih dulu');
}
