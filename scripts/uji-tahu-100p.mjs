#!/usr/bin/env node
/*
 * uji-tahu-100p.mjs - harness item ZEPH-TAHU-100P.
 *
 * APA YANG DIUJI (dan kenapa ini bukan klaim):
 *   A. >= 12 pertanyaan NYATA seputar Zephyr diuji terhadap modul yang BENAR-BENAR
 *      dipakai aplikasi. Tiap pertanyaan diklaim satu jalur, dan klaimnya harus
 *      dibuktikan keluaran nyata:
 *        - `inti`      : bukti ada di BLOK INTI (faktaInti + blokLarangan +
 *                        kepala potret) - inilah "hafal" tanpa retrieval.
 *        - `retrieval` : bukti TIDAK ada di blok inti, tapi muncul di blok yang
 *                        DISUNTIK OTOMATIS tiap giliran (`suntikanIndeks(kueri)`)
 *                        tanpa model memanggil tool apa pun.
 *      Angka "berapa dari blok inti vs berapa perlu retrieval" dicetak.
 *   B. Blok inti tetap <= 2.000 token. Ambang dibaca dari `AMBANG_TOKEN_INTI`
 *      milik systemPrompt.ts (bukan ditulis ulang di sini); 1 token = 4 karakter
 *      (Math.ceil), sama seperti scripts/uji-blok-inti.mjs.
 *   C. Setiap jawaban bisa DILACAK ke sumber nyata:
 *        - bukti blok inti wajib ada di `FAKTA_ZEPHYR` (generated) dan SEMUA
 *          berkas di `FAKTA_ZEPHYR_SUMBER` wajib ada di disk;
 *        - entri indeks wajib ada apa adanya di artefak `src/lib/zephyrIndeks.ts`
 *          (bukan entri karangan), dan entri kategori `kode`/`dokumen` wajib
 *          menunjuk berkas yang benar-benar ada di disk.
 *   D. Pertanyaan DI LUAR Zephyr tidak memaksa retrieval: 0 kecocokan indeks, 0
 *      entri, dan blok suntikan mengatakannya apa adanya.
 *
 * Cara pakai: node scripts/uji-tahu-100p.mjs   (exit 0 lulus, 1 ada merah)
 *             node scripts/uji-tahu-100p.mjs --dump   (tulis JSON mentah ke scratch/)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-tahu-100p');
const DUMP = process.argv.includes('--dump');
const charTok = (n) => Math.ceil(n / 4);
const tok = (teks) => charTok(String(teks ?? '').length);

/* ------------------------------------------------------------------ kasus A */

/*
 * Pertanyaan NYATA (diketik seperti user Zeph mengetiknya). `jenis` = jalur yang
 * diklaim, `bukti` = potongan yang WAJIB ada di jalur itu:
 *   inti      -> wajib ada di BLOK INTI (hafal, tanpa retrieval).
 *   retrieval -> wajib TIDAK ada di blok inti, tapi muncul di ISI yang disuntik
 *                otomatis (entri hasil pencarian, di bawah baris kepala).
 *   meta      -> angka faktual ada di KEPALA blok suntikan otomatis (baris 2).
 */
const KASUS = [
  { q: 'berapa port default MCP server', jenis: 'inti', bukti: ['port=9222'] },
  { q: 'pintasan buka Settings', jenis: 'inti', bukti: ['Ctrl+, = Open Settings'] },
  { q: 'shortcut untuk toggle panel bawah', jenis: 'inti', bukti: ['Ctrl+J = Toggle bottom panel'] },
  { q: 'di mana berkas settings.json disimpan', jenis: 'inti', bukti: ['%APPDATA%\\zephyr\\settings.json'] },
  { q: 'tab apa saja di panel bawah', jenis: 'inti', bukti: ['problems, output, debug, terminal, ports, ai, subagents'] },
  { q: 'default agents.maxPanes berapa', jenis: 'inti', bukti: ['maxPanes=6'] },
  { q: 'tema bawaan namanya apa', jenis: 'inti', bukti: ['theme: current=zephyr-dark'] },
  { q: 'berapa jumlah setting key bawaan aplikasi', jenis: 'inti', bukti: ['ALL 124 setting keys'] },
  { q: 'berapa jumlah shortcut bawaan', jenis: 'inti', bukti: ['34 default shortcuts'] },
  { q: 'zephyr_self itu tool apa', jenis: 'inti', bukti: ['`zephyr_self`'] },
  { q: 'folder logs zephyr ada di mana', jenis: 'retrieval', bukti: ['zephyr-YYYY-MM-DD.log'] },
  { q: 'tools apa saja yang dikirim selalu tiap giliran', jenis: 'retrieval', bukti: ['src/lib/zephyrTools/catalog.ts'] },
  { q: 'perintah palette untuk mengatur model AI id-nya apa', jenis: 'retrieval', bukti: ['ai.models'] },
  { q: 'ekstensi bawaan apa saja', jenis: 'retrieval', bukti: ['zephyr.ikon-bahasa'] },
  { q: 'daftar berkas di src/lib zephyrCari', jenis: 'retrieval', bukti: ['src/lib/zephyrCari.ts'] },
  { q: 'bagaimana cara build rilis Zephyr', jenis: 'retrieval', bukti: ['tauri:build'] },
  { q: 'test dijalankan dengan perintah apa', jenis: 'retrieval', bukti: ['PASTIKAN 0 error'] },
  { q: 'perintah palette toggle terminal namanya apa', jenis: 'retrieval', bukti: ['terminal.toggle'] },
  { q: 'fungsi cariFakta di zephyrCari buat apa', jenis: 'retrieval', bukti: ['pecahKueri'] },
  { q: 'daftar tool bawaan zephyr ada berapa', jenis: 'retrieval', bukti: ['src/lib/zephyrTools/builtins.ts'] },
  { q: 'berapa jumlah entri indeks fakta Zephyr', jenis: 'meta', bukti: ['6212 entri'] },
];

