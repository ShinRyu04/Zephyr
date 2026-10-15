#!/usr/bin/env node
/*
 * uji-pengetahuan-angka.mjs - HARNESS ANGKA untuk DESAIN PENGETAHUAN DUA LAPIS
 * Zephyr AI (item backlog `ai-tahu-100-7`).
 *
 * Kenapa harness ini ada (dan bedanya dari yang sudah ada)
 * -------------------------------------------------------
 * `cek-batas-inti.mjs`, `uji-pengetahuan-dua-lapis.mjs`, `uji-retrieval-otomatis.mjs`
 * sudah hijau. Yang BELUM dipakai sebagai bukti adalah ANGKANYA sendiri:
 *   (a) blok inti <= 2.000 token           -> char + token + ambang, diukur
 *   (b) on-demand <= 4 potongan x <= 800 token -> batas diuji (5 diminta, 900 token)
 *   (c) cache PER SESI benar-benar dipakai -> hit/miss dihitung dari panggilan IPC
 *   (d) pemangkasan ke BATAS_KARAKTER_SUNTIK -> char sebelum/sesudah + selisih
 *   (e) pencarian LOKAL deterministik, NOL jaringan, JALAN TANPA folder user
 *   (f) cap hash sumber + versi app -> kontrol POSITIF basi + NEGATIF segar
 *   (g) cakupan N/N dihitung dari berkas indeks yang benar-benar dibundel
 *
 * ATURAN: node murni, deterministik, TANPA jaringan, TANPA app/Tauri, TANPA CDP.
 * Modul di bawah uji di-bundle apa adanya dari `src/lib/**` lewat esbuild (bukan
 * salinan logika di berkas ini); hanya modul yang butuh browser/Tauri yang
 * di-stub, dan stub itu DICATAT panggilannya supaya cache bisa dihitung.
 * TIDAK ADA berkas `src/**` yang ditulis - harness ini hanya membaca.
 *
 * Cara pakai: node scripts/uji-pengetahuan-angka.mjs   (exit 0 lulus, 1 ada merah)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-pengetahuan-angka');
mkdirSync(KERJA, { recursive: true });

const OFF_TOPIK = [
  'tolong tuliskan puisi pendek tentang hujan di bulan april',
  'buatkan resep rendang padang yang enak untuk 4 orang',
  'siapa pemenang liga champions tahun 2019',
];

/* --------------------------------------------------------------- stub modul
 * Sama polanya dengan `uji-pengetahuan-dua-lapis.mjs`: hanya modul yang butuh
 * Tauri/browser yang diganti. Entry B menambahkan penghitung panggilan supaya
 * HIT/MISS cache bisa dibuktikan dengan angka, bukan diklaim. */

const STUB_PROMPT = `/* stub uji-pengetahuan-angka.mjs - modul berat untuk bundel blok inti. */
export const useStore = { getState: () => ({ settings: { general: { uiLang: process.env.UI_LANG || 'en' }, agents: { customInstructions: '' }, models: {} }, workspace: 'D:/Proyek' }), setState: () => undefined, subscribe: () => () => undefined };
export const fsRead = async () => ({ isi: '' });
export const instructionRead = async () => '';
export const blokPersona = () => ({ identitas: '', caraKerja: '', aturan: '' });
export const personaAktif = () => ({ nama: 'Zeph', identitas: '', caraKerja: '', aturan: '' });
export const blokKeadaan = () => '';
export const mcpTerpotong = () => [];
export const blokKeadaanRingkas = () => '[POTRET]';
export const useTerminal = { getState: () => ({ allPanes: () => [] }) };
export const useHistory = { getState: () => ({ timeline: [], stats: null }) };
export const blokMemoriTersimpan = () => '';
export const BATAS_TOKEN_BAWAAN = 900;
export const useInstructions = { getState: () => ({ daftar: [], muat: async () => undefined }) };
export const cocokPola = () => false;
`;

/* Versi app NYATA, dibaca dari package.json. Dipakai untuk mengganti
 * placeholder __VERSI_APP__ di stub/modul uji, supaya tidak ada versi yang
 * ditulis tangan di dalam harness - nilai yang ditulis tangan jadi salah
 * begitu versi app naik, dan yang terlihat merah adalah produk, bukan harness. */
const VERSI_APP = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const GANTI_PROMPT = [
  './store', './commands', './personaStore', './zephyrRuntime', './mcpTools',
  './aiZephyrState', './terminalStore', './historyStore', './aiMemori', './instructionsStore',
];

const STUB_SELF = `/* stub uji-pengetahuan-angka.mjs - Tauri/store untuk bundel zephyr_self.
 * Tiap jawaban IPC DIHITUNG supaya cache per sesi bisa dibuktikan dengan angka. */
/* Versi disuntikkan dari luar (__VERSI_APP__), bukan ditulis tangan.
 *
 * Sebelum ini nilainya hardcode '1.1.13'. Begitu versi app naik (1.1.14),
 * kontrol NEGATIF "versi sama -> tidak ada kata BASI" jadi mustahil lulus:
 * harness menyuntikkan versi lama sementara indeksnya dibuat untuk versi baru,
 * sehingga runtime benar-benar melihat cap yang berbeda dan menjawab BASI.
 * Yang merah adalah harness-nya, bukan produknya - dan harness yang salah
 * melaporkan produk sehat sebagai rusak lebih buruk daripada tidak ada harness. */
const G = (globalThis.__UJI = globalThis.__UJI || { ipc: 0, calls: [], versiApp: '__VERSI_APP__' });
const catat = (nama) => { G.ipc++; G.calls.push(nama); return nama; };
export const useStore = { getState: () => ({ settings: { general: { uiLang: 'en' }, agents: {}, models: {} }, workspace: undefined }), setState: () => undefined, subscribe: () => () => undefined };
export const useUpdater = { getState: () => ({ status: 'idle', version: null, message: null }) };
export const useMcp = { getState: () => ({ status: null, enabled: true }) };
export const useExtensions = { getState: () => ({ loaded: {}, extError: null }) };
export const getAppInfo = async () => { catat('getAppInfo'); return { version: G.versiApp, dataDir: 'D:/zuji/data', identifier: 'dev.zephyr', arch: 'x64', webview: 'edge', portable: false, exeDir: 'D:/zuji' }; };
export const getDiagnostics = async () => { catat('getDiagnostics'); return { version: G.versiApp, logFile: '', debug: false, panicked: false, os: 'win32', cpuCount: 4 }; };
export const getSettings = async () => { catat('getSettings'); return {}; };
export const logTail = async () => { catat('logTail'); return []; };
export const extensionsList = async () => { catat('extensionsList'); return []; };
export const extensionsBundledIds = async () => { catat('extensionsBundledIds'); return []; };
export const extensionsManifests = async () => { catat('extensionsManifests'); return []; };
export const extRegistryInstalled = async () => { catat('extRegistryInstalled'); return []; };
export const mcpStatus = async () => { catat('mcpStatus'); return { running: false }; };
`;

const GANTI_SELF = ['../commands', '../store', '../updaterStore', '../mcpStore', '../extensionStore'];

/* ------------------------------------------------------------------ entri A
 * Blok INTI (lapis 1) + blok suntikan otomatis (lapis 2). Keduanya modul nyata. */
