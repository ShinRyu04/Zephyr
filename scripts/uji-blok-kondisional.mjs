#!/usr/bin/env node
/**
 * uji-blok-kondisional.mjs — GATE blok KONDISIONAL prompt Zeph AI.
 * Item: ZEPH-LARANGAN-BLOK + ZEPH-BLOK-KONDISIONAL (2026-10-14).
 *
 * CARA JALAN: `node scripts/uji-blok-kondisional.mjs` (keluar 1 kalau ada GAGAL).
 * Hasil ukur nyata 2026-10-14: 69/69 lulus, 0 gagal.
 *
 * Semua angka anggaran dibaca dari KODE, bukan ditulis di sini:
 *   - `AMBANG_TOKEN_INTI` = 2.000 token = 8.000 char (src/lib/systemPrompt.ts:733)
 *   - `BATAS_KARAKTER_SUNTIK` = 1.200 char per giliran (src/lib/zephyrCari.ts:453)
 *   - token = ceil(char/4) - cara hitung yang sama dengan scripts/uji-blok-inti.mjs
 * Blok inti selalu-nyala = faktaInti() + blokLarangan() + kepalaPotret()
 * (urutan komposisi nyata: systemPrompt.ts:1047-1048).
 *
 * DAFTAR KASUS (69 gate):
 *   A  anggaran per jenis tugas (4 jenis x 2 bahasa)
 *     A.1  blok inti selalu-nyala <= 8.000 char / 2.000 tok
 *     A.2  faktaInti() utuh di setiap rakitan (inti tidak dipotong per pesan)
 *     A.3  suntikan kondisional tiap jenis tugas <= BATAS_KARAKTER_SUNTIK
 *     A.4  jumlah inti + suntikan <= 8.000 char + 1.200 char
 *     A.5  blok PADAT usulan (cara kerja + LARANGAN) + inti <= 8.000 char (id & en)
 *     A.6  blok padat memuat aturan CARA KERJA, bukan cuma larangan
 *     A.7  pemadatan tidak menghilangkan satu pun dari 6 larangan lama
 *     A.8  judul lama (# Batas keras / # Hard limits) tetap ada - uji-blok-inti.mjs C.4/C.8
 *   B  isi blok LARANGAN
 *     B.1  larangan BERBAHAYA lengkap (hapus/pindah/timpa, force push, matikan proses)
 *     B.2  larangan NGARANG lengkap (nilai/berkas, setelan/port/dokumen)
 *     B.3  6 larangan bernomor & unik di id dan en
 *     B.4  larangan benar-benar berada di EKOR blok inti pada rakitan asli
 *   C  hemat di luar topik = NOL suntikan (4 pesan x 2 bahasa)
 *     C.1 nol kelas - C.2 nol teks - C.3 nol judul blok - C.4 nol bullet fakta on-demand
 *   D  SUPERSET: 12 aturan wajib vs aturan terpilih (hilang = MERAH)
 *     per jenis tugas (id & en) - luar topik - kelas terpilih (tiap kelas terdaftar
 *     punya pemicu + buktinya muncul di rakitan) - wajib tak cond (tidak ada aturan
 *     wajib yang cuma hidup di blok kondisional)
 *   E  determinisme: E.1 dua kali pilih dalam satu proses - E.2 proses BARU (spawn) -
 *     E.3 id vs en sama - E.4 teks blok ikut bahasa aktif
 *   F  lapis USULAN (simulasi, bukan kode produk)
 *     F.1 pemicu kelas usulan (klaimnilai, verifikasi) - F.2 blok <= 1.200 char -
 *     F.3 tidak mengulang aturan wajib - F.4 total produk+usulan <= 1.200 char per
 *     jenis tugas - F.5 pemotong tidak membuang kalau anggaran masih muat -
 *     F.6 luar topik tidak menarik kelas usulan
 *   TEMUAN (bukan gate): kombinasi kelas terburuk di kode produk belum dipotong
 *     prioritas (model+keamanan 1.358 char, model+tabel 1.201 char > 1.200 char);
 *     usulannya ada di docs/USULAN-BLOK-KONDISIONAL.md.
 *
 * Teman, bukan pengganti: scripts/uji-blok-inti.mjs (37/37) dan
 * scripts/cek-batas-inti.mjs. Berkas ini menjaga hal yang berbeda: anggota blok
 * yang benar-benar disuntik per giliran, isi blok larangan, kehematan di luar
 * topik, SUPERSET aturan wajib, dan determinisme.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-blok-kondisional');

/* ===================================================================== *
 * 0. ANGKA YANG BERLAKU - dibaca dari kode, tidak ditulis di sini
 * ===================================================================== */

/** Batas suntikan per giliran: dibaca dari `zephyrCari.ts` supaya tidak dikarang. */
function batasSuntik() {
  const teks = readFileSync(join(AKAR, 'src', 'lib', 'zephyrCari.ts'), 'utf8');
  const m = /BATAS_KARAKTER_SUNTIK\s*=\s*(\d+)/.exec(teks);
  if (!m) throw new Error('BATAS_KARAKTER_SUNTIK tidak ditemukan di src/lib/zephyrCari.ts');
  return Number(m[1]);
}
const BATAS_SUNTIK = batasSuntik();
const charTok = (n) => Math.ceil(n / 4);

/* ===================================================================== *
 * 1. PROBE: empat jenis tugas + pesan luar topik
 * ===================================================================== */
