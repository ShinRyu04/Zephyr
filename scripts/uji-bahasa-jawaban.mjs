/*
 * UJI-BAHASA-JAWABAN - gate bahasa jawaban Zeph (item ZEPH-NGAWUR-BAHASA).
 *
 * Kenapa gate ini ada
 * -------------------
 * Keluhan nyata: Zeph menjawab dalam bahasa INGGRIS padahal ditanya dalam
 * bahasa Indonesia, dan pesan pendek yang berisi istilah teknis Inggris
 * ("token", "commit", "file") paling sering kena.
 *
 * Bahasa jawaban ditentukan `deteksiBahasaGiliran()` + `instruksiBahasa()` di
 * `src/lib/systemPrompt.ts`, dan hasilnya DISISIPKAN PALING DEPAN prompt
 * (`systemPromptFor`, baris ~779). Kalau deteksi mengembalikan `null`, blok
 * bahasa TIDAK ADA SAMA SEKALI - dan prompt sisanya nyaris seluruhnya bahasa
 * Inggris, jadi model menjawab Inggris. Gate ini mengukur persis titik itu.
 *
 * DUA LAPIS (sesuai keputusan)
 * ----------------------------
 *   LAPIS A - DETERMINISTIK, selalu jalan, tanpa jaringan dan tanpa app:
 *     `src/lib/systemPrompt.ts` dibundel lewat esbuild API dengan modul store
 *     disuntik STUB, lalu fungsi murni dipanggil langsung:
 *       - `deteksiBahasaGiliran()`  (murni, tidak menyentuh store)
 *       - `instruksiBahasa()`       (murni, tidak menyentuh store)
 *       - `systemPromptFor()`       (perakit prompt; store = stub terkendali)
 *       - `identityReminder()`      (sufiks di ujung pesan user)
 *     Tidak ada satu pun jawaban model yang dikarang di sini.
 *
 *   LAPIS B - OPSIONAL, butuh BUKTI NYATA: kalau ada berkas jawaban tersimpan
 *     (tembolok/arsip) di `scratch/jawaban/*.json`, bahasanya diperiksa
 *     terhadap bahasa pertanyaannya. Tanpa berkas -> cetak 'TIDAK DIUJI'.
 *     Gate ini TIDAK PERNAH mengarang jawaban untuk bisa "lulus".
 *
 * Jalan: node scripts/uji-bahasa-jawaban.mjs
 *        node scripts/uji-bahasa-jawaban.mjs --json
 */
import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-bahasa-jawaban');
const JSON_KELUAR = process.argv.includes('--json');
mkdirSync(KERJA, { recursive: true });

/* ------------------------------------------------------------------ *
 * Bundel `src/lib/systemPrompt.ts` dengan store disuntik stub.
 * ------------------------------------------------------------------ */

/* Modul yang menyentuh browser/Tauri/app; hanya NAMA-nya yang dipakai perakit
   prompt, jadi stub yang menjawab bentuknya sudah cukup untuk menguji logika
   bahasa. `./zephyrCari` -> `./zephyrIndeks` TIDAK distub: suntikan indeks
   nyata ikut teruji. */
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
const ambil = () => globalThis.__UJI_BAHASA_STATE__ ?? {};
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
      /* Hanya stub kalau yang MENGIMPOR adalah systemPrompt.ts sendiri. Modul
         lain di graf (zephyrCari -> zephyrIndeks) tetap apa adanya. */
      if (!args.importer.replace(/\\/g, '/').endsWith('/src/lib/systemPrompt.ts')) return undefined;
      if (!MODUL_STUB.has(args.path)) return undefined;
      return { path: 'zephyr-stub', namespace: 'stub-zephyr' };
    });
    build.onLoad({ filter: /.*/, namespace: 'stub-zephyr' }, () => ({
      contents: SUMBER_STUB,
      loader: 'js',
    }));
  },
};

const KELUARAN_BUNDEL = path.join(KERJA, 'systemPrompt.bundle.mjs');

