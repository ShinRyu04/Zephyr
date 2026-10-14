/*
 * cek-konteks-repo.mjs - gate untuk `src/lib/konteksRepo.ts` (item ZEPH-KONTEKS-REPO).
 *
 * ## Kenapa gate ini ada
 *
 * "Zeph mengenal repo yang sedang dibuka" punya tiga janji yang gampang
 * ditulis dan gampang bocor:
 *
 *   1. `.gitignore` dihormati          -> kalau bocor, `node_modules` membanjiri daftar;
 *   2. berkas rahasia tidak pernah masuk -> kalau bocor, nama `.env` ada di prompt;
 *   3. ada batas jumlah & ukuran        -> kalau bocor, satu repo besar menghabiskan konteks.
 *
 * Ketiganya hanya berarti kalau bisa DIBUKTIKAN, jadi skrip ini membangun pohon
 * berkas tiruan di folder sementara (BUKAN di dalam repo - aturan sesi), lalu
 * memeriksa keluaran modul yang sesungguhnya (di-bundle apa adanya lewat
 * esbuild, mengikuti pola `scripts/cek-batas-inti.mjs`, bukan salinan logika).
 *
 * Yang diperiksa, dengan angkanya:
 *   A. .gitignore: folder, pola glob, pengecualian `!`, pola berakar, pola `**`,
 *      `.gitignore` BERSARANG di subfolder.
 *   B. Rahasia: `.env*`, kunci (`.pem`, `.ppk`, `.kdbx`), credential store,
 *      folder terproteksi (`.ssh`, `.aws`), dan janji bahwa NAMA berkas itu
 *      tidak pernah muncul di teks ringkasan.
 *   C. Batas: jumlah tampil, ukuran per berkas, anggaran byte, batas pindai,
 *      dan anggaran karakter ringkasan - plus determinisme (dua kali jalan =
 *      teks identik).
 *   D. Tanpa jaringan: scan bundel + global `fetch`/`XMLHttpRequest`/`WebSocket`
 *      dan socket `net`/`http(s)` diganti menjadi pelempar error, lalu seluruh
 *      pipa dijalankan; satu panggilan saja = GAGAL.
 *   E. Jembatan Tauri `pindaiKonteksRepo()` diuji terhadap pohon tiruan yang
 *      sama lewat `PerintahKonteksRepo` tiruan (dua tahap: saring dulu, stat
 *      kemudian) - termasuk `.gitignore` bersarang dan batas jumlah stat.
 *
 * Jalan:
 *   node scripts/cek-konteks-repo.mjs
 *   node scripts/cek-konteks-repo.mjs --simpan   # cetak ringkasan penuh (tidak dipotong 40 baris)
 *
 * Keluar != 0 kalau ada satu saja yang gagal.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const SIMPAN = process.argv.includes('--simpan');
const GARIS_MIRING = String.fromCharCode(92);

/* ------------------------------------------------------------------ */
/* Laporan                                                             */
/* ------------------------------------------------------------------ */

let lulus = 0;
const gagal = [];

function cek(nama, benar, detail = '') {
  if (benar) {
    lulus++;
    console.log(`  ok    ${nama.padEnd(46)} ${detail}`);
  } else {
    gagal.push(nama);
    console.log(`  GAGAL ${nama.padEnd(46)} ${detail}`);
  }
}
const angka = (n) => new Intl.NumberFormat('id-ID').format(n);

/* ------------------------------------------------------------------ */
/* 0. Pohon berkas tiruan di folder sementara - JANGAN di dalam repo   */
/* ------------------------------------------------------------------ */

const TMP = process.env.TMPDIR || process.env.TEMP || os.tmpdir();
const TIRUAN = mkdtempSync(path.join(TMP, 'cek-konteks-repo-'));

if (path.resolve(TIRUAN).toLowerCase().startsWith(path.resolve(AKAR).toLowerCase())) {
  console.error(`FATAL: folder tiruan berada DI DALAM repo (${TIRUAN}) - aturan sesi melarangnya.`);
  process.exit(1);
}

function tulis(rel, isi) {
  const p = path.join(TIRUAN, ...rel.split('/'));
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, isi);
}

const GITIGNORE_AKAR = [
  '# komentar harus diabaikan',
  'node_modules/',
  'dist/',
  '*.log',
  '!penting.log',
  'build/',
  'doc/*.tmp',
  '**/generated/',
  'sampah/',
  '',
].join('\n');

