/**
 * periksa-harness.mjs - penjaga cepat untuk semua berkas harness.
 *
 *   node scripts/periksa-harness.mjs
 *
 * Menangkap dua kesalahan yang sudah BERKALI-KALI terjadi dan selalu memakan
 * waktu lebih lama daripada yang seharusnya:
 *
 * 1. BACKTICK DI DALAM KOMENTAR YANG BERADA DI DALAM TEMPLATE LITERAL.
 *    Harness proyek ini banyak memakai ``cdp.json(`...`)``, dan komentar di
 *    dalamnya memakai backtick untuk menandai nama fungsi - persis seperti
 *    yang lazim. Backtick itu MENUTUP template literal lebih awal, dan
 *    parser melaporkan errornya di BARIS LAIN yang tidak ada hubungannya.
 *    Sudah lima kali kena; tiap kali butuh beberapa menit untuk menemukannya
 *    kembali. Pemeriksaan ini menemukannya dalam sedetik.
 *
 * 2. KURUNG YANG TIDAK SEIMBANG di sekitar template literal besar.
 *
 * Yang diperiksa hanya berkas `scripts/*.mjs` - dan hanya bentuk yang sudah
 * terbukti bermasalah. Ini penjaga, bukan linter: ia tidak mencoba memahami
 * seluruh JavaScript.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'scripts';
const berkas = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.mjs') || f.endsWith('.js'))
  .map((f) => path.join(DIR, f));

let masalah = 0;

for (const f of berkas) {
  const isi = fs.readFileSync(f, 'utf8');
  const baris = isi.split('\n');

  let dalamTemplate = false;

  baris.forEach((b, n) => {
    /* Lacak apakah kita sedang berada di dalam template literal. Ini
       perkiraan sederhana: cukup untuk menemukan backtick yang bocor dari
       komentar, yang selalu berada di dalam template yang sudah terbuka. */
    const jumlahBacktick = (b.match(/`/g) || []).length;

    if (dalamTemplate) {
      const t = b.trim();
      const komentar = t.startsWith('*') || t.startsWith('/*') || t.startsWith('//');
      /*
       * Backtick yang sudah DI-ESCAPE tidak menutup template, jadi bukan
       * masalah. Berkas yang sudah berhati-hati memakai bentuk itu, dan menuduh
       * mereka sama saja melatih pembacanya untuk mengabaikan penjaga ini -
       * penjaga yang sering salah akan dimatikan orang, dan setelah itu ia
       * tidak menjaga apa pun.
       */
      const bocor = (b.match(/(?<!\\)`/g) || []).length;
      if (komentar && bocor > 0) {
        /*
         * Backtick di dalam komentar SELAGI berada di dalam template literal
         * akan menutupnya. Satu-satunya pengecualian: baris yang juga menutup
         * template itu sendiri, dan itu bukan komentar.
         */
        console.log(
          `${f}:${n + 1}  BACKTICK DI KOMENTAR DALAM TEMPLATE LITERAL -> ${t.slice(0, 70)}`,
        );
        masalah++;
      }
    }

    if (jumlahBacktick % 2 === 1) dalamTemplate = !dalamTemplate;
  });
}

/* Periksa juga sintaksnya sekalian, karena inilah cara kesalahan itu muncul. */
const { execFileSync } = await import('node:child_process');
let gagalParse = 0;
for (const f of berkas) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    const keluaran = String(e.stderr || e.message).split('\n').slice(0, 4).join('\n');
    console.log(`${f}  GAGAL PARSE: ${keluaran}`);
    gagalParse++;
  }
}

console.log(
  `\n${berkas.length} berkas diperiksa: ${masalah} backtick bermasalah, ${gagalParse} gagal parse.`,
);

process.exit(masalah === 0 && gagalParse === 0 ? 0 : 1);
