/**
 * uji-suntik-konteks.mjs — uji penyusunan SATU giliran agen TANPA aplikasi.
 *
 * Yang diuji: `src/lib/suntikKonteks.ts` (modul murni) yang menyusun daftar pesan
 * giliran dari riwayat + antrean pesan (`src/lib/antreanPesan.ts`) + isi
 * `.zephyr-context.md` (`src/lib/konteksZephyr.ts`).
 *
 * Yang diuji BUKAN "fungsinya mengembalikan sesuatu", tapi sifat yang harus benar:
 *   * pekerjaan yang belum selesai (pesan mengantre, tugas belum beres, permintaan
 *     sekarang) TIDAK hilang walau anggaran byte sudah habis;
 *   * urutan tetap: konteks -> riwayat -> pesan mengantre -> tugas -> permintaan;
 *   * pemotongan deterministik DAN dilaporkan (diringkas/dibuang), tidak senyap;
 *   * rahasia tetap tersensor - tidak ada jalur yang melewati penyaring konteks;
 *   * dua giliran berturut-turut tidak menggandakan pesan yang sama.
 *
 *   node scripts/uji-suntik-konteks.mjs
 *
 * Modul antrean dipakai SUNGSUHAN (buatAntrean/kirim/giliranMulai/giliranSelesai/
 * promosikan), bukan disalin, supaya aturan antreannya ikut terbukti di sini.
 * Tidak ada berkas di repo yang disentuh; tidak butuh app.
 */
