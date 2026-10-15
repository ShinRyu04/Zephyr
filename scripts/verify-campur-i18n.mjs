/*
 * verify-campur-i18n.mjs - gerbang: tidak boleh ada teks yang kecampur bahasa.
 *
 *   node scripts/verify-campur-i18n.mjs
 *   node scripts/verify-campur-i18n.mjs --rinci     (daftar lengkap)
 *
 * Kenapa gerbang ini ada
 * ----------------------
 * Kamus repo ini SEPULUH bahasa x ~2770 kunci, dan `verify-i18n.mjs` sudah
 * memastikan kesepuluhnya punya kunci yang SAMA. Itu tidak cukup: kesepuluh
 * kamus bisa lengkap dan UI Indonesia tetap penuh teks Inggris, karena kode
 * memanggil `tr('Some English text')` dengan teks yang TIDAK ADA di kamus mana
 * pun. `translate()` mengembalikan kunci apa adanya - jadi yang tampil di UI
 * Indonesia persis teks Inggris itu. Itulah keluhan "kecampur bahasa lain".
 *
 * Gerbang ini mengukur hal yang berbeda dari verify-i18n:
 *   - verify-i18n  : apakah kamus-kamus saling sinkron? (struktur)
 *   - gerbang ini  : apakah teks yang DIRENDER benar bahasanya? (isi)
 *
 * Yang diperiksa, memakai `translate()` yang SUNGGUHAN (i18n.ts dibundel apa
 * adanya, bukan tiruan):
 *
 *   A. INGGRIS di UI INDONESIA - tr('English text') yang tidak ada di kamus.
 *   B. INDONESIA di UI INGGRIS - cermin dari A.
 *   C. NILAI KEBALIK BAHASA   - kunci Indonesia yang untuk bahasa Indonesia
 *      justru mengembalikan teks Inggris (atau sebaliknya).
 *
 * Beban A dibagi dua tingkat supaya gerbangnya berguna hari ini tanpa
 * menyembunyikan sisanya:
 *
 *   A1. WAJIB - teks yang JUSTRU BOCOR di UI Indonesia menurut keluhan: kunci
 *       Inggris yang padanannya SUDAH ada di kamus (kunci Indonesia-nya sudah
 *       terdaftar), tapi `translate('id', kunci Inggris)` belum memakainya.
 *       Ini cacat murni - datanya ada, jalurnya tidak. Harus 0.
 *
 *   A2. LAPORAN - kunci yang belum punya padanan sama sekali (375 di antaranya
 *       baru, plus 375 terjemahan). Dicetak dengan angkanya, tidak menggagalkan
 *       gerbang sampai seluruh kamus sembilan bahasa terisi; memasang gerbang
 *       keras di sini akan memaksa teks Inggris yang salah diterjemahkan hanya
 *       demi lolos.
 *
 * Keluar 0 bila A1 = 0 dan B = 0 dan C = 0; keluar 1 bila tidak.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const RINCI = process.argv.includes('--rinci');
const AKAR = 'D:/Zephyr';
const KERJA = join(process.env.TMPDIR ?? AKAR, `verify-campur-i18n-${process.pid}`);
mkdirSync(KERJA, { recursive: true });
const BUNDEL = join(KERJA, 'i18n.bundle.mjs');

await esbuild.build({
  bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env': 'globalThis.__VITE_ENV', 'import.meta.hot': 'undefined' },
  entryPoints: [join(AKAR, 'src', 'lib', 'i18n.ts')],
  outfile: BUNDEL,
});
globalThis.__VITE_ENV = {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = { documentElement: { style: { setProperty() {}, removeProperty() {} } }, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const i18n = await import(pathToFileURL(BUNDEL).href);
await i18n.muatKamusTambahan();
await new Promise((r) => setTimeout(r, 200));

const LANGS = i18n.UI_LANGS.map((l) => l.value);

/* --- Kamus mentah, untuk memutuskan apakah sebuah padanan sudah ada. --- */
function blok(src, nama) {
  const i = src.indexOf(`const ${nama}: Dict = {`);
  if (i === -1) return new Map();
  const j = src.indexOf('\n};', i);
  const isi = src.slice(i, j);
  const m = new Map();
  const re = /^\s*(['"])((?:\\.|(?!\1).)*)\1:\s*(['"])((?:\\.|(?!\3).)*)\3,?\s*$/gm;
  for (const x of isi.matchAll(re)) m.set(x[2], x[4]);
  return m;
}
const i18nSrc = readFileSync(join(AKAR, 'src', 'lib', 'i18n.ts'), 'utf8');
const extraSrc = readFileSync(join(AKAR, 'src', 'lib', 'i18n-extra.ts'), 'utf8');
const D = {};
for (const L of ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']) {
  D[L] = new Map([...blok(i18nSrc, L), ...blok(extraSrc, L)]);
}
/* Peta balik: teks Inggris -> kunci Indonesia. Dari blok EN, nilai = Inggris. */
const enKeId = new Map();
for (const [k, v] of D.EN) if (v && k !== v && !enKeId.has(v)) enKeId.set(v, k);

/* --- Kunci yang benar-benar dipanggil kode. --- */
const berkas = [];
const telusuri = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { telusuri(p); continue; }
    if (/\.(ts|tsx)$/.test(n)) berkas.push(p);
  }
};
telusuri(join(AKAR, 'src'));
const KAMUS = new Set(['i18n.ts', 'i18n-extra.ts', 'i18n-src.ts', 'zephyrIndeks.ts', 'zephyrDokumenData.ts']);
const BENTUK = [
  /\btr\(\s*'((?:[^'\\]|\\.)*)'/g, /\btr\(\s*"((?:[^"\\]|\\.)*)"/g,
  /\btx\(\s*'((?:[^'\\]|\\.)*)'/g, /\btx\(\s*"((?:[^"\\]|\\.)*)"/g,
  /\btranslate\(\s*[^,]+,\s*'((?:[^'\\]|\\.)*)'/g, /\btranslate\(\s*[^,]+,\s*"((?:[^"\\]|\\.)*)"/g,
];
const dipanggil = new Map();
for (const f of berkas) {
  const n = f.split(/[\\/]/).pop();
  if (KAMUS.has(n)) continue;
  const x = readFileSync(f, 'utf8');
  for (const p of BENTUK) for (const m of x.matchAll(p)) {
    const k = m[1];
    if (!dipanggil.has(k)) dipanggil.set(k, new Set());
    dipanggil.get(k).add(f.replace(/\\/g, '/').replace(AKAR + '/src/', ''));
  }
}

