/*
 * uji-konteks-repo-adv.mjs - UJI ADVERSARIAL untuk `src/lib/konteksRepo.ts`.
 *
 * Beda dari `scripts/cek-konteks-repo.mjs` (gate resmi, 43 kasus, semua hijau):
 * gate itu menguji JANJI yang sudah ditulis di modul. Skrip ini menyerang
 * TEPI-TEPI yang belum pernah diuji: jalur yang melar keluar akar, nama berkas
 * yang menyamar jadi rahasia, injeksi baris ke dalam format ringkasan, folder
 * repo yang kebetulan bernama seperti folder sistem, dan urutan pemotongan
 * laporan saat anggaran karakter habis.
 *
 * Cara kerja: modul ASLINYA di-bundle lewat esbuild (satu entri saja:
 * `src/lib/konteksRepo.ts`, yang ikut menarik `./agentGuard`), hasilnya
 * diimpor apa adanya - tidak ada salinan logika. Bundle + pohon uji ditulis di
 * folder sementara DI LUAR repo, lalu dihapus. Tidak ada berkas repo yang
 * disentuh.
 *
 * Jalan:
 *   node scripts/uji-konteks-repo-adv.mjs                    # ketat: celah = GAGAL, exit != 0
 *   node scripts/uji-konteks-repo-adv.mjs --celah-diketahui   # celah dilaporkan, exit 0 kalau tidak ada regresi
 *
 * Kasus yang gagal dan sudah diketahui ADA (celah nyata yang belum ditambal)
 * tidak disembunyikan: ia dicetak sebagai CELAH dan dihitung, dan usulan
 * tambalannya ada di `docs/USULAN-KONTEKS-REPO-CELAH.md`. Skrip ini TIDAK
 * menambal modulnya - itu milik lane lain.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR_REPO = path.resolve(import.meta.dirname, '..');
const TOLERAN = process.argv.includes('--celah-diketahui');
const TMP = process.env.TMPDIR || process.env.TEMP || os.tmpdir();
const SEP = String.fromCharCode(92); // backslash, ditulis begini supaya berkas ini tidak bingung
const NUL = String.fromCharCode(0);

/* ------------------------------------------------------------------ */
/* 0. Patch jaringan SEBELUM modul dimuat (bukti tanpa jaringan)       */
/* ------------------------------------------------------------------ */

let panggilanJaringan = 0;
const patchAktif = [];
function tambal(nama, obj, kunci) {
  try {
    const asli = obj[kunci];
    obj[kunci] = function dilarang(..._a) {
      panggilanJaringan += 1;
      throw new Error(`jaringan dipanggil lewat ${nama} - uji ini melarangnya`);
    };
    void asli;
    patchAktif.push(nama);
  } catch {
    /* properti terkunci di versi node ini - patch lain yang menahan */
  }
}
tambal('globalThis.fetch', globalThis, 'fetch');
tambal('globalThis.XMLHttpRequest', globalThis, 'XMLHttpRequest');
tambal('globalThis.WebSocket', globalThis, 'WebSocket');

/* ------------------------------------------------------------------ */
/* 1. Laporan                                                          */
/* ------------------------------------------------------------------ */

let lulus = 0;
const gagal = [];
const celah = [];

function cek(nama, benar, detail = '', opsi = {}) {
  const diketahui = opsi.diketahui === true;
  if (benar) {
    lulus += 1;
    console.log(`  ok    ${nama.padEnd(52)} ${detail}`);
    return;
  }
  if (diketahui) {
    celah.push(nama);
    console.log(`  CELAH ${nama.padEnd(52)} ${detail}`);
    return;
  }
  gagal.push(nama);
  console.log(`  GAGAL ${nama.padEnd(52)} ${detail}`);
}
const angka = (n) => new Intl.NumberFormat('id-ID').format(n);

/* ------------------------------------------------------------------ */
/* 2. Bundle modul asli (satu entri) + impor                           */
/* ------------------------------------------------------------------ */

const KERJA = mkdtempSync(path.join(TMP, 'uji-konteks-repo-adv-'));
if (path.resolve(KERJA).toLowerCase().startsWith(path.resolve(AKAR_REPO).toLowerCase())) {
  console.error(`FATAL: folder kerja berada DI DALAM repo (${KERJA}) - aturan sesi melarangnya.`);
  process.exit(2);
}
process.on('exit', () => {
  try {
    rmSync(KERJA, { recursive: true, force: true });
  } catch {
    /* biarkan - folder sementara */
  }
});

function shimEsbuild() {
  const js = path.join(AKAR_REPO, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(js)) return { mode: 'node', jalan: js };
  for (const k of [
    path.join(AKAR_REPO, 'node_modules', '.bin', 'esbuild.cmd'),
    path.join(AKAR_REPO, 'node_modules', '.bin', 'esbuild'),
  ]) {
    if (existsSync(k)) return { mode: 'shell', jalan: k };
  }
  throw new Error('esbuild tidak ditemukan di node_modules - uji ini butuh esbuild');
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
    `--outfile=${keluarNama.split(SEP).join('/')}`,
  ];
  if (mode === 'node') execFileSync(process.execPath, [jalan, ...arg], { cwd: AKAR_REPO, encoding: 'utf8' });
  else execFileSync(jalan, arg, { cwd: AKAR_REPO, encoding: 'utf8', shell: true });
  return keluarNama;
}

const berkasBundel = bundel('src/lib/konteksRepo.ts');
const teksBundel = readFileSync(berkasBundel, 'utf8');
const M = await import(pathToFileURL(berkasBundel).href);