const TUGAS = [
  {
    jenis: 'tanya biasa',
    pesan: [
      'apa arti istilah closure di JavaScript',
      'jelaskan singkat beda let dan const',
      'ringkas artikel ini jadi tiga kalimat saja',
    ],
  },
  {
    jenis: 'tulis kode',
    pesan: [
      'tulis fungsi TypeScript untuk memvalidasi format email',
      'buat komponen React kecil untuk menampilkan daftar item',
      'susun unit test untuk fungsi parse tanggal di src/lib/waktu.ts',
    ],
  },
  {
    jenis: 'ubah berkas',
    pesan: [
      'ubah tata letak panel AI di sidebar supaya lebih ringkas',
      'perbaiki error yang muncul di src/lib/waktu.ts',
      'ganti nama berkas konteksZephyr.ts jadi konteksRepo.ts',
    ],
  },
  {
    jenis: 'audit',
    pesan: [
      'audit berkas di src/lib dan laporkan mana yang perlu dibenahi',
      'buat ceklis audit untuk ekstensi yang gagal dimuat',
      'bandingkan port dan setelan panel yang dipakai aplikasi ini',
    ],
  },
];
const LUAR_TOPIK = [
  'apa kabar hari ini, apa rencanamu besok',
  'jelaskan singkat apa itu gaya gravitasi',
  'sebutkan warna langit saat senja',
  'what is the capital of France',
];

/** Pesan pemicu tiap kelas terdaftar: kelas baru tanpa pemicu di sini = GAGAL. */
const PROBE_KELAS = [
  { kelas: 'model', pesan: 'setelan provider model dan API key disimpan di mana' },
  { kelas: 'tabel', pesan: 'tolong tulis tabel perbandingan provider model' },
  { kelas: 'jendela', pesan: 'bagaimana cara membuka panel bawah lewat pintasan' },
  { kelas: 'galat', pesan: 'ekstensiku crash dan gagal dimuat, lihat log-nya' },
  { kelas: 'keamanan', pesan: 'di mana aku menyimpan kunci SSH dan sandi itu' },
  { kelas: 'subagent', pesan: 'pakai subagent paralel untuk audit berkas' },
  /* Dua kelas ini sudah lama ada di produk tetapi tidak pernah punya probe, jadi
     gate "kelas terdaftar tanpa pemicu" melaporkannya sebagai MERAH padahal
     bloknya benar. Teks probe harus memicu HANYA kelasnya sendiri. */
  { kelas: 'patch', pesan: 'apply_patch untuk memindahkan berkas konfigurasi' },
  { kelas: 'eksekusi', pesan: 'jalankan code mode untuk urutan panjang sekaligus' },
];

/** Kata kunci yang HANYA memicu satu kelas: untuk mengukur panjang blok per kelas. */
const KATA_KELAS_TUNGGAL = {
  tabel: 'bandingkan',
  jendela: 'pintasan',
  model: 'provider',
  galat: 'crash',
  keamanan: 'kredensial',
  subagent: 'subagent',
};

/* ===================================================================== *
 * 2. ATURAN: wajib (selalu ikut) vs terpilih (kondisional)
 *    `ttd` = tanda tangan teks yang diperiksa apa adanya di rakitan prompt.
 * ===================================================================== */
const ATURAN = [
  /* --- 6 larangan di blok inti: WAJIB --- */
  {
    id: 'larangan-ngarang',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[1]',
    ttd: { id: ['Jangan mengarang nilai, berkas, setelan, port, atau dokumen'], en: ['Never invent a value, file, setting, port or doc'] },
  },
  {
    id: 'larangan-bahasa',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[2]',
    ttd: { id: ['Jawab dalam bahasa aktif aplikasi'], en: ['Answer in the active language of the app'] },
  },
  {
    id: 'larangan-klaim',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[3]',
    ttd: {
      id: ['Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum'],
      en: ['Never claim you did, ran or fixed something you did not'],
    },
  },
  {
    id: 'larangan-rahasia',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[4]',
    ttd: { id: ['Jangan tampilkan isi rahasia'], en: ['Never print secrets'] },
  },
  {
    id: 'larangan-destruktif',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[5]',
    ttd: { id: ['Jangan panggil tool perusak'], en: ['Never run a destructive tool'] },
  },
  {
    id: 'larangan-ingatan',
    wajib: true,
    kelas: 'inti',
    sumber: 'src/lib/systemPrompt.ts LARANGAN_ID/EN[6]',
    ttd: { id: ['Jangan menjawab pertanyaan soal Zephyr dari ingatan'], en: ['Never answer a Zephyr question from memory'] },
  },
  /* --- cara kerja yang selalu ikut (blok `caraKerja`) --- */
  {
    id: 'carakerja-satu-langkah',
    wajib: true,
    kelas: 'carakerja',
    sumber: 'src/lib/systemPrompt.ts EN/ID.caraKerja[2]',
    ttd: { id: ['Satu langkah, satu tool'], en: ['One step, one tool'] },
  },
  {
    id: 'carakerja-verifikasi',
    wajib: true,
    kelas: 'carakerja',
    sumber: 'src/lib/systemPrompt.ts EN/ID.caraKerja[5]',
    ttd: { id: ['Klaim bukan bukti'], en: ['a claim is not proof'] },
  },
  {
    id: 'carakerja-hemat-tool',
    wajib: true,
    kelas: 'carakerja',
    sumber: 'src/lib/systemPrompt.ts EN/ID.caraKerja[6]',
    ttd: { id: ['Pakai tool hanya kalau memberi info baru'], en: ['Spend a tool call only when it brings something new'] },
  },
  /* --- aturan tetap (blok `aturan`) --- */
  {
    id: 'aturan-output',
    wajib: true,
    kelas: 'aturan',
    sumber: 'src/lib/systemPrompt.ts EN/ID.aturan',
    ttd: { id: ['Jangan mengarang output'], en: ['Never invent output'] },
  },
  {
    id: 'aturan-destruktif-konfirmasi',
    wajib: true,
    kelas: 'aturan',
    sumber: 'src/lib/systemPrompt.ts EN/ID.aturan',
    ttd: {
      id: ['Perintah destruktif (hapus rekursif, hard reset, format disk) harus dikonfirmasi'],
      en: ['Destructive commands (recursive delete, hard reset, disk format) need the user to confirm'],
    },
  },
  {
    id: 'aturan-subagent',
    wajib: true,
    kelas: 'aturan',
    sumber: 'src/lib/systemPrompt.ts EN/ID.aturan',
    ttd: { id: ['JANGAN memunculkan subagent'], en: ['Do NOT spawn subagents'] },
  },
  /* --- terpilih: hanya ikut saat kelasnya terpicu --- */
  {
    id: 'tabel-bentuk',
    wajib: false,
    kelas: 'tabel',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[tabel].teks',
    ttd: { id: ['# Aturan tambahan: bentuk jawaban'], en: ['# Extra rule: answer shape'] },
  },
  {
    id: 'jendela-panel',
    wajib: false,
    kelas: 'jendela',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[jendela].teks',
    ttd: { id: ['# Aturan tambahan: panel & jendela'], en: ['# Extra rule: panels & windows'] },
  },
  {
    id: 'model-fakta',
    wajib: false,
    kelas: 'model',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[model].teks',
    ttd: { id: ['# Fakta tambahan: provider, API key, daftar model'], en: ['# Extra facts: providers, API keys, model list'] },
  },
  {
    id: 'galat-prosedur',
    wajib: false,
    kelas: 'galat',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[galat].teks',
    ttd: { id: ['# Prosedur tambahan: ada yang bermasalah'], en: ['# Extra procedure: something is broken'] },
  },
  {
    id: 'keamanan-rahasia',
    wajib: false,
    kelas: 'keamanan',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[keamanan].teks',
    ttd: { id: ['# Aturan tambahan: rahasia & kredensial'], en: ['# Extra rule: secrets & credentials'] },
  },
  {
    id: 'subagent-anggaran',
    wajib: false,
    kelas: 'subagent',
    sumber: 'src/lib/systemPrompt.ts KONDISIONAL[subagent].teks',
    ttd: { id: ['# Aturan tambahan: subagent & kerja paralel'], en: ['# Extra rule: subagents & parallel work'] },
  },
];
const WAJIB = ATURAN.filter((a) => a.wajib).map((a) => a.id);
const ttd = (id, lang) => ATURAN.find((a) => a.id === id).ttd[lang];

