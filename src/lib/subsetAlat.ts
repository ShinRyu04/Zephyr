/**
 * Subset alat per tugas - dan gerbang rencana pada langkah pertama.
 *
 * ## Kenapa berkas ini ada
 *
 * Katalog tool Zephyr dikirim UTUH di setiap permintaan. Dua biaya muncul dari
 * situ, dan keduanya jatuh tepat pada tugas berat:
 *
 *   1. Token. Puluhan spesifikasi tool ikut di setiap langkah, termasuk tool
 *      browser yang tidak ada hubungannya dengan tugas menulis berkas. Ruang
 *      yang dipakai katalog adalah ruang yang tidak tersedia untuk isi berkas.
 *   2. Pilihan yang salah. Model yang sedang menulis 40 berkas tetap melihat
 *      sembilan tool browser di depannya. Beberapa run nyata menghabiskan
 *      langkah pertama dengan membuka pane browser, lalu ditinggalkan.
 *
 * Selain itu ada satu kebiasaan yang berulang di run berat: model mulai
 * MENULIS sebelum menyusun rencana. `todo_write` disebut di prompt, tetapi
 * imbauan saja tidak cukup - pada tugas besar rencana yang datang di langkah
 * ke-4 jauh lebih mahal daripada rencana di langkah ke-1, karena 3 langkah
 * pertama sudah terlanjur dipakai menebak urutan.
 *
 * Modul ini menyediakan predikat MURNI (tanpa efek samping) untuk keduanya,
 * supaya bisa diuji di Node tanpa menjalankan agen.
 */

import { bentukTugas, permintaanMajemuk } from './agentDorong';
import { TOOL_CATALOG } from './zephyrTools/catalog';

/* ------------------------------------------------------------------ */
/* Klasifikasi alat                                                   */
/* ------------------------------------------------------------------ */

/**
 * Tool yang mengakses JARINGAN.
 *
 * Dua bentuk dibutuhkan: awalan untuk nama per-aksi lama (`browser_*`) yang
 * masih tersedia di `TOOL_WEB`, dan daftar nama untuk tool gabungan yang kini
 * benar-benar ditawarkan (`web`, `browser`). Tanpa dua nama gabungan itu, tugas
 * non-web tetap membawa `web`/`browser` dan menghabiskan jatah catatan.
 */
const AWALAN_WEB = ['browser_'];
const NAMA_WEB = ['web', 'web_fetch', 'web_search', 'browser'];

export function butuhAlatWeb(nama: string): boolean {
  if (NAMA_WEB.includes(nama)) return true;
  return AWALAN_WEB.some((p) => nama.startsWith(p));
}

/**
 * Kata yang berarti tugasnya menyentuh jaringan.
 *
 * Indonesia + Inggris, dan sengaja LUAS: salah menebak "tidak butuh web" pada
 * tugas riset berarti agen kehilangan tool yang justru dibutuhkan. Sebaliknya,
 * menyisakan tool browser pada tugas menulis hanya mengembalikan kita ke
 * perilaku lama (tidak lebih buruk), jadi miringnya ke arah aman.
 */
const KATA_WEB: RegExp[] = [
  /\b(web|website|situs|site|laman|halaman web|internet|online|daring)\b/i,
  /\b(google|browser|url|link|tautan web|http|https|www\.[a-z0-9-])\b/i,
  /\b(cari di|cari tau|carikan|telusuri|scrape|scraping|crawl|crawling|riset web)\b/i,
  /\b(harga|kurs|berita|news|cuaca|jadwal film|tiket|stok barang)\b/i,
  /\b(download|unggah|unduh|fetch|ambil data dari)\b/i,
  /\b(uji web|cek web|cek situs|test situs|preview di browser)\b/i,
];

export function tugasButuhWeb(teks: string | null | undefined): boolean {
  const t = (teks ?? '').trim();
  if (!t) return false;
  return KATA_WEB.some((r) => r.test(t));
}

/* ------------------------------------------------------------------ */
/* Berat atau tidak                                                   */
/* ------------------------------------------------------------------ */

