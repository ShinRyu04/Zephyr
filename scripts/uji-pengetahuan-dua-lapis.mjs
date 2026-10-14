#!/usr/bin/env node
/**
 * uji-pengetahuan-dua-lapis.mjs — GATE PENGETAHUAN DUA LAPIS Zephyr (AI-TAHU-100-7).
 *
 * Dua lapis yang diuji, apa adanya dari kode (bukan dari salinan di berkas ini):
 *
 *   LAPIS 1 - blok inti: selalu ikut tiap giliran. Isinya `faktaInti()` (blok
 *   fakta generated MINUS bullet on-demand) + `blokLarangan()` + kepala/label
 *   blok keadaan. Anggarannya `AMBANG_TOKEN_INTI` = 2.000 token, dengan rumus
 *   yang sama seperti `AMBANG_TOKEN_INTI` di `src/lib/systemPrompt.ts`:
 *       token = Math.ceil(panjang_karakter / 4)
 *   Aturan BARU tidak boleh ditambahkan ke lapis ini — rumahnya blok
 *   kondisional (`blokKondisional`) yang hanya menempel saat topiknya disebut.
 *
 *   LAPIS 2 - cari on-demand: `suntikanIndeks(kueri)` dari `src/lib/zephyrCari.ts`
 *   (modul NYATA, tidak di-stub) di atas indeks generated `zephyrIndeks.ts`.
 *   Hanya ikut saat RELEVAN: pesan di luar topik Zephyr harus menghasilkan NOL
 *   entri, bukan potongan serba bisa.
 *
 * Kasus yang dijaga (26):
 *   A. lapis 1 TIDAK melewati ambang 2.000 token, juga saat aturan baru ditambah
 *      (aturan baru wajib punya rumah di blok kondisional, bukan di blok inti).
 *   B. lapis 2 on-demand dan HANYA saat relevan (pertanyaan di luar Zephyr ->
 *      nol suntikan), dengan anggaran hasil yang berlaku.
 *   C. penggabungan dua lapis TIDAK PERNAH kehilangan fakta yang sudah ada
 *      (superset: potong + on-demand == blok generated apa adanya) dan lapis 2
 *      tidak pernah mengarang nama di luar indeks.
 *   D. determinisme: panggilan ulang menghasilkan teks yang identik.
 *
 * Teknik: harness ini men-stub hanya modul yang butuh browser/tauri (persis daftar
 * `scripts/uji-blok-inti.mjs`), TAPI sengaja TIDAK men-stub `./zephyrCari` -
 * lapis 2 harus modul nyata supaya yang diuji benar-benar yang dipakai aplikasi.
 *
 * Cara pakai:
 *   node scripts/uji-pengetahuan-dua-lapis.mjs     (dari akar repo; butuh esbuild)
 *   exit 0 = lulus; exit 1 = ada yang merah (disebut mana).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-pengetahuan-dua-lapis');

/* Angka yang DIUKUR, bukan diwarisi: ambang resmi dibaca dari modul di bawah. */
const AMBANG_TOKEN_FALLBACK = 2000;
const charTok = (n) => Math.ceil(n / 4);
const tok = (t) => charTok(typeof t === 'number' ? t : String(t ?? '').length);

const OFF_TOPIK = [
  'tolong tuliskan puisi pendek tentang hujan di bulan april',
  'buatkan resep rendang padang yang enak untuk 4 orang',
  'siapa pemenang liga champions tahun 2019',
];
const KOSONG = '';
const PEMICU_KELAS = [
  'berapa provider dan model aktif sekarang',
  'buat tabel perbandingan',
  'bagaimana tata letak panel bawah',
  'kenapa error muncul di log',
  'di mana API key disimpan',
  'pakai subagent paralel untuk audit',
];

/* ------------------------------------------------------------------ stub
 * Sama seperti `scripts/uji-blok-inti.mjs`, MINUS `suntikanIndeks` (itu justru
 * modul nyata yang diuji di sini) - kalau ia ikut di-stub, lapis 2 tidak diuji
 * sama sekali. */