/* Patch prototipe modul jaringan setelah impor modul (tidak dipakai modul). */
async function tambalPrototipe(paket, kelas, metode) {
  try {
    const m = await import(`node:${paket}`);
    const K = m[kelas];
    const asli = K?.prototype?.[metode];
    K.prototype[metode] = function dilarang(..._a) {
      panggilanJaringan += 1;
      throw new Error(`jaringan dipanggil lewat ${paket}.${kelas}.${metode} - uji ini melarangnya`);
    };
    void asli;
    patchAktif.push(`${paket}.${kelas}.prototype.${metode}`);
  } catch {
    /* tidak ada di runtime ini */
  }
}
await tambalPrototipe('net', 'Socket', 'connect');
await tambalPrototipe('http', 'Agent', 'createConnection');
await tambalPrototipe('https', 'Agent', 'createConnection');

console.log('UJI ADVERSARIAL KONTEKS REPO (ZEPH-KONTEKS-REPO)');
console.log(`modul     : src/lib/konteksRepo.ts (bundle ${angka(readFileSync(berkasBundel, 'utf8').length)} byte)`);
console.log(`folder uji: ${KERJA}`);
console.log('');

const AKAR = 'D:/RepoSaya';
const bangun = (berkas, gitignore) => M.bangunKonteksRepo({ akar: AKAR, berkas, gitignore });
const berkas = (rel, ukuran = 100, mtimeMs = 1_700_000_000_000) => ({ rel, ukuran, mtimeMs });

/* ------------------------------------------------------------------ */
/* A. Rahasia tidak bocor walau diminta eksplisit (a)                  */
/* ------------------------------------------------------------------ */

console.log('A. rahasia: diminta eksplisit, tetap tidak muncul');
const RAHASIA = [
  '.env',
  '.env.local',
  '.env.production',
  'id_rsa',
  'id_rsa.bak',
  'keys/server.pem',
  'keys/client.key',
  'config/credentials.json',
  'secrets.yaml',
  'secrets.txt',
  '.ssh/id_rsa',
  '.aws/credentials',
  '.gnupg/pubring.kbx',
  'db.kdbx',
  'deploy.ppk',
  'infra/state.tfstate',
  'cert.p12',
  '.pgpass',
  '.npmrc',
  'service-account.json',
];
const kA = bangun(RAHASIA.map((rel) => berkas(rel)));

{
  const bocor = RAHASIA.filter((rel) => kA.ringkasan.includes(rel) || kA.ringkasan.includes(path.posix.basename(rel)));
  cek(
    'A1 nama rahasia tidak muncul di ringkasan',
    bocor.length === 0,
    `${RAHASIA.length} berkas rahasia diminta, bocor ${bocor.length}${bocor.length ? `: ${bocor.join(', ')}` : ''}`,
  );
}
{
  const seluruh = JSON.stringify(kA);
  const bocor = RAHASIA.filter((rel) => seluruh.includes(path.posix.basename(rel)));
  cek('A2 tidak bocor juga di SELURUH objek konteks', bocor.length === 0, `bocor ${bocor.length} pada JSON konteks`);
}
{
  const jumlahJenis = Object.values(kA.stat.blokirPerJenis).reduce((n, x) => n + x, 0);
  cek(
    'A3 hitungan blokir cocok + dirinci per jenis',
    kA.stat.tampil === 0 && kA.stat.diblokirRahasia === RAHASIA.length && jumlahJenis === kA.stat.diblokirRahasia,
    `tampil=${kA.stat.tampil} diblokir=${kA.stat.diblokirRahasia}/${RAHASIA.length} rincian=${JSON.stringify(kA.stat.blokirPerJenis)}`,
  );
}
{
  const alasan = RAHASIA.map((rel) => M.alasanBlokirRahasia(rel, AKAR));
  const ada = alasan.filter((a) => a !== null).length;
  const jenis = [...new Set(alasan.filter(Boolean))];
  cek(
    'A4 alasan blokir dilaporkan per berkas',
    ada === RAHASIA.length && jenis.every((j) => ['rahasia-nama', 'rahasia-folder', 'jalur-terlarang'].includes(j)),
    `${ada}/${RAHASIA.length} punya alasan, jenis=${jenis.join('/')} (.gnupg -> ${M.alasanBlokirRahasia('.gnupg/pubring.kbx', AKAR)})`,
  );
}
{
  const menyamar = ['.env.', '.env::$DATA', 'server.PEM', 'client.key:stream', 'config/credentials.json.', '.ENV', 'id_rsa.bak'];
  const lolos = menyamar.filter((rel) => M.alasanBlokirRahasia(rel, AKAR) === null);
  const k = bangun(menyamar.map((rel) => berkas(rel)));
  cek(
    'A5 bentuk menyamar (titik ekor, :stream, HURUF BESAR) tetap ditolak',
    lolos.length === 0 && k.stat.tampil === 0,
    `${menyamar.length} bentuk diuji, lolos ${lolos.length}, tampil=${k.stat.tampil}`,
  );
}
{
  const NILAI_A = 'sk-' + 'A'.repeat(24);
  const NILAI_B = 'ghp_' + 'b'.repeat(24);
  const gi = [{ base: '', isi: `# kunci contoh ${NILAI_A}\nrahasia-internal/\n${NILAI_B}\n` }];
  const k = bangun([berkas('src/a.ts')], gi);
  const bocor = [NILAI_A, NILAI_B].filter((v) => JSON.stringify(k).includes(v));
  cek(
    'A6 nilai rahasia di isi .gitignore tidak ikut ke keluaran',
    bocor.length === 0,
    `2 nilai ditanam di .gitignore, bocor ${bocor.length}; berkas lain tetap tampil=${k.stat.tampil}`,
  );
}
{
  const k = bangun([berkas('.env.example')]);
  cek(
    'A7 (pin) .env.example juga ditolak - sengaja konservatif',
    k.stat.tampil === 0,
    `tampil=${k.stat.tampil} alasan=${M.alasanBlokirRahasia('.env.example', AKAR)} - templat tanpa rahasia pun disembunyikan`,
  );
}

