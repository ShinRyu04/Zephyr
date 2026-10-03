/*
 * Memisahkan kekurangan kunci yang NYATA dari yang wajar.
 *
 * Aturan:
 * - Kunci yang NILAINYA sudah Inggris: tidak perlu entri di kamus EN, dan tidak
 *   perlu di kamus mana pun selain ID. Jadi kekurangan di EN/ID adalah wajar.
 * - Kunci yang NILAINYA Indonesia (di kamus ID): kalau TIDAK ADA di JA/KO/ZH/
 *   AR/ES/FR/DE/PT, maka di bahasa itu ia tampil INDONESIA. Itu bug.
 *
 * Skrip ini mencari kunci yang nilainya di kamus ID memuat kata Indonesia, lalu
 * memeriksa bahasa mana yang tidak punya kunci itu.
 */

import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/i18n-extra.ts', 'utf8');
const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
  kamus[batas[i].b] = teks.slice(batas[i].i, a);
}

/*
 * Kumpulkan kunci per kamus.
 *
 * Dijalankan atas SELURUH blok kamus sebagai satu string, bukan per baris.
 * Versi pertama skrip ini memeriksa per baris dan melaporkan empat kunci FR
 * "hilang" padahal keempatnya ada di 10 dari 10 kamus - kuncinya terpotong ke
 * dua baris di berkas, dan pola yang menuntut kunci beserta nilainya di baris
 * yang sama melewatkannya.
 *
 * Karena itu pemindaian di sini hanya mengambil NAMANYA, dan `[\s\S]` dipakai
 * agar pemisah baris apa pun ikut cocok.
 */
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
function entri(blok) {
  const m = new Map();
  const re = /^\s{2}'((?:[^'\\]|\\.)*)'\s*:\s*[\s\S]/gm;
  let x;
  while ((x = re.exec(blok))) m.set(x[1], true);
  return m;
}

const isi = {};
for (const b of Object.keys(kamus)) isi[b] = entri(kamus[b]);

const id = isi.ID;
const lain = ['JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

/* Kata yang hampir pasti menandai teks Indonesia, dan tidak muncul di bahasa lain. */
const KATA_ID = /\b(yang|tidak|dengan|untuk|dari|ini|itu|akan|sudah|bisa|belum|pada|adalah|ke|di|dan|atau|kamu|kita|saya|mereka|kalau|saat|juga|hanya|lebih|semua|setelah|harus|masih|banyak|halaman|berkas|berkas|mencari|simpan|hapus|ubah|buka|tutup)\b/i;

/*
 * Penilaian "nilainya Indonesia" sekarang memakai KUNCI-nya, bukan nilainya.
 *
 * Versi pertama memakai nilai dari kamus ID - tapi kamus ID memuat terjemahan
 * Indonesia untuk kunci berbahasa Inggris, jadi ia menandai hampir semua kunci
 * sebagai "Indonesia" dan membanjiri laporan. Yang menentukan sebuah kunci
 * butuh entri di bahasa lain adalah apakah KUNCI-nya berbahasa Indonesia:
 * kunci seperti `format gambar tidak dikenali` akan tampil apa adanya di semua
 * bahasa kalau tidak diterjemahkan, sedangkan `Add to queue` sudah Inggris.
 */
const bocor = [];
for (const [kunci] of id) {
  if (!KATA_ID.test(kunci)) continue;
  const kurangDi = lain.filter((b) => !isi[b].has(kunci));
  if (kurangDi.length) bocor.push({ kunci, kurangDi });
}

console.log('Kunci yang nilainya Indonesia dan TIDAK ada di kamus lain: ' + bocor.length);
console.log('');
for (const x of bocor.slice(0, 40)) {
  console.log('  [' + x.kurangDi.join(',') + '] ' + x.kunci.slice(0, 80));
}
if (bocor.length > 40) console.log('  ... dan ' + (bocor.length - 40) + ' lagi');
console.log('');

/* Ringkasan per bahasa: berapa kunci bocor yang akan tampil Indonesia di sana. */
const per = {};
for (const b of lain) per[b] = bocor.filter((x) => x.kurangDi.includes(b)).length;
console.log('Kunci yang akan tampil INDONESIA per bahasa:');
for (const b of lain) console.log('  ' + b + ': ' + per[b]);