/* ===================================================================== *
 * 3. USULAN (lapis simulasi): blok padat + dua kelas kondisional + pemotong
 *    Teks ini yang sama ditempel di docs/USULAN-BLOK-KONDISIONAL.md.
 * ===================================================================== */

/** Blok padat "cara kerja + LARANGAN" usulan - menggantikan blok larangan inti. */
const PADAT_ID = [
  '# Batas keras', // judul LAMA dipertahankan: uji-blok-inti.mjs C.4 mencocokkan 'Batas keras'
  '1. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas = bilang apa adanya, atau cari dulu.',
  '2. Jawab dalam bahasa aktif aplikasi; teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.',
  '3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.',
  '4. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env); sebut di mana user bisa melihatnya.',
  '5. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) tanpa diminta user.',
  '6. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`.',
  '7. Satu langkah, satu tool; baca independen boleh digabung.',
  '8. Pakai tool hanya kalau memberi info baru: sudah dijawab blok konteks = jawab dari situ.',
].join('\n');

const PADAT_EN = [
  '# Hard limits', // judul LAMA dipertahankan: uji-blok-inti.mjs C.8 mencocokkan '# Hard limits'
  '1. Never invent a value, file, setting, port or doc: not in the facts above = say so, or look it up.',
  '2. Answer in the active language of the app; the English above is SOURCE, not your answer language.',
  '3. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.',
  '4. Never print secrets (API key, token, SSH key, .env); say where the user can see them.',
  '5. Never run a destructive tool (delete, move, overwrite, force push, kill a process) unless the user asked for it.',
  '6. Never answer a Zephyr question from memory: the facts above + `zephyr_self`.',
  '7. One step, one tool; independent reads may go together.',
  '8. Spend a tool call only when it brings something new: answered by the context block = answer from there.',
].join('\n');

/** Kelas usulan; urut array = urutan prioritas pemotong (awal = paling dulu dibuang). */
const USULAN = [
  {
    kelas: 'klaimnilai',
    alasan: 'aturan klaim angka hanya berguna saat giliran ini memang menanyakan angka',
    probe: ['berapa kunci setelan dan pintasan bawaan di Zephyr', 'berapa port debug WebView2 dan port MCP', 'jumlah tool yang dibawa Zephyr berapa'],
    cocok: /\b(berapa|hitung|jumlah|total|nilai|angka|versi|persen|ukuran|token|port|biaya|harga|count|how many|how much|version|price|cost|size)\b/i,
    teks: {
      id: '# Aturan tambahan: angka & klaim nilai\n- Setiap angka yang kamu sebut harus datang dari bahan yang kamu baca GILIRAN INI (fakta di atas, isi berkas, keluaran perintah).',
      en: '# Extra rule: numbers & value claims\n- Every number you state must come from material you read THIS turn (the facts above, file contents, command output).',
    },
  },
  {
    kelas: 'verifikasi',
    alasan: 'prosedur verifikasi mandiri hanya perlu saat giliran ini benar-benar mengubah atau menjalankan sesuatu',
    probe: ['perbaiki error di src/lib/waktu.ts', 'ubah tata letak panel AI', 'tulis fungsi parse dan jalankan test-nya', 'audit berkas di src/lib'],
    cocok:
      /\b(perbaiki|ubah|ganti|refactor|implementasikan|jalankan|audit|periksa|tinjau|review|verify|fix|change|edit|implement|run)\b|\b(tulis|buat|tambah|susun|write|build|add|create)\b[^.!?]{0,40}\b(kode|fungsi|komponen|modul|berkas|file|test|skrip|script|halaman|helper)\b/i,
    teks: {
      id: '# Prosedur tambahan: verifikasi mandiri\n- Sebelum bilang selesai: jalankan pemeriksaan TERKECIL yang membuktikan klaimmu (test/typecheck/build/read_file) lewat tool, lalu baca keluarannya. Ringkasan bukan bukti.',
      en: '# Extra procedure: self-verification\n- Before saying done: run the SMALLEST check that proves your claim (test/typecheck/build/read_file) with a tool, then read its output. A summary is not proof.',
    },
  },
];

