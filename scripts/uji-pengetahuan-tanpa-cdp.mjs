/*
 * UJI-PENGETAHUAN-TANPA-CDP - lapis deterministik dari uji "Zeph tahu Zephyr",
 * tanpa app, tanpa CDP, tanpa jaringan.
 *
 * Kenapa terpisah: `scripts/cek-pengetahuan-2lapis.mjs` mengukur ARAK prompt
 * yang benar-benar dikirim ke provider, jadi ia WAJIB menyambung ke CDP
 * (app dengan remote debugging). Kalau app tidak diluncurkan dengan
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223, skrip itu
 * keluar dengan kode 2 ("tidak bisa diukur") dan tidak ada bukti apa pun.
 * Skrip ini menutup celah itu: ia membundel `src/lib/systemPrompt.ts` dengan
 * store DISUNTIK STUB, merakit prompt persis lewat `systemPromptFor()`, lalu
 * memeriksa isinya terhadap SUMBER KEBENARAN yang ikut dibundel
 * (`zephyrFakta.ts`, `zephyrIndeks.ts`) - bukan terhadap salinan yang ditulis
 * ulang di sini. Tidak ada jawaban model yang dikarang; yang diperiksa adalah
 * apa yang masuk ke prompt.
 *
 * Jalan: node scripts/uji-pengetahuan-tanpa-cdp.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-pengetahuan-tanpa-cdp');
mkdirSync(KERJA, { recursive: true });

const gagal = [];
const lulus = [];
const temuan = [];
const catat = (nama, benar, pesan) => {
  (benar ? lulus : gagal).push(nama);
  console.log(`  ${benar ? 'OK   ' : 'GAGAL'} ${nama.padEnd(48)} ${pesan}`);
};
const cacat = (nama, pesan) => {
  temuan.push(nama);
  console.log(`  CACAT ${nama.padEnd(48)} ${pesan}`);
};
const info = (nama, pesan) => console.log(`  INFO  ${nama.padEnd(50)} ${pesan}`);

/* ------------------------------------------------------------------ *
 * Bundel: store disuntik stub HANYA untuk systemPrompt.ts
 * ------------------------------------------------------------------ */
const MODUL_STUB = new Set([
  './store',
  './commands',
  './personaStore',
  './zephyrRuntime',
  './mcpTools',
  './aiZephyrState',
  './terminalStore',
  './historyStore',
  './aiMemori',
]);

const SUMBER_STUB = `
const ambil = () => globalThis.__UJI_PENGETAHUAN_STATE__ ?? {};
export const useStore = { getState: ambil, setState: () => {}, subscribe: () => () => {} };
export const useTerminal = { getState: ambil };
export const useHistory = { getState: ambil };
export const fsRead = async () => '';
export const instructionRead = async () => '';
export const blokPersona = () => ({ identitas: '', caraKerja: '', aturan: '' });
export const personaAktif = () => ({ nama: 'Zeph' });
export const blokKeadaan = () => '';
export const blokKeadaanRingkas = () => '';
export const mcpTerpotong = () => [];
export const blokMemoriTersimpan = () => '';
export const BATAS_TOKEN_BAWAAN = 2000;
`;

const penyuntikStub = {
  name: 'suntik-store-zephyr',
  setup(build) {
    build.onResolve({ filter: /^\.\/[A-Za-z]+$/ }, (args) => {
      if (!args.importer.replace(/\\/g, '/').endsWith('/src/lib/systemPrompt.ts')) return undefined;
      if (!MODUL_STUB.has(args.path)) return undefined;
      return { path: 'zephyr-stub', namespace: 'stub-zephyr' };
    });
    build.onLoad({ filter: /.*/, namespace: 'stub-zephyr' }, () => ({ contents: SUMBER_STUB, loader: 'js' }));
  },
};

