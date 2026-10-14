/**
 * uji-hunk-diff.mjs - bukti terima/tolak per-hunk benar.
 *
 * Kenapa ini penting: aturan untuk baris `del` TERBALIK dari `add`. Sebuah
 * penghapusan hanya ditulis kalau hunk-nya DITOLAK — baris lama tetap ada
 * karena perubahan yang akan menghapusnya ditolak. Terbalik = berkas kehilangan
 * baris yang tidak pernah disetujui pembaca untuk hilang.
 *
 * Yang diuji:
 *   1. pengelompokan hunk: run baris berubah yang berurutan
 *   2. satu baris tak berubah MEMISAHKAN dua hunk
 *   3. terima semua == teks baru
 *   4. tolak semua == teks lama
 *   5. terima sebagian: hanya perubahan itu yang muncul
 *   6. `del` ditulis saat hunk DITOLAK (inversi yang gampang salah)
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-hunk-diff.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('terima/tolak per-hunk');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan barisDiff + bagiHunk + terapkanHunk. */
function barisDiff(lama, baru) {
  const a = lama.split('\n');
  const b = baru.split('\n');
  const out = [];
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i += 1; }
    else { out.push({ kind: 'add', text: b[j] }); j += 1; }
  }
  while (i < a.length) { out.push({ kind: 'del', text: a[i] }); i += 1; }
  while (j < b.length) { out.push({ kind: 'add', text: b[j] }); j += 1; }
  return out;
}

function bagiHunk(rows) {
  const out = [];
  let kini = null;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.kind === 'same') { kini = null; continue; }
    if (!kini) { kini = { id: out.length, rows: [], tambah: 0, hapus: 0 }; out.push(kini); }
    kini.rows.push(i);
    if (r.kind === 'add') kini.tambah += 1; else kini.hapus += 1;
  }
  return out;
}

function terapkanHunk(rows, diterima) {
  const pemilik = new Map();
  for (const h of bagiHunk(rows)) for (const i of h.rows) pemilik.set(i, h.id);
  const keluar = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.kind === 'same') { keluar.push(r.text); continue; }
    const punya = pemilik.get(i);
    const ok = punya !== undefined && diterima.has(punya);
    if (r.kind === 'add' ? ok : !ok) keluar.push(r.text);
  }
  return keluar.join('\n');
}

/* ── 1. Dasar: satu perubahan ─────────────────────────────────────────── */

const lama1 = 'a\nb\nc';
const baru1 = 'a\nB\nc';
const d1 = barisDiff(lama1, baru1);
const h1 = bagiHunk(d1);
R.check('H1', h1.length === 1, `satu perubahan -> 1 hunk (${h1.length})`);
R.check('H2', h1[0].tambah === 1 && h1[0].hapus === 1, `hunk mencatat 1 tambah 1 hapus`);
R.check(
  'H3',
  terapkanHunk(d1, new Set([0])) === baru1,
  'terima hunk -> teks BARU',
);
R.check(
  'H4',
  terapkanHunk(d1, new Set()) === lama1,
  'tolak hunk -> teks LAMA',
);
R.check(
  'H5',
  terapkanHunk(d1, new Set()) === lama1,
  'inversi `del`: baris lama ADA saat hunk ditolak',
);

/* ── 2. Dua hunk dipisahkan baris tak berubah ─────────────────────────── */

const lama2 = 'a\nb\nc\nd\ne';
const baru2 = 'a\nB\nc\nD\ne';
const d2 = barisDiff(lama2, baru2);
const h2 = bagiHunk(d2);
R.check('H6', h2.length === 2, `dua perubahan terpisah -> 2 hunk (${h2.length})`);
R.check('H7', terapkanHunk(d2, new Set([0, 1])) === baru2, 'terima keduanya -> teks baru');

/* Terima hunk PERTAMA saja: perubahan kedua kembali ke lama. */
const separuh = terapkanHunk(d2, new Set([0]));
R.check('H8', separuh === 'a\nB\nc\nd\ne', `terima hunk 0 saja (${JSON.stringify(separuh)})`);
R.check('H9', separuh.includes('B'), 'perubahan pertama diterapkan');
R.check('H10', separuh.includes('\nd\n'), 'perubahan kedua TIDAK diterapkan');

