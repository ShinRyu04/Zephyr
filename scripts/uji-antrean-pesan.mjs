/**
 * uji-antrean-pesan.mjs — uji aturan antrean pesan TANPA aplikasi.
 *
 * Yang diuji hanya modul murni `src/lib/antreanPesan.ts`: tidak ada store, tidak
 * ada jaringan, tidak ada Tauri, tidak ada CDP. Karena itu uji ini bisa dijalankan
 * kapan saja - juga saat app sedang sibuk atau tidak dijalankan sama sekali.
 *
 *   node scripts/uji-antrean-pesan.mjs
 *
 * Yang dijaga di sini adalah janji ke user, bukan bentuk data:
 *   * pesan saat agen sibuk MASUK ANTREAN, tidak menabrak giliran yang jalan;
 *   * tidak ada pesan yang hilang, termasuk saat ditolak;
 *   * urutan keluarnya urutan masuknya, kecuali user sendiri yang memindahkannya;
 *   * pesan bisa dibatalkan, dan pembatalan yang telat tidak ikut membuang tetangga;
 *   * begitu giliran selesai, antrean LANGSUNG diproses - user tidak perlu menekan
 *     kirim lagi.
 */
import {
  BATAS_ANTREAN,
  BATAS_TEKS,
  ada,
  batalkan,
  buatAntrean,
  giliranMulai,
  giliranSelesai,
  jumlah,
  kepala,
  kirim,
  kosongkan,
  naikkan,
  promosikan,
  ringkasTeks,
  turunkan,
  ubah,
} from '../src/lib/antreanPesan.ts';

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${pesan}`);
};

/** Antrean sibuk siap pakai: agen sedang bekerja. */
const sibuk = (opsi = {}) => buatAntrean({ sibuk: true, ...opsi });

console.log('— antrean pesan: agen sibuk, pesan baru menunggu\n');

/* A1 — pesan saat sibuk masuk antrean. */
{
  const a0 = sibuk();
  const h = kirim(a0, 'tolong tambahkan tes', [], 1000);
  cek(
    'A1',
    h.ok === true && h.masukAntrean === true && jumlah(h.keadaan) === 1 && h.id,
    `pesan saat sibuk MASUK ANTREAN (masukAntrean=${h.masukAntrean}, isi=${jumlah(h.keadaan)}, id=${h.id})`,
  );
}

/* A2 — giliran yang sedang jalan tidak diganggu. */
{
  const a0 = sibuk();
  const h = kirim(a0, 'pesan kedua', [], 1000);
  const keadaanLamaUtuh = a0.daftar.length === 0 && a0.sibuk === true;
  cek(
    'A2',
    h.keadaan.sibuk === true && h.keadaan !== a0 && keadaanLamaUtuh,
    `giliran yang jalan TIDAK diganggu (sibuk tetap ${h.keadaan.sibuk}; keadaan lama belum tersentuh: ${keadaanLamaUtuh})`,
  );
}

/* A3 — urutan tetap: keluar sesuai urutan masuk. */
{
  let a = sibuk();
  for (const t of ['pertama', 'kedua', 'ketiga']) a = kirim(a, t, [], 1000).keadaan;
  const sama = JSON.stringify(ringkasTeks(a)) === JSON.stringify(['pertama', 'kedua', 'ketiga']);
  cek('A3', sama, `urutan sama dengan urutan masuk (${ringkasTeks(a).join(' -> ')})`);
}

/* A4 — tidak hilang: teks & gambar utuh, penolakan tidak menyentuh antrean. */
{
  let a = sibuk();
  const h1 = kirim(a, '  spasi ikut di-trim  ', ['D:/gambar.png'], 1000);
  a = h1.keadaan;
  const tersimpan = a.daftar[0];
  const tolak = kirim(a, '   ', [], 1001);
  cek(
    'A4',
    tersimpan.teks === 'spasi ikut di-trim' &&
      tersimpan.images[0] === 'D:/gambar.png' &&
      tolak.ok === false &&
      jumlah(tolak.keadaan) === 1 &&
      tolak.keadaan.daftar[0].id === tersimpan.id,
    `isi pesan utuh & penolakan tidak menyentuh antrean (teks="${tersimpan.teks}", gambar=${tersimpan.images.length}, isi setelah tolak=${jumlah(tolak.keadaan)})`,
  );
}

/* A5 — bisa dibatalkan, termasuk di tengah baris. */
{
  let a = sibuk();
  const r1 = kirim(a, 'satu', [], 1000);
  a = r1.keadaan;
  const r2 = kirim(a, 'dua', [], 1001);
  a = r2.keadaan;
  const r3 = kirim(a, 'tiga', [], 1002);
  a = r3.keadaan;
  const b = batalkan(a, r1.id);
  const c = batalkan(b.keadaan, r3.id);
  cek(
    'A5',
    b.ok === true && c.ok === true && jumlah(c.keadaan) === 1 && ringkasTeks(c.keadaan)[0] === 'dua',
    `pesan bisa dibatalkan (3 pesan -> sisa: ${ringkasTeks(c.keadaan).join(', ') || 'kosong'})`,
  );
}

/* A6 — pembatalan telat: id tak dikenal tidak membuang apa pun. */
{
  let a = sibuk();
  a = kirim(a, 'satu', [], 1000).keadaan;
  a = kirim(a, 'dua', [], 1001).keadaan;
  const b = batalkan(a, 'id-yang-tidak-ada');
  cek(
    'A6',
    b.ok === false && jumlah(b.keadaan) === 2 && typeof b.pesan === 'string' && b.pesan.length > 0,
    `id tak dikenal ditolak TANPA membuang pesan lain (${jumlah(b.keadaan)} pesan tetap, pesan="${b.pesan}")`,
  );
}

/* A7 — giliran selesai: antrean LANGSUNG diproses. */
{
  let a = sibuk();
  a = kirim(a, 'pertama', [], 1000).keadaan;
  a = kirim(a, 'kedua', [], 1001).keadaan;
  const g = giliranSelesai(a);
  cek(
    'A7',
    g.dilewati === false &&
      g.langsungDiproses?.teks === 'pertama' &&
      g.sisa === 1 &&
      g.keadaan.sibuk === true &&
      ringkasTeks(g.keadaan)[0] === 'kedua',
    `begitu selesai, antrean langsung diproses ("${g.langsungDiproses?.teks}", sisa ${g.sisa}, sibuk=${g.keadaan.sibuk})`,
  );
}

/* A8 — dua pesan berurutan: keluar satu per satu, urut. */
{
  let a = sibuk();
  a = kirim(a, 'satu', [], 1000).keadaan;
  a = kirim(a, 'dua', [], 1001).keadaan;
  const g1 = giliranSelesai(a);
  const g2 = giliranSelesai(g1.keadaan);
  const g3 = giliranSelesai(g2.keadaan);
  cek(
    'A8',
    g1.langsungDiproses?.teks === 'satu' &&
      g2.langsungDiproses?.teks === 'dua' &&
      g3.langsungDiproses === null &&
      g3.keadaan.sibuk === false,
    `dua pesan berurutan keluar satu per satu (${g1.langsungDiproses?.teks} -> ${g2.langsungDiproses?.teks} -> kosong, sibuk=${g3.keadaan.sibuk})`,
  );
}

/* A9 — pesan kosong ditolak. */
{
  const a = sibuk();
  const h1 = kirim(a, '', [], 1000);
  const h2 = kirim(a, '   \n\t ', [], 1001);
  cek(
    'A9',
    h1.ok === false && h2.ok === false && h1.alasan === 'kosong' && h2.alasan === 'kosong' && jumlah(h2.keadaan) === 0,
    `pesan kosong ditolak (alasan=${h1.alasan}, isi=${jumlah(h2.keadaan)}, pesan="${h2.pesan}")`,
  );
}

/* A10 — antrean penuh ditolak dengan pesan yang jelas. */
{
  const a = sibuk({ batas: 2 });
  const h1 = kirim(a, 'satu', [], 1000);
  const h2 = kirim(h1.keadaan, 'dua', [], 1001);
  const h3 = kirim(h2.keadaan, 'tiga', [], 1002);
  const jelas = typeof h3.pesan === 'string' && /penuh/i.test(h3.pesan) && h3.pesan.includes('2');
  cek(
    'A10',
    h1.ok && h2.ok && h3.ok === false && h3.alasan === 'penuh' && jelas && jumlah(h3.keadaan) === 2,
    `antrean penuh ditolak dengan pesan jelas (isi tetap ${jumlah(h3.keadaan)}; pesan="${h3.pesan}")`,
  );
}

/* A11 — agen tidak sibuk: dikirim sekarang, tidak menumpuk di antrean. */
{
  const a = buatAntrean();
  const h = kirim(a, 'langsung saja', [], 1000);
  cek(
    'A11',
    h.ok === true && h.masukAntrean === false && jumlah(h.keadaan) === 0,
    `agen tidak sibuk -> dikirim langsung, antrean tetap ${jumlah(h.keadaan)} (masukAntrean=${h.masukAntrean})`,
  );
}

/* A12 — "selesai" ganda tidak memakan dua pesan. */
{
  const g0 = giliranSelesai(sibuk()); // sibuk, tapi antrean kosong
  const gIdle = giliranSelesai(g0.keadaan); // dipanggil lagi saat sudah tidak sibuk
  let b = sibuk();
  b = kirim(b, 'satu', [], 1000).keadaan;
  const g1 = giliranSelesai(b);
  const g2 = giliranSelesai(g1.keadaan);
  cek(
    'A12',
    g0.langsungDiproses === null &&
      g0.keadaan.sibuk === false &&
      gIdle.dilewati === true &&
      g1.langsungDiproses?.teks === 'satu' &&
      g2.langsungDiproses === null &&
      jumlah(g2.keadaan) === 0,
    `antrean kosong -> sibuk padam tanpa pesan; "selesai" kedua saat tidak ada giliran dilewati (dilewati=${gIdle.dilewati}), dan tidak memakan pesan (sisa=${jumlah(g2.keadaan)})`,
  );
}

/* A13 — urutan bisa diatur user tanpa ada pesan yang hilang. */
{
  let a = sibuk();
  const r1 = kirim(a, 'satu', [], 1000);
  a = r1.keadaan;
  const r2 = kirim(a, 'dua', [], 1001);
  a = r2.keadaan;
  const r3 = kirim(a, 'tiga', [], 1002);
  a = r3.keadaan;
  const naik = naikkan(a, r3.id);
  const turun = turunkan(naik.keadaan, r3.id);
  const promo = promosikan(turun.keadaan, r3.id);
  const sebelum = ringkasTeks(a);
  const sesudah = ringkasTeks(promo.keadaan);
  const utuh = [...sebelum].sort().join('|') === [...sesudah].sort().join('|');
  cek(
    'A13',
    promo.ok === true && utuh && sesudah[0] === 'tiga' && jumlah(promo.keadaan) === 3 && ada(promo.keadaan, r1.id),
    `promosikan/naikkan/turunkan mengubah urutan tanpa kehilangan pesan (${sebelum.join('>')} -> ${sesudah.join('>')})`,
  );
}

/* A14 — tulis ulang di tempat; teks kosong ditolak. */
{
  let a = sibuk();
  const r1 = kirim(a, 'tpyo', [], 1000);
  a = r1.keadaan;
  a = kirim(a, 'pesan lain', [], 1001).keadaan;
  const u = ubah(a, r1.id, ' typo diperbaiki ');
  const tolak = ubah(u.keadaan, r1.id, '   ');
  cek(
    'A14',
    u.ok === true &&
      u.keadaan.daftar[0].teks === 'typo diperbaiki' &&
      u.keadaan.daftar[0].id === r1.id &&
      u.keadaan.daftar[1].teks === 'pesan lain' &&
      tolak.ok === false &&
      tolak.keadaan.daftar[0].teks === 'typo diperbaiki',
    `ubah menulis ulang DI TEMPAT (slot & id sama, tetangga utuh) & teks kosong ditolak (pesan="${tolak.pesan}")`,
  );
}

/* A15 — pesan terlalu panjang ditolak karena panjangnya, bukan karena penuh. */
{
  const a = sibuk({ batas: 20 });
  const h = kirim(a, 'x'.repeat(BATAS_TEKS + 1), [], 1000);
  const muat = kirim(a, 'y'.repeat(BATAS_TEKS), [], 1001);
  cek(
    'A15',
    h.ok === false && h.alasan === 'terlalu-panjang' && muat.ok === true,
    `pesan ${BATAS_TEKS + 1} karakter ditolak (alasan=${h.alasan}); tepat ${BATAS_TEKS} karakter diterima`,
  );
}

/* A16 — kosongkan membuang semua, tapi TIDAK menghentikan giliran yang jalan. */
{
  let a = sibuk();
  a = kirim(a, 'satu', [], 1000).keadaan;
  a = kirim(a, 'dua', [], 1001).keadaan;
  const k = kosongkan(a);
  const kosong = kosongkan(k.keadaan);
  cek(
    'A16',
    k.dibuang === 2 && jumlah(k.keadaan) === 0 && k.keadaan.sibuk === true && kosong.dibuang === 0 && kepala(k.keadaan) === null,
    `kosongkan membuang ${k.dibuang} pesan, giliran tetap jalan (sibuk=${k.keadaan.sibuk}); panggilan kedua tidak menghitung lagi (dibuang=${kosong.dibuang})`,
  );
}

/* A17 — batas bawaan tetap yang didokumentasikan. */
{
  const a = buatAntrean();
  cek('A17', a.batas === BATAS_ANTREAN && BATAS_ANTREAN === 20 && a.batasTeks === BATAS_TEKS, `batas bawaan: ${a.batas} pesan / ${a.batasTeks} karakter per pesan`);
}

/* A18 — giliranMulai menyalakan sibuk dan idempoten. */
{
  const a = buatAntrean();
  const m1 = giliranMulai(a);
  const m2 = giliranMulai(m1);
  const h = kirim(m1, 'masuk antrean setelah giliran mulai', [], 1000);
  cek(
    'A18',
    m1.sibuk === true && m2 === m1 && h.masukAntrean === true,
    `giliranMulai menyalakan sibuk & idempoten (m2 sama dengan m1: ${m2 === m1}; pesan berikutnya masuk antrean: ${h.masukAntrean})`,
  );
}

console.log(`\n== ${lulus}/${total} lulus ==`);
if (lulus !== total) process.exitCode = 1;
