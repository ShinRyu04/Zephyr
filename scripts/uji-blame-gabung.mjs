/**
 * uji-blame-gabung.mjs - bukti blame menggabungkan baris per COMMIT.
 *
 * Kenapa ini penting: blame per baris adalah dinding teks yang berulang.
 * Sebuah fungsi empat puluh baris dari satu commit menghasilkan empat puluh
 * baris atribusi identik, dan justru pengulangan itu yang membuatnya tidak
 * terbaca. Yang dicari pembaca adalah batas antar-perubahan, bukan setiap
 * barisnya.
 *
 * Yang diuji:
 *   1. satu run dari commit yang sama menghasilkan SATU penanda, di baris
 *      pertama run
 *   2. commit berbeda menghasilkan penanda berbeda
 *   3. penanda digabung berdasarkan HASH, bukan penulis - dua commit
 *      berturut-turut oleh orang yang sama tetap terpisah
 *   4. batas jumlah penanda dihormati
 *   5. daftar kosong tidak menggambar apa pun
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan, tidak butuh git.
 *
 *   node scripts/uji-blame-gabung.mjs
 */
import { reporter } from './lib-cdp.mjs';

const R = reporter('blame digabung per commit');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* ── Cerminan aturan penggabungan di src/lib/gitBlame.ts ────────────────── */

const AUTHOR_MAX = 14;

function umurDari(epoch, sekarang) {
  if (!epoch) return 'lama';
  return (sekarang - epoch) / 86_400 <= 7 ? 'baru' : 'lama';
}

function teksBlame(b) {
  const penulis = b.author.length > AUTHOR_MAX ? `${b.author.slice(0, AUTHOR_MAX - 1)}…` : b.author;
  const ringkas = (b.summary || '').trim();
  return ringkas ? `  ${penulis} · ${ringkas}` : `  ${penulis}`;
}

/** Kembalikan daftar {baris, hash, teks} yang akan digambar. */
function penanda(list, docLines, sekarang, batas) {
  if (list.length === 0 || batas <= 0) return [];
  const perBaris = new Map();
  for (const b of list) {
    if (b.line < 1 || b.line > docLines) continue;
    perBaris.set(b.line, b);
  }
  const out = [];
  let terakhirHash = '';
  for (let n = 1; n <= docLines; n += 1) {
    const b = perBaris.get(n);
    if (!b) continue;
    if (b.hash === terakhirHash) continue;
    terakhirHash = b.hash;
    if (out.length >= batas) break;
    out.push({ baris: n, hash: b.hash, umur: umurDari(Number(b.date) || 0, sekarang), teks: teksBlame(b) });
  }
  return out;
}

const SEKARANG = 1_800_000_000; // detik epoch tetap, supaya uji deterministik
const BARU = SEKARANG - 3 * 86_400; // 3 hari lalu
const LAMA = SEKARANG - 400 * 86_400; // > 1 tahun

const mk = (line, hash, author, summary, date) => ({ line, hash, author, summary, date: String(date) });

/* ── 1. Satu run dari satu commit = satu penanda ──────────────────────── */

const satuRun = [1, 2, 3, 4, 5].map((n) => mk(n, 'aaa111', 'Rizky', 'tambah parser', BARU));
const p1 = penanda(satuRun, 5, SEKARANG, 400);
R.check('B1', p1.length === 1, `5 baris satu commit -> ${p1.length} penanda (harap 1)`);
R.check('B2', p1[0].baris === 1, `penanda di baris PERTAMA run (${p1[0].baris})`);
R.check('B3', p1[0].umur === 'baru', `3 hari lalu terbaca "baru" (${p1[0].umur})`);

/* ── 2. Commit berbeda = penanda berbeda ──────────────────────────────── */

