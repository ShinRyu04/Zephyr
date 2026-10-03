/**
 * kutipPerintah.ts - mengamankan perintah agen sebelum dikirim ke shell.
 *
 * Kenapa ini ada.
 *
 * Shell memakai `&` sebagai PEMISAH PERINTAH, bukan bagian dari teks. Jadi
 * perintah yang memuat URL seperti
 *
 *   yt-dlp https://www.youtube.com/watch?v=abc&list=XYZ&index=3
 *
 * dipecah menjadi tiga: bagian pertama dijalankan DI LATAR BELAKANG (`&` di
 * akhir), lalu `list=XYZ` dan `index=3` gagal sebagai perintah. Prompt kembali
 * dengan cepat karena bagian pertama dilepas ke background, sehingga agen
 * mengira perintahnya belum jalan dan mengirimnya lagi - berulang. Itulah loop
 * yang dilihat user.
 *
 * Kutipan menyelesaikannya: di dalam `"..."` atau `'...'`, `&` hanyalah huruf.
 * Dibuktikan: `curl "https://x.com?a=1&b=2"` mengunduh satu URL, sedangkan
 * versi tanpa kutip menjalankan `curl https://x.com?a=1` di latar belakang.
 *
 * Fungsi ini SENGAJA tidak mengubah perintah yang sudah punya kutipan, dan
 * tidak mengubah perintah yang memang memakai `&` sebagai operator. Ia hanya
 * bertindak pada token yang JELAS sebuah URL dengan `&` di dalamnya.
 */

/** Karakter yang membuat shell memecah perintah bila tidak dikutip. */
const PEMISAH_SHELL = /[&|<>^]/;

/**
 * Apakah token ini sebuah URL?
 *
 * Harus URL utuh (skema atau awalan www), bukan sembarang kata - supaya
 * "a&b" yang memang operator tidak ikut dikutip.
 */
const adalahUrl = (token: string): boolean => /^(https?:\/\/|www\.)\S+$/i.test(token);

/**
 * Kutip setiap token URL yang memuat karakter pemisah shell.
 *
 * Memakai kutip GANDA: di dalamnya `$` tetap diperluas shell (yang biasanya
 * diinginkan pada URL dengan variabel), sementara `&` dan `|` berhenti menjadi
 * operator. Kutip tunggal akan mematikan ekspansi variabel dan itu terlalu
 * agresif untuk perintah yang dibangun user.
 *
 * Kalau token SUDAH memuat kutipan, token itu dilewati - menambahkan kutipan di
 * sekitarnya akan merusak perintah yang sudah benar.
 */
export function kutipUrlDiPerintah(command: string): { perintah: string; diubah: boolean } {
  const teks = String(command ?? '');
  if (!teks.includes('&') && !teks.includes('|')) return { perintah: teks, diubah: false };

  let diubah = false;
  const potongan = teks.split(/(\s+)/);
  const hasil = potongan.map((bagian) => {
    if (!bagian || /^\s+$/.test(bagian)) return bagian;
    if (!PEMISAH_SHELL.test(bagian)) return bagian;
    /* Sudah dikutip: jangan disentuh. */
    if (/^['"]/.test(bagian) || /['"]$/.test(bagian)) return bagian;
    /* Ada kutipan di tengah: perintahnya sudah rumit, serahkan pada user. */
    if (bagian.includes('"') || bagian.includes("'")) return bagian;
    if (!adalahUrl(bagian)) return bagian;
    diubah = true;
    return `"${bagian}"`;
  });

  return { perintah: hasil.join(''), diubah };
}