/* ------------------------------------------------------------------ */
/* B. Jalur melar keluar akar (b) - inti uji adversarial               */
/* ------------------------------------------------------------------ */

console.log('\nB. jalur melar keluar akar: WAJIB ditolak');
const MELAR = [
  ['B1', '../rahasia.ts', 'naik satu tingkat (posix)'],
  ['B2', `..${SEP}rahasia.ts`, 'naik satu tingkat (pemisah balik)'],
  ['B3', 'a/../../b.ts', 'campuran naik beberapa tingkat'],
  ['B4', 'C:/Windows/win.ini', 'jalur absolut Windows di luar akar'],
  ['B5', 'D:/Luar/berkas.ts', 'jalur absolut lain (akar repo = D:/RepoSaya)'],
  ['B6', '%2e%2e/naik.ts', 'bentuk ter-encode, tidak didekode'],
  ['B7', `${SEP}${SEP}server${SEP}share${SEP}x.ts`, 'UNC / berbagi jaringan'],
  ['B8', '..', 'naik satu tingkat tanpa nama berkas'],
  ['B9', './../x.ts', 'awalan ./ lalu naik'],
];
for (const [id, rel, arti] of MELAR) {
  const k = bangun([berkas(rel)]);
  const muncul = k.berkas.length > 0;
  cek(
    `${id} ${JSON.stringify(rel).slice(0, 26)} ditolak`,
    !muncul,
    `${arti} -> alasan=${M.alasanBlokirRahasia(rel, AKAR)} tampil=${muncul ? JSON.stringify(k.berkas[0].rel) : 'tidak'}`,
    { diketahui: true },
  );
}
{
  const k = bangun([berkas('/etc/hosts')]);
  cek(
    'B10 /etc/hosts ditolak',
    k.berkas.length === 0,
    `alasan=${M.alasanBlokirRahasia('/etc/hosts', AKAR)} (ternyata lewat segmen "etc", bukan lewat aturan akar)`,
  );
}
{
  const milikRepo = ['etc/service.ts', 'sys/kernel.ts', 'proc/reader.ts', 'var/db/x.ts', 'docs/etc/panduan.md'];
  const k = bangun(milikRepo.map((rel) => berkas(rel)));
  cek(
    'B11 folder repo bernama etc/sys/proc tidak dimakan',
    k.stat.tampil === milikRepo.length,
    `tampil=${k.stat.tampil}/${milikRepo.length} - ${JSON.stringify(k.stat.blokirPerJenis)} (berkas repo sendiri ikut disembunyikan)`,
    { diketahui: true },
  );
}

{
  const tercatat = [];
  const cmd = {
    listWorkspaceFiles: async () => [
      { path: `${AKAR}/../luar-rahasia/bocor.ts`, rel: '../luar-rahasia/bocor.ts' },
      { path: 'C:/Windows/win.ini', rel: 'C:/Windows/win.ini' },
      { path: `${AKAR}/src/ok.ts`, rel: 'src/ok.ts' },
    ],
    fsRead: async () => ({ content: '' }),
    fsStat: async (p) => {
      tercatat.push(String(p));
      return { size: 10, isDir: false, mtime: 1_700_000_000_000 };
    },
  };
  const h = await M.pindaiKonteksRepo(AKAR, cmd);
  const residu = (p) => path.posix.normalize(p.replace(/\\/g, '/'));
  const luar = tercatat.filter((p) => {
    const q = residu(p);
    return !(q === AKAR || q.startsWith(`${AKAR}/`));
  });
  cek(
    'B12 jalur melar tidak sampai di-stat di luar akar',
    luar.length === 0,
    `${tercatat.length} stat, terbukti keluar akar: ${luar.length}${luar.length ? ` -> ${luar.join(' , ')}` : ''} (tampil=${h.konteks.stat.tampil}; "${'../luar-rahasia/bocor.ts'}" ikut dikirim sebagai jalur relatif, jadi resolve-nya di sisi Rust)`,
    { diketahui: true },
  );
}

/* ------------------------------------------------------------------ */
/* C. Biner, non-utf8, injeksi format (c)                              */
/* ------------------------------------------------------------------ */

