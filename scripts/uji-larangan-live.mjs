#!/usr/bin/env node
/**
 * uji-larangan-live.mjs — GATE blok "cara kerja + LARANGAN" PADAT milik Zeph AI.
 * Item: ZEPH-LARANGAN-BLOK (2026-10-14).
 *
 * CARA JALAN: `node scripts/uji-larangan-live.mjs`  (keluar 1 kalau ada GAGAL)
 *
 * MURNI node: tanpa jaringan, tanpa app, tanpa CDP, tanpa model. Yang diuji
 * adalah TEKS YANG BENAR-BENAR DIKIRIM ke provider, diambil dari jalur nyata:
 * `systemPromptFor()` di `src/lib/systemPrompt.ts` (modul TS asli dibundel
 * esbuild; hanya modul app yang butuh browser/tauri/xterm yang distub - pola
 * yang sama dengan `scripts/uji-blok-inti.mjs`).
 *
 * Yang diperiksa
 * --------------
 *   A. 7 aturan wajib item ini DITEMUKAN di teks terkirim, UNTUK BAHASA EN DAN
 *      ID (14 pemeriksaan). Tiap aturan punya tanda tangan teks (regex) yang
 *      memang pernyataan aturannya, bukan kata umum.
 *   B. Anggaran blok inti tetap di bawah AMBANG_TOKEN_INTI (2.000 token =
 *      8.000 char, token = ceil(char/4)). Angka char + token NYATA dicetak
 *      sebelum dan sesudah patch, bukan disimpulkan.
 *   C. JUDUL blok tidak berubah: '# Batas keras' (id) / '# Hard limits' (en)
 *      sebagai baris PERTAMA - syarat `scripts/uji-blok-inti.mjs` C.4/C.8.
 *   D. Tidak ada aturan kembar/dobel di teks terkirim: tidak ada baris blok
 *      yang berulang DI DALAM blok, tidak ada baris blok yang muncul lagi
 *      kata-per-kata di tempat lain di prompt, dan tiap tanda tangan aturan
 *      muncul PERSIS SEKALI (bukan "ada di dua tempat").
 *   E. Determinisme: dua panggilan di proses yang sama identik, dan proses
 *      BARU (spawn) menghasilkan prompt identik. Jam dibekukan di entri:
 *      satu-satunya bagian yang berubah sendiri tiap giliran adalah cap waktu
 *      potret runtime (diukur: dua panggilan tanpa pembekuan beda persis di
 *      cap waktu itu).
 *   F. 6 dari 7 aturan hidup di blok EKOR (`blokLarangan()`); satu sisanya
 *      (tool gagal -> baca error) memang sudah ada di blok `caraKerja`, jadi
 *      tidak diduplikasi.
 *
 * Angka "sebelum" diambil dari keluaran NYATA gate lama sebelum patch:
 *   `node scripts/uji-blok-inti.mjs` -> id 7810 char / 1953 tok,
 *   en 7789 char / 1948 tok; `blokLarangan()` 728 char (id) / 702 char (en)
 *   (tercatat di docs/BLOK-INTI-101-133-153-162.md).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-larangan-live');
const TOK = (n) => Math.ceil(Number(n) / 4);

/** Angka NYATA sebelum patch (keluaran gate lama, bukan perkiraan). */
const SEBELUM = {
  id: { inti: 7810, blok: 728 },
  en: { inti: 7789, blok: 702 },
};
const SUMBER_SEBELUM =
  'uji-blok-inti.mjs sebelum patch: id 7810 char / 1953 tok, en 7789 char / 1948 tok; blokLarangan 728 (id) / 702 (en) char';

/* ------------------------------------------------------------------ *
 * Stub: modul app yang butuh browser/tauri/xterm/distribusi diganti satu
 * berkas. Teks prompt yang diukur tetap teks asli dari systemPrompt.ts.
 * ------------------------------------------------------------------ */