import {
  BATAS_BYTE_GILIRAN,
  RINGKAS_KONTEKS_BYTE,
  potongByte,
  ringkasLaporan,
  susunGiliran,
} from '../src/lib/suntikKonteks.ts';
import {
  buatAntrean,
  giliranMulai,
  giliranSelesai,
  kirim,
  promosikan,
} from '../src/lib/antreanPesan.ts';

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${pesan}`);
};

/* Nilai rahasia disusun dari potongan supaya berkas ini tidak menyimpan kunci yang
   terlihat asli, tapi POLA-nya sama persis dengan yang dicari penyaring. */
const KUNCI_ANTHROPIC = 'sk-' + 'ant-' + 'A'.repeat(24);
const KUNCI_GITHUB = 'ghp_' + 'b'.repeat(24);
const PASSWORD = 'rahasia-banget-123';
const SEMUA_RAHASIA = [KUNCI_ANTHROPIC, KUNCI_GITHUB, PASSWORD];

const KONTEKS = [
  '## Konteks aplikasi (dikelola Zephyr)',
  '',
  '### Repo',
  '- Repo: D:/Zephyr',
  '- Cabang: feat/ai-panel-vscode-layout',
  '',
  '### Tugas berjalan',
  '- Perbaiki total diskon di kasir.js',
].join('\n');

const teksPesan = (hasil) => hasil.pesan.map((p) => p.teks).join('\n<<>>\n');
const indeks = (hasil, id) => hasil.pesan.findIndex((p) => p.id === id);
const bocor = (teks) => SEMUA_RAHASIA.filter((r) => teks.includes(r));

const riwayatPanjang = (n, panjang = 1200) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    peran: i % 2 === 0 ? 'user' : 'assistant',
    teks: `[r${i}] ${'kata '.repeat(Math.ceil(panjang / 5)).slice(0, panjang)}`,
  }));

/* ═══ S1 — giliran dasar: konteks dulu, riwayat, antrean, permintaan terakhir ═══ */
{
  let k = buatAntrean({ batas: 20 });
  k = giliranMulai(k);
  k = kirim(k, 'pesan kedua: periksa juga laporan.js', [], 100).keadaan;
  const r = susunGiliran({
    konteks: KONTEKS,
    riwayat: [
      { id: 'r1', peran: 'user', teks: 'tolong perbaiki kasir.js' },
      { id: 'r2', peran: 'assistant', teks: 'siap, saya mulai' },
    ],
    antrean: k,
    permintaan: { id: 'p-now', teks: 'lanjutkan lalu jalankan node laporan.js' },
  });
  const urut =
    indeks(r, 'konteks') === 0 &&
    indeks(r, 'r1') === 1 &&
    indeks(r, 'r2') === 2 &&
    r.pesan.findIndex((p) => p.asal === 'antrean') === 3 &&
    indeks(r, 'minta:p-now') === r.pesan.length - 1;
  cek(
    'S1',
    urut && r.pesan.length === 5 && r.laporan.muat === true && r.laporan.tugasTerjaga === 2,
    `urutan konteks->riwayat->antrean->permintaan benar (${r.pesan.map((p) => p.id).join(' -> ')}); tugasTerjaga=${r.laporan.tugasTerjaga}`,
  );
}

/* ═══ S2 — riwayat panjang sampai batas, pekerjaan belum selesai WAJIB bertahan ═══ */
{
  const r = susunGiliran({
    konteks: KONTEKS,
    riwayat: riwayatPanjang(40),
    antrean: null,
    tugasBelumSelesai: ['total diskon masih kurang 120000 - BELUM beres'],
    permintaan: { id: 'p2', teks: 'lanjutkan tugas yang belum selesai' },
    batasByte: 8192,
  });
  const adaTugas = teksPesan(r).includes('BELUM beres');
  const mintaTerakhir = r.pesan[r.pesan.length - 1].id === 'minta:p2';
  cek(
    'S2',
    r.laporan.dibuang.length > 0 &&
      adaTugas &&
      mintaTerakhir &&
      r.laporan.tugasTerjaga === 2 &&
      r.laporan.byteTotal <= 8192,
    `riwayat dipotong (${r.laporan.dibuang.length} blok dibuang, ${r.laporan.diringkas.length} diringkas) tapi tugas & permintaan UTUH; ${r.laporan.byteTotal}/8192 byte`,
  );
}

/* ═══ S3 — pesan mengantre bercampur permintaan baru: antrean DULU, permintaan akhir ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'PESAN-MENGANTRE-1: jangan lupa tes', [], 1).keadaan;
  k = kirim(k, 'PESAN-MENGANTRE-2: sekalian rapikan', [], 2).keadaan;
  const r = susunGiliran({
    konteks: null,
    riwayat: [],
    antrean: k,
    permintaan: { id: 'p3', teks: 'PERMINTAAN-SEKARANG: kok masih belum kelar?' },
  });
  const t = teksPesan(r);
  const pos1 = t.indexOf('PESAN-MENGANTRE-1');
  const pos2 = t.indexOf('PESAN-MENGANTRE-2');
  const posNow = t.indexOf('PERMINTAAN-SEKARANG');
  const antrean = r.pesan.filter((p) => p.asal === 'antrean');
  cek(
    'S3',
    pos1 > -1 && pos2 > pos1 && posNow > pos2 && r.pesan[r.pesan.length - 1].asal === 'permintaan' && antrean.length === 2,
    `antrean keluar berurutan lalu permintaan paling akhir (posisi ${pos1} < ${pos2} < ${posNow}), ${antrean.length} pesan antrean terbawa`,
  );
}

/* ═══ S4 — konteks berisi rahasia: TETAP tersensor, tidak bocor ke keluaran ═══ */
{
  const konteksKotor = `${KONTEKS}\n\n### Catatan\n- OPENAI_API_KEY=${KUNCI_ANTHROPIC}\n- token bot: ${KUNCI_GITHUB}\n- password = ${PASSWORD}`;
  const r = susunGiliran({
    konteks: konteksKotor,
    permintaan: { id: 'p4', teks: 'lanjutkan' },
  });
  const keluaran = teksPesan(r);
  const nyasar = bocor(keluaran);
  cek(
    'S4',
    nyasar.length === 0 &&
      keluaran.includes('«disensor»') &&
      r.laporan.rahasia.length > 0 &&
      r.laporan.rahasia.every((t) => typeof t.aturan === 'string' && t.contoh.includes('«disensor»')),
    `konteks berisi ${SEMUA_RAHASIA.length} rahasia diambil; tidak ada nilai asli di keluaran (${keluaran.length} karakter), temuan: ${r.laporan.rahasia.map((t) => t.aturan).join(', ')}`,
  );
}

/* ═══ S5 — rahasia di JALUR LAIN (riwayat + permintaan) juga tersensor ═══ */
{
  const r = susunGiliran({
    konteks: null,
    riwayat: [{ id: 'r1', peran: 'user', teks: `pakai ${KUNCI_GITHUB} untuk push` }],
    permintaan: { id: 'p5', teks: `kunci ${KUNCI_ANTHROPIC} jangan sampai tertulis di catatan` },
  });
  const keluaran = teksPesan(r);
  cek(
    'S5',
    bocor(keluaran).length === 0 && r.laporan.rahasia.length >= 2 && keluaran.includes('«disensor»'),
    `riwayat & permintaan sama-sama lewat penyaring (aturan terdeteksi: ${r.laporan.rahasia.map((t) => t.aturan).join(', ')}) - tidak ada jalur tunda menuju provider`,
  );
}