/**
 * Pemotong prioritas usulan: pilih kelas usulan yang terpicu selama total
 * suntikan giliran masih <= BATAS_SUNTIK. Kelas yang tidak muat DIBUANG
 * (aturan kondisional memang boleh tidak ikut giliran ini); urutan buang =
 * urutan array USULAN (pertama = paling dulu dibuang).
 */
function pilihUsulan(pesan, produkChar) {
  const terpicu = USULAN.filter((u) => u.cocok.test(pesan));
  const dipakai = [];
  let total = produkChar;
  for (const u of terpicu) {
    const t = u.teks.id.length + 2;
    if (total + t <= BATAS_SUNTIK) {
      dipakai.push(u);
      total += t;
    }
  }
  return { dipakai, total, dibuang: terpicu.length - dipakai.length, terpicu };
}

/* ===================================================================== *
 * 4. Bundel: modul asli + stub
 * ===================================================================== */
const STUB = `/* Dihasilkan uji-blok-kondisional.mjs - stub modul berat untuk mengukur prompt. */
export const useStore = {
  getState: () => ({
    settings: {
      general: { uiLang: process.env.UI_LANG || 'en' },
      agents: { customInstructions: '' },
      models: {},
    },
    workspace: process.env.WS ?? 'D:/Proyek',
  }),
  setState: () => undefined,
  subscribe: () => () => undefined,
};
export const fsRead = async () => ({ isi: '' });
export const instructionRead = async () => '';
export const agentKustomAktif = () => null;
export const blokPersona = () => ({ identitas: '', caraKerja: '', aturan: '' });
export const personaAktif = () => ({ nama: 'Zeph', identitas: '', caraKerja: '', aturan: '' });
export const blokKeadaan = () => '';
export const suntikanIndeks = (kueri = '') => '[INDEKS-LAPIS2:' + String(kueri).length + ']';
export const mcpTerpotong = () => [];
export const blokKeadaanRingkas = () => '[POTRET]';
export const useTerminal = { getState: () => ({ allPanes: () => [] }) };
export const useHistory = { getState: () => ({ timeline: [], stats: null }) };
export const blokMemoriTersimpan = () => '';
export const BATAS_TOKEN_BAWAAN = 900;
export const useInstructions = { getState: () => ({ daftar: [], muat: async () => undefined }) };
export const cocokPola = () => false;
`;

const ENTRI = `export {
  AMBANG_TOKEN_INTI,
  blokKondisional,
  blokLarangan,
  faktaInti,
  faktaModelAi,
  faktaOnDemand,
  kelasKondisional,
  kelasKondisionalTersedia,
  kepalaPotret,
  kodeBahasaPrompt,
  systemPromptFor,
} from '../../src/lib/systemPrompt';
`;

const ANAK = `import { writeFileSync } from 'node:fs';
import * as m from './bundel.mjs';
const pesan = JSON.parse(process.env.KOND_PESAN ?? '[]');
const out = pesan.map((p) => ({ pesan: p, kelas: m.kelasKondisional(p), teks: m.blokKondisional(p) }));
writeFileSync(process.env.KOND_KELUAR, JSON.stringify(out));
`;

const GANTI = [
  './store',
  './commands',
  './personaStore',
  './agentCatalog',
  './zephyrRuntime',
  './zephyrCari',
  './mcpTools',
  './aiZephyrState',
  './terminalStore',
  './historyStore',
  './aiMemori',
  './instructionsStore',
];
const pluginStub = {
  name: 'stub-ringan-uji-blok-kondisional',
  setup(build) {
    build.onResolve({ filter: /^\.\// }, (args) => {
      if (args.importer.endsWith('systemPrompt.ts') && GANTI.includes(args.path)) {
        return { path: join(KERJA, 'stub.mjs') };
      }
      return undefined;
    });
  },
};

