/*
 * Uji `terapkanDiff` - penghitung hasil patch di src/lib/commands.ts.
 *
 * Kenapa ini perlu ada: fungsi itu dibaca oleh pemeriksa aturan sebagai GANTI
 * dari isi berkas yang sesungguhnya. Kalau ia salah menghitung, aturan memeriksa
 * teks yang tidak akan pernah ada di disk, dan aturan bisa dilewati tanpa ada
 * yang gagal. Fungsi yang tidak diuji di jalur keamanan lebih buruk daripada
 * tidak ada: ia memberi rasa aman.
 *
 * Diuji lewat berkas sumbernya langsung, bukan lewat app hidup - fungsinya murni
 * (teks masuk, teks keluar) dan tidak menyentuh apa pun.
 */

import fs from 'node:fs';

const src = fs.readFileSync('src/lib/commands.ts', 'utf8');

/* Ambil fungsi `terapkanDiff` dari sumber, lalu jalankan - supaya uji ini TIDAK
   memakai salinan yang bisa basi saat fungsinya berubah. */
const mulai = src.indexOf('export function terapkanDiff');
if (mulai === -1) {
  console.error('GAGAL: terapkanDiff tidak ditemukan di commands.ts');
  process.exit(1);
}
/* Cari penutup fungsi: baris '}' di awal baris sesudah awal fungsi. */
let akhir = src.indexOf('\n}', mulai);
if (akhir === -1) {
  console.error('GAGAL: penutup terapkanDiff tidak ditemukan');
  process.exit(1);
}
akhir += 2;
const badan = src.slice(mulai, akhir).replace('export function', 'function');

/*
 * Buang anotasi TypeScript sebelum menjalankannya.
 *
 * `new Function` adalah mesin JavaScript - `(asli: string, patch: string): string
 * | null` bukan JS yang sah dan langsung SyntaxError. Menyalin ulang fungsinya ke
 * dalam uji akan lebih mudah, dan itu justru kesalahan yang harus dihindari: uji
 * yang memakai SALINAN akan tetap lulus setelah fungsi aslinya rusak. Jadi yang
 * dijalankan tetap fungsi dari berkas sumber, hanya anotasinya dibuang.
 *
 * Yang dihapus hanya bentuk anotasi fungsi di sini: `: Tipe` sesudah nama
 * parameter dan sesudah daftar parameter. Tanda `:` di dalam string literal atau
 * di ternary tidak tersentuh karena polanya menuntut diikuti spasi lalu nama
 * tipe yang diawali huruf besar atau primitif.
 */
const tanpaTipe = badan
  .replace(/\)\s*:\s*[A-Za-z][\w<>\[\]\s|.]*?(?=\s*\{)/, ')')
  .replace(/(\b\w+)\s*:\s*(string|number|boolean|any|unknown)(\[\])?/g, '$1');

const modul = new Function(tanpaTipe + '\nreturn terapkanDiff;');
const terapkanDiff = modul();

let lulus = 0;
let total = 0;
function cek(nama, dapat, harap) {
  total += 1;
  const ok = dapat === harap;
  if (ok) lulus += 1;
  console.log((ok ? '  OK    ' : '  GAGAL ') + nama);
  if (!ok) {
    console.log('        harap: ' + JSON.stringify(harap));
    console.log('        dapat: ' + JSON.stringify(dapat));
  }
}

console.log('== terapkanDiff ==\n');

/* 1. Ganti satu baris. */
const asli1 = 'alpha\nbeta\ngamma\n';
const patch1 = `--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n`;
cek('ganti satu baris', terapkanDiff(asli1, patch1), 'alpha\nBETA\ngamma\n');

/* 2. Tambah baris tanpa menghapus. */
const patch2 = `@@ -1,2 +1,3 @@\n alpha\n+baru\n beta\n`;
cek('tambah baris', terapkanDiff('alpha\nbeta\ngamma\n', patch2), 'alpha\nbaru\nbeta\ngamma\n');

/* 3. Hapus baris. */
const patch3 = `@@ -1,3 +1,2 @@\n alpha\n-beta\n gamma\n`;
cek('hapus baris', terapkanDiff('alpha\nbeta\ngamma\n', patch3), 'alpha\ngamma\n');

/* 4. Patch kedua di berkas yang sama, menjangkau baris jauh. */
const asli4 = 'a\nb\nc\nd\ne\nf\n';
const patch4 = `@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -5,2 +5,2 @@\n e\n-f\n+F\n`;
cek('dua hunk di satu berkas', terapkanDiff(asli4, patch4), 'a\nB\nc\nd\ne\nF\n');

/* 5. Konteks tidak cocok -> null, supaya pemanggil tahu rekonstruksinya fiktif. */
const patch5 = `@@ -1,2 +1,2 @@\n TIDAK ADA\n-b\n+B\n`;
cek('konteks tidak cocok -> null', terapkanDiff(asli4, patch5), null);

/* 6. Patch kosong -> berkas tidak berubah. */
cek('patch kosong -> tidak berubah', terapkanDiff('a\nb\n', ''), 'a\nb\n');

/*
 * 7. CRLF di sisi asli dinormalkan.
 *
 * Asli 'a\r\nb\r\nc\r\n' dengan patch yang menghapus 'b': hasilnya 'a\nc\n'.
 * Harapan pertama saya 'a\n' - itu SALAH SAYA, bukan salah fungsinya: patch-nya
 * hanya menghapus satu baris, jadi 'c' memang harus tetap ada. Uji yang memaku
 * harapan yang keliru adalah cara paling cepat membuat orang "memperbaiki" kode
 * yang sudah benar.
 */
const patch7 = `@@ -1,3 +1,2 @@\n a\n-b\n c\n`;
const hasil7 = terapkanDiff('a\r\nb\r\nc\r\n', patch7);
cek('CRLF dinormalkan', hasil7, 'a\nc\n');
cek('CRLF tidak menyisakan \\r', hasil7 !== null && !hasil7.includes('\r'), true);

/* 8. Baris terakhir tanpa newline tetap utuh. */
const patch8 = `@@ -1,2 +1,2 @@\n a\n-b\n+B\n`;
cek('tanpa newline akhir', terapkanDiff('a\nb', patch8), 'a\nB');

/* 9. Pesan aturan yang HARUS terdeteksi: patch yang menyisipkan rahasia.
   Inilah alasan fungsi ini ada - hasilnya harus memuat baris rahasianya. */
const rahasia = 'API_KEY="sk-live-abcdef1234567890"';
const patchR = `@@ -1,1 +1,2 @@\n const a = 1;\n+${rahasia}\n`;
const hasilR = terapkanDiff('const a = 1;\n', patchR);
cek('patch rahasia -> hasil memuat rahasianya', hasilR !== null && hasilR.includes('sk-live-abcdef1234567890'), true);

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
process.exit(lulus === total ? 0 : 1);
