/*
 * Mencari kunci yang TIDAK ada di semua kamus.
 *
 * Kenapa ini perlu: `translate()` jatuh ke kamus Indonesia kalau kunci tidak
 * ditemukan di bahasa yang diminta. Artinya kunci yang hanya ada di kamus ID
 * akan tampil INDONESIA di sembilan bahasa lain - dan itu terlihat seperti
 * "terjemahan belum lengkap", padahal kamusnya sehat; yang salah cuma satu
 * kunci yang ketinggalan.
 *
 * Sudah terjadi dua kali di proyek ini: `mcp.allowTerminalControl` (hanya di
 * kamus ID, jadi panel MCP tampil Indonesia di semua bahasa) dan kunci-kunci
 * di kamus tambahan yang tidak pernah dimuat. Pemeriksaan ini menutup yang
 * pertama.
 *
 * Dipakai: node scripts/cek-kunci-i18n-10-kamus.mjs
 */

import { readFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n.ts';
const teks = readFileSync(BERKAS, 'utf8');

/*
 * Kamus dibaca per blok, bukan dengan satu pola atas seluruh berkas.
 *
 * Kunci yang sama muncul di sepuluh kamus, jadi memindai seluruh berkas akan
 * mencampur semuanya menjadi satu himpunan besar dan melaporkan "nol masalah"
 * untuk setiap keadaan - pemeriksaan yang selalu lulus lebih buruk daripada
 * tidak ada pemeriksaan.
 */
const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  bahasa: m[1].toLowerCase(),
  mulai: m.index,
}));

if (batas.length < 2) {
  console.error('Hanya ' + batas.length + ' kamus ditemukan. Struktur i18n.ts berubah?');
  process.exit(1);
}

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const mulai = batas[i].mulai;
  const akhir = i + 1 < batas.length ? batas[i + 1].mulai : teks.length;
  const blok = teks.slice(mulai, akhir);
  /* Hanya kunci yang barisnya berupa `'kunci':` di awal indentasi. */
  kamus[batas[i].bahasa] = new Set(
    [...blok.matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1]),
  );
}

const bahasa = Object.keys(kamus);
console.log('Kamus: ' + bahasa.join(', '));
console.log('');

/* Kunci pembanding: apa yang dimiliki kamus dengan kunci TERBANYAK. */
const terbanyak = bahasa.reduce((a, b) => (kamus[a].size >= kamus[b].size ? a : b));
const acuan = kamus[terbanyak];
console.log('Acuan: ' + terbanyak + ' (' + acuan.size + ' kunci)');
console.log('');

let adaMasalah = false;
for (const b of bahasa) {
  if (b === terbanyak) continue;
  const kurang = [...acuan].filter((k) => !kamus[b].has(k));
  if (kurang.length) {
    adaMasalah = true;
    console.log('[' + b + '] kurang ' + kurang.length + ' kunci:');
    kurang.slice(0, 25).forEach((k) => console.log('    ' + k));
    if (kurang.length > 25) console.log('    ... dan ' + (kurang.length - 25) + ' lagi');
    console.log('');
  }
}

if (!adaMasalah) {
  console.log('OK - setiap kamus punya himpunan kunci yang sama');
  process.exit(0);
}

console.log('CATATAN: kunci yang hilang di satu bahasa akan tampil dalam bahasa Indonesia,');
console.log('bukan kosong - jadi bug ini tidak terlihat sampai seseorang memakai bahasa itu.');
process.exit(1);