tulis('.gitignore', GITIGNORE_AKAR);

/* --- berkas yang HARUS tampil --- */
tulis('README.md', '# repo tiruan\n\nbukan repo Zephyr.\n');
tulis('package.json', '{\n  "name": "tiruan",\n  "version": "1.0.0"\n}\n');
tulis('tsconfig.json', '{ "compilerOptions": { "strict": true } }\n');
tulis('src/main.ts', 'export const utama = 1;\n');
tulis('src/app.ts', 'export const app = 2;\n');
tulis('src/ok.ts', 'export const ok = 3;\n');
tulis('src/util.rs', 'pub fn util() {}\n');
tulis('src/deep/nested/kecil.ts', 'export const kecil = 4;\n');
tulis('penting.log', 'catatan penting\n');
tulis('docs/panduan.md', '# panduan\n');
tulis('.gitignore.anak', 'bukan gitignore sungguhan\n'); // tidak boleh ikut mengatur

/* --- berkas yang HARUS dibuang `.gitignore` --- */
tulis('node_modules/foo/index.js', 'module.exports = 1;\n');
tulis('node_modules/.package-lock.json', '{}\n');
tulis('dist/bundle.js', 'console.log(1);\n');
tulis('debug.log', 'log\n');
tulis('build/out.js', 'console.log(2);\n');
tulis('doc/x.tmp', 'sementara\n');
tulis('sub/doc/y.tmp', 'INI TIDAK diabaikan: pola `doc/*.tmp` berakar ke akar repo\n');
tulis('src/generated/g.ts', 'export const g = 1;\n');
tulis('src/build/diabaikan.ts', 'export const b = 1;\n'); // folder bawaan: bukan gitignore
tulis('sampah/a.txt', 'isi sampah\n'); // HANYA gitignore yang membuang ini
tulis('sampah/dalam/b.txt', 'isi sampah dalam\n');

/* --- `.gitignore` BERSARANG --- */
tulis('web/.gitignore', '*.min.js\n');
tulis('web/app.js', 'console.log(3);\n');
tulis('web/app.min.js', 'console.log(4);\n');

/* --- berkas RAHASIA: tidak boleh muncul sama sekali --- */
const RAHASIA = [
  '.env',
  '.env.production',
  '.env.local',
  'secrets.json',
  'config/credentials.json',
  'keys/server.pem',
  'keys/client.key',
  '.ssh/id_rsa',
  '.ssh/config',
  '.aws/credentials',
  '.gnupg/pubring.kbx',
  'infra/state.tfstate',
  'infra/prod.tfvars',
  'app/passwords.kdbx',
  '.npmrc',
  'config/service-account.json',
];
for (const r of RAHASIA) tulis(r, 'RAHASIA-JANGAN-SAMPAI-KELUAR\n');

/* --- batas ukuran --- */
const SATU_MIB = 1024 * 1024;
tulis('data/huge.bin', 'X'.repeat(SATU_MIB * 2)); // > BATAS_UKURAN_BERKAS (1 MiB)
for (let i = 1; i <= 12; i++) {
  // tepat 1 MiB: TIDAK dilewati sebagai "besar", tapi menghabiskan anggaran byte
  tulis(`data/padat${String(i).padStart(2, '0')}.bin`, 'Y'.repeat(SATU_MIB));
}

/* --- batas jumlah: diuji dengan entri SINTETIS (C1), bukan 400 berkas di disk,
       supaya uji `.gitignore`/rahasia tidak ikut tersingkir oleh batas 300 --- */

console.log(`CEK KONTEKS REPO (ZEPH-KONTEKS-REPO)`);
console.log(`pohon tiruan: ${TIRUAN}\n`);

/* ------------------------------------------------------------------ */
/* 1. Matikan jaringan, lalu muat modul yang sesungguhnya              */
/* ------------------------------------------------------------------ */

const dipanggilJaringan = [];
const patchAktif = [];

