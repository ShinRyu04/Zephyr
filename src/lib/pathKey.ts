/*
 * Kunci pembanding path: garis miring diseragamkan, huruf jadi kecil.
 *
 * Kedua fungsi ini menerima nilai yang datang dari KLIK PENGGUNA dan dari
 * jawaban MODEL, jadi isinya tidak bisa dipercaya. Sebelumnya keduanya
 * memanggil `.replace()` langsung pada apa pun yang diterima - dan satu
 * pemanggil yang mengirim `undefined` (referensi berkas tanpa group path di
 * ChatMessage.tsx) melempar dari dalam renderer. Lemparan itu tidak tertangkap
 * dan MEMATIKAN LOOP AGENT yang sedang berjalan.
 *
 * Penjagaan ditaruh di sini, bukan hanya di pemanggilnya, karena ini titik
 * paling dalam: apa pun yang lupa memeriksa tetap aman, dan nilainya masih
 * bisa dibandingkan tanpa melempar.
 *
 * Bentuk tipe `unknown` dipertahankan sengaja: pemanggil yang mengirim
 * `undefined` memang ada, dan TypeScript tidak akan pernah menangkapnya sendiri
 * karena nilainya datang saat runtime.
 */
export const kunciPath = (p: unknown): string =>
  String(p ?? '')
    .replace(/\//g, '\\')
    /* Separator di ujung bukan pembeda folder: `D:\Zephyr\` dan `D:\Zephyr`
       adalah folder yang sama, dan dialog/backend mengirim keduanya. Tanpa
       ini keduanya jadi kunci berbeda. */
    .replace(/\\+$/, '')
    .toLowerCase();

export const pathSama = (a: unknown, b: unknown): boolean => kunciPath(a) === kunciPath(b);