mkdirSync(KERJA, { recursive: true });
writeFileSync(join(KERJA, 'stub.mjs'), STUB);
writeFileSync(join(KERJA, 'entri.ts'), ENTRI);
writeFileSync(join(KERJA, 'anak.mjs'), ANAK);
const BUNDEL = join(KERJA, 'bundel.mjs');
await esbuild.build({
  entryPoints: [join(KERJA, 'entri.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: BUNDEL,
  logLevel: 'warning',
  plugins: [pluginStub],
});
const M = await import(pathToFileURL(BUNDEL).href);

/* ===================================================================== *
 * 5. Pelaporan + pengukuran
 * ===================================================================== */
const hasil = [];
const cetak = (bagian, nama, lulus, detail = '') => {
  hasil.push({ bagian, nama, lulus });
  console.log(`${lulus ? 'OK   ' : 'GAGAL'} ${bagian}.${nama}${detail ? ` - ${detail}` : ''}`);
};
const uji = (bagian, nama, syarat, detail = '') => cetak(bagian, nama, Boolean(syarat), detail);
const info = (teks) => console.log(`      ${teks}`);

const AMBANG_TOKEN_INTI = M.AMBANG_TOKEN_INTI;
const AMBANG_CHAR = AMBANG_TOKEN_INTI * 4;
const AMBANG_TOTAL_CHAR = AMBANG_CHAR + BATAS_SUNTIK;

/** Ukur semua probe untuk satu bahasa aktif (env dibaca per panggilan oleh stub). */
function ukur(lang) {
  process.env.UI_LANG = lang;
  const inti = M.faktaInti();
  const larangan = M.blokLarangan();
  const kepala = M.kepalaPotret();
  const per = (pesan) => ({
    pesan,
    kelas: M.kelasKondisional(pesan),
    teks: M.blokKondisional(pesan),
    prompt: M.systemPromptFor('', '', '', 'model-uji', 'provider-uji', '', pesan),
  });
  const perKelas = {};
  for (const [kelas, kata] of Object.entries(KATA_KELAS_TUNGGAL)) perKelas[kelas] = M.blokKondisional(kata).length;
  return {
    lang,
    kode: M.kodeBahasaPrompt(),
    inti,
    larangan,
    kepala,
    intiChar: inti.length,
    intiTotalChar: inti.length + larangan.length + kepala.length,
    kelasTersedia: M.kelasKondisionalTersedia(),
    perKelas,
    tugas: TUGAS.map((t) => ({ jenis: t.jenis, probe: t.pesan.map(per) })),
    luar: LUAR_TOPIK.map(per),
    pemicuKelas: PROBE_KELAS.map((k) => ({ ...per(k.pesan), kelasHarap: k.kelas })),
  };
}

const id = ukur('id');
const en = ukur('en');

/** Aturan yang TERPILIH pada satu rakitan prompt. */
const terpilih = (prompt, lang) => ATURAN.filter((a) => a.ttd[lang].every((s) => prompt.includes(s))).map((a) => a.id);

/* ===================================================================== *
 * A. Anggaran per jenis tugas
 * ===================================================================== */
console.log(
  `ANGGARAN: blok inti ${AMBANG_CHAR} char / ${AMBANG_TOKEN_INTI} token (AMBANG_TOKEN_INTI, token = ceil(char/4))` +
    ` | batas suntikan per giliran ${BATAS_SUNTIK} char (BATAS_KARAKTER_SUNTIK, src/lib/zephyrCari.ts)`
);
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  console.log(
    `  ${lang}: faktaInti ${d.intiChar} + larangan ${d.larangan.length} + kepala ${d.kepala.length}` +
      ` = ${d.intiTotalChar} char / ${charTok(d.intiTotalChar)} tok (sisa ${AMBANG_CHAR - d.intiTotalChar} char)`
  );
  console.log(`      panjang blok per kelas: ${Object.entries(d.perKelas).map(([k, n]) => `${k}=${n}`).join(', ')}`);
  for (const t of d.tugas) {
    const maks = Math.max(0, ...t.probe.map((p) => p.teks.length));
    console.log(
      `    ${t.jenis.padEnd(12)} suntikan maks ${String(maks).padStart(4)} char / ${String(charTok(maks)).padStart(3)} tok` +
        ` | total giliran ${d.intiTotalChar + maks} char / ${charTok(d.intiTotalChar + maks)} tok | ` +
        t.probe.map((p) => `${p.kelas.join('+') || 'kosong'}=${p.teks.length}`).join(', ')
    );
  }
}
console.log(
  '  CATATAN ANGGARAN: "total giliran" di atas = blok inti (anggaran AMBANG_TOKEN_INTI) + suntikan kondisional (anggaran BATAS_KARAKTER_SUNTIK);' +
    ' ia boleh melewati 2.000 token karena dua anggaran itu terpisah. A.1/A.3 menguji tiap anggaran sendiri, A.4 menguji jumlahnya.'
);

for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  uji(
    'A',
    `1 ${lang}`,
    d.intiTotalChar <= AMBANG_CHAR,
    `blok inti selalu-nyala ${d.intiTotalChar} char / ${charTok(d.intiTotalChar)} tok <= ${AMBANG_CHAR} char / ${AMBANG_TOKEN_INTI} tok`
  );
  const samaSemua = d.tugas.every((t) => t.probe.every((p) => p.prompt.includes(d.inti)));
  uji('A', `2 ${lang}`, samaSemua, 'faktaInti() utuh di semua rakitan (inti tidak dipotong per pesan)');
  for (const t of d.tugas) {
    const maks = Math.max(0, ...t.probe.map((p) => p.teks.length));
    uji('A', `3 ${t.jenis} ${lang}`, maks <= BATAS_SUNTIK, `${t.jenis} - suntikan maks ${maks} char / ${charTok(maks)} tok <= ${BATAS_SUNTIK} char`);
  }
  for (const t of d.tugas) {
    const maks = Math.max(0, ...t.probe.map((p) => p.teks.length));
    const total = d.intiTotalChar + maks;
    uji(
      'A',
      `4 ${t.jenis} ${lang}`,
      total <= AMBANG_TOTAL_CHAR,
      `${t.jenis} - total giliran ${total} char / ${charTok(total)} tok <= ${AMBANG_TOTAL_CHAR} char (inti ${d.intiTotalChar} + suntikan ${maks})`
    );
  }
}

/* A.5/A.6/A.7: blok padat usulan (cara kerja + LARANGAN) MUAT di sisa anggaran. */
{
  const totalID = id.intiChar + PADAT_ID.length + id.kepala.length;
  const totalEN = en.intiChar + PADAT_EN.length + en.kepala.length;
  console.log(
    `  USULAN padat: id ${PADAT_ID.length} char (sisa ruang ${AMBANG_CHAR - id.intiChar - id.kepala.length} char)` +
      ` | en ${PADAT_EN.length} char (sisa ruang ${AMBANG_CHAR - en.intiChar - en.kepala.length} char)`
  );
  uji(
    'A',
    '5a id',
    totalID <= AMBANG_CHAR,
    `fakta ${id.intiChar} + padat ${PADAT_ID.length} + kepala ${id.kepala.length} = ${totalID} char / ${charTok(totalID)} tok <= ${AMBANG_CHAR} char / ${AMBANG_TOKEN_INTI} tok`
  );
  uji(
    'A',
    '5b en',
    totalEN <= AMBANG_CHAR,
    `fakta ${en.intiChar} + padat ${PADAT_EN.length} + kepala ${en.kepala.length} = ${totalEN} char / ${charTok(totalEN)} tok <= ${AMBANG_CHAR} char / ${AMBANG_TOKEN_INTI} tok`
  );
  const caraID = ['Satu langkah, satu tool', 'Klaim bukan bukti', 'Pakai tool hanya kalau memberi info baru'];
  const caraEN = ['one step, one tool', 'a claim is not proof', 'spend a tool call only when it brings something new'];
  const adaID = caraID.filter((s) => PADAT_ID.toLowerCase().includes(s.toLowerCase())).length;
  const adaEN = caraEN.filter((s) => PADAT_EN.toLowerCase().includes(s.toLowerCase())).length;
  uji('A', '6', adaID >= 2 && adaEN >= 2, `blok padat memuat aturan CARA KERJA (bukan cuma larangan): id ${adaID}/3, en ${adaEN}/3`);
  const laranganInti = ATURAN.filter((a) => a.kelas === 'inti');
  const hilang = laranganInti.filter((a) => !a.ttd.id.every((s) => PADAT_ID.includes(s)));
  uji(
    'A',
    '7',
    hilang.length === 0,
    `pemadatan tidak menghilangkan larangan: ${laranganInti.length - hilang.length}/${laranganInti.length} larangan lama masih utuh${hilang.length ? ` - HILANG: ${hilang.map((h) => h.id).join(', ')}` : ''}`
  );
  /*
   * A.8 - jaring anti-regresi untuk gate LAIN: uji-blok-inti.mjs mencocokkan
   * '# Batas keras' (C.4) dan '# Hard limits' (C.8) di dalam blok larangan.
   * Kalau pemadatan mengganti judul itu, gate lama MERAH - jadi judul lama
   * dipertahankan sebagai baris pertama blok padat.
   */
  uji(
    'A',
    '8',
    PADAT_ID.includes('# Batas keras') && PADAT_EN.includes('# Hard limits'),
    'blok padat mempertahankan JUDUL LAMA (# Batas keras / # Hard limits) - syarat uji-blok-inti.mjs C.4/C.8 tetap hijau'
  );
}