globalThis.fetch = () => {
  dipanggilJaringan.push('fetch');
  throw new Error('jaringan dilarang di cek-konteks-repo');
};
patchAktif.push('globalThis.fetch');
globalThis.XMLHttpRequest = class {
  constructor() {
    dipanggilJaringan.push('XMLHttpRequest');
    throw new Error('jaringan dilarang di cek-konteks-repo');
  }
};
patchAktif.push('globalThis.XMLHttpRequest');
globalThis.WebSocket = class {
  constructor() {
    dipanggilJaringan.push('WebSocket');
    throw new Error('jaringan dilarang di cek-konteks-repo');
  }
};
patchAktif.push('globalThis.WebSocket');

async function tambalPrototipe(paket, kelas, metode) {
  try {
    const m = await import(`node:${paket}`);
    const k = m[kelas];
    if (!k?.prototype?.[metode]) return;
    k.prototype[metode] = function () {
      dipanggilJaringan.push(`${paket}.${kelas}.${metode}`);
      throw new Error('jaringan dilarang di cek-konteks-repo');
    };
    patchAktif.push(`${paket}.${kelas}.prototype.${metode}`);
  } catch {
    /* prototipe terkunci di versi node ini - patch lain yang menahan */
  }
}
await tambalPrototipe('net', 'Socket', 'connect');
await tambalPrototipe('http', 'Agent', 'createConnection');
await tambalPrototipe('https', 'Agent', 'createConnection');

const KERJA = path.join(AKAR, 'scratch', 'cek-konteks-repo');
mkdirSync(KERJA, { recursive: true });

function shimEsbuild() {
  const js = path.join(AKAR, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(js)) return { mode: 'node', jalan: js };
  for (const k of [
    path.join(AKAR, 'node_modules', '.bin', 'esbuild.cmd'),
    path.join(AKAR, 'node_modules', '.bin', 'esbuild'),
  ]) {
    if (existsSync(k)) return { mode: 'shell', jalan: k };
  }
  throw new Error('esbuild tidak ditemukan di node_modules - gate ini butuh esbuild');
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
  if (mode === 'node') execFileSync(process.execPath, [jalan, ...arg], { cwd: AKAR, encoding: 'utf8' });
  else execFileSync(jalan, arg, { cwd: AKAR, encoding: 'utf8', shell: true });
  return keluarNama;
}

const berkasBundel = bundel('src/lib/konteksRepo.ts');
const teksBundel = readFileSync(berkasBundel, 'utf8');
const M = await import(pathToFileURL(berkasBundel).href);

const {
  ABAIKAN_SEGMEN,
  BATAS_BERKAS_TAMPIL,
  BATAS_BYTE_TAMPIL,
  BATAS_CHAR_RINGKASAN,
  BATAS_PINDAI_BERKAS,
  BATAS_UKURAN_BERKAS,
  POLA_RAHASIA,
  POLA_RAHASIA_EFEKTIF,
  bangunKonteksRepo,
  bahasaDariJalur,
  diabaikanOlehGitignore,
  pindaiKonteksRepo,
  susunAturanGitignore,
} = M;

/* Semua berkas di pohon tiruan, dibaca dari disk - inilah "sumber" yang
   diumpankan ke modul. Ukuran dan mtime DIISI dari disk: batas ukuran tidak
   bisa diuji dengan ukuran yang tidak diketahui, dan `-1` memang berarti
   "tidak diketahui" (bukan nol). */
const { readdirSync } = await import('node:fs');
function daftarTiruan(akar = TIRUAN, batas = 100000) {
  const keluar = [];
  const jalan = (dir, rel) => {
    if (keluar.length >= batas) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (keluar.length >= batas) return;
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        jalan(path.join(dir, ent.name), r);
      } else {
        const st = statSync(path.join(dir, ent.name));
        keluar.push({ rel: r, ukuran: st.size, mtimeMs: Math.trunc(st.mtimeMs) });
      }
    }
  };
  jalan(akar, '');
  return keluar;
}

const GITIGNORE_TIRUAN = [
  { base: '', isi: GITIGNORE_AKAR },
  { base: 'web', isi: '*.min.js\n' },
];

const berkasTiruan = daftarTiruan();
const konteks = bangunKonteksRepo({ akar: TIRUAN, berkas: berkasTiruan, gitignore: GITIGNORE_TIRUAN });
const relTampil = konteks.berkas.map((b) => b.rel);
const adaRel = (r) => relTampil.includes(r);
const ringkas = konteks.ringkasan;