const STUB = `/* Dihasilkan uji-pengetahuan-dua-lapis.mjs - stub modul berat (lapis 2 NYATA). */
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

/* Modul yang diganti stub. `./zephyrCari` SENGAJA TIDAK ADA di daftar ini. */
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

const ENTRI = `import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import { FAKTA_INDEKS, FAKTA_VERSI } from '../../src/lib/zephyrIndeks';
import {
  AMBANG_TOKEN_INTI,
  blokKondisional,
  blokLarangan,
  faktaInti,
  faktaOnDemand,
  kelasKondisional,
  kelasKondisionalTersedia,
  kepalaPotret,
  kodeBahasaPrompt,
} from '../../src/lib/systemPrompt';
import {
  BATAS_HASIL_SUNTIK,
  BATAS_KARAKTER_SUNTIK,
  suntikanIndeks,
} from '../../src/lib/zephyrCari';

const keluar = process.env.DUA_LAPIS_KELUAR || '';
const offTopik: string[] = JSON.parse(process.env.DUA_LAPIS_OFF || '[]');
const kosong = process.env.DUA_LAPIS_KOSONG || '';
const kelas = kelasKondisionalTersedia();
const kandidat = FAKTA_INDEKS.map((e) => e[1])
  .filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k))
  .slice(0, 60);

const data = {
  lang: kodeBahasaPrompt(),
  ambang: AMBANG_TOKEN_INTI,
  batasKarakterSuntik: BATAS_KARAKTER_SUNTIK,
  batasHasilSuntik: BATAS_HASIL_SUNTIK,
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  intiUlang: faktaInti(),
  larangan: blokLarangan(),
  laranganUlang: blokLarangan(),
  kepala: kepalaPotret(),
  kelas,
  kelasUlang: kelasKondisionalTersedia(),
  onDemand: kelas.map((k) => [k, faktaOnDemand(k)]),
  pemicu: ${JSON.stringify(PEMICU_KELAS)},
  kelasTerpicu: ${JSON.stringify(PEMICU_KELAS)}.map((p) => kelasKondisional(p)),
  blokTerpicu: ${JSON.stringify(PEMICU_KELAS)}.map((p) => blokKondisional(p)),
  offTopik: offTopik.map((q) => [q, suntikanIndeks(q)]),
  offTopikUlang: offTopik.map((q) => [q, suntikanIndeks(q)]),
  kosong: [kosong, suntikanIndeks(kosong)],
  kandidat: kandidat.map((k) => [k, suntikanIndeks(k)]),
  kandidatUlang: kandidat.slice(0, 5).map((k) => [k, suntikanIndeks(k)]),
  sempit: kandidat.slice(0, 3).map((k) => [k, suntikanIndeks(k, { batasKarakter: 300 })]),
  indeksJumlah: FAKTA_INDEKS.length,
  versi: FAKTA_VERSI,
  prefiks: FAKTA_INDEKS.map((e) => '[' + e[0] + '] ' + e[1] + ': '),
  pasangan: FAKTA_INDEKS.map((e) => e[0] + '\\u0001' + e[1]),
};
writeFileSync(keluar, JSON.stringify(data));
`;

const pluginStub = {
  name: 'stub-ringan-uji-dua-lapis',
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

/* ------------------------------------------------------------------ pengukuran */

let merah = 0;
let total = 0;
const cek = (bagian, id, nama, syarat, bukti = '') => {
  total++;
  if (syarat) console.log(`  OK    ${bagian}${id} ${nama}  [${bukti}]`);
  else {
    merah++;
    console.log(`  GAGAL ${bagian}${id} ${nama}  [${bukti}]`);
  }
};
const angka = (nama, nilai) => console.log(`  ANGKA ${nama.padEnd(44)} ${nilai}`);

function ukur(lang) {
  const keluar = join(KERJA, `hasil-${lang}.json`);
  const anak = spawnSync(process.execPath, [BUNDEL], {
    cwd: AKAR,
    env: {
      ...process.env,
      UI_LANG: lang,
      DUA_LAPIS_KELUAR: keluar,
      DUA_LAPIS_OFF: JSON.stringify(OFF_TOPIK),
      DUA_LAPIS_KOSONG: KOSONG,
    },
    encoding: 'utf8',
  });
  if (anak.status !== 0) {
    console.error(`GAGAL menjalankan entri (${lang}):\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(keluar, 'utf8'));
}

/* Jumlah entri lapis 2 = baris `[kategori] kunci: teks` (format asli zephyrCari). */
const entriLapis2 = (teks) => (String(teks).match(/^\[[a-z]+\] /gm) ?? []).length;
const lapis2Kosong = (teks) =>
  String(teks).includes("No index entry matched this message's words") ||
  String(teks).includes('carries no search words');

