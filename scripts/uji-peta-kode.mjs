#!/usr/bin/env node
/**
 * uji-peta-kode.mjs - harness item AI-TAHU-100-8 (peta kode berkas->simbol/ekspor).
 *
 * Yang dibuktikan, dengan angka yang DIUKUR dari sumber nyata (bukan angka
 * warisan seperti 393/176/2662):
 *
 *   A. PETA DIBANGUN DARI SUMBER NYATA. Harness membangun ulang peta kode
 *      dengan aturan yang SAMA PERSIS dengan `scripts/gen-fakta-zephyr.mjs`
 *      (walk `src` + `src-tauri/src`, berkas .ts/.tsx/.rs, tanpa
 *      node_modules/target/__snapshots__, tanpa hasil generator sendiri),
 *      lalu melaporkan jumlah berkas, jumlah ekspor, dan jumlah simbol HARI INI.
 *
 *   B. TIAP ENTRI BISA DILACAK BALIK. Tiap entri menunjuk berkas nyata di disk,
 *      jumlah barisnya dihitung ulang dari berkas itu, dan tiap simbol ekspor
 *      punya nomor baris yang benar-benar baris ekspor di berkas tersebut.
 *
 *   C. `--check` MENDETEKSI PETA BASI TANPA MENULIS APA PUN. `--check`
 *      membandingkan entri `kode` yang tersimpan di `src/lib/zephyrIndeks.ts`
 *      (dimuat lewat esbuild - modul yang BENAR-BENAR ikut bundel di aplikasi)
 *      dengan peta segar dari sumber, exit 1 kalau ada yang meleset, dan TIDAK
 *      menyentuh berkas apa pun (dibuktikan lewat size+mtime+sha sebelum/sesudah).
 *
 *   D. TIDAK ADA SATU PUN JALUR YANG MEMBACA .env/KUNCI. Semua berkas yang
 *      dibaca jalur peta kode dicatat dan wajib berada di bawah `src/` atau
 *      `src-tauri/src`; tidak ada berkas DATA rahasia (.env/*.key/*.pem/
 *      secrets.json) yang dibaca, semuanya di dalam akar repo; dan generator
 *      bebas `process.env`/`.env`/`dotenv`/`homedir`.
 *
 * Cara pakai:
 *   node scripts/uji-peta-kode.mjs            (semua kasus; exit 1 kalau merah)
 *   node scripts/uji-peta-kode.mjs --check    (banding artefak vs sumber, TANPA menulis)
 *
 * exit 0 = lulus; exit 1 = ada yang merah (disebut mana).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRI = fileURLToPath(import.meta.url);
const CHECK = process.argv.includes('--check');
const KERJA = mkdtempSync(join(tmpdir(), 'uji-peta-kode-'));

/* ------------------------------------------------------------------ cetak */

