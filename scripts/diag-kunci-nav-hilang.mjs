/*
 * Kunci nav Settings mana yang TIDAK ada di kamus mana pun.
 *
 * Satu sudah terbukti bocor: 'settings.permissions' tercetak mentah di UI
 * berbahasa Inggris. Kalau satu hilang, kunci saudaranya di berkas yang sama
 * mungkin juga - dan kunci seperti ini paling sulit terlihat, karena ia hanya
 * muncul sebagai teks berkode di antara label yang rapi.
 *
 * Diperiksa terhadap KESEPULUH kamus, bukan hanya Inggris: kunci yang ada di
 * Inggris tapi tidak di Jepang tetap bocor, cuma di bahasa lain.
 */

import { readFileSync } from 'node:fs';

/* Kunci dari NAV_KEY di SettingsNav.tsx, dibaca dari berkasnya. */
const navTeks = readFileSync('src/components/settings/SettingsNav.tsx', 'utf8');
const kunci = [...navTeks.matchAll(/:\s*'(settings\.[a-z]+)'/g)].map((m) => m[1]);
const unik = [...new Set(kunci)];
console.log('kunci nav ditemukan: ' + unik.length);

/* Semua kamus: i18n.ts (yang memuat kunci dasar) + i18n-extra.ts. */
const kamus = {
  'i18n.ts': readFileSync('src/lib/i18n.ts', 'utf8'),
  'i18n-extra.ts': readFileSync('src/lib/i18n-extra.ts', 'utf8'),
};

const KODE = ['id', 'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];

/* Untuk tiap kunci: di berkas mana ia muncul, dan berapa kali. */
console.log('\nKunci nav dan keberadaannya di kamus:');
const hilang = [];
for (const k of unik) {
  const di = Object.entries(kamus).filter(([, t]) => t.includes("'" + k + "'")).map(([n]) => n);
  if (!di.length) hilang.push(k);
  console.log('  ' + (di.length ? 'ADA   ' : 'HILANG') + '  ' + k + (di.length ? '  (' + di.join(', ') + ')' : ''));
}

console.log('\nHILANG di semua kamus: ' + hilang.length);
hilang.forEach((k) => console.log('  - ' + k));

/* Untuk yang ada di i18n.ts, periksa apakah SEPULUH bahasa memilikinya.
   i18n.ts menyimpan kamus per bahasa; jumlah kemunculan memberi petunjuk. */
console.log('\nJumlah kemunculan di i18n.ts (10 = kesepuluh bahasa punya):');
for (const k of unik) {
  const n = (kamus['i18n.ts'].match(new RegExp("'" + k + "'", 'g')) || []).length;
  if (n !== 10 && n !== 0) console.log('  ' + n + 'x  ' + k + (n < 10 ? '   <- KURANG' : ''));
}
if (hilang.length) {
  console.log('\nKesimpulan: kunci di atas dipakai komponen tapi tidak ada nilainya,');
  console.log('sehingga yang tercetak adalah kunci itu sendiri (teks berkode).');
}
