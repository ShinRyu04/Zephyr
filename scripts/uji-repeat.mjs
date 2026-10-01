/**
 * uji-repeat.mjs - uji unit penjaga pengulangan (src/lib/repeatDetect.ts).
 *
 * Dijalankan lewat node dengan tsx/esbuild? Tidak: file ini murni memuat
 * implementasi TypeScript setelah ditranspilasi oleh vite. Karena itu uji ini
 * memakai jalur CDP ke aplikasi yang sedang jalan - fungsi aslinya diambil
 * dari bundle, bukan salinan.
 *
 *   node scripts/uji-repeat.mjs 9223
 *
 * Yang paling penting diuji: penjaga TIDAK boleh salah menuduh jawaban benar.
 * Output batch, tabel, dan kutipan berulang harus lolos.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('repeat-guard');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const ada = await cdp.eval(`!!(window.__ZEPHYR_REPEAT__ && window.__ZEPHYR_REPEAT__.mengulangDominan)`);
r.check('R1', ada === true, 'fungsi penjaga tersedia lewat bridge dev');
if (!ada) {
  r.selesai();
  await cdp.close();
  process.exit(1);
}

/** Bangun kasus uji di halaman, kembalikan hasilnya. */
async function uji(nama, teks, harapDominan, harapPelarian) {
  const hasil = await cdp.json(`return JSON.stringify((() => {
    const teks = ${JSON.stringify(teks)};
    const a = window.__ZEPHYR_REPEAT__.mengulangDominan(teks);
    const b = window.__ZEPHYR_REPEAT__.mengulangPelarian(teks);
    return { dominan: a.ya, cakupan: Number(a.cakupan.toFixed(3)), alasan: a.alasan, pelarian: b.ya };
  })())`);

  const benar =
    hasil.dominan === harapDominan && (harapPelarian === null || hasil.pelarian === harapPelarian);
  r.check(nama, benar, `dominan=${hasil.dominan} pelarian=${hasil.pelarian} cakupan=${hasil.cakupan} ${hasil.alasan}`);
  return hasil;
}

/* --- Harus lolos: jawaban yang benar --- */

const prosaNormal =
  'Fungsi ini membaca berkas konfigurasi lalu mengembalikan objek pengaturan. ' +
  'Kalau berkasnya tidak ada, ia memakai nilai bawaan. Kalau isinya rusak, ' +
  'ia melempar error supaya pemanggil bisa menanganinya sendiri. ' +
  'Pendekatan ini sengaja dipilih agar tidak ada nilai separuh jadi yang bocor ' +
  'ke pemanggil, yang biasanya justru lebih sulit dilacak daripada error keras.';
await uji('R2 prosa normal tidak dianggap mengulang', prosaNormal, false, false);

/* Baris batch yang mirip tapi SETIAP baris berbeda - kasus paling penting,
   karena inilah yang paling mudah salah dituduh. */
const batch =
  'INSERT INTO users (id, name) VALUES (1, \'Ana\');\n' +
  'INSERT INTO users (id, name) VALUES (2, \'Budi\');\n' +
  'INSERT INTO users (id, name) VALUES (3, \'Citra\');\n' +
  'INSERT INTO users (id, name) VALUES (4, \'Dewi\');\n' +
  'INSERT INTO users (id, name) VALUES (5, \'Eka\');\n' +
  'INSERT INTO users (id, name) VALUES (6, \'Fajar\');\n' +
  'INSERT INTO users (id, name) VALUES (7, \'Gita\');\n' +
  'INSERT INTO users (id, name) VALUES (8, \'Hana\');\n' +
  'INSERT INTO users (id, name) VALUES (9, \'Indra\');\n' +
  'INSERT INTO users (id, name) VALUES (10, \'Joko\');\n'.repeat(2);
await uji('R3 baris batch berbeda tidak dianggap mengulang', batch, false, false);

const pendek = 'oke siap'.repeat(20); // 200 char, di bawah ambang
await uji('R4 teks pendek (<400) selalu lolos', pendek, false, false);

/* --- Harus tertangkap: loop sungguhan --- */

const satuBarisLoop = 'Menunggu proses selesai...\n'.repeat(60);
await uji('R5 satu baris diulang 60x tertangkap', satuBarisLoop, true, false);

const tanpaBaris = 'abcdefghij'.repeat(80); // 800 char, satu baris panjang
await uji('R6 ulangan tanpa jeda baris tertangkap', tanpaBaris, true, false);

/* --- Pelarian: hanya pada skala besar, dan harus punya bentuk baris --- */

const pelarianBesar = 'Berikut hasilnya:\n' + 'Langkah yang sama diulang terus menerus tanpa henti.\n'.repeat(400);
const h = await uji('R7 pelarian pada skala besar terbukti', pelarianBesar, true, true);
r.check('R8 panjang pelarian melewati ambang stop', pelarianBesar.length >= 16000, `${pelarianBesar.length} char`);

/* Berulang tapi barisnya hampir semua berbeda -> TIDAK boleh dibuang. */
const barisUnik = Array.from({ length: 500 }, (_, i) => `Baris nomor ${i} berisi penjelasan yang berbeda.`).join('\n');
const dugaan = await cdp.json(`return JSON.stringify((() => {
  const t = ${JSON.stringify(barisUnik)};
  return { dominan: window.__ZEPHYR_REPEAT__.mengulangDominan(t).ya, pelarian: window.__ZEPHYR_REPEAT__.mengulangPelarian(t).ya };
})())`);
r.check('R9 baris panjang yang semuanya berbeda tidak dibuang', dugaan.pelarian === false, `dominan=${dugaan.dominan} pelarian=${dugaan.pelarian}`);

/* --- Ketahanan --- */

const aneh = await cdp.json(`return JSON.stringify((() => {
  const f = window.__ZEPHYR_REPEAT__.mengulangDominan;
  return {
    kosong: f('').ya,
    bukanTeks: f(null).ya,
    angka: f(12345).ya,
    spasi: f('    '.repeat(200)).ya,
  };
})())`);
r.check(
  'R10 masukan aneh tidak melempar dan tidak menuduh',
  aneh.kosong === false && aneh.bukanTeks === false && aneh.angka === false,
  JSON.stringify(aneh),
);

/* --- Performa: penjaga ini jalan tiap jawaban selesai, jadi harus cepat --- */
const waktu = await cdp.json(`return JSON.stringify((() => {
  const besar = 'Kalimat panjang yang diulang terus.\\n'.repeat(6000); // ~190k char
  const t0 = performance.now();
  window.__ZEPHYR_REPEAT__.mengulangDominan(besar);
  const t1 = performance.now();
  return { ms: Number((t1 - t0).toFixed(1)), panjang: besar.length };
})())`);
r.check('R11 jawaban 190k karakter diperiksa di bawah 250ms', waktu.ms < 250, `${waktu.ms}ms untuk ${waktu.panjang} char`);

const semuaCakupan = await cdp.json(`return JSON.stringify((() => {
  const f = window.__ZEPHYR_REPEAT__.mengulangDominan;
  const kasus = [
    'Menunggu proses selesai...\\n'.repeat(60),
    'abcdefghij'.repeat(80),
    'Kalimat yang sama terus.\\n'.repeat(500),
    'Kalimat panjang yang diulang terus.\\n'.repeat(6000),
  ];
  return kasus.map((t) => Number(f(t).cakupan.toFixed(3)));
})())`);
r.check(
  'R12 cakupan selalu di rentang 0..1',
  semuaCakupan.every((c) => c >= 0 && c <= 1),
  JSON.stringify(semuaCakupan),
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
