/*
 * UJI-TAHU-ZEPHYR - uji penerimaan "AI tahu Zephyr".
 *
 * Yang diuji BUKAN prompt dan bukan model: yang diuji adalah SATU-SATUNYA jalur
 * yang dipakai AI untuk menjawab pertanyaan soal Zephyr sendiri, yaitu
 * `zephyr_self` -> `cariFakta()` atas indeks yang ikut terpasang di aplikasi.
 * Kalau kueri seperti di bawah ini tidak menemukan apa pun, maka AI di aplikasi
 * sungguhan juga akan menjawab "tidak tahu" - walau promptnya panjang.
 *
 * Kode yang diuji di-bundle apa adanya dari `src/lib/zephyrCari.ts` (bukan
 * salinan logika), supaya uji ini gagal kalau pencariannya berubah salah.
 *
 * Jalan: node scripts/uji-tahu-zephyr.mjs            (keluar != 0 kalau ada yang gagal)
 *        node scripts/uji-tahu-zephyr.mjs --rinci    (tampilkan hasil tiap kueri)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const RINCI = process.argv.includes('--rinci');
const KERJA = path.join(AKAR, 'scratch', 'uji-tahu-zephyr');
mkdirSync(KERJA, { recursive: true });
const BUNDEL = path.join(KERJA, 'zephyrCari.bundle.mjs');
const GARIS_MIRING = String.fromCharCode(92);

function shimEsbuild() {
  /* Urutan penting: `.cmd` tidak bisa di-spawnSync tanpa shell di Windows
     (EINVAL), jadi jalur yang diutamakan adalah berkas JS-nya dan Node yang
     menjalankannya. */
  const js = path.join(AKAR, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(js)) return { mode: 'node', jalan: js };
  for (const k of [
    path.join(AKAR, 'node_modules', '.bin', 'esbuild.cmd'),
    path.join(AKAR, 'node_modules', '.bin', 'esbuild'),
  ]) {
    if (existsSync(k)) return { mode: 'shell', jalan: k };
  }
  throw new Error('esbuild tidak ditemukan di node_modules - uji ini butuh esbuild untuk membundel zephyrCari.ts');
}

