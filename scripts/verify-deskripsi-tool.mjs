/**
 * Verifikasi peta deskripsi tool.
 *
 * Yang diperiksa:
 *   1. DESKRIPSI_TOOL_EN punya tepat 54 kunci.
 *   2. DESKRIPSI_TOOL_ID punya tepat 54 kunci.
 *   3. Himpunan kuncinya SAMA PERSIS satu sama lain DAN sama persis dengan
 *      nama tool di katalog.
 *   4. Deskripsi Indonesia di peta itu sama persis dengan teks aslinya di
 *      catalog.ts (supaya penyalinannya tidak diam-diam berubah).
 *
 * Berkas ini sengaja membaca sumbernya sebagai TEKS, bukan mengimpornya:
 * katalog mengimpor dari './deskripsiTool' tanpa ekstensi, dan jalur itu tidak
 * bisa diselesaikan Node telanjang tanpa Tauri/Vite.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const katalogTeks = readFileSync(join(akar, 'src/lib/tediTools/catalog.ts'), 'utf8');
const deskripsiTeks = readFileSync(join(akar, 'src/lib/tediTools/deskripsiTool.ts'), 'utf8');

/** Ambil isi satu objek literal bernama `nama` dari berkas TypeScript. */
function badanObjek(teks, nama) {
  const mulai = teks.indexOf(`export const ${nama}: Record<string, string> = {`);
  if (mulai < 0) throw new Error(`tidak menemukan deklarasi ${nama}`);
  const buka = teks.indexOf('{', mulai);
  let dalam = 0;
  for (let i = buka; i < teks.length; i++) {
    if (teks[i] === '{') dalam++;
    else if (teks[i] === '}') {
      dalam--;
      if (dalam === 0) return teks.slice(buka + 1, i);
    }
  }
  throw new Error(`objek ${nama} tidak tertutup`);
}

/** Baca pasangan kunci/nilai dari badan objek literal sederhana. */
function petaDari(badan) {
  const peta = new Map();
  const re = /(?:^|\n)\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,/g;
  let m;
  while ((m = re.exec(badan)) !== null) {
    const kunci = m[1] ?? m[2];
    const nilai = (m[3] ?? m[4] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (peta.has(kunci)) throw new Error(`kunci ganda: ${kunci}`);
    peta.set(kunci, nilai);
  }
  return peta;
}

/* 54 baris katalog: ['name', 'Group', 'effect', bool, 'deskripsi'] */
const reKatalog = new RegExp(
  "\\[\\s*'([^']+)',\\s*'[^']*',\\s*'(?:read|net|netWrite|appWrite|fsWrite|exec)',\\s*(?:true|false),\\s*'([^']*)'\\]",
  'g',
);
const katalog = [];
let mk;
while ((mk = reKatalog.exec(katalogTeks)) !== null) katalog.push([mk[1], mk[2]]);

const id = petaDari(badanObjek(deskripsiTeks, 'DESKRIPSI_TOOL_ID'));
const en = petaDari(badanObjek(deskripsiTeks, 'DESKRIPSI_TOOL_EN'));

const masalah = [];

if (katalog.length !== 54) masalah.push(`baris katalog bukan 54, melainkan ${katalog.length}`);
if (en.size !== 54) masalah.push(`DESKRIPSI_TOOL_EN bukan 54 kunci, melainkan ${en.size}`);
if (id.size !== 54) masalah.push(`DESKRIPSI_TOOL_ID bukan 54 kunci, melainkan ${id.size}`);

const namaKatalog = new Set(katalog.map(([n]) => n));
for (const n of namaKatalog) {
  if (!en.has(n)) masalah.push(`EN tidak punya kunci katalog: ${n}`);
  if (!id.has(n)) masalah.push(`ID tidak punya kunci katalog: ${n}`);
}
for (const n of en.keys()) if (!namaKatalog.has(n)) masalah.push(`EN punya kunci asing: ${n}`);
for (const n of id.keys()) if (!namaKatalog.has(n)) masalah.push(`ID punya kunci asing: ${n}`);

/* Teks Indonesia harus sama persis dengan katalog. */
for (const [nama, asli] of katalog) {
  if (id.has(nama) && id.get(nama) !== asli) {
    masalah.push(`ID berbeda dari katalog untuk ${nama}:\n    katalog: ${asli}\n    peta   : ${id.get(nama)}`);
  }
}

/* Terjemahan tidak boleh kosong, dan tidak boleh sama dengan teks Indonesia. */
let kosong = 0;
let kembar = 0;
for (const [nama, teks] of en) {
  if (!teks.trim()) {
    kosong++;
    masalah.push(`EN kosong untuk ${nama}`);
  }
  if (teks === id.get(nama)) {
    kembar++;
    masalah.push(`EN sama dengan ID untuk ${nama}`);
  }
}

console.log(`katalog        : ${katalog.length} tool`);
console.log(`DESKRIPSI_TOOL_ID: ${id.size} kunci`);
console.log(`DESKRIPSI_TOOL_EN: ${en.size} kunci`);
console.log(`EN kosong        : ${kosong}`);
console.log(`EN == ID         : ${kembar}`);
console.log(
  `himpunan kunci sama persis: ${masalah.length === 0 ? 'YA' : 'TIDAK'}`,
);

if (masalah.length) {
  console.error('\nMASALAH:');
  for (const x of masalah) console.error('  - ' + x);
  process.exit(1);
}
console.log('OK: 54 deskripsi Indonesia dan 54 deskripsi Inggris, himpunan kunci identik.');