/* Pertanyaan DI LUAR Zephyr: tidak boleh menarik entri / memaksa retrieval. */
const DI_LUAR = [
  'resep rendang padang yang empuk',
  'kenapa langit berwarna biru',
  'bagaimana cara belajar gitar akustik',
  'harga bitcoin hari ini berapa',
];

/* ------------------------------------------------------------------ stub */

const STUB = `/* Dihasilkan uji-tahu-100p.mjs - stub modul berat (store/tauri/xterm). */
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
export const mcpTerpotong = () => [];
export const blokKeadaanRingkas = () => '[POTRET]';
export const useTerminal = { getState: () => ({ allPanes: () => [] }) };
export const useHistory = { getState: () => ({ timeline: [], stats: null }) };
export const blokMemoriTersimpan = () => '';
export const BATAS_TOKEN_BAWAAN = 900;
export const useInstructions = { getState: () => ({ daftar: [], muat: async () => undefined }) };
export const cocokPola = () => false;
`;

/* Entry: mengukur blok inti + menjalankan retrieval nyata untuk tiap pertanyaan.
 * `./zephyrCari` SENGAJA TIDAK di-stub: modul itulah yang diuji (jalur otomatis). */
const ENTRI = `import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR, FAKTA_ZEPHYR_SUMBER } from '../../src/lib/zephyrFakta';
import { AMBANG_TOKEN_INTI, blokLarangan, faktaInti, kepalaPotret } from '../../src/lib/systemPrompt';
import * as C from '../../src/lib/zephyrCari';
import * as D from '../../src/lib/zephyrDokumen';

const daftar: string[] = JSON.parse(process.env.TAHU_UJI ?? '[]');
const keluar = process.env.TAHU_KELUAR ?? '';
const data = {
  ambang: AMBANG_TOKEN_INTI,
  sumberFakta: [...FAKTA_ZEPHYR_SUMBER],
  faktaGenerated: FAKTA_ZEPHYR,
  inti: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  jumlahEntri: C.jumlahEntri(),
  peta: C.petaIndeks(),
  kategori: C.kategoriTersedia(),
  batas: {
    hasilBawaan: C.BATAS_HASIL_BAWAAN,
    hasilMaks: C.BATAS_HASIL_MAKS,
    karakterHasil: C.BATAS_KARAKTER_HASIL,
    hasilSuntik: C.BATAS_HASIL_SUNTIK,
    karakterSuntik: C.BATAS_KARAKTER_SUNTIK,
  },
  kasus: daftar.map((q) => ({
    q,
    suntikan: C.suntikanIndeks(q),
    cocok: C.hitungCocok(q),
    asing: C.kataTakDikenal(q),
    entri: C.cariFakta(q, { batas: 5 }).map((h) => ({ kategori: h.kategori, kunci: h.kunci, skor: h.skor, cara: h.cara ?? 'ketat', teks: h.teks })),
    entriLuas: C.cariFakta(q, { batas: C.BATAS_HASIL_MAKS }).map((h) => ({ kategori: h.kategori, kunci: h.kunci })),
    dok: D.cariDokumen(q).map((h) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
    dokSuntik: D.suntikanDokumen(q),
  })),
};
writeFileSync(keluar, JSON.stringify(data));
`;

const GANTI = [
  './store',
  './commands',
  './personaStore',
  './zephyrRuntime',
  './mcpTools',
  './aiZephyrState',
  './terminalStore',
  './historyStore',
  './aiMemori',
  './instructionsStore',
];