/* ═══ S6 — konteks belum ada: giliran tetap jalan, tidak error, dilaporkan ═══ */
{
  let galat = null;
  let r = null;
  try {
    r = susunGiliran({ konteks: null, riwayat: [], antrean: null, permintaan: { id: 'p6', teks: 'halo' } });
  } catch (e) {
    galat = String(e && e.message ? e.message : e);
  }
  const kosong = susunGiliran({ konteks: '   ', permintaan: { id: 'p6b', teks: 'halo' } });
  cek(
    'S6',
    galat === null &&
      r !== null &&
      r.pesan.length === 1 &&
      r.pesan[0].id === 'minta:p6' &&
      r.laporan.peringatan.some((p) => p.includes('Konteks workspace belum ada')) &&
      kosong.laporan.peringatan.some((p) => p.includes('Konteks workspace belum ada')),
    `tanpa .zephyr-context.md giliran jalan ${r ? r.pesan.length : '?'} pesan tanpa error, alasannya dilaporkan (bukan diam)`,
  );
}

/* ═══ S7 — idempoten: bahan yang sama -> keluaran identik (byte per byte) ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'antre ini', [], 7).keadaan;
  const bahan = {
    konteks: KONTEKS,
    riwayat: riwayatPanjang(30),
    antrean: k,
    tugasBelumSelesai: ['tugas yang belum beres'],
    permintaan: { id: 'p7', teks: 'lanjutkan' },
    batasByte: 4096,
  };
  const a = JSON.stringify(susunGiliran(bahan));
  const b = JSON.stringify(susunGiliran(bahan));
  const c = JSON.stringify(susunGiliran(bahan));
  cek(
    'S7',
    a === b && b === c && a.length > 200,
    `tiga panggilan dengan bahan yang sama menghasilkan keluaran yang identik (${a.length} byte JSON), jadi giliran kedua tidak menambah apa pun sendiri`,
  );
}

/* ═══ S8 — dua giliran berturut-turut: pesan yang sudah diproses tidak dobel ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'PESAN-KEDUA: periksa laporan.js', [], 11).keadaan;
  const kirimKetiga = kirim(k, 'PESAN-KETIGA: rapikan KELUHAN.md', [], 12);
  k = kirimKetiga.keadaan;

  const t1 = susunGiliran({
    konteks: KONTEKS,
    riwayat: [{ id: 'r1', peran: 'user', teks: 'PESAN-PERTAMA: perbaiki total' }],
    antrean: k,
    permintaan: { id: 'p-awal', teks: 'PESAN-PERTAMA: perbaiki total' },
  });

  /* Giliran selesai: kepala antrean LANGSUNG diproses (aturan antreanPesan.ts). */
  const g = giliranSelesai(k);
  const t2 = susunGiliran({
    konteks: KONTEKS,
    riwayat: [
      { id: 'r1', peran: 'user', teks: 'PESAN-PERTAMA: perbaiki total' },
      { id: 'r2', peran: 'assistant', teks: 'sudah saya periksa' },
    ],
    antrean: g.keadaan,
    permintaan: { id: g.langsungDiproses.id, teks: g.langsungDiproses.teks },
  });

  const hitung = (hasil, potongan) => hasil.pesan.filter((p) => p.teks.includes(potongan)).length;
  const cek2 = hitung(t2, 'PESAN-KEDUA');
  const cek3 = hitung(t2, 'PESAN-KETIGA');
  cek(
    'S8',
    t1.pesan.filter((p) => p.asal === 'antrean').length === 2 &&
      g.langsungDiproses !== null &&
      cek2 === 1 &&
      cek3 === 1 &&
      t2.pesan.filter((p) => p.asal === 'antrean').length === 1,
    `giliran-1 membawa 2 pesan antrean; giliran-2 membawa "PESAN-KEDUA" ${cek2}x (sebagai permintaan, bukan pengulangan) dan "PESAN-KETIGA" ${cek3}x sebagai antrean`,
  );
}

