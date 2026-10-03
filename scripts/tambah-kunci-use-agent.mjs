/*
 * Menambahkan kunci "Use agent" ke SEMUA kamus.
 *
 * Kunci ini dipakai kartu persona di Settings -> Agents: baris yang tidak aktif
 * menampilkan tombol ini, dan baris yang aktif menampilkan "Active". Kata
 * "Active" sudah ada di kamus; "Use agent" belum, jadi tanpa ini sembilan bahasa
 * akan menampilkan teks Inggris di tombol yang paling sering diklik di halaman
 * itu.
 *
 * Kunci = kalimat sumber (Inggris). Cara menyisipkan: per kamus, dari kamus
 * terakhir ke pertama (supaya nomor baris kamus yang belum disentuh tidak
 * bergeser), lalu dibaca ulang dan dihitung per kamus.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KODE = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const KUNCI = 'Use agent';

const TER = {
  ID: 'Pakai agen ini',
  EN: 'Use agent',
  JA: 'このエージェントを使う',
  KO: '이 에이전트 사용',
  ZH: '使用此代理',
  ES: 'Usar este agente',
  FR: 'Utiliser cet agent',
  DE: 'Diesen Agenten verwenden',
  PT: 'Usar este agente',
  AR: 'استخدام هذا الوكيل',
};

for (const b of KODE) if (!TER[b]) throw new Error('terjemahan hilang: ' + b);

const baris = readFileSync(BERKAS, 'utf8').split('\n');

const peta = {};
for (let i = 0; i < baris.length; i += 1) {
  const m = baris[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    /* `.trim()` karena berkasnya CRLF: barisnya berbunyi '};\r'. */
    for (let j = i + 1; j < baris.length; j += 1) {
      if (baris[j].trim() === '};') { peta[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}
const kurang = KODE.filter((k) => !peta[k]);
if (kurang.length) { console.log('KAMUS TIDAK DITEMUKAN: ' + kurang.join(', ')); process.exit(1); }

/* Sudah ada di kamus mana? */
const ada = KODE.filter((b) => {
  const { buka, tutup } = peta[b];
  for (let j = buka; j < tutup; j += 1) {
    if (baris[j].includes('"' + KUNCI + '":') || baris[j].includes("'" + KUNCI + "':")) return true;
  }
  return false;
});
if (ada.length === KODE.length) { console.log('sudah ada di semua kamus'); process.exit(0); }

console.log('belum ada di: ' + (KODE.length - ada.length) + ' kamus');

/* Dari kamus terakhir ke pertama. */
for (const b of KODE.slice().reverse()) {
  const { buka, tutup } = peta[b];
  let sudah = false;
  for (let j = buka; j < tutup; j += 1) {
    if (baris[j].includes('"' + KUNCI + '":') || baris[j].includes("'" + KUNCI + "':")) { sudah = true; break; }
  }
  if (sudah) continue;
  baris.splice(tutup, 0, '  ' + JSON.stringify(KUNCI) + ': ' + JSON.stringify(TER[b]) + ',');
}

writeFileSync(BERKAS, baris.join('\n'));

/* Verifikasi: baca ulang, hitung per kamus. */
const s = readFileSync(BERKAS, 'utf8').split('\n');
const peta2 = {};
for (let i = 0; i < s.length; i += 1) {
  const m = s[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    for (let j = i + 1; j < s.length; j += 1) {
      if (s[j].trim() === '};') { peta2[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}
let gagal = 0;
for (const b of KODE) {
  const { buka, tutup } = peta2[b];
  let n = 0;
  const lihat = new Set();
  let dup = 0;
  for (let j = buka; j < tutup; j += 1) {
    if (s[j].includes('"' + KUNCI + '":')) n += 1;
    const mm = s[j].match(/^\s{2}(['"])(.*?)\1\s*:/);
    if (mm) { if (lihat.has(mm[2])) dup += 1; lihat.add(mm[2]); }
  }
  if (n !== 1 || dup) { gagal += 1; console.log('  ' + b + ': ' + n + ' kali, duplikat ' + dup + '   <- MASALAH'); }
  else console.log('  ' + b + ': OK');
}
console.log(gagal ? '\nADA MASALAH' : '\nSEMUA KAMUS LENGKAP');
process.exit(gagal ? 1 : 0);