const STUB = `/* Dihasilkan uji-larangan-live.mjs - stub modul berat untuk mengukur prompt. */
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

/*
 * Entry: memanggil `systemPromptFor()` DUA KALI (determinisme) dan menulis
 * hasilnya ke berkas - bukan ke stdout, karena prompt penuh ~30 KB.
 * `UI_LANG` (lewat store stub) menggerakkan bahasa blok, persis seperti
 * `settings.general.uiLang` di app.
 */
const ENTRI = `import { writeFileSync } from 'node:fs';
import {
  AMBANG_TOKEN_INTI,
  blokLarangan,
  faktaInti,
  kepalaPotret,
  systemPromptFor,
} from '../../src/lib/systemPrompt';

/*
 * Jam dibekukan SEBELUM prompt dirakit. Satu-satunya bagian prompt yang
 * berubah sendiri dari giliran ke giliran adalah cap waktu potret runtime
 * ("potret <ISO> dari aplikasi ini") - diukur, bukan diduga: dua panggilan
 * tanpa pembekuan beda persis di cap waktu itu. Bekukan jam supaya yang
 * dibandingkan benar-benar TEKS ATURANNYA, bukan jam dinding.
 */
const DateAsli = Date;
const WAKTU_BEKUMEN = 1760000000000;
class DateBeku extends DateAsli {
  constructor(...a) {
    if (a.length === 0) super(WAKTU_BEKUMEN);
    else super(...a);
  }
  static now() {
    return WAKTU_BEKUMEN;
  }
}
globalThis.Date = DateBeku as unknown as DateConstructor;

const keluar = process.env.UJI_LARANGAN_KELUAR ?? '';
const kueri = process.env.UJI_LARANGAN_KUERI ?? '';
const konteks = [
  '# Konteks giliran ini',
  '- Berkas aktif: src/lib/systemPrompt.ts',
  '- Folder terbuka: D:/Zephyr',
  '- Terminal: 0 pane, tidak ada yang gagal',
].join('\\\\n');
const aturanProyek = '- Jalankan node scripts/uji-larangan-live.mjs sebelum bilang selesai.';

const rakit = () => systemPromptFor('follow', konteks, aturanProyek, 'mr-vip', 'custom', 'short', kueri);
const prompt = rakit();
const promptUlang = rakit();

const kep = kepalaPotret();
const larangan = blokLarangan();
const inti = faktaInti();
const intiCore = inti.length + larangan.length + kep.length;