/* ═══ S9 — pesan yang sama dari dua sumber DIGABUNG (tidak dobel) ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  const kirimHasil = kirim(k, 'PESAN-SAMA: jalankan tes', [], 21);
  k = kirimHasil.keadaan;
  const r = susunGiliran({
    konteks: null,
    antrean: k,
    permintaan: { id: kirimHasil.id, teks: 'PESAN-SAMA: jalankan tes' },
  });
  const jumlah = r.pesan.filter((p) => p.teks.includes('PESAN-SAMA')).length;
  cek(
    'S9',
    jumlah === 1 && r.laporan.digabung.length === 1 && r.pesan[r.pesan.length - 1].id === `minta:${kirimHasil.id}`,
    `permintaan yang id-nya masih ada di antrean (keadaan basi) muncul ${jumlah}x, digabung: ${r.laporan.digabung[0]}`,
  );
}

/* ═══ S10 — anggaran TIDAK cukup: pekerjaan belum selesai tetap UTUH, dilaporkan ═══ */
{
  const minta = `TOLONG-SELESAIKAN: ${Array.from({ length: 80 }, (_, i) => `rincian-${i}`).join(' ')}`;
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'ANTREAN-PENTING: jangan dihapus', [], 31).keadaan;
  const r = susunGiliran({
    konteks: `KONTEKS-SANGAT-PANJANG ${'x'.repeat(3000)}`,
    riwayat: riwayatPanjang(20),
    antrean: k,
    tugasBelumSelesai: ['TUGAS-BELUM-BERES'],
    permintaan: { id: 'p10', teks: minta },
    batasByte: 200,
  });
  const t = teksPesan(r);
  const mintaUtuh = r.pesan.find((p) => p.id === 'minta:p10').teks === minta;
  cek(
    'S10',
    r.laporan.melebihiAnggaran === true &&
      r.laporan.muat === false &&
      mintaUtuh &&
      t.includes('ANTREAN-PENTING') &&
      t.includes('TUGAS-BELUM-BERES') &&
      r.laporan.peringatan.some((p) => p.includes('DILEWATI')) &&
      r.laporan.dibuang.every((d) => d.asal === 'riwayat' || d.asal === 'konteks'),
    `anggaran 200 byte dilewati (${r.laporan.byteTotal} byte) tapi permintaan utuh & antrean/tugas tetap ada; yang dibuang hanya ${r.laporan.dibuang.map((d) => d.asal).join(', ') || 'tidak ada'}`,
  );
}

/* ═══ S11 — riwayat dibuang tanpa daftar tugas: user DIPERINGATKAN ═══ */
{
  const r = susunGiliran({
    konteks: null,
    riwayat: riwayatPanjang(30),
    permintaan: { id: 'p11', teks: 'lanjutkan' },
    batasByte: 1024,
  });
  cek(
    'S11',
    r.laporan.dibuang.some((d) => d.asal === 'riwayat') &&
      r.laporan.peringatan.some((p) => p.includes('Riwayat dibuang')),
    `riwayat dibuang (${r.laporan.dibuang.length} blok) dan karena \`tugasBelumSelesai\` kosong, peringatannya bunyi - bukan pemotongan senyap`,
  );
}

/* ═══ S12 — pemotongan deterministik: batas baris, ditandai, konteks menyusul ═══ */
{
  const barisBanyak = Array.from({ length: 400 }, (_, i) => `baris-${i} ${'y'.repeat(40)}`).join('\n');
  const a = potongByte(barisBanyak, 1000);
  const b = potongByte(barisBanyak, 1000);
  const kecil = potongByte('pendek', 1000);
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'antre', [], 41).keadaan;
  const rKonteksDipotong = susunGiliran({
    konteks: `KONTEKS ${'z'.repeat(9000)}`,
    antrean: k,
    permintaan: { id: 'p12', teks: 'lanjutkan' },
    batasByte: 5000,
  });
  const konteksBlock = rKonteksDipotong.pesan.find((p) => p.asal === 'konteks');
  const diringkasKonteks = rKonteksDipotong.laporan.diringkas.some((d) => d.asal === 'konteks');
  const rKonteksDibuang = susunGiliran({
    konteks: `KONTEKS ${'z'.repeat(9000)}`,
    riwayat: [],
    permintaan: { id: 'p12b', teks: 'lanjutkan' },
    batasByte: 300,
  });
  cek(
    'S12',
    a.terpotong === true &&
      a.teks === b.teks &&
      /ringkas: \d+ byte terakhir tidak dimuat/.test(a.teks) &&
      kecil.terpotong === false &&
      diringkasKonteks &&
      konteksBlock !== undefined &&
      konteksBlock.ringkasDari > RINGKAS_KONTEKS_BYTE &&
      rKonteksDibuang.laporan.dibuang.some((d) => d.asal === 'konteks'),
    `potongan sama pada pemanggilan ulang, di batas baris + ditandai; konteks diringkas ke <=${RINGKAS_KONTEKS_BYTE} byte, lalu DIBUANG kalau masih tidak muat`,
  );
}