const id = ukur('id');
const en = ukur('en');
const AMBANG = id.ambang || AMBANG_TOKEN_FALLBACK;

console.log('GATE PENGETAHUAN DUA LAPIS ZEPHYR (AI-TAHU-100-7)');
console.log(`AMBANG blok inti: ${AMBANG} token = ${AMBANG * 4} karakter (token = Math.ceil(karakter / 4))`);

/* ------------------------------------------------------------------ A. lapis 1 */

console.log('\n(A) lapis 1 (blok inti) tidak melewati ambang 2.000 token saat aturan baru ditambah');
angka('AMBANG_TOKEN_INTI dibaca dari modul', AMBANG);
for (const [nama, d] of [['id', id], ['en', en]]) {
  const intiLarangan = d.inti.length + d.larangan.length;
  const plusKepala = intiLarangan + d.kepala.length;
  angka(`blok generated (${nama})`, `${d.fakta.length} char / ${tok(d.fakta)} tok`);
  angka(`  inti fakta (${nama})`, `${d.inti.length} char / ${tok(d.inti)} tok`);
  angka(`  inti + larangan (${nama})`, `${intiLarangan} char / ${tok(intiLarangan)} tok`);
  angka(`  inti + larangan + kepala (${nama})`, `${plusKepala} char / ${tok(plusKepala)} tok`);
}
cek('A', 1, 'AMBANG_TOKEN_INTI == 2000 (dibaca dari modul, bukan salinan)', AMBANG === AMBANG_TOKEN_FALLBACK, `${AMBANG}`);
cek('A', 2, 'faktaInti() <= ambang (id)', tok(id.inti) <= AMBANG, `${tok(id.inti)} <= ${AMBANG} tok`);
cek('A', 3, 'faktaInti() + blokLarangan() <= ambang (id)', tok(id.inti.length + id.larangan.length) <= AMBANG, `${tok(id.inti.length + id.larangan.length)} <= ${AMBANG} tok`);
cek('A', 4, 'faktaInti() + blokLarangan() + kepalaPotret() <= ambang (id)', tok(id.inti.length + id.larangan.length + id.kepala.length) <= AMBANG, `${tok(id.inti.length + id.larangan.length + id.kepala.length)} <= ${AMBANG} tok`);
cek('A', 5, 'faktaInti() + blokLarangan() + kepalaPotret() <= ambang (en)', tok(en.inti.length + en.larangan.length + en.kepala.length) <= AMBANG, `${tok(en.inti.length + en.larangan.length + en.kepala.length)} <= ${AMBANG} tok`);
cek('A', 6, 'faktaInti() <= ambang x 4 karakter (rumus ceil(len/4) konsisten)', id.inti.length <= AMBANG * 4, `${id.inti.length} <= ${AMBANG * 4} char`);
const PENANDA_KONDISIONAL = ['# Aturan tambahan', '# Prosedur tambahan', '# Fakta tambahan', '# Extra rule', '# Extra facts', '# Extra procedure'];
const bocorKeInti = PENANDA_KONDISIONAL.filter((p) => id.inti.includes(p) || id.larangan.includes(p) || id.kepala.includes(p));
cek('A', 7, 'aturan baru tidak bocor ke blok inti (penanda kondisional absen)', bocorKeInti.length === 0, bocorKeInti.join(', ') || 'tidak ada');
cek('A', 8, 'setiap kelas kondisional terdaftar bisa dipicu contoh pesan nyata', id.kelas.length > 0 && id.kelas.every((k) => id.kelasTerpicu.some((t) => t.includes(k))), `${id.kelas.length} kelas: ${id.kelas.join(', ')}`);
cek('A', 9, 'aturan baru punya isi nyata saat topiknya disebut (blok kondisional tidak kosong)', id.blokTerpicu.every((b) => String(b).trim().length > 0), `${id.blokTerpicu.filter((b) => String(b).trim()).length}/${id.blokTerpicu.length} blok terisi`);
const sisaId = AMBANG - tok(id.inti.length + id.larangan.length + id.kepala.length);
angka('sisa anggaran blok inti (id)', `${sisaId} token`);
cek('A', 10, 'blok inti masih punya sisa anggaran (bukan pas-pasan 100%)', sisaId > 0, `${sisaId} tok sisa`);