function bundel() {
  const { mode, jalan } = shimEsbuild();
  const arg = [
    path.join('src', 'lib', 'zephyrCari.ts'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--log-level=warning',
    `--outfile=${BUNDEL.split(GARIS_MIRING).join('/')}`,
  ];
  const keluar =
    mode === 'node'
      ? execFileSync(process.execPath, [jalan, ...arg], { cwd: AKAR, encoding: 'utf8' })
      : execFileSync(jalan, arg, { cwd: AKAR, encoding: 'utf8', shell: true });
  if (keluar && keluar.trim()) console.log(keluar.trim());
}

/*
 * Pertanyaan uji: meniru cara user bertanya, BUKAN istilah internal generator.
 *  - `semua`  : setiap kata ini wajib muncul di kunci/teks salah satu hasil.
 *  - `salah`  : minimal satu kata ini wajib muncul (sinonim / ejaan lain).
 *  - `kosong` : kueri yang memang TIDAK boleh punya fakta (uji anti-mengarang).
 *  - `asing`  : kata yang wajib dilaporkan `kataTakDikenal()`; kalau ada hasil,
 *               semuanya wajib bertanda `longgar` (bukan kecocokan penuh).
 */
const TANYA = [
  { q: 'panel bawah', semua: ['panel'], kenapa: 'user menyebut lokasi UI sehari-hari' },
  { q: 'subagent.allowWrite', semua: ['allowwrite'], kenapa: 'nama setelan internal harus ketemu apa adanya' },
  { q: 'subagent boleh nulis berkas', salah: ['tulis', 'write'], kenapa: 'pertanyaan bahasa manusia soal izin subagent' },
  { q: 'Ctrl+Shift+P', salah: ['palet', 'perintah'], kenapa: 'pintasan harus bisa dijelaskan' },
  { q: 'port MCP', salah: ['9222', '9224', 'mcp'], kenapa: 'angka port termasuk fakta yang sering ditanya' },
  { q: 'aiStore', kategori: 'kode', semua: ['aistore'], kenapa: 'peta kode: di mana sesuatu diimplementasikan' },
  { q: 'gimana cara ganti bahasa antarmuka', salah: ['bahasa'], kenapa: 'pertanyaan manusia yang penuh kata tanya' },
  { q: 'apa yang baru', salah: ['changelog', 'catatan', 'versi', 'release'], kenapa: 'pertanyaan "apa yang baru" harus menemukan dokumen versi' },
  { q: 'fontSize', semua: ['fontsize'], kenapa: 'nama setelan editor' },
  { q: 'tema', semua: ['tema'], kenapa: 'tema/daya tarik visual' },
  { q: 'write_file', semua: ['write_file'], kenapa: 'nama tool yang bisa dipakai AI' },
  { q: 'zephyr_self', semua: ['zephyr_self'], kenapa: 'AI harus bisa menjelaskan tool dirinya sendiri' },
  { q: 'terminal', semua: ['terminal'], kenapa: 'panel bawah' },
  { q: 'ekstensi', kategori: 'ekstensi', salah: ['ekstensi'], kenapa: 'ekstensi bawaan harus terdaftar' },
  { q: 'versi aplikasi', salah: ['versi', '1.1.'], kenapa: 'versi harus diketahui, bukan ditebak' },
  { q: 'auto compact riwayat', salah: ['compact', 'riwayat', 'ringkas'], kenapa: 'istilah fitur boleh beda dari nama kode' },
  { q: 'mcp.json', salah: ['mcp'], kenapa: 'berkas setelan MCP' },
  { q: 'settings.json', salah: ['settings'], kenapa: 'berkas setelan utama' },
  { q: 'pintasan simpan', salah: ['ctrl+s', 'simpan'], kenapa: 'keybinding default' },
  { q: 'jalur log', salah: ['log'], kenapa: 'path log termasuk fakta operasional' },
  { q: 'formatOnSave', semua: ['formatonsave'], kenapa: 'setelan editor lain' },
  { q: 'subagent tulis berkas', salah: ['subagent'], kenapa: 'variasi urutan kata' },
  { q: 'zephyr teleportasi berkas', asing: ['teleportasi'], kenapa: 'ANTI-NGARANG: istilah karangan harus dilaporkan, bukan ditutupi hasil longgar' },
  { q: 'fitur kucing terbang', kosong: true, kenapa: 'ANTI-NGARANG: 0 hasil, bukan jawaban karangan' },
];

let gagal = 0;
const baris = [];

bundel();
const M = await import(pathToFileURL(BUNDEL).href);

/* Setiap pertanyaan yang PUNYA harapan dihitung - termasuk kasus `asing`,
   yang dihitung sebagai terjawab di bloknya sendiri (baris `lulus += 1`).
   Sebelumnya kasus `asing` dikecualikan dari penyebut sementara pembilangnya
   tetap dihitung, jadi uji ini MUSTAHIL lulus saat cek anti-ngarang benar. */
const terjawabTotal = TANYA.filter((t) => !t.kosong).length;
let lulus = 0;
let kosongBenar = 0;
let kosongTotal = 0;

for (const t of TANYA) {
  const hasil = M.cariFakta(t.q, { kategori: t.kategori ?? 'semua', batas: 8 });
  const teks = hasil.map((h) => `${h.kunci} ${h.teks}`).join(' # ').toLowerCase();
  const label = `${t.kategori ? `[${t.kategori}] ` : ''}${t.q}`;
  const atas = hasil.length ? `"${hasil[0].kunci}" (${hasil[0].kategori}${hasil[0].longgar ? ', longgar' : ''})` : '-';

  if (t.kosong) {
    kosongTotal += 1;
    if (hasil.length === 0) {
      kosongBenar += 1;
      baris.push(`  OK    ${label} -> 0 fakta (benar: tidak mengarang)`);
    } else {
      gagal += 1;
      baris.push(`  GAGAL ${label} -> ${hasil.length} fakta padahal fiturnya tidak ada (NGARANG) :: ${atas}`);
    }
    continue;
  }

  if (t.asing) {
    const tak = M.kataTakDikenal(t.q).map((x) => x.toLowerCase());
    const kurang = (t.asing ?? []).filter((k) => !tak.includes(k.toLowerCase()));
    const semuaLonggar = hasil.every((h) => h.longgar);
    if (kurang.length) {
      gagal += 1;
      baris.push(`  GAGAL ${label} -> kata ${kurang.join(', ')} tidak dilaporkan sebagai tak dikenal (dilaporkan: ${tak.join(', ') || '-'})`);
    } else if (hasil.length && !semuaLonggar) {
      gagal += 1;
      baris.push(`  GAGAL ${label} -> ada hasil yang dianggap cocok penuh padahal katanya karangan :: ${atas}`);
    } else {
      lulus += 1;
      baris.push(`  OK    ${label} -> tak dikenal: ${tak.join(', ')} | ${hasil.length} hasil (semua longgar)`);
    }
    continue;
  }

  if (hasil.length === 0) {
    gagal += 1;
    baris.push(`  GAGAL ${label} -> 0 fakta (AI akan bilang belum tahu)`);
    continue;
  }
  const kurangSemua = (t.semua ?? []).filter((k) => !teks.includes(k.toLowerCase()));
  const salahSatuHilang = (t.salah ?? []).length > 0 && !(t.salah ?? []).some((k) => teks.includes(k.toLowerCase()));
  if (kurangSemua.length || salahSatuHilang) {
    gagal += 1;
    const sebab = [];
    if (kurangSemua.length) sebab.push(`tak memuat ${kurangSemua.join(', ')}`);
    if (salahSatuHilang) sebab.push(`tak ada satu pun dari ${t.salah.join(' / ')}`);
    baris.push(`  GAGAL ${label} -> ${hasil.length} fakta, tapi ${sebab.join('; ')} :: teratas ${atas}`);
    continue;
  }
  lulus += 1;
  baris.push(`  OK    ${label} -> ${hasil.length} fakta :: teratas ${atas}`);
}

/* Cakupan indeks + versi: fakta harus sinkron dengan aplikasi yang dibundel. */
const kategori = M.kategoriTersedia();
const totalEntri = M.jumlahEntri();
const versi = M.versiFakta();
const pkg = JSON.parse(readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
const tauri = JSON.parse(readFileSync(path.join(AKAR, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const indeksSumber = readFileSync(path.join(AKAR, 'src', 'lib', 'zephyrIndeks.ts'), 'utf8');
const hashBundel = createHash('sha1').update(indeksSumber).digest('hex').slice(0, 16);

const keluhan = [];
if (kategori.some((k) => k.jumlah === 0)) {
  keluhan.push(`kategori kosong: ${kategori.filter((k) => k.jumlah === 0).map((k) => k.kategori).join(', ')}`);
}
if (totalEntri < 3000) keluhan.push(`jumlah entri mencurigakan: ${totalEntri} (< 3000)`);
if (versi.aplikasi !== pkg.version) keluhan.push(`versi fakta ${versi.aplikasi} != package.json ${pkg.version}`);
if (String(tauri.version) !== pkg.version) keluhan.push(`versi tauri ${tauri.version} != package.json ${pkg.version}`);
if (!versi.hashSumber || versi.hashSumber.length < 8) keluhan.push(`hash sumber kosong/pendek: "${versi.hashSumber}"`);

console.log('UJI TAHU ZEPHYR (jalur zephyr_self -> cariFakta atas indeks terpasang)');
console.log(`  indeks: ${totalEntri} entri | versi aplikasi ${versi.aplikasi} | hash sumber ${versi.hashSumber}`);
console.log(`  kategori: ${kategori.map((k) => `${k.kategori}=${k.jumlah}`).join(' ')}`);
if (RINCI || gagal) console.log(baris.join('\n'));
console.log(`  pertanyaan: ${lulus}/${terjawabTotal} terjawab, anti-ngarang: ${kosongBenar}/${kosongTotal} benar kosong`);
if (keluhan.length) console.log(`  keluhan indeks: ${keluhan.join(' | ')}`);
const verdict = gagal === 0 && keluhan.length === 0 && lulus === terjawabTotal;
console.log(`  VERDICT: ${verdict ? 'LULUS' : 'GAGAL'}`);
if (!verdict) console.log(`  (hash berkas indeks sekarang ${hashBundel})`);
process.exit(verdict ? 0 : 1);