console.log('A. `.gitignore` dihormati');
cek('A1 folder node_modules/ dibuang', !relTampil.some((r) => r.startsWith('node_modules/')), `${relTampil.length} berkas tampil`);
cek('A2 folder dist/ dibuang', !relTampil.includes('dist/bundle.js'));
cek('A3 glob *.log dibuang', !relTampil.includes('debug.log') && adaRel('penting.log'), 'debug.log keluar, penting.log masuk (negasi !)');
cek('A4 folder build/ dibuang', !relTampil.includes('build/out.js'));
cek('A5 pola berakar `doc/*.tmp`', !relTampil.includes('doc/x.tmp') && adaRel('sub/doc/y.tmp'), 'akar terpaku: sub/doc/y.tmp tetap masuk');
cek('A6 `**/generated/` dibuang', !relTampil.includes('src/generated/g.ts') && adaRel('src/ok.ts'));
cek('A7 `.gitignore` sendiri tetap ada', adaRel('.gitignore'));
cek('A8 .gitignore BERSARANG (web/*.min.js)', !relTampil.includes('web/app.min.js') && adaRel('web/app.js'));
cek('A9 .gitignore.anak bukan aturan', adaRel('.gitignore.anak'));
cek(
  'A10 folder dibuang HANYA oleh gitignore',
  !relTampil.some((r) => r.startsWith('sampah/')),
  `sampah/ dan sampah/dalam/b.txt keluar; juga terhitung: diabaikanGitignore=${konteks.stat.diabaikanGitignore}, diabaikanStruktur=${konteks.stat.diabaikanStruktur}`,
);
cek(
  'A11 hitungan pembuangan konsisten',
  konteks.stat.diabaikanGitignore === 6 && konteks.stat.diabaikanStruktur >= 4,
  `gitignore=6 (sampah 2, *.log 1, doc/*.tmp 1, **/generated/ 1, web/*.min.js 1), bawaan>=4 (node_modules 2, dist 1, build 1, src/build 1)`,
);
cek('A12 teks ringkasan tidak menyebut yang diabaikan', !ringkas.includes('node_modules/') && !ringkas.includes('debug.log') && !ringkas.includes('app.min.js') && !ringkas.includes('sampah/'));

console.log('\nB. berkas rahasia diblokir (daftar eksplisit)');
const rahasiaBocor = RAHASIA.filter((r) => relTampil.includes(r));
cek('B1 tidak ada satu pun berkas rahasia di daftar', rahasiaBocor.length === 0, `${RAHASIA.length} berkas rahasia diuji, bocor ${rahasiaBocor.length}${rahasiaBocor.length ? ': ' + rahasiaBocor.join(', ') : ''}`);
cek(
  'B2 hitungan blokir sama dengan berkas yang dibuat',
  konteks.stat.diblokirRahasia === RAHASIA.length,
  `diblokirRahasia=${konteks.stat.diblokirRahasia}, dibuat=${RAHASIA.length}`,
);
cek('B3 blokir per jenis terisi', Object.keys(konteks.stat.blokirPerJenis).length >= 2, JSON.stringify(konteks.stat.blokirPerJenis));
const kataTerlarang = ['.env', 'id_rsa', 'credentials.json', 'server.pem', 'client.key', '.kdbx', 'tfvars', 'tfstate', 'passwords', 'service-account', '.npmrc', 'pubring'];
const bocorDiTeks = kataTerlarang.filter((k) => ringkas.toLowerCase().includes(k.toLowerCase()));
cek('B4 NAMA rahasia tidak muncul di teks ringkasan', bocorDiTeks.length === 0, `kata diperiksa: ${kataTerlarang.length}, bocor: ${bocorDiTeks.length ? bocorDiTeks.join(', ') : 'tidak ada'}`);
cek(
  'B5 daftar blokir eksplisit tidak kosong',
  POLA_RAHASIA.length > 0 && POLA_RAHASIA_EFEKTIF.length > POLA_RAHASIA.length,
  `agentGuard ${POLA_RAHASIA.length} pola + tambahan = ${POLA_RAHASIA_EFEKTIF.length} pola efektif`,
);
{
  // Perilaku yang SENGAJA: nama seperti `credentials.ts` juga ditolak, karena
  // gerbang baca `agentGuard.periksaBaca()` juga menolaknya. Dua lapisan yang
  // berbeda pendapat lebih berbahaya daripada satu nama source yang tidak
  // muncul di daftar.
  const hasilPaksa = bangunKonteksRepo({
    akar: TIRUAN,
    berkas: [
      { rel: 'src/bersih.ts', ukuran: 10, mtimeMs: 1 },
      { rel: 'src/credentials.ts', ukuran: 10, mtimeMs: 1 },
      { rel: 'src/env.ts', ukuran: 10, mtimeMs: 1 },
    ],
  });
  const namaPaksa = hasilPaksa.berkas.map((b) => b.rel);
  cek(
    'B6 rahasia bernama source ikut ditolak (sadar)',
    namaPaksa.includes('src/bersih.ts') && !namaPaksa.includes('src/credentials.ts') && namaPaksa.includes('src/env.ts'),
    `masuk: ${namaPaksa.join(', ')} - credentials.ts ditolak, env.ts (tanpa titik di depan) lolos`,
  );
}