console.log('\nC. biner/non-utf8/injeksi format');
const BINER = ['img/logo.png', 'app.exe', 'lib/a.dll', 'data/x.bin', 'arsip.zip', 'video/tut.mp4'];
const kC = bangun(BINER.map((rel) => berkas(rel)));
cek(
  'C1 ekstensi biner tidak mematahkan keluaran',
  kC.berkas.length === BINER.length && kC.berkas.every((b) => typeof b.bahasa === 'string' && b.bahasa.length > 0),
  `${kC.berkas.length} biner tercatat, label: ${kC.berkas.map((b) => b.bahasa).join(', ')}`,
);
// C2 SEMULA menuntut `kC.berkas.length === 0` (biner tidak masuk daftar), padahal
// C1 di atas menuntut masukan yang PERSIS SAMA menghasilkan 6 biner terdaftar
// dengan label bahasa. Dua tuntutan itu tidak bisa benar bersamaan, dan D4 di
// bawah justru memakai byte biner untuk memicu `terpotongByte`. Keputusan pemilik
// modul (2026-10-14): kemampuan TIDAK dikurangi - biner tetap terdaftar (C1) -
// tapi porsi byte-nya tidak lagi bisa memakan anggaran secara diam-diam:
// `stat.byteBinerTampil` dihitung dan ringkasan MENYEBUTNYA begitu biner memakai
// lebih dari separuh anggaran. Kasus ini mengunci keputusan itu, bukan
// melonggarkan pemeriksaan.
{
  const gemuk = [];
  for (let i = 0; i < 6; i += 1) gemuk.push(berkas(`aset/besar${i}.png`, 900 * 1024));
  const k = bangun([...BINER.map((rel) => berkas(rel)), ...gemuk]);
  const binerByte = k.stat.byteBinerTampil;
  cek(
    'C2 (keputusan pemilik) biner tetap terdaftar, porsi byte-nya dilaporkan',
    kC.berkas.length === BINER.length &&
      k.berkas.filter((b) => /\.(png|exe|dll|bin|zip|mp4)$/i.test(b.rel)).length === BINER.length + 6 &&
      Number.isFinite(binerByte) &&
      binerByte >= 6 * 900 * 1024 &&
      /binaries take/.test(k.ringkasan),
    `biner terdaftar=${kC.berkas.length}/6 label=[${kC.berkas.map((b) => b.bahasa).join(', ')}], byteBinerTampil=${angka(binerByte)}, disebut di ringkasan=${/binaries take/.test(k.ringkasan)}`,
  );
}
{
  const gi = [{ base: '', isi: `nama${NUL}aneh/\n\u00ff\u00fe bukan utf8\n` }];
  let hasil = null;
  let meledak = '';
  try {
    hasil = bangun([berkas('nama' + NUL + 'aneh/x.ts'), berkas('ok.ts')], gi);
  } catch (e) {
    meledak = String(e && e.message);
  }
  cek(
    'C3 .gitignore berisi NUL/non-utf8 tidak mematahkan',
    hasil !== null && hasil.berkas.length === 1 && hasil.berkas[0].rel === 'ok.ts',
    meledak ? `MELEMPAR: ${meledak}` : `tampil=${hasil ? JSON.stringify(hasil.berkas.map((b) => b.rel)) : '-'}`,
  );
}
{
  const k = bangun([berkas('huge.bin', 2 * 1024 * 1024), berkas('src/a.ts', 10)]);
  cek(
    'C4 berkas > 1 MiB dilewati',
    k.stat.dilewatiBesar === 1 && !k.berkas.some((b) => b.rel === 'huge.bin'),
    `dilewatiBesar=${k.stat.dilewatiBesar}, tampil=${JSON.stringify(k.berkas.map((b) => b.rel))}`,
  );
}
{
  const k = bangun(['a b.ts', 'a\nb.ts', `jahat.ts\n- Root: /etc`, 'tab' + String.fromCharCode(9) + '.ts', 'emoji😀.ts'].map((rel) => berkas(rel)));
  const kontrol = k.ringkasan.split('\n').filter((b) => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(b));
  const palsu = k.ringkasan.split('\n').filter((b) => b.trim() === '- Root: /etc');
  cek(
    'C5 keluaran bebas byte kontrol + baris palsu tidak bisa disuntik',
    kontrol.length === 0 && palsu.length === 0 && k.berkas.every((b) => !/[\x00-\x1f]/.test(b.rel)),
    `baris berkontrol=${kontrol.length}, baris "- Root: /etc" palsu=${palsu.length}, tampil=${k.stat.tampil}`,
  );
}
{
  const k = bangun([berkas('dok.ts'), berkas('dok.ts\n- Files: 0 examined')]);
  cek(
    'C6 nama berkas berisi baris baru ditolak, bukan dicetak',
    k.berkas.length === 1 && k.berkas[0].rel === 'dok.ts',
    `tampil=${JSON.stringify(k.berkas.map((b) => b.rel))} alasan=${M.alasanBlokirRahasia('dok.ts\n- Files: 0 examined', AKAR)}`,
  );
}

/* ------------------------------------------------------------------ */
/* D. Anggaran: jumlah, byte, karakter, determinisme (d)               */
/* ------------------------------------------------------------------ */