/* ═══ S13 — ringkasLaporan: pemotongan bisa dibaca manusia (bukan senyap) ═══ */
{
  const r = susunGiliran({
    konteks: KONTEKS,
    riwayat: riwayatPanjang(30),
    permintaan: { id: 'p13', teks: 'lanjutkan' },
    batasByte: 1024,
  });
  const baris = ringkasLaporan(r.laporan);
  const angkaDibuang = /dibuang: (\d+)/.exec(baris);
  cek(
    'S13',
    baris.includes('PERINGATAN') &&
      angkaDibuang !== null &&
      Number(angkaDibuang[1]) === r.laporan.dibuang.length &&
      r.laporan.dibuang.length > 0 &&
      baris.split('\n').length === 1,
    `satu baris laporan: "${baris.slice(0, 150)}..."`,
  );
}

/* ═══ S14 — urutan antrean mengikuti keputusan user (promosikan), bukan di-sort ulang ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'A: pertama', [], 51).keadaan;
  k = kirim(k, 'B: kedua', [], 52).keadaan;
  const idC = kirim(k, 'C: ketiga', [], 53);
  k = idC.keadaan;
  k = promosikan(k, idC.id).keadaan; // user menaikkan C ke depan
  const r = susunGiliran({ konteks: null, antrean: k, permintaan: { id: 'p14', teks: 'jalankan' } });
  const urutAntrean = r.pesan.filter((p) => p.asal === 'antrean').map((p) => p.id);
  const diharap = k.daftar.map((p) => `antrean:${p.id}`);
  cek(
    'S14',
    JSON.stringify(urutAntrean) === JSON.stringify(diharap) && urutAntrean[0].endsWith(idC.id),
    `urutan hasil promosikan dipertahankan apa adanya: ${urutAntrean.join(' -> ')}`,
  );
}

/* ═══ S15 — giliran paling minimal: hanya permintaan, tanpa konteks/riwayat/antrean ═══ */
{
  const r = susunGiliran({ permintaan: { id: 'p15', teks: 'apa kabar?' } });
  cek(
    'S15',
    r.pesan.length === 1 &&
      r.pesan[0].asal === 'permintaan' &&
      r.laporan.muat === true &&
      r.laporan.dibuang.length === 0 &&
      r.laporan.batasByte === BATAS_BYTE_GILIRAN,
    `1 pesan, anggaran default ${BATAS_BYTE_GILIRAN} byte, tidak ada yang dipotong/dibuang`,
  );
}

/* ═══ S16 — riwayat pendek TIDAK dipotong (anggaran tidak agresif) ═══ */
{
  const r = susunGiliran({
    konteks: KONTEKS,
    riwayat: [
      { id: 'r1', peran: 'user', teks: 'halo' },
      { id: 'r2', peran: 'assistant', teks: 'halo juga' },
    ],
    permintaan: { id: 'p16', teks: 'lanjut' },
  });
  cek(
    'S16',
    r.laporan.diringkas.length === 0 &&
      r.laporan.dibuang.length === 0 &&
      r.pesan.length === 4 &&
      r.laporan.muat === true,
    `4 pesan (konteks+2 riwayat+permintaan), 0 diringkas, 0 dibuang - ${r.laporan.byteTotal}/${r.laporan.batasByte} byte`,
  );
}

/* ═══ S17 — gambar dilaporkan jumlahnya, isinya tidak ikut ke teks ═══ */
{
  let k = buatAntrean();
  k = giliranMulai(k);
  k = kirim(k, 'lihat gambar ini', ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'], 61).keadaan;
  const r = susunGiliran({
    konteks: null,
    antrean: k,
    permintaan: { id: 'p17', teks: 'lanjutkan', images: ['data:image/png;base64,CCC'] },
  });
  const teks = teksPesan(r);
  cek(
    'S17',
    teks.includes('[2 gambar dilampirkan]') &&
      teks.includes('[1 gambar dilampirkan]') &&
      !teks.includes('base64'),
    `jumlah gambar dilaporkan (2 di antrean, 1 di permintaan) tanpa menyalin data gambarnya ke teks`,
  );
}

console.log(`\n== ${lulus}/${total} lulus ==`);
if (lulus !== total) process.exitCode = 1;