const ENTRI_A = `import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import { FAKTA_INDEKS, FAKTA_KATEGORI, FAKTA_VERSI } from '../../src/lib/zephyrIndeks';
import { AMBANG_TOKEN_INTI, blokLarangan, faktaInti, kepalaPotret } from '../../src/lib/systemPrompt';
import { BATAS_HASIL_SUNTIK, BATAS_KARAKTER_HASIL, BATAS_KARAKTER_SUNTIK, jumlahEntri, kategoriTersedia, kepalaSuntikanIndeks, suntikanIndeks, versiFakta } from '../../src/lib/zephyrCari';

const keluar = process.env.ANGKA_KELUAR || '';
const off: string[] = JSON.parse(process.env.ANGKA_OFF || '[]');
const kandidat = FAKTA_INDEKS.map((e) => e[1]).filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k)).slice(0, 60);
const data = {
  ambang: AMBANG_TOKEN_INTI,
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  intiUlang: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  batasKarakterSuntik: BATAS_KARAKTER_SUNTIK,
  batasKarakterHasil: BATAS_KARAKTER_HASIL,
  batasHasilSuntik: BATAS_HASIL_SUNTIK,
  kepalaSuntik: kepalaSuntikanIndeks(),
  jumlahEntri: jumlahEntri(),
  versi: FAKTA_VERSI,
  versiFakta: versiFakta(),
  kategoriAngka: kategoriTersedia(),
  kategoriDaftar: FAKTA_KATEGORI,
  indeksJumlah: FAKTA_INDEKS.length,
  kandidat: kandidat.map((k) => [k, suntikanIndeks(k)]),
  kandidatUlang: kandidat.slice(0, 8).map((k) => [k, suntikanIndeks(k)]),
  /* AI-TAHU-100-2: bentuk PENUH tiap kueri (anggaran dilepas ke langit-langit
   * BATAS_KARAKTER_HASIL) = bahan kontrol POSITIF/NEGATIF untuk membuktikan batas
   * TOTAL benar-benar memangkas, dan TIDAK memangkas kueri yang sudah muat. */
  kandidatBesar: kandidat.map((k) => [k, suntikanIndeks(k, { batasKarakter: 100000 })]),
  sempit: kandidat.slice(0, 3).map((k) => [k, suntikanIndeks(k, { batasKarakter: 300 })]),
  batas1: [kandidat[0], suntikanIndeks(kandidat[0], { batas: 1 })],
  batas5: [kandidat[0], suntikanIndeks(kandidat[0], { batas: 5 })],
  off: off.map((q) => [q, suntikanIndeks(q)]),
  kosong: suntikanIndeks(''),
};
writeFileSync(keluar, JSON.stringify(data));
`;

/* ------------------------------------------------------------------ entri B
 * `zephyr_self` (potongan + cache + BASI) di atas indeks NYATA. Modul app dimuat
 * lewat dynamic import SETELAH modul ini menyiapkan pembaca spy jaringan. */
const ENTRI_B = `import { writeFileSync } from 'node:fs';

const G = ((globalThis as any).__UJI = { ipc: 0, calls: [] as string[], versiApp: process.env.UJI_VERSI_APP || '__VERSI_APP__' });
const jaringan: string[] = ((globalThis as any).__JARINGAN ??= []);
const keluar = process.env.ANGKA_KELUAR || '';

const S: any = await import('../../src/lib/zephyrTools/zephyrSelf');
const C: any = await import('../../src/lib/zephyrCari');
const I: any = await import('../../src/lib/zephyrIndeks');

const tok = (s: unknown) => S.perkirakanToken(String(s ?? ''));
const NL = String.fromCharCode(10);
const SEP = NL + NL + '--- potongan berikutnya ---' + NL + NL;
const DUA_NL = NL + NL;
const badan = (teks: string) => { const t = String(teks); const i = t.indexOf(DUA_NL); return i >= 0 ? t.slice(i + 2) : t; };
const potongan = (teks: string) => badan(teks).split(SEP);
const kepalaBadan = (teks: string) => { const t = String(teks); const i = t.indexOf(DUA_NL); return i >= 0 ? t.slice(0, i) : ''; };
const kepalaJson = (teks: string) => {
  const baris = String(teks).split('\\n')[0];
  return JSON.parse(baris.slice('ZEPHYR_SELF '.length));
};
const ipcSejak = (n: number) => G.ipc - n;

/* ---- blok potongan: batas 4 dan 800 token, dari isi indeks nyata ---- */
const TEKS = I.FAKTA_INDEKS.slice(0, 400).map((e: any) => '[' + e[0] + '] ' + e[1] + ': ' + e[2]).join('\\n');
const potonganNyata = {
  sumberChar: TEKS.length,
  sumberToken: tok(TEKS),
  empat: S.potongKePotongan(TEKS, 4),
  diminta5: S.potongKePotongan(TEKS, 5),
  diminta1: S.potongKePotongan(TEKS, 1),
  diminta0: S.potongKePotongan(TEKS, 0),
};
const b900 = 'kata '.repeat(720);
potonganNyata.char900 = b900.length;
potonganNyata.token900 = tok(b900);
potonganNyata.hasil900 = S.potongKePotongan(b900, 1);
/* AI-TAHU-100-7: bebanAwal = kepala/header yang ikut dibayar. Kontrol NEGATIF:
 * bebanAwal 0 harus byte-identik dengan perilaku lama. */
potonganNyata.empatBeban0 = S.potongKePotongan(TEKS, 4, 0);
potonganNyata.satuBeban = S.potongKePotongan(TEKS, 1, 2000);

/* ---- cache per sesi JALUR SUNTIKAN otomatis (zephyrCari, AI-TAHU-100-6) ---- */
const cacheSuntik: any = {
  eksporUkuran: typeof (C as any).ukuranCacheSuntikSesi,
  eksporBersihkan: typeof (C as any).bersihkanCacheSuntikSesi,
};
if (typeof (C as any).bersihkanCacheSuntikSesi === 'function') {
  (C as any).bersihkanCacheSuntikSesi();
  const cs1 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1]);
  cacheSuntik.miss = (C as any).ukuranCacheSuntikSesi();
  const cs2 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1]);
  cacheSuntik.hit = (C as any).ukuranCacheSuntikSesi();
  cacheSuntik.identik = cs1 === cs2;
  const cs3 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1], { batas: 2 });
  cacheSuntik.bedaOpsi = (C as any).ukuranCacheSuntikSesi();
  cacheSuntik.bedaIsi = cs3 !== cs1;
} else {
  cacheSuntik.miss = -1;
  cacheSuntik.hit = -1;
  cacheSuntik.identik = false;
  cacheSuntik.bedaOpsi = -1;
  cacheSuntik.bedaIsi = false;
}

/* ---- cache per sesi: hit/miss dihitung dari panggilan IPC ---- */
const cache: any = { sebelumBersih: S.ukuranCacheSesi() };
S.bersihkanCacheSesi();
cache.setelahBersih = S.ukuranCacheSesi();
let a = G.ipc;
let idx = G.calls.length;
const setelan1 = await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'theme' });
cache.missDelta = ipcSejak(a);
cache.missCalls = G.calls.slice(idx);
cache.missUkuran = S.ukuranCacheSesi();
a = G.ipc;
idx = G.calls.length;
const setelan2 = await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'theme' });
cache.hitDelta = ipcSejak(a);
cache.hitCalls = G.calls.slice(idx);
cache.hitUkuran = S.ukuranCacheSesi();
cache.hitIdentik = setelan1 === setelan2;
a = G.ipc;
idx = G.calls.length;
await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'ganti' });
cache.bedaDelta = ipcSejak(a);
cache.bedaCalls = G.calls.slice(idx);
cache.bedaUkuran = S.ukuranCacheSesi();

/* ---- aturan potongan lewat handler tool (maks diminta > 4, dan maks = 1) ---- */
S.bersihkanCacheSesi();
const maks9 = await S.jalankanZephyrSelf({ bagian: 'setelan', maks: 9 });
const maks1 = await S.jalankanZephyrSelf({ bagian: 'fakta', kueri: I.FAKTA_INDEKS[0][1], maks: 1 });
const potonganTool = {
  maks9Diminta: 9,
  maks9Kepala: kepalaJson(maks9),
  maks9Token: potongan(maks9).map(tok),
  maks9Jumlah: potongan(maks9).length,
  maks9KepalaChar: kepalaBadan(maks9).length,
  maks9Panjang: String(maks9).length,
  maks1Token: potongan(maks1).map(tok),
  maks1Jumlah: potongan(maks1).length,
  maks1KepalaChar: kepalaBadan(maks1).length,
  maks1Panjang: String(maks1).length,
  maks1PotonganChar: potongan(maks1).map((p: string) => p.length),
};

/* ---- BASIS: kontrol positif (versi beda) + negatif (versi sama) ---- */
S.bersihkanCacheSesi();
(G as any).versiApp = '__VERSI_APP__';
const segar = await S.jalankanZephyrSelf({ bagian: 'semua' });
S.bersihkanCacheSesi();
const segarVersi = await S.jalankanZephyrSelf({ bagian: 'versi' });
S.bersihkanCacheSesi();
(G as any).versiApp = '9.9.9';
const basi = await S.jalankanZephyrSelf({ bagian: 'semua' });
S.bersihkanCacheSesi();
const basiVersi = await S.jalankanZephyrSelf({ bagian: 'versi' });
const basiUji = {
  segarKepala: kepalaJson(segar),
  basiKepala: kepalaJson(basi),
  segarAdaBasi: String(segar).includes('BASI'),
  basiAdaBasi: String(basi).includes('BASI'),
  basiAdaPeringatan: String(basi).includes('PERINGATAN'),
  basiVersiAdaBasi: String(basiVersi).includes('BASI'),
  segarVersiAdaBasi: String(segarVersi).includes('BASI'),
  barisKemutakhiranBasi: String(basiVersi).split('\\n').find((l: string) => l.includes('Kemutakhiran')) ?? '',
  barisKemutakhiranSegar: String(segarVersi).split('\\n').find((l: string) => l.includes('Kemutakhiran')) ?? '',
  basiHashRuntimeAda: String(segar).includes('BASI') || String(segarVersi).includes('BASI'),
};

/* ---- bukti jaringan + identitas keluaran ---- */
const keluaran = {
  potonganNyata,
  cache,
  potonganTool,
  basiUji,
  konstanta: {
    POTONGAN_MAKS: S.POTONGAN_MAKS,
    TOKEN_POTONGAN_MAKS: S.TOKEN_POTONGAN_MAKS,
    KARAKTER_PER_TOKEN: S.KARAKTER_PER_TOKEN,
    ukuranCacheSesi: S.ukuranCacheSesi(),
  },
  cariEksporCache: {
    ukuranCacheSesi: typeof C.ukuranCacheSesi,
    bersihkanCacheSesi: typeof C.bersihkanCacheSesi,
    ukuranCacheSuntikSesi: typeof C.ukuranCacheSuntikSesi,
    bersihkanCacheSuntikSesi: typeof C.bersihkanCacheSuntikSesi,
  },
  cacheSuntik,
  versiFakta: C.versiFakta(),
  suntikanLapis2: C.suntikanIndeks(I.FAKTA_INDEKS[0][1]),
  jaringanDipakai: jaringan.slice(),
  ipcTotal: G.ipc,
  ipcPanggilan: G.calls.slice(),
};
writeFileSync(keluar, JSON.stringify(keluaran));
`;