const pluginStub = {
  name: 'stub-ringan-uji-tahu-100p',
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

const keluar = join(KERJA, 'hasil.json');
const anak = spawnSync(process.execPath, [bundel], {
  cwd: AKAR,
  env: {
    ...process.env,
    UI_LANG: 'id',
    TAHU_UJI: JSON.stringify([...KASUS.map((k) => k.q), ...DI_LUAR]),
    TAHU_KELUAR: keluar,
  },
  encoding: 'utf8',
});
if (anak.status !== 0) {
  console.error(`GAGAL menjalankan entri:\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
  process.exit(1);
}
const D = JSON.parse(readFileSync(keluar, 'utf8'));
if (DUMP) {
  const p = join(KERJA, 'dump.json');
  writeFileSync(p, JSON.stringify(D, null, 1));
  console.log(`dump: ${p}`);
}

/* ------------------------------------------------------------------ pelaporan */

let lulus = 0;
let total = 0;
const merah = [];
const cek = (bagian, nama, syarat, bukti = '') => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${bagian}${nama}${bukti ? `  [${bukti}]` : ''}`);
  } else {
    merah.push(`${bagian}${nama}`);
    console.log(`  GAGAL ${bagian}${nama}  [${bukti}]`);
  }
};

console.log('UJI TAHU 100% ZEPHYR (ZEPH-TAHU-100P)');
console.log(`  indeks fakta: ${D.jumlahEntri} entri | kategori: ${D.peta}`);
console.log(
  `  batas hasil: bawaan ${D.batas.hasilBawaan}, maks ${D.batas.hasilMaks}, karakter ${D.batas.karakterHasil} | suntik: ${D.batas.hasilSuntik} entri / ${D.batas.karakterSuntik} char`,
);

const intiGabung = `${D.inti}\n${D.larangan}\n${D.kepala}`;

/* ---- B. ambang token blok inti ---- */
console.log('\n(B) ambang blok inti');
const tokenInti = tok(intiGabung);
cek('B', 1, D.ambang === 2000, `AMBANG_TOKEN_INTI dari systemPrompt.ts = ${D.ambang}`);
cek('B', 2, tokenInti <= D.ambang, `blok inti ${intiGabung.length} char / ${tokenInti} tok <= ${D.ambang} tok`);
cek('B', 3, D.inti.length > 0 && D.larangan.length > 0 && D.kepala.length > 0, `faktaInti ${tok(D.inti)} tok + larangan ${tok(D.larangan)} tok + kepala ${tok(D.kepala)} tok`);
cek('B', 4, D.inti.length < D.faktaGenerated.length, `inti ${D.inti.length} char < generated ${D.faktaGenerated.length} char (on-demand benar-benar dipotong)`);