writeFileSync(
  keluar,
  JSON.stringify({
    lang: process.env.UI_LANG || 'en',
    ambangToken: AMBANG_TOKEN_INTI,
    ambangChar: AMBANG_TOKEN_INTI * 4,
    prompt,
    promptUlang,
    larangan,
    laranganUlang: blokLarangan(),
    intiChar: inti.length,
    kepalaChar: kep.length,
    intiCoreChar: intiCore,
    intiCoreToken: Math.ceil(intiCore / 4),
  })
);
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
  name: 'stub-ringan-uji-larangan-live',
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
const BUNDEL = join(KERJA, 'entri.mjs');
await esbuild.build({
  entryPoints: [join(KERJA, 'entri.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: BUNDEL,
  logLevel: 'warning',
  plugins: [pluginStub],
});

/* ------------------------------------------------------------------ *
 * Pembantu: jalankan bundel untuk satu bahasa (proses BARU tiap kali).
 * ------------------------------------------------------------------ */
let nomorJalan = 0;
function jalankan(lang, kueri, tag) {
  nomorJalan += 1;
  const keluar = join(KERJA, `hasil-${lang}-${tag}-${nomorJalan}.json`);
  const anak = spawnSync(process.execPath, [BUNDEL], {
    cwd: AKAR,
    env: {
      ...process.env,
      UI_LANG: lang,
      UJI_LARANGAN_KELUAR: keluar,
      UJI_LARANGAN_KUERI: kueri,
    },
    encoding: 'utf8',
  });
  if (anak.status !== 0) {
    console.error(`GAGAL menjalankan entri (${lang}/${tag}):\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(keluar, 'utf8'));
}

const KUERI = {
  id: 'periksa berkas src/lib/systemPrompt.ts dan laporkan apa yang kamu temukan',
  en: 'check src/lib/systemPrompt.ts and report what you find',
};

/* ------------------------------------------------------------------ *
 * A. 7 aturan wajib, di teks terkirim, per bahasa.
 *    `blok: true` = wajib ada di blok EKOR `blokLarangan()` (bukan cuma di
 *    tempat lain), karena blok itulah yang dipasang item ini.
 * ------------------------------------------------------------------ */
const ATURAN = [
  {
    kunci: 'R1-baca-dulu',
    nama: 'baca dulu sebelum menebak',
    blok: true,
    id: [/Baca dulu sebelum menebak/, /jangan menebak/],
    en: [/Read before you guess/, /do not guess/],
  },
  {
    kunci: 'R2-tool-gagal',
    nama: 'tool gagal -> baca error + coba cara lain',
    blok: false, // sudah ada di blok `caraKerja`, tidak diduplikasi
    id: [/Kalau tool gagal, baca error-nya dan coba cara lain/, /jangan ulangi perintah yang sama/],
    en: [/When a tool fails, read the error and try a different approach/, /never repeat the same command/],
  },
  {
    kunci: 'R3-jangan-mengarang-keluaran',
    nama: 'jangan mengarang keluaran/hasil',
    blok: true,
    // Larangannya ada di blok `aturan`; blok ekor memakai bentuk POSITIF supaya
    // tidak ada frasa yang muncul dua kali (aturan kembar).
    id: [/Jangan mengarang output/, /Keluaran yang kamu kutip harus dari tool/],
    en: [/Never invent output/, /Any output you quote must come from a tool that actually ran/],
  },
  {
    kunci: 'R4-kredensial',
    nama: 'jangan menampilkan kredensial',
    blok: true,
    id: [/Jangan tampilkan isi rahasia/, /API key, token, kunci SSH/],
    en: [/Never print secrets/, /API key, token, SSH key/],
  },
  {
    kunci: 'R5-commit-push',
    nama: 'jangan commit/push tanpa diminta',
    blok: true,
    id: [/commit\/push tanpa diminta user/],
    en: [/commit\/push unless the user asked for it/],
  },
  {
    kunci: 'R6-selesai-bukti',
    nama: "'selesai' = sudah dijalankan + hasilnya dibaca",
    blok: true,
    id: [/klaim bukan bukti\. Jalankan, baca hasilnya/, /Klaim bukan bukti/],
    en: [/a claim is not proof\. Run it, read the result/, /A claim is not proof/],
  },
  {
    kunci: 'R7-bahasa-user',
    nama: 'ikuti bahasa user',
    blok: true,
    id: [/Jawab dalam bahasa aktif aplikasi/, /balas dalam bahasa yang dipakai pengguna/],
    en: [/Answer in the active language of the app/, /reply in the language the user wrote in/],
  },
];

/* ------------------------------------------------------------------ *
 * Pelaporan
 * ------------------------------------------------------------------ */
const hasil = [];
const cetak = (bagian, nama, lulus, detail = '') => {
  hasil.push({ bagian, nama, lulus });
  console.log(`${lulus ? 'OK   ' : 'GAGAL'} ${bagian}.${nama}${detail ? ` - ${detail}` : ''}`);
};
const uji = (bagian, nama, syarat, detail = '') => cetak(bagian, nama, Boolean(syarat), detail);

const id = jalankan('id', KUERI.id, 'a');
const en = jalankan('en', KUERI.en, 'a');

/* ---------------- A. 7 aturan x 2 bahasa = 14 pemeriksaan ---------------- */
console.log(`UJI LARANGAN LIVE (ZEPH-LARANGAN-BLOK) - teks terkirim dari systemPromptFor()`);
console.log(`  prompt terkirim: id ${id.prompt.length} char / ${TOK(id.prompt.length)} tok, en ${en.prompt.length} char / ${TOK(en.prompt.length)} tok`);
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  for (const a of ATURAN) {
    const hilang = a[lang].filter((re) => !re.test(d.prompt));
    uji(
      'A',
      `${a.kunci} ${lang}`,
      hilang.length === 0,
      `${a.nama}: ${a[lang].length - hilang.length}/${a[lang].length} tanda tangan teks ketemu di prompt terkirim${hilang.length ? ` - HILANG: ${hilang.map(String).join(' , ')}` : ''}`
    );
  }
}

/* ---------------- B. anggaran blok inti (angka nyata) ---------------- */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const ambangChar = d.ambangChar;
  const sebelum = SEBELUM[lang];
  const deltaBlok = d.larangan.length - sebelum.blok;
  const sisaSebelum = ambangChar - sebelum.inti;
  const sisaSesudah = ambangChar - d.intiCoreChar;
  console.log(
    `  ${lang}: blok larangan SEBELUM ${sebelum.blok} char -> SESUDAH ${d.larangan.length} char (${deltaBlok >= 0 ? '+' : ''}${deltaBlok})` +
      ` | blok inti SEBELUM ${sebelum.inti} char / ${TOK(sebelum.inti)} tok -> SESUDAH ${d.intiCoreChar} char / ${d.intiCoreToken} tok` +
      ` (sisa ruang ${sisaSebelum} -> ${sisaSesudah} char dari ambang ${ambangChar})`
  );
  uji(
    'B',
    `1 ambang ${lang}`,
    d.intiCoreChar <= ambangChar,
    `blok inti (faktaInti ${d.intiChar} + larangan ${d.larangan.length} + kepala ${d.kepalaChar}) = ${d.intiCoreChar} char / ${d.intiCoreToken} tok <= ${ambangChar} char / ${d.ambangToken} tok`
  );
  uji(
    'B',
    `2 anggaran baca dari kode ${lang}`,
    d.ambangToken === 2000 && ambangChar === 8000,
    `AMBANG_TOKEN_INTI = ${d.ambangToken} token (dibaca dari src/lib/systemPrompt.ts, bukan ditulis di harness)`
  );
  uji(
    'B',
    `3 sisa ruang ${lang}`,
    sisaSesudah >= 0 && deltaBlok <= sisaSebelum,
    `tambahan blok ${deltaBlok} char dibayar dari sisa ${sisaSebelum} char -> sisa akhir ${sisaSesudah} char`
  );
}
console.log(`  catatan SEBELUM: ${SUMBER_SEBELUM}`);

/* ---------------- C. judul blok tidak berubah ---------------- */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const baris1 = d.larangan.split('\n')[0];
  const harap = lang === 'id' ? '# Batas keras' : '# Hard limits';
  uji('C', `1 judul ${lang}`, baris1 === harap, `baris pertama blok larangan = "${baris1}" (harus "${harap}")`);
}
uji(
  'C',
  2,
  !id.larangan.includes('# Hard limits') && !en.larangan.includes('# Batas keras'),
  'judul tidak tertukar antar bahasa (blok id tidak memuat judul en dan sebaliknya)'
);
uji(
  'C',
  3,
  id.prompt.includes('# Batas keras') && en.prompt.includes('# Hard limits'),
  'kedua judul benar-benar ada di teks yang dikirim (bukan cuma di konstanta)'
);

/* ---------------- D. tidak ada aturan kembar/dobel ---------------- */
const barisBernomor = (t) => t.split('\n').filter((b) => /^\d+\./.test(b));
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const baris = d.larangan.split('\n').filter((b) => b.trim().length > 12);
  const kembar = baris.filter((b, i) => baris.indexOf(b) !== i);
  const nomor = barisBernomor(d.larangan);
  uji(
    'D',
    `1 kembar dalam blok ${lang}`,
    kembar.length === 0 && new Set(nomor).size === nomor.length,
    `${nomor.length} butir bernomor, ${new Set(nomor).size} unik, ${kembar.length} baris berulang di dalam blok`
  );
  const ulangDiPrompt = baris.filter((b) => d.prompt.split(b).length - 1 > 1);
  uji(
    'D',
    `2 baris blok diulang di prompt ${lang}`,
    ulangDiPrompt.length === 0,
    ulangDiPrompt.length === 0
      ? 'tidak ada baris blok yang muncul kata-per-kata di tempat lain di prompt'
      : `baris ini muncul >1x di prompt: ${ulangDiPrompt.map((b) => b.slice(0, 40)).join(' | ')}`
  );
  /* Tiap tanda tangan aturan harus muncul PERSIS SEKALI: bukan cuma "ada",
     tapi tidak ada satu pun yang muncul di dua tempat (aturan kembar). */
  const hitung = (teks, re) => (teks.match(new RegExp(re.source, 'g')) ?? []).length;
  const rincian = ATURAN.map((a) => `${a.kunci}=${a[lang].map((re) => hitung(d.prompt, re)).join('+')}`);
  const kembarFrasa = ATURAN.filter((a) => a[lang].some((re) => hitung(d.prompt, re) !== 1));
  uji(
    'D',
    `3 tanda tangan tiap aturan persis 1x ${lang}`,
    kembarFrasa.length === 0,
    `tiap frasa muncul 1x di prompt (${rincian.join(', ')})${kembarFrasa.length ? ` - BUKAN 1x: ${kembarFrasa.map((a) => `${a.kunci}[${a[lang].map((re) => hitung(d.prompt, re)).join('+')}]`).join(', ')}` : ''}`
  );
}

/* ---------------- E. determinisme ---------------- */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  uji('E', `1 dua panggilan seproses ${lang}`, d.prompt === d.promptUlang && d.larangan === d.laranganUlang, `jam dibekukan di entri; prompt ${d.prompt.length} char identik, blok larangan identik`);
  const lagi = jalankan(lang, KUERI[lang], 'b');
  uji('E', `2 proses baru ${lang}`, lagi.prompt === d.prompt, `proses baru menghasilkan prompt ${lagi.prompt.length} char yang identik byte-per-byte`);
}

/* ---------------- F. 7 aturan: di mana ia hidup ---------------- */
for (const [lang, d] of [
  ['id', id],
  ['en', en],
]) {
  const diBlok = ATURAN.filter((a) => a[lang].some((re) => re.test(d.larangan)));
  const wajibDiBlok = ATURAN.filter((a) => a.blok);
  const kurang = wajibDiBlok.filter((a) => !diBlok.includes(a));
  uji(
    'F',
    `1 aturan di blok EKOR ${lang}`,
    kurang.length === 0,
    `${diBlok.length}/${ATURAN.length} aturan ketemu di blokLarangan() (${diBlok.map((a) => a.kunci).join(', ')})${kurang.length ? ` - HILANG: ${kurang.map((a) => a.kunci).join(', ')}` : ''}`
  );
  uji(
    'F',
    `2 blok ekor di teks terkirim ${lang}`,
    d.prompt.includes(d.larangan),
    `seluruh blok larangan (${d.larangan.length} char) benar-benar ada di prompt terkirim`
  );
}

/* ------------------------------------------------------------------ *
 * Ringkasan
 * ------------------------------------------------------------------ */
const gagal = hasil.filter((h) => !h.lulus);
console.log('');
console.log(
  `Ringkas: id blok inti ${id.intiCoreChar} char / ${id.intiCoreToken} tok, en ${en.intiCoreChar} char / ${en.intiCoreToken} tok` +
    ` (ambang ${id.ambangToken} tok / ${id.ambangChar} char).`
);
console.log(`Blok larangan: id ${id.larangan.length} char (sebelum ${SEBELUM.id.blok}), en ${en.larangan.length} char (sebelum ${SEBELUM.en.blok}).`);
console.log(`${hasil.length - gagal.length}/${hasil.length} lulus${gagal.length ? `, GAGAL: ${gagal.map((g) => g.bagian + g.nama).join(', ')}` : ''}`);
process.exit(gagal.length ? 1 : 0);