await esbuild.build({
  entryPoints: [
    path.join(AKAR, 'src', 'lib', 'systemPrompt.ts'),
    path.join(AKAR, 'src', 'lib', 'zephyrFakta.ts'),
    path.join(AKAR, 'src', 'lib', 'zephyrIndeks.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
  outdir: KERJA,
  outExtension: { '.js': '.mjs' },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"test"',
    'import.meta.env.SSR': 'false',
  },
  plugins: [penyuntikStub],
});

globalThis.__UJI_PENGETAHUAN_STATE__ = {
  workspace: null,
  settings: {
    general: { uiLang: 'en' },
    models: { answerLang: 'follow', answerStyle: 'short' },
    agents: { customInstructions: '' },
  },
  ai: {},
  history: {},
  terminal: {},
};

const sp = await import(pathToFileURL(path.join(KERJA, 'systemPrompt.mjs')).href);
const fakta = await import(pathToFileURL(path.join(KERJA, 'zephyrFakta.mjs')).href);
const indeks = await import(pathToFileURL(path.join(KERJA, 'zephyrIndeks.mjs')).href);

const rakit = (kueri, gaya = 'short') =>
  sp.systemPromptFor('follow', '', '', 'gpt-test', 'provider-test', gaya, kueri);

console.log('UJI PENGETAHUAN ZEPHYR - TANPA CDP (141+163, lapis deterministik)');

/* ------------------------------------------------------------------ *
 * (A) Sumber kebenaran
 * ------------------------------------------------------------------ */
const TEKS_FAKTA = String(fakta.FAKTA_ZEPHYR ?? '');
const TEKS_INTI = String(sp.faktaInti?.() ?? '');
const TEKS_MODEL = String(sp.faktaModelAi?.() ?? '');
const ENTRI = indeks.FAKTA_INDEKS ?? [];
console.log('\n(A) sumber kebenaran yang dibundel dari src/lib/');
catat('zephyrFakta.FAKTA_ZEPHYR terbaca', TEKS_FAKTA.length > 3000, `${TEKS_FAKTA.length} char`);
catat('systemPrompt.faktaInti() terbaca', TEKS_INTI.length > 3000, `${TEKS_INTI.length} char (fakta - bullet model)`);
catat('systemPrompt.faktaModelAi() terbaca', TEKS_MODEL.length > 100, `${TEKS_MODEL.length} char (bullet yang dipotong)`);
catat('zephyrIndeks.FAKTA_INDEKS terbaca', ENTRI.length >= 100, `${ENTRI.length} entri`);

/* ------------------------------------------------------------------ *
 * (B) Prompt untuk pesan NETRAL (tanpa kata kunci topik apa pun)
 * ------------------------------------------------------------------ */
const NETRAL = 'berapa jumlah berkas di folder ini?';
const promptNetral = rakit(NETRAL);
console.log('\n(B) prompt pesan netral: "' + NETRAL + '"');
catat('memuat faktaInti() UTUH', promptNetral.includes(TEKS_INTI), promptNetral.includes(TEKS_INTI) ? 'utuh, tidak terpotong' : 'ADA FAKTA YANG HILANG');
catat('bullet model DIPOTONG dari blok inti', !promptNetral.includes(TEKS_MODEL), promptNetral.includes(TEKS_MODEL) ? 'ikut - PEMOTONGAN TIDAK JALAN' : 'tidak ikut (memang dipotong, dipulihkan di C)');
catat('menyebut port MCP 9222', /9222/.test(promptNetral), 'ada');
catat('menyebut port CDP 9223', /9223/.test(promptNetral), 'ada');
catat('menyebut port dev UI 5173', /5173/.test(promptNetral), 'ada');
catat('menyebut tool zephyr_self', /zephyr_self/.test(promptNetral), 'ada');
catat('menyebut bridge __ZEPHYR_PROMPT__', /__ZEPHYR_PROMPT__/.test(promptNetral), 'ada');
catat('memuat aturan bahasa giliran ini', /# Language for this turn/.test(promptNetral), 'ada');
catat('TIDAK memuat blok kondisional', sp.blokKondisional(NETRAL) === '', 'kosong (benar: tidak ada topik yang cocok)');
catat('ukuran prompt wajar (<= 60k char)', promptNetral.length <= 60000, `${promptNetral.length} char`);

/* ------------------------------------------------------------------ *
 * (C) Kelas kondisional - aturan topik menempel hanya saat topiknya dibahas
 * ------------------------------------------------------------------ */
console.log('\n(C) kelas kondisional (kata kunci -> blok tambahan)');
const kasus = [
  ['bandingkan setelan editor dan terminal', 'tabel', '# Extra rule: answer shape', 'aturan bentuk (tabel markdown)'],
  ['pengen ganti api key provider model', 'model', TEKS_MODEL, 'bullet fakta model yang dipotong dari blok inti'],
  ['pindahkan panel terminal ke bawah', 'jendela', 'Ctrl+Shift+A', 'kunci setelan + pintasan bawaan'],
  ['zephyr crash terus, lihat log mana?', 'galat', '9223 is the WebView2 CDP', 'urutan bukti + arti port 9223'],
  ['aman tidak kalau saya tempel password ke chat?', 'keamanan', 'Never print the value', 'larangan mencetak rahasia'],
];
for (const [kueri, kelas, harusAda, apa] of kasus) {
  const kelasNyata = sp.kelasKondisional(kueri);
  const p = rakit(kueri);
  const benar = kelasNyata.includes(kelas) && p.includes(harusAda);
  catat(`kelas '${kelas}' untuk "${kueri.slice(0, 30)}"`, benar, benar ? `[${kelasNyata.join(',')}] + ${apa}` : `[${kelasNyata.join(',')}] tapi ${apa} TIDAK ADA di prompt`);
}
const kueriGanda = 'password api key model openai';
const kelasGanda = sp.kelasKondisional(kueriGanda);
catat('kelas ganda terdeteksi (keamanan+model)', kelasGanda.length >= 2, `[${kelasGanda.join(',')}]`);
const kelasInggris = sp.kelasKondisional('compare the two settings');
catat('kata kunci Inggris juga jalan (compare)', kelasInggris.includes('tabel'), `[${kelasInggris.join(',')}]`);

/* ------------------------------------------------------------------ *
 * (D) Negatif - isi berkas tidak boleh bocor ke prompt
 * ------------------------------------------------------------------ */
console.log('\n(D) negatif - badan berkas tidak boleh bocor ke prompt');
for (const [nama, tanda] of [
  ['fungsi sumber systemPrompt', 'export function instruksiGaya'],
  ['deklarasi indeks', 'export const FAKTA_INDEKS'],
  ['jalur berkas sumber', 'src/lib/zephyrCari.ts'],
  ['isi zephyrCari', 'KAMUS_INDEKS'],
]) {
  catat(`bukan bocoran: ${nama}`, !promptNetral.includes(tanda), promptNetral.includes(tanda) ? 'BOCOR ke prompt' : 'tidak ada (benar)');
}

/* ------------------------------------------------------------------ *
 * (E) Fakta kunci ada di INDEKS juga (jalur `zephyr_self`)
 * ------------------------------------------------------------------ */
console.log('\n(E) pertanyaan user terjawab dari indeks zephyr_self (bukan dari hafalan)');
const adaDiIndeks = (cari) => ENTRI.some((e) => (String(e[1]) + ' ' + String(e[2])).toLowerCase().includes(cari.toLowerCase()));
for (const [nama, cari] of [
  ['setelan answerStyle', 'answerStyle'],
  ['port 9223', '9223'],
  ['grup setelan models', 'models'],
  ['pintasan Ctrl+J', 'Ctrl+J'],
  ['perintah ai.models', 'ai.models'],
]) {
  catat(`indeks memuat ${nama}`, adaDiIndeks(cari), adaDiIndeks(cari) ? 'ada' : 'TIDAK ADA di indeks');
}

/* ------------------------------------------------------------------ *
 * (F) Sinkron sumber: berkas fakta tidak boleh basi
 * ------------------------------------------------------------------ */
console.log('\n(F) daftar berkas sumber fakta (FAKTA_ZEPHYR_SUMBER)');
const daftarSumber = fakta.FAKTA_ZEPHYR_SUMBER ?? [];
const hilang = [];
for (const rel of daftarSumber) {
  try {
    readFileSync(path.join(AKAR, rel));
  } catch {
    hilang.push(rel);
  }
}
catat('semua berkas sumber fakta masih ada di disk', hilang.length === 0, hilang.length ? `hilang: ${hilang.join(', ')}` : `${daftarSumber.length} berkas`);

/* ------------------------------------------------------------------ *
 * (G) CACAT bentuk jawaban (item 149) - DILAPORKAN, tidak difix di sini
 *     karena `src/lib/systemPrompt.ts` milik lane lain.
 * ------------------------------------------------------------------ */
console.log('\n(G) cacat bentuk jawaban (item 149) - laporkan, jangan diamkan');
const promptTabel = rakit('bandingkan setelan editor dan terminal');
const iTabel = promptTabel.indexOf('# Extra rule: answer shape');
const iGaya = promptTabel.indexOf('# Answer style: short');
if (iTabel >= 0 && iGaya > iTabel) {
  cacat(
    'batas 3 kalimat menimpa aturan tabel',
    `blok tabel di offset ${iTabel}, blok gaya di offset ${iGaya} -> gaya dibaca SESUDAH aturan tabel (systemPrompt.ts:1065 blokKondisional vs :1123-1124 instruksiGaya); default answerStyle short (:603-604) meminta at most 3 sentences sehingga bertabrakan dengan perintah tabel (:868-875, regex di :870)`
  );
} else {
  catat('aturan tabel tidak dilawan batas gaya', iTabel >= 0 && iGaya > iTabel, `tabel@${iTabel} gaya@${iGaya}`);
}
const promptDetail = rakit('bandingkan setelan editor dan terminal', 'detail');
cacat(
  'panjang jawaban tidak terukur tanpa CDP',
  `panjang prompt uji: short=${promptTabel.length} char vs detail=${promptDetail.length} char (selisih ${promptDetail.length - promptTabel.length}) - ini penanda setelan, BUKAN panjang jawaban; jawaban nyata hanya terukur lewat scripts/cek-pengetahuan-2lapis.mjs (butuh CDP)`
);

/* ------------------------------------------------------------------ *
 * Verdict
 * ------------------------------------------------------------------ */
const tuntas = gagal.length === 0;
console.log('');
console.log(`  SKOR: ${lulus.length} lulus / ${lulus.length + gagal.length} diperiksa${temuan.length ? ` | ${temuan.length} CACAT dilaporkan (lane lain)` : ''}`);
console.log(`  VERDICT JALUR PENGETAHUAN: ${tuntas ? 'LULUS' : `GAGAL - ${gagal.length} merah`}`);
if (temuan.length) console.log(`  CACAT TERBUKA (bukan lane ini, src/lib/systemPrompt.ts): ${temuan.join(' | ')}`);
console.log('  Catatan: ini lapis DETERMINISTIK (prompt + indeks). Lapis 2 (jawaban');
console.log('  nyata dari provider) hanya jalan dengan app + CDP hidup:');
console.log('  node scripts/cek-pengetahuan-2lapis.mjs');
process.exit(tuntas ? 0 : 1);