const ID_HINT = /\b(yang|dan|atau|untuk|dari|dengan|tidak|belum|sudah|adalah|telah|bisa|harus|jika|kalau|saat|setelah|karena|agar|oleh|juga|hanya|masih|lebih|paling|semua|setiap|dapat|ini|itu|pada|menjadi|memakai|mengubah|membuka|menutup|menyimpan|menghapus|mencari|menjalankan|berkas|pengaturan|tutup|buka|simpan|hapus|jalankan|ubah|tambah|gagal|berhasil|sedang|menunggu|selesai|aktif|tema|bahasa|jendela|pilih|kirim|muat|perbarui|riwayat|catatan|tugas|jadwal|alat|bantuan|tentang|keluar|masuk|tampilkan|sembunyikan|izinkan|pakai|gunakan|salin|tempel|ulangi|urungkan|lanjut|berhenti|panel|lebar|kembalikan|kode|dukung|dulu|saja|punya|coba|kembali|pindai|layar|bilah|kunci|waktu|jalan)\b/i;
const EN_HINT = /\b(the|and|or|for|from|with|not|already|will|are|was|were|can|must|if|when|after|before|because|so|by|also|only|still|more|most|all|each|this|that|to|of|in|on|at|as|you|your|file|files|settings|close|open|save|delete|run|change|add|failed|success|running|waiting|done|active|theme|language|window|choose|send|load|refresh|history|note|task|schedule|tool|help|about|exit|show|hide|allow|use|copy|paste|repeat|undo|next|stop|panel|width|restore|code|support|yet|first)\b/i;