await esbuild.build({
  entryPoints: [path.join(AKAR, 'src', 'lib', 'systemPrompt.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
  outfile: KELUARAN_BUNDEL,
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"test"',
    'import.meta.env.SSR': 'false',
  },
  plugins: [penyuntikStub],
});

/* Keadaan store yang dikendalikan gate. `uiLang` = bahasa LABEL blok prompt
   (tetap bahasa UI), bahasa JAWABAN ditentukan pesan user giliran ini. */
function pasang(setelan = {}) {
  globalThis.__UJI_BAHASA_STATE__ = {
    workspace: null,
    settings: {
      general: { uiLang: 'en', ...(setelan.uiLang ? { uiLang: setelan.uiLang } : {}) },
      models: { answerLang: 'follow', ...(setelan.answerLang ? { answerLang: setelan.answerLang } : {}) },
      agents: { customInstructions: '' },
    },
    ai: {},
    history: {},
    terminal: {},
  };
}

pasang();
const sp = await import(pathToFileURL(KELUARAN_BUNDEL).href);

if (typeof sp.deteksiBahasaGiliran !== 'function' || typeof sp.instruksiBahasa !== 'function') {
  console.error('GAGAL BUNDEL: deteksiBahasaGiliran/instruksiBahasa tidak ada di modul hasil bundel');
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * Pemeriksaan
 * ------------------------------------------------------------------ */
const gagal = [];
const lulus = [];
const catat = (nama, benar, pesan) => {
  (benar ? lulus : gagal).push(nama);
  if (!JSON_KELUAR) console.log(`  ${benar ? 'OK   ' : 'GAGAL'} ${nama.padEnd(46)} ${pesan}`);
  return benar;
};

const judul = (t) => {
  if (!JSON_KELUAR) console.log(`\n${t}`);
};

if (!JSON_KELUAR) console.log('UJI BAHASA JAWABAN (ZEPH-NGAWUR-BAHASA)');

/* ---------------- LAPIS A1: kontrak deteksi (murni) ---------------- */
judul('LAPIS A1 - deteksiBahasaGiliran() menurut kontraknya sendiri');

const KASUS_KONTRAK = [
  /* [teks, harap] - harap = kode bahasa, atau null kalau "tidak menebak" */
  ['lanjut', 'id'],
  ['bagus', 'id'],
  ['apa itu', 'id'],
  ['tolong jelaskan', 'id'],
  ['kenapa begitu', 'id'],
  ['tadi ada error', 'id'],
  ['gimana cara buka settings', 'id'],
  ['perbaiki ini', 'id'],
  ['hapus file itu', 'id'],
  ['mana tabelnya', 'id'],
  ['what is a token', 'en'],
  ['please open the file', 'en'],
  ['where is the panel', 'en'],
  ['что такое токен', 'ru'],
  ['これは何ですか', 'ja'],
  ['', null],
  ['   ', null],
  ['file', null],
  ['token commit', null],
  ['ok', null],
];

for (const [teks, harap] of KASUS_KONTRAK) {
  const hasil = sp.deteksiBahasaGiliran(teks);
  const kode = hasil ? hasil.kode : null;
  catat(
    `deteksi ${JSON.stringify(teks).slice(0, 34)}`,
    kode === harap,
    `harap ${harap ?? 'null'} -> dapat ${kode ?? 'null'}`,
  );
}

/* ---------------- LAPIS A2: pertanyaan INDONESIA nyata ---------------- */
judul('LAPIS A2 - pertanyaan Indonesia nyata WAJIB terdeteksi "id" (keluhan user)');

const KASUS_NYATA = [
  'buka file ini',
  'cek panel output ya',
  'jelaskan commit yang barusan',
  'dimana pengaturan tema',
  'kok jawabannya jadi inggris?',
  'kasih contoh',
  'buka file',
  'kenapa error',
  'cara buka Settings',
  'yang tadi itu apa',
];

const celah = [];
for (const teks of KASUS_NYATA) {
  const hasil = sp.deteksiBahasaGiliran(teks);
  const kode = hasil ? hasil.kode : null;
  const benar = kode === 'id';
  if (!benar) celah.push(teks);
  catat(`nyata ${JSON.stringify(teks).slice(0, 36)}`, benar, `harap id -> dapat ${kode ?? 'null'}`);
}

/* ---------------- LAPIS A3: instruksiBahasa() ---------------- */
judul('LAPIS A3 - instruksiBahasa() mengikat bahasa giliran ini');
pasang();
const JUDUL_BLOK = '# Language for this turn';

const i1 = sp.instruksiBahasa('follow', 'apa itu token?');
catat('A3.1 blok ada saat kueri Indonesia', i1.includes(JUDUL_BLOK) && /Indonesian/.test(i1), i1.split('\n')[0] || '(kosong)');

const i2 = sp.instruksiBahasa('follow', 'what is a token?');
catat('A3.2 blok bahasa Inggris', i2.includes(JUDUL_BLOK) && /\bEnglish\b/.test(i2), i2.split('\n')[0] || '(kosong)');

const i3 = sp.instruksiBahasa('follow', '');
catat('A3.3 kueri kosong -> TIDAK menebak (blok kosong)', i3 === '', i3 === '' ? 'kosong (benar)' : 'mengisi blok tanpa dasar');

const i4 = sp.instruksiBahasa('en', 'tolong jelaskan ini');
catat('A3.4 kunci Setelan menang atas pesan', /\bEnglish\b/.test(i4) && !/Indonesian/.test(i4), i4.split('\n')[1] || '(kosong)');

const i5 = sp.instruksiBahasa('id', 'what is this');
catat('A3.5 kunci Indonesia menang atas pesan Inggris', /Indonesian/.test(i5), i5.split('\n')[1] || '(kosong)');

catat(
  'A3.6 blok menyebut materi rujukan berbahasa Inggris',
  /written in English/.test(i1) || /read them as sources/.test(i1),
  'ya/tidak',
);

/* ---------------- LAPIS A4: prompt terakit ---------------- */
judul('LAPIS A4 - systemPromptFor() menaruh aturan bahasa di KEPALA prompt');
pasang();
const pId = sp.systemPromptFor('follow', '', '', 'gpt-test', 'provider-test', 'normal', 'apa itu commit?');
const baris1 = pId.split('\n')[0];
catat('A4.1 baris pertama = blok bahasa', baris1.startsWith(JUDUL_BLOK), baris1);
catat('A4.2 blok bahasa menyebut Indonesian', /Indonesian/.test(pId.split('\n\n')[0]), pId.split('\n\n')[0].split('\n')[1] || '(kosong)');
catat(
  'A4.3 label blok tetap bahasa Inggris',
  pId.includes('# What Zephyr is') || pId.includes('# Model running you'),
  'label EN ditemukan',
);
catat(
  'A4.4 prompt memuat fakta + indeks nyata',
  pId.includes('zephyr_self') && pId.length > 4000,
  `${pId.length} char, menyebut zephyr_self: ${pId.includes('zephyr_self')}`,
);

pasang();
const pEn = sp.systemPromptFor('follow', '', '', 'gpt-test', 'provider-test', 'normal', 'what is a commit?');
catat('A4.5 kueri Inggris -> baris pertama blok bahasa English', /\bEnglish\b/.test(pEn.split('\n\n')[0]), pEn.split('\n')[0]);

/* Label blok proyek ikut bahasa UI (`aturanRute`/`blokUntuk`), sedangkan
   bahasa JAWABAN ikut pesan user. Aturan= non-kosong supaya label itu benar-
   benar diemit (systemPromptFor hanya menambah labelnya kalau ada isinya). */
pasang();
const pLabelEn = sp.systemPromptFor('follow', '', '- pakai TypeScript', 'gpt-test', 'provider-test', 'normal', 'what is a commit?');
pasang({ uiLang: 'id' });
const pLabelId = sp.systemPromptFor('follow', '', '- pakai TypeScript', 'gpt-test', 'provider-test', 'normal', 'what is a commit?');
catat(
  'A4.6 uiLang=id -> LABEL blok Indonesia',
  pLabelId.includes('# Aturan proyek') && !pLabelEn.includes('# Aturan proyek'),
  pLabelId.includes('# Aturan proyek') ? 'label ID ada (uiLang=id)' : 'label ID tidak muncul - periksa systemPromptLanguages.ts',
);
catat(
  'A4.7 bahasa jawaban tetap ikut PESAN, bukan UI',
  /\bEnglish\b/.test(pLabelId.split('\n\n')[0]),
  pLabelId.split('\n\n')[0].split('\n')[1] || '(kosong)',
);

/* ---------------- LAPIS A5: identityReminder() ---------------- */
judul('LAPIS A5 - identityReminder() (sufiks di ujung pesan user)');
pasang();
const r1 = sp.identityReminder('gpt-test', 'apa itu token?');
catat('A5.1 sufiks memaksa Indonesian', /Answer in Indonesian/.test(r1), (r1.match(/Answer in [^\n.]*/) ?? ['(tidak ada)'])[0]);
const r2 = sp.identityReminder('gpt-test', 'what is a token?');
catat('A5.2 sufiks memaksa English', /Answer in English/.test(r2), (r2.match(/Answer in [^\n.]*/) ?? ['(tidak ada)'])[0]);
const r3 = sp.identityReminder('gpt-test', 'token commit');
catat('A5.3 kueri ambigu -> TIDAK menempel sufiks', !/Answer in /.test(r3), /Answer in /.test(r3) ? 'menempel tanpa dasar' : 'bersih (benar)');

/* ---------------- LAPIS B: bukti jawaban NYATA (opsional) ---------------- */
judul('LAPIS B - bahasa jawaban NYATA (butuh berkas bukti)');
const ARSIP = path.join(AKAR, 'scratch', 'jawaban');
let lapisB = 'TIDAK DIUJI';
let berkasB = 0;
if (existsSync(ARSIP)) {
  const daftar = readdirSync(ARSIP).filter((f) => f.endsWith('.json'));
  berkasB = daftar.length;
  let bGagal = 0;
  for (const f of daftar) {
    try {
      const isi = JSON.parse(readFileSync(path.join(ARSIP, f), 'utf8'));
      const tanya = String(isi.tanya ?? isi.question ?? '');
      const jawab = String(isi.jawab ?? isi.answer ?? '');
      const harap = sp.deteksiBahasaGiliran(tanya);
      if (!harap || !jawab.trim()) continue;
      const dapat = sp.deteksiBahasaGiliran(jawab.slice(0, 600));
      const cocok = !dapat || dapat.kode === harap.kode;
      if (!cocok) bGagal += 1;
      catat(`B ${f}`, cocok, `tanya ${harap.kode} -> jawab ${dapat ? dapat.kode : '?'}`);
    } catch (e) {
      bGagal += 1;
      catat(`B ${f}`, false, `tidak bisa dibaca: ${e.message}`);
    }
  }
  lapisB = bGagal === 0 ? `LULUS (${berkasB} berkas)` : `GAGAL (${bGagal}/${berkasB} berkas)`;
} else {
  if (!JSON_KELUAR) console.log(`  LEWAT  lapis B                                     TIDAK DIUJI - tidak ada ${path.relative(AKAR, ARSIP)}`);
}

/* ---------------- verdict ---------------- */
const tuntas = gagal.length === 0;
if (JSON_KELUAR) {
  console.log(
    JSON.stringify(
      { lulus: lulus.length, gagal, celah, lapisB, berkasB, verdict: tuntas ? 'LULUS' : 'GAGAL' },
      null,
      2,
    ),
  );
} else {
  console.log('');
  console.log(`  LAPIS B: ${lapisB}`);
  if (celah.length) {
    console.log('  CELAH DETEKSI (pertanyaan Indonesia yang TIDAK terbaca):');
    for (const c of celah) console.log(`    - ${JSON.stringify(c)}`);
    console.log('    Perbaikan ada di src/lib/systemPrompt.ts:373-390 (daftar kata), BUKAN di gate ini.');
  }
  console.log(`  SKOR: ${lulus.length} lulus / ${lulus.length + gagal.length} diperiksa`);
  console.log(`  VERDICT: ${tuntas ? 'LULUS' : `GAGAL - ${gagal.length} pemeriksaan merah`}`);
}
process.exit(tuntas ? 0 : 1);