console.log('\nC. batas jumlah, ukuran, dan determinisme');
{
  const banjir = Array.from({ length: 400 }, (_, i) => ({ rel: `src/gen/f${String(i + 1).padStart(3, '0')}.ts`, ukuran: 20, mtimeMs: 1_700_000_000_000 }));
  banjir.push({ rel: 'package.json', ukuran: 30, mtimeMs: 1_700_000_000_000 });
  banjir.push({ rel: 'README.md', ukuran: 40, mtimeMs: 1_700_000_000_000 });
  banjir.push({ rel: '.gitignore', ukuran: 50, mtimeMs: 1_700_000_000_000 });
  const k = bangunKonteksRepo({ akar: '/tmp/x', berkas: banjir });
  const rel = k.berkas.map((b) => b.rel);
  cek('C1 batas jumlah tampil berlaku', k.stat.tampil === BATAS_BERKAS_TAMPIL && k.stat.terpotongJumlah === true, `402 kandidat -> tampil=${k.stat.tampil} (BATAS_BERKAS_TAMPIL=${BATAS_BERKAS_TAMPIL}), terpotongJumlah=${k.stat.terpotongJumlah}`);
  cek(
    'C2 berkas akar tidak tersingkir oleh banjir sumber',
    ['package.json', 'README.md', '.gitignore'].every((r) => rel.includes(r)),
    `3/3 berkas akar muncul di antara ${rel.length} berkas (10 berkas pertama: ${rel.slice(0, 3).join(', ')} …)`,
  );
}
cek('C3 berkas > 1 MiB dilewati', !adaRel('data/huge.bin') && konteks.stat.dilewatiBesar >= 1, `huge.bin 2 MiB keluar, dilewatiBesar=${konteks.stat.dilewatiBesar} (ambang ${angka(BATAS_UKURAN_BERKAS)} B)`);
cek('C4 anggaran byte tampil berlaku', konteks.stat.terpotongByte === true && konteks.stat.byteTampil <= BATAS_BYTE_TAMPIL, `byteTampil=${angka(konteks.stat.byteTampil)} <= ${angka(BATAS_BYTE_TAMPIL)}, terpotongByte=${konteks.stat.terpotongByte} (12 berkas @ 1 MiB diumpankan)`);
cek('C5 anggaran karakter ringkasan', ringkas.length <= BATAS_CHAR_RINGKASAN + 60, `panjang=${angka(ringkas.length)} char (anggaran ${angka(BATAS_CHAR_RINGKASAN)}), terpotongChar=${konteks.stat.terpotongChar}`);
{
  // 300 berkas dengan jalur panjang melampaui anggaran karakter: jalur ini
  // harus benar-benar diuji, bukan diasumsikan.
  const panjang = Array.from({ length: BATAS_BERKAS_TAMPIL }, (_, i) => ({
    rel: `src/modul-dengan-nama-panjang/berkas-dengan-nama-panjang-${String(i).padStart(3, '0')}.ts`,
    ukuran: 100,
    mtimeMs: 1_700_000_000_000,
  }));
  const k = bangunKonteksRepo({ akar: '/tmp/x', berkas: panjang });
  cek(
    'C6 pemotongan anggaran karakter ringkasan',
    k.ringkasan.length <= BATAS_CHAR_RINGKASAN + 60 && k.stat.terpotongChar === true && k.ringkasan.includes('summary cut at'),
    `${angka(k.ringkasan.length)} char dari ${angka(BATAS_CHAR_RINGKASAN)} (terpotongChar=${k.stat.terpotongChar}, ${k.berkas.length} berkas)`,
  );
}
{
  const lagi = bangunKonteksRepo({ akar: TIRUAN, berkas: berkasTiruan, gitignore: GITIGNORE_TIRUAN });
  cek('C7 deterministik (dua kali jalan identik)', lagi.ringkasan === ringkas && lagi.berkas.length === konteks.berkas.length, `${angka(ringkas.length)} char, ${konteks.berkas.length} berkas - identik`);
}
{
  const besar = Array.from({ length: BATAS_PINDAI_BERKAS + 1000 }, (_, i) => ({ rel: `src/p${i}.ts`, ukuran: 10, mtimeMs: 1 }));
  const k2 = bangunKonteksRepo({ akar: '/tmp/x', berkas: besar });
  cek('C8 batas pindai 5.000 berlaku', k2.stat.dipindai === BATAS_PINDAI_BERKAS && k2.stat.terpotongPindai === true, `diumpankan ${angka(besar.length)} entri, dipindai=${angka(k2.stat.dipindai)}, terpotongPindai=${k2.stat.terpotongPindai}`);
}
{
  const k3 = bangunKonteksRepo({ akar: '/tmp/x', berkas: [], gitignore: [] });
  cek('C9 repo kosong tetap melaporkan akar', k3.ringkasan.includes('/tmp/x') && k3.berkas.length === 0, `ringkasan ${angka(k3.ringkasan.length)} char, 0 berkas`);
}
{
  const a = susunAturanGitignore([{ base: '', isi: 'a/**\nb/[abc].txt\n!b/c.txt\n' }]);
  const hasil = (rel) => diabaikanOlehGitignore(a, rel);
  cek('C10 glob `**`, kelas `[abc]`, dan negasi', hasil('a/x/y.js') && hasil('b/a.txt') && !hasil('b/c.txt') && !hasil('b/z.txt'), 'a/** ✓, b/[abc].txt ✓, !b/c.txt ✓, b/z.txt tidak cocok ✓');
}
cek('C11 label bahasa terbaca', bahasaDariJalur('src/main.ts') === 'TypeScript' && bahasaDariJalur('Cargo.toml') === 'TOML (Rust manifest)' && bahasaDariJalur('src/x.zzz') === 'Lainnya (.zzz)', `main.ts=${bahasaDariJalur('src/main.ts')}, Cargo.toml=${bahasaDariJalur('Cargo.toml')}, x.zzz=${bahasaDariJalur('src/x.zzz')}`);
cek('C12 penanda bahasa + folder bawaan diekspor', Array.isArray(ABAIKAN_SEGMEN) && ABAIKAN_SEGMEN.includes('node_modules'), `ABAIKAN_SEGMEN=${ABAIKAN_SEGMEN.length} segmen; penanda terdeteksi: ${konteks.penanda.join(', ') || '(tidak ada)'}`);