/* ------------------------------------------------------------------ B. lapis 2 */

console.log('\n(B) lapis 2 diambil on-demand dan HANYA saat relevan');
angka('pertanyaan di luar Zephyr diuji', OFF_TOPIK.length);
const offEntri = id.offTopik.map(([q, t]) => ({ q, n: entriLapis2(t), kosong: lapis2Kosong(t) }));
for (const o of offEntri) angka(`  "${o.q.slice(0, 34)}…"`, `${o.n} entri`);
cek('B', 1, 'pertanyaan di luar Zephyr (3 contoh) -> nol suntikan', offEntri.every((o) => o.n === 0), offEntri.map((o) => o.n).join('/'));
cek('B', 2, 'pertanyaan di luar Zephyr -> blok menyebut tidak ada yang cocok', offEntri.every((o) => o.kosong), offEntri.filter((o) => o.kosong).length + '/' + offEntri.length);
const kepalaMetaAda = id.offTopik.every(([, t]) => String(t).includes('entries, app ') && String(t).includes('categories: '));
cek('B', 3, 'blok lapis 2 tetap memuat meta indeks (model tahu indeks ada)', kepalaMetaAda, kepalaMetaAda ? 'meta ada di semua contoh' : 'meta hilang');
cek('B', 4, `kueri kosong ("") -> nol entri + kalimat "carries no search words"`, entriLapis2(id.kosong[1]) === 0 && lapis2Kosong(id.kosong[1]), `${entriLapis2(id.kosong[1])} entri`);
const hidup = id.kandidat.filter(([, t]) => entriLapis2(t) >= 1);
angka('kandidat kueri diambil dari indeks sendiri', id.kandidat.length);
angka('kandidat yang menarik >= 1 entri', hidup.length);
cek('B', 5, 'kueri yang diambil dari indeks sendiri menarik entri (lapis 2 benar-benar hidup)', hidup.length >= 1, hidup.length ? `mis. "${hidup[0][0]}" -> ${entriLapis2(hidup[0][1])} entri` : 'tidak ada yang cocok');
const onTopik = hidup[0] ?? ['', ''];
angka('blok lapis 2 contoh on-topic', `${onTopik[1].length} char / ${entriLapis2(onTopik[1])} entri`);
angka('blok lapis 2 contoh off-topic', `${id.offTopik[0][1].length} char / ${entriLapis2(id.offTopik[0][1])} entri`);
cek('B', 6, 'penyuntikan bersyarat: off-topic 0 entri < on-topic >= 1 entri', entriLapis2(id.offTopik[0][1]) === 0 && entriLapis2(onTopik[1]) >= 1, `${entriLapis2(id.offTopik[0][1])} < ${entriLapis2(onTopik[1])}`);
cek('B', 7, 'jumlah entri lapis 2 tidak melewati BATAS_HASIL_SUNTIK', hidup.every(([, t]) => entriLapis2(t) <= id.batasHasilSuntik), `batas ${id.batasHasilSuntik} entri, maks terukur ${Math.max(0, ...hidup.map(([, t]) => entriLapis2(t)))}`);
const pasanganSempit = id.sempit.map(([k, t]) => {
  const bawaan = id.kandidat.find(([kk]) => kk === k);
  return { k, sempit: t, bawaan: bawaan ? bawaan[1] : '' };
});
cek(
  'B',
  8,
  'anggaran karakter dipatuhi: batasKarakter 300 memangkas blok (lebih pendek, entri tidak bertambah)',
  pasanganSempit.every((x) => x.bawaan !== '' && x.sempit.length <= x.bawaan.length && entriLapis2(x.sempit) <= entriLapis2(x.bawaan)),
  pasanganSempit.map((x) => `${x.sempit.length}<=${x.bawaan.length}`).join(' / ') + ' char',
);
cek('B', 9, 'blok inti tidak memuat teks lapis 2 (dua lapis memang terpisah)', !id.inti.includes('entries, app ') && !id.larangan.includes('categories: '), 'inti bersih dari meta indeks');

/* ------------------------------------------------------------------ C. superset */