let lulus = 0;
let total = 0;
const merah = [];
const cek = (bagian, nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${bagian} ${nama}${bukti !== undefined ? `  [${bukti}]` : ''}`);
  } else {
    merah.push(`${bagian} ${nama}`);
    console.log(`  GAGAL ${bagian} ${nama}  [${bukti}]`);
  }
};
const angka = (nama, nilai) => console.log(`  ANGKA ${nama.padEnd(46)} ${nilai}`);

if (!CHECK) console.log('UJI PETA KODE ZEPHYR (AI-TAHU-100-8)');

/* ------------------------------------------------------------------ pembaca */

/* Setiap berkas yang dibaca JALUR PETA KODE dicatat - dipakai untuk membuktikan
 * tidak ada satu pun jalur yang menyentuh .env/kunci. Pemindaian teks lain
 * (mis. membaca generator sendiri untuk case D3) TIDAK masuk catatan ini. */
const JALUR_DIBACA = [];
const bacaKode = (p) => {
  JALUR_DIBACA.push(p);
  return readFileSync(p, 'utf8');
};

/* ------------------------------------------------------------------ reproduksi peta kode
 * Salinan PERSIS dari `scripts/gen-fakta-zephyr.mjs` (fungsi `petaKode()`,
 * `ringkasanBerkas()`, `potong()`, dan batas `BATAS_SIMBOL_BERKAS` /
 * `BATAS_TEKS_KODE`) - supaya angka yang dilaporkan sebanding byte-per-byte
 * dengan entri yang benar-benar ditulis ke `src/lib/zephyrIndeks.ts`. */

const HASIL_SENDIRI = new Set(['zephyrFakta.ts', 'zephyrIndeks.ts']);
const DIR_LEWAT = new Set(['node_modules', 'target', '__snapshots__']);
const RE_EKSPOR =
  /^\s*export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)|^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|const|type)\s+([A-Za-z_][\w]*)/gm;
const BATAS_SIMBOL_BERKAS = 40;
const BATAS_TEKS_KODE = 1200;
const potong = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function ringkasanBerkas(isi) {
  const blok = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(isi) ?? /^((?:\s*\/\/[^\n]*\n)+)/.exec(isi);
  if (!blok) return '';
  const baris = blok[1]
    .split(/\r?\n/)
    .map((b) => b.replace(/^\s*\/?\*+\s?/, '').trim())
    .filter((b) => b && !b.startsWith('@'));
  const pilih = baris.find((b) => !/^SPDX|^Copyright/i.test(b) && b.length > 12) ?? baris[0] ?? '';
  return pilih.length > 200 ? `${pilih.slice(0, 197)}...` : pilih;
}

function bangunPetaKode() {
  const daftarBerkas = [];
  const telusuri = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!DIR_LEWAT.has(e.name)) telusuri(p);
      } else if (/\.(ts|tsx|rs)$/.test(e.name) && !HASIL_SENDIRI.has(e.name)) {
        daftarBerkas.push(p);
      }
    }
  };
  telusuri(join(AKAR, 'src'));
  telusuri(join(AKAR, 'src-tauri', 'src'));

  const hasil = [];
  for (const p of daftarBerkas.sort()) {
    const rel = relative(AKAR, p).split('\\').join('/');
    let isi = '';
    try {
      isi = bacaKode(p);
    } catch {
      continue;
    }
    const simbol = [];
    const detail = [];
    for (const m of isi.matchAll(RE_EKSPOR)) {
      const nama = m[1] ?? m[2];
      /* `^\s*` boleh menelan baris kosong, jadi posisi `m.index` bisa jatuh di
         baris SEBELUM kata kuncinya. Baris dihitung dari posisi `export`/`pub`
         di dalam teks yang cocok, bukan dari awal kecocokan. */
      const kata = m[1] ? 'export' : 'pub';
      const off = Math.max(0, m[0].indexOf(kata));
      simbol.push(nama);
      detail.push({ nama, baris: isi.slice(0, m.index + off).split('\n').length });
    }
    hasil.push({
      rel,
      jalur: p,
      ringkas: ringkasanBerkas(isi),
      simbol: [...new Set(simbol)],
      detail,
      baris: isi.split('\n').length,
    });
  }
  return hasil;
}

/** Teks entri `kode` apa adanya - sama dengan yang ditulis generator. */
function teksEntriKode(f) {
  const simbol =
    f.simbol.length > BATAS_SIMBOL_BERKAS
      ? `${f.simbol.slice(0, BATAS_SIMBOL_BERKAS).join(', ')}, …(+${f.simbol.length - BATAS_SIMBOL_BERKAS})`
      : f.simbol.join(', ');
  return potong(
    `${f.baris} baris · ${f.ringkas ? `${f.ringkas} · ` : ''}${f.simbol.length ? `ekspor: ${simbol}` : 'tanpa ekspor'}`,
    BATAS_TEKS_KODE,
  );
}

/* ------------------------------------------------------------------ artefak tersimpan
 * Dimuat lewat esbuild dari modul nyata `src/lib/zephyrIndeks.ts`, bukan di-parse
 * sebagai teks: yang dibandingkan adalah data yang benar-benar ikut bundel app. */

await esbuild.build({
  entryPoints: [join(AKAR, 'src', 'lib', 'zephyrIndeks.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'silent',
  outfile: join(KERJA, 'indeks.mjs'),
});
const IND = await import(pathToFileURL(join(KERJA, 'indeks.mjs')).href);
const SEMUA_ENTRI = IND.FAKTA_INDEKS ?? [];
const ENTRI_KODE = SEMUA_ENTRI.filter((e) => e[0] === 'kode');
const VERSI = IND.FAKTA_VERSI ?? { aplikasi: '?', hashSumber: '?' };

const peta = bangunPetaKode();
const totalSimbol = peta.reduce((n, f) => n + f.simbol.length, 0);
const berkasBerEkspor = peta.filter((f) => f.simbol.length > 0).length;
const totalBarisKode = peta.reduce((n, f) => n + f.baris, 0);

/* ------------------------------------------------------------------ banding artefak vs sumber */

const artefakPeta = new Map(ENTRI_KODE.map((e) => [e[1], e[2]]));
const segarPeta = new Map(peta.map((f) => [f.rel, teksEntriKode(f)]));
const hilang = [...segarPeta.keys()].filter((k) => !artefakPeta.has(k)).sort();
const hantu = [...artefakPeta.keys()].filter((k) => !segarPeta.has(k)).sort();
const bedaTeks = [...segarPeta.keys()]
  .filter((k) => artefakPeta.has(k) && artefakPeta.get(k) !== segarPeta.get(k))
  .sort();
const basiKode = hilang.length > 0 || hantu.length > 0 || bedaTeks.length > 0;

function jejakBerkas(rel) {
  const p = join(AKAR, rel);
  const st = statSync(p);
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex');
  return `${st.size}:${Math.round(st.mtimeMs)}:${sha.slice(0, 16)}`;
}
const TERPANTAU = ['src/lib/zephyrIndeks.ts', 'src/lib/zephyrFakta.ts', 'src/lib/zephyrDokumenData.ts'];

/* ------------------------------------------------------------------ mode --check */

if (CHECK) {
  console.log(
    basiKode
      ? `PETA KODE BASI: ${hilang.length} berkas baru belum masuk, ${hantu.length} kunci hantu, ${bedaTeks.length} teks meleset ` +
          `(peta segar ${peta.length} berkas, artefak ${ENTRI_KODE.length} entri kode).\n` +
          'Perbaiki dengan: node scripts/gen-fakta-zephyr.mjs'
      : `peta kode sinkron: ${ENTRI_KODE.length} entri kode == ${peta.length} berkas sumber.`,
  );
  process.exit(basiKode ? 1 : 0);
}

/* ------------------------------------------------------------------ A. peta dari sumber nyata */

console.log('\n(A) peta kode dibangun dari berkas SUMBER nyata (angka diukur, bukan diwarisi)');
angka('berkas sumber masuk peta', peta.length);
angka('total simbol ekspor', totalSimbol);
angka('berkas punya minimal 1 ekspor', `${berkasBerEkspor} dari ${peta.length}`);
angka('total baris berkas sumber', totalBarisKode);
angka('entri `kode` di artefak tersimpan', ENTRI_KODE.length);
angka('total entri indeks (semua kategori)', SEMUA_ENTRI.length);
angka('versi indeks tersimpan', `${VERSI.aplikasi} · hash ${VERSI.hashSumber}`);

cek('A', 'peta segar memuat >= 50 berkas sumber', peta.length >= 50, `${peta.length} berkas`);
cek('A', 'total simbol ekspor > 0', totalSimbol > 0, `${totalSimbol} simbol`);
cek('A', 'ada berkas yang benar-benar mengekspor', berkasBerEkspor > 0, `${berkasBerEkspor} berkas`);
const ikutHasilSendiri = peta.filter((f) => HASIL_SENDIRI.has(basename(f.jalur)));
cek('A', 'hasil generator sendiri tidak masuk peta', ikutHasilSendiri.length === 0, `${ikutHasilSendiri.length} dari 2`);
const jalurDilewati = peta.filter((f) => f.rel.split('/').some((s) => DIR_LEWAT.has(s)));
cek('A', 'tidak ada jalur node_modules/target/__snapshots__', jalurDilewati.length === 0, `${jalurDilewati.length} jalur`);
const eksensiAneh = peta.filter((f) => !/\.(ts|tsx|rs)$/.test(f.rel));
cek('A', 'semua berkas ber-ekstensi .ts/.tsx/.rs', eksensiAneh.length === 0, eksensiAneh.slice(0, 3).map((f) => f.rel).join(', ') || 'semua sah');
cek('A', 'tidak ada jalur duplikat di peta', new Set(peta.map((f) => f.rel)).size === peta.length, `${peta.length} unik`);

/* ------------------------------------------------------------------ B. kelacakan ke berkas + baris nyata */

console.log('\n(B) tiap entri bisa dilacak balik ke berkas + baris nyata');
const tanpaBerkas = peta.filter((f) => !existsSync(f.jalur));
cek('B', 'setiap rel menunjuk berkas nyata di disk', tanpaBerkas.length === 0, `${peta.length - tanpaBerkas.length}/${peta.length} ada`);

const barisMeleset = peta.filter((f) => f.baris !== readFileSync(f.jalur, 'utf8').split('\n').length);
cek('B', 'jumlah baris tiap entri == baris nyata berkas itu', barisMeleset.length === 0, `${peta.length - barisMeleset.length}/${peta.length} cocok`);

const idKarakter = (c) => /[\w$]/.test(c);
function memuatSimbol(barisTeks, nama) {
  const i = barisTeks.indexOf(nama);
  if (i < 0) return false;
  const sebelum = i === 0 ? '' : barisTeks[i - 1];
  const sesudah = barisTeks[i + nama.length] ?? '';
  return !idKarakter(sebelum) && !idKarakter(sesudah);
}
let simbolDiperiksa = 0;
let simbolTerlacak = 0;
const simbolSalahBaris = [];
const barisLuarBatas = [];
for (const f of peta) {
  const barisNyata = readFileSync(f.jalur, 'utf8').split('\n');
  for (const d of f.detail) {
    simbolDiperiksa++;
    if (!(Number.isInteger(d.baris) && d.baris >= 1 && d.baris <= barisNyata.length)) {
      barisLuarBatas.push(`${f.rel}:${d.baris} ${d.nama}`);
      continue;
    }
    const teks = barisNyata[d.baris - 1] ?? '';
    if (/^\s*(export|pub)\s/.test(teks) && memuatSimbol(teks, d.nama)) simbolTerlacak++;
    else simbolSalahBaris.push(`${f.rel}:${d.baris} ${d.nama}`);
  }
}
angka('simbol ekspor diperiksa untuk kelacakan', simbolDiperiksa);
cek('B', 'setiap simbol ekspor terlacak ke baris ekspor nyata', simbolTerlacak === simbolDiperiksa, `${simbolTerlacak}/${simbolDiperiksa} terlacak`);
cek('B', 'nomor baris simbol selalu di dalam berkas', barisLuarBatas.length === 0, barisLuarBatas.slice(0, 3).join(' | ') || 'semua di dalam');

const sampelBaris = (rel, nama) => {
  const f = peta.find((x) => x.rel === rel);
  if (!f) return null;
  const d = f.detail.find((x) => x.nama === nama);
  if (!d) return null;
  const teks = readFileSync(f.jalur, 'utf8').split('\n')[d.baris - 1] ?? '';
  return { rel, nama, baris: d.baris, teks: teks.trim().slice(0, 80), sah: /^\s*(export|pub)\s/.test(teks) && memuatSimbol(teks, nama) };
};
const s1 = ['faktaInti', 'blokKeadaanPrompt'].map((n) => sampelBaris('src/lib/systemPrompt.ts', n));
const s2 = ['blokKeadaan', 'kepalaBlokKeadaan'].map((n) => sampelBaris('src/lib/zephyrRuntime.ts', n));
for (const s of [...s1, ...s2]) {
  if (s) console.log(`        ${s.rel}:${s.baris} ${s.nama}  →  ${s.teks}`);
}
cek('B', 'sampel systemPrompt.ts terlacak (faktaInti + blokKeadaanPrompt)', s1.every((s) => s && s.sah), s1.map((s) => (s ? `${s.nama}@${s.baris}` : 'tidak ada')).join(', '));
cek('B', 'sampel zephyrRuntime.ts terlacak (blokKeadaan + kepalaBlokKeadaan)', s2.every((s) => s && s.sah), s2.map((s) => (s ? `${s.nama}@${s.baris}` : 'tidak ada')).join(', '));

/* ------------------------------------------------------------------ C. --check deteksi basi, tanpa menulis */

console.log('\n(C) artefak tersimpan + `--check` mendeteksi peta basi TANPA menulis');
cek('C', 'artefak tersimpan memuat entri kategori `kode`', ENTRI_KODE.length >= 1, `${ENTRI_KODE.length} entri`);
const kunciHantuDisk = [...artefakPeta.keys()].filter((k) => !existsSync(join(AKAR, k)));
cek('C', 'tiap kunci entri `kode` artefak menunjuk berkas nyata', kunciHantuDisk.length === 0, kunciHantuDisk.slice(0, 3).join(', ') || 'semua ada');
const teksAneh = ENTRI_KODE.filter((e) => !e[2] || !/^\d+ baris · /.test(e[2]));
cek('C', 'tiap entri `kode` berformat "N baris · ..." + teks tidak kosong', teksAneh.length === 0, teksAneh.slice(0, 2).map((e) => e[1]).join(', ') || 'semua sah');

angka('peta segar vs entri kode artefak', `${peta.length} vs ${ENTRI_KODE.length}`);
angka('berkas baru belum masuk artefak', hilang.length ? `${hilang.length} (mis. ${hilang.slice(0, 2).join(', ')})` : 'tidak ada');
angka('kunci hantu di artefak', hantu.length ? `${hantu.length} (mis. ${hantu.slice(0, 2).join(', ')})` : 'tidak ada');
angka('teks entri meleset (basi)', bedaTeks.length ? `${bedaTeks.length} (mis. ${bedaTeks.slice(0, 2).join(', ')})` : 'tidak ada');
console.log(`  STATUS peta kode tersimpan: ${basiKode ? 'BASI - jalankan: node scripts/gen-fakta-zephyr.mjs' : 'SINKRON'}`);

/* Bukti "TANPA menulis apa pun": jejak berkas sebelum & sesudah anak --check. */
const sebelum = TERPANTAU.map(jejakBerkas);
let anakKode = -1;
let anakKeluaran = '';
try {
  anakKeluaran = execFileSync(process.execPath, [DIRI, '--check'], { cwd: AKAR, encoding: 'utf8' }).trim();
  anakKode = 0;
} catch (e) {
  anakKode = typeof e.status === 'number' ? e.status : -1;
  anakKeluaran = String(e.stdout ?? e.message).trim();
}
const sesudah = TERPANTAU.map(jejakBerkas);
console.log(`        --check berkata: ${anakKeluaran.split('\n')[0]}`);
cek('C', '`--check` berjalan dan memberi verdict (exit 0/1, tidak crash)', anakKode === 0 || anakKode === 1, `exit ${anakKode}`);
cek(
  'C',
  'verdict `--check` konsisten dengan banding segar (exit 0 => tidak basi)',
  anakKode !== 0 || !basiKode,
  `exit ${anakKode}, basiKode=${basiKode}`,
);
const berubahSaatCheck = TERPANTAU.filter((_, i) => sebelum[i] !== sesudah[i]);
cek(
  'C',
  '`--check` TIDAK menulis: size+mtime+sha artefak identik sebelum/sesudah',
  berubahSaatCheck.length === 0,
  berubahSaatCheck.length ? berubahSaatCheck.join(', ') : `${TERPANTAU.length} berkas utuh`,
);

/* ------------------------------------------------------------------ D. tidak ada jalur baca .env/kunci */

console.log('\n(D) tidak ada satu pun jalur yang membaca .env/kunci');
const diLuarSumber = JALUR_DIBACA.filter((p) => {
  const rel = relative(AKAR, p).split('\\').join('/');
  return !(rel.startsWith('src/') || rel.startsWith('src-tauri/src/'));
});
angka('berkas dibaca jalur peta kode', JALUR_DIBACA.length);
cek('D', 'semua berkas yang dibaca peta berada di bawah src/ atau src-tauri/src', diLuarSumber.length === 0, diLuarSumber.slice(0, 3).join(', ') || 'semua terkurung di sumber');

/* Berkas SUMBER boleh bernama `secrets.rs`/`credentials.rs` - itu modul kode
 * yang membaca gudang rahasia saat RUNTIME. Yang dilarang adalah PETA KODE
 * membuka berkas DATA rahasia. Jadi dua hal diperiksa: (1) setiap berkas yang
 * dibaca memang berkas SUMBER (.ts/.tsx/.rs), (2) di antara yang dibaca tidak
 * ada berkas DATA rahasia (.env/*.key/*.pem/secrets.json/dll). */
const EKSTENSI_SUMBER = /\.(ts|tsx|rs)$/;
const DIRAHASIAKAN = /(^\.env|\.env$|\.env\.|\.key$|\.pem$|^secrets?\.json$|^credentials|\.vault$|\.token$|keychain)/i;
const bukanSumber = JALUR_DIBACA.filter((p) => !EKSTENSI_SUMBER.test(p));
cek(
  'D',
  'setiap berkas yang dibaca peta adalah berkas SUMBER (.ts/.tsx/.rs)',
  bukanSumber.length === 0,
  bukanSumber.slice(0, 3).join(', ') || `${JALUR_DIBACA.length} berkas sumber`,
);
const dataRahasia = JALUR_DIBACA.filter((p) => DIRAHASIAKAN.test(basename(p)) && !EKSTENSI_SUMBER.test(p));
cek(
  'D',
  'tidak ada berkas DATA rahasia (.env/*.key/*.pem/secrets.json) yang dibaca peta',
  dataRahasia.length === 0,
  dataRahasia.slice(0, 3).join(', ') || 'tidak ada',
);
const luarRepo = JALUR_DIBACA.filter((p) => !p.startsWith(AKAR));
cek(
  'D',
  'semua berkas dibaca peta berada DI DALAM akar repo (tanpa %APPDATA%)',
  luarRepo.length === 0,
  luarRepo.slice(0, 3).join(', ') || `${JALUR_DIBACA.length} jalur di dalam repo`,
);

const teksGen = readFileSync(join(AKAR, 'scripts', 'gen-fakta-zephyr.mjs'), 'utf8');
const kenaEnv = (teksGen.match(/process\.env|\.env\b|dotenv|os\.homedir|homedir\(\)/g) ?? []).length;
cek('D', 'generator peta kode bebas process.env/.env/dotenv/homedir', kenaEnv === 0, `${kenaEnv} kemunculan`);

/* ------------------------------------------------------------------ verdict */

console.log('');
console.log(`  SKOR: ${lulus}/${total} diperiksa`);
console.log(
  `  PETA: ${peta.length} berkas sumber, ${totalSimbol} simbol ekspor, ${ENTRI_KODE.length} entri kode tersimpan ` +
    `(${basiKode ? 'BASI' : 'SINKRON'})`,
);
console.log(`  VERDICT PETA KODE: ${merah.length ? `GAGAL - ${merah.length} merah: ${merah.join(' | ')}` : 'LULUS'}`);
process.exit(merah.length ? 1 : 0);
