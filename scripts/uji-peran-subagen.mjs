/*
 * uji-peran-subagen.mjs — harness BARU untuk ZEPH-PERAN-SUBAGEN.
 *
 * Yang diuji: peta peran sub-agen (`src/lib/subagentRoles.ts`) benar-benar
 * MENGUNCI batas tool tiap peran, dan TEKS ATURAN yang dikirim ke model dibangun
 * dari berkas NYATA itu — bukan dari tebakan, bukan dari salinan di tempat lain.
 *
 * Cara kerja:
 *   1. Bundel modul murni TS `src/lib/subagentRoles.ts` jadi satu CJS lalu
 *      di-require (pola sama dengan cek-subset-tugas.mjs). Tidak butuh app hidup.
 *   2. Baca juga TEKS SUMBER `src/lib/subagentRoles.ts` apa adanya, untuk
 *      membuktikan tiap `arahan`/`kasusTepi` benar-benar berasal dari berkas itu.
 *   3. Periksa seluruh kasus A..K di bawah. LULUS semua -> exit 0; ada yang gagal -> exit 1.
 *
 * Kasus yang dijamin ada (sesuai permintaan):
 *   - tiap peran punya batas tool yang TIDAK saling bertabrakan (hanya satu penulis)
 *   - peran explorer/jelajah TIDAK boleh menulis berkas
 *   - peran penguji/audit TIDAK boleh mengubah kode produk
 *   - peran TAK DIKENAL DITOLAK (melempar / null), bukan diterima diam-diam
 *   - teks aturan dibangun dari berkas NYATA (dicek ke berkas, bukan tebakan)
 *   - tidak ada peran yang bisa lolos ke jalur HAPUS berkas / TERMINAL BEBAS
 *   - determinisme
 *
 * Pakai:  node scripts/uji-peran-subagen.mjs
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-harness');
const require = createRequire(path.join(AKAR, 'package.json'));

/** Bundel modul murni lalu muat. */
async function muatUji() {
  const esbuild = require('esbuild');
  fs.mkdirSync(CACHE, { recursive: true });
  const keluar = path.join(CACHE, 'uji-peran.cjs');
  await esbuild.build({
    stdin: {
      contents: `export * as peran from './src/lib/subagentRoles';\n`,
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'uji-peran-entry.ts',
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

const P = (await muatUji()).peran;

// Teks sumber apa adanya — dipakai untuk "berasal dari berkas nyata".
const SUMBER = fs.readFileSync(path.join(AKAR, 'src', 'lib', 'subagentRoles.ts'), 'utf8');
const PROMPT = fs.readFileSync(path.join(AKAR, 'src', 'lib', 'systemPrompt.ts'), 'utf8');

/* ---- kerangka hasil ---- */
let lulus = 0;
let gagal = 0;
const pesanGagal = [];
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++;
    console.log(`  LULUS  ${nama}`);
  } else {
    gagal++;
    pesanGagal.push(nama);
    console.log(`  GAGAL  ${nama}${detail ? ` -> ${detail}` : ''}`);
  }
}

const ID_DIKENAL = ['cari', 'telaah', 'rencana', 'audit', 'kerja', 'jelajah'];
const KATEGORI = P.KATEGORI_BATAS;
const PERAN = P.PERAN;

console.log('== uji-peran-subagen: batas peran TERKUNCI ==\n');
console.log(`berkas sumber : src/lib/subagentRoles.ts (${SUMBER.split(/\r?\n/).length} baris)`);
console.log(`peran terbaca : ${PERAN.map((p) => p.id).join(', ')}\n`);

/* ---------- A. Daftar peran NYATA (dari berkas) ---------- */
cek(
  'A1 daftar peran = 6 id yang diharapkan',
  PERAN.length === 6 && ID_DIKENAL.every((x) => PERAN.some((p) => p.id === x)),
  `dapat: ${PERAN.map((p) => p.id).join(',')}`,
);
cek(
  'A2 setiap id peran benar-benar tertulis di berkas sumber',
  ID_DIKENAL.every((x) => SUMBER.includes(`id: '${x}'`)),
  ID_DIKENAL.filter((x) => !SUMBER.includes(`id: '${x}'`)).join(','),
);

/* ---------- B. Terkunci + batas terisi ---------- */
cek('B1 setiap peran terkunci=true', PERAN.every((p) => p.terkunci === true));
cek(
  'B2 setiap peran punya batasTool & dilarang yang tidak kosong',
  PERAN.every((p) => Array.isArray(p.batasTool) && p.batasTool.length > 0 && Array.isArray(p.dilarang) && p.dilarang.length > 0),
);
cek(
  'B3 semua kategori yang dipakai dikenal (tidak ada kategori karangan)',
  PERAN.every((p) => [...p.batasTool, ...p.dilarang].every((k) => KATEGORI.includes(k))),
);
cek(
  'B4 batasTool dan dilarang tidak saling bertentangan (irisan kosong)',
  PERAN.every((p) => p.batasTool.every((k) => !p.dilarang.includes(k))),
);

/* ---------- C. Batas antar peran tidak bertabrakan ---------- */
const penulis = PERAN.filter((p) => p.batasTool.includes('tulis')).map((p) => p.id);
cek(
  'C1 hanya SATU peran yang boleh menulis (tidak ada tabrakan tulis)',
  penulis.length === 1 && penulis[0] === 'kerja',
  `penulis: ${penulis.join(',') || '(tidak ada)'}`,
);
cek(
  'C2 butuhTulis selaras dengan batasTool (hanya kerja)',
  PERAN.every((p) => p.butuhTulis === p.batasTool.includes('tulis')),
);

/* ---------- D. Peran khas ---------- */
const jelajah = P.infoPeran('jelajah');
cek('D1 EXPLORER (jelajah) TIDAK boleh menulis berkas', !!jelajah && jelajah.butuhTulis === false && !jelajah.batasTool.includes('tulis'));
cek('D2 EXPLORER tidak boleh menghapus / terminal bebas', !!jelajah && !jelajah.batasTool.includes('hapus') && !jelajah.batasTool.includes('shell-bebas'));
cek(
  'D3 peran baca-saja (cari/telaah/rencana/audit) tanpa tulis',
  ['cari', 'telaah', 'rencana', 'audit'].every((id) => !P.infoPeran(id).batasTool.includes('tulis')),
);
const audit = P.infoPeran('audit');
cek(
  'D4 PENGUJI (audit) TIDAK boleh mengubah kode produk (tanpa tulis)',
  !!audit && !audit.batasTool.includes('tulis') && !audit.batasTool.includes('hapus'),
);
const kerja = P.infoPeran('kerja');
cek(
  'D5 PENULIS (kerja) boleh menulis tapi TIDAK boleh hapus / terminal bebas',
  !!kerja && kerja.batasTool.includes('tulis') && !kerja.batasTool.includes('hapus') && !kerja.batasTool.includes('shell-bebas'),
);
cek('D6 PENULIS punya jalur cek terbatas (shell-cek) untuk typecheck/test', !!kerja && kerja.batasTool.includes('shell-cek'));

/* ---------- E. Tidak ada jalur hapus / terminal bebas ---------- */
cek('E1 TIDAK ADA peran dengan kategori hapus di batasTool', PERAN.every((p) => !p.batasTool.includes('hapus')));
cek('E2 TIDAK ADA peran dengan kategori shell-bebas di batasTool', PERAN.every((p) => !p.batasTool.includes('shell-bebas')));
cek(
  'E3 setiap peran MENOLAK hapus & shell-bebas secara eksplisit',
  PERAN.every((p) => p.dilarang.includes('hapus') && p.dilarang.includes('shell-bebas')),
);
const TJ = P.TOOL_KATEGORI;
const alatTerjangkau = new Set();
for (const p of PERAN) for (const k of p.batasTool) for (const t of TJ[k]) alatTerjangkau.add(t);
cek(
  'E4 tool nyata perusak (delete_file, move_file) tidak terjangkau peran mana pun',
  !alatTerjangkau.has('delete_file') && !alatTerjangkau.has('move_file'),
  [...alatTerjangkau].filter((t) => t === 'delete_file' || t === 'move_file').join(','),
);
cek(
  'E5 terminal tanpa batas (bash_background, bash_kill) tidak terjangkau; bash_run hanya lewat shell-cek (kerja)',
  !alatTerjangkau.has('bash_background') &&
    !alatTerjangkau.has('bash_kill') &&
    PERAN.filter((p) => p.batasTool.includes('shell-cek')).every((p) => p.id === 'kerja'),
);

/* ---------- F. Kasus tepi per peran ---------- */
cek(
  'F1 setiap peran punya kasusTepi yang terisi (>= 20 char)',
  PERAN.every((p) => typeof p.kasusTepi === 'string' && p.kasusTepi.trim().length >= 20),
);

/* ---------- G. Peran tak dikenal DITOLAK ---------- */
cek('G1 infoPeran peran tak dikenal/kosong = null', P.infoPeran('ngawur') === null && P.infoPeran('') === null && P.infoPeran(undefined) === null);
let melempar = false;
try {
  P.peranWajib('ngawur');
} catch {
  melempar = true;
}
cek('G2 peranWajib MELEMPAR untuk peran tak dikenal', melempar);
cek('G3 peranWajib peran dikenal mengembalikan perannya', P.peranWajib('kerja').id === 'kerja');
cek(
  'G4 peranTidakDikenal benar (tak dikenal true, dikenal false)',
  P.peranTidakDikenal('ngawur') === true && P.peranTidakDikenal(undefined) === true && P.peranTidakDikenal('audit') === false,
);
const pref = P.peranDariPrefix('@ngawur kerjakan sesuatu');
cek('G5 prefix peran tak dikenal TIDAK diterima diam-diam (peran=null)', pref.peran === null, `dapat: ${String(pref.peran)}`);
cek('G6 prefix peran dikenal terbaca', P.peranDariPrefix('@audit cek ini').peran === 'audit');
cek(
  'G7 tebakPeran selalu jatuh ke salah satu peran yang dikenal',
  ['cari pemakaian fungsi', 'analisis kenapa crash', 'susun rencana rilis', 'audit hasilnya', 'perbaiki bug ini', 'riset pustaka baru'].every((t) =>
    ID_DIKENAL.includes(P.tebakPeran(t)),
  ),
);

/* ---------- H. Teks aturan berasal dari berkas NYATA ---------- */
const FRASA_HARUS = [
  'Subagents RESEARCH; they do not write files',
  'Never hand file-writing to a subagent',
  'decide by the kind of work, not the number of files',
  'verify it from the disk',
];
const FRASA_LAMA = 'More than one file means more than one subagent';
const aturanEn = P.aturanSubagentPrompt('en');
cek(
  'H1 aturanSubagentPrompt("en") memuat keempat frasa yang dicek harness acuan',
  FRASA_HARUS.every((f) => aturanEn.includes(f)),
  FRASA_HARUS.filter((f) => !aturanEn.includes(f)).join(' | '),
);
cek('H2 aturanSubagentPrompt("en") tidak memuat frasa lama yang salah', !aturanEn.includes(FRASA_LAMA));
const aturanId = P.aturanSubagentPrompt('id');
cek(
  'H3 versi id memuat gagasan yang sama (meneliti bukan menulis; jenis pekerjaan; bukti disk)',
  aturanId.includes('tidak menulis berkas') && aturanId.includes('bukan jumlah berkas') && aturanId.includes('dari disk'),
);
cek(
  'H4 teks aturan benar-benar tertulis di berkas sumber (bukan dibangun di tempat lain)',
  SUMBER.includes('Subagents RESEARCH; they do not write files') && SUMBER.includes('Never hand file-writing to a subagent'),
);
cek(
  'H5 arahan & kasusTepi tiap peran berasal dari berkas NYATA (ada di src/lib/subagentRoles.ts)',
  PERAN.every((p) => SUMBER.includes(p.arahan.slice(0, 24)) && SUMBER.includes(p.kasusTepi.slice(0, 24))),
  PERAN.filter((p) => !SUMBER.includes(p.arahan.slice(0, 24)) || !SUMBER.includes(p.kasusTepi.slice(0, 24)))
    .map((p) => p.id)
    .join(','),
);

/* ---------- I. Determinisme ---------- */
cek(
  'I1 determinisme: dua panggilan menghasilkan hasil identik',
  JSON.stringify(P.tebakPeran('perbaiki bug di parser')) === JSON.stringify(P.tebakPeran('perbaiki bug di parser')) &&
    JSON.stringify(P.aturanSubagentPrompt('en')) === JSON.stringify(P.aturanSubagentPrompt('en')) &&
    JSON.stringify(P.peranDariPrefix('@cari x')) === JSON.stringify(P.peranDariPrefix('@cari x')),
);

/* ---------- J. Kunci runtime benar-benar mengunci ---------- */
let ditolakSaatJalan = false;
const sebelum = P.infoPeran('jelajah').batasTool.join(',');
try {
  P.infoPeran('jelajah').batasTool.push('tulis');
} catch {
  ditolakSaatJalan = true;
}
const sesudah = P.infoPeran('jelajah').batasTool.join(',');
cek(
  'J1 batas peran tidak bisa dilonggarkan saat jalan (explorer tetap tanpa tulis)',
  sesudah === sebelum && sesudah === 'baca,web',
  `sebelum=${sebelum} sesudah=${sesudah}${ditolakSaatJalan ? ' (push melempar)' : ''}`,
);
cek(
  'J2 Object.isFrozen pada peran, batasTool & dilarang',
  PERAN.every((p) => Object.isFrozen(p) && Object.isFrozen(p.batasTool) && Object.isFrozen(p.dilarang)),
);

/* ---------- K. Sambungan NYATA ke sumber prompt yang dikirim ke model ---------- */
/*
 * Ini bagian yang dulu merah: teks aturan hidup di berkas ini sementara prompt
 * yang dikirim ke model memakai teks lain. Sekarang systemPrompt.ts tidak lagi
 * menyalin teksnya - ia memangggil `aturanSubagentPrompt`, jadi tak mungkin lagi
 * batas peran dan kalimat yang dikirim ke model berbeda.
 */
const IMPOR_ATURAN = /import\s*\{[^}]*\baturanSubagentPrompt\b[^}]*\}\s*from\s*'\.\/subagentRoles'/;
cek('K1 systemPrompt.ts mengimpor aturanSubagentPrompt dari ./subagentRoles', IMPOR_ATURAN.test(PROMPT));
cek(
  "K2 blok aturan EN dirakit dari aturanSubagentPrompt('en') (bukan teks salinan)",
  PROMPT.includes("...aturanSubagentPrompt('en').split('\\n')"),
);
cek(
  "K3 blok aturan ID dirakit dari aturanSubagentPrompt('id')",
  PROMPT.includes("...aturanSubagentPrompt('id').split('\\n')"),
);
cek(
  'K4 salinan lama aturan subagent sudah hilang dari systemPrompt.ts (frasa EN hanya hidup di subagentRoles.ts)',
  !PROMPT.includes('Build/write tasks are done by YOU, directly, one file at a time') &&
    !PROMPT.includes('Subagents are read-only anyway') &&
    !PROMPT.includes('Tugas membangun/menulis dikerjakan OLEHMU, langsung'),
);
cek(
  'K5 frasa EN benar-benar tertulis di berkas ini (SUMBER); frasa lama tinggal sebagai catatan dan tidak ikut ke teks yang dibangun',
  FRASA_HARUS.every((f) => SUMBER.includes(f)) && !aturanEn.includes(FRASA_LAMA) && !aturanId.includes(FRASA_LAMA),
);

/* ---- laporan keadaan nyata (bukan kasus) ---- */
console.log(
  `\n  INFO  aturan peran hidup di src/lib/subagentRoles.ts dan di-spread oleh src/lib/systemPrompt.ts; status sambungan: ${
    IMPOR_ATURAN.test(PROMPT) && PROMPT.includes("...aturanSubagentPrompt('en').split('\\n')") ? 'TERSAMBUNG' : 'BELUM TERSAMBUNG'
  }.`,
);
console.log('        Bukti prompt rakitan dibaca apa adanya oleh: node scripts/uji-prompt-subagent2.mjs');

console.log(`\n== ${lulus} lulus / ${gagal} gagal (total ${lulus + gagal} kasus) ==`);
if (gagal) console.log('gagal:', pesanGagal.join(' ; '));
process.exit(gagal ? 1 : 0);