console.log('\n(C) penggabungan dua lapis tidak pernah kehilangan fakta (superset)');
const barisFakta = id.fakta.split('\n');
const barisInti = id.inti.split('\n');
const onDemandGaris = id.onDemand.map(([k, t]) => ({ k, teks: String(t).trim() })).filter((x) => x.teks);
angka('baris blok generated', barisFakta.length);
angka('baris blok inti (setelah dipotong)', barisInti.length);
angka('bullet on-demand dipotong dari inti', onDemandGaris.length);
const gabungUlang = barisFakta.filter((b) => !onDemandGaris.some((o) => o.teks === b)).join('\n');
cek('C', 1, 'inti + bullet on-demand == blok generated apa adanya (byte-exact)', gabungUlang === id.inti, gabungUlang === id.inti ? 'identik' : `${gabungUlang.length} vs ${id.inti.length} char`);
cek('C', 2, 'tidak ada baris yang hilang diam-diam saat memotong', barisFakta.length - barisInti.length === onDemandGaris.length, `${barisFakta.length} - ${barisInti.length} = ${onDemandGaris.length}`);
const intiSet = new Set(barisInti);
cek('C', 3, 'tiap baris inti ada di blok generated, tiap bullet on-demand TIDAK ada di inti', barisInti.every((b) => barisFakta.includes(b)) && onDemandGaris.every((o) => !intiSet.has(o.teks)), `${onDemandGaris.map((o) => o.k).join(', ')} tidak tumpang tindih`);
const pasanganIndeks = new Set(id.pasangan);
const barisLapis2 = hidup.flatMap(([, t]) => String(t).match(/^\[[a-z]+\] .*$/gm) ?? []);
/* Kunci di indeks bisa sendiri memuat ": " (mis. kunci `": apa pun yang ..."`), jadi
   cocokkan ke SETIAP batas ": " di baris - bukan hanya kecocokan pertama. */
const petakanEntri = (baris) => {
  const m = /^\[([a-z]+)\] /.exec(baris);
  if (!m) return null;
  const kategori = m[1];
  let idx = baris.indexOf(': ', m[0].length);
  while (idx >= 0) {
    const kunci = baris.slice(m[0].length, idx);
    if (pasanganIndeks.has(`${kategori}\u0001${kunci}`)) return { kategori, kunci };
    idx = baris.indexOf(': ', idx + 1);
  }
  return { kategori, kunci: null };
};
const entriAsing = barisLapis2.map((b) => ({ b, p: petakanEntri(b) })).filter(({ p }) => !p || p.kunci === null);
angka('entri lapis 2 diperiksa keasliannya', barisLapis2.length);
cek(
  'C',
  4,
  'tiap entri lapis 2 bisa dipetakan balik ke indeks (tidak mengarang nama)',
  barisLapis2.length > 0 && entriAsing.length === 0,
  entriAsing.length ? `${entriAsing.length} asing, mis. ${JSON.stringify(entriAsing[0].b.slice(0, 60))}` : `${barisLapis2.length} entri sah dari ${pasanganIndeks.size} pasangan indeks`,
);

/* ------------------------------------------------------------------ D. determinisme */

console.log('\n(D) determinisme');
cek('D', 1, 'faktaInti() dipanggil dua kali -> identik', id.inti === id.intiUlang, `${id.inti.length} char`);
cek('D', 2, 'blokLarangan() dipanggil dua kali -> identik (id dan en)', id.larangan === id.laranganUlang && en.larangan === en.laranganUlang, `${id.larangan.length} char`);
cek('D', 3, 'suntikanIndeks() dipanggil dua kali -> identik (off-topic + on-topic)', id.offTopik.every((x, i) => x[1] === id.offTopikUlang[i][1]) && id.kandidatUlang.every((x, i) => x[1] === id.kandidat[i][1]), `${id.offTopikUlang.length + id.kandidatUlang.length} panggilan ulang`);
cek('D', 4, 'daftar kelas kondisional stabil antar panggilan', JSON.stringify(id.kelas) === JSON.stringify(id.kelasUlang) && JSON.stringify(id.kelas) === JSON.stringify(en.kelas), id.kelas.join(', '));

/* ------------------------------------------------------------------ verdict */

console.log('');
console.log(`  INDEKS: ${id.indeksJumlah} entri (semua kategori), app ${id.versi.aplikasi}, hash ${id.versi.hashSumber}`);
console.log(`  SKOR: ${total - merah}/${total} diperiksa`);
console.log(`  VERDICT PENGETAHUAN DUA LAPIS: ${merah ? `GAGAL - ${merah} merah` : 'LULUS'}`);
process.exit(merah ? 1 : 0);
