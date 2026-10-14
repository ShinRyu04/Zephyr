#!/usr/bin/env node
/**
 * uji-blok-inti.mjs — GATE blok inti prompt Zeph AI.
 *
 * Menjaga empat hal yang saling mengikat (item AI-TAHU-100-7 / -2-sisa / 153 / 162):
 *
 *   A. AMBANG TOKEN. Blok inti = teks yang SELALU ikut tiap giliran:
 *      `faktaInti()` (blok fakta generated, minus bullet on-demand) +
 *      `blokLarangan()` + kepala/label blok keadaan yang ikut bahasa aktif.
 *      Cara hitung (WAJIB sama dengan `AMBANG_TOKEN_INTI` di systemPrompt.ts):
 *          token = Math.ceil(panjang_karakter / 4)
 *      2.000 token = 8.000 karakter. Lewat = GAGAL.
 *      Yang TIDAK dihitung (memang on-demand, bukan blok inti): potongan
 *      indeks (`suntikanIndeks`), blok kondisional, dan potret keadaan.
 *
 *   B. BLOK KONDISIONAL (item 162). Pemilihan blok tambahan harus DETERMINISTIK
 *      dan benar untuk contoh pesan nyata; pesan di luar topik tidak menarik
 *      blok apa pun; tiap kelas yang terdaftar wajib punya contoh uji (kelas
 *      baru tanpa contoh = GAGAL). Fakta yang dipotong dari blok inti wajib
 *      masih terjangkau lewat kelasnya.
 *
 *   C. BAHASA (item 133). Saat bahasa aktif Indonesia, teks yang lane ini
 *      tulis (kepala + label blok keadaan, blok larangan, judul blok
 *      kondisional) tidak boleh tinggal Inggris - sumber laporan Ryu: Zeph
 *      menjawab Inggris walau ditanya Indonesia. Kontrak Inggris yang lama
 *      tetap diuji (headline `# Zephyr runtime state ...` harus tetap identik)
 *      karena blok fakta generated memang berbahasa Inggris dan tetap jadi
 *      bahan sumber - judulnya diberi tahu sebagai bahan sumber, dan aturan
 *      larangan bahasa menyebutnya.
 *
 * Kenapa harness ini ada: ambang 2.000 token gampang ditembus tanpa sadar
 * (satu bullet fakta + satu aturan baru sudah cukup), dan blok inti yang
 * kebesaran membuat Zeph lupa hal yang justru sering ditanya. Harness ini
 * MENGGAGALKAN build kalau ambang lewat, bukan sekadar melaporkan.
 *
 * Cara pakai:
 *   node scripts/uji-blok-inti.mjs            (dari akar repo; butuh esbuild)
 *   exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-blok-inti');
const AMBANG_TOKEN = 2000;
const AMBANG_CHAR = AMBANG_TOKEN * 4;
/* Cara hitung tunggal yang dipakai seluruh harness ini: 4 karakter = 1 token. */
const charTok = (n) => Math.ceil(n / 4);
const tok = (teks) => charTok(String(teks ?? '').length);

/* ------------------------------------------------------------------ *
 * Contoh pesan: kelas kondisional yang DIHARAPKAN, urut deklarasi di
 * systemPrompt.ts. `[]` = tidak menarik blok apa pun (bukan "serahkan ke
 * model"): pesan yang tidak menyentuh topik tambahan harus hemat.
 * ------------------------------------------------------------------ */
const CONTOH = [
  { pesan: 'apa itu panel bawah dan bagaimana membukanya', kelas: ['jendela'] },
  { pesan: 'tolong buat tabel perbandingan provider model', kelas: ['model', 'tabel'] },
  { pesan: 'kenapa ekstensiku tidak jalan, lihat log-nya', kelas: ['galat'] },
  { pesan: 'di mana aku menyimpan API key ku', kelas: ['model', 'keamanan'] },
  { pesan: 'apa isi berkas catatan-kerja.md', kelas: [] },
  { pesan: 'ringkas apa yang kamu lakukan tadi', kelas: [] },
  { pesan: 'pakai subagent paralel untuk audit berkas', kelas: ['subagent'] },
  { pesan: 'berapa token konteks model ini', kelas: ['model'] },
  { pesan: 'help me debug the LSP server crash', kelas: ['galat'] },
  { pesan: 'show me a comparison table of my settings', kelas: ['tabel'] },
  { pesan: 'ubah tata letak panel AI di sidebar', kelas: ['jendela'] },
  { pesan: 'berapa anggaran token subagent paralel', kelas: ['subagent'] },
];

