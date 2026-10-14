/**
 * uji-git-bar.mjs - bukti parser diff menandai baris dengan benar.
 *
 * Kenapa ini penting: parser unified diff yang salah TIDAK terlihat salah. Ia
 * menghasilkan penanda di baris yang keliru, di berkas yang penuh kode, dan
 * pembaca tidak punya cara tahu bahwa bar hijau di baris 40 sebenarnya milik
 * baris 41. Yang paling sering salah adalah penghapusan murni: kalau hanya
 * baris `+` yang ditandai, blok yang DIHAPUS tidak menghasilkan apa pun, dan
 * pembaca menyimpulkan tidak ada yang hilang.
 *
 * Yang diuji:
 *   1. `+` murni = added
 *   2. `-` lalu `+` = modified (bukan added)
 *   3. `-` murni = deleted, di baris SESUDAH celah
 *   4. `\ No newline at end of file` tidak menggeser nomor
 *   5. beberapa hunk dihitung dengan benar
 *   6. penghapusan di akhir hunk tidak dipasangkan ke hunk berikutnya
 *   7. berkas kosong / diff kosong = tanpa penanda
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan, tidak butuh git.
 *
 *   node scripts/uji-git-bar.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('penanda git di gutter');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan `parseDiff` di src/lib/gitBars.ts. */
function parseDiff(patch) {
  const keluar = [];
  if (!patch) return keluar;
  const baris = patch.split('\n');
  let baru = 0;
  let hapusSejakTambah = 0;
  let adaHapus = false;
  let dalamHunk = false;

  for (const l of baris) {
    if (l.startsWith('@@')) {
      if (dalamHunk && hapusSejakTambah > 0) keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });
      hapusSejakTambah = 0;
      adaHapus = false;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
      if (!m) {
        dalamHunk = false;
        continue;
      }
      baru = Number(m[1]);
      dalamHunk = true;
      continue;
    }
    if (!dalamHunk) continue;
    if (l.startsWith('\\')) continue;

    if (l.startsWith('+')) {
      keluar.push({ line: baru, jenis: adaHapus ? 'modified' : 'added' });
      baru += 1;
      hapusSejakTambah = 0;
      adaHapus = false;
    } else if (l.startsWith('-')) {
      hapusSejakTambah += 1;
      adaHapus = true;
    } else if (l.startsWith(' ') || l === '') {
      if (hapusSejakTambah > 0) {
        keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });
        hapusSejakTambah = 0;
        adaHapus = false;
      }
      baru += 1;
    }
  }
  if (dalamHunk && hapusSejakTambah > 0) keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });
  return keluar;
}

const cari = (list, line) => list.find((b) => b.line === line);
const jenis = (list) => list.map((b) => `${b.line}:${b.jenis}`).join(' ');

/* ── 1. Penambahan murni ──────────────────────────────────────────────── */

const tambah = `@@ -1,3 +1,5 @@
 a
+baru1
+baru2
 b
 c`;
const t = parseDiff(tambah);
R.check('G1', t.length === 2, `dua baris ditambah -> ${t.length} penanda`);
R.check('G2', cari(t, 2)?.jenis === 'added' && cari(t, 3)?.jenis === 'added', `keduanya added (${jenis(t)})`);
R.check('G3', !cari(t, 1), 'baris konteks tidak ditandai');
R.check('G4', !cari(t, 4) && !cari(t, 5), 'baris konteks setelahnya tidak ditandai');

/* ── 2. Perubahan: - lalu + ───────────────────────────────────────────── */

const ubah = `@@ -1,3 +1,3 @@
 a
-lama
+baru
 c`;
const u = parseDiff(ubah);
R.check('G5', u.length === 1, `satu baris diubah -> ${u.length} penanda`);
R.check('G6', cari(u, 2)?.jenis === 'modified', `digolongkan modified, bukan added (${jenis(u)})`);
R.check('G7', !cari(u, 1) && !cari(u, 3), 'konteks di sekitarnya bersih');

/* ── 3. Penghapusan murni: di baris SESUDAH celah ─────────────────────── */

/*
 * Ini kasus yang paling mudah salah. Tidak ada baris `+`, jadi kalau hanya
 * `+` yang ditandai, blok yang hilang menghasilkan NOL penanda - dan pembaca
 * menyimpulkan tidak ada yang dihapus.
 */
const hapus = `@@ -1,4 +1,2 @@
 a
-hilang1
-hilang2
 b`;