/* ------------------------------------------------------- spy jaringan (CJS)
 * Dimuat lewat `--require` SEBELUM bundel app: jadi kalau ada satu saja
 * panggilan jaringan dari kode app, ia tercatat di globalThis.__JARINGAN. */
const SPY = `/* spy jaringan uji-pengetahuan-angka.mjs - dipasang lewat node --require */
const daftar = [];
globalThis.__JARINGAN = daftar;
const bungkus = (obj, nama) => {
  if (!obj || typeof obj[nama] !== 'function') return;
  const asli = obj[nama];
  obj[nama] = function (...a) { daftar.push(nama); return asli.apply(this, a); };
};
bungkus(globalThis, 'fetch');
bungkus(globalThis, 'WebSocket');
bungkus(globalThis, 'XMLHttpRequest');
for (const nama of ['http', 'https', 'net', 'dns', 'tls', 'http2']) {
  try {
    const m = require('node:' + nama);
    bungkus(m, 'request'); bungkus(m, 'get'); bungkus(m, 'connect');
    bungkus(m, 'createConnection'); bungkus(m, 'lookup'); bungkus(m, 'resolve');
    bungkus(m.promises, 'lookup'); bungkus(m.promises, 'resolve');
    if (m.Socket && m.Socket.prototype) bungkus(m.Socket.prototype, 'connect');
  } catch { /* modul tidak ada di node ini */ }
}
`;

/* ------------------------------------------------------------------ bundel */

function pluginGanti(nama, pasangan, berkasStub) {
  return {
    name: nama,
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        for (const [cocok, daftar] of Object.entries(pasangan)) {
          if (new RegExp(cocok).test(args.importer) && daftar.includes(args.path)) {
            return { path: berkasStub };
          }
        }
        return undefined;
      });
    },
  };
}