/**
 * Tugas ini layak dipaksa merancang lebih dulu?
 *
 * Batasnya bukan panjang saja: "buat file README" juga tugas tulis, dan
 * memaksa rencana untuk satu berkas adalah satu langkah yang terbuang. Yang
 * dipanggil "berat" adalah tugas tulis yang PANJANG (perintah rinci biasanya
 * panjang - daftar berkas, syarat isi) atau yang menyebut banyak berkas
 * sekaligus.
 */
const KATA_BANYAK =
  /(\b\d{1,3}\s*(?:berkas|file|artikel|halaman|komponen|modul|tes|test|dokumen|script|skrip)\b)|(\b(banyak|semua|seluruh|beberapa|puluhan)\s+(?:berkas|file|artikel|halaman|komponen|modul|dokumen)\b)|(\bmulti[- ]?(?:file|berkas|halaman|komponen)\b)/i;

export function tugasBerat(teks: string | null | undefined): boolean {
  const t = (teks ?? '').trim();
  if (!t) return false;
  if (bentukTugas(t) !== 'tulis') return false;
  if (t.length >= 160) return true;
  if (KATA_BANYAK.test(t)) return true;
  /* Langkah majemuk: daftar rincian user, atau dua aksi yang dirangkai kata
     sambung. Yang satu aksi tetap tidak dipaksa merancang. */
  return permintaanMajemuk(t);
}

/* ------------------------------------------------------------------ */
/* Gerbang langkah pertama                                            */
/* ------------------------------------------------------------------ */

/**
 * Tool yang boleh dilihat model pada langkah PERTAMA tugas berat.
 *
 * Isinya: alat rencana + alat BACA. Menulis belum boleh - kalau `write_file`
 * ada di depan mata, model akan menulis. Membaca tetap boleh karena rencana
 * yang baik kadang butuh melihat struktur folder dulu, dan itu memang langkah
 * pertama yang benar.
 *
 * `todo_write` DIPAKSA ada: kalau ia tidak ada di daftar aktif (dimatikan user),
 * gerbangnya dibatalkan oleh pemanggil - memaksa rencana tanpa alat rencana
 * hanya membuat langkah pertama gagal.
 */
export const TOOL_RENCANA_PERTAMA = ['todo_write', 'list_directory', 'glob', 'grep', 'read_file'];

export function alatRencanaPertama(aktif: string[], adaFolder = true): string[] {
  return TOOL_RENCANA_PERTAMA.filter((n) => aktif.includes(n) && (adaFolder || !butuhFolder(n)));
}

export function gerbangRencanaSiap(aktif: string[], adaFolder = true): boolean {
  return aktif.includes('todo_write') && alatRencanaPertama(aktif, adaFolder).length >= 2;
}

/* ------------------------------------------------------------------ */
/* Pemilihan akhir                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tool yang hanya bisa bekerja kalau ADA folder root.
 *
 * Ketiganya menelusuri pohon folder; tanpa folder terbuka tidak ada pohon yang
 * bisa ditelusuri dan backend menolak panggilannya. Model tidak tahu itu sampai
 * ia mencoba, jadi melihatnya di daftar berarti satu langkah terbakar untuk
 * sebuah penolakan - terbukti pada run nyata: ditanya soal Zephyr sendiri tanpa
 * folder terbuka, agen membuka grep dan glob lebih dulu, menerima penolakan
 * berulang, lalu kehabisan langkah tanpa menjawab pertanyaannya.
 * Menyingkirkannya dari daftar membuat langkah itu tidak mungkin diambil.
 */
export const ALAT_BUTUH_FOLDER = ['list_directory', 'glob', 'grep'];

export function butuhFolder(nama: string): boolean {
  return ALAT_BUTUH_FOLDER.includes(nama);
}

/**
 * Tool yang MENULIS ke disk - diturunkan dari katalog, bukan diketik ulang.
 *
 * Kelas efeknya `fsWrite` (lihat `zephyrTools/catalog.ts`). Daftar manual di
 * sini akan berbeda dari katalognya cepat atau lambat, dan akibatnya halus:
 * tool tulis baru tetap terkirim pada pertanyaan biasa, atau - lebih buruk -
 * tool baca ikut terbuang karena salah daftar.
 */
export const TOOL_TULIS_BERKAS: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.effect === 'fsWrite',
).map((t) => t.name);

