/**
 * cek-bahasa-final.mjs - buktikan antarmuka English tidak lagi campur Indonesia.
 *
 *   node scripts/cek-bahasa-final.mjs [port]
 *
 * Menguji DUA hal yang berbeda:
 *   1. kamus tambahan benar-benar termuat saat aplikasi jalan (bug asalnya:
 *      fungsi pemuatnya tidak pernah dipanggil)
 *   2. teks yang BENAR-BENAR dirender di layar memakai terjemahan English
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const h = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Tunggu kamus selesai dimuat - ini yang dulu tidak pernah terjadi. */
  const i18n = await import('/src/lib/i18n.ts');
  await i18n.muatKamusTambahan();
  await tidur(600);

  /*
   * Kunci yang diuji HARUS yang benar-benar dipakai antarmuka.
   *
   * Versi pertama daftar ini memuat 'Berkas' dan 'Berkas baru'; keduanya tidak
   * pernah dipanggil satu komponen pun, jadi kegagalannya menunjuk ke kamus
   * padahal yang salah adalah ujinya. Dua pelajaran yang membuat daftar ini
   * berbeda:
   *
   *   - 'ai.noChat' diuji lewat KUNCINYA, bukan lewat teks Indonesia-nya.
   *     Teks lengkapnya berakhiran titik, dan menyalinnya dengan tangan
   *     menghasilkan kunci yang tidak pernah ada.
   *   - kunci yang dipilih semuanya punya pemanggil nyata di src/.
   */
  const kunci = [
    'Ubah', 'Hapus', 'Pengaturan', 'Perintah', 'Susun langkah',
    'Mulai percakapan baru', 'Hapus semua riwayat chat',
    'ai.noChat', 'Buka di terminal', 'files',
  ];
  const terjemah = {};
  for (const k of kunci) terjemah[k] = i18n.translate('en', k);

  /* Dan yang benar-benar ada di layar sekarang. */
  const layar = document.body.innerText || '';
  const penanda = ['Ubah', 'Hapus semua', 'Pengaturan', 'Perintah', 'Berkas', 'Jalankan', 'Simpan'];
  const bocor = {};
  for (const p of penanda) {
    const n = (layar.match(new RegExp('\\\\b' + p + '\\\\b', 'g')) || []).length;
    if (n) bocor[p] = n;
  }

  return { kamusSiap: i18n.kamusTambahanSiap(), terjemah, bocorDiLayar: bocor };
})())`);

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
};

console.log('\n== Kamus tambahan ==');
cek('kamus tambahan termuat', h.kamusSiap === true);

console.log('\n== Terjemahan English ==');
/*
 * Menguji "nilai == kunci" TIDAK cukup untuk menyimpulkan kegagalan.
 *
 * Untuk kunci 'files', terjemahan Inggrisnya memang 'files' - huruf kecil
 * adalah bentuk yang benar di tengah kalimat. Uji yang menandai itu sebagai
 * gagal akan mendorong orang "memperbaiki" kamus yang sudah benar.
 *
 * Yang benar-benar membuktikan kamus tidak terpakai adalah: nilainya SAMA
 * DENGAN TEKS INDONESIA yang seharusnya diterjemahkan. Jadi yang dicari adalah
 * nilai yang masih memuat kata Indonesia, bukan nilai yang kebetulan identik
 * dengan kuncinya.
 */
const KATA_INDONESIA = [
  'yang', 'dengan', 'untuk', 'dari', 'tidak', 'belum', 'sudah', 'berkas',
  'berjalan', 'tampilkan', 'izinkan', 'batas', 'langkah', 'simpan', 'tutup',
  'buka', 'hapus', 'ubah', 'pengaturan', 'perintah', 'kesalahan', 'selesai',
  'menunggu', 'gagal', 'memuat', 'ulang', 'akses', 'izin', 'jumlah', 'daftar',
  'jadwal', 'tugas', 'riwayat', 'pencarian', 'percakapan', 'lampiran',
];
const masihIndonesia = Object.entries(h.terjemah || {}).filter(([, v]) =>
  KATA_INDONESIA.some((k) => new RegExp('\\b' + k + '\\b', 'i').test(String(v))),
);
cek('tidak ada nilai English yang masih Indonesia', masihIndonesia.length === 0, {
  masihIndonesia,
});

console.log('\n== Teks yang tampil di layar ==');
const bocor = Object.keys(h.bocorDiLayar);
cek('tidak ada kata Indonesia di layar English', bocor.length === 0, { bocor: h.bocorDiLayar });

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
