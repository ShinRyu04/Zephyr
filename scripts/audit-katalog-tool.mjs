/*
 * Audit katalog vs handler: mencari tool yang TIDAK SINKRON.
 *
 * Kenapa pemeriksaan ini ada di skrip, bukan sebagai perintah ad-hoc:
 * "tool terdaftar di katalog" dan "tool punya implementasi" adalah dua hal
 * berbeda, dan sepanjang riwayat proyek ini keduanya pernah berbeda tanpa
 * ketahuan. Daftar tool yang sehat adalah daftar yang kedua sisinya cocok.
 *
 * Dua bentuk nama harus ditangani, dan keduanya benar:
 *
 *   1. Tool MCP di katalog memakai nama yang dilihat MODEL
 *      (mcp__zephyr__inspect) sementara handler-nya memakai nama internal polos
 *      (inspect). Pemetaan hanya berlaku untuk nama yang memang berprefiks -
 *      menerapkannya ke nama bawaan menghasilkan mcp__zephyr__read_file yang
 *      tidak pernah ada, dan melaporkan 68 "masalah" palsu.
 *   2. Nama tool bisa ditulis `name:` atau `tool:`; keduanya dipakai di kode.
 */

import { readFileSync, existsSync } from 'node:fs';

const SUMBER_KATALOG = 'src/lib/zephyrTools/catalog.ts';
const SUMBER_HANDLER = [
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/mcp.ts',
];

/*
 * Entri katalog: ['nama', 'Group', 'effect', needsApproval, 'deskripsi']
 *
 * Nama dibaca dari blok tempat ia berada, karena blok MCP mentah dan baru
 * diberi prefiks saat katalog FINAL dirakit. Membaca seluruh berkas dengan satu
 * pola dan menganggap semuanya sudah final adalah kesalahan yang membuat skrip
 * ini melaporkan empat belas tool MCP sehat sebagai tidak sinkron.
 */
const reKat = /\[\s*'([a-zA-Z_0-9]+)',\s*'([^']*)',\s*'(read|net|netWrite|appWrite|fsWrite|exec)',\s*(true|false),/g;
const kat = readFileSync(SUMBER_KATALOG, 'utf8');

/* Batas blok: nama `const X: Array<...> = [` -> posisi awal isi blok. */
const blok = [];
for (const m of kat.matchAll(/const (MCP|WEB|BUILTIN|BAWAAN)\w*[^=]*=\s*\[/g)) {
  blok.push({ nama: m[1], mulai: m.index + m[0].length });
}
const prefiks = (posisi) => {
  const tepat = blok.filter((b) => b.mulai <= posisi).pop();
  return tepat && tepat.nama === 'MCP' ? 'mcp__zephyr__' : '';
};

const katalog = [];
for (const m of kat.matchAll(reKat)) {
  katalog.push({
    nama: prefiks(m.index) + m[1],
    effect: m[3],
    minta: m[4] === 'true',
  });
}

/*
 * Handler: nama sesudah `name:` atau `tool:`, apa adanya.
 *
 * Nama MCP di berkas handler ditulis polos. Dicocokkan dengan entri katalog
 * setelah prefiks `mcp__zephyr__` dilepas - bukan dengan menambahkan prefiks ke
 * setiap nama, karena itu mengubah nama bawaan menjadi sesuatu yang tidak ada.
 */
const handler = new Set();
for (const f of SUMBER_HANDLER) {
  if (!existsSync(f)) {
    console.log('(tidak ada) ' + f);
    continue;
  }
  const t = readFileSync(f, 'utf8');
  const cocok = [...t.matchAll(/(?:name|tool):\s*['"]([a-zA-Z_0-9]+)['"]/g)].map((m) => m[1]);
  console.log(f + ': ' + cocok.length + ' handler  [' + cocok.slice(0, 3).join(', ') + ' ...]');
  cocok.forEach((n) => handler.add(n));
}

/*
 * Kedua sisi ditulis dalam bentuk BERPAFREKS untuk tool MCP.
 *
 * Ini yang menentukan seluruh perbandingan, dan menebaknya salah menghabiskan
 * dua iterasi:
 *
 *   - `rakit()` di catalog.ts menulis `mcp__zephyr__inspect` untuk MCP dan nama
 *     apa adanya untuk builtin/web.
 *   - `mcp.ts` menulis `name: 'mcp__zephyr__inspect'` - BIANG SAMA - di sisi
 *     handler, bukan nama polos.
 *
 * Jadi tidak ada penerjemahan yang diperlukan sama sekali: nama di katalog dan
 * nama di handler sudah dalam bentuk yang sama. Memetakan salah satu sisi
 * dengan `polos()` justru MEMBUAT perbedaan yang tidak ada, dan skrip lalu
 * melaporkan empat belas tool MCP sehat sebagai tidak sinkron.
 */
const namaKatalog = katalog.map((k) => k.nama);
const tanpaHandler = namaKatalog.filter((n) => !handler.has(n));

/* Kebalikannya: nama handler yang tidak punya entri katalog. */
const setKatalog = new Set(namaKatalog);
const tanpaKatalog = [...handler].filter((n) => !setKatalog.has(n));

console.log('');
console.log('Katalog: ' + katalog.length + ' entri');
console.log('Handler unik: ' + handler.size);
console.log('');

let gagal = 0;
if (tanpaHandler.length) {
  console.log('DI KATALOG TAPI TANPA HANDLER (' + tanpaHandler.length + '):');
  tanpaHandler.forEach((n) => console.log('  ' + n + '  <- terdaftar tapi tidak bisa dijalankan'));
  gagal++;
} else {
  console.log('OK - setiap entri katalog punya handler');
}

if (tanpaKatalog.length) {
  console.log('HANDLER TANPA ENTRI KATALOG (' + tanpaKatalog.length + '):');
  tanpaKatalog.forEach((n) => console.log('  ' + n + '  <- bisa dijalankan tapi tidak bisa dipilih user'));
  gagal++;
} else {
  console.log('OK - setiap handler punya entri katalog');
}

/* Tool yang bertindak harus minta izin, di katalog dan di handler. */
const bertindak = katalog.filter(
  (k) => k.effect === 'netWrite' || k.effect === 'fsWrite' || k.effect === 'exec' || k.effect === 'appWrite',
);
const lupa = bertindak.filter((k) => !k.minta).map((k) => k.nama);
if (lupa.length) {
  console.log('');
  console.log('BERTINDAK TAPI TIDAK MINTA IZIN (' + lupa.length + '):');
  lupa.forEach((n) => console.log('  ' + n));
  gagal++;
} else {
  console.log('OK - semua ' + bertindak.length + ' tool yang bertindak meminta izin');
}

console.log('');
console.log(gagal ? '== GAGAL: ' + gagal + ' masalah ==' : '== katalog dan handler SINKRON ==');
process.exit(gagal ? 1 : 0);