/* Terima hunk KEDUA saja. */
const separuh2 = terapkanHunk(d2, new Set([1]));
R.check('H11', separuh2 === 'a\nb\nc\nD\ne', `terima hunk 1 saja (${JSON.stringify(separuh2)})`);

/* ── 3. Penambahan murni ──────────────────────────────────────────────── */

const d3 = barisDiff('a\nb', 'a\nX\nY\nb');
const h3 = bagiHunk(d3);
R.check('H12', h3.length === 1, `dua baris ditambah berurutan -> SATU hunk (${h3.length})`);
R.check('H13', h3[0].tambah === 2 && h3[0].hapus === 0, 'hunk mencatat 2 tambah, 0 hapus');
R.check('H14', terapkanHunk(d3, new Set([0])) === 'a\nX\nY\nb', 'terima -> kedua baris masuk');
R.check('H15', terapkanHunk(d3, new Set()) === 'a\nb', 'tolak -> keduanya tidak masuk');

/* ── 4. Penghapusan murni ─────────────────────────────────────────────── */

const d4 = barisDiff('a\nX\nY\nb', 'a\nb');
R.check('H16', terapkanHunk(d4, new Set([0])) === 'a\nb', 'terima -> kedua baris hilang');
R.check(
  'H17',
  terapkanHunk(d4, new Set()) === 'a\nX\nY\nb',
  `tolak -> kedua baris TETAP (${JSON.stringify(terapkanHunk(d4, new Set()))})`,
);

/* ── 5. Tidak ada perubahan ───────────────────────────────────────────── */

const d5 = barisDiff('sama\nsekali', 'sama\nsekali');
R.check('H18', bagiHunk(d5).length === 0, 'tanpa perubahan -> 0 hunk');
R.check('H19', terapkanHunk(d5, new Set()) === 'sama\nsekali', 'teks tetap');

/* ── 6. Perubahan di dua tempat, dipisah baris tak berubah ────────────── */

/*
 * `a b c d` -> `a BARU c`: baris 2 diubah AND baris 4 dihapus. Dua perubahan
 * terpisah dengan `c` di antaranya, jadi DUA hunk — bukan satu. Asumsi pertama
 * tes ini salah (mengira satu), dan kodenya yang benar.
 */
const lama6 = 'a\nb\nc\nd';
const baru6 = 'a\nBARU\nc';
const d6 = barisDiff(lama6, baru6);
const h6 = bagiHunk(d6);
R.check('H20', h6.length === 2, `dua perubahan dipisah oleh c -> 2 hunk (${h6.length})`);
R.check(
  'H21',
  terapkanHunk(d6, new Set([0, 1])) === baru6,
  `terima KEDUA hunk -> teks baru (${JSON.stringify(terapkanHunk(d6, new Set([0, 1])))})`,
);
R.check('H22', terapkanHunk(d6, new Set()) === lama6, 'tolak -> teks lama persis');
R.check(
  'H23',
  terapkanHunk(d6, new Set([0])) === 'a\nBARU\nc\nd',
  `terima ubah-saja: baris d TETAP (${JSON.stringify(terapkanHunk(d6, new Set([0])))})`,
);
R.check(
  'H24',
  terapkanHunk(d6, new Set([1])) === 'a\nb\nc',
  `terima hapus-saja: baris b TETAP (${JSON.stringify(terapkanHunk(d6, new Set([1])))})`,
);

/* ── 7. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/simpleDiff.ts', 'utf8');
  } catch {
    return '';
  }
})();
R.check('S1', /export function bagiHunk/.test(src), 'bagiHunk diekspor');
R.check('S2', /export function terapkanHunk/.test(src), 'terapkanHunk diekspor');
R.check(
  'S3',
  /r\.kind === 'add' \? ok : !ok/.test(src),
  'inversi `del` ada di sumber (`add ? ok : !ok`)',
);
R.check('S4', /if \(r\.kind === 'same'\) \{\s*\n\s*kini = null/.test(src), 'baris sama memutus hunk');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/simpleDiff.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