console.log('\nD. tanpa jaringan');
{
  const identJaringan = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'node:http', 'node:net', 'node:dns', 'node:tls', 'require("http', "from 'http"];
  const nemu = identJaringan.filter((s) => teksBundel.includes(s));
  cek('D1 bundel tidak memuat pemanggil jaringan', nemu.length === 0, `${identJaringan.length} penanda diperiksa, cocok: ${nemu.length ? nemu.join(', ') : 'tidak ada'}`);
}
{
  const sumber = readFileSync(path.join(AKAR, 'src', 'lib', 'konteksRepo.ts'), 'utf8');
  const impor = [...sumber.matchAll(/^\s*import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
  cek('D2 satu-satunya impor relatif', impor.length > 0 && impor.every((i) => i.startsWith('.')), `impor: ${impor.join(', ')}`);
}
cek('D3 global jaringan dipatch sebelum modul dimuat', patchAktif.length >= 5, `patch aktif: ${patchAktif.join(', ')}`);
cek('D4 tidak ada satu pun panggilan jaringan', dipanggilJaringan.length === 0, `panggilan tertangkap: ${dipanggilJaringan.length}${dipanggilJaringan.length ? ': ' + dipanggilJaringan.join(', ') : ' (seluruh pipa + import modul dijalankan dengan jaringan dimatikan)'}`);

console.log('\nE. jembatan Tauri `pindaiKonteksRepo()` (dua tahap: saring dulu, stat kemudian)');
const jalurDilihat = [];
const perintahTiruan = (akar) => ({
  async listWorkspaceFiles(limit = 5000) {
    // Seperti `commands.listWorkspaceFiles`: QuickFile membawa path ABSOLUT + rel + name.
    return daftarTiruan(akar, limit).map((b) => ({
      rel: b.rel,
      name: path.basename(b.rel),
      path: path.join(akar, ...b.rel.split('/')).split(GARIS_MIRING).join('/'),
    }));
  },
  async fsRead(p) {
    jalurDilihat.push(p);
    // Seperti `commands.fsRead`: mengembalikan ReadResult, bukan string.
    return { content: readFileSync(p, 'utf8'), detectedEncoding: 'utf8', lineEnding: 'lf', readOnly: false, bytes: 0, note: '' };
  },
  async fsStat(p) {
    jalurDilihat.push(p);
    const st = statSync(p);
    return { size: st.size, isDir: st.isDirectory(), mtime: Math.trunc(st.mtimeMs) };
  },
});
{
  const { konteks: k, peringatan } = await pindaiKonteksRepo(TIRUAN, perintahTiruan(TIRUAN), {});
  const rel = k.berkas.map((b) => b.rel);
  const main = k.berkas.find((b) => b.rel === 'src/main.ts');
  const nyata = statSync(path.join(TIRUAN, 'src', 'main.ts'));
  cek('E1 daftar dari Tauri tiruan terpakai', k.berkas.length === konteks.berkas.length, `${k.berkas.length} berkas (langsung ${konteks.berkas.length})`);
  cek('E2 ukuran + mtime terisi dari fs_stat', !!main && main.ukuran === nyata.size && main.mtimeMs === Math.trunc(nyata.mtimeMs), `src/main.ts ukuran=${main?.ukuran} (disk ${nyata.size}), mtime=${main?.mtimeMs}`);
  cek('E3 .gitignore bersarang ikut terbaca', !rel.includes('web/app.min.js') && rel.includes('web/app.js'), `web/app.min.js=${rel.includes('web/app.min.js')}, web/app.js=${rel.includes('web/app.js')}`);
  cek('E4 rahasia juga ditolak di jalur Tauri', RAHASIA.every((r) => !rel.includes(r)), `${RAHASIA.length} berkas rahasia, bocor ${RAHASIA.filter((r) => rel.includes(r)).length}`);
  cek('E5 tipe keluaran + peringatan', typeof k.ringkasan === 'string' && Array.isArray(peringatan) && typeof k.stat.tampil === 'number', `peringatan=${peringatan.length}, tampil=${k.stat.tampil}`);
  cek(
    'E6 jalur ABSOLUT yang diteruskan ke Rust',
    jalurDilihat.length > 0 && jalurDilihat.every((p) => path.isAbsolute(p) && p.split(GARIS_MIRING).join('/').startsWith(TIRUAN.split(GARIS_MIRING).join('/'))),
    `${jalurDilihat.length} panggilan fsRead/fsStat, contoh: ${jalurDilihat[0] ?? '(tidak ada)'}`,
  );
  cek('E7 ringkasan memuat ukuran terbaca', /KB|B \|/.test(k.ringkasan) && k.ringkasan.includes('src/main.ts'), /src\/main\.ts[^\n]*/.exec(k.ringkasan)?.[0] ?? '(tidak ketemu)');
}
{
  const { konteks: k, peringatan } = await pindaiKonteksRepo(TIRUAN, perintahTiruan(TIRUAN), { batasStat: 3 });
  const tanpaUkuran = k.berkas.filter((b) => b.ukuran === -1).length;
  cek('E8 batas jumlah stat dihormati', tanpaUkuran > 0 && peringatan.some((p) => p.includes('hanya 3 berkas')), `batasStat=3: ${tanpaUkuran} berkas dilaporkan tanpa ukuran, peringatan=${peringatan.length}`);
}
{
  const rusak = {
    ...perintahTiruan(TIRUAN),
    async listWorkspaceFiles() {
      throw new Error('workspace tidak ada');
    },
  };
  const { konteks: k, peringatan } = await pindaiKonteksRepo(TIRUAN, rusak, {});
  cek('E9 kegagalan sumber dilaporkan, tidak dilempar', k.berkas.length === 0 && peringatan.length === 1 && peringatan[0].includes('listWorkspaceFiles gagal'), peringatan[0] ?? '(kosong)');
}

/* ------------------------------------------------------------------ */
/* Laporan akhir                                                       */
/* ------------------------------------------------------------------ */

const konstanta = [
  ['BATAS_PINDAI_BERKAS', BATAS_PINDAI_BERKAS, 'berkas yang diterima dari sumber'],
  ['BATAS_BERKAS_TAMPIL', BATAS_BERKAS_TAMPIL, 'berkas di ringkasan'],
  ['BATAS_BYTE_TAMPIL', BATAS_BYTE_TAMPIL, 'anggaran byte korpus yang ditampilkan'],
  ['BATAS_UKURAN_BERKAS', BATAS_UKURAN_BERKAS, 'ambang satu berkas (di atas ini dibuang)'],
  ['BATAS_CHAR_RINGKASAN', BATAS_CHAR_RINGKASAN, 'karakter ringkasan'],
  ['BATAS_GITIGNORE_BYTE', M.BATAS_GITIGNORE_BYTE, 'batas baca .gitignore'],
  ['POLA_RAHASIA_EFEKTIF', POLA_RAHASIA_EFEKTIF.length, 'pola blokir rahasia (nama berkas)'],
  ['ABAIKAN_SEGMEN', ABAIKAN_SEGMEN.length, 'segmen folder yang selalu dibuang'],
];

console.log('\nANGKA (diekspor modul, bukan diserahkan ke model)');
for (const [nama, nilai, ket] of konstanta) console.log(`  ${nama.padEnd(24)} = ${String(angka(nilai)).padStart(12)}   ${ket}`);

console.log('\nHITUNGAN pada pohon tiruan');
const s = konteks.stat;
console.log(`  berkas diperiksa       ${angka(s.dipindai)}`);
console.log(`  tampil                 ${angka(s.tampil)}${s.terpotongJumlah ? ` (dipotong di ${BATAS_BERKAS_TAMPIL})` : ''}`);
console.log(`  diblokir rahasia       ${angka(s.diblokirRahasia)}  ${JSON.stringify(s.blokirPerJenis)}`);
console.log(`  diabaikan .gitignore   ${angka(s.diabaikanGitignore)}`);
console.log(`  diabaikan bawaan       ${angka(s.diabaikanStruktur)}`);
console.log(`  dilewati > ${angka(BATAS_UKURAN_BERKAS)} B   ${angka(s.dilewatiBesar)}`);
console.log(`  byte tampil            ${angka(s.byteTampil)}${s.terpotongByte ? ` (anggaran ${angka(BATAS_BYTE_TAMPIL)})` : ''}`);
console.log(`  bahasa                 ${konteks.bahasa.map((b) => `${b.bahasa}=${b.berkas}`).join(' ')}`);
console.log(`  penanda                ${konteks.penanda.join(', ') || '(tidak ada)'}`);
console.log(`  struktur               ${konteks.struktur.length} folder`);
console.log(`  ringkasan              ${angka(konteks.ringkasan.length)} char`);

const barisRingkas = konteks.ringkasan.split('\n');
const batasCetak = SIMPAN ? barisRingkas.length : 26;
console.log(`\nRINGKASAN YANG DIBERIKAN KE MODEL (${barisRingkas.length} baris, cetak ${Math.min(batasCetak, barisRingkas.length)}${SIMPAN ? '' : '; --simpan untuk penuh'})`);
console.log('---8<---');
for (const b of barisRingkas.slice(0, batasCetak)) console.log(b);
if (barisRingkas.length > batasCetak) console.log(`… (+${barisRingkas.length - batasCetak} baris)`);
console.log('---8<---');

try {
  rmSync(TIRUAN, { recursive: true, force: true });
  console.log(`\npohon tiruan dibersihkan: ${TIRUAN}`);
} catch (e) {
  console.log(`\npohon tiruan gagal dibersihkan (${TIRUAN}): ${e.message}`);
}

console.log(`\nHASIL: ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) console.log(`  gagal: ${gagal.join(', ')}`);
process.exit(gagal.length ? 1 : 0);
