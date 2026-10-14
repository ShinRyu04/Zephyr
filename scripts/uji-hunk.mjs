// uji-hunk.mjs — harness untuk review diff per-potongan (lane item 176).
//
// Cara kerja (sama pola dengan scripts/cek-subset-tugas.mjs): modul murni
// src/lib/hunkUnified.ts di-bundle dengan esbuild (bawaan vite) ke
// node_modules/.cache/zephyr-harness/ lalu di-require. Tidak perlu app hidup:
// modulnya murni, tanpa React/Tauri.
//
// Kasus "pagar" SENGAJA membaca BERKAS NYATA di disk (bukan asumsi): bila jalur
// terapkan hunk di src/lib/hunkUnified.ts atau src/components/scm/DiffViewer.tsx
// memanggil aksi indeks (stage/unstage/commit), harness GAGAL. Tanpa ini, "tidak
// ada commit otomatis" hanya janji di komentar.
//
// Pakai:  node scripts/uji-hunk.mjs
// Keluar 0 bila semua lulus, 1 bila ada yang gagal.

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-harness');
const require = createRequire(path.join(AKAR, 'package.json'));

async function muatModul() {
  const esbuild = require('esbuild');
  fs.mkdirSync(CACHE, { recursive: true });
  const keluar = path.join(CACHE, 'uji-hunk.cjs');
  await esbuild.build({
    stdin: {
      contents: "export * from './src/lib/hunkUnified';\n",
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'uji-hunk-entry.ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: keluar,
    absWorkingDir: AKAR,
    logLevel: 'silent',
  });
  return require(keluar);
}

const H = await muatModul();

/* ── rangka uji ──────────────────────────────────────────────────────────── */

let lulus = 0;
let gagal = 0;
const catatanGagal = [];
const info = [];

function kasus(nama, fn) {
  try {
    fn();
    lulus += 1;
    console.log(`LULUS  ${nama}`);
  } catch (e) {
    gagal += 1;
    catatanGagal.push(`${nama}: ${e.message}`);
    console.log(`GAGAL  ${nama}\n       ${e.message}`);
  }
}

function benar(nilai, pesan) {
  if (!nilai) throw new Error(pesan || 'harapan tidak terpenuhi');
}

function samakan(nyata, harap, pesan) {
  if (nyata !== harap) {
    throw new Error(
      `${pesan || 'teks berbeda'}\n       harap: ${JSON.stringify(harap)}\n       nyata: ${JSON.stringify(nyata)}`,
    );
  }
}

function melempar(fn, pola, pesan) {
  let keluar = null;
  try {
    fn();
  } catch (e) {
    keluar = e;
  }
  if (!keluar) throw new Error(pesan || 'seharusnya melempar, tetapi tidak');
  if (pola && !pola.test(keluar.message)) {
    throw new Error(`${pesan || 'pesan galat tidak cocok'} (${pola}): ${keluar.message}`);
  }
  return keluar;
}

const U = (baris) => baris.join('\n');

/* ── bahan uji ───────────────────────────────────────────────────────────── */

// FIX A: dua hunk yang saling berjauhan (pemisah 8 baris, jadi sah untuk git).
const A_LAMA = U([
  'let a = 1;',
  'let b = 2;',
  'let c = 3;',
  'let d = 4;',
  'let e = 5;',
  'let f = 6;',
  'let g = 7;',
  'let h = 8;',
  'let i = 9;',
  'let j = 10;',
  'let k = 11;',
  'let l = 12;',
  'let m = 13;',
  'let n = 14;',
  'let o = 15;',
  'let p = 16;',
  '',
]);
const A_BARU = A_LAMA.replace('let c = 3;', 'let c = 33;').replace('let m = 13;', 'let m = 133;');
const A_UNIFIED = U([
  '@@ -1,6 +1,6 @@',
  ' let a = 1;',
  ' let b = 2;',
  '-let c = 3;',
  '+let c = 33;',
  ' let d = 4;',
  ' let e = 5;',
  ' let f = 6;',
  '@@ -10,7 +10,7 @@',
  ' let j = 10;',
  ' let k = 11;',
  ' let l = 12;',
  '-let m = 13;',
  '+let m = 133;',
  ' let n = 14;',
  ' let o = 15;',
  ' let p = 16;',
]);
const A_HANYA_C = A_LAMA.replace('let c = 3;', 'let c = 33;');
const A_HANYA_M = A_LAMA.replace('let m = 13;', 'let m = 133;');

// FIX B: satu hunk di AWAL berkas.
const B_LAMA = U(['x1', 'x2', 'x3', 'x4', '']);
const B_BARU = U(['x1', 'X2', 'x3', 'x4', '']);
const B_UNIFIED = U(['@@ -1,4 +1,4 @@', ' x1', '-x2', '+X2', ' x3', ' x4']);

// FIX C: satu hunk di AKHIR berkas.
const C_LAMA = U(['y1', 'y2', 'y3', '']);
const C_BARU = U(['y1', 'y2', 'Y3', '']);
const C_UNIFIED = U(['@@ -1,3 +1,3 @@', ' y1', ' y2', '-y3', '+Y3']);

// FIX D: berkas baru dari nol (`,0` di sisi lama).
const D_UNIFIED = U(['@@ -0,0 +1,2 @@', '+baris1', '+baris2']);
// FIX E: berkas baru tanpa newline terakhir.
const E_UNIFIED = U(['@@ -0,0 +1,1 @@', '+satu', '\\ No newline at end of file']);

// FIX F: hanya spasi/tab yang berubah (lewat jalur dua teks).
const F_LAMA = U(['if (x) {', '  y;', '}', '']);
const F_BARU = U(['if (x) {', '\ty;', '}', '']);

// FIX G: baris DISISIPKAN di tengah.
const G_LAMA = U(['a', 'b', 'c', '']);
const G_BARU = U(['a', 'b', 'x', 'c', '']);
const G_UNIFIED = U(['@@ -1,3 +1,4 @@', ' a', ' b', '+x', ' c']);

// FIX H: hunk yang tumpang tindih (hunk #1 mulai di dalam rentang hunk #0).
const H_UNIFIED = U([
  '@@ -1,5 +1,5 @@',
  ' baris 1',
  '-baris 2',
  '+BARIS 2',
  ' baris 3',
  ' baris 4',
  ' baris 5',
  '@@ -3,3 +3,3 @@',
  ' baris 3',
  '-baris 4',
  '+BARIS 4',
  ' baris 5',
]);

// FIX I: berkas ber-CRLF, diff ditulis LF (keluaran git di Windows).
const I_LAMA = 'k1\r\nk2\r\nk3\r\n';
const I_BARU = 'k1\r\nK2\r\nk3\r\n';
const I_UNIFIED = U(['@@ -1,3 +1,3 @@', ' k1', '-k2', '+K2', ' k3']);

// FIX J: biner.
const J_UNIFIED = U([
  'diff --git a/gambar.png b/gambar.png',
  'index 1111111..2222222 100644',
  'Binary files a/gambar.png and b/gambar.png differ',
]);

const SEMUA = (n) => new Set(Array.from({ length: n }, (_, i) => i));

/* ── 1. satu hunk: diterima → teks berubah ───────────────────────────────── */

kasus('1. satu hunk diterima → teks jadi isi baru', () => {
  const hasil = H.terapkanUnifiedKeIsi(B_LAMA, B_UNIFIED, SEMUA(1));
  samakan(hasil, B_BARU, 'hasil terima hunk');
  const hunk = H.hunkUnified(B_UNIFIED);
  benar(hunk.length === 1, `harus 1 hunk, nyata ${hunk.length}`);
  samakan(hunk[0].tambah, 1, 'jumlah baris tambah');
  samakan(hunk[0].hapus, 1, 'jumlah baris hapus');
  samakan(hunk[0].status, 'belum', 'status awal hunk');
});

/* ── 2. satu hunk: ditolak → teks tetap ──────────────────────────────────── */

kasus('2. satu hunk ditolak → teks tidak berubah', () => {
  samakan(H.terapkanUnifiedKeIsi(B_LAMA, B_UNIFIED, new Set()), B_LAMA, 'hasil tolak hunk');
  samakan(H.terapkanUnifiedKeIsi(C_LAMA, C_UNIFIED, new Set()), C_LAMA, 'hasil tolak hunk (akhir)');
});

/* ── 3. campur: terima hunk 1, tolak hunk 2 → hasil benar ────────────────── */

kasus('3. campur terima #0 / tolak #1 → hasil benar (dua teks dan unified)', () => {
  samakan(H.terapkanUnifiedKeIsi(A_LAMA, A_UNIFIED, new Set([0])), A_HANYA_C, 'unified #0 saja');
  samakan(H.terapkanUnifiedKeIsi(A_LAMA, A_UNIFIED, new Set([1])), A_HANYA_M, 'unified #1 saja');
  samakan(H.terapkanUnifiedKeIsi(A_LAMA, A_UNIFIED, SEMUA(2)), A_BARU, 'unified kedua hunk');
  const duaTeks = H.terapkanStatusDuaTeks(
    A_LAMA,
    A_BARU,
    { 0: 'terima', 1: 'tolak' },
  );
  samakan(duaTeks, A_HANYA_C, 'dua teks terima #0 / tolak #1');
  samakan(
    H.terapkanStatusDuaTeks(A_LAMA, A_BARU, { 0: 'tolak', 1: 'terima' }),
    A_HANYA_M,
    'dua teks tolak #0 / terima #1',
  );
  samakan(H.terapkanHunkDuaTeks(A_LAMA, A_BARU, new Set()), A_LAMA, 'dua teks tolak semua');
  samakan(H.terapkanHunkDuaTeks(A_LAMA, A_BARU, SEMUA(2)), A_BARU, 'dua teks terima semua');
});

/* ── 4. hunk di awal berkas ──────────────────────────────────────────────── */

kasus('4. hunk di AWAL berkas: terima/tolak + nomor baris mulai', () => {
  const hunk = H.hunkUnified(B_UNIFIED);
  samakan(hunk[0].mulaiLama, 1, 'mulai sisi lama');
  samakan(hunk[0].mulaiBaru, 1, 'mulai sisi baru');
  samakan(H.terapkanUnifiedKeIsi(B_LAMA, B_UNIFIED, SEMUA(1)), B_BARU, 'terima hunk awal');
  samakan(H.terapkanUnifiedKeIsi(B_BARU, B_UNIFIED, new Set(), { sisi: 'baru' }), B_LAMA, 'balik hunk awal');
});

/* ── 5. hunk di akhir berkas ─────────────────────────────────────────────── */

kasus('5. hunk di AKHIR berkas: terima/tolak + newline akhir tetap', () => {
  const hunk = H.hunkUnified(C_UNIFIED);
  samakan(hunk[0].mulaiLama, 1, 'mulai sisi lama');
  samakan(hunk[0].jumlahLama, 3, 'jumlah baris sisi lama');
  const terima = H.terapkanUnifiedKeIsi(C_LAMA, C_UNIFIED, SEMUA(1));
  samakan(terima, C_BARU, 'terima hunk akhir');
  benar(terima.endsWith('Y3\n'), 'hasil harus tetap diakhiri newline');
  samakan(H.terapkanUnifiedKeIsi(C_LAMA, C_UNIFIED, new Set()), C_LAMA, 'tolak hunk akhir');
});

/* ── 6. berkas kosong (berkas baru dari nol) ─────────────────────────────── */

kasus('6. berkas kosong: berkas baru diterima, ditolak tetap kosong', () => {
  samakan(H.terapkanUnifiedKeIsi('', D_UNIFIED, SEMUA(1)), 'baris1\nbaris2\n', 'berkas baru');
  samakan(H.terapkanUnifiedKeIsi('', D_UNIFIED, new Set()), '', 'berkas baru ditolak');
  const hunk = H.hunkUnified(D_UNIFIED);
  samakan(hunk[0].mulaiLama, null, 'tidak ada baris sisi lama');
  samakan(hunk[0].jumlahLama, 0, 'nol baris sisi lama');
  samakan(H.terapkanUnifiedKeIsi('', E_UNIFIED, SEMUA(1)), 'satu', 'tanpa newline terakhir');
});

/* ── 7. hanya spasi yang berubah ─────────────────────────────────────────── */

kasus('7. hanya spasi/tab berubah (jalur dua teks)', () => {
  const hunk = H.hunkDariDuaTeks(F_LAMA, F_BARU);
  benar(hunk.length === 1, `harus 1 hunk, nyata ${hunk.length}`);
  samakan(hunk[0].tambah, 1, 'baris tambah');
  samakan(hunk[0].hapus, 1, 'baris hapus');
  samakan(H.terapkanStatusDuaTeks(F_LAMA, F_BARU, { 0: 'terima' }), F_BARU, 'terima');
  samakan(H.terapkanStatusDuaTeks(F_LAMA, F_BARU, { 0: 'tolak' }), F_LAMA, 'tolak');
});

/* ── 8. baris ditambahkan di tengah ──────────────────────────────────────── */

kasus('8. baris ditambahkan di tengah: terima menambah 1 baris, tolak tidak', () => {
  const terima = H.terapkanUnifiedKeIsi(G_LAMA, G_UNIFIED, SEMUA(1));
  samakan(terima, G_BARU, 'hasil sisipan');
  samakan(terima.split('\n').length - 1, 4, 'jumlah baris setelah sisipan');
  samakan(H.terapkanUnifiedKeIsi(G_LAMA, G_UNIFIED, new Set()), G_LAMA, 'sisipan ditolak');
  samakan(
    H.terapkanUnifiedKeIsi(G_BARU, G_UNIFIED, new Set(), { sisi: 'baru' }),
    G_LAMA,
    'sisipan dibalik dari sisi baru',
  );
});

/* ── 9. tiga berkas sekaligus: siapa yang selesai ────────────────────────── */

kasus('9. banyak berkas: status "selesai" per berkas benar', () => {
  const daftar = [
    { path: 'a.ts', isiLama: A_LAMA, isiBaru: A_BARU, status: { 0: 'terima', 1: 'tolak' } },
    { path: 'b.ts', isiLama: A_LAMA, isiBaru: A_BARU, status: { 0: 'terima' } },
    { path: 'c.ts', isiLama: 'sama\n', isiBaru: 'sama\n' },
    { path: 'gambar.png', teksUnified: J_UNIFIED },
  ];
  const st = H.statusSemuaBerkas(daftar);
  samakan(st.length, 4, 'jumlah status');
  samakan(st[0].jumlahHunk, 2, 'a.ts jumlah hunk');
  samakan(st[0].belum, 0, 'a.ts belum');
  benar(st[0].selesai === true, 'a.ts harus selesai (dua hunk sudah diputuskan)');
  samakan(st[1].belum, 1, 'b.ts belum');
  benar(st[1].selesai === false, 'b.ts belum selesai');
  benar(st[2].selesai === true, 'c.ts selesai (tidak ada hunk)');
  benar(st[3].biner === true && st[3].selesai === false, 'berkas biner tidak pernah selesai');
  samakan(H.berkasSelesai(daftar).join(','), 'a.ts,c.ts', 'daftar berkas selesai');
  benar(H.semuaBerkasSelesai(daftar) === false, 'belum semua selesai');
  benar(H.semuaBerkasSelesai([daftar[0], daftar[2]]) === true, 'dua berkas itu sudah selesai');
  const hasil = H.hasilPerBerkas(daftar);
  samakan(hasil.map((h) => h.path).join(','), 'a.ts,b.ts', 'berkas yang perlu ditulis');
  samakan(hasil[0].isi, A_HANYA_C, 'isi a.ts (hunk #1 ditolak)');
});

/* ── 10. idempoten ───────────────────────────────────────────────────────── */

kasus('10. terapkan dua kali idempoten (dua teks + unified, dua sisi)', () => {
  const sekali = H.terapkanHunkDuaTeks(A_LAMA, A_BARU, SEMUA(2));
  samakan(H.terapkanHunkDuaTeks(A_LAMA, A_BARU, SEMUA(2)), sekali, 'dua teks: hasil kedua');
  const uni = H.terapkanUnifiedKeIsi(A_LAMA, A_UNIFIED, new Set([0]));
  samakan(H.terapkanUnifiedKeIsi(A_LAMA, A_UNIFIED, new Set([0])), uni, 'unified sisi lama: hasil kedua');
  const uniBaru = H.terapkanUnifiedKeIsi(A_BARU, A_UNIFIED, new Set([0]), { sisi: 'baru' });
  samakan(
    H.terapkanUnifiedKeIsi(A_BARU, A_UNIFIED, new Set([0]), { sisi: 'baru' }),
    uniBaru,
    'unified sisi baru: hasil kedua',
  );
  samakan(uniBaru, uni, 'sisi lama dan sisi baru harus sepakat');
  samakan(
    H.terapkanUnifiedKeIsi(A_BARU, A_UNIFIED, SEMUA(2), { sisi: 'baru' }),
    A_BARU,
    'sisi baru terima semua = tanpa perubahan',
  );
  samakan(
    H.terapkanUnifiedKeIsi(A_BARU, A_UNIFIED, new Set(), { sisi: 'baru' }),
    A_LAMA,
    'sisi baru tolak semua = kembali ke isi lama',
  );
});

/* ── 11. hunk tumpang tindih ditolak dengan pesan jelas ──────────────────── */

kasus('11. hunk tumpang tindih ditolak dengan pesan jelas', () => {
  const urai = H.uraiUnified(H_UNIFIED);
  benar(urai.galat.length > 0, 'uraiUnified harus melaporkan galat');
  benar(/tumpang tindih/.test(urai.galat.join(' ')), `pesan harus menyebut tumpang tindih: ${urai.galat.join(' ')}`);
  const e = melempar(() => H.hunkUnified(H_UNIFIED), /tumpang tindih/, 'hunkUnified harus melempar');
  benar(/#1/.test(e.message) && /#0/.test(e.message), `pesan harus menyebut kedua hunk: ${e.message}`);
  melempar(() => H.parseUnified(H_UNIFIED), /tumpang tindih/, 'parseUnified harus melempar');
  melempar(
    () => H.terapkanUnifiedKeIsi(U(['baris 1', 'baris 2', 'baris 3', 'baris 4', 'baris 5', '']), H_UNIFIED, SEMUA(2)),
    /tumpang tindih/,
    'terapkan harus menolak diff yang tumpang tindih',
  );
});

/* ── 12. PAGAR: tidak ada jalur otomatis ke indeks ───────────────────────── */

const PENANDA_BUKA = '>>> PAGAR-176-APPLY';
const PENANDA_TUTUP = '<<< PAGAR-176-APPLY';

const TERLARANG = [
  [/\bgitStage\b/, 'gitStage'],
  [/\bgitUnstage\b/, 'gitUnstage'],
  [/\bgitCommit\b/, 'gitCommit'],
  [/\bgitCommitWithAi\b/, 'gitCommitWithAi'],
  [/\bgit_stage\b/, 'git_stage'],
  [/\bgit_unstage\b/, 'git_unstage'],
  [/\bgit_commit\b/, 'git_commit'],
  [/\bgit\s+add\b/, 'git add'],
  [/\bgit\s+commit\b/, 'git commit'],
  [/\bstage\s*\(/, 'pemanggilan stage(...)'],
  [/\bunstage\s*\(/, 'pemanggilan unstage(...)'],
  [/\bcommit\s*\(/, 'pemanggilan commit(...)'],
];

function bacaAsli(rel) {
  const p = path.join(AKAR, rel);
  return { rel, isi: fs.readFileSync(p, 'utf8') };
}

function daerahPagar(isi, rel) {
  const a = isi.indexOf(PENANDA_BUKA);
  const b = isi.indexOf(PENANDA_TUTUP);
  benar(a >= 0, `${rel} harus punya penanda ${PENANDA_BUKA}`);
  benar(b > a, `${rel} harus punya penanda ${PENANDA_TUTUP} setelah penanda buka`);
  return isi.slice(a, b);
}

kasus('12. PAGAR: jalur terapkan tidak menyentuh indeks (baca berkas nyata)', () => {
  const modul = bacaAsli('src/lib/hunkUnified.ts');
  const tampilan = bacaAsli('src/components/scm/DiffViewer.tsx');

  for (const [pola, nama] of TERLARANG) {
    const diModul = pola.exec(modul.isi);
    benar(!diModul, `src/lib/hunkUnified.ts memuat "${nama}" (${diModul ? diModul[0] : ''})`);
  }
  benar(!/from\s+'@tauri-apps/.test(modul.isi), 'src/lib/hunkUnified.ts tidak boleh impor tauri');
  benar(!/from\s+'\.\/commands'/.test(modul.isi), 'src/lib/hunkUnified.ts tidak boleh impor commands');
  benar(!/from\s+'react'/.test(modul.isi), 'src/lib/hunkUnified.ts harus murni (tanpa React)');

  const pagar = daerahPagar(tampilan.isi, tampilan.rel);
  benar(
    pagar.includes('terapkanUnifiedKeIsi'),
    'daerah pagar DiffViewer harus memuat pemanggilan terapkanUnifiedKeIsi',
  );
  benar(pagar.includes('fsWrite'), 'daerah pagar DiffViewer harus memuat penulisan fsWrite');
  for (const [pola, nama] of TERLARANG) {
    const kena = pola.exec(pagar);
    benar(!kena, `daerah pagar DiffViewer memuat "${nama}" (${kena ? kena[0] : ''})`);
  }

  // Di luar pagar, satu-satunya aksi indeks adalah dua tombol manual Stage/Unstage
  // yang sudah ada. Harga berubah = ada aksi indeks baru yang menyelinap masuk.
  const luar = tampilan.isi.slice(0, tampilan.isi.indexOf(PENANDA_BUKA)) + tampilan.isi.slice(tampilan.isi.indexOf(PENANDA_TUTUP));
  const jumlahStage = (luar.match(/[^.\w]stage\s*\(/g) || []).length;
  const jumlahUnstage = (luar.match(/[^.\w]unstage\s*\(/g) || []).length;
  samakan(jumlahStage, 1, 'di luar pagar hanya boleh ada 1 panggilan stage( (tombol manual)');
  samakan(jumlahUnstage, 1, 'di luar pagar hanya boleh ada 1 panggilan unstage( (tombol manual)');
  benar(
    /from\s+'\.\.\/\.\.\/lib\/hunkUnified'/.test(tampilan.isi),
    'DiffViewer harus memakai modul hunkUnified',
  );

  info.push(
    `pagar: hunkUnified.ts bersih dari ${TERLARANG.length} pola terlarang; ` +
      `daerah pagar DiffViewer ${pagar.split('\n').length} baris bersih; ` +
      `stage(/unstage( di luar pagar = ${jumlahStage}/${jumlahUnstage} (tombol manual)`,
  );
});

/* ── 13. teks besar 5.000 baris < 1 detik ────────────────────────────────── */

kasus('13. teks 5.000 baris selesai < 1 detik', () => {
  const N = 5000;
  const lamaBaris = [];
  const baruBaris = [];
  for (let i = 1; i <= N; i += 1) {
    const t = `baris ${String(i).padStart(5, '0')} isi tetap`;
    lamaBaris.push(t);
    baruBaris.push(i % 10 === 0 ? `${t} DIUBAH` : t);
  }
  const lama = `${lamaBaris.join('\n')}\n`;
  const baru = `${baruBaris.join('\n')}\n`;

  // Teks unified dengan konteks 3 baris untuk setiap perubahan (pemisah 10 baris
  // → tidak ada hunk yang berdempetan, seperti keluaran git sungguhan).
  const uni = [];
  for (let i = 10; i <= N; i += 10) {
    const awal = Math.max(1, i - 3);
    const akhir = Math.min(N, i + 3);
    const jumlah = akhir - awal + 1;
    uni.push(`@@ -${awal},${jumlah} +${awal},${jumlah} @@`);
    for (let j = awal; j <= akhir; j += 1) {
      if (j === i) {
        uni.push(`-${lamaBaris[j - 1]}`);
        uni.push(`+${baruBaris[j - 1]}`);
      } else {
        uni.push(` ${lamaBaris[j - 1]}`);
      }
    }
  }
  const teksUnified = uni.join('\n');

  const t0 = process.hrtime.bigint();
  const hunkDuaTeks = H.hunkDariDuaTeks(lama, baru);
  const hunkUni = H.hunkUnified(teksUnified);
  const diterima = SEMUA(hunkUni.length);
  const hasil = H.terapkanUnifiedKeIsi(lama, teksUnified, diterima);
  const hasilDua = H.terapkanHunkDuaTeks(lama, baru, SEMUA(hunkDuaTeks.length));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  samakan(hunkUni.length, 500, 'jumlah hunk teks besar');
  samakan(hasil, baru, 'hasil terima semua pada teks besar');
  samakan(hasilDua, baru, 'hasil terima semua jalur dua teks');
  benar(ms < 1000, `teks 5.000 baris butuh ${ms.toFixed(0)} ms (batas 1000 ms)`);
  info.push(`perf: 5.000 baris / ${hunkUni.length} hunk → ${ms.toFixed(0)} ms`);
});

/* ── 14. parse: jenis baris dan nomor baris ─────────────────────────────── */

kasus('14. parse unified: jenis, nomor baris, dan rentang hunk benar', () => {
  const rows = H.parseUnified(A_UNIFIED);
  const tambah = rows.filter((r) => r.kind === 'add');
  const hapus = rows.filter((r) => r.kind === 'del');
  samakan(tambah.length, 2, 'baris tambah');
  samakan(hapus.length, 2, 'baris hapus');
  samakan(hapus[0].text, 'let c = 3;', 'teks baris hapus pertama');
  samakan(hapus[0].a, 3, 'nomor baris lama baris hapus pertama');
  samakan(hapus[0].b, null, 'baris hapus tidak punya nomor sisi baru');
  samakan(tambah[0].text, 'let c = 33;', 'teks baris tambah pertama');
  samakan(tambah[0].b, 3, 'nomor baris baru baris tambah pertama');
  samakan(tambah[0].a, null, 'baris tambah tidak punya nomor sisi lama');
  const ctx = rows.find((r) => r.kind === 'same' && r.text === 'let p = 16;');
  samakan(ctx.a, 16, 'nomor sisi lama baris konteks terakhir');
  samakan(ctx.b, 16, 'nomor sisi baru baris konteks terakhir');

  const hunk = H.hunkUnified(A_UNIFIED, { 1: 'terima' });
  samakan(hunk.length, 2, 'jumlah hunk');
  samakan(hunk[0].status, 'belum', 'status hunk #0');
  samakan(hunk[1].status, 'terima', 'status hunk #1 dari peta');
  samakan(hunk[0].jumlahLama, 6, 'jumlah sisi lama hunk #0');
  samakan(hunk[1].mulaiLama, 10, 'mulai sisi lama hunk #1');
  samakan(hunk[1].jumlahBaru, 7, 'jumlah sisi baru hunk #1');
  samakan(hunk[1].baris[0].nomorLama, 10, 'nomor baris pertama hunk #1');
  samakan(hunk[1].baris[0].jenis, 'konteks', 'jenis baris pertama hunk #1');
  benar(
    hunk[0].baris.some((b) => b.jenis === 'tambah' && b.nomorBaru === 3),
    'hunk #0 harus memuat baris tambah dengan nomor baru 3',
  );
  samakan(H.diterimaDari({ 0: 'terima', 1: 'tolak', 2: 'belum' }).size, 1, 'diterimaDari');
});

/* ── 15. baris meta diabaikan ────────────────────────────────────────────── */

kasus('15. baris meta (diff --git/index/---/+++) tidak jadi baris hunk', () => {
  const denganMeta = U([
    'diff --git a/f.ts b/f.ts',
    'index 1111111..2222222 100644',
    '--- a/f.ts',
    '+++ b/f.ts',
    ...B_UNIFIED.split('\n'),
  ]);
  const rows = H.parseUnified(denganMeta);
  samakan(rows.length, 5, 'jumlah baris isi diff (4 baris sisi lama + 1 tambah)');
  const hunk = H.hunkUnified(denganMeta);
  samakan(hunk.length, 1, 'jumlah hunk');
  samakan(H.terapkanUnifiedKeIsi(B_LAMA, denganMeta, SEMUA(1)), B_BARU, 'hasil terima');

  const duaBerkas = H.uraiUnified(`${denganMeta}\ndiff --git a/g.ts b/g.ts\nindex 1..2 100644\n--- a/g.ts\n+++ b/g.ts\n@@ -1,1 +1,1 @@\n-a\n+b`);
  benar(duaBerkas.berkasGanda === true, 'berkasGanda harus true untuk teks dua berkas');
  benar(duaBerkas.galat.length === 0, `berkasGanda bukan galat: ${duaBerkas.galat.join(' ')}`);
});

/* ── 16. isi tidak cocok dengan diff → melempar, bukan hasil rusak ───────── */

kasus('16. isi tidak cocok (berkas berubah) → melempar dengan nomor baris', () => {
  const e = melempar(
    () => H.terapkanUnifiedKeIsi(`ZZZ\n${A_LAMA}`, A_UNIFIED, SEMUA(2)),
    /tidak cocok/,
    'harus melempar isi-tak-cocok',
  );
  benar(/baris 1/.test(e.message), `pesan harus menyebut baris 1: ${e.message}`);
  melempar(
    () => H.terapkanUnifiedKeIsi('let a = 1;\n', A_UNIFIED, SEMUA(2)),
    /melewati akhir isi|tidak cocok/,
    'isi terlalu pendek harus ditolak',
  );
});

/* ── 17. biner & berkas tanpa perubahan ─────────────────────────────────── */

kasus('17. diff biner: tanpa hunk, terapkan ditolak; diff kosong aman', () => {
  samakan(H.hunkUnified(J_UNIFIED).length, 0, 'diff biner tidak punya hunk');
  const st = H.statusBerkas({ path: 'gambar.png', teksUnified: J_UNIFIED });
  benar(st.biner === true, 'status harus menandai biner');
  benar(st.selesai === false, 'biner tidak pernah selesai');
  melempar(() => H.terapkanUnifiedKeIsi('x\n', J_UNIFIED, new Set([0])), /biner/, 'terapkan biner harus ditolak');

  samakan(H.hunkUnified('').length, 0, 'diff kosong tanpa hunk');
  samakan(H.terapkanUnifiedKeIsi(A_LAMA, '', SEMUA(0)), A_LAMA, 'diff kosong → isi tetap');
  const stKosong = H.statusBerkas({ path: 'sama.ts', isiLama: A_LAMA, isiBaru: A_LAMA });
  benar(stKosong.selesai === true && stKosong.jumlahHunk === 0, 'tanpa perubahan = selesai');
});

/* ── 18. akhir baris CRLF tidak berubah ─────────────────────────────────── */

kasus('18. berkas ber-CRLF: hasil tetap CRLF, diff LF', () => {
  const terima = H.terapkanUnifiedKeIsi(I_LAMA, I_UNIFIED, SEMUA(1));
  samakan(terima, I_BARU, 'terima pada isi CRLF');
  samakan(terima.split('\r\n').length - 1, 3, 'tiga baris CRLF');
  samakan(H.terapkanUnifiedKeIsi(I_LAMA, I_UNIFIED, new Set()), I_LAMA, 'tolak → isi CRLF tetap');
  samakan(
    H.terapkanUnifiedKeIsi(I_BARU, I_UNIFIED, new Set(), { sisi: 'baru' }),
    I_LAMA,
    'balik dari sisi baru pada isi CRLF',
  );
});

/* ── 19. status 'belum' → tidak ada berkas yang ditulis ─────────────────── */

kasus('19. tidak ada hunk diterima → tidak ada berkas yang perlu ditulis', () => {
  const daftar = [
    { path: 'a.ts', isiLama: A_LAMA, isiBaru: A_BARU, status: { 0: 'tolak', 1: 'tolak' } },
    { path: 'b.ts', isiLama: B_LAMA, isiBaru: B_BARU },
  ];
  samakan(H.hasilPerBerkas(daftar).length, 0, 'tidak ada yang perlu ditulis');
  samakan(H.berkasSelesai(daftar).join(','), 'a.ts', 'setelah ditolak semua, a.ts selesai');
  benar(H.semuaBerkasSelesai(daftar) === false, 'b.ts masih belum diputuskan');
  const satu = H.hasilPerBerkas([{ path: 'b.ts', isiLama: B_LAMA, isiBaru: B_BARU, status: { 0: 'terima' } }]);
  samakan(satu.length, 1, 'satu berkas ditulis');
  samakan(satu[0].isi, B_BARU, 'isi hasil');
  samakan(satu[0].galat, null, 'tanpa galat');
});

/* ── 20. galat pembacaan diff jadi data, bukan lemparan tak terduga ─────── */

kasus('20. diff rusak → statusBerkas melaporkan galat, terapkanBerkas mengembalikannya', () => {
  const rusak = U(['@@ -1,5 +1,5 @@', ' a', ' b']); // header bilang 5 baris, isinya 2
  const st = H.statusBerkas({ path: 'rusak.ts', teksUnified: rusak });
  benar(st.galat !== null, 'status harus memuat galat');
  benar(/tidak cocok dengan isinya/.test(st.galat), `pesan galat: ${st.galat}`);
  benar(st.selesai === false, 'diff rusak tidak pernah selesai');
  const hasil = H.terapkanBerkas({ path: 'rusak.ts', teksUnified: rusak, status: { 0: 'terima' } });
  benar(hasil.galat !== null && hasil.isi === '', 'terapkanBerkas harus mengembalikan galat sebagai data');
  const hasilBaik = H.terapkanBerkas({ path: 'a.ts', isiLama: A_LAMA, isiBaru: A_BARU, status: { 0: 'terima', 1: 'tolak' } });
  samakan(hasilBaik.isi, A_HANYA_C, 'berkas sehat tetap benar');
});

/* ── 21. integrasi: teks diff ASLI dari git, persis yang dilihat panel ───── */

kasus("21. diff asli git + sisi 'baru' = tingkah panel SCM yang sebenarnya", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-hunk-'));
  try {
    const barisLama = [];
    for (let i = 1; i <= 30; i += 1) barisLama.push(`baris ${String(i).padStart(2, '0')}`);
    const barisBaru = [...barisLama];
    barisBaru[2] = 'baris 03 DIUBAH';
    barisBaru[19] = 'baris 20 DIUBAH'; // berjarak jauh → git memberi DUA hunk, bukan satu
    const isiLama = `${barisLama.join('\n')}\n`;
    const isiBaru = `${barisBaru.join('\n')}\n`;
    fs.writeFileSync(path.join(tmp, 'lama.txt'), isiLama);
    fs.writeFileSync(path.join(tmp, 'baru.txt'), isiBaru);

    /* git diff --no-index menghasilkan unified diff sungguhan tanpa menyentuh
       indeks repo mana pun. */
    const r = spawnSync(
      'git',
      ['--no-pager', 'diff', '--no-color', '--no-index', '--', 'lama.txt', 'baru.txt'],
      { cwd: tmp, encoding: 'utf8' },
    );
    benar(!r.error, `git tidak bisa dijalankan: ${r.error && r.error.message}`);
    benar(typeof r.stdout === 'string' && r.stdout.length > 0, 'git diff harus menghasilkan teks');

    const hunk = H.hunkUnified(r.stdout);
    samakan(hunk.length, 2, 'git harus memberi dua hunk terpisah');
    samakan(hunk[0].mulaiBaru, 1, 'mulai sisi baru hunk #0');
    samakan(hunk[1].mulaiBaru, 17, 'mulai sisi baru hunk #1');

    /* Panggilan yang PERSIS dipakai DiffViewer: isi berkas kerja = sisi '+' diff,
       karena git diff tanpa --cached membandingkan indeks → berkas kerja. */
    samakan(
      H.terapkanUnifiedKeIsi(isiBaru, r.stdout, SEMUA(hunk.length), { sisi: 'baru' }),
      isiBaru,
      'terima semua → berkas kerja tidak berubah',
    );
    samakan(
      H.terapkanUnifiedKeIsi(isiBaru, r.stdout, new Set(), { sisi: 'baru' }),
      isiLama,
      'tolak semua → kembali ke isi sisi indeks',
    );
    samakan(
      H.terapkanUnifiedKeIsi(isiBaru, r.stdout, new Set([0]), { sisi: 'baru' }),
      isiBaru.replace('baris 20 DIUBAH', 'baris 20'),
      'terima hunk #0 saja → perubahan kedua dibatalkan',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ── ringkasan ───────────────────────────────────────────────────────────── */

const total = lulus + gagal;
console.log('');
for (const baris of info) console.log(`info   ${baris}`);
if (gagal > 0) {
  console.log('');
  for (const baris of catatanGagal) console.log(`gagal  ${baris}`);
}
console.log(`== ${lulus}/${total} lulus ==`);
process.exit(gagal === 0 ? 0 : 1);