const duaCommit = [
  ...satuRun,
  ...['aaa111', 'aaa111'].map((h, i) => mk(6 + i, h, 'Rizky', 'tambah parser', BARU)),
  ...['bbb222', 'bbb222', 'bbb222'].map((h, i) => mk(8 + i, h, 'Dewi', 'perbaiki tipe', LAMA)),
];
const p2 = penanda(duaCommit, 10, SEKARANG, 400);
R.check('B4', p2.length === 2, `dua commit -> ${p2.length} penanda (harap 2)`);
R.check('B5', p2[0].hash === 'aaa111' && p2[1].hash === 'bbb222', 'urutan hash benar');
R.check('B6', p2[1].baris === 8, `penanda kedua di baris 8 (${p2[1].baris})`);
R.check('B7', p2[1].umur === 'lama', `> 1 tahun terbaca "lama" (${p2[1].umur})`);

/* ── 3. Digabung per HASH, bukan per penulis ──────────────────────────── */

/*
 * Ini pembeda yang mudah salah. Kalau penggabungan memakai nama penulis,
 * dua commit berturut-turut oleh orang yang sama akan terlihat sebagai satu
 * blok - dan batas perubahan di antaranya hilang, padahal justru itu yang
 * dicari orang saat membuka blame.
 */
const samaPenulis = [
  mk(1, 'c1', 'Rizky', 'ubah A', BARU),
  mk(2, 'c1', 'Rizky', 'ubah A', BARU),
  mk(3, 'c2', 'Rizky', 'ubah B', BARU), // hash beda, penulis SAMA
  mk(4, 'c2', 'Rizky', 'ubah B', BARU),
];
const p3 = penanda(samaPenulis, 4, SEKARANG, 400);
R.check(
  'B8',
  p3.length === 2,
  `dua commit oleh penulis sama tetap ${p3.length} penanda (harap 2, bukan 1)`,
);

/* ── 4. Batas dihormati ────────────────────────────────────────────────── */

const banyak = [];
for (let i = 0; i < 50; i += 1) banyak.push(mk(i + 1, `h${i}`, 'X', `s${i}`, BARU));
const p4 = penanda(banyak, 50, SEKARANG, 10);
R.check('B9', p4.length === 10, `batas 10 dihormati (${p4.length})`);

/* ── 5. Daftar kosong / batas nol ──────────────────────────────────────── */

R.check('B10', penanda([], 10, SEKARANG, 400).length === 0, 'daftar kosong -> tanpa penanda');
R.check('B11', penanda(banyak, 50, SEKARANG, 0).length === 0, 'batas 0 -> tanpa penanda');

/* ── 6. Baris di luar dokumen dibuang ──────────────────────────────────── */

const diLuar = [mk(1, 'x', 'A', 's', BARU), mk(999, 'y', 'B', 's', BARU)];
const p6 = penanda(diLuar, 10, SEKARANG, 400);
R.check('B12', p6.length === 1 && p6[0].baris === 1, 'baris di luar dokumen diabaikan');

/* ── 7. Pemotongan nama penulis vs summary ─────────────────────────────── */

const namaPanjang = mk(1, 'h', 'Bartholomew Rizkyawan', 'ringkasan pendek', BARU);
const t = teksBlame(namaPanjang);
R.check('B13', t.includes('…'), 'nama penulis panjang dipotong');
R.check('B14', t.includes('ringkasan pendek'), 'summary TIDAK dipotong');
R.check(
  'B15',
  !t.includes('Bartholomew Rizkyawan'),
  'nama asli tidak bocor utuh ke baris',
);

const tanpaRingkas = mk(1, 'h', 'Dewi', '', BARU);
R.check('B16', teksBlame(tanpaRingkas).trim() === 'Dewi', 'summary kosong -> hanya nama');

/* ── 8. Pemeriksaan silang ke sumber ───────────────────────────────────── */

const fs = await import('node:fs');
const baca = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const src = baca('src/lib/gitBlame.ts');

R.check('B17', src.includes('BLAME_MAX = 400'), 'BLAME_MAX ada di sumber');
R.check('B18', src.includes('AUTHOR_MAX = 14'), 'AUTHOR_MAX ada di sumber');
R.check(
  'B19',
  /b\.hash === terakhirHash/.test(src),
  'sumber menggabung berdasarkan HASH, bukan penulis',
);
R.check('B20', /export const blameField/.test(src), 'blameField diekspor');

console.log('\n  catatan: angka di atas mencerminkan aturan di src/lib/gitBlame.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