/* ===================================================================== *
 * B. Isi blok LARANGAN (berbahaya + ngarang)
 * ===================================================================== */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const berbahaya = [
    { nama: 'hapus/pindah/timpa', pola: /hapus|pindah|timpa|delete|move|overwrite/i },
    { nama: 'force push', pola: /force push/i },
    { nama: 'matikan proses', pola: /matikan proses|kill a process/i },
  ];
  const ngarang = [
    { nama: 'nilai/berkas', pola: /mengarang nilai|invent a value/i },
    { nama: 'setelan/port/dokumen', pola: /setelan, port|setting, port/i },
  ];
  const hb = berbahaya.filter((x) => !x.pola.test(d.larangan)).map((x) => x.nama);
  const hn = ngarang.filter((x) => !x.pola.test(d.larangan)).map((x) => x.nama);
  uji('B', `1 ${lang}`, hb.length === 0, `larangan BERBAHAYA lengkap di blok larangan (${d.larangan.length} char)${hb.length ? ` - HILANG: ${hb.join(', ')}` : ''}`);
  uji('B', `2 ${lang}`, hn.length === 0, `larangan NGARANG lengkap di blok larangan${hn.length ? ` - HILANG: ${hn.join(', ')}` : ''}`);
}
{
  const baris = (t) => t.split('\n').filter((b) => /^\d+\./.test(b));
  const bilID = baris(id.larangan);
  const bilEN = baris(en.larangan);
  uji(
    'B',
    '3',
    bilID.length >= 6 && bilEN.length >= 6 && new Set(bilID).size === bilID.length,
    `id ${bilID.length} larangan bernomor (${new Set(bilID).size} unik), en ${bilEN.length}`
  );
  const prompt = id.tugas[0].probe[0].prompt;
  const posLarangan = prompt.indexOf(id.larangan);
  uji(
    'B',
    '4',
    posLarangan > 0 && posLarangan > prompt.indexOf(id.inti),
    `larangan ada di EKOR blok inti di rakitan asli (offset ${posLarangan} > fakta ${prompt.indexOf(id.inti)})`
  );
}

/* ===================================================================== *
 * C. Hemat: di luar topik = NOL suntikan
 * ===================================================================== */
const JUDUL_BLOK = ['# Aturan tambahan', '# Prosedur tambahan', '# Fakta tambahan', '# Extra rule', '# Extra facts', '# Extra procedure'];
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const bocorKelas = d.luar.filter((p) => p.kelas.length > 0).map((p) => `"${p.pesan}" -> ${p.kelas.join('+')}`);
  const bocorTeks = d.luar.filter((p) => p.teks.length > 0).map((p) => `"${p.pesan}" = ${p.teks.length} char`);
  const bocorJudul = d.luar.filter((p) => JUDUL_BLOK.some((j) => p.prompt.includes(j))).map((p) => p.pesan);
  /*
   * C.4 menguji bahwa blok KONDISIONAL tidak menyuntik bullet fakta on-demand.
   *
   * Versi lama mencarinya di `p.prompt` (blok inti + blok kondisional), padahal
   * bullet itu MEMANG ada di blok inti - itulah tujuan perubahan "seluruh fakta
   * selalu ada" (uji-blok-inti B.6). Akibatnya cek ini mustahil lulus begitu
   * produknya benar. Yang diuji sekarang: bullet itu tidak ikut lewat BLOK
   * KONDISIONAL, yaitu `teks` milik kelas - satu-satunya jalur yang memang
   * boleh kosong saat pesannya di luar topik.
   */
  const onDemand = [M.faktaOnDemand('model'), M.faktaOnDemand('galat')].filter(Boolean);
  const bocorOnDemand = d.luar.filter((p) => onDemand.some((od) => p.teks.includes(od))).map((p) => p.pesan);
  uji('C', `1 ${lang}`, bocorKelas.length === 0, `${d.luar.length} pesan luar topik -> NOL kelas${bocorKelas.length ? ` - BOCOR: ${bocorKelas.join(' | ')}` : ''}`);
  uji('C', `2 ${lang}`, bocorTeks.length === 0, `blok kondisional 0 char untuk semua pesan luar topik${bocorTeks.length ? ` - BOCOR: ${bocorTeks.join(' | ')}` : ''}`);
  uji('C', `3 ${lang}`, bocorJudul.length === 0, `tidak ada judul blok tambahan di rakitan${bocorJudul.length ? ` - BOCOR: ${bocorJudul.join(' | ')}` : ''}`);
  uji('C', `4 ${lang}`, bocorOnDemand.length === 0, `tidak ada bullet fakta on-demand yang ikut${bocorOnDemand.length ? ` - BOCOR: ${bocorOnDemand.join(' | ')}` : ''}`);
}