/* ------------------------------------------------------------------ *
 * Stub: modul yang butuh browser/tauri/xterm/indeks diganti satu berkas,
 * supaya blok prompt bisa diukur dari node. Tidak menyentuh app.
 * ------------------------------------------------------------------ */
const STUB = `/* Dihasilkan uji-blok-inti.mjs - stub modul berat untuk mengukur prompt. */
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

/* Entry: mengukur blok yang jadi sasaran, lalu menulis hasilnya sebagai JSON
   (lewat berkas, bukan stdout - teks blok inti ~7 RB dan tidak perlu dicetak). */
const ENTRI = `import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import {
  blokKeadaanPrompt,
  blokKondisional,
  blokLarangan,
  faktaInti,
  faktaOnDemand,
  kelasKondisional,
  kelasKondisionalTersedia,
  kepalaPotret,
  kodeBahasaPrompt,
} from '../../src/lib/systemPrompt';

const pesan: string[] = JSON.parse(process.env.BLOK_UJI_PESAN ?? '[]');
const keluar = process.env.BLOK_UJI_KELUAR ?? '';
const sampel = pesan.map((p) => ({ pesan: p, kelas: kelasKondisional(p), teks: blokKondisional(p) }));
const data = {
  lang: kodeBahasaPrompt(),
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  keadaan: blokKeadaanPrompt(),
  kelasTersedia: kelasKondisionalTersedia(),
  onDemandModel: faktaOnDemand('model'),
  onDemandGalat: faktaOnDemand('galat'),
  sampel,
};
writeFileSync(keluar, JSON.stringify(data));
`;

const GANTI = [
  './store',
  './commands',
  './personaStore',
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
  name: 'stub-ringan-uji-blok-inti',
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
const bundel = join(KERJA, 'entri.mjs');
await esbuild.build({
  entryPoints: [join(KERJA, 'entri.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundel,
  logLevel: 'warning',
  plugins: [pluginStub],
});

/* ------------------------------------------------------------------ *
 * Pelaporan
 * ------------------------------------------------------------------ */
const hasil = [];
const cetak = (bagian, nama, lulus, detail = '') => {
  hasil.push({ bagian, nama, lulus });
  console.log(`${lulus ? 'OK   ' : 'GAGAL'} ${bagian}${nama}${detail ? ` - ${detail}` : ''}`);
};
const uji = (bagian, nama, syarat, detail = '') => cetak(bagian, nama, Boolean(syarat), detail);

/** Jalankan entri untuk satu bahasa aktif. */
function ukur(lang) {
  const keluar = join(KERJA, `hasil-${lang}.json`);
  const anak = spawnSync(process.execPath, [bundel], {
    cwd: AKAR,
    env: {
      ...process.env,
      UI_LANG: lang,
      BLOK_UJI_PESAN: JSON.stringify(CONTOH.map((c) => c.pesan)),
      BLOK_UJI_KELUAR: keluar,
    },
    encoding: 'utf8',
  });
  if (anak.status !== 0) {
    console.error(`GAGAL menjalankan entri (${lang}):\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(keluar, 'utf8'));
}

const id = ukur('id');
const en = ukur('en');

/* ------------------------------------------------------------------ *
 * A. Ambang token blok inti
 * ------------------------------------------------------------------ */