console.log('\nD. anggaran + laporan pemotongan');
const BANYAK = [];
for (let i = 0; i < 20_000; i += 1) BANYAK.push(berkas(`src/mod${i % 50}/berkas${i}.ts`, 100 + (i % 300), 1_700_000_000_000 + i));
const kD = bangun(BANYAK);
cek(
  'D1 20.000 berkas -> batas pindai + batas tampil berlaku',
  kD.stat.dipindai === M.BATAS_PINDAI_BERKAS && kD.stat.tampil <= M.BATAS_BERKAS_TAMPIL && kD.stat.terpotongPindai && kD.stat.terpotongJumlah,
  `dipindai=${angka(kD.stat.dipindai)} tampil=${kD.stat.tampil} terpotongPindai=${kD.stat.terpotongPindai} terpotongJumlah=${kD.stat.terpotongJumlah}`,
);
cek(
  'D2 pemotongan DISEBUT di teks yang dibaca model',
  /at most 300 files are listed/.test(kD.ringkasan) && /first 5\.000 entries/.test(kD.ringkasan),
  `panjang=${kD.ringkasan.length} char, terpotongChar=${kD.stat.terpotongChar} - baris "- Truncated:" ada di BELAKANG daftar, jadi ikut dipotong`,
  { diketahui: true },
);
{
  const gemuk = [];
  for (let i = 0; i < 20; i += 1) gemuk.push(berkas(`data/b${String(i).padStart(2, '0')}.dat`, 700 * 1024));
  const k = bangun(gemuk);
  cek(
    'D3 anggaran byte 8 MiB ditegakkan + disebut',
    k.stat.byteTampil <= M.BATAS_BYTE_TAMPIL && k.stat.terpotongByte && /capped at 8\.0 MB/.test(k.ringkasan),
    `byteTampil=${angka(k.stat.byteTampil)} <= ${angka(M.BATAS_BYTE_TAMPIL)}, tampil=${k.stat.tampil}/20, disebut=${/capped at 8\.0 MB/.test(k.ringkasan)}`,
  );
}
{
  const campur = [];
  for (let i = 0; i < 150; i += 1) campur.push(berkas(`src/kode${i}.ts`, 400));
  for (let i = 0; i < 150; i += 1) campur.push(berkas(`aset/foto${i}.png`, 900 * 1024));
  const k = bangun(campur);
  const ts = k.berkas.filter((b) => b.rel.endsWith('.ts')).length;
  cek(
    'D4 korpus biner besar tidak menyingkirkan kode',
    k.stat.byteTampil <= M.BATAS_BYTE_TAMPIL && k.stat.terpotongByte && ts === 150,
    `byteTampil=${angka(k.stat.byteTampil)} (anggaran ${angka(M.BATAS_BYTE_TAMPIL)}), berkas .ts tampil=${ts}/150, .png masuk=${k.berkas.filter((b) => b.rel.endsWith('.png')).length}`,
  );
}
{
  const panjang = [kD.ringkasan.length, bangun([berkas('a.json', 5)]).ringkasan.length];
  const gemuk = [];
  for (let i = 0; i < 400; i += 1) gemuk.push(berkas(`d/f${i}.json`, 900));
  panjang.push(bangun(gemuk).ringkasan.length);
  const maks = Math.max(...panjang);
  cek(
    'D5 anggaran karakter 6.000 tidak dilampaui',
    panjang.every((p) => p <= M.BATAS_CHAR_RINGKASAN),
    `panjang=${panjang.join(', ')} maks=${angka(maks)} vs batas ${angka(M.BATAS_CHAR_RINGKASAN)} - penanda potong ditambahkan SETELAH pemotongan, jadi totalnya melebihi batas yang modul janjikan sendiri`,
    { diketahui: true },
  );
}
{
  const a = JSON.stringify(bangun(BANYAK));
  const b = JSON.stringify(bangun(BANYAK));
  cek('D6 determinisme: 2 jalankan byte-identik', a === b, `${angka(a.length)} byte, identik=${a === b}`);
}
{
  const masukan = [berkas('src/a.ts', 12), berkas('README.md', 4), berkas('x/y/z.zzz', 0), berkas('img/p.png', 3)];
  const gi = [{ base: '', isi: 'x/\n!x/keep.ts\n' }];
  const jalur = [JSON.stringify(bangun(masukan, gi)), JSON.stringify(bangun(masukan, gi))];
  cek('D7 determinisme pada masukan campuran + gitignore', jalur[0] === jalur[1], `identik=${jalur[0] === jalur[1]}, ${angka(jalur[0].length)} byte`);
}

/* ------------------------------------------------------------------ */
/* E. Repo kosong / masukan rusak (f)                                  */
/* ------------------------------------------------------------------ */

console.log('\nE. repo kosong, berkas tidak ada, masukan rusak');
{
  const h = M.bangunKonteksRepo({ akar: '', berkas: [] });
  cek(
    'E1 repo kosong tetap melaporkan akar apa adanya',
    h.stat.tampil === 0 && h.ringkasan.includes('(unknown)') && h.ringkasan.includes('none survived'),
    `panjang=${h.ringkasan.length} char, akar="${h.akar}"`,
  );
}
{
  const k = bangun([berkas('src/ada.ts'), berkas('README.md')]);
  cek(
    'E2 berkas yang diminta tapi tidak ada: tidak muncul, tidak mematahkan',
    !k.ringkasan.includes('src/tidak-ada.ts') && k.stat.dipindai === 2 && k.stat.tampil === 2,
    `dipindai=${k.stat.dipindai} tampil=${k.stat.tampil} - modul tidak punya konsep "berkas terbuka", jadi yang diuji: berkas asing tidak pernah dikarang`,
  );
}
{
  let h = null;
  let meledak = '';
  try {
    h = bangun([null, {}, berkas(''), berkas('kosong/'), berkas('src/y.ts', NaN, -5)]);
  } catch (e) {
    meledak = String(e && e.message);
  }
  const rel = h ? h.berkas.map((b) => b.rel) : [];
  cek(
    'E3 masukan rusak (null/{}/rel kosong) tidak mematahkan',
    h !== null && h.stat.tampil === 2 && rel.includes('src/y.ts') && rel.includes('kosong') && h.ringkasan.includes('src/y.ts | TypeScript | ? | ?'),
    meledak ? `MELEMPAR: ${meledak}` : `tampil=${JSON.stringify(rel)} - "kosong/" dinormalkan jadi "kosong" (tidak dikarang), ukuran NaN ditulis "?"; null/{} dibuang`,
  );
}
{
  const h = M.bangunKonteksRepo({ akar: '', berkas: [berkas('src/a.ts')] });
  cek(
    'E4 akar kosong + berkas ada: tetap jalan, tanpa "undefined"',
    h.stat.tampil === 1 && !/undefined|\[object Object\]/.test(h.ringkasan) && h.ringkasan.includes('(unknown)'),
    `akar="${h.akar}" tampil=${h.stat.tampil}`,
  );
}
{
  let h = null;
  let meledak = '';
  try {
    h = M.bangunKonteksRepo({ akar: AKAR });
  } catch (e) {
    meledak = String(e && e.message);
  }
  cek(
    'E5 berkas/gitignore tidak diberikan sama sekali',
    h !== null && h.stat.tampil === 0 && h.stat.dipindai === 0,
    meledak ? `MELEMPAR: ${meledak}` : `tampil=${h ? h.stat.tampil : '-'} - parameter opsional benar-benar opsional`,
  );
}
{
  const hancur = {
    listWorkspaceFiles: async () => {
      throw new Error('workspace tidak ada');
    },
    fsRead: async () => {
      throw new Error('gagal baca');
    },
    fsStat: async () => {
      throw new Error('gagal stat');
    },
  };
  let h = null;
  let meledak = '';
  try {
    h = await M.pindaiKonteksRepo(AKAR, hancur);
  } catch (e) {
    meledak = String(e && e.message);
  }
  cek(
    'E6 sumber gagal: peringatan, bukan exception',
    h !== null && h.peringatan.length === 1 && typeof h.konteks.ringkasan === 'string',
    meledak ? `MELEMPAR: ${meledak}` : `peringatan=${JSON.stringify(h ? h.peringatan : [])}`,
  );
}
{
  const kotor = [bangun([berkas('')], [{ base: '', isi: '' }]), bangun([null, {}]), M.bangunKonteksRepo({ akar: '', berkas: [] })];
  cek(
    'E7 tidak ada "undefined"/"NaN"/"[object Object]" di ringkasan',
    kotor.every((k) => !/undefined|NaN|\[object Object\]/.test(k.ringkasan)),
    `${kotor.length} ringkasan diperiksa`,
  );
}