/* ===================================================================== *
 * D. SUPERSET: aturan wajib vs terpilih
 * ===================================================================== */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  for (const t of d.tugas) {
    const kurang = [];
    for (const p of t.probe) {
      const pil = terpilih(p.prompt, lang);
      const hilang = WAJIB.filter((w) => !pil.includes(w));
      if (hilang.length) kurang.push(`"${p.pesan}" hilang ${hilang.join(', ')}`);
    }
    const kelasPilih = [...new Set(t.probe.flatMap((p) => p.kelas))];
    uji(
      'D',
      `${t.jenis} ${lang}`,
      kurang.length === 0,
      `${WAJIB.length} aturan wajib utuh di ${t.probe.length} pesan (terpilih = ${WAJIB.length} wajib + kelas ${kelasPilih.join(',') || 'kosong'})${kurang.length ? ` - MERAH: ${kurang.join(' | ')}` : ''}`
    );
  }
  {
    const kurang = d.luar.filter((p) => WAJIB.some((w) => !terpilih(p.prompt, lang).includes(w))).map((p) => p.pesan);
    uji('D', `luar topik ${lang}`, kurang.length === 0, `${WAJIB.length} aturan wajib tetap lengkap walau nol blok kondisional${kurang.length ? ` - MERAH: ${kurang.join(' | ')}` : ''}`);
  }
  {
    const kelasTerpicu = new Set(d.pemicuKelas.flatMap((p) => p.kelas));
    const tanpaPemicu = d.kelasTersedia.filter((k) => !kelasTerpicu.has(k));
    const tanpaBukti = ATURAN.filter((a) => !a.wajib)
      .filter((a) => {
        const p = d.pemicuKelas.find((x) => x.kelasHarap === a.kelas && x.kelas.includes(a.kelas));
        return !p || !a.ttd[lang].every((s) => p.prompt.includes(s));
      })
      .map((a) => a.id);
    uji(
      'D',
      `kelas terpilih ${lang}`,
      tanpaPemicu.length === 0 && tanpaBukti.length === 0,
      `kelas terpicu ${[...kelasTerpicu].sort().join(', ')} dari ${d.kelasTersedia.length} terdaftar${tanpaPemicu.length ? ` - TANPA PICUL: ${tanpaPemicu.join(', ')}` : ''}${tanpaBukti.length ? ` - TANPA BUKTI: ${tanpaBukti.join(', ')}` : ''}`
    );
  }
  {
    const p = d.luar[0].prompt;
    const condText = [...d.tugas.flatMap((t) => t.probe), ...d.pemicuKelas].map((x) => x.teks).join('\n');
    const diCond = ATURAN.filter((a) => a.wajib)
      .filter((a) => a.ttd[lang].some((s) => condText.includes(s)))
      .map((a) => a.id);
    uji(
      'D',
      `wajib tak cond ${lang}`,
      diCond.length === 0 && WAJIB.every((w) => terpilih(p, lang).includes(w)),
      `tidak ada aturan wajib yang hanya hidup di blok kondisional (${diCond.join(', ') || 'nol'})`
    );
  }
}

/* ===================================================================== *
 * E. Determinisme
 * ===================================================================== */
{
  process.env.UI_LANG = 'id';
  const ulang = id.tugas[0].probe.map((p) => ({ kelas: M.kelasKondisional(p.pesan), teks: M.blokKondisional(p.pesan) }));
  const asli = id.tugas[0].probe.map((p) => ({ kelas: p.kelas, teks: p.teks }));
  const pemicuUlang = id.pemicuKelas.map((p) => JSON.stringify(M.kelasKondisional(p.pesan)));
  const pemicuAsli = id.pemicuKelas.map((p) => JSON.stringify(p.kelas));
  uji(
    'E',
    '1',
    JSON.stringify(ulang) === JSON.stringify(asli) && JSON.stringify(pemicuUlang) === JSON.stringify(pemicuAsli),
    'dua kali pilih dalam satu proses = hasil sama (kelas + teks, 3+6 pesan)'
  );

  const pesan = [...TUGAS.flatMap((t) => t.pesan), ...LUAR_TOPIK, ...PROBE_KELAS.map((k) => k.pesan)];
  const keluar = join(KERJA, 'anak-hasil.json');
  const anak = spawnSync(process.execPath, [join(KERJA, 'anak.mjs')], {
    cwd: AKAR,
    env: { ...process.env, UI_LANG: 'id', KOND_PESAN: JSON.stringify(pesan), KOND_KELUAR: keluar },
    encoding: 'utf8',
  });
  if (anak.status !== 0) {
    uji('E', '2', false, `proses baru gagal: ${anak.stderr ?? ''}`);
  } else {
    const dariAnak = JSON.parse(readFileSync(keluar, 'utf8'));
    process.env.UI_LANG = 'id';
    const dariSini = pesan.map((p) => ({ pesan: p, kelas: M.kelasKondisional(p), teks: M.blokKondisional(p) }));
    uji('E', '2', JSON.stringify(dariAnak) === JSON.stringify(dariSini), `proses baru (${pesan.length} pesan) memberi pilihan identik`);
  }

  const kelasPer = (lang) =>
    pesan.map((p) => {
      process.env.UI_LANG = lang;
      return M.kelasKondisional(p).join('+');
    });
  const kelasID = kelasPer('id');
  const kelasEN = kelasPer('en');
  const bedaKelas = pesan.filter((p, i) => kelasID[i] !== kelasEN[i]);
  uji('E', '3', bedaKelas.length === 0, `pilihan kelas identik di id & en (${pesan.length} pesan)${bedaKelas.length ? ` - BEDA: ${bedaKelas.join(' | ')}` : ''}`);

  process.env.UI_LANG = 'id';
  const tabelID = M.blokKondisional('bandingkan');
  process.env.UI_LANG = 'en';
  const tabelEN = M.blokKondisional('compare');
  uji('E', '4', tabelID.includes('# Aturan tambahan') && tabelEN.includes('# Extra rule'), 'teks blok ikut bahasa aktif (id: # Aturan tambahan, en: # Extra rule)');
  process.env.UI_LANG = 'id';
}