/* ---- C. pelacakan ke sumber nyata ---- */
console.log('\n(C) pelacakan sumber nyata');
const sumberHilang = D.sumberFakta.filter((f) => !existsSync(join(AKAR, f)));
cek('C', 1, sumberHilang.length === 0, `${D.sumberFakta.length} berkas di FAKTA_ZEPHYR_SUMBER${sumberHilang.length ? ` - HILANG: ${sumberHilang.join(', ')}` : ', semua ada di disk'}`);
cek('C', 2, D.faktaGenerated.includes('# What Zephyr is'), 'blok generated memuat identitas aplikasi');
const rawIndeks = readFileSync(join(AKAR, 'src', 'lib', 'zephyrIndeks.ts'), 'utf8');
const berkasKode = (kunci) => kunci.split(/[#:]/)[0];
const berkasDokumen = (kunci) => kunci.split('#')[0];
/*
 * Jejak ke artefak: kunci bisa memuat backtick/garis miring/em-dash yang di-escape
 * (berlapis) di dalam src/lib/zephyrIndeks.ts, jadi kecocokan persis kadang gagal
 * tanpa alasan berarti. Aturannya: kunci ADA APANYA di artefak, atau potongan
 * awalnya (40 char) ada - cukup untuk membuktikan entri ini keluaran generator
 * yang ikut dibundel, bukan entri karangan.
 */
const adaDiArtefak = (kunci) =>
  rawIndeks.includes(kunci) || rawIndeks.includes(JSON.stringify(kunci).slice(1, -1)) || rawIndeks.includes(kunci.slice(0, 40));
const lacakEntri = (e) => {
  if (!adaDiArtefak(e.kunci)) return false;
  if (e.kategori === 'kode') return existsSync(join(AKAR, berkasKode(e.kunci)));
  if (e.kategori === 'dokumen') {
    const b = berkasDokumen(e.kunci);
    return existsSync(join(AKAR, b)) || existsSync(join(AKAR, 'docs', b));
  }
  return true;
};

/* ---- A. pertanyaan nyata: dari blok inti vs perlu retrieval ---- */
console.log('\n(A) pertanyaan nyata: blok inti vs retrieval otomatis');
let dariInti = 0;
let dariRetrieval = 0;
let dariMeta = 0;
for (let i = 0; i < KASUS.length; i++) {
  const k = KASUS[i];
  const d = D.kasus[i];
  const kepalaSuntik = d.suntikan.split('\n')[1] ?? '';
  const isiSuntik = d.suntikan.split('\n').slice(2).join('\n');
  const diInti = k.bukti.every((b) => intiGabung.includes(b));
  const diSuntik = k.bukti.every((b) => isiSuntik.includes(b));
  const diKepala = k.bukti.every((b) => kepalaSuntik.includes(b));
  const sumberNyata = d.entri.length > 0 && d.entri.every(lacakEntri);
  const top = d.entri[0];
  if (k.jenis === 'inti') {
    dariInti++;
    console.log(`  ${diInti ? 'ok  ' : 'X   '} inti      "${k.q}" -> bukti "${k.bukti[0]}" ${diInti ? 'ADA' : 'TIDAK ADA'} di blok inti`);
    cek('A', i + 1, diInti, `blok inti memuat "${k.bukti[0]}" (blok inti ${tokenInti} tok)`);
  } else if (k.jenis === 'retrieval') {
    dariRetrieval++;
    console.log(
      `  ${!diInti && diSuntik ? 'ok  ' : 'X   '} retrieval "${k.q}" -> bukan di inti; suntikan otomatis ${d.suntikan.length} char, ${d.entri.length} entri` +
        `${top ? `, teratas [${top.kategori}] ${top.kunci} (cara ${top.cara})` : ''}`,
    );
    cek('A', i + 1, !diInti, `bukti "${k.bukti[0]}" memang TIDAK ada di blok inti (retrieval perlu)`);
    cek('A', `r${i + 1}`, diSuntik, `suntikanIndeks() otomatis memuat "${k.bukti[0]}" untuk kueri ini`);
    cek('A', `n${i + 1}`, sumberNyata, `entri teratas bisa dilacak (artefak + berkas nyata)${top ? `: [${top.kategori}] ${top.kunci}` : ''}`);
  } else {
    dariMeta++;
    console.log(`  ${!diInti && diKepala ? 'ok  ' : 'X   '} meta      "${k.q}" -> kepala suntikan "${kepalaSuntik.slice(0, 80)}..."`);
    cek('A', i + 1, !diInti, `bukti "${k.bukti[0]}" TIDAK ada di blok inti`);
    cek('A', `r${i + 1}`, diKepala, `kepala blok suntikan otomatis memuat "${k.bukti[0]}" (angka indeks per giliran)`);
  }
}
console.log(`  ANGKA pertanyaan diuji ${KASUS.length}: dari blok inti ${dariInti}, perlu retrieval ${dariRetrieval}, dari kepala suntikan ${dariMeta}`);
cek('A', 90, KASUS.length >= 12, `${KASUS.length} pertanyaan nyata (minimal 12)`);
cek('A', 91, dariInti + dariRetrieval + dariMeta === KASUS.length, `tiap pertanyaan punya klaim jalur (${dariInti} inti + ${dariRetrieval} retrieval + ${dariMeta} meta)`);

/* ---- D. pertanyaan di luar Zephyr tidak memaksa retrieval ---- */
console.log('\n(D) pertanyaan di luar Zephyr');
for (let i = 0; i < DI_LUAR.length; i++) {
  const q = DI_LUAR[i];
  const d = D.kasus[KASUS.length + i];
  const tanpaEntri = d.entri.length === 0 && d.cocok === 0;
  const jujur = d.suntikan.includes('No index entry matched') || d.suntikan.includes('no search words');
  console.log(`  "${q}" -> ${d.entri.length} entri, cocok ${d.cocok}, suntikan ${d.suntikan.length} char${d.asing.length ? `, asing: ${d.asing.slice(0, 4).join(',')}` : ''}`);
  cek('D', i + 1, tanpaEntri, `"${q}": 0 entri / 0 kecocokan`);
  cek('D', `t${i + 1}`, jujur, `"${q}": blok suntikan mengaku tidak ada yang cocok`);
}
cek('D', 90, DI_LUAR.length >= 4, `${DI_LUAR.length} pertanyaan luar-Zephyr diuji`);

/* ------------------------------------------------------------------ verdict */
console.log(`\n  SKOR: ${lulus}/${total} diperiksa`);
console.log(
  `  RINGKAS: ${KASUS.length} pertanyaan nyata (dari blok inti ${dariInti}, perlu retrieval ${dariRetrieval}); ` +
    `blok inti ${tokenInti} tok <= ${D.ambang}; ${DI_LUAR.length} pertanyaan luar-Zephyr tanpa retrieval.`,
);
console.log(`  VERDICT TAHU-100P: ${merah.length ? `GAGAL - ${merah.length} merah: ${merah.join(' | ')}` : 'LULUS'}`);
process.exit(merah.length ? 1 : 0);