/* ------------------------------------------------------------------ */
/* F. Nama berkas aneh (g)                                             */
/* ------------------------------------------------------------------ */

console.log('\nF. nama berkas aneh');
const ANEH = ['a b.ts', 'файл-Ω.ts', 'a'.repeat(300) + '.ts', 'a:b.ts', 'a*b.ts', 'emoji😀.ts', 'tanda?tanya.ts', 'a|b.ts', 'UPPER.TS', 'tanpa-ekstensi'];
{
  let k = null;
  let meledak = '';
  try {
    k = bangun(ANEH.map((rel) => berkas(rel)));
  } catch (e) {
    meledak = String(e && e.message);
  }
  const kembali = k ? new Set(k.berkas.map((b) => b.rel)) : new Set();
  const hilang = ANEH.filter((rel) => !kembali.has(rel));
  cek(
    'F1 nama aneh: tidak mematahkan, rel kembali persis',
    k !== null && hilang.length === 0 && k.berkas.every((b) => b.bahasa.length > 0),
    meledak ? `MELEMPAR: ${meledak}` : `${ANEH.length} nama, hilang/diubah ${hilang.length}, tampil=${k ? k.stat.tampil : '-'}`,
  );
}
{
  const k = bangun(ANEH.map((rel) => berkas(rel)));
  const barisBerkas = k.ringkasan.split('\n').slice(k.ringkasan.split('\n').findIndex((l) => l.startsWith('- Files (path |')) + 1);
  const pathDiBaris = barisBerkas.filter((l) => l.startsWith('  ') && l.includes(' | ')).map((l) => l.slice(2, l.indexOf(' | ')));
  const asing = pathDiBaris.filter((p) => !ANEH.includes(p));
  cek(
    'F2 tiap baris daftar memakai rel masukan apa adanya',
    asing.length === 0 && pathDiBaris.length === k.stat.tampil,
    `${pathDiBaris.length} baris diperiksa, path asing ${asing.length}${asing.length ? `: ${asing[0].slice(0, 40)}` : ''}`,
  );
}
{
  const nama300 = 'n'.repeat(300) + '.ts';
  const k = bangun([berkas(nama300)]);
  cek(
    'F3 nama 300 karakter tidak dipotong di keluaran',
    k.ringkasan.includes(nama300),
    `panjang nama=${nama300.length}, muncul utuh=${k.ringkasan.includes(nama300)}`,
  );
}

/* ------------------------------------------------------------------ */
/* G. .gitignore: negasi + folder (h)                                  */
/* ------------------------------------------------------------------ */

console.log('\nG. .gitignore: negasi dan folder');
{
  const gi = [{ base: '', isi: 'dist/\nsampah/\n*.log\n!penting.log\npenting.ts\n!penting.ts\n' }];
  const k = bangun(
    ['dist/a.js', 'sampah/b.ts', 'debug.log', 'penting.log', 'penting.ts', 'lain.ts'].map((rel) => berkas(rel)),
    gi,
  );
  const ada = new Set(k.berkas.map((b) => b.rel));
  cek(
    'G1 folder dist/ + sampah/ dibuang, negasi !penting.* dikembalikan',
    !ada.has('dist/a.js') && !ada.has('sampah/b.ts') && !ada.has('debug.log') && ada.has('penting.log') && ada.has('penting.ts') && ada.has('lain.ts'),
    `tampil=${[...ada].join(', ')} diabaikanGitignore=${k.stat.diabaikanGitignore} diabaikanStruktur=${k.stat.diabaikanStruktur}`,
  );
}
{
  const gi = [{ base: '', isi: 'penting.ts\n!penting.ts\n' }];
  const k = bangun([berkas('penting.ts')], gi);
  cek('G2 aturan terakhir menang (urutan menentukan)', k.stat.tampil === 1, `tampil=${k.stat.tampil} - urutan ditetapkan modul, bukan urutan kedatangan`);
}
{
  const gi = [{ base: '', isi: 'sampah/\n!sampah/penting.ts\n' }];
  const k = bangun([berkas('sampah/penting.ts')], gi);
  cek(
    'G3 negasi menembus folder yang diabaikan (versi permisif, disadari)',
    k.stat.tampil === 1,
    `tampil=${k.stat.tampil} - git asli menolak ini; modul memilih salah-menampilkan daripada salah-menyembunyikan`,
  );
}
{
  const gi = [{ base: '', isi: '*.{log,tmp}\n' }];
  const k = bangun([berkas('x.log'), berkas('y.tmp')], gi);
  cek('G4 brace {a,b} tidak didukung - sama dengan git', k.stat.tampil === 2, `tampil=${k.stat.tampil} - gitignore asli juga tidak mendukung brace`);
}
{
  const gi = [{ base: '', isi: '**/generated/\nb/[abc].txt\n# komentar\n' }];
  const k = bangun([berkas('src/generated/g.ts'), berkas('generated/a.ts'), berkas('b/a.txt'), berkas('b/z.txt'), berkas('# komentar')], gi);
  const ada = k.berkas.map((b) => b.rel);
  cek(
    'G5 **/generated/ + kelas [abc] + baris komentar',
    ada.length === 2 && ada.includes('b/z.txt') && ada.includes('# komentar'),
    `tampil=${ada.join(', ')}`,
  );
}
{
  const gi = [{ base: '', isi: 'rahasia-internal/\n' }];
  const k = bangun([berkas('rahasia-internal/a.ts'), berkas('src/b.ts')], gi);
  cek(
    'G6 aturan buatan repo dihormati (nama folder repo, bukan cuma folder bawaan)',
    k.stat.tampil === 1 && k.berkas[0].rel === 'src/b.ts',
    `tampil=${JSON.stringify(k.berkas.map((b) => b.rel))} diabaikanGitignore=${k.stat.diabaikanGitignore}`,
  );
}