/* ===================================================================== *
 * F. Kelas usulan + pemotong prioritas (lapis simulasi)
 * ===================================================================== */
{
  for (const u of USULAN) {
    const sendiri = u.probe.filter((p) => u.cocok.test(p));
    const bocor = LUAR_TOPIK.filter((p) => u.cocok.test(p));
    uji(
      'F',
      `1 ${u.kelas}`,
      sendiri.length >= 2 && bocor.length === 0,
      `kelas usulan ${u.kelas}: ${sendiri.length}/${u.probe.length} probe sendiri terpicu, luar topik ${bocor.length}${bocor.length ? ` - BOCOR: ${bocor.join(' | ')}` : ''}`
    );
    uji(
      'F',
      `2 ${u.kelas}`,
      u.teks.id.length <= BATAS_SUNTIK && u.teks.en.length <= BATAS_SUNTIK,
      `blok usulan ${u.kelas}: ${u.teks.id.length} char (id) / ${u.teks.en.length} char (en) <= ${BATAS_SUNTIK} char`
    );
    const kembar = WAJIB.filter((w) => ttd(w, 'id').some((s) => u.teks.id.includes(s)));
    uji('F', `3 ${u.kelas}`, kembar.length === 0, `blok usulan tidak mengulang aturan wajib (${kembar.join(', ') || 'nol duplikat'})`);
  }
  /* Total giliran: produk (kode sekarang) + usulan SETELAH pemotong <= batas suntikan. */
  for (const t of TUGAS) {
    const baris = t.pesan.map((p) => {
      const produk = M.blokKondisional(p).length;
      const { dipakai, total, dibuang } = pilihUsulan(p, produk);
      return { produksi: produk, usulan: total - produk, total, dipakai: dipakai.map((x) => x.kelas).join('+') || '-', dibuang };
    });
    const maks = Math.max(...baris.map((b) => b.total));
    uji(
      'F',
      `4 ${t.jenis}`,
      maks <= BATAS_SUNTIK,
      `${t.jenis}: total produk+usulan maks ${maks} char / ${charTok(maks)} tok <= ${BATAS_SUNTIK} char (` +
        baris.map((b) => `produk ${b.produksi}+usulan ${b.usulan}=${b.total}${b.dibuang ? ` [buang ${b.dibuang}]` : ''}`).join('; ') +
        ')'
    );
    const perluBuang = baris.filter((b) => b.dibuang > 0).length;
    if (perluBuang) info(`${t.jenis}: pemotong membuang kelas di ${perluBuang}/${baris.length} pesan (aturan kondisional boleh tidak ikut giliran ini)`);
  }
  /* Pemotong tidak membuang kalau anggaran masih cukup. */
  const semuaUji = [...TUGAS.flatMap((t) => t.pesan), ...LUAR_TOPIK];
  const buangSiaSia = semuaUji.filter((p) => {
    const produk = M.blokKondisional(p).length;
    const semuaMuat = produk + USULAN.filter((u) => u.cocok.test(p)).reduce((n, u) => n + u.teks.id.length + 2, 0) <= BATAS_SUNTIK;
    return semuaMuat && pilihUsulan(p, produk).dibuang > 0;
  });
  uji('F', '5', buangSiaSia.length === 0, `pemotong hanya membuang saat anggaran benar-benar lewat (${buangSiaSia.length} pembuangan sia-sia)`);
  const nolUsulanLuar = LUAR_TOPIK.filter((p) => pilihUsulan(p, M.blokKondisional(p).length).dipakai.length > 0);
  uji('F', '6', nolUsulanLuar.length === 0, `pesan luar topik tidak menarik kelas usulan (${nolUsulanLuar.length} bocor)`);

  /* TEMUAN (bukan gate): kombinasi kelas terburuk dari kode produk. */
  const kombinasi = [
    ['setelan provider model dan API key serta sandi', 'model+keamanan'],
    ['bandingkan tabel provider model', 'model+tabel'],
    ['error gagal dimuat di log, tolong buat tabel ceklis', 'galat+tabel'],
  ].map(([pesan, harap]) => ({ harap, kelas: M.kelasKondisional(pesan).join('+'), char: M.blokKondisional(pesan).length }));
  const lewat = kombinasi.filter((k) => k.char > BATAS_SUNTIK);
  info(
    `TEMUAN (bukan gate): kombinasi kelas terburuk ${kombinasi.map((k) => `${k.kelas || k.harap}=${k.char}`).join(', ')}` +
      `${lewat.length ? ` - ${lewat.length} kombinasi melebihi ${BATAS_SUNTIK} char; pemilih di kode produk belum punya pemotong prioritas (usulan: docs/USULAN-BLOK-KONDISIONAL.md)` : ''}`
  );
}

/* ===================================================================== *
 * Ringkasan
 * ===================================================================== */
const gagal = hasil.filter((h) => !h.lulus);
console.log(
  `\n${hasil.length - gagal.length}/${hasil.length} lulus${gagal.length ? `, GAGAL: ${gagal.map((g) => `${g.bagian}.${g.nama}`).join(', ')}` : ''}`
);
console.log(
  `Ringkas: blok inti ${id.intiTotalChar} char / ${charTok(id.intiTotalChar)} tok (id), ${en.intiTotalChar} char / ${charTok(en.intiTotalChar)} tok (en); ` +
    `sisa ruang di blok inti ${AMBANG_CHAR - id.intiTotalChar} char (id) - blok padat usulan ${PADAT_ID.length} char / ${charTok(PADAT_ID.length)} tok.`
);
process.exit(gagal.length ? 1 : 0);
