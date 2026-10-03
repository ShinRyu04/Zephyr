/**
 * cek-kutip-url.mjs - membuktikan `kutipUrlDiPerintah` benar, tanpa shell.
 *
 *   node scripts/cek-kutip-url.mjs
 *
 * Tidak lewat CDP: fungsi ini murni string, dan mengujinya lewat aplikasi hidup
 * hanya menambah lapisan yang bisa gagal. Yang penting di sini adalah pasangan
 * kasus: yang HARUS dikutip, dan yang TIDAK BOLEH disentuh. Uji yang hanya
 * memuat kasus pertama akan lulus juga kalau fungsinya mengutip segalanya -
 * dan mengutip `&&` sebagai argumen akan merusak perintah yang sah.
 */
import { buildSync } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const AKAR = 'D:/Zephyr';
const cache = join(AKAR, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const keluar = join(cache, 'cek-kutip-url.mjs');

buildSync({
  entryPoints: [join(AKAR, 'src', 'lib', 'kutipPerintah.ts')],
  outfile: keluar,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});

const { kutipUrlDiPerintah } = await import(pathToFileURL(keluar).href);

let lulus = 0;
let gagal = 0;
const cek = (nama, dapat, harap) => {
  if (dapat === harap) {
    lulus += 1;
    console.log(`  LULUS  ${nama}`);
  } else {
    gagal += 1;
    console.error(`  GAGAL  ${nama}`);
    console.error(`         dapat: ${JSON.stringify(dapat)}`);
    console.error(`         harap: ${JSON.stringify(harap)}`);
  }
};

const hasil = (s) => kutipUrlDiPerintah(s).perintah;

console.log('\n== URL dengan & HARUS dikutip ==');

/* Kasus asli yang dilaporkan user. */
cek(
  'perintah yt-dlp dengan &list=&index=',
  hasil('yt-dlp https://www.youtube.com/watch?v=qP-nNJX6vXo&list=PLYWlrVurvCEE&index=3'),
  'yt-dlp "https://www.youtube.com/watch?v=qP-nNJX6vXo&list=PLYWlrVurvCEE&index=3"',
);

cek(
  'curl dengan dua parameter',
  hasil('curl https://api.example.com/a?x=1&y=2'),
  'curl "https://api.example.com/a?x=1&y=2"',
);

cek('www tanpa skema', hasil('curl www.x.com/a?b=1&c=2'), 'curl "www.x.com/a?b=1&c=2"');

cek(
  'URL dengan pipa di dalam tanda kurung',
  hasil('curl https://x.com/a|b'),
  'curl "https://x.com/a|b"',
);

console.log('\n== HARUS TIDAK disentuh ==');

cek('tanpa & sama sekali', hasil('npm run build'), 'npm run build');
cek('&& sebagai operator', hasil('npm install && npm test'), 'npm install && npm test');
cek('& di akhir (background)', hasil('npm run dev &'), 'npm run dev &');
cek('URL sudah dikutip', hasil('curl "https://x.com/a?b=1&c=2"'), 'curl "https://x.com/a?b=1&c=2"');
cek('bukan URL', hasil('echo a&b'), 'echo a&b');
cek('perintah kosong', hasil(''), '');

console.log('\n== Tanda "diubah" ikut benar ==');
cek('diubah=true untuk URL &', kutipUrlDiPerintah('curl https://x.com/a?b=1&c=2').diubah, true);
cek('diubah=false untuk perintah biasa', kutipUrlDiPerintah('npm run build').diubah, false);
cek('diubah=false untuk &&', kutipUrlDiPerintah('a && b').diubah, false);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