/* ------------------------------------------------------------------ */
/* H. Bukti tanpa jaringan (i)                                         */
/* ------------------------------------------------------------------ */

console.log('\nH. bukti tanpa jaringan');
{
  const sumber = readFileSync(path.join(AKAR_REPO, 'src', 'lib', 'konteksRepo.ts'), 'utf8').split(/\r?\n/);
  const pola = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /from\s+['"]node:https?/, /require\(\s*['"]https?['"]\s*\)/, /https?:\/\//, /\baxios\b/];
  const kena = [];
  sumber.forEach((baris, i) => {
    if (pola.some((p) => p.test(baris))) kena.push({ baris: i + 1, teks: baris.trim(), komentar: /^\s*(\*\s|\/\/|\/\*)/.test(baris) });
  });
  const aktif = kena.filter((x) => !x.komentar);
  cek(
    'H1 sumber modul tidak memuat pemanggil jaringan aktif',
    aktif.length === 0,
    aktif.length ? `AKTIF di baris ${aktif.map((x) => x.baris).join(', ')}: ${aktif[0].teks.slice(0, 60)}` : `${kena.length} sebutan, semuanya komentar (${kena.map((x) => x.baris).join(', ')})`,
  );
}
{
  const impor = [...readFileSync(path.join(AKAR_REPO, 'src', 'lib', 'konteksRepo.ts'), 'utf8').matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  const relatif = impor.filter((p) => p.startsWith('.'));
  const guard = readFileSync(path.join(AKAR_REPO, 'src', 'lib', 'agentGuard.ts'), 'utf8');
  const imporGuard = [...guard.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  cek(
    'H2 satu-satunya impor relatif ./agentGuard, dan rantainya mati di situ',
    relatif.length === 1 && relatif[0] === './agentGuard' && imporGuard.length === 0,
    `impor modul: ${impor.join(', ')} | impor agentGuard: ${imporGuard.length === 0 ? 'tidak ada' : imporGuard.join(', ')}`,
  );
}
{
  const tercatatRead = [];
  const tercatatStat = [];
  const daftar = [
    { path: `${AKAR}/src/a.ts`, rel: 'src/a.ts' },
    { path: `${AKAR}/src/b.ts`, rel: 'src/b.ts' },
    { path: `${AKAR}/.env`, rel: '.env' },
    { path: `${AKAR}/.env.local`, rel: '.env.local' },
    { path: `${AKAR}/keys/server.pem`, rel: 'keys/server.pem' },
    { path: `${AKAR}/.ssh/id_rsa`, rel: '.ssh/id_rsa' },
    { path: `${AKAR}/config/credentials.json`, rel: 'config/credentials.json' },
    { path: `${AKAR}/.gitignore`, rel: '.gitignore' },
  ];
  const cmd = {
    listWorkspaceFiles: async (limit) => daftar.slice(0, limit ?? daftar.length),
    fsRead: async (p) => {
      tercatatRead.push(String(p));
      return { content: 'node_modules/\n' };
    },
    fsStat: async (p) => {
      tercatatStat.push(String(p));
      return { size: 42, isDir: false, mtime: 1_700_000_000_000 };
    },
  };
  const h = await M.pindaiKonteksRepo(AKAR, cmd);
  const semua = [...tercatatRead, ...tercatatStat];
  // Jalur yang diperiksa di sini adalah jalur DISK (absolut). Kontrak modul
  // adalah: yang masuk ke `alasanBlokirRahasia()` selalu jalur RELATIF, dan
  // jalur absolut memang ditolak di sana (kasus B4/B5). Jadi bentuk relatifnya
  // yang dipakai untuk menilai "apakah berkas rahasia tersentuh" - kalau tidak,
  // setiap jalur absolut akan dihitung rahasia dan ujinya selalu merah.
  const relBawah = (p) => {
    const q = String(p).replace(/\\/g, '/');
    const bawah = `${AKAR}/`;
    return q.toLowerCase().startsWith(bawah.toLowerCase()) ? q.slice(bawah.length) : q;
  };
  const rahasiaTersentuh = semua.filter(
    (p) => M.alasanBlokirRahasia(relBawah(p), AKAR) !== null || path.posix.basename(relBawah(p)).startsWith('.env'),
  );
  const url = semua.filter((p) => p.includes('://'));
  cek(
    'H3 rahasia tidak pernah sampai ke jalur baca/stat Rust',
    rahasiaTersentuh.length === 0 && h.konteks.stat.tampil === 3,
    `${semua.length} panggilan (read=${tercatatRead.length}, stat=${tercatatStat.length}), tersentuh rahasia=${rahasiaTersentuh.length}, tampil=${h.konteks.stat.tampil} (a.ts, b.ts, .gitignore sendiri) - berkas rahasia tidak pernah di-stat apalagi dibaca`,
  );
  cek('H4 jalur yang diteruskan jalur disk, bukan URL', url.length === 0, `panggilan berisi "://": ${url.length}, contoh: ${semua[0]}`);
}
{
  cek(
    'H5 tidak ada satu pun panggilan jaringan saat pipa dijalankan',
    panggilanJaringan === 0,
    `patch aktif: ${patchAktif.length}, panggilan tertangkap: ${panggilanJaringan}`,
  );
}

/* ------------------------------------------------------------------ */
/* I. Keluaran tidak memuat nilai rahasia (j)                          */
/* ------------------------------------------------------------------ */

console.log('\nI. keluaran bebas nilai rahasia');
const NILAI_ASLI = ['sk-' + 'C'.repeat(24), 'ghp_' + 'd'.repeat(24), 'AKIA' + 'E'.repeat(16), 'eyJ' + 'F'.repeat(20) + '.payload.sig'];
{
  const k = bangun([
    berkas('src/app.ts', 812),
    berkas('README.md', 40),
    berkas('package.json', 22),
    berkas('docs/catatan.md', 90),
  ], [{ base: '', isi: `# ${NILAI_ASLI[0]}\n${NILAI_ASLI[1]}\n` }]);
  const pola = [/sk-[A-Za-z0-9_-]{16,}/, /ghp_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /\beyJ[A-Za-z0-9_-]{10,}\./, /xox[baprs]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const kena = pola.filter((p) => p.test(k.ringkasan));
  cek(
    'I1 ringkasan repo wajar bebas pola token',
    kena.length === 0,
    `${pola.length} pola diperiksa (sk-/ghp_/AKIA/JWT/xox/PEM), cocok: ${kena.length}`,
  );
}
{
  const k = bangun([berkas('src/a.ts')], [{ base: '', isi: `${NILAI_ASLI.join('\n')}\n` }]);
  const bocor = NILAI_ASLI.filter((v) => k.ringkasan.includes(v) || JSON.stringify(k).includes(v));
  cek('I2 nilai yang ditanam tidak muncul di ringkasan maupun konteks', bocor.length === 0, `${NILAI_ASLI.length} nilai ditanam di .gitignore, bocor ${bocor.length}`);
}
{
  const k = bangun([berkas('src/a.ts'), berkas('src/b.ts')]);
  const isiHanya = k.ringkasan.split('\n').filter((b) => /[A-Za-z]/.test(b)).filter((b) => !/^(Repository context|  |  -|- )/.test(b));
  cek(
    'I3 ringkasan hanya menyebut META (nama/ukuran/waktu), bukan isi berkas',
    !/=|console\.|import |export |function |const /.test(k.ringkasan),
    `baris non-listing=${isiHanya.length}, modul tidak pernah membaca isi berkas (hanya .gitignore)`,
  );
}
{
  const namaToken = 'ghp_' + 'f'.repeat(24) + '.ts';
  const k = bangun([berkas(namaToken)]);
  cek(
    'I4 (batas sadar) NAMA berkas apa adanya ikut tercetak',
    k.ringkasan.includes(namaToken),
    'nama dilaporkan apa adanya (hanya nama, isi tidak pernah dibaca) - bukan kebocoran nilai, tapi batas yang perlu diketahui',
  );
}

/* ------------------------------------------------------------------ */
/* Ringkasan angka + verdict                                           */
/* ------------------------------------------------------------------ */

console.log('\nANGKA (diekspor modul, bukan diserahkan ke model)');
for (const [nama, nilai] of [
  ['BATAS_PINDAI_BERKAS', M.BATAS_PINDAI_BERKAS],
  ['BATAS_BERKAS_TAMPIL', M.BATAS_BERKAS_TAMPIL],
  ['BATAS_BYTE_TAMPIL', M.BATAS_BYTE_TAMPIL],
  ['BATAS_UKURAN_BERKAS', M.BATAS_UKURAN_BERKAS],
  ['BATAS_CHAR_RINGKASAN', M.BATAS_CHAR_RINGKASAN],
  ['POLA_RAHASIA_EFEKTIF', M.POLA_RAHASIA_EFEKTIF.length],
  ['ABAIKAN_SEGMEN', M.ABAIKAN_SEGMEN.length],
]) {
  console.log(`  ${nama.padEnd(24)} = ${angka(nilai)}`);
}
console.log(`  berkas bundle               = ${angka(teksBundel.length)} byte (satu entri: konteksRepo.ts + agentGuard)`);

const total = lulus + gagal.length + celah.length;
console.log(`\nCELAH TERBUKA (${celah.length})${celah.length ? ': ' + celah.join(', ') : ''}`);
if (gagal.length) console.log(`GAGAL TAK TERDUGA (${gagal.length}): ${gagal.join(', ')}`);
console.log(`\n== ${lulus}/${total} lulus ==`);
console.log(
  TOLERAN
    ? `mode --celah-diketahui: ${celah.length} celah dikenal diabaikan, exit ${gagal.length ? 1 : 0}`
    : `mode ketat: ${celah.length} celah dikenal dihitung GAGAL - tambal modulnya (lihat docs/USULAN-KONTEKS-REPO-CELAH.md), jangan dibisukan`,
);
process.exitCode = gagal.length || (!TOLERAN && celah.length) ? 1 : 0;