console.log(`AMBANG: ${AMBANG_TOKEN} token = ${AMBANG_CHAR} karakter  (token = Math.ceil(karakter / 4))`);
for (const [lang, d] of [['en', en], ['id', id]]) {
  const inti = d.inti.length + d.larangan.length;
  const plusKepala = inti + d.kepala.length;
  console.log(
    `  ${lang}: fakta generated ${d.fakta.length} char / ${charTok(d.fakta.length)} tok | inti (fakta+larangan) ` +
      `${inti} char / ${charTok(inti)} tok | + kepala keadaan ${plusKepala} char / ` +
      `${charTok(plusKepala)} tok | potret keadaan ${d.keadaan.length} char / ${charTok(d.keadaan.length)} tok`
  );
}
for (const [lang, d] of [['en', en], ['id', id]]) {
  const inti = d.inti.length + d.larangan.length;
  const plusKepala = inti + d.kepala.length;
  uji(
    'A',
    1,
    d.fakta.length <= AMBANG_CHAR,
    `${lang}: blok fakta generated ${d.fakta.length} char / ${charTok(d.fakta.length)} tok (cek-batas-inti juga menguji ini)`
  );
  uji(
    'A',
    2,
    inti <= AMBANG_CHAR,
    `${lang}: inti fakta+larangan ${inti} char / ${charTok(inti)} tok <= ${AMBANG_CHAR} char / ${AMBANG_TOKEN} tok`
  );
  uji(
    'A',
    3,
    plusKepala <= AMBANG_CHAR,
    `${lang}: inti + kepala keadaan ${plusKepala} char / ${charTok(plusKepala)} tok <= ${AMBANG_CHAR} char / ${AMBANG_TOKEN} tok`
  );
}
/* Pemangkasan nyata: blok inti harus lebih kecil dari blok generatednya. */
uji('A', 4, id.inti.length + id.larangan.length < id.fakta.length, `id: ${id.inti.length + id.larangan.length} < ${id.fakta.length} char (on-demand benar-benar dipotong)`);
/* Fakta penting yang TIDAK boleh hilang dari blok inti. */
for (const [lang, d] of [['en', en], ['id', id]]) {
  const wajib = ['## Shortcuts', 'Ctrl+J = Toggle bottom panel', 'zephyr_self', 'settings.json'];
  const hilang = wajib.filter((w) => !d.fakta.includes(w));
  uji('A', 5, hilang.length === 0, `${lang}: blok generated hilang ${hilang.length ? hilang.join(', ') : '-'}`);
}

/* ------------------------------------------------------------------ *
 * B. Blok kondisional deterministik
 * ------------------------------------------------------------------ */
{
  const d = id;
  uji('B', 1, d.sampel.length >= 6, `${d.sampel.length} contoh pesan (minimal 6)`);
  d.sampel.forEach((s, i) => {
    const kelas = s.kelas.join('+') || '(kosong)';
    const harap = CONTOH[i].kelas.join('+') || '(kosong)';
    const lulus = s.kelas.join(',') === CONTOH[i].kelas.join(',');
    const detail = `"${s.pesan.slice(0, 42)}" -> ${kelas} (${s.teks.length} char), diharapkan ${harap}`;
    const cocokTeks =
      (CONTOH[i].kelas.length === 0 && s.teks === '') ||
      (CONTOH[i].kelas.length > 0 && s.teks.length > 0);
    uji('B', `2.${i + 1}`, lulus && cocokTeks, detail);
  });
  /* Tiap kelas terdaftar wajib punya contoh - kelas baru tak teruji = GAGAL. */
  const kelasUji = new Set(CONTOH.flatMap((c) => c.kelas));
  const kurang = d.kelasTersedia.filter((k) => !kelasUji.has(k));
  uji('B', 3, kurang.length === 0, `kelas terdaftar ${d.kelasTersedia.join(', ')}${kurang.length ? ` - belum ada contoh: ${kurang.join(', ')}` : ''}`);
  /* Fakta yang dipotong dari blok inti wajib masih terjangkau lewat kelasnya. */
  uji('B', 4, d.onDemandModel.includes('"AI Models" (Settings group'), `kelas model memuat bullet setelan AI Models (${d.onDemandModel.length} char)`);
  uji('B', 5, d.onDemandGalat.includes('zephyr-YYYY-MM-DD.log') && d.onDemandGalat.includes('settings.json'), `kelas galat memuat jalur log + settings.json (${d.onDemandGalat.length} char)`);
  uji('B', 6, !id.inti.includes('"AI Models" (Settings group') && !id.inti.includes('- Logs: %APPDATA%'), 'bullet on-demand sudah keluar dari blok inti');
  /* Deterministik: panggilan ulang pada pesan yang sama harus identik. */
  const lagi = ukur('id');
  const sama = lagi.sampel.every((s, i) => s.kelas.join(',') === d.sampel[i].kelas.join(',') && s.teks === d.sampel[i].teks);
  uji('B', 7, sama, 'pemilihan kelas stabil antar pemanggilan (deterministik, bukan acak/bergantung model)');
}

/* ------------------------------------------------------------------ *
 * C. Bahasa: blok inti ikut bahasa aktif saat Indonesia
 * ------------------------------------------------------------------ */