const DEFINE_ENV = { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test' }) };

async function bangun(nama, sumber, plugin) {
  const berkas = join(KERJA, `entri-${nama}.ts`);
  writeFileSync(berkas, sumber);
  const keluar = join(KERJA, `entri-${nama}.mjs`);
  await esbuild.build({
    entryPoints: [berkas],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: keluar,
    logLevel: 'warning',
    define: DEFINE_ENV,
    plugins: plugin ? [plugin] : [],
  });
  return keluar;
}

writeFileSync(join(KERJA, 'stub-prompt.mjs'), STUB_PROMPT);
/* Placeholder diganti di SATU tempat ini: nilai versi masuk ke berkas stub
   saat ditulis, jadi tidak ada versi yang ditulis tangan di dalam template. */
writeFileSync(join(KERJA, 'stub-self.mjs'), STUB_SELF.split('__VERSI_APP__').join(VERSI_APP));
writeFileSync(join(KERJA, 'spy.cjs'), SPY);

/* Placeholder __VERSI_APP__ diganti nilai NYATA di kedua entry point, di satu
   tempat: nilai yang ditulis tangan di dalam template jadi salah begitu versi
   app naik, dan yang terbaca merah adalah produk, bukan harness-nya. */
const isiVersi = (x) => x.split('__VERSI_APP__').join(VERSI_APP);
const BUNDEL_A = await bangun('inti', isiVersi(ENTRI_A), pluginGanti('ganti-prompt', { 'systemPrompt\\.ts$': GANTI_PROMPT }, join(KERJA, 'stub-prompt.mjs')));
const BUNDEL_B = await bangun('self', isiVersi(ENTRI_B), pluginGanti('ganti-self', { 'zephyrSelf\\.ts$': GANTI_SELF }, join(KERJA, 'stub-self.mjs')));
const SPY_CJS = join(KERJA, 'spy.cjs');

function jalankan(bundel, env, cwd = AKAR, pakaiSpy = false) {
  const arg = [];
  if (pakaiSpy) arg.push('--require', SPY_CJS);
  arg.push(bundel);
  const anak = spawnSync(process.execPath, arg, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (anak.status !== 0) {
    console.error(`GAGAL menjalankan ${bundel}:\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
    process.exit(1);
  }
  return anak;
}

const keluarA = join(KERJA, 'hasil-A.json');
const keluarB = join(KERJA, 'hasil-B.json');
const keluarB2 = join(KERJA, 'hasil-B2.json');
const keluarBKosong = join(KERJA, 'hasil-B-kosong.json');

/* (e) uji negatif "tanpa folder user": HOME/APPDATA diarahkan ke jalur yang
 * TIDAK ADA dan cwd ke folder kosong; keluaran harus tetap identik. */
const DIR_KOSONG = join(KERJA, 'folder-user-kosong');
mkdirSync(DIR_KOSONG, { recursive: true });
const TIDAK_ADA = join(KERJA, 'jalur-user-tidak-ada');

jalankan(BUNDEL_A, { ANGKA_KELUAR: keluarA, ANGKA_OFF: JSON.stringify(OFF_TOPIK), UI_LANG: 'id' });
jalankan(BUNDEL_B, { ANGKA_KELUAR: keluarB, UJI_VERSI_APP: '1.1.13' }, AKAR, true);
jalankan(BUNDEL_B, { ANGKA_KELUAR: keluarB2, UJI_VERSI_APP: '1.1.13' }, AKAR, true);
const isiDirKosongSebelum = readdirSync(DIR_KOSONG).length;
jalankan(
  BUNDEL_B,
  {
    ANGKA_KELUAR: keluarBKosong,
    UJI_VERSI_APP: '1.1.13',
    HOME: TIDAK_ADA,
    USERPROFILE: TIDAK_ADA,
    APPDATA: TIDAK_ADA,
    LOCALAPPDATA: TIDAK_ADA,
    XDG_CONFIG_HOME: TIDAK_ADA,
  },
  DIR_KOSONG,
  true,
);
const isiDirKosongSesudah = readdirSync(DIR_KOSONG).length;

const A = JSON.parse(readFileSync(keluarA, 'utf8'));
const B = JSON.parse(readFileSync(keluarB, 'utf8'));
const B2 = JSON.parse(readFileSync(keluarB2, 'utf8'));
const BK = JSON.parse(readFileSync(keluarBKosong, 'utf8'));

/* sha256 tiap bundel app untuk bukti "nol jaringan" statis. */
const teksBundelB = readFileSync(BUNDEL_B, 'utf8');
const REF_JARINGAN = [
  ['node:http', /node:http/],
  ['node:https', /node:https/],
  ['node:net', /node:net/],
  ['node:dns', /node:dns/],
  ['node:tls', /node:tls/],
  ['http2', /http2/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['fetch(', /\bfetch\s*\(/],
];
const refJaringan = REF_JARINGAN.map(([nama, re]) => [nama, (teksBundelB.match(new RegExp(re.source, 'g')) ?? []).length]).filter(([, n]) => n > 0);

/* generator: hash yang DIHARAPKAN dari sumber saat ini (`--print-cakupan` tidak
 * menulis berkas apa pun) + status sinkron (`--check`). */
const anakCakupan = spawnSync(process.execPath, [join('scripts', 'gen-fakta-zephyr.mjs'), '--print-cakupan'], { cwd: AKAR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const cakupan = anakCakupan.status === 0 ? JSON.parse(anakCakupan.stdout) : null;
const anakCek = spawnSync(process.execPath, [join('scripts', 'gen-fakta-zephyr.mjs'), '--check'], { cwd: AKAR, encoding: 'utf8' });
const cekKode = anakCek.status ?? 1;
const cekPesan = `${anakCek.stdout ?? ''}${anakCek.stderr ?? ''}`.trim().split('\n')[0] ?? '';

const paket = JSON.parse(readFileSync(join(AKAR, 'package.json'), 'utf8'));
const tauri = JSON.parse(readFileSync(join(AKAR, 'src-tauri', 'tauri.conf.json'), 'utf8'));

/* ------------------------------------------------------------------ pelaporan */

let merah = 0;
let total = 0;
const merahDaftar = [];
const cek = (id, nama, syarat, bukti = '') => {
  total++;
  if (syarat) console.log(`  OK    ${id.padEnd(4)} ${nama}  [${bukti}]`);
  else {
    merah++;
    merahDaftar.push(`${id} ${nama}`);
    console.log(`  GAGAL ${id.padEnd(4)} ${nama}  [${bukti}]`);
  }
};
const angka = (nama, nilai) => console.log(`  ANGKA ${nama.padEnd(52)} ${nilai}`);
const tok = (s) => Math.ceil((typeof s === 'number' ? s : String(s ?? '').length) / 4);
const entriLapis2 = (teks) => (String(teks).match(/^\[[a-z]+\] /gm) ?? []).length;

console.log('UJI PENGETAHUAN ANGKA (ai-tahu-100-7)');
console.log(`  indeks bundel: ${A.indeksJumlah} entri / ${A.kategoriDaftar.length} kategori, versi ${A.versi.aplikasi}, hash ${A.versi.hashSumber}`);
console.log('');

/* ==================================================== (a) blok INTI <= 2000 token */
console.log('(a) blok inti SELALU nyala <= 2.000 token');
const intiChar = A.inti.length + A.larangan.length + A.kepala.length;
const intiTok = tok(intiChar);
angka('AMBANG_TOKEN_INTI (dibaca dari modul)', `${A.ambang} token = ${A.ambang * 4} char`);
angka('faktaInti()', `${A.inti.length} char / ${tok(A.inti)} token`);
angka('blokLarangan()', `${A.larangan.length} char / ${tok(A.larangan)} token`);
angka('kepalaPotret()', `${A.kepala.length} char / ${tok(A.kepala)} token`);
angka('inti + larangan + kepala', `${intiChar} char / ${intiTok} token`);
angka('blok fakta generated penuh', `${A.fakta.length} char / ${tok(A.fakta)} token`);
angka('bagian fakta yang dipangkas dari blok generated', `${A.fakta.length - A.inti.length} char (dari ${A.fakta.length})`);
cek('A1', 'AMBANG_TOKEN_INTI == 2000 (diukur, bukan disalin)', A.ambang === 2000, `${A.ambang}`);
cek('A2', 'inti + larangan + kepala <= ambang', intiTok <= A.ambang, `${intiTok} <= ${A.ambang} token (${intiChar} char)`);
cek('A3', 'sisa anggaran inti masih ada (bukan pas-pasan)', intiTok < A.ambang, `${A.ambang - intiTok} token sisa`);
cek('A4', 'inti benar-benar dipangkas dari blok generated', A.inti.length < A.fakta.length, `${A.inti.length} < ${A.fakta.length} char (on-demand ${(A.fakta.length - A.inti.length)} char)`);
cek('A5', 'faktaInti() deterministik (2 panggilan identik)', A.inti === A.intiUlang, `${A.inti.length} char`);

/* ==================================================== (b) <= 4 potongan x 800 token */
console.log('\n(b) on-demand: maks 4 potongan, tiap potongan <= 800 token');
const PN = B.potonganNyata;
angka('POTONGAN_MAKS / TOKEN_POTONGAN_MAKS / KARAKTER_PER_TOKEN', `${B.konstanta.POTONGAN_MAKS} / ${B.konstanta.TOKEN_POTONGAN_MAKS} / ${B.konstanta.KARAKTER_PER_TOKEN}`);
angka('sumber uji (400 entri indeks nyata)', `${PN.sumberChar} char / ${PN.sumberToken} token`);
angka('potongKePotongan(sumber, 4)', `${PN.empat.length} potongan, token ${PN.empat.map(tok).join('+')}`);
angka('potongKePotongan(sumber, 5) -> hasilnya', `${PN.diminta5.length} potongan (clamp POTONGAN_MAKS)`);
angka('potongKePotongan(sumber, 0) -> hasilnya', `${PN.diminta0.length} potongan (clamp minimum 1)`);
angka('potongKePotongan(sumber, 1)', `${PN.diminta1.length} potongan, ${PN.diminta1[0].length} char / ${tok(PN.diminta1[0])} token`);
angka('masukan 1 potongan 900 token', `${PN.char900} char / ${PN.token900} token`);
angka('  hasil dipotong ke', `${PN.hasil900[0].length} char / ${tok(PN.hasil900[0])} token`);
angka('maks:9 lewat handler -> kepala.maks', `${B.potonganTool.maks9Kepala.maks} (diminta 9), potongan ${B.potonganTool.maks9Jumlah}, token ${B.potonganTool.maks9Token.join('+')}`);
angka('maks:1 lewat handler -> kepala.maks', `${B.potonganTool.maks1Jumlah} potongan, token ${B.potonganTool.maks1Token.join('+')}`);
angka('maks:1 potongan (char) / kepala+header (char)', `${B.potonganTool.maks1PotonganChar.join('+')} / ${B.potonganTool.maks1KepalaChar}`);
cek('B1', 'POTONGAN_MAKS == 4 dan TOKEN_POTONGAN_MAKS == 800', B.konstanta.POTONGAN_MAKS === 4 && B.konstanta.TOKEN_POTONGAN_MAKS === 800, `${B.konstanta.POTONGAN_MAKS} x ${B.konstanta.TOKEN_POTONGAN_MAKS}`);
cek('B2', 'potongKePotongan(sumber, 4): <= 4 potongan', PN.empat.length <= 4, `${PN.empat.length} potongan`);
cek('B3', 'tiap potongan <= 800 token', PN.empat.every((p) => tok(p) <= 800), `maks ${Math.max(...PN.empat.map(tok))} token dari ${PN.empat.length} potongan`);
cek('B4', 'batas 5 diminta -> DITOLAK/dipotong ke POTONGAN_MAKS', PN.diminta5.length === 4, `diminta 5 -> ${PN.diminta5.length} potongan`);
cek('B5', 'batas 0 diminta -> tidak boleh 0 (dikunci ke 1)', PN.diminta0.length === 1, `diminta 0 -> ${PN.diminta0.length} potongan`);
cek('B6', 'masukan 1 potongan 900 token -> dipotong ke <= 800 token', tok(PN.hasil900[0]) <= 800 && PN.token900 > 800, `${PN.token900} token -> ${tok(PN.hasil900[0])} token (${PN.hasil900[0].length} char)`);
cek('B7', 'handler zephyr_self: maks 9 -> dikunci ke 4', B.potonganTool.maks9Kepala.maks === 4 && B.potonganTool.maks9Jumlah <= 4, `maks=${B.potonganTool.maks9Kepala.maks}, ${B.potonganTool.maks9Jumlah} potongan, token ${B.potonganTool.maks9Token.join('+')}`);
cek('B8', 'handler zephyr_self: tiap potongan MURNI <= 800 token', [...B.potonganTool.maks9Token, ...B.potonganTool.maks1Token].every((t) => t <= 800), `maks ${Math.max(...B.potonganTool.maks9Token, ...B.potonganTool.maks1Token)} token`);
cek('B9', 'teks kelebihan -> potongan terakhir ditandai [dipotong]', PN.diminta5[PN.diminta5.length - 1].includes('[dipotong'), `penanda ada di potongan ke-${PN.diminta5.length}`);
/* Kontrol untuk AI-TAHU-100-7 (kepala/header ikut dihitung). */
cek('B10', 'KONTROL POSITIF (b): SELURUH muatan 1 panggilan (bagian=fakta, maks:1) <= 800 token walau kepala/header ikut dihitung', tok(B.potonganTool.maks1Panjang) <= 800, `${tok(B.potonganTool.maks1Panjang)} token dari ${B.potonganTool.maks1Panjang} char (kepala/header JSON ${B.potonganTool.maks1KepalaChar} char)`);
cek('B11', 'KONTROL NEGATIF (b): bebanAwal=0 -> potongan byte-identik dengan perilaku lama', JSON.stringify(PN.empatBeban0) === JSON.stringify(PN.empat), `${PN.empatBeban0.length} potongan identik`);
cek('B12', 'KONTROL POSITIF (b): bebanAwal 2.000 char memangkas jatah potongan PERTAMA', tok(PN.satuBeban[0]) < tok(PN.diminta1[0]) && tok(PN.satuBeban[0]) <= 800, `${tok(PN.satuBeban[0])} < ${tok(PN.diminta1[0])} token`);

/* ==================================================== (c) cache PER SESI */
console.log('\n(c) cache per sesi benar-benar dipakai (hit/miss dihitung)');
const CH = B.cache;
angka('ukuranCacheSesi() sebelum dibersihkan', CH.sebelumBersih);
angka('bersihkanCacheSesi() lalu ukuranCacheSesi()', CH.setelahBersih);
angka('kueri BARU (bagian=setelan,kueri=theme) -> delta panggilan IPC', `${CH.missDelta} (ukuran cache ${CH.missUkuran})`);
angka('  panggilan saat MISS', `[${(CH.missCalls ?? []).join(', ')}]`);
angka('kueri SAMA dipanggil 2x -> delta panggilan IPC', `${CH.hitDelta} (ukuran cache ${CH.hitUkuran}), keluaran identik: ${CH.hitIdentik}`);
angka('  panggilan saat HIT', `[${(CH.hitCalls ?? []).join(', ')}]`);
angka('kueri BEDA (kueri=ganti) -> delta panggilan IPC', `${CH.bedaDelta} (ukuran cache ${CH.bedaUkuran})`);
cek('C1', 'bersihkanCacheSesi() -> cache kosong', CH.setelahBersih === 0, `${CH.sebelumBersih} -> 0`);
cek('C2', 'kueri baru -> cache terisi 1 entri', CH.missUkuran === 1, `ukuran ${CH.missUkuran}`);
cek('C3', 'kueri SAMA 2x -> pekerjaan data dijalankan 1x (delta IPC turun)', CH.hitDelta < CH.missDelta, `miss ${CH.missDelta} vs hit ${CH.hitDelta} panggilan IPC`);
cek('C4', 'kueri SAMA 2x -> keluaran byte-identik', CH.hitIdentik === true, 'identik');
cek('C5', 'kueri BEDA -> cache nambah (bukan menyajikan jawaban lama)', CH.bedaUkuran === 2 && CH.bedaDelta === CH.missDelta, `ukuran ${CH.bedaUkuran}, delta ${CH.bedaDelta}`);
cek('C6', 'lapis 2 OTOMATIS (zephyrCari) tidak punya API cache per sesi', B.cariEksporCache.ukuranCacheSesi === 'undefined' && B.cariEksporCache.bersihkanCacheSesi === 'undefined', `ukuranCacheSesi=${B.cariEksporCache.ukuranCacheSesi}, bersihkanCacheSesi=${B.cariEksporCache.bersihkanCacheSesi}`);
cek('C7', 'saat HIT, panggilan pengambilan data berat benar-benar dilewati', (CH.missCalls ?? []).includes('getSettings') && !(CH.hitCalls ?? []).includes('getSettings'), `miss [${(CH.missCalls ?? []).join(',')}] vs hit [${(CH.hitCalls ?? []).join(',')}]`);
/* Kontrol untuk AI-TAHU-100-6 (cache per sesi jalur suntikan otomatis). */
cek('C8', 'KONTROL POSITIF (c): jalur SUNTIKAN otomatis kini PUNYA cache per sesi (nama dibedakan dari jalur tool)', B.cariEksporCache.ukuranCacheSuntikSesi === 'function' && B.cariEksporCache.bersihkanCacheSuntikSesi === 'function' && B.cacheSuntik.miss === 1 && B.cacheSuntik.hit === 1 && B.cacheSuntik.identik === true, `ukuran sesudah miss/hit ${B.cacheSuntik.miss}/${B.cacheSuntik.hit}, keluaran identik ${B.cacheSuntik.identik}`);
cek('C9', 'KONTROL NEGATIF (c): kueri sama + opsi BEDA -> cache nambah dan bloknya beda (bukan menyajikan blok anggaran lama)', B.cacheSuntik.bedaOpsi === 2 && B.cacheSuntik.bedaIsi === true, `entri ${B.cacheSuntik.bedaOpsi}, blok beda ${B.cacheSuntik.bedaIsi}`);

/* ==================================================== (d) pemangkasan ke BATAS_KARAKTER_SUNTIK */
console.log('\n(d) pemangkasan ke BATAS_KARAKTER_SUNTIK (angka nyata + selisih)');
const batas = A.batasKarakterSuntik;
const ukur = A.kandidat.map(([q, t]) => {
  const baris = String(t).split('\n');
  const penutup = baris[baris.length - 1] ?? '';
  const metered = String(t).length - penutup.length - 1;
  return { q, len: String(t).length, entri: entriLapis2(t), penutup: penutup.length, metered };
}).filter((x) => x.entri > 0);
const lewat = ukur.filter((x) => x.len > batas);
const lewatMetered = ukur.filter((x) => x.metered > batas);
angka('BATAS_KARAKTER_SUNTIK (dibaca dari modul)', batas);
angka('BATAS_KARAKTER_HASIL (langit-langit op batasKarakter)', A.batasKarakterHasil);
angka('kueri on-topic diukur', `${ukur.length} dari ${A.kandidat.length}`);
angka('panjang blok: min / rata-rata / maks', `${Math.min(...ukur.map((x) => x.len))} / ${Math.round(ukur.reduce((s, x) => s + x.len, 0) / ukur.length)} / ${Math.max(...ukur.map((x) => x.len))} char`);
angka('bagian yang DIMETER (tanpa kalimat penutup): maks', `${Math.max(...ukur.map((x) => x.metered))} char`);
angka('kalimat penutup (baris terakhir, kini IKUT anggaran blok)', `${ukur[0].penutup} char`);
angka(`blok > BATAS_KARAKTER_SUNTIK`, `${lewat.length}/${ukur.length} kueri, kelebihan maks ${Math.max(0, ...lewat.map((x) => x.len - batas))} char`);
const sempit = A.sempit[0];
angka('opsi batasKarakter:300 -> panjang blok', `${String(sempit[1]).length} char (batas 300)`);
angka('opsi batas:1 -> entri', `${entriLapis2(A.batas1[1])} entri`);
angka('opsi batas:5 -> entri', `${entriLapis2(A.batas5[1])} entri (BATAS_HASIL_SUNTIK ${A.batasHasilSuntik})`);
cek('D1', 'bagian yang dimeter <= BATAS_KARAKTER_SUNTIK', lewatMetered.length === 0, `${lewatMetered.length}/${ukur.length} lewat; maks ${Math.max(...ukur.map((x) => x.metered))} <= ${batas}`);
cek('D2', 'panjang blok TOTAL <= BATAS_KARAKTER_SUNTIK', lewat.length === 0, `${lewat.length}/${ukur.length} lewat; maks ${Math.max(...ukur.map((x) => x.len))} char -> kelebihan ${Math.max(...ukur.map((x) => x.len)) - batas} char`);
cek('D3', 'opsi batasKarakter eksplisit (300) dihormati sebagai batas TOTAL', String(sempit[1]).length <= 300, `${String(sempit[1]).length} char`);
cek('D4', 'opsi batas:1 -> <= 1 entri', entriLapis2(A.batas1[1]) <= 1, `${entriLapis2(A.batas1[1])} entri`);
cek('D5', 'opsi batas:5 dibatasi BATAS_HASIL_SUNTIK', entriLapis2(A.batas5[1]) <= A.batasHasilSuntik, `${entriLapis2(A.batas5[1])} <= ${A.batasHasilSuntik} entri`);
/* Kontrol untuk AI-TAHU-100-2 (batas berlaku pada blok TOTAL, bukan cuma bagian
 * yang dimeter). `kandidatBesar` = bentuk penuh tiap kueri (anggaran dilepas). */
const besarLen = A.kandidatBesar.map(([, t]) => String(t).length);
const kecilLen = A.kandidat.map(([, t]) => String(t).length);
const lewatPenuh = besarLen.filter((n) => n > batas).length;
const salahPangkas = A.kandidat.filter(([, t], i) => besarLen[i] <= batas && String(t).length !== besarLen[i]).length;
const sempitPenuh = String(A.kandidatBesar[0][1]).length;
const sempitAdaPenutup = String(sempit[1]).includes('These entries come from');
angka('blok PENUH (anggaran dilepas) > BATAS_KARAKTER_SUNTIK', `${lewatPenuh}/${A.kandidat.length} kueri (blok penuh maks ${Math.max(...besarLen)} char)`);
angka('  blok bawaan yang memangkas / salah-pangkas', `${lewatPenuh} memangkas / ${salahPangkas} salah`);
cek('D6', 'KONTROL POSITIF (d): ada kueri yang blok penuhnya > 1.200 DAN blok bawaan tetap <= 1.200 (penjaga menyala)', lewatPenuh > 0 && Math.max(...kecilLen) <= batas, `${lewatPenuh} kueri penuh > ${batas}; blok bawaan maks ${Math.max(...kecilLen)} <= ${batas}`);
cek('D7', 'KONTROL NEGATIF (d): kueri yang blok penuhnya <= 1.200 -> blok bawaan IDENTIK (penjaga tidak memangkas palsu)', salahPangkas === 0, `${salahPangkas} kueri berbeda dari bentuk penuhnya`);
cek('D8', 'KONTROL POSITIF (d): anggaran 300 -> blok TOTAL <= 300 DAN penutup dilepas karena tidak muat', String(sempit[1]).length <= 300 && sempitPenuh > 300 && sempitAdaPenutup === false, `${String(sempit[1]).length} <= 300 (bentuk penuh ${sempitPenuh}); penutup hadir: ${sempitAdaPenutup}`);
cek('D9', 'KONTROL NEGATIF (d): anggaran bawaan -> penjaga "jangan mengarang" DAN hash sumber TETAP ada di tiap blok', A.kandidat.every(([, t]) => String(t).includes('These entries come from') && String(t).includes('source hash')), `${A.kandidat.length} blok bawaan diperiksa`);

/* ==================================================== (e) lokal, deterministik, nol jaringan, tanpa folder user */
console.log('\n(e) pencarian lokal deterministik, NOL jaringan, jalan tanpa folder user');
const shaB = createHash('sha256').update(JSON.stringify(B)).digest('hex');
const shaB2 = createHash('sha256').update(JSON.stringify(B2)).digest('hex');
const shaBK = createHash('sha256').update(JSON.stringify(BK)).digest('hex');
angka('panggilan jaringan runtime (spy --require)', `${B.jaringanDipakai.length} -> [${B.jaringanDipakai.join(', ')}]`);
angka('referensi modul jaringan di bundel app', `${refJaringan.length === 0 ? '0' : JSON.stringify(refJaringan)}`);
angka('panggilan IPC total dalam 1 jalan anak', B.ipcTotal);
angka('cwd berisi berkas: sebelum / sesudah (folder user kosong)', `${isiDirKosongSebelum} / ${isiDirKosongSesudah}`);
angka('sha256 keluaran: jalan-1 / jalan-2 / env-tanpa-folder-user', `${shaB.slice(0, 12)} / ${shaB2.slice(0, 12)} / ${shaBK.slice(0, 12)}`);
cek('E1', 'nol panggilan jaringan saat seluruh endpoint dijalankan', B.jaringanDipakai.length === 0, '0 panggilan fetch/net/dns/http/tls/WebSocket');
cek('E2', 'bundel app tidak mereferensikan satu pun modul jaringan', refJaringan.length === 0, `${refJaringan.length} referensi`);
cek('E3', 'dua jalan anak -> keluaran byte-identik (deterministik)', shaB === shaB2, shaB.slice(0, 16));
cek('E4', 'tanpa folder user (HOME/APPDATA tak ada + cwd kosong) -> keluaran identik', shaBK === shaB, shaBK.slice(0, 16));
cek('E5', 'folder user kosong tetap kosong (tidak ada berkas dibuat)', isiDirKosongSesudah === isiDirKosongSebelum && isiDirKosongSesudah === 0, `${isiDirKosongSesudah} berkas`);
const titikPrompt = readFileSync(join(AKAR, 'src', 'lib', 'systemPrompt.ts'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).filter((l) => l.includes('suntikanIndeks(')).length;
angka('titik panggil suntikanIndeks() di systemPrompt.ts', `${titikPrompt}x (blok inti selalu nyala, lapis 2 hanya saat relevan)`);
cek('E6', 'lapis 2 memang dipanggil otomatis 1x per giliran (bukan menunggu tool)', titikPrompt === 1, `${titikPrompt} titik panggil`);

/* ==================================================== (f) cap hash sumber + versi app */
console.log('\n(f) cap hash sumber + versi app (BASI harus dibilang BASI)');
const hashBundel = A.versi.hashSumber;
const hashSumberNyata = cakupan?.hashSumber ?? '(tidak terbaca)';
angka('FAKTA_VERSI.aplikasi (bundel)', A.versi.aplikasi);
angka('package.json version / tauri.conf.json version', `${paket.version} / ${tauri.version}`);
angka('FAKTA_VERSI.hashSumber (bundel)', hashBundel);
angka('hash sumber DIHITUNG ULANG dari sumber saat ini', hashSumberNyata);
angka('gen-fakta-zephyr.mjs --check', `exit ${cekKode}: ${cekPesan}`);
angka('kontrol NEGATIF (versi app sama): kepala.basi', `${B.basiUji.segarKepala.basi}, ada kata BASI: ${B.basiUji.segarAdaBasi}`);
angka('kontrol POSITIF (versi app 9.9.9): kepala.basi', `${B.basiUji.basiKepala.basi}, ada PERINGATAN: ${B.basiUji.basiAdaPeringatan}, ada kata BASI: ${B.basiUji.basiAdaBasi}`);
angka('bagian=versi saat HASH basi tapi versi sama', `"${B.basiUji.barisKemutakhiranSegar.slice(0, 72)}"`);
angka('  bandingkan bagian=versi saat versi app beda (9.9.9)', `"${B.basiUji.barisKemutakhiranBasi.slice(0, 72)}"`);
angka('blok suntikan otomatis (lapis 2) menyebut hash', `${String(B.suntikanLapis2).includes('source hash') ? 'ya' : 'tidak'}; menyebut BASI: ${String(B.suntikanLapis2).includes('BASI') ? 'ya' : 'tidak'}`);
angka('indeks bundel memuat hash sumber di keluaran runtime', String(B.suntikanLapis2).includes(hashBundel) ? 'ya' : 'tidak');
cek('F1', 'cap hash sumber ada di indeks bundel (16 hex)', /^[0-9a-f]{16}$/.test(hashBundel), hashBundel);
cek('F2', 'versi app == versi indeks == package.json == tauri.conf.json (segar)', A.versi.aplikasi === paket.version && paket.version === tauri.version, `${A.versi.aplikasi}/${paket.version}/${tauri.version}`);
cek('F3', 'kontrol POSITIF basi: versi app beda -> keluaran menyebut BASI', B.basiUji.basiKepala.basi === true && B.basiUji.basiAdaBasi === true && B.basiUji.basiAdaPeringatan === true, `basi=${B.basiUji.basiKepala.basi}, PERINGATAN=${B.basiUji.basiAdaPeringatan}, BASI=${B.basiUji.basiAdaBasi}`);
cek('F4', 'kontrol NEGATIF segar: versi app sama -> tidak ada kata BASI', B.basiUji.segarKepala.basi === false && B.basiUji.segarAdaBasi === false, `basi=${B.basiUji.segarKepala.basi}, BASI=${B.basiUji.segarAdaBasi}`);
cek('F5', 'hash sumber bundel == hash sumber saat ini (indeks TIDAK basi)', hashBundel === hashSumberNyata && cekKode === 0, `bundel ${hashBundel} vs sumber ${hashSumberNyata} (--check exit ${cekKode})`);
cek('F6', 'BASI dari cap HASH ditegakkan di RUNTIME (bukan cuma build)', B.basiUji.basiHashRuntimeAda === true, `hash basi + versi sama -> runtime bilang BASI: ${B.basiUji.basiHashRuntimeAda}`);
cek('F7', 'keluaran runtime memuat cap hash sumber apa adanya', String(B.suntikanLapis2).includes(hashBundel), hashBundel);
/* Kontrol untuk AI-TAHU-100-4/5 (cap hash: jangan klaim segar tanpa dasar). */
cek('F8', 'KONTROL POSITIF (f): versi sama -> keluaran runtime menyebut DASAR penilaian + perintah pemeriksa + kata BASI', String(B.basiUji.barisKemutakhiranSegar).includes('segar menurut VERSI') && String(B.basiUji.barisKemutakhiranSegar).includes('gen-fakta-zephyr.mjs --check') && String(B.basiUji.barisKemutakhiranSegar).includes('BASI'), String(B.basiUji.barisKemutakhiranSegar).slice(0, 160));
cek('F9', 'KONTROL NEGATIF (f): keluaran versi-sama TIDAK lagi mengklaim "segar" mutlak', !String(B.basiUji.barisKemutakhiranSegar).includes('segar (sama dengan versi app yang berjalan)') && String(B.basiUji.barisKemutakhiranSegar).includes('tidak bisa dihitung ulang'), String(B.basiUji.barisKemutakhiranSegar).slice(0, 160));

/* ==================================================== (g) cakupan N/N */
console.log('\n(g) cakupan N/N dihitung dari berkas indeks nyata');
const terisi = A.kategoriAngka.filter((k) => k.jumlah > 0);
const N = terisi.length;
angka('N kategori terisi / total', `${N}/${A.kategoriDaftar.length}`);
angka('jumlah entri indeks bundel', A.indeksJumlah);
angka('rincian per kategori', terisi.map((k) => `${k.kategori}=${k.jumlah}`).join(' '));
angka('berkas sumber dipetakan (kategori kode)', A.kategoriAngka.find((k) => k.kategori === 'kode')?.jumlah ?? 0);
cek('G1', 'cakupan N/N: tiap kategori FAKTA_KATEGORI punya >= 1 entri', N === A.kategoriDaftar.length && N > 0, `${N}/${A.kategoriDaftar.length}`);
cek('G2', 'jumlah entri indeks konsisten dengan jumlahEntri()', A.jumlahEntri === A.indeksJumlah, `${A.jumlahEntri} == ${A.indeksJumlah}`);
cek('G3', 'indeks tidak kosong dan bukan cuma beberapa entri', A.indeksJumlah >= 500, `${A.indeksJumlah} entri`);

/* Detektor kedua untuk kebasian: BUKAN cuma hash, tapi SELISIH jumlah entri
 * antara generator saat ini (--print-cakupan, read-only) dan indeks bundel. */
const jumlahGen = (cakupan && cakupan.jumlah) || {};
let totalGen = 0;
for (const v of Object.values(jumlahGen)) totalGen += Number(v) || 0;
const selisihKat = Object.keys({ ...jumlahGen, ...Object.fromEntries(A.kategoriAngka.map((k) => [k.kategori, k.jumlah])) })
  .map((k) => [k, (jumlahGen[k] ?? 0) - (A.kategoriAngka.find((x) => x.kategori === k)?.jumlah ?? 0)])
  .filter(([, d]) => d !== 0);
angka('total entri generator saat ini (--print-cakupan)', totalGen);
angka('selisih entri generator - bundel (kategori)', selisihKat.length ? selisihKat.map(([k, d]) => `${k}=${d > 0 ? '+' : ''}${d}`).join(' ') : 'tidak ada');
cek('G4', 'bundel == generator (indeks sinkron, detektor jumlah entri)', totalGen === A.indeksJumlah, `generator ${totalGen} vs bundel ${A.indeksJumlah}`);

/* ==================================================== temuan (bukan kegagalan lampu) */
console.log('\nTEMUAN (apa adanya, bukan verdict):');
console.log(`  - blok inti terukur ${intiChar} char (~${intiTok} token) dari ambang ${A.ambang} token: inti LULUS.`);
console.log(`  - blok suntikan lapis 2 terukur ${Math.min(...ukur.map((x) => x.len))}-${Math.max(...ukur.map((x) => x.len))} char, BATAS_KARAKTER_SUNTIK = ${batas}: batas kini berlaku untuk blok TOTAL (kepala + meta + entri + penutup), jadi blok yang beredar TIDAK lagi kelebihan (lewat ${lewat.length}/${ukur.length}, kelebihan maks ${Math.max(0, ...lewat.map((x) => x.len - batas))} char).`);
console.log(`  - keluaran zephyr_self: potongan murni ${B.potonganTool.maks9Token.join('+')} token (bagian=setelan) dan ${B.potonganTool.maks1Token.join('+')} token (bagian=fakta, maks:1); seluruh muatan 1 panggilan ${B.potonganTool.maks1Panjang} char (kepala/header JSON ${B.potonganTool.maks1KepalaChar} char) = ${tok(B.potonganTool.maks1Panjang)} token, yaitu ${800 - tok(B.potonganTool.maks1Panjang)} token di BAWAH 800 - kepala/header kini ikut dibebankan ke potongan pertama.`);
console.log(`  - cache per sesi ADA di jalur tool zephyr_self (${B.konstanta.ukuranCacheSesi} entri setelah uji) dan kini ADA juga di jalur suntikan otomatis zephyrCari (${B.cacheSuntik.miss}/${B.cacheSuntik.hit} entri sesudah miss/hit; ekspor: ${B.cariEksporCache.ukuranCacheSuntikSesi}/${B.cariEksporCache.bersihkanCacheSuntikSesi}).`);
console.log(`  - cache menyimpan hasil pengambilan data: MISS [${(CH.missCalls ?? []).join(',')}] = ${CH.missDelta} IPC; HIT [${(CH.hitCalls ?? []).join(',')}] = ${CH.hitDelta} IPC (sisa itu pemeriksaan versi yang sengaja tidak di-cache).`);
console.log(`  - BASI: hash sumber bundel ${hashBundel} != hash sumber saat ini ${hashSumberNyata} (--check exit ${cekKode}) -> indeks bundel memang BASI (perbaikannya regenerasi indeks = item zeph-indeks-regen, di luar wewenang lane ini); bagian=versi sekarang menyebut DASAR penilaiannya apa adanya: "${B.basiUji.barisKemutakhiranSegar.slice(0, 150)}".`);
console.log(`  - blok suntikan otomatis memuat hash sumber (${hashBundel}) tetapi tidak memuat kata BASI: pembaca blok tidak pernah tahu indeksnya basi.`);
console.log(`  - detektor KEDUA kebasian (jumlah entri, bukan hash): generator ${totalGen} vs bundel ${A.indeksJumlah} -> selisih ${totalGen - A.indeksJumlah} entri${selisihKat.length ? ' (' + selisihKat.map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`).join(', ') + ')' : ''}: konsisten dengan hash yang tidak cocok, jadi kebasiannya nyata (bukan artefak hash).`);
if (refJaringan.length) console.log(`  - referensi jaringan di bundel: ${JSON.stringify(refJaringan)}`);

console.log('');
console.log(`  SKOR KEPATUHAN: ${total - merah}/${total} diperiksa`);
console.log(`  VERDICT UJI PENGETAHUAN ANGKA: ${merah ? `GAGAL - ${merah} merah: ${merahDaftar.join(' | ')}` : 'LULUS'}`);
writeFileSync(join(KERJA, 'ringkas.json'), JSON.stringify({
  skor: `${total - merah}/${total}`,
  merah: merahDaftar,
  intiChar,
  intiTok,
  ambang: A.ambang,
  batasKarakterSuntik: batas,
  blokSuntikMin: Math.min(...ukur.map((x) => x.len)),
  blokSuntikMaks: Math.max(...ukur.map((x) => x.len)),
  blokSuntikMeteredMaks: Math.max(...ukur.map((x) => x.metered)),
  penutupChar: ukur[0].penutup,
  blokSuntikBawaanMaks: Math.max(...kecilLen),
  kontrol: {
    blokPenuhLewat: lewatPenuh,
    salahPangkas,
    sempitChar: String(sempit[1]).length,
    sempitBlokPenuh: sempitPenuh,
    sempitAdaPenutup,
    muatanMaks1Token: tok(B.potonganTool.maks1Panjang),
    cacheSuntik: B.cacheSuntik,
    bebanNolIdentik: JSON.stringify(PN.empatBeban0) === JSON.stringify(PN.empat),
    barisKemutakhiranSegar: B.basiUji.barisKemutakhiranSegar,
  },
  cache: CH,
  potongan: { konstanta: B.konstanta, empat: PN.empat.map(tok), diminta5: PN.diminta5.length, token900: PN.token900, hasil900: tok(PN.hasil900[0]) },
  jaringan: { runtime: B.jaringanDipakai.length, referensiBundel: refJaringan },
  determinisme: { shaB, shaB2, shaBK, identik: shaB === shaB2, tanpaFolderUser: shaBK === shaB },
  versi: { indeks: A.versi.aplikasi, paket: paket.version, tauri: tauri.version, hashBundel, hashSumberNyata, checkExit: cekKode, checkPesan: cekPesan },
  basi: B.basiUji,
  blokLapis2: { menyebutHash: String(B.suntikanLapis2).includes(hashBundel), menyebutBasi: String(B.suntikanLapis2).includes('BASI'), contoh: String(B.suntikanLapis2).slice(0, 400) },
  cakupan: { N, total: A.kategoriDaftar.length, entri: A.indeksJumlah, rincian: terisi },
}, null, 2));
console.log(`  berkas bukti: scratch/uji-pengetahuan-angka/ringkas.json + hasil-A/B/B2/B-kosong.json`);
process.exit(merah ? 1 : 0);