function bahasaTeks(s) {
  const id = ID_HINT.test(s), en = EN_HINT.test(s);
  if (id && !en) return 'id';
  if (en && !id) return 'en';
  return '?';
}

const A1 = [];      // padanan sudah ada, jalurnya tidak
const A2 = [];      // belum ada padanan sama sekali
const B = [];
for (const [k, files] of dipanggil) {
  const bk = bahasaTeks(k);
  if (bk === '?') continue;
  const id = i18n.translate('id', k);
  const en = i18n.translate('en', k);
  if (bk === 'en' && id === k) {
    const padanan = enKeId.get(k);
    if (padanan && D.ID.has(padanan)) A1.push({ key: k, padanan, files: [...files] });
    else A2.push({ key: k, files: [...files] });
  }
  if (bk === 'id' && en === k) B.push({ key: k, files: [...files] });
}

const C = [];
for (const [k, files] of dipanggil) {
  const bk = bahasaTeks(k);
  if (bk === '?') continue;
  const v = i18n.translate(bk === 'id' ? 'id' : 'en', k);
  if (v === k) continue;
  const bv = bahasaTeks(v);
  if (bv === '?' || bv === bk) continue;
  C.push({ key: k, lang: bk, value: v, files: [...files] });
}

const perFile = (arr) => {
  const m = new Map();
  for (const x of arr) for (const f of x.files) m.set(f, (m.get(f) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log('=== VERIFY CAMPUR BAHASA (memakai translate() asli) ===');
console.log(`kamus: ${LANGS.length} bahasa | kunci dipanggil kode: ${dipanggil.size}`);
console.log('');
const tanda = (n) => (n === 0 ? 'LULUS' : 'GAGAL');
console.log(`${tanda(A1.length)}  A1 Inggris di UI Indonesia yang padanannya SUDAH ada : ${A1.length}`);
for (const [f, n] of perFile(A1).slice(0, RINCI ? 999 : 12)) console.log(`        ${String(n).padStart(3)}  ${f}`);
if (RINCI) for (const x of A1) console.log(`        ${JSON.stringify(x.key)}  ->  kunci kamus ${JSON.stringify(x.padanan)}`);
console.log('');
console.log(`${tanda(B.length)}  B  Indonesia di UI Inggris                            : ${B.length}`);
for (const x of B.slice(0, RINCI ? 999 : 12)) console.log(`        ${JSON.stringify(x.key)}  <- ${x.files[0]}`);
console.log('');
console.log(`${tanda(C.length)}  C  Nilai kebalik bahasa                               : ${C.length}`);
for (const x of C.slice(0, RINCI ? 999 : 12)) console.log(`        [${x.lang}] ${JSON.stringify(x.key)} => ${JSON.stringify(x.value)}`);
console.log('');
console.log(`INFO   A2 kunci belum punya padanan sama sekali (beban kerja)  : ${A2.length}`);
for (const [f, n] of perFile(A2).slice(0, RINCI ? 999 : 10)) console.log(`        ${String(n).padStart(3)}  ${f}`);

writeFileSync(join(AKAR, 'scripts', '_campur-i18n.json'), JSON.stringify({ A1, A2, B, C }, null, 1));

const gagal = A1.length + B.length + C.length;
console.log('');
console.log(`VERDICT: ${gagal === 0 ? 'LULUS' : 'GAGAL'} (A1=${A1.length} B=${B.length} C=${C.length}; A2=${A2.length} dilaporkan, belum digerbang)`);
process.exit(gagal === 0 ? 0 : 1);
