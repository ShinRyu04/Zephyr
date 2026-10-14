/*
 * CEK-BATAS-INTI - gate "pengetahuan dua lapis" Zephyr AI (item BACKLOG `ai-tahu-100-7`).
 *
 * Kenapa gate ini ada
 * -------------------
 * Keputusan yang sudah disetujui menetapkan ANGKANYA, bukan menyerahkannya ke
 * model: blok inti (`zephyrFakta.ts`) selalu ikut tiap giliran dan harus tetap
 * kecil (<= 2.000 token, perkiraan konservatif 4 karakter/token = 8.000 char),
 * sedangkan sisanya (label, perintah, tool, ekstensi, dokumen bundel, peta kode)
 * hidup di indeks `zephyrIndeks.ts` dan hanya dicari saat ada pertanyaan lewat
 * `zephyr_self` -> `cariFakta()`.
 *
 * Tanpa gate ini, blok inti hanya bisa menggelembung: setiap tambahan kecil
 * terasa wajar, dan tidak ada satu pun pemeriksaan yang gagal saat totalnya
 * sudah dua kali lipat. Gate ini yang menjadikannya angka yang bisa gagal.
 *
 * Yang diperiksa
 * --------------
 *   (a) panjang RUNTIME blok inti <= AMBANG_CHAR (bawaan 8.000 char, env
 *       `AMBANG_INTI_CHAR` dipakai untuk uji negatif);
 *   (b) blok inti MENYEBUT `zephyr_self` - kalau tidak, model tidak tahu ada
 *       pintu ke lapis kedua sama sekali;
 *   (c) `zephyr_self` ada di `TOOL_DIKIRIM_SELALU` (`src/lib/zephyrTools/catalog.ts`),
 *       jadi bisa dipanggil tanpa lebih dulu mencarinya lewat `tool_search`;
 *   (d) setiap kategori `FAKTA_KATEGORI` punya >= 1 entri di indeks;
 *   (e) indeks yang dibundel masih SINKRON dengan sumbernya: menjalankan
 *       `node scripts/gen-fakta-zephyr.mjs --check` dan memeriksa kode keluarnya.
 *       Dilewati kalau dipanggil dengan `--cepat`.
 *
 * Jalan: node scripts/cek-batas-inti.mjs            (keluar != 0 kalau ada yang gagal)
 *        node scripts/cek-batas-inti.mjs --cepat     (lewati pemeriksaan sinkron)
 *        AMBANG_INTI_CHAR=100 node scripts/cek-batas-inti.mjs   (uji negatif)
 *
 * Modul TS di-bundle apa adanya lewat esbuild (bukan salinan logika), mengikuti
 * pola `scripts/uji-tahu-zephyr.mjs`, supaya gate ini gagal kalau blok inti atau
 * indeks berubah bentuk.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const CEPAT = process.argv.includes('--cepat');
const KERJA = path.join(AKAR, 'scratch', 'cek-batas-inti');
mkdirSync(KERJA, { recursive: true });
const GARIS_MIRING = String.fromCharCode(92);

/** Anggaran blok inti. Keputusan `ai-tahu-100-7(a)`: 2.000 token = 8.000 char. */
const AMBANG_CHAR = Number(process.env.AMBANG_INTI_CHAR ?? 8000);

const gagal = [];
const ok = (nama, pesan) => console.log(`  OK    ${nama.padEnd(34)} ${pesan}`);
const rusak = (nama, pesan) => {
  gagal.push(nama);
  console.log(`  GAGAL ${nama.padEnd(34)} ${pesan}`);
};

function shimEsbuild() {
  /* Urutan penting: `.cmd` tidak bisa di-spawnSync tanpa shell di Windows
     (EINVAL), jadi berkas JS-nya diutamakan. */
  const js = path.join(AKAR, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(js)) return { mode: 'node', jalan: js };
  for (const k of [
    path.join(AKAR, 'node_modules', '.bin', 'esbuild.cmd'),
    path.join(AKAR, 'node_modules', '.bin', 'esbuild'),
  ]) {
    if (existsSync(k)) return { mode: 'shell', jalan: k };
  }
  throw new Error('esbuild tidak ditemukan di node_modules - gate ini butuh esbuild untuk membundel modul TS');
}

function bundel(rel) {
  const { mode, jalan } = shimEsbuild();
  const keluarNama = path.join(KERJA, path.basename(rel).replace(/\.ts$/, '.bundle.mjs'));
  const arg = [
    path.join(...rel.split('/')),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--log-level=warning',
    `--outfile=${keluarNama.split(GARIS_MIRING).join('/')}`,
  ];
  if (mode === 'node') {
    execFileSync(process.execPath, [jalan, ...arg], { cwd: AKAR, encoding: 'utf8' });
  } else {
    execFileSync(jalan, arg, { cwd: AKAR, encoding: 'utf8', shell: true });
  }
  return keluarNama;
}

