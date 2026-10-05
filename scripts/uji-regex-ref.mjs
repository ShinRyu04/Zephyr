/*
 * Buktikan BUGNYA ada di regex lama, dan perbaikannya bekerja.
 *
 * Bukan cukup "regex baru benar" - harus terlihat bahwa regex LAMA memang
 * menghasilkan undefined untuk path, karena itulah yang melempar dari
 * kunciPath dan mematikan loop agent.
 */
const LAMA = /^(?:\.{0,2}\/|\.{0,2}\\)?[\w@./\\-]+(?:\.\w{1,8})(?::(\d+))?$/;
const BARU = /^((?:\.{0,2}\/|\.{0,2}\\)?[\w@./\\-]+(?:\.\w{1,8}))(?::(\d+))?$/;

/* Perilaku baris asli: `const line = ref[2] ? Number(ref[2]) : 1;` */
const jalurLama = (teks) => {
  const ref = LAMA.exec(teks);
  if (!ref) return { diklik: false };
  const berkas = ref[1]; // <- dianggap path, padahal nomor baris
  const line = ref[2] ? Number(ref[2]) : 1;
  return { diklik: true, berkasDikirim: berkas, line };
};

const jalurBaru = (teks) => {
  const ref = BARU.exec(teks);
  if (!ref) return { diklik: false };
  const berkas = ref[1];
  const line = ref[2] ? Number(ref[2]) : 1;
  return { diklik: true, berkasDikirim: berkas, line };
};

const kasus = ['situs/index.html', 'src/lib/types.ts:12', './situs/styles.css', 'README.md'];

console.log('=== REGEX LAMA (yang mematikan agent) ===');
let rusak = 0;
for (const k of kasus) {
  const h = jalurLama(k);
  const pathBenar = h.berkasDikirim === k.replace(/:\d+$/, '');
  if (!pathBenar) rusak++;
  console.log(`  ${k}`);
  console.log(`    dikirim sebagai path: ${JSON.stringify(h.berkasDikirim)}`);
  console.log(`    seharusnya          : ${JSON.stringify(k.replace(/:\d+$/, ''))}`);
  console.log(`    -> ${pathBenar ? 'benar' : 'SALAH (inilah bugnya)'}`);
}
console.log(`\n  rusak: ${rusak}/${kasus.length}`);

console.log('\n=== REGEX BARU ===');
let benar = 0;
for (const k of kasus) {
  const h = jalurBaru(k);
  const harapPath = k.replace(/:\d+$/, '');
  const harapBaris = /:(\d+)$/.test(k) ? Number(k.match(/:(\d+)$/)[1]) : 1;
  const ok = h.berkasDikirim === harapPath && h.line === harapBaris;
  if (ok) benar++;
  console.log(
    `  ${ok ? 'BENAR' : 'SALAH'}  ${k}  ->  path=${JSON.stringify(h.berkasDikirim)} baris=${h.line}`,
  );
}
console.log(`\n  benar: ${benar}/${kasus.length}`);

console.log('\n=== kunciPath: lama melempar, baru aman ===');
const lama = (p) => p.replace(/\//g, '\\').toLowerCase();
const baru = (p) =>
  String(p ?? '')
    .replace(/\//g, '\\')
    .toLowerCase();

for (const [nama, nilai] of [
  ['undefined', undefined],
  ['null', null],
  ['angka 42', 42],
  ['string kosong', ''],
]) {
  let hLama;
  try {
    hLama = 'hasil: ' + lama(nilai);
  } catch (e) {
    hLama = 'MELEMPAR: ' + e.message;
  }
  let hBaru;
  try {
    hBaru = 'hasil: ' + JSON.stringify(baru(nilai));
  } catch (e) {
    hBaru = 'MELEMPAR: ' + e.message;
  }
  console.log(`  ${nama.padEnd(14)} lama: ${hLama.padEnd(48)} baru: ${hBaru}`);
}

console.log('\n=== logika garis miring masih benar (TIDAK terbalik) ===');
const ujiSama = (a, b) => baru(a) === baru(b);
console.log('  "D:/a/b.ts" vs "D:\\\\a\\\\b.ts"  ->', ujiSama('D:/a/b.ts', 'D:\\a\\b.ts'), '(harus true)');
console.log('  "D:/A/B.TS" vs "d:/a/b.ts"  ->', ujiSama('D:/A/B.TS', 'd:/a/b.ts'), '(harus true)');
console.log('  "D:/a/b.ts" vs "D:/a/c.ts"  ->', ujiSama('D:/a/b.ts', 'D:/a/c.ts'), '(harus false)');