const INGGRIS_TINGGAL_ID = [
  'Zephyr runtime state',
  'snapshot taken',
  'History & SSH:',
  '# Hard limits',
  'Never ',
  '# Extra rule',
  '# Extra facts',
  '# Extra procedure',
  'When the user asks',
  'Reaching for subagents',
  'Gather evidence first',
];
{
  const d = id;
  /* Bahan sumber (bullet fakta generated) MEMANG berbahasa Inggris dan tetap
     dikirim apa adanya; yang diuji di sini adalah teks KARANGAN LANE INI.
     Kutipan sumber dikeluarkan dulu, lalu keberadaannya tetap diuji terpisah
     (C10) supaya tidak ada teks Inggris yang menyelinap tanpa label. */
  const buangSumber = (t) => t.split(d.onDemandModel).join('').split(d.onDemandGalat).join('');
  const contohTeks = buangSumber(d.sampel.map((s) => `${s.pesan}\n${s.teks}`).join('\n'));
  const sisa = INGGRIS_TINGGAL_ID.filter((f) => d.kepala.includes(f) || d.larangan.includes(f) || contohTeks.includes(f));
  uji('C', 1, sisa.length === 0, `id: tidak ada kalimat Inggris tertinggal${sisa.length ? ` - ketemu: ${sisa.join(' | ')}` : ''}`);
  uji('C', 2, d.kepala.includes('Keadaan runtime Zephyr') && !d.kepala.includes('Zephyr runtime state'), `id: kepala blok keadaan "${d.kepala.slice(0, 70)}..."`);
  uji('C', 3, d.keadaan.includes('Riwayat & SSH:') && !d.keadaan.includes('History & SSH:'), 'id: label blok keadaan (riwayat/SSH) sudah Indonesia');
  uji('C', 4, d.larangan.includes('Batas keras') && d.larangan.includes('SUMBER'), 'id: larangan Indonesia + memberi tahu teks Inggris = SUMBER, bukan bahasa jawaban');
  uji('C', 5, d.larangan.split('\n').filter((b) => /^\d\./.test(b)).length >= 5, `id: ${d.larangan.split('\n').filter((b) => /^\d\./.test(b)).length} larangan inti bernomor (minimal 5)`);
  uji('C', 6, d.sampel[1].teks.includes('# Aturan tambahan: bentuk jawaban') && d.sampel[2].teks.includes('# Prosedur tambahan'), 'id: judul blok kondisional ikut bahasa aktif');
  /* Kalau bullet sumber Inggris ikut terkirim, judulnya WAJIB bilang itu bahan
     sumber - supaya model tidak menyimpulkan "bahasa jawabannya Inggris". */
  const pembawaSumber = d.sampel.filter((s) => d.onDemandModel && s.teks.includes(d.onDemandModel));
  uji(
    'C',
    10,
    pembawaSumber.length > 0 && pembawaSumber.every((s) => s.teks.includes('bahan sumber, bahasa Inggris')),
    `${pembawaSumber.length} blok membawa bahan sumber Inggris, semuanya berjudul "bahan sumber"`
  );
  /* Kontrak Inggris TIDAK boleh berubah: harness uji-keadaan-prompt K4/K5
     mencocokkan kepala itu apa adanya. */
  uji('C', 7, en.kepala.startsWith('# Zephyr runtime state - snapshot taken '), 'en: kepala lama dipertahankan apa adanya');
  uji('C', 8, en.keadaan.includes('History & SSH:') && en.larangan.includes('# Hard limits') && en.larangan.includes('Never invent a value'), 'en: label keadaan + larangan Inggris tetap utuh');
  uji('C', 9, en.sampel[1].teks.includes('# Extra facts:') && en.sampel[1].teks.includes('# Extra rule: answer shape') && en.sampel[2].teks.includes('# Extra procedure:'), 'en: judul blok kondisional ikut bahasa aktif (Inggris)');
}

/* ------------------------------------------------------------------ *
 * Ringkasan
 * ------------------------------------------------------------------ */
const gagal = hasil.filter((h) => !h.lulus);
console.log(`\n${hasil.length - gagal.length}/${hasil.length} lulus${gagal.length ? `, GAGAL: ${gagal.map((g) => g.bagian + g.nama).join(', ')}` : ''}`);
console.log(
  `Ringkas: blok inti id ${id.inti.length + id.larangan.length + id.kepala.length} char / ` +
    `${charTok(id.inti.length + id.larangan.length + id.kepala.length)} tok, en ${en.inti.length + en.larangan.length + en.kepala.length} char / ` +
    `${charTok(en.inti.length + en.larangan.length + en.kepala.length)} tok (ambang ${AMBANG_TOKEN} tok).`
);
process.exit(gagal.length ? 1 : 0);