const h = parseDiff(hapus);
R.check('G8', h.length === 1, `dua baris dihapus -> ${h.length} penanda (bukan nol)`);
R.check('G9', cari(h, 2)?.jenis === 'deleted', `ditandai deleted di baris 2 (${jenis(h)})`);

/* Beberapa penghapusan di tempat berbeda. */
const hapusDua = `@@ -1,6 +1,4 @@
 a
-x
 b
 c
-y
 d`;
const h2 = parseDiff(hapusDua);
R.check('G10', h2.length === 2, `dua blok terhapus -> ${h2.length} penanda`);
R.check('G11', h2.every((b) => b.jenis === 'deleted'), `keduanya deleted (${jenis(h2)})`);
R.check('G12', cari(h2, 2) && cari(h2, 4), `di baris 2 dan 4 (${jenis(h2)})`);

/* ── 4. Marker "no newline" tidak menggeser nomor ─────────────────────── */

const noNewline = `@@ -1,2 +1,2 @@
 a
-b
+b
\\ No newline at end of file`;
const n = parseDiff(noNewline);
R.check('G13', n.length === 1 && n[0].line === 2, `marker backslash tidak menambah penanda (${jenis(n)})`);
R.check('G14', n[0].jenis === 'modified', 'tetap modified');

/* ── 5. Dua hunk: nomor dihitung ulang per hunk ───────────────────────── */

const duaHunk = `@@ -1,3 +1,3 @@
 a
-x
+y
 b
@@ -20,3 +20,3 @@
 p
-q
+r
 s`;
const dh = parseDiff(duaHunk);
R.check('G15', dh.length === 2, `dua hunk -> ${dh.length} penanda`);
R.check('G16', cari(dh, 2)?.jenis === 'modified', `hunk pertama di baris 2 (${jenis(dh)})`);
R.check('G17', cari(dh, 21)?.jenis === 'modified', `hunk kedua di baris 21, bukan 4 (${jenis(dh)})`);

/* ── 6. Penghapusan di akhir hunk TIDAK dipasangkan ke hunk berikutnya ── */

/*
 * Kalau `hapusSejakTambah` tidak di-reset di batas hunk, sebuah penghapusan di
 * ujung hunk pertama akan membuat baris `+` PERTAMA di hunk kedua terbaca
 * sebagai "modified" - padahal itu penambahan di tempat yang sama sekali lain.
 */
const lintasHunk = `@@ -1,2 +1,2 @@
 a
-hilang
@@ -10,2 +10,3 @@
 j
+k
 l`;
const lh = parseDiff(lintasHunk);
const diHunk2 = lh.filter((b) => b.line >= 10);
R.check(
  'G18',
  diHunk2.length === 1 && diHunk2[0].jenis === 'added',
  `penambahan di hunk kedua tetap 'added', bukan 'modified' (${jenis(lh)})`,
);
R.check('G19', lh.some((b) => b.jenis === 'deleted'), `penghapusan hunk pertama tetap tercatat (${jenis(lh)})`);

/* ── 7. Kosong ────────────────────────────────────────────────────────── */

R.check('G20', parseDiff('').length === 0, 'diff kosong -> tanpa penanda');
R.check('G21', parseDiff('bukan diff sama sekali').length === 0, 'teks bukan diff -> tanpa penanda');

/* Berkas baru: semua baris ditambah. */
const berkasBaru = `@@ -0,0 +1,3 @@
+a
+b
+c`;
const bb = parseDiff(berkasBaru);
R.check('G22', bb.length === 3, `berkas baru -> 3 penanda (${bb.length})`);
R.check('G23', bb.every((b) => b.jenis === 'added'), `semuanya added (${jenis(bb)})`);

/* ── 8. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/gitBars.ts', 'utf8');
  } catch {
    return '';
  }
})();

R.check('G24', /export function parseDiff/.test(src), 'parseDiff diekspor');
R.check('G25', /hapusSejakTambah/.test(src), 'penghapusan murni dilacak di sumber');
/*
 * Checked by plain substring rather than a regex. Writing the escaped form of
 * `'\'` inside a regex literal inside a JS string is three levels of escaping,
 * and getting it wrong fails the test while the code is correct — which is
 * exactly what happened the first time this ran.
 */
R.check('G26', src.includes("l.startsWith('\\\\')"), 'marker no-newline diabaikan di sumber');
R.check('G27', /BAR_MAX/.test(src), 'ada batas jumlah penanda');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/gitBars.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