/**
 * Daftar alat yang benar-benar dikirim ke provider untuk langkah ini.
 *
 * Aturannya tiga:
 *
 *   1. Tool jaringan hanya ikut kalau tugasnya menyebut jaringan.
 *   2. Tool folder hanya ikut kalau ada folder terbuka (`adaFolder`).
 *   3. Tool TULIS BERKAS tidak ikut kalau user cuma bertanya. Pertanyaan
 *      ("kenapa build gagal?", "ringkas berkas ini") tidak perlu permukaan
 *      tulis sama sekali: yang bisa dipakai hanya menyimpang, dan tiap
 *      spesifikasi tool adalah token di setiap giliran. Yang ambigu tetap
 *      dibiarkan (lihat `bentukTugas`) - arah salahnya harus ke "masih bisa
 *      menulis", bukan ke "tidak bisa".
 *
 * Sisanya diteruskan apa adanya - modul ini menyaring, bukan memilih ulang
 * katalog, supaya setelan user di tool gate tetap yang menentukan.
 *
 * YANG TIDAK PERNAH DIBUANG: `tool_search` dan `tool_call`. Keduanya ada di
 * `TOOL_DIKIRIM_SELALU` dan bukan tool tulis, jadi apa pun yang disaring di
 * sini tetap bisa ditemukan lalu dipanggil - tidak ada tool yang HILANG dari
 * model, hanya satu langkah lebih jauh. Tanpa folder terbuka pun penulisan
 * memang ditolak backend, jadi tool tulis di situ hanya menambah token dan
 * mengundang satu langkah penolakan.
 */
export function alatUntukTugas(
  teks: string | null | undefined,
  aktif: string[],
  adaFolder = true,
): string[] {
  const pakaiWeb = tugasButuhWeb(teks);
  /* `netral` (pesan ambigu seperti "lanjut") sengaja TIDAK masuk sini: yang
     dipastikan cuma pertanyaan/bacaan. Arah salahnya harus ke "masih bisa
     menulis". */
  const cumaBaca = bentukTugas(teks) === 'baca';
  let hasil = pakaiWeb ? [...aktif] : aktif.filter((n) => !butuhAlatWeb(n));
  if (!adaFolder) hasil = hasil.filter((n) => !butuhFolder(n));
  if (cumaBaca || !adaFolder) hasil = hasil.filter((n) => !TOOL_TULIS_BERKAS.includes(n));
  /* Jangan pernah mengirim daftar kosong: itu membuat langkah berikutnya pasti
     gagal tanpa penjelasan. Kalau penyaringan menyisakan nol (mis. tugasnya
     murni "pakai browser"), kembalikan daftar aslinya. */
  if (hasil.length > 0) return hasil;
  const cadangan = adaFolder ? [...aktif] : aktif.filter((n) => !butuhFolder(n));
  return cadangan.length > 0 ? cadangan : [...aktif];
}

/**
 * Catatan alat yang TERAKHIR dikirim - dibaca penguji lewat dev bridge.
 *
 * Tanpa ini "subset per tugas" hanya bisa dipercaya dari kode. Dengan ini
 * harness bisa membuktikan daftar yang benar-benar keluar ke provider pada run
 * nyata, termasuk pada langkah pertama.
 */
export const ALAT_TERAKHIR: {
  tugas: string;
  berat: boolean;
  langkah: number;
  gerbang: boolean;
  adaFolder: boolean;
  alatDikirim: string[];
  alatDibuang: string[];
} = {
  tugas: '',
  berat: false,
  langkah: -1,
  gerbang: false,
  adaFolder: true,
  alatDikirim: [],
  alatDibuang: [],
};

export function catatAlatTerakhir(
  tugas: string,
  langkah: number,
  berat: boolean,
  gerbang: boolean,
  aktif: string[],
  dikirim: string[],
  adaFolder = true,
): void {
  ALAT_TERAKHIR.tugas = tugas.slice(0, 300);
  ALAT_TERAKHIR.berat = berat;
  ALAT_TERAKHIR.langkah = langkah;
  ALAT_TERAKHIR.gerbang = gerbang;
  ALAT_TERAKHIR.adaFolder = adaFolder;
  ALAT_TERAKHIR.alatDikirim = [...dikirim];
  ALAT_TERAKHIR.alatDibuang = aktif.filter((n) => !dikirim.includes(n));
}