const modFakta = await import(pathToFileURL(bundel('src/lib/zephyrFakta.ts')).href);
const modIndeks = await import(pathToFileURL(bundel('src/lib/zephyrIndeks.ts')).href);

console.log('CEK BATAS INTI (pengetahuan dua lapis, ai-tahu-100-7)');

/* ---------------- (a) panjang runtime blok inti ---------------- */
const blok = String(modFakta.FAKTA_ZEPHYR ?? '');
const nChar = blok.length;
const nToken = Math.ceil(nChar / 4);
const pesanUkuran = `${nChar} char ~ ${nToken} token (ambang ${AMBANG_CHAR} char ~ ${Math.ceil(AMBANG_CHAR / 4)} token)`;
if (nChar > 0 && nChar <= AMBANG_CHAR) ok('ukuran blok inti', pesanUkuran);
else if (nChar === 0) rusak('ukuran blok inti', 'blok inti KOSONG - prompt kehilangan semua fakta');
else rusak('ukuran blok inti', `${pesanUkuran} - LEBIH ${nChar - AMBANG_CHAR} char`);

/* ---------------- (b) blok inti menyebut pintu lapis kedua ---------------- */
if (blok.includes('zephyr_self')) ok('inti menyebut zephyr_self', 'ya');
else rusak('inti menyebut zephyr_self', 'tidak disebut - model tidak tahu ada indeks yang bisa dicari');

/* ---------------- (c) tool ikut dikirim tiap langkah ---------------- */
const katalog = readFileSync(path.join(AKAR, 'src', 'lib', 'zephyrTools', 'catalog.ts'), 'utf8');
const mulai = katalog.indexOf('export const TOOL_DIKIRIM_SELALU');
const akhir = mulai >= 0 ? katalog.indexOf('\n];', mulai) : -1;
if (mulai < 0 || akhir < 0) {
  rusak('TOOL_DIKIRIM_SELALU terbaca', 'array tidak ditemukan di catalog.ts');
} else {
  const isi = katalog.slice(mulai, akhir);
  const nama = [...isi.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
  if (nama.includes('zephyr_self')) ok('zephyr_self dikirim selalu', `ya (${nama.length} tool selalu dikirim)`);
  else rusak('zephyr_self dikirim selalu', `tidak ada - cuma ketemu lewat tool_search (${nama.length} tool selalu dikirim)`);
}

/* ---------------- (d) setiap kategori indeks terisi ---------------- */
const kategori = modIndeks.FAKTA_KATEGORI ?? [];
const entri = modIndeks.FAKTA_INDEKS ?? [];
const hitung = new Map();
for (const e of entri) hitung.set(e[0], (hitung.get(e[0]) ?? 0) + 1);
const kosong = kategori.filter((k) => !hitung.get(k));
const rincian = kategori.map((k) => `${k}=${hitung.get(k) ?? 0}`).join(' ');
if (entri.length > 0 && kosong.length === 0) ok('kategori indeks terisi', `${entri.length} entri; ${rincian}`);
else rusak('kategori indeks terisi', `kosong: ${kosong.join(', ') || '(indeks kosong)'}; ${rincian}`);

/* ---------------- (e) indeks sinkron dengan sumbernya ---------------- */
if (CEPAT) {
  console.log('  LEWAT indeks sinkron dengan sumber   (--cepat)');
} else {
  let kode = 0;
  let keluaran = '';
  try {
    keluaran = execFileSync(process.execPath, [path.join('scripts', 'gen-fakta-zephyr.mjs'), '--check'], {
      cwd: AKAR,
      encoding: 'utf8',
    });
  } catch (e) {
    kode = e.status ?? 1;
    keluaran = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const akhirBaris = keluaran.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
  if (kode === 0) ok('indeks sinkron dengan sumber', akhirBaris || 'sinkron');
  else rusak('indeks sinkron dengan sumber', `BASI/GAGAL (exit ${kode}) ${akhirBaris}`);
}

/* ---------------- verdict ---------------- */
if (gagal.length === 0) {
  console.log(`  VERDICT: LULUS (${nToken} token <= ${Math.ceil(AMBANG_CHAR / 4)})`);
  process.exit(0);
}
console.log(`  VERDICT: GAGAL - ${gagal.length} pemeriksaan: ${gagal.join(', ')}`);
process.exit(1);
